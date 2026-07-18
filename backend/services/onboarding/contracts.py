"""Pydantic contracts for the onboarding pipeline phases.

A pipeline három fázisra oszlik:

* **Phase 1 — domain deconstruction.** Bemenete kutatási anyag (raw text),
  kimenete `DomainBlueprint` (node-jelöltek, kondíciók, routing-vázak,
  external data függések). A Phase 2 ebből indul.
* **Phase 2 — node generation.** Node-onként, sorban: a `GenerationContext`
  összerakja az aktuális inputot (blueprint + eddig elfogadott node-ok kondíció
  pool-ja + következő `NodeCandidate`), majd egy AI-hívás generálja a teljes
  story-page dictet. Az eredmény `NodeGenerationAttempt`-be csomagolva fut át
  a `services.story_lint.lint_single_node`-on. A retry-policy
  (`RetryConfig`) határozza meg, hány kísérletet kapunk node-onként; a
  végeredmény `NodeGenerationOutcome`.
* **Phase 3 — validation.** Két alfázis:
    - **3a strukturális lint** (`StructuralLintResult`) — a teljes
      összerakott story `lint_full_story`-ja, ami a Phase 2 végén minden
      cross-node referenciát is ellenőriz.
    - **3b szemantikus audit** (`SemanticAuditResult`) — Anthropic tool-use
      `report_semantic_issues`, ami logikai-, stílus-, vendor-policy- és
      lefedettségi findingeket adhat. Ezeket a hívó dönti el (auto-fix
      retry, manual review, vagy elfogadás).

A teljes job állapota egy `OnboardingJob` rekordban perzisztálódik
(SQLite, lásd a 4-es lépést). A `OnboardingJobStatus` Literal a finite
state machine.

Minden fázis-határon a Pydantic validálás második védvonal (a primer az
Anthropic tool `input_schema`); `extra="forbid"` mindenhol, hogy ne
csússzon át hallucinált mező.

Tartalom-vs-struktúra szétválasztás:

- a `NodeCandidate` STRUKTURÁLIS jelölt (id, intent, scope) — a Phase 2
  ebből generálja a teljes node-ot (steps, conditions, routing).
- a `ConditionCandidate` egy szemantikai jelölt id+leírás-mag formában —
  a teljes condition definíció a Phase 2-ben születik.
- az `ExternalDataDep` egy meglévő (engedélyezett) field-pool elemeit
  hivatkozza; új mező → `ProposedNewExternalField` listába kerül.
"""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from services.onboarding.brief_contracts import (
    BriefExpansionResult,
    SupportChatbotBrief,
)

if TYPE_CHECKING:
    from services.story_lint import Report as _LintReport


# Vendor policy: a Phase 1 hívó adja meg, az AI ezt tiszteletben tartja a
# blueprint generálásánál. A pipeline szempontjából semleges paraméter,
# csak a konkrét generálás kontextusát szabályozza.
VendorPolicyKind = Literal["generic_blended", "specific", "mock"]


class NodeCandidate(BaseModel):
    """Egy ai-node strukturális jelöltje (Phase 2 input)."""

    model_config = ConfigDict(extra="forbid")

    proposed_id: str = Field(
        ...,
        description="snake-case-with-dashes id, pl. 'delivery-issue', 'battery-issue'",
        min_length=2,
        max_length=64,
    )
    domain_intent: str = Field(
        ...,
        description="1–2 mondat: pontosan mit kezel ez a node",
        min_length=20,
    )
    scope_keywords: list[str] = Field(
        default_factory=list,
        description="Embedding/scope matchinghez használt kulcsszavak",
    )
    triggering_examples: list[str] = Field(
        default_factory=list,
        description="3–8 user-üzenet példa, ami ezt a node-ot aktiválná",
    )
    required_conditions: list[str] = Field(
        default_factory=list,
        description="Kondíció ID jelöltek, amelyek kötelezőek az előrelépéshez",
    )
    optional_conditions: list[str] = Field(
        default_factory=list,
        description="Kondíció ID jelöltek, amelyek szituáció-specifikusan teljesülhetnek",
    )
    closing_step_required: bool = Field(
        ...,
        description="True ha a node-nak van olyan lépése, ami end-page-re vezet",
    )
    suggested_end_pages: list[str] = Field(
        default_factory=list,
        description="End-page id jelöltek, ahova a node routinghatja az ügyet",
    )
    references_research_section: list[str] = Field(
        default_factory=list,
        description="Forrás-szakasz hivatkozások (pl. 'Complaint universe row 3')",
    )


