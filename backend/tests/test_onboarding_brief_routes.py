"""Pytest cases for `routers.onboarding_brief_routes` (FastAPI integration).

Lefedett területek:

1. **POST /jobs** — happy path: `SupportChatbotBrief` → 201 + summary,
   storage-ben a brief + phase0_result perzisztál.
2. **GET /jobs/{id}** — 200 (full aggregate), 404 (ghost id).
3. **GET /jobs** — header-szintű lista.
4. **PUT /jobs/{id}/brief** — UPSERT + Phase 0 re-run; vendor_name változtatás
   tükröződik a phase0_result-ban.
5. **POST /jobs/{id}/end-nodes/generate** —
   - happy path: mock AnthropicClient → 200 + 6 slot frissítve;
   - 409 ha nincs brief (klasszikus job_id).
6. **POST /jobs/{id}/build** —
   - 202 + BG task ütemezve;
   - 409 ha nincs phase0_result.

A SSE endpoint (GET /events) sync TestClient-tel nem kényelmesen tesztelhető;
külön async pytest-anyio teszt a V2 stack-ben (most ki van hagyva).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from services.onboarding.brief_contracts import (
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
from services.onboarding.storage import OnboardingStorage


# --------------------------------------------------------------------------- #
# Mocks                                                                       #
# --------------------------------------------------------------------------- #


class _StubAnthropicClient:
    """Minimal mock — csak a `generate_end_node_texts`-et használjuk a route-ban."""

    def __init__(self, payload: dict[str, str]) -> None:
        self.payload = payload
        self.calls = 0

    def generate_end_node_texts(
        self, *, system_prompt: str, user_message: str
    ) -> dict[str, str]:
        self.calls += 1
        return dict(self.payload)

    # A többi `OnboardingClient` Protocol metódusra (build BG task használja)
    # nincs szükség az alapteszthez, de hogy a `_get_orchestrator()` ne dobjon,
    # placeholderként szolgálnak.
    def extract_blueprint(self, **_: Any) -> Any:
        raise NotImplementedError("Build pipeline not exercised in this test")

    def generate_node(self, **_: Any) -> Any:
        raise NotImplementedError

    def report_semantic_issues(self, **_: Any) -> Any:
        raise NotImplementedError


def _end_node_payload() -> dict[str, str]:
    return {
        "return_accepted": "Visszaküldés rendben.",
        "refund_initiated": "Visszatérítés elindítva, 5 munkanap.",
        "replacement_initiated": "Csere elindítva.",
        "warranty_investigation": "Garancia vizsgálat alatt.",
        "lost_package": "Elveszett csomag ügye felvéve.",
        "expired_return_deadline": "Sajnos a határidő lejárt.",
    }


# --------------------------------------------------------------------------- #
# Fixtures                                                                    #
# --------------------------------------------------------------------------- #


@pytest.fixture
def client(tmp_path: Path) -> TestClient:
    """TestClient — minden teszthez tiszta DB + mock AnthropicClient."""
    from routers import onboarding_brief_routes as routes_mod
    from main import app

    db = tmp_path / "routes_test.db"
    storage = OnboardingStorage(db)
    storage.init_schema()

    stub_client = _StubAnthropicClient(_end_node_payload())

    routes_mod._reset_singletons()
    routes_mod._override_singletons(
        storage=storage, anthropic_client=stub_client
    )
    # Az event_bus-t hagyjuk default-ra (új példány lazy).
    yield TestClient(app)
    routes_mod._reset_singletons()


@pytest.fixture
def brief_payload() -> dict[str, Any]:
    brief = SupportChatbotBrief(
        card1=Card1CompanyBasics(
            vendor_name="Route Test Vendor",
            business_model="own_inventory",
            target_market="b2c",
            locale="hu",
        ),
        card2=Card2Operations(
            returns=Card2aReturns(
                return_window_days=14,
                return_window_starts_from="delivery",
                return_shipping_paid_by="customer",
            ),
            remedy=Card2bRemedy(
                has_own_repair_capacity=False,
                primary_remedy_order=["refund"],
                instant_replacement="no",
                refund_timeline="3_business_days",
            ),
            shipping=Card2cShipping(
                carriers=["DPD"],
                lost_package_handled_by="company",
                damage_report_window_value=24,
                damage_report_window_unit="hours",
            ),
        ),
        card3=Card3Backend(helpdesk=Card3aHelpdesk(has_helpdesk=False)),
        card5=Card5Boundaries(
            off_topic=Card5aOffTopic(),
            support_availability=Card5bSupportAvailability(
                has_support_team=False
            ),
        ),
    )
    return json.loads(brief.model_dump_json())


# --------------------------------------------------------------------------- #
# 1. POST /jobs                                                               #
# --------------------------------------------------------------------------- #


def test_post_jobs_creates_brief_driven_job(
    client: TestClient, brief_payload: dict[str, Any]
) -> None:
    r = client.post("/api/onboarding/brief/jobs", json=brief_payload)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["status"] == "phase0_ready"
    assert data["vendor_name"] == "Route Test Vendor"
    assert data["target_locale"] == "hu"
    assert data["has_brief"] is True
    assert data["has_phase0_result"] is True
    assert data["has_blueprint"] is False


def test_post_jobs_invalid_brief_returns_422(
    client: TestClient, brief_payload: dict[str, Any]
) -> None:
    # `business_model` üres → Pydantic field_validator fail.
    brief_payload["card1"]["business_model"] = ""
    r = client.post("/api/onboarding/brief/jobs", json=brief_payload)
    assert r.status_code == 422


# --------------------------------------------------------------------------- #
# 2. GET /jobs/{id}                                                           #
# --------------------------------------------------------------------------- #


def test_get_job_returns_full_aggregate(
    client: TestClient, brief_payload: dict[str, Any]
) -> None:
    created = client.post(
        "/api/onboarding/brief/jobs", json=brief_payload
    ).json()
    job_id = created["job_id"]
    r = client.get(f"/api/onboarding/brief/jobs/{job_id}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["job_id"] == job_id
    assert body["brief"] is not None
    assert body["brief"]["card1"]["vendor_name"] == "Route Test Vendor"
    assert body["phase0_result"] is not None
    assert "Route Test Vendor" in body["phase0_result"]["research_text"]


def test_get_job_404_for_ghost(client: TestClient) -> None:
    r = client.get("/api/onboarding/brief/jobs/ghost-id")
    assert r.status_code == 404


# --------------------------------------------------------------------------- #
# 3. GET /jobs                                                                #
# --------------------------------------------------------------------------- #


def test_list_jobs_returns_headers(
    client: TestClient, brief_payload: dict[str, Any]
) -> None:
    client.post("/api/onboarding/brief/jobs", json=brief_payload).raise_for_status()
    # Másik brief, hogy másik job_id-t kapjunk.
    brief2 = dict(brief_payload)
    brief2["card1"] = dict(brief2["card1"])
    brief2["card1"]["vendor_name"] = "Vendor 2"
    # Új brief_id biztosítva a UUID-átírással.
    brief2["brief_id"] = "00000000-0000-0000-0000-000000000002"
    client.post("/api/onboarding/brief/jobs", json=brief2).raise_for_status()

    r = client.get("/api/onboarding/brief/jobs")
    assert r.status_code == 200, r.text
    jobs = r.json()["jobs"]
    assert len(jobs) >= 2
    vendor_names = {j["vendor_name"] for j in jobs}
    assert {"Route Test Vendor", "Vendor 2"}.issubset(vendor_names)


# --------------------------------------------------------------------------- #
# 4. PUT /jobs/{id}/brief                                                     #
# --------------------------------------------------------------------------- #


def test_put_brief_upserts_and_reruns_phase0(
    client: TestClient, brief_payload: dict[str, Any]
) -> None:
    created = client.post(
        "/api/onboarding/brief/jobs", json=brief_payload
    ).json()
    job_id = created["job_id"]
    # Módosítjuk a vendor_name-et.
    updated = dict(brief_payload)
    updated["card1"] = dict(updated["card1"])
    updated["card1"]["vendor_name"] = "Renamed Vendor"
    r = client.put(
        f"/api/onboarding/brief/jobs/{job_id}/brief", json=updated
    )
    assert r.status_code == 200, r.text
    assert r.json()["vendor_name"] == "Renamed Vendor"

    # A phase0_result is frissült.
    full = client.get(f"/api/onboarding/brief/jobs/{job_id}").json()
    assert "Renamed Vendor" in full["phase0_result"]["research_text"]


def test_put_brief_404_for_ghost(
    client: TestClient, brief_payload: dict[str, Any]
) -> None:
    r = client.put(
        "/api/onboarding/brief/jobs/ghost/brief", json=brief_payload
    )
    assert r.status_code == 404


# --------------------------------------------------------------------------- #
# 5. POST /jobs/{id}/end-nodes/generate                                       #
# --------------------------------------------------------------------------- #


def test_post_generate_end_nodes_fills_slots(
    client: TestClient, brief_payload: dict[str, Any]
) -> None:
    created = client.post(
        "/api/onboarding/brief/jobs", json=brief_payload
    ).json()
    job_id = created["job_id"]
    r = client.post(
        f"/api/onboarding/brief/jobs/{job_id}/end-nodes/generate", json={}
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["job_id"] == job_id
    assert set(body["generated"].keys()) == {
        "return_accepted",
        "refund_initiated",
        "replacement_initiated",
        "warranty_investigation",
        "lost_package",
        "expired_return_deadline",
    }
    assert sorted(body["applied_kinds"]) == sorted(body["generated"].keys())
    assert body["skipped_user_edited_count"] == 0

    # A brief.card4 slot-jai a GET /jobs/{id} response-jában is ai_prefilled.
    full = client.get(f"/api/onboarding/brief/jobs/{job_id}").json()
    for kind in body["generated"]:
        slot = full["brief"]["card4"]["end_node_texts"][kind]
        assert slot["status"] == "ai_prefilled"
        assert slot["content"] == body["generated"][kind]


def test_post_generate_end_nodes_409_when_job_has_no_brief(
    client: TestClient, brief_payload: dict[str, Any]
) -> None:
    """Klasszikus start_job (NEM brief-driven) → 409."""
    from routers.onboarding_brief_routes import _get_storage

    storage = _get_storage()
    storage.create_job(
        job_id="classic-job-x",
        domain_name="Classic Domain",
        target_locale="hu",
    )
    r = client.post(
        "/api/onboarding/brief/jobs/classic-job-x/end-nodes/generate", json={}
    )
    assert r.status_code == 409
    assert "brief" in r.json()["detail"].lower()


# --------------------------------------------------------------------------- #
# 6. POST /jobs/{id}/build                                                    #
# --------------------------------------------------------------------------- #


def test_post_build_accepts_when_phase0_ready(
    client: TestClient, brief_payload: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    created = client.post(
        "/api/onboarding/brief/jobs", json=brief_payload
    ).json()
    job_id = created["job_id"]

    # A BG task-ot lecseréljük no-op-ra, hogy a stub-nélküli pipeline ne
    # bukjon el. Csak az route-szintű 202-t teszteljük.
    from routers import onboarding_brief_routes as routes_mod

    called: list[str] = []

    def _noop(job_id_arg: str) -> None:
        called.append(job_id_arg)

    monkeypatch.setattr(routes_mod, "_run_full_pipeline", _noop)

    r = client.post(f"/api/onboarding/brief/jobs/{job_id}/build", json={})
    assert r.status_code == 202, r.text
    body = r.json()
    assert body["job_id"] == job_id
    assert body["status"] == "building"
    # A BG task a TestClient kontextusában szinkron fut, így már megjelent.
    assert called == [job_id]


def test_post_build_409_without_phase0(
    client: TestClient, brief_payload: dict[str, Any]
) -> None:
    """Klasszikus start_job → phase0_result=None → 409."""
    from routers.onboarding_brief_routes import _get_storage

    storage = _get_storage()
    storage.create_job(
        job_id="classic-build",
        domain_name="Classic Build Domain",
        target_locale="hu",
    )
    r = client.post(
        "/api/onboarding/brief/jobs/classic-build/build", json={}
    )
    assert r.status_code == 409
