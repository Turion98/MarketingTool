"""Pipeline orchestrator a domain onboarding folyamathoz.

Ez a modul fűzi össze a Phase 1/2/3 darabokat:

- `services.story_lint.lint_full_story` és `lint_single_node` (validáció)
- `services.onboarding.contracts` (Pydantic modellek)
- `services.onboarding.storage.OnboardingStorage` (perzisztencia)
- `services.onboarding.event_bus.EventBus` (in-memory pub-sub)
- `services.onboarding.tool_schemas` (csak konvencionálisan, mert a
  tényleges Anthropic-hívásokat egy `OnboardingClient` injektált példány
  csinálja — így a pipeline tesztelhető API-hívás nélkül).

Tervezési alapelvek:

1. **AI-mentes pipeline.** Az orchestrator nem importálja az
   `anthropic` SDK-t. Egy `OnboardingClient` Protocol három metódust
   vár (Phase 1, 2, 3b); a production-implementáció és a tesztelhető
   `MockOnboardingClient` (test fájlokban) ugyanazt a kontraktot
   teljesíti.
2. **Sync.** A pipeline egyetlen job-ot hajt végre szekvenciálisan;
   nincs concurrent benefit. Az event-bus is sync (subscribers blokkolnak).
3. **Audit-first.** Minden state-átmenet eseményt emittál: az
   `_emit()` egyszerre írja a `storage.log_event`-be (audit trail) és
   a `EventBus.publish`-be (real-time UI).
4. **Resume-friendly.** A `run_phase1`, `run_phase2`, `run_phase3a`,
   `run_phase3b` külön-külön is meghívható. Ez támogatja a debug-ot
   és a future restart-flow-t (egy crash után a job ott folytatható,
   ahol megakadt — a status mező vezeti a logikát).
5. **Skeleton, NEM perfect.** A `assemble_story` minimális meta-t
   épít, ami egy happy-path tesztben átmegy a `lint_full_story`-n.
   Nem cél, hogy minden valós story komplex meta-kombinációját
   reprodukálja — a Phase 3a verdiktje hibás meta-konstrukcióknál
   `hard_fail`-t jelez, és a hívó iterálhat.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional, Protocol

from services.onboarding.brief_contracts import (
    BriefExpansionResult,
    EndNodeKind,
    SupportChatbotBrief,
)
from services.onboarding.brief_expander import (
    BriefExpanderClient,
    expand_brief_to_research,
)
from services.onboarding.contracts import (
    DomainBlueprint,
    GenerationContext,
    NodeCandidate,
    NodeGenerationAttempt,
    NodeGenerationOutcome,
    OnboardingJob,
    OnboardingJobStatus,
    RetryConfig,
    SemanticAuditResult,
    StructuralLintResult,
    VendorPolicyKind,
)
from services.onboarding.cross_node_linker import link_cross_nodes
from services.onboarding.end_node_text_generator import (
    EndNodeTextClient,
    apply_generated_end_node_texts,
    generate_end_node_texts,
)
from services.onboarding.event_bus import EventBus, OnboardingEvent
from services.onboarding.meta_builder import apply_meta_builder
from services.onboarding.reply_rules_generator import (
    ReplyRulesClient,
    generate_reply_rules_for_story,
)
from services.onboarding.step_enricher import apply_step_enricher
from services.onboarding.text_triggers_generator import (
    TextTriggersClient,
    generate_text_triggers_for_story,
)
from services.onboarding.storage import OnboardingStorage
from services.story_lint import lint_full_story, lint_single_node


# --------------------------------------------------------------------------- #
# Client protocol                                                             #
# --------------------------------------------------------------------------- #


class OnboardingClient(Protocol):
    """A három AI-hívás kontraktja.

    A production-implementációja az Anthropic SDK-t használja és a
    `services.onboarding.tool_schemas` builderein keresztül beszél;
    a teszt-implementáció (`MockOnboardingClient`) determinisztikusan
    visszaadott állapotokkal dolgozik.
    """

    def extract_blueprint(
        self,
        *,
        research_text: str,
        locale: str,
        domain_name: str,
        vendor_policy: VendorPolicyKind,
        vendor_name: Optional[str],
    ) -> DomainBlueprint: ...

    def generate_node(
        self,
        *,
        context: GenerationContext,
    ) -> dict[str, Any]: ...

    def report_semantic_issues(
        self,
        *,
        story: dict[str, Any],
        audit_model: str,
    ) -> SemanticAuditResult: ...


# --------------------------------------------------------------------------- #
# Story assembly helper                                                       #
# --------------------------------------------------------------------------- #


_DEFAULT_RUNTIME: dict[str, Any] = {
    "max_tokens": 1024,
    "return_window_days": 30,
    "max_entry_skip_depth": 3,
    "max_routing_chain_depth": 4,
    "max_chain_hops": 6,
    "embedding_top_k": 5,
    "model": "claude-skeleton",
    "mock_today": "2026-01-01",
}


def _slug(s: str) -> str:
    """Egyszerű ASCII-slugifikáció a storyId-hoz."""
    out = []
    for ch in s.lower():
        if ch.isalnum():
            out.append(ch)
        elif ch in (" ", "-", "_"):
            out.append("-")
    slug = "".join(out).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug or "story"


def _scaffold_end_page(end_id: str, content: str) -> dict[str, Any]:
    return {
        "id": end_id,
        "type": "end",
        "content": content,
    }


def assemble_story(
    *,
    job: OnboardingJob,
    blueprint: DomainBlueprint,
    accepted_outcomes: list[NodeGenerationOutcome],
    apply_cross_node_linker: bool = True,
    apply_meta: bool = True,
    apply_step_enrichment: bool = True,
    reply_rules_client: Optional[ReplyRulesClient] = None,
    reply_rules_overwrite_existing: bool = False,
    reply_rules_summary_out: Optional[dict[str, Any]] = None,
    text_triggers_client: Optional[TextTriggersClient] = None,
    text_triggers_overwrite_existing: bool = False,
    text_triggers_summary_out: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Összeállítja a story dict-et a Phase 3a (lint_full_story) számára.

    A v1 skeleton:

    - `schemaVersion` / `storyId` / `locale` top-level mezők.
    - `meta.runtime` minden RUNTIME_INT_KEYS + RUNTIME_STR_KEYS mezővel
      (`_DEFAULT_RUNTIME` alapértékek).
    - `meta.startPageId` az első accepted node id-ja.
    - `pages` dict: minden accepted node + minden blueprint.end_page
      (utóbbi `_scaffold_end_page`-pel).

    Az `apply_cross_node_linker=True` (default) esetén a story-t a
    `services.onboarding.cross_node_linker.link_cross_nodes` determinisztikus
    pass-szal egészíti ki: kitölti a `session_facts_whitelist`-et a
    cross-node referenciákkal és bedrótozza az `inject_conditions`
    listákat a cross-node routing rule-okra. Ez Phase 2.5 — pure-Python,
    zero AI cost.

    Az `apply_meta=True` (default) esetén a story-meta szekciót a
    `services.onboarding.meta_builder.apply_meta_builder` deterministically
    bővíti: `order_context_mapping.field_rules`, `condition_labels`,
    `reply_style`. A blueprint `proposed_new_external_fields` field_name
    listája átkerül `extra_known_fields` paraméterként, hogy a domain-
    specifikus mezők is OCM derive-elhetők legyenek. Ez Phase 3a —
    szintén pure-Python, zero AI cost. A linker UTÁN fut, hogy az általa
    bevitt `inject_conditions` is benne legyen a referenced-conditions
    halmazban.

    Az `apply_step_enrichment=True` (default) esetén a Phase 3b/A + 3b/B
    determinisztikus step-bővítést is alkalmazza:
    `services.onboarding.step_enricher.apply_step_enricher`. Ez minden
    AI-page non-closing step-jén kitölti a hiányzó `done_when` string-eket
    (locale-specifikusan: Hu / En) és konvertálja a string-form
    `internal_conditions` ID-ket dict-formára (`{id, description,
    do_not_reask_if_satisfied: true}`). Pure-Python, zero AI cost.

    Az `reply_rules_client` (default ``None``) opcionálisan átadható
    egy ``ReplyRulesClient``-kompatibilis objektum (production:
    ``AnthropicOnboardingClient``). Ha megadott, a Phase 3c
    `generate_reply_rules_for_story` AI-pass node-onkénti hívásokkal
    feltölti minden non-closing step `reply_rules` mezőjét. Ez NEM
    deterministic és AI-cost-tal jár (~$0.015/node). A pipeline
    hibatűrő: egy node sikertelen generálása nem dönti le a többit.
    Default `None` esetén ez a pass kihagyott — a szóló `assemble_story`
    továbbra is pure-deterministic.

    A `reply_rules_summary_out` (opcionális mutable dict) belekerül a
    `generate_reply_rules_for_story` summary-je, ha a 3c pass lefutott.
    Hasznos a hívó fél (orchestrator / PoC) számára.

    A `text_triggers_client` (default ``None``) opcionálisan átadható
    egy ``TextTriggersClient``-kompatibilis objektum (production:
    ``AnthropicOnboardingClient``). Ha megadott, a Phase 3g
    `generate_text_triggers_for_story` AI-pass node-onkénti hívásokkal
    feltölti az eligible content-pattern condition-ök ``text_triggers``
    mezőjét rövid, locale-helyes substring-mintákkal. NEM deterministic,
    AI-cost-tal jár (~$0.05–0.10/full story-build), és a 3c-hez hasonlóan
    hibatűrő. Default ``None`` esetén a pass kihagyott.

    Hiba: ha egyetlen accepted node sincs, ValueError-t dob — a hívó
    (orchestrator) ezt `failed_generation` állapotba fordítja.
    """
    if not accepted_outcomes:
        raise ValueError("assemble_story: nincs egyetlen elfogadott node sem.")

    story_id = _slug(job.domain_name)

    pages: dict[str, Any] = {}
    for outcome in accepted_outcomes:
        if outcome.final_node_dict is None:
            continue
        pages[outcome.node_id] = outcome.final_node_dict

    for ep in blueprint.end_pages:
        if ep.id in pages:
            continue
        pages[ep.id] = _scaffold_end_page(ep.id, ep.purpose)

    start_page_id = accepted_outcomes[0].node_id

    story = {
        "schemaVersion": "1.0",
        "storyId": story_id,
        "locale": blueprint.locale,
        "meta": {
            "id": story_id,
            "title": job.domain_name,
            "startPageId": start_page_id,
            "defaultFallbackMessage": (
                "Sajnálom, ezt nem értettem. Próbáld másképp megfogalmazni."
            ),
            "runtime": dict(_DEFAULT_RUNTIME),
        },
        "pages": pages,
    }

    if apply_cross_node_linker:
        link_cross_nodes(story)

    if apply_meta:
        proposed = [
            f.field_name
            for f in (blueprint.proposed_new_external_fields or [])
            if getattr(f, "field_name", None)
        ]
        apply_meta_builder(
            story,
            locale=blueprint.locale,
            extra_known_fields=proposed or None,
            session_collected_fields=proposed or None,
        )

    if apply_step_enrichment:
        apply_step_enricher(story, locale=blueprint.locale)

    if reply_rules_client is not None:
        rr_summary = generate_reply_rules_for_story(
            story,
            client=reply_rules_client,
            locale=blueprint.locale,
            vendor_policy=blueprint.vendor_policy,
            vendor_name=blueprint.vendor_name,
            overwrite_existing=reply_rules_overwrite_existing,
        )
        if reply_rules_summary_out is not None:
            reply_rules_summary_out.update(rr_summary)

    if text_triggers_client is not None:
        tt_summary = generate_text_triggers_for_story(
            story,
            client=text_triggers_client,
            locale=blueprint.locale,
            overwrite_existing=text_triggers_overwrite_existing,
        )
        if text_triggers_summary_out is not None:
            text_triggers_summary_out.update(tt_summary)

    return story