class ConditionCandidate(BaseModel):
    """Egy kondíció szemantikai jelöltje (id + leírás-mag)."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(
        ...,
        description="snake_case kondíció id, pl. 'has_order_id', 'package_lost'",
        min_length=2,
        max_length=64,
    )
    description_seed: str = Field(
        ...,
        description="Leírás-mag (1–2 mondat), a teljes description Phase 2-ben születik",
        min_length=10,
    )
    needs_validation_pattern: bool = Field(
        default=False,
        description="True ha a kondíció regex-validációt igényel (id-formátum, stb.)",
    )
    cross_node_handoff_targets: list[str] = Field(
        default_factory=list,
        description="Node id-k, ahol a kondíció inject_conditions-szel kell átadódjon",
    )
    derived_from_external_data: bool = Field(
        default=False,
        description="True ha order_context_mappingből származik (nem user-üzenetből)",
    )
    derived_external_field: Optional[str] = Field(
        default=None,
        description="Ha derived_from_external_data: melyik OrderContext mező",
    )


class RoutingSketch(BaseModel):
    """Előzetes routing váz egy node-hoz (Phase 2 finomítja)."""

    model_config = ConfigDict(extra="forbid")

    from_node: str
    branches: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Előzetes {if: list[str], goto: str} szabályok",
    )
    fallback_target: str = Field(
        ...,
        description="Ha egyetlen branch sem teljesül: goto vagy 'ask'",
    )


class ExternalDataDep(BaseModel):
    """OrderContext-szerű external data függés egy kondícióhoz.

    Csak az engedélyezett field pool elemeit hivatkozhatja. Új mezőt a
    `DomainBlueprint.proposed_new_external_fields` listába kell tenni.
    """

    model_config = ConfigDict(extra="forbid")

    field_name: str = Field(
        ...,
        description="OrderContext mező neve (engedélyezett pool-ból)",
    )
    derived_condition_id: str = Field(
        ...,
        description="Az ID, amit ez a szabály automatikusan satisfied-ra állít",
    )
    rule_kind: Literal["truthy", "not_null", "when_value", "when_any_value"] = Field(
        ...,
        description="A field_rules kiértékelési mód",
    )
    when_value: Optional[Any] = Field(
        default=None,
        description="rule_kind='when_value' esetén az elvárt érték",
    )
    when_any_value: Optional[list[Any]] = Field(
        default=None,
        description="rule_kind='when_any_value' esetén az elfogadott értékek listája",
    )
    needs_modifier: Optional[
        Literal["requires_field_not_null", "requires_field_lt_today"]
    ] = Field(
        default=None,
        description="Opcionális modifier — a story field_rules-ben már támogatott",
    )
    modifier_field: Optional[str] = Field(
        default=None,
        description="Ha needs_modifier: melyik mezőre vonatkozik",
    )


class ProposedNewExternalField(BaseModel):
    """Új external mező javaslat (NEM kerül a story-ba automatikusan)."""

    model_config = ConfigDict(extra="forbid")

    field_name: str = Field(..., min_length=2, max_length=64)
    description: str = Field(..., min_length=10)
    rationale: str = Field(
        ...,
        description="Miért nem elég a meglévő pool",
        min_length=10,
    )
    suggested_type: Literal["str", "int", "float", "bool", "date", "list[str]"] = Field(
        ...,
        description="Pydantic-szerű típus-hint",
    )


class EndPageSpec(BaseModel):
    """Egy end-page specifikációja (Phase 2 a 'content' szöveget tölti ki)."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., min_length=2, max_length=64)
    purpose: str = Field(
        ...,
        description="1 mondat: mikor és miért zár ide az ügy",
        min_length=10,
    )
    ticket_category: str = Field(
        ...,
        description="snake_case kategória, pl. 'delivery_not_received', 'battery_replacement'",
    )
    priority: Literal["normal", "high", "urgent"] = "normal"
    routing_target: str = Field(
        ...,
        description="Belső routing célcsoport, pl. 'courier_investigation_team'",
    )
    sla_hours: int = Field(..., gt=0, le=720)
    evidence_conditions: list[str] = Field(
        default_factory=list,
        description="Kondíció ID-k, amelyek bizonyítékként várhatók ezen az úton",
    )
    customer_actions_required: list[str] = Field(
        default_factory=list,
        description="Ügyfél-cselekvés flagek (pl. 'keep_packaging_until_inspection')",
    )


