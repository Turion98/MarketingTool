"""Pytest cases for the brief-driven flow in
`services.onboarding.orchestrator`:

* `OnboardingOrchestrator.start_job_from_brief(brief)` — Phase 0 expander
  + job rekord + brief és phase0_result perzisztálás.
* `OnboardingOrchestrator.run_end_node_generation(client)` — Card 4A AI hívás
  state-tudatos `apply_generated_end_node_texts`-szel.

Lefedett területek:

1. **`start_job_from_brief` happy path**
   - Job rekord létrejön a Phase 0 derived mezőkkel (`domain_name`, locale,
     vendor_policy='specific', vendor_name).
   - A brief és phase0_result perzisztálva (`get_brief`/`get_phase0_result`).
   - Status `phase0_ready`.
   - Events: `brief_received`, `phase0.started`, `phase0.completed`.
   - In-memory `_research_cache` feltöltve — a `run_phase1` kvázifut
     a Phase 0 research_text-ből.

2. **`start_job_from_brief` + opcionális `BriefExpanderClient`**
   - A mock enricher meghívódott (calls list).
   - A research_text az enricher kimenete.

3. **`run_end_node_generation` happy path**
   - Mock EndNodeTextClient visszadja a 6 szöveget.
   - A perzisztált brief.card4 mind a 6 slotja `ai_prefilled` státusszal.
   - Status visszaáll `phase0_ready`-re (a Card 4A nem haladja a fő pipeline-t).
   - Events: `end_node_generation.started`, `.completed`.

4. **`run_end_node_generation` user-edited védelem**
   - Egy slot előre `user_edited` állapotba állítva → a generálás után
     megmarad, NEM íródik felül.

5. **`run_end_node_generation` brief nélkül**
   - Hagyományos job-on (brief=None) → `OrchestratorError`.

6. **`run_end_node_generation` AI hiba**
   - A mock client RuntimeError-t dob → status `failed_end_node_generation`,
     `OrchestratorError` propagálódik.

7. **Phase 0 → Phase 1 integration**
   - `start_job_from_brief` után `run_phase1` ugyanúgy működik mint a
     klasszikus `start_job` esetén — a research_text a Phase 0-é.
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import pytest

from services.onboarding.brief_contracts import (
    AiPrefilledText,
    Card1CompanyBasics,
    Card2Operations,
    Card2aReturns,
    Card2bRemedy,
    Card2cShipping,
    Card3Backend,
    Card3aHelpdesk,
    Card5aOffTopic,
    Card5bSupportAvailability,
    Card5Boundaries,
    SupportChatbotBrief,
)
from services.onboarding.contracts import (
    DomainBlueprint,
    GenerationContext,
    NodeCandidate,
    SemanticAuditResult,
    VendorPolicyKind,
)
from services.onboarding.orchestrator import (
    OnboardingOrchestrator,
    OrchestratorError,
)
from services.onboarding.storage import OnboardingStorage


# --------------------------------------------------------------------------- #
# Test doubles                                                                #
# --------------------------------------------------------------------------- #


class _NoopOnboardingClient:
    """Minimális OnboardingClient implementation a brief-flow tesztekhez.

    A brief-flow tesztek NEM hívják a Phase 1-3 metódusokat; ezért a mock
    csak akkor él, ha valaki ténylegesen hív `run_phase1`-et — ott
    egy fix `DomainBlueprint`-tel tér vissza.
    """

    def __init__(self) -> None:
        self.extract_calls: list[dict[str, Any]] = []
        self.fixed_blueprint: Optional[DomainBlueprint] = None

    def extract_blueprint(
        self,
        *,
        research_text: str,
        locale: str,
        domain_name: str,
        vendor_policy: VendorPolicyKind,
        vendor_name: Optional[str],
    ) -> DomainBlueprint:
        self.extract_calls.append(
            {
                "research_text_length": len(research_text),
                "research_text_first_line": research_text.splitlines()[0]
                if research_text
                else "",
                "locale": locale,
                "domain_name": domain_name,
                "vendor_policy": vendor_policy,
                "vendor_name": vendor_name,
            }
        )
        if self.fixed_blueprint is None:
            self.fixed_blueprint = DomainBlueprint(
                locale=locale,
                domain_name=domain_name,
                vendor_policy=vendor_policy,
                vendor_name=vendor_name,
                summary=(
                    "Auto-generated test blueprint for the brief-flow "
                    "integration tests. Filled with at least 80 characters "
                    "to satisfy the Pydantic min-length validator."
                ),
                nodes=[
                    NodeCandidate(
                        proposed_id="intake-node",
                        domain_intent=(
                            "Handles the initial customer message and "
                            "routes to remedy-class nodes."
                        ),
                        closing_step_required=False,
                    )
                ],
            )
        return self.fixed_blueprint

    def generate_node(self, *, context: GenerationContext) -> dict[str, Any]:
        raise NotImplementedError("Not used in brief-flow tests")

    def report_semantic_issues(
        self, *, story: dict[str, Any], audit_model: str
    ) -> SemanticAuditResult:
        raise NotImplementedError("Not used in brief-flow tests")


class _AppendingEnricher:
    """Mock BriefExpanderClient — szöveget toldoz a deterministic markdown-hoz."""

    def __init__(self, marker: str = "\n\n<!-- ENRICHED -->") -> None:
        self.marker = marker
        self.calls: list[str] = []

    def enrich_brief_research(
        self,
        *,
        deterministic_markdown: str,
        brief: SupportChatbotBrief,
    ) -> str:
        self.calls.append(brief.brief_id)
        return deterministic_markdown + self.marker


class _DictEndNodeClient:
    """Mock EndNodeTextClient — előre megadott dict-tel tér vissza."""

    def __init__(self, payload: dict[str, str]) -> None:
        self.payload = payload
        self.calls: list[tuple[str, str]] = []

    def generate_end_node_texts(
        self,
        *,
        system_prompt: str,
        user_message: str,
    ) -> dict[str, str]:
        self.calls.append((system_prompt, user_message))
        return dict(self.payload)


class _FailingEndNodeClient:
    def generate_end_node_texts(
        self, *, system_prompt: str, user_message: str
    ) -> dict[str, str]:
        raise RuntimeError("Anthropic API failure simulated")


# --------------------------------------------------------------------------- #
# Fixtures                                                                    #
# --------------------------------------------------------------------------- #


@pytest.fixture
def storage(tmp_path: Path) -> OnboardingStorage:
    db = tmp_path / "brief_flow.db"
    s = OnboardingStorage(db)
    s.init_schema()
    return s


@pytest.fixture
def orchestrator(storage: OnboardingStorage) -> OnboardingOrchestrator:
    client = _NoopOnboardingClient()
    return OnboardingOrchestrator(storage=storage, client=client)


def _full_brief() -> SupportChatbotBrief:
    return SupportChatbotBrief(
        card1=Card1CompanyBasics(
            vendor_name="Brief Flow Vendor",
            business_model="own_inventory",
            target_market="b2c",
            locale="hu",
        ),
        card2=Card2Operations(
            returns=Card2aReturns(
                return_window_days=30,
                return_window_starts_from="delivery",
                return_shipping_paid_by="company",
            ),
            remedy=Card2bRemedy(
                has_own_repair_capacity=False,
                primary_remedy_order=["replacement", "refund"],
                instant_replacement="if_in_stock",
                refund_timeline="5_7_business_days",
            ),
            shipping=Card2cShipping(
                carriers=["DPD"],
                lost_package_handled_by="company",
                damage_report_window_value=48,
                damage_report_window_unit="hours",
            ),
        ),
        card3=Card3Backend(helpdesk=Card3aHelpdesk(has_helpdesk=False)),
        card5=Card5Boundaries(
            off_topic=Card5aOffTopic(),
            support_availability=Card5bSupportAvailability(
                has_support_team=True,
                availability_slots=["weekdays_9_17"],
            ),
        ),
    )


def _full_end_node_payload() -> dict[str, str]:
    return {
        "return_accepted": (
            "Visszaküldésed elfogadva. 30 napod van rá, futárcímkét küldünk."
        ),
        "refund_initiated": (
            "Visszatérítés elindítva, 5-7 munkanapon belül megérkezik."
        ),
        "replacement_initiated": (
            "Csere elindítva, készleten lévő darab esetén pár napon belül kiszállítjuk."
        ),
        "warranty_investigation": (
            "Garancia panaszodat rögzítettük; megkezdjük a vizsgálatát."
        ),
        "lost_package": (
            "Elveszett csomagod ügyét felvettük; mi indítjuk a DPD-nél a kárigényt."
        ),
        "expired_return_deadline": (
            "Sajnos a 30 napos visszaküldési határidő már lejárt; nem fogadhatjuk vissza."
        ),
    }


# --------------------------------------------------------------------------- #
# 1. start_job_from_brief happy path                                          #
# --------------------------------------------------------------------------- #


def test_start_job_from_brief_creates_job_with_phase0_derived_fields(
    orchestrator: OnboardingOrchestrator, storage: OnboardingStorage
) -> None:
    brief = _full_brief()
    job = orchestrator.start_job_from_brief(
        job_id="brief-flow-001", brief=brief
    )
    assert job.job_id == "brief-flow-001"
    assert job.domain_name == "Brief Flow Vendor — Customer support intake"
    assert job.target_locale == "hu"
    assert job.vendor_policy == "specific"
    assert job.vendor_name == "Brief Flow Vendor"
    assert job.status == "phase0_ready"


def test_start_job_from_brief_persists_brief_and_phase0_result(
    orchestrator: OnboardingOrchestrator, storage: OnboardingStorage
) -> None:
    brief = _full_brief()
    orchestrator.start_job_from_brief(job_id="brief-persist", brief=brief)

    loaded_brief = storage.get_brief("brief-persist")
    assert loaded_brief is not None
    assert loaded_brief.brief_id == brief.brief_id
    assert loaded_brief.card1.vendor_name == "Brief Flow Vendor"

    p0 = storage.get_phase0_result("brief-persist")
    assert p0 is not None
    assert p0.locale == "hu"
    assert "Brief Flow Vendor" in p0.research_text
    assert "## Case families" in p0.research_text


def test_start_job_from_brief_load_job_returns_full_aggregate(
    orchestrator: OnboardingOrchestrator, storage: OnboardingStorage
) -> None:
    brief = _full_brief()
    orchestrator.start_job_from_brief(job_id="brief-agg", brief=brief)
    job = storage.load_job("brief-agg")
    assert job.brief is not None
    assert job.brief.card1.vendor_name == "Brief Flow Vendor"
    assert job.phase0_result is not None
    assert job.phase0_result.metadata["enricher_used"] is False


def test_start_job_from_brief_emits_phase0_events(
    orchestrator: OnboardingOrchestrator, storage: OnboardingStorage
) -> None:
    brief = _full_brief()
    orchestrator.start_job_from_brief(job_id="brief-events", brief=brief)
    events = storage.list_events("brief-events")
    kinds = [(e["phase"], e["kind"]) for e in events]
    assert ("phase0", "brief_received") in kinds
    assert ("phase0", "started") in kinds
    assert ("phase0", "completed") in kinds


def test_start_job_from_brief_populates_research_cache_so_phase1_runs(
    orchestrator: OnboardingOrchestrator, storage: OnboardingStorage
) -> None:
    """Phase 0 → Phase 1 integráció — a research_text átkerül."""
    brief = _full_brief()
    orchestrator.start_job_from_brief(job_id="brief-to-p1", brief=brief)
    blueprint = orchestrator.run_phase1("brief-to-p1")
    client: _NoopOnboardingClient = orchestrator._client  # type: ignore[assignment]
    assert len(client.extract_calls) == 1
    call = client.extract_calls[0]
    assert call["domain_name"] == "Brief Flow Vendor — Customer support intake"
    assert call["vendor_policy"] == "specific"
    assert call["vendor_name"] == "Brief Flow Vendor"
    # A research_text az első sorban tartalmazza a Phase 0 title-t.
    assert "Brief Flow Vendor" in call["research_text_first_line"]
    # És reális a hossza (sample brief ~7000+ char).
    assert call["research_text_length"] > 5000
    # A Phase 1 sikeresen futott, blueprint mentve.
    assert blueprint is not None
    loaded = storage.load_job("brief-to-p1")
    assert loaded.blueprint is not None
    assert loaded.status == "blueprint_ready"


# --------------------------------------------------------------------------- #
# 2. start_job_from_brief + enricher                                          #
# --------------------------------------------------------------------------- #


def test_start_job_from_brief_with_enricher_invokes_it(
    orchestrator: OnboardingOrchestrator, storage: OnboardingStorage
) -> None:
    brief = _full_brief()
    enricher = _AppendingEnricher(marker="\n\n<!-- ENRICHER-CALLED -->")
    orchestrator.start_job_from_brief(
        job_id="brief-enriched",
        brief=brief,
        brief_enricher=enricher,  # type: ignore[arg-type]
    )
    assert enricher.calls == [brief.brief_id]
    p0 = storage.get_phase0_result("brief-enriched")
    assert p0 is not None
    assert "<!-- ENRICHER-CALLED -->" in p0.research_text
    assert p0.metadata["enricher_used"] is True


# --------------------------------------------------------------------------- #
# 3. run_end_node_generation happy path                                       #
# --------------------------------------------------------------------------- #


def test_run_end_node_generation_fills_all_six_slots(
    orchestrator: OnboardingOrchestrator, storage: OnboardingStorage
) -> None:
    brief = _full_brief()
    orchestrator.start_job_from_brief(job_id="card4-hp", brief=brief)
    client = _DictEndNodeClient(_full_end_node_payload())

    result = orchestrator.run_end_node_generation(
        job_id="card4-hp", client=client  # type: ignore[arg-type]
    )

    assert set(result.keys()) == {
        "return_accepted",
        "refund_initiated",
        "replacement_initiated",
        "warranty_investigation",
        "lost_package",
        "expired_return_deadline",
    }
    # A perzisztált brief.card4 mostantól ai_prefilled állapotú slotokkal.
    loaded = storage.get_brief("card4-hp")
    assert loaded is not None
    for kind, slot in loaded.card4.end_node_texts.items():
        assert slot.status == "ai_prefilled"
        assert slot.content == _full_end_node_payload()[kind]
        assert slot.last_ai_generated_at is not None
    assert len(client.calls) == 1


def test_run_end_node_generation_sets_status_back_to_phase0_ready(
    orchestrator: OnboardingOrchestrator, storage: OnboardingStorage
) -> None:
    brief = _full_brief()
    orchestrator.start_job_from_brief(job_id="card4-status", brief=brief)
    client = _DictEndNodeClient(_full_end_node_payload())
    orchestrator.run_end_node_generation(
        job_id="card4-status", client=client  # type: ignore[arg-type]
    )
    job = storage.load_job("card4-status")
    assert job.status == "phase0_ready"
    assert "Card 4A" in (job.status_detail or "")


def test_run_end_node_generation_emits_events(
    orchestrator: OnboardingOrchestrator, storage: OnboardingStorage
) -> None:
    brief = _full_brief()
    orchestrator.start_job_from_brief(job_id="card4-events", brief=brief)
    client = _DictEndNodeClient(_full_end_node_payload())
    orchestrator.run_end_node_generation(
        job_id="card4-events", client=client  # type: ignore[arg-type]
    )
    events = storage.list_events("card4-events", phase="end_node_generation")
    kinds = [e["kind"] for e in events]
    assert "started" in kinds
    assert "completed" in kinds


# --------------------------------------------------------------------------- #
# 4. user_edited védelem                                                      #
# --------------------------------------------------------------------------- #


def test_run_end_node_generation_does_not_overwrite_user_edited(
    orchestrator: OnboardingOrchestrator, storage: OnboardingStorage
) -> None:
    brief = _full_brief()
    # A user előre kézzel beírta a `lost_package` szöveget.
    brief.card4.end_node_texts["lost_package"] = AiPrefilledText(
        status="user_edited",
        content="USER WROTE THIS BY HAND",
    )
    orchestrator.start_job_from_brief(job_id="card4-protect", brief=brief)
    client = _DictEndNodeClient(_full_end_node_payload())
    applied = orchestrator.run_end_node_generation(
        job_id="card4-protect", client=client  # type: ignore[arg-type]
    )
    # A `lost_package` benne van a generated dict-ben (a client mind a 6-ot
    # visszadta), DE az apply skip-pelte.
    assert "lost_package" in applied  # AI generálta...
    loaded = storage.get_brief("card4-protect")
    assert loaded is not None
    assert loaded.card4.end_node_texts["lost_package"].status == "user_edited"
    assert (
        loaded.card4.end_node_texts["lost_package"].content
        == "USER WROTE THIS BY HAND"
    )
    # A többi 5 viszont ai_prefilled-re vált.
    for kind in (
        "return_accepted",
        "refund_initiated",
        "replacement_initiated",
        "warranty_investigation",
        "expired_return_deadline",
    ):
        assert loaded.card4.end_node_texts[kind].status == "ai_prefilled"


def test_run_end_node_generation_overwrite_user_edits_flag(
    orchestrator: OnboardingOrchestrator, storage: OnboardingStorage
) -> None:
    """`overwrite_user_edits=True` explicit user-consent után írja át."""
    brief = _full_brief()
    brief.card4.end_node_texts["lost_package"] = AiPrefilledText(
        status="user_edited",
        content="USER ORIGINAL",
    )
    orchestrator.start_job_from_brief(job_id="card4-force", brief=brief)
    client = _DictEndNodeClient(_full_end_node_payload())
    orchestrator.run_end_node_generation(
        job_id="card4-force",
        client=client,  # type: ignore[arg-type]
        overwrite_user_edits=True,
    )
    loaded = storage.get_brief("card4-force")
    assert loaded is not None
    assert loaded.card4.end_node_texts["lost_package"].status == "ai_prefilled"
    assert (
        loaded.card4.end_node_texts["lost_package"].content
        == _full_end_node_payload()["lost_package"]
    )


# --------------------------------------------------------------------------- #
# 5. brief nélkül                                                             #
# --------------------------------------------------------------------------- #


def test_run_end_node_generation_without_brief_raises(
    orchestrator: OnboardingOrchestrator, storage: OnboardingStorage
) -> None:
    """Klasszikus start_job (research_text-tel) → brief=None → hiba."""
    orchestrator.start_job(
        job_id="classic-job",
        domain_name="Classic Domain",
        target_locale="hu",
        research_text="x" * 1000,
    )
    client = _DictEndNodeClient(_full_end_node_payload())
    with pytest.raises(OrchestratorError) as exc:
        orchestrator.run_end_node_generation(
            job_id="classic-job", client=client  # type: ignore[arg-type]
        )
    assert "brief" in str(exc.value).lower()


# --------------------------------------------------------------------------- #
# 6. AI hiba                                                                  #
# --------------------------------------------------------------------------- #


def test_run_end_node_generation_ai_failure_sets_failed_status(
    orchestrator: OnboardingOrchestrator, storage: OnboardingStorage
) -> None:
    brief = _full_brief()
    orchestrator.start_job_from_brief(job_id="card4-fail", brief=brief)
    with pytest.raises(OrchestratorError):
        orchestrator.run_end_node_generation(
            job_id="card4-fail",
            client=_FailingEndNodeClient(),  # type: ignore[arg-type]
        )
    job = storage.load_job("card4-fail")
    assert job.status == "failed_end_node_generation"
    events = storage.list_events("card4-fail", phase="end_node_generation")
    error_events = [e for e in events if e["kind"] == "error"]
    assert len(error_events) == 1
    assert "RuntimeError" in (error_events[0]["payload"] or {}).get("error", "")


def test_run_end_node_generation_missing_keys_raise(
    orchestrator: OnboardingOrchestrator, storage: OnboardingStorage
) -> None:
    """Ha a client csak 3 kulcsot ad vissza, a generator validation hibázik."""
    brief = _full_brief()
    orchestrator.start_job_from_brief(job_id="card4-partial", brief=brief)
    partial = {
        "return_accepted": _full_end_node_payload()["return_accepted"],
        "refund_initiated": _full_end_node_payload()["refund_initiated"],
        "lost_package": _full_end_node_payload()["lost_package"],
    }
    client = _DictEndNodeClient(partial)
    with pytest.raises(OrchestratorError):
        orchestrator.run_end_node_generation(
            job_id="card4-partial", client=client  # type: ignore[arg-type]
        )
    job = storage.load_job("card4-partial")
    assert job.status == "failed_end_node_generation"
