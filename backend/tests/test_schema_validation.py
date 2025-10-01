import json
from backend.validation.schema_validator import validate_schema, version_whitelist_ok
from backend.validation.business_rules import cross_field_checks
from pathlib import Path

def _load(name: str):
    p = Path("templates") / name
    return json.loads(p.read_text(encoding="utf-8"))

def test_minimal_ok():
    data = _load("story_minimal.json")
    ok, errs = validate_schema(data)
    assert ok, errs
    vok, _ = version_whitelist_ok(data)
    assert vok
    sem = cross_field_checks(data)
    assert not sem

def test_full_ok():
    data = _load("story_full_ui.json")
    ok, errs = validate_schema(data)
    assert ok, errs
    sem = cross_field_checks(data)
    assert not sem

def test_bad_ref():
    data = _load("story_minimal.json")
    data["pages"][0]["next"] = "missing"
    ok, errs = validate_schema(data)
    assert ok  # schema szerint ok lehet
    sem = cross_field_checks(data)
    assert sem and any("Ismeretlen next pageId" in e["message"] for e in sem)