class DomainBlueprint(BaseModel):
    """Phase 1 kimenete — Phase 2 inputja."""

    model_config = ConfigDict(extra="forbid")

    locale: str = Field(..., description="ISO 639-1 nyelvkód (pl. 'en', 'hu')")
    domain_name: str = Field(
        ...,
        description="A domain rövid neve (pl. 'Refurbished electronics complaint intake')",
    )
    vendor_policy: VendorPolicyKind = Field(
        default="generic_blended",
        description="Hogyan kezelje az AI a benchmark eladók közötti különbségeket",
    )
    vendor_name: Optional[str] = Field(
        default=None,
        description="Ha vendor_policy='specific' vagy 'mock': a választott eladó neve",
    )

    summary: str = Field(
        ...,
        description="3–5 mondatos összefoglaló a domainről",
        min_length=80,
    )

    nodes: list[NodeCandidate] = Field(..., min_length=1)
    conditions: list[ConditionCandidate] = Field(default_factory=list)
    routing_sketches: list[RoutingSketch] = Field(default_factory=list)
    external_data_deps: list[ExternalDataDep] = Field(default_factory=list)
    proposed_new_external_fields: list[ProposedNewExternalField] = Field(
        default_factory=list
    )
    end_pages: list[EndPageSpec] = Field(default_factory=list)

    notes: list[str] = Field(
        default_factory=list,
        description=(
            "Olyan dolgok, amiket az AI nem tudott egyértelműen eldönteni, "
            "vagy amik felülvizsgálatra szorulnak"
        ),
    )


# --------------------------------------------------------------------------- #
# Phase 2 — node generation                                                   #
# --------------------------------------------------------------------------- #


class GenerationContext(BaseModel):
    """A Phase 2 egy hívásának teljes kontextusa.

    A kontextust a pipeline orchestrator állítja össze node-onként; az AI
    csak read-only-ként látja. A primer biztosítéka az `accumulated_condition_pool`
    és az `accepted_nodes_summary` — ezekből az AI tudja, milyen kondíciókat
    deklarálhat újként vs. milyenek érkeznek inject_conditions-szel.
    """

    model_config = ConfigDict(extra="forbid")

    blueprint: "DomainBlueprint" = Field(
        ...,
        description="A teljes Phase 1 blueprint (read-only inputként a Phase 2-höz)",
    )
    target_node_candidate: NodeCandidate = Field(
        ...,
        description="A most generálandó node strukturális jelöltje",
    )
    accepted_nodes_summary: list[dict[str, Any]] = Field(
        default_factory=list,
        description=(
            "Az eddig elfogadott node-ok rövid leírásai (id, intent, declared "
            "conditions, exposed_handoff_conditions). Tipikusan a "
            "`NodeGenerationOutcome.accepted_summary()`-ból gyűjtött dict-ek."
        ),
    )
    accumulated_condition_pool: list[str] = Field(
        default_factory=list,
        description=(
            "Minden eddigi node-ban deklarált / handoff kondíció ID + a "
            "blueprintből származó computed condition ID-k. Ez a pool-t "
            "használja a `lint_single_node` is `global_condition_pool`-ként."
        ),
    )
    meta_under_construction: dict[str, Any] = Field(
        default_factory=dict,
        description=(
            "Az építés alatt lévő story `meta` dict (runtime, "
            "computed_condition_ids, condition_labels, validation_pattern_*). "
            "Phase 2 csak olvassa; mező-bővítést a pipeline orchestrator csinál."
        ),
    )
    known_page_ids_so_far: list[str] = Field(
        default_factory=list,
        description=(
            "Az eddig már elfogadott + a most generálandó node ID-ja. A "
            "`lint_single_node` ezt használja a goto-célok ellenőrzésére. "
            "Ha a pipeline tolerant módban dolgozik (pl. a target ID-k még "
            "nem stabilak), a hívó None-t ad át a lint-nek."
        ),
    )
    retry_attempt_index: int = Field(
        default=0,
        ge=0,
        description="0-tól indexelt: hányadik retry ez ugyanezért a node-ért",
    )
    last_attempt_errors: list[str] = Field(
        default_factory=list,
        description=(
            "Ha retry_attempt_index > 0: az előző kísérlet lint-hibái. A "
            "Phase 2 prompt ezeket beépíti a 'fix-and-retry' utasításba."
        ),
    )


