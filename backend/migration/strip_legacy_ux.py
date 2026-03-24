# backend/migration/strip_legacy_ux.py
from __future__ import annotations

from services.contracts import JSONValue

LEGACY_KEYS_EXACT: set[str] = {"layout", "globalUI"}
LEGACY_PREFIXES: set[str] = {"ux", "ux_", "ux-"}

def _should_drop(key: str) -> bool:
    if key in LEGACY_KEYS_EXACT:
        return True
    low = key.lower()
    return any(low.startswith(p) for p in LEGACY_PREFIXES)

def strip_legacy_ux(obj: JSONValue) -> JSONValue:
    if isinstance(obj, dict):
        out: dict[str, JSONValue] = {}
        for k, v in obj.items():
            if _should_drop(k):
                continue
            out[k] = strip_legacy_ux(v)
        return out
    if isinstance(obj, list):
        return [strip_legacy_ux(x) for x in obj]
    return obj