# --------------------------------------------------------------------------- #
# Orchestrator                                                                #
# --------------------------------------------------------------------------- #


class OrchestratorError(RuntimeError):
    """Pipeline-szintű hiba, ami megdönti a job-ot.

    NEM dobódik akkor, ha egy node max-retry exhausted-be kerül és a
    `RetryConfig.escalate_after_attempts == True` — ez "graceful skip".
    Akkor dobódik, ha egy fázis fundamentumi hibát hoz (pl. blueprint
    extract API-error, vagy lint_full_story hard_fail).
    """


class OnboardingOrchestrator:
    """A pipeline koordinátora.

    Egy példány ÚJ pipeline-hívásra is használható (a state nem rajta,
    hanem a storage-ban él). A `run(job_id)` végigvezeti a job-ot
    `created` állapotból `done` (vagy `failed_*`)-ig. A részmetódusok
    (`run_phase1`, `run_phase2`, `run_phase3a`, `run_phase3b`) külön is
    meghívhatók debug / resume céljából.
    """

    def __init__(
        self,
        *,
        storage: OnboardingStorage,
        client: OnboardingClient,
        event_bus: Optional[EventBus] = None,
        audit_model: str = "claude-skeleton-audit",
    ) -> None:
        self._storage = storage
        self._client = client
        self._bus = event_bus
        self._audit_model = audit_model
        # Instance-szintű cache — ne osztozzon több orchestrator-példány
        # között (a class-attribute változat globális state lenne).
        self._research_cache: dict[str, str] = {}

    # ------------------------------------------------------------------ #
    # Public — job lifecycle                                              #
    # ------------------------------------------------------------------ #

    def start_job(
        self,
        *,
        job_id: str,
        domain_name: str,
        target_locale: str,
        research_text: str,
        vendor_policy: VendorPolicyKind = "generic_blended",
        vendor_name: Optional[str] = None,
        retry_config: Optional[RetryConfig] = None,
        research_source_path: Optional[str] = None,
    ) -> OnboardingJob:
        """Új job létrehozása + a research_text szándékos tárolása in-memory.

        A `research_text` jelen v1-ben NEM perzisztálódik (külön blob-
        kezelést igényelne); az orchestrator állapotban tartja a
        Phase 1 hívásig. Ha a job-ot crash után resume-olni kell,
        a hívó újratöltött research_text-tel kell start_job-ot hívjon.
        """
        job = self._storage.create_job(
            job_id=job_id,
            domain_name=domain_name,
            target_locale=target_locale,
            vendor_policy=vendor_policy,
            vendor_name=vendor_name,
            research_source_path=research_source_path,
            retry_config=retry_config,
        )
        # In-memory cache a research_text-hez. A run() ezt használja
        # Phase 1-ben; a job_id alapján indexel.
        self._research_cache[job_id] = research_text
        self._emit(
            job_id, phase="pipeline", kind="job_started",
            payload={"domain_name": domain_name, "locale": target_locale},
        )
        return job

    def run(self, job_id: str) -> OnboardingJob:
        """A teljes pipeline végrehajtása. Ha bármelyik fázis felfüggeszti
        a job-ot (failed_*), a `run` itt áll meg és visszaadja az
        aktuális OnboardingJob-ot."""
        try:
            self.run_phase1(job_id)
            self.run_phase2(job_id)
            self.run_phase3a(job_id)
            self.run_phase3b(job_id)
        except OrchestratorError:
            # A részmetódusok már beállították a megfelelő failed_*
            # státuszt és kibocsátották az error eventet.
            pass
        return self._storage.load_job(job_id)

    # ------------------------------------------------------------------ #
    # Phase 0 — brief-driven flow belépő                                  #
    # ------------------------------------------------------------------ #

    def start_job_from_brief(
        self,
        *,
        job_id: str,
        brief: SupportChatbotBrief,
        retry_config: Optional[RetryConfig] = None,
        brief_enricher: Optional[BriefExpanderClient] = None,
    ) -> OnboardingJob:
        """Új job létrehozása `SupportChatbotBrief`-ből.

        Lépések:

        1. **Phase 0** — `expand_brief_to_research()` lefuttatása (alapból
           determinisztikus, opcionálisan `brief_enricher`-rel AI-pass).
        2. **Job rekord létrehozása** a Phase 0 result derived mezőivel
           (`domain_name`, `locale`, `vendor_policy='specific'`, `vendor_name`).
        3. **Perzisztálás**: a brief és a phase0_result külön táblákba.
        4. **In-memory cache**: a `research_text` a `_research_cache`-be
           kerül, így a `run_phase1` ugyanúgy működik mint a klasszikus
           `start_job` esetén.
        5. **Status**: `created` → `brief_received` → `phase0_expanding` →
           `phase0_ready`.

        Visszaad: a frissen létrehozott `OnboardingJob`-ot (teljes
        aggregátum, brief és phase0_result mezőkkel).

        Hiba: a Phase 0 nem hibázhat el determinisztikus módban; ha az
        opcionális `brief_enricher` kivételt dob, az `expand_brief_to_research`
        belül fallback-el a determinisztikusra (lásd ott). Pydantic validációs
        hiba (érvénytelen brief) közvetlenül a hívóhoz felszáll.
        """
        # 0. lépés: emit "brief_received" — de még nincs job rekord, így
        # ezt egy `create_job` UTÁN tudjuk csak loggolni. Stratégia: először
        # létrehozzuk a job-ot `brief_received` státusszal, aztán futtatjuk a
        # Phase 0-t.

        # A Phase 0-t a brief-ből származtatjuk; ez nem AI hívás default-ban.
        result: BriefExpansionResult = expand_brief_to_research(
            brief, enricher=brief_enricher
        )

        job = self._storage.create_job(
            job_id=job_id,
            domain_name=result.domain_name,
            target_locale=result.locale,
            vendor_policy=result.vendor_policy,
            vendor_name=result.vendor_name,
            retry_config=retry_config,
            status="brief_received",
            status_detail="Brief received, expanding to research_text",
        )
        self._storage.save_brief(job_id, brief)
        self._emit(
            job_id, phase="phase0", kind="brief_received",
            payload={
                "brief_id": brief.brief_id,
                "vendor_name": result.vendor_name,
                "locale": result.locale,
            },
        )

        # Phase 0 már lefutott; a state-átmeneteket csak audit-trail
        # céljából írjuk.
        self._set_status(job_id, "phase0_expanding", "Phase 0 expander")
        self._emit(job_id, phase="phase0", kind="started")
        self._storage.save_phase0_result(job_id, result)
        self._set_status(
            job_id,
            "phase0_ready",
            f"Phase 0 done, research_text length={len(result.research_text)}",
        )
        self._emit(
            job_id, phase="phase0", kind="completed",
            payload={
                "research_text_length": len(result.research_text),
                "enricher_used": result.metadata.get("enricher_used", False),
            },
        )

        # In-memory cache, hogy a Phase 1 (klasszikus run_phase1) működjön.
        self._research_cache[job_id] = result.research_text

        # Visszaadjuk a frissen összeolvasott aggregátumot (brief +
        # phase0_result már perzisztáltak).
        return self._storage.load_job(job_id)

    # ------------------------------------------------------------------ #
    # Card 4A — end-node text generálás (külön AI hívás)                  #
    # ------------------------------------------------------------------ #

    def run_end_node_generation(
        self,
        *,
        job_id: str,
        client: EndNodeTextClient,
        overwrite_user_edits: bool = False,
    ) -> dict[EndNodeKind, str]:
        """Card 4A AI hívás a brief alapján.

        A user spec szerint a Card 2 első mentésekor a frontend ezt egy
        background-task-tal indítja. Az eredmény az `apply_generated_end_node_texts`
        helperrel a `brief.card4.end_node_texts` dict-jébe kerül,
        state-tudatosan (a `user_edited` slotokat NEM írja felül default
        módban — a frontend explicit "overwrite" gombbal képes csak).

        A frissített brief perzisztálódik (`save_brief` UPSERT). A hívó
        a visszaadott `{EndNodeKind: str}` map-ből látja, hogy MELYIK
        slotok módosultak ténylegesen.

        Hiba: ha a job-hoz nincs brief mentve, `OrchestratorError`. Ha az
        AI client hibázik vagy hibás kulcsokat ad vissza, `OrchestratorError`
        + status `failed_end_node_generation`.
        """
        job = self._storage.load_job(job_id)
        if job.brief is None:
            raise OrchestratorError(
                f"run_end_node_generation: a {job_id} job-hoz nincs brief "
                "(start_job_from_brief nem futott le)."
            )

        self._set_status(
            job_id, "end_node_generating", "Card 4A generálás indul"
        )
        self._emit(job_id, phase="end_node_generation", kind="started")

        try:
            generated = generate_end_node_texts(brief=job.brief, client=client)
        except Exception as exc:  # noqa: BLE001
            err = f"{type(exc).__name__}: {exc}"
            self._storage.update_job_status(
                job_id, "failed_end_node_generation", status_detail=err
            )
            self._emit(
                job_id, phase="end_node_generation", kind="error",
                payload={"error": err},
            )
            raise OrchestratorError(err) from exc

        applied = apply_generated_end_node_texts(
            card4=job.brief.card4,
            generated=generated,
            generated_at=datetime.now(timezone.utc),
            overwrite_user_edits=overwrite_user_edits,
        )
        # A módosított brief-et UPSERT-eljük; a card4.end_node_texts slot-jai
        # mostantól `ai_prefilled` status-szal és a generált content-tel
        # mennek.
        self._storage.save_brief(job_id, job.brief)

        # A státuszt visszaállítjuk a "phase0_ready"-re (a Card 4A generálás
        # nem haladja a fő pipeline-t — csak egy oldalsó AI-kiegészítés).
        self._set_status(
            job_id, "phase0_ready",
            f"Card 4A: {len(applied)} slot frissítve, "
            f"{6 - len(applied)} érintetlen (user_edited védett)",
        )
        self._emit(
            job_id, phase="end_node_generation", kind="completed",
            payload={
                "applied_kinds": sorted(applied.keys()),
                "skipped_user_edited_count": 6 - len(applied),
            },
        )
        return generated

    # ------------------------------------------------------------------ #
    # Phase 1 — blueprint extraction                                      #
    # ------------------------------------------------------------------ #

    def run_phase1(self, job_id: str) -> DomainBlueprint:
        """A Phase 1 lefuttatása. Visszaad: a kapott `DomainBlueprint`."""
        job = self._storage.load_job(job_id)
        research_text = self._research_cache.get(job_id)
        if research_text is None:
            raise OrchestratorError(
                f"Phase 1 nem indítható: nincs research_text a {job_id} job-hoz "
                "(start_job nem futott le ebben a process-ben?)."
            )

        self._set_status(job_id, "blueprint_extracting", "Phase 1 indul")
        self._emit(job_id, phase="phase1", kind="started")

        try:
            blueprint = self._client.extract_blueprint(
                research_text=research_text,
                locale=job.target_locale,
                domain_name=job.domain_name,
                vendor_policy=job.vendor_policy,
                vendor_name=job.vendor_name,
            )
        except Exception as exc:  # noqa: BLE001 — minden hiba pipeline-fail
            err = f"{type(exc).__name__}: {exc}"
            self._storage.update_job_status(
                job_id, "failed_blueprint", status_detail=err, blueprint_error=err
            )
            self._emit(job_id, phase="phase1", kind="error", payload={"error": err})
            raise OrchestratorError(err) from exc

        self._storage.save_blueprint(job_id, blueprint)
        self._set_status(job_id, "blueprint_ready", "Phase 1 kész")
        self._emit(
            job_id, phase="phase1", kind="completed",
            payload={"node_count": len(blueprint.nodes)},
        )
        return blueprint

    # ------------------------------------------------------------------ #
    # Phase 2 — node generation                                           #
    # ------------------------------------------------------------------ #

    def run_phase2(self, job_id: str) -> list[NodeGenerationOutcome]:
        """Node-onkénti retry-loop a blueprint.nodes szerinti sorrendben.

        Visszaad: minden node outcome-ja. Ha bármelyik
        `rejected_max_retries` ÉS `escalate_after_attempts == False`,
        OrchestratorError-t dob (a status `failed_generation` lesz).
        Ha `escalate_after_attempts == True`, a node `rejected_human_review`
        státusszal megy tovább (és a Phase 3a beleüt — vagy nem).
        """
        job = self._storage.load_job(job_id)
        if job.blueprint is None:
            raise OrchestratorError(
                "Phase 2 nem indítható: nincs blueprint mentve."
            )
        blueprint = job.blueprint

        self._set_status(job_id, "node_generating", "Phase 2 indul")
        self._emit(
            job_id, phase="phase2", kind="started",
            payload={"node_count": len(blueprint.nodes)},
        )

        outcomes: list[NodeGenerationOutcome] = list(job.node_outcomes)
        already_done = {o.node_id for o in outcomes}

        for idx, candidate in enumerate(blueprint.nodes):
            if candidate.proposed_id in already_done:
                continue

            self._storage.update_job_status(
                job_id, "node_generating",
                status_detail=f"node {idx + 1}/{len(blueprint.nodes)}: "
                f"{candidate.proposed_id}",
                current_node_index=idx,
            )

            outcome = self._run_node_with_retries(
                job_id=job_id,
                blueprint=blueprint,
                candidate=candidate,
                accepted_so_far=outcomes,
                retry_config=job.retry_config,
            )
            self._storage.save_node_outcome(job_id, outcome)
            outcomes.append(outcome)

            if outcome.final_status == "accepted":
                self._emit(
                    job_id, phase="phase2", kind="node_accepted",
                    payload={
                        "node_id": outcome.node_id,
                        "attempt_count": len(outcome.attempts),
                    },
                )
            else:
                self._emit(
                    job_id, phase="phase2", kind="node_rejected",
                    payload={
                        "node_id": outcome.node_id,
                        "final_status": outcome.final_status,
                        "attempt_count": len(outcome.attempts),
                    },
                )
                if (
                    outcome.final_status == "rejected_max_retries"
                    and not job.retry_config.escalate_after_attempts
                ):
                    err = (
                        f"Node '{outcome.node_id}' max-retry exhausted, "
                        "escalate_after_attempts=False — pipeline megáll."
                    )
                    self._storage.update_job_status(
                        job_id, "failed_generation", status_detail=err
                    )
                    self._emit(
                        job_id, phase="phase2", kind="error",
                        payload={"error": err},
                    )
                    raise OrchestratorError(err)

        self._emit(
            job_id, phase="phase2", kind="completed",
            payload={"accepted_count": sum(
                1 for o in outcomes if o.final_status == "accepted"
            )},
        )
        return outcomes

    def _run_node_with_retries(
        self,
        *,
        job_id: str,
        blueprint: DomainBlueprint,
        candidate: NodeCandidate,
        accepted_so_far: list[NodeGenerationOutcome],
        retry_config: RetryConfig,
    ) -> NodeGenerationOutcome:
        """A retry-loop egy node-ra.

        Megpróbálja `retry_config.max_attempts_per_node`-szor
        legenerálni a node-ot; ha egyik attempt elfogadott (lint clean),
        azonnal visszatér. Ha mindegyik elhasal:

        - `escalate_after_attempts=True` → `rejected_human_review`
        - `escalate_after_attempts=False` → `rejected_max_retries`
          (a hívó dönti el, hogy az pipeline-fail-e).
        """
        attempts: list[NodeGenerationAttempt] = []
        last_errors: list[str] = []

        # A condition-pool a Phase 3a-szintű global pool közelítése:
        # az eddig elfogadott node-ok deklarált + handoff kondíciói.
        accumulated_pool: set[str] = set()
        for o in accepted_so_far:
            if o.final_status == "accepted":
                accumulated_pool.update(o.declared_condition_ids)
                accumulated_pool.update(o.exposed_handoff_condition_ids)

        # Known page ids: az eddig elfogadottak + ez a node + a blueprint
        # end_pages-jei (utóbbiak deterministically scaffoldolódnak).
        known_pages: set[str] = {candidate.proposed_id}
        for o in accepted_so_far:
            if o.final_status == "accepted":
                known_pages.add(o.node_id)
        for ep in blueprint.end_pages:
            known_pages.add(ep.id)
        # Router heuristic: ha a target node nem deklarál `suggested_end_pages`-t,
        # valószínűleg dispatcher-szerepkörű (pl. complaint-intake), ami más
        # AI-node-okra branch-el. Ilyenkor a teljes blueprint node-grafot
        # ismertnek tekintjük — különben az első generáláskor (üres
        # accepted_so_far) nem lenne valid `goto` target. Az AI prompt is
        # listázza ezeket a `build_phase2_user_message`-ben (ROUTER TARGETS).
        if not candidate.suggested_end_pages:
            for n in blueprint.nodes:
                known_pages.add(n.proposed_id)

        meta_under_construction: dict[str, Any] = {
            "runtime": dict(_DEFAULT_RUNTIME),
        }

        for attempt_idx in range(retry_config.max_attempts_per_node):
            ctx = GenerationContext(
                blueprint=blueprint,
                target_node_candidate=candidate,
                accepted_nodes_summary=[
                    o.accepted_summary()
                    for o in accepted_so_far
                    if o.final_status == "accepted"
                ],
                accumulated_condition_pool=sorted(accumulated_pool),
                meta_under_construction=meta_under_construction,
                known_page_ids_so_far=sorted(known_pages),
                retry_attempt_index=attempt_idx,
                last_attempt_errors=list(last_errors),
            )

            started = datetime.now(timezone.utc)
            attempt = self._try_one_attempt(
                job_id=job_id,
                ctx=ctx,
                attempt_idx=attempt_idx,
                started=started,
                meta_under_construction=meta_under_construction,
                accumulated_pool=accumulated_pool,
                known_pages=known_pages,
            )
            attempts.append(attempt)
            self._storage.append_node_attempt(job_id, candidate.proposed_id, attempt)
            self._emit(
                job_id, phase="phase2", kind="node_attempt",
                payload={
                    "node_id": candidate.proposed_id,
                    "attempt_index": attempt_idx,
                    "accepted": attempt.accepted,
                    "lint_error_count": len(attempt.lint_errors),
                },
            )

            if attempt.accepted:
                declared = sorted(_collect_declared_conditions(attempt.raw_node_dict))
                exposed = sorted(_collect_handoff_conditions(attempt.raw_node_dict))
                return NodeGenerationOutcome(
                    node_id=candidate.proposed_id,
                    attempts=attempts,
                    final_status="accepted",
                    final_node_dict=attempt.raw_node_dict,
                    declared_condition_ids=declared,
                    exposed_handoff_condition_ids=exposed,
                )

            last_errors = list(attempt.lint_errors)

        # Nincs accepted attempt.
        final_status = (
            "rejected_human_review"
            if retry_config.escalate_after_attempts
            else "rejected_max_retries"
        )
        return NodeGenerationOutcome(
            node_id=candidate.proposed_id,
            attempts=attempts,
            final_status=final_status,
            final_node_dict=None,
            declared_condition_ids=[],
            exposed_handoff_condition_ids=[],
        )

    def _try_one_attempt(
        self,
        *,
        job_id: str,
        ctx: GenerationContext,
        attempt_idx: int,
        started: datetime,
        meta_under_construction: dict[str, Any],
        accumulated_pool: set[str],
        known_pages: set[str],
    ) -> NodeGenerationAttempt:
        """Egy attempt: client.generate_node + lint_single_node."""
        try:
            page_dict = self._client.generate_node(context=ctx)
        except Exception as exc:  # noqa: BLE001 — attempt-szintű hiba
            return NodeGenerationAttempt(
                attempt_index=attempt_idx,
                started_at=started,
                finished_at=datetime.now(timezone.utc),
                raw_node_dict=None,
                lint_errors=[],
                lint_warnings=[],
                lint_info=[],
                accepted=False,
                rejection_reason=None,
                api_error=f"{type(exc).__name__}: {exc}",
            )

        report = lint_single_node(
            page_dict,
            meta=meta_under_construction,
            global_condition_pool=accumulated_pool,
            known_page_ids=known_pages,
        )

        accepted = not report.errors
        return NodeGenerationAttempt(
            attempt_index=attempt_idx,
            started_at=started,
            finished_at=datetime.now(timezone.utc),
            raw_node_dict=page_dict,
            lint_errors=list(report.errors),
            lint_warnings=list(report.warnings),
            lint_info=list(report.info),
            accepted=accepted,
            rejection_reason=(
                None if accepted else f"{len(report.errors)} structural lint error(s)"
            ),
            api_error=None,
        )

    # ------------------------------------------------------------------ #
    # Phase 3a — structural lint                                          #
    # ------------------------------------------------------------------ #

    def run_phase3a(self, job_id: str) -> StructuralLintResult:
        """Az összerakott story strukturális lint-je."""
        job = self._storage.load_job(job_id)
        if job.blueprint is None:
            raise OrchestratorError("Phase 3a: nincs blueprint.")
        accepted = [
            o for o in job.node_outcomes if o.final_status == "accepted"
        ]
        if not accepted:
            err = "Phase 3a: nincs egyetlen elfogadott node sem."
            self._storage.update_job_status(
                job_id, "failed_lint", status_detail=err
            )
            self._emit(job_id, phase="phase3a", kind="error", payload={"error": err})
            raise OrchestratorError(err)

        self._set_status(job_id, "structural_linting", "Phase 3a indul")
        self._emit(job_id, phase="phase3a", kind="started")

        story = assemble_story(
            job=job, blueprint=job.blueprint, accepted_outcomes=accepted
        )
        # A blueprint domain-specifikus mező-javaslatait átadjuk a lint-nek
        # mint extended pool. Ha a generált story `meta.order_context_mapping`
        # ezekre hivatkozik, a lint `note()` (info) szintet ad — nem warn
        # vagy err. A globális pool változatlan; csak a javasolt mezők
        # kapnak "domain-specific, backend implementation pending" jelölést.
        proposed_field_names = {
            p.field_name for p in job.blueprint.proposed_new_external_fields
        }
        report = lint_full_story(
            story,
            extra_known_external_fields=proposed_field_names,
        )
        result = StructuralLintResult.from_report(report)
        self._storage.save_structural_lint(job_id, result)
        self._storage.save_final_story(job_id, story, version=1)

        self._emit(
            job_id, phase="phase3a", kind="completed",
            payload={
                "verdict": result.verdict,
                "errors": len(result.errors),
                "warnings": len(result.warnings),
            },
        )

        if result.verdict == "hard_fail":
            err = (
                f"Phase 3a hard_fail: {len(result.errors)} structural error "
                "az összerakott story-n."
            )
            self._storage.update_job_status(
                job_id, "failed_lint", status_detail=err
            )
            raise OrchestratorError(err)

        return result

    # ------------------------------------------------------------------ #
    # Phase 3b — semantic audit                                           #
    # ------------------------------------------------------------------ #

    def run_phase3b(self, job_id: str) -> SemanticAuditResult:
        job = self._storage.load_job(job_id)
        if job.final_story is None:
            raise OrchestratorError(
                "Phase 3b: nincs final_story (Phase 3a nem futott le?)."
            )

        self._set_status(job_id, "semantic_auditing", "Phase 3b indul")
        self._emit(job_id, phase="phase3b", kind="started")

        try:
            audit = self._client.report_semantic_issues(
                story=job.final_story, audit_model=self._audit_model
            )
        except Exception as exc:  # noqa: BLE001
            err = f"{type(exc).__name__}: {exc}"
            self._storage.update_job_status(
                job_id, "failed_audit", status_detail=err
            )
            self._emit(job_id, phase="phase3b", kind="error", payload={"error": err})
            raise OrchestratorError(err) from exc

        self._storage.save_semantic_audit(job_id, audit)
        self._emit(
            job_id, phase="phase3b", kind="completed",
            payload={"verdict": audit.verdict, "findings": len(audit.findings)},
        )

        # Final state — `done` minden nem-hard_fail esetben (a hívó dönti
        # el, hogy a `warnings_only` / `needs_human_review` verdict-ekkel
        # mit kezd; a pipeline szempontjából a job lefutott).
        if audit.verdict == "hard_fail":
            self._storage.update_job_status(
                job_id, "failed_audit",
                status_detail="szemantikus audit hard_fail",
            )
        else:
            self._storage.update_job_status(
                job_id, "done", status_detail=f"verdict={audit.verdict}"
            )
        self._emit(job_id, phase="pipeline", kind="job_done",
                   payload={"verdict": audit.verdict})
        return audit

    # ------------------------------------------------------------------ #
    # Internal — status + event emission                                  #
    # ------------------------------------------------------------------ #

    def _set_status(
        self, job_id: str, status: OnboardingJobStatus, detail: Optional[str] = None
    ) -> None:
        self._storage.update_job_status(job_id, status, status_detail=detail)

    def _emit(
        self,
        job_id: str,
        *,
        phase: str,
        kind: str,
        payload: Optional[dict[str, Any]] = None,
    ) -> None:
        """Egy event egyszerre megy a perzisztens log-ba ÉS az in-memory
        bus-ra. A storage adja a sequence ID-t — ez kerül az
        `OnboardingEvent.event_id` mezőjébe."""
        event_id = self._storage.log_event(
            job_id, phase=phase, kind=kind, payload=payload
        )
        if self._bus is not None:
            self._bus.publish(
                OnboardingEvent(
                    event_id=event_id,
                    job_id=job_id,
                    phase=phase,  # type: ignore[arg-type]
                    kind=kind,
                    at=datetime.now(timezone.utc),
                    payload=payload,
                )
            )