class NodeGenerationAttempt(BaseModel):
    """Egy node-generálási kísérlet (sikeres vagy sikertelen) snapshot-ja.

    A Phase 2 minden retry-t egy attempt-ben rögzít; a `NodeGenerationOutcome`
    az attempts listáját + a végső verdiktet tárolja. Ez a perzisztens audit-
    nyom is — DB-be elmentve visszanézhető, hogy melyik node hány próbálkozás
    után került stabilra.
    """

    model_config = ConfigDict(extra="forbid")

    attempt_index: int = Field(..., ge=0)
    started_at: datetime
    finished_at: Optional[datetime] = None
    raw_node_dict: Optional[dict[str, Any]] = Field(
        default=None,
        description=(
            "A modell által visszaadott, NEM normalizált node JSON. None ha "
            "a hívás már a tool-call szinten elhasalt (api error, schema "
            "rejection)."
        ),
    )
    lint_errors: list[str] = Field(default_factory=list)
    lint_warnings: list[str] = Field(default_factory=list)
    lint_info: list[str] = Field(default_factory=list)
    accepted: bool = Field(
        default=False,
        description="True ha lint_errors üres ÉS a tartalom validálható",
    )
    rejection_reason: Optional[str] = Field(
        default=None,
        description="Ha accepted=False: rövid emberi-olvasható ok (1 mondat)",
    )
    api_error: Optional[str] = Field(
        default=None,
        description=(
            "Ha az Anthropic-hívás hibázott (timeout, schema rejection, "
            "rate limit), itt a hibaüzenet."
        ),
    )


class NodeGenerationOutcome(BaseModel):
    """Egy node generálás végeredménye N kísérlet után.

    A `final_node_dict` csak akkor nem None, ha valamelyik attempt
    `accepted=True` lett. Egyébként a hívó dönt: skip + log, vagy emberi
    review queue-ba.
    """

    model_config = ConfigDict(extra="forbid")

    node_id: str = Field(
        ...,
        description="A generálandó node id-ja (NodeCandidate.proposed_id)",
    )
    attempts: list[NodeGenerationAttempt] = Field(default_factory=list)
    final_status: Literal[
        "accepted", "rejected_max_retries", "rejected_human_review", "api_error"
    ] = Field(...)
    final_node_dict: Optional[dict[str, Any]] = Field(
        default=None,
        description="Az elfogadott node teljes dict-je. None ha rejected.",
    )
    declared_condition_ids: list[str] = Field(
        default_factory=list,
        description=(
            "Az elfogadott node által DEKLARÁLT kondíció ID-k (a "
            "lint_single_node által visszaszámolt halmaz). A pipeline ezt "
            "olvassza be a következő node `accumulated_condition_pool`-jába."
        ),
    )
    exposed_handoff_condition_ids: list[str] = Field(
        default_factory=list,
        description=(
            "A node által condition_implications.then / inject_conditions / "
            "session_facts_whitelist által átadott kondíció ID-k. Külön "
            "tartjuk a deklaráltaktól, mert a runtime is külön kezeli."
        ),
    )

    def accepted_summary(self) -> dict[str, Any]:
        """Tömör snapshot a következő `GenerationContext`-hez."""
        return {
            "node_id": self.node_id,
            "declared_conditions": list(self.declared_condition_ids),
            "exposed_handoff_conditions": list(self.exposed_handoff_condition_ids),
        }


# --------------------------------------------------------------------------- #
# Phase 3 — validation                                                        #
# --------------------------------------------------------------------------- #


ValidationVerdict = Literal[
    "clean",
    "warnings_only",
    "needs_human_review",
    "hard_fail",
]


