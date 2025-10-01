# backend/migration/strip_legacy_ux.py
from __future__ import annotations
from typing import Any, Dict, Set

LEGACY_KEYS_EXACT: Set[str] = {"layout", "globalUI"}
LEGACY_PREFIXES:  Set[str] = {"ux", "ux_", "ux-"}

def _should_drop(key: str) -> bool:
    if key in LEGACY_KEYS_EXACT:
        return True
    low = key.lower()
    return any(low.startswith(p) for p in LEGACY_PREFIXES)

def strip_legacy_ux(obj: Any) -> Any:
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if _should_drop(k):
                continue
            out[k] = strip_legacy_ux(v)
        return out
    if isinstance(obj, list):
        return [strip_legacy_ux(x) for x in obj]
    return obj