# --------------------------------------------------------------------------- #
# Helpers — node deklarált / handoff kondíciók                                #
# --------------------------------------------------------------------------- #


def _collect_declared_conditions(page_dict: Optional[dict[str, Any]]) -> set[str]:
    """A page `conditions` listájában deklarált ID-k halmaza."""
    if not page_dict:
        return set()
    out: set[str] = set()
    for c in page_dict.get("conditions", []) or []:
        if isinstance(c, dict) and isinstance(c.get("id"), str):
            out.add(c["id"])
    return out


def _collect_handoff_conditions(page_dict: Optional[dict[str, Any]]) -> set[str]:
    """A page által átadott (inject_conditions, condition_implications.then,
    session_facts_whitelist) kondíció ID-k uniója."""
    if not page_dict:
        return set()
    out: set[str] = set()

    for r in page_dict.get("routing", []) or []:
        if isinstance(r, dict):
            inj = r.get("inject_conditions")
            if isinstance(inj, list):
                out.update(x for x in inj if isinstance(x, str))

    for s in page_dict.get("steps", []) or []:
        if not isinstance(s, dict):
            continue
        for key in ("inject_conditions", "default_inject_conditions"):
            inj = s.get(key)
            if isinstance(inj, list):
                out.update(x for x in inj if isinstance(x, str))
        for branch in s.get("branches", []) or []:
            if isinstance(branch, dict):
                inj = branch.get("inject_conditions")
                if isinstance(inj, list):
                    out.update(x for x in inj if isinstance(x, str))

    for ci in page_dict.get("condition_implications", []) or []:
        if isinstance(ci, dict) and isinstance(ci.get("then"), str):
            out.add(ci["then"])

    sfw = page_dict.get("session_facts_whitelist")
    if isinstance(sfw, list):
        out.update(x for x in sfw if isinstance(x, str))

    return out


__all__ = [
    "OnboardingClient",
    "OnboardingOrchestrator",
    "OrchestratorError",
    "assemble_story",
]