class StructuralLintResult(BaseModel):
    """A `services.story_lint.Report` Pydantic-projekciója (Phase 3a).

    A `Report` egy in-process objektum print() output-tal; ez a forma DB-be
    perzisztálható és JSON-ban átadható az UI-nak/CLI-nek. A `from_report`
    classmethod egyirányú adapter — Pydantic → Report nem szükséges, mert a
    Report mutable, ez pedig snapshot.
    """

    model_config = ConfigDict(extra="forbid")

    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    info: list[str] = Field(default_factory=list)
    verdict: ValidationVerdict = Field(...)

    @classmethod
    def from_report(cls, report: "_LintReport") -> "StructuralLintResult":
        """Adapter: `services.story_lint.Report` → `StructuralLintResult`.

        A verdict logika: ha errors > 0 → `hard_fail`. Ha csak warnings
        van → `warnings_only`. Egyébként `clean`. A `needs_human_review`
        verdiktet a strukturális lint nem osztja ki (azt a szemantikus
        audit jelölheti meg ambigus esetben).
        """
        verdict: ValidationVerdict
        if report.errors:
            verdict = "hard_fail"
        elif report.warnings:
            verdict = "warnings_only"
        else:
            verdict = "clean"
        return cls(
            errors=list(report.errors),
            warnings=list(report.warnings),
            info=list(report.info),
            verdict=verdict,
        )


SemanticIssueKind = Literal[
    "routing_logic",
    "condition_naming",
    "node_overlap",
    "missing_path",
    "vendor_policy_violation",
    "tone_or_style",
    "scope_creep",
    "data_dependency",
    "other",
]


class SemanticAuditFinding(BaseModel):
    """Egy logikai/szemantikai issue, amit a Phase 3b audit jelentett.

    A strukturális lint NEM ad ilyet (mert ott csak grafit-szintű
    konzisztenciát nézünk). Ezeket a `report_semantic_issues` tool-ot hívó
    Anthropic-modell adja vissza.
    """

    model_config = ConfigDict(extra="forbid")

    kind: SemanticIssueKind
    severity: Literal["info", "warning", "error"]
    node_id: Optional[str] = Field(
        default=None,
        description="None ha story-szintű (cross-node) issue",
    )
    description: str = Field(..., min_length=10)
    suggested_fix: Optional[str] = Field(
        default=None,
        description="Konkrét, akcióra fordítható javaslat (1–3 mondat)",
    )
    references_research_section: list[str] = Field(
        default_factory=list,
        description=(
            "Ha az audit a kutatási anyag konkrét szakaszára hivatkozik "
            "(pl. 'policy section 4.2'), itt rögzítjük."
        ),
    )


class SemanticAuditResult(BaseModel):
    """A Phase 3b szemantikus audit teljes kimenete.

    A `verdict` szemantikus szinten:

    - `clean` — nincs finding.
    - `warnings_only` — csak `severity=info`/`warning` findingek; a story
      kiadható.
    - `needs_human_review` — vagy van `severity=error` finding, vagy a
      modell explicit jelezte, hogy emberi döntés kell.
    - `hard_fail` — az audit lefutott, de a modell szerint a story
      koherenciája megsérült (pl. kritikus path hiányzik). Phase 2 retry
      vagy emberi újratervezés kell.
    """

    model_config = ConfigDict(extra="forbid")

    findings: list[SemanticAuditFinding] = Field(default_factory=list)
    verdict: ValidationVerdict
    audit_model: str = Field(
        ...,
        description="A használt Anthropic modell ID (pl. 'claude-opus-4-...')",
    )
    audit_started_at: datetime
    audit_finished_at: datetime
    summary_for_human: Optional[str] = Field(
        default=None,
        description=(
            "Egy 2–4 mondatos magyarázat: mit talált az audit, mire figyeljen "
            "az ellenőrző. Az UI-on ez jelenik meg felül."
        ),
    )


# --------------------------------------------------------------------------- #
# Pipeline state                                                              #
# --------------------------------------------------------------------------- #


OnboardingJobStatus = Literal[
    "created",
    # Brief-driven flow (Phase 0). A klasszikus `start_job(...)` flow ezeket
    # kihagyja és közvetlenül `blueprint_extracting`-re ugrik.
    "brief_received",
    "phase0_expanding",
    "phase0_ready",
    "end_node_generating",
    # Klasszikus pipeline fázisok.
    "blueprint_extracting",
    "blueprint_ready",
    "node_generating",
    "structural_linting",
    "semantic_auditing",
    "done",
    "failed_brief",
    "failed_phase0",
    "failed_end_node_generation",
    "failed_blueprint",
    "failed_generation",
    "failed_lint",
    "failed_audit",
]


