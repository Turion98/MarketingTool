# backend/validation/schema_validator.py
from __future__ import annotations
import json
import os
import re
from pathlib import Path
from functools import lru_cache
from jsonschema import Draft7Validator, RefResolver
from services.contracts import StoryDocument, StoryValidationIssue

ValidationError = StoryValidationIssue

@lru_cache(maxsize=1)
def _schema_path() -> Path:
    here = Path(__file__).resolve().parents[1]  # backend/
    cand = [here / "schemas" / "CoreSchema.json", here / "CoreSchema.json"]
    for p in cand:
        if p.exists():
            return p
    raise FileNotFoundError("CoreSchema.json nem található a backend/schemas alatt.")

@lru_cache(maxsize=1)
def _validator() -> Draft7Validator:
    schema = json.loads(_schema_path().read_text(encoding="utf-8"))
    base = _schema_path().parent.as_uri() + "/"
    return Draft7Validator(schema, resolver=RefResolver(base_uri=base, referrer=schema))

def _fmt_path(path: object) -> str:
    out: list[str] = []
    for p in path:
        if isinstance(p, int):
            out[-1:] = [f"{out[-1]}[{p}]"] if out else [f"[{p}]"]
        else:
            out.append(str(p))
    return ".".join(out)

def validate_schema(data: StoryDocument) -> tuple[bool, list[ValidationError]]:
    """Strict JSON Schema ellenőrzés."""
    v = _validator()
    errs: list[ValidationError] = []
    if not isinstance(data, dict):
        return False, [{"path":"", "message":"Gyökér nem objektum.", "keyword":"type"}]
    for e in sorted(v.iter_errors(data), key=lambda e: e.path):
        errs.append({
            "path": _fmt_path(e.path),
            "message": e.message,
            "keyword": getattr(e, "validator", ""),
            "schemaPath": "/".join(map(str, getattr(e, "schema_path", []))),
        })
    return len(errs) == 0, errs

def version_whitelist_ok(data: StoryDocument) -> tuple[bool, str]:
    raw = os.getenv("ALLOWED_SCHEMA_VERSIONS", "1.0.0,1.2.0")
    allowed = {v.strip() for v in (raw or "").split(",") if v.strip()}

    sv = data.get("schemaVersion")
    sv = str(sv).strip() if sv is not None else ""

    if not re.match(r"^[0-9]+\.[0-9]+\.[0-9]+$", sv):
        return False, f"Érvénytelen schemaVersion formátum: '{sv}'."

    # ha valaki direkt üresre állítja az env-et → ne whitelisteljünk (engedjük át)
    if allowed and sv not in allowed:
        return False, (
            f"Nem engedélyezett schemaVersion: '{sv}'. "
            f"Engedélyezett: {', '.join(sorted(allowed))}"
        )

    return True, ""