class RetryConfig(BaseModel):
    """A pipeline retry-policy konstansok.

    Default értékek konzervatívak (3 attempt node-onként). A blueprint-
    fázisban max. 1 retry-t engedünk, mert a hibázás itt általában input-
    minőségi (kutatási anyag), nem AI-instabilitás.
    """

    model_config = ConfigDict(extra="forbid")

    max_attempts_per_node: int = Field(default=3, ge=1, le=10)
    max_attempts_blueprint: int = Field(default=1, ge=1, le=3)
    max_attempts_semantic_fix: int = Field(default=2, ge=0, le=5)
    escalate_after_attempts: bool = Field(
        default=True,
        description=(
            "Ha True és a max attempt elfogyott: a node 'rejected_human_review' "
            "státusszal megy tovább (a story részleges marad), nem dob a "
            "pipeline. Ha False: hard failure."
        ),
    )


class OnboardingJob(BaseModel):
    """A teljes pipeline állapot DB-rekord projekciója.

    Minden Phase output-ja itt akkumulálódik. A pipeline orchestrator
    minden fázis-átmeneten frissíti a `status`-t és az adott fázis
    output-mezőjét.

    A `final_story` csak akkor populált, ha `status == 'done'` (vagy
    `done_with_warnings`). Köztes állapotokban None.
    """

    model_config = ConfigDict(extra="forbid")

    job_id: str = Field(..., min_length=4, max_length=64)
    created_at: datetime
    updated_at: datetime
    status: OnboardingJobStatus = "created"
    status_detail: Optional[str] = Field(
        default=None,
        description="Rövid emberi-olvasható státuszüzenet (1 mondat)",
    )

    domain_name: str = Field(..., min_length=2)
    target_locale: str = Field(..., min_length=2, max_length=8)
    vendor_policy: VendorPolicyKind = "generic_blended"
    vendor_name: Optional[str] = None
    research_source_path: Optional[str] = Field(
        default=None,
        description="A kutatási anyag fájl-útja (audit nyomonkövetésre)",
    )

    retry_config: RetryConfig = Field(default_factory=RetryConfig)

    blueprint: Optional[DomainBlueprint] = None
    blueprint_error: Optional[str] = None

    node_outcomes: list[NodeGenerationOutcome] = Field(default_factory=list)
    current_node_index: int = Field(
        default=0,
        ge=0,
        description=(
            "A blueprint.nodes következő, még nem generált indexe. Ha == "
            "len(blueprint.nodes): a Phase 2 véget ért."
        ),
    )

    structural_lint: Optional[StructuralLintResult] = None
    semantic_audit: Optional[SemanticAuditResult] = None

    final_story: Optional[dict[str, Any]] = Field(
        default=None,
        description="Az összerakott, validált story dict (ai_complaint_v3 séma)",
    )
    final_story_version: Optional[int] = Field(
        default=None,
        description="A story_versions táblába írt rekord verziószáma",
    )

    # ------------------------------------------------------------------ #
    # Brief-driven flow (Phase 0) — opcionálisan jelenlévő mezők          #
    # ------------------------------------------------------------------ #
    # Ezek a mezők ÚJ briefs alapú flow termékei. Klasszikus
    # `start_job(research_text=...)` esetén None-on maradnak.
    # `brief_contracts` egyirányú dependency (nem importál visszafelé),
    # így a top-level import biztonságos.

    brief: Optional[SupportChatbotBrief] = Field(
        default=None,
        description=(
            "A user által kitöltött 6-kártyás brief. None = klasszikus flow "
            "(direkt research_text-tel indított job)."
        ),
    )
    phase0_result: Optional[BriefExpansionResult] = Field(
        default=None,
        description=(
            "A Phase 0 derived artifact: a brief-ből generált research_text + "
            "metadata. Idempotens — ha a brief változik és a Phase 0 újrafut, "
            "ez UPSERT-elődik."
        ),
    )


__all__ = [
    "VendorPolicyKind",
    "NodeCandidate",
    "ConditionCandidate",
    "RoutingSketch",
    "ExternalDataDep",
    "ProposedNewExternalField",
    "EndPageSpec",
    "DomainBlueprint",
    # Phase 2
    "GenerationContext",
    "NodeGenerationAttempt",
    "NodeGenerationOutcome",
    # Phase 3
    "ValidationVerdict",
    "StructuralLintResult",
    "SemanticIssueKind",
    "SemanticAuditFinding",
    "SemanticAuditResult",
    # Pipeline
    "OnboardingJobStatus",
    "RetryConfig",
    # Brief-driven flow late-binding helper
    "_rebuild_onboarding_job_with_brief_types",
    "OnboardingJob",
]
