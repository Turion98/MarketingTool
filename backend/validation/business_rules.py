# backend/validation/business_rules.py
from __future__ import annotations
from typing import Any, Dict, List, Tuple
import os

ValidationError = Dict[str, Any]

def _err(path: str, msg: str, key="ref", sch="Core/Semantic"):
    return {"path": path, "message": msg, "keyword": key, "schemaPath": sch}

def _allowed_vendor_prefixes() -> List[str]:
    raw = os.getenv("ALLOWED_VENDOR_PREFIXES", "x-")
    return [p.strip() for p in raw.split(",") if p.strip()]

def _check_vendor_keys(node: Any, path: str, errs: List[ValidationError]):
    """Csak engedélyezett prefixű 'vendor' kulcsokat (pl. x-*) toleráljuk."""
    allow = _allowed_vendor_prefixes()
    if isinstance(node, dict):
        for k, v in node.items():
            if k.startswith("x-"):  # explicit engedélyezett minták
                if any(k.startswith(p) for p in allow):
                    pass
                else:
                    errs.append(_err(f"{path}.{k}" if path else k, f"Nem engedélyezett vendor prefix: '{k}'.", "vendor"))
            _check_vendor_keys(v, f"{path}.{k}" if path else k, errs)
    elif isinstance(node, list):
        for i, it in enumerate(node):
            _check_vendor_keys(it, f"{path}[{i}]" if path else f"[{i}]", errs)

def cross_field_checks(data: Dict[str, Any]) -> List[ValidationError]:
    errs: List[ValidationError] = []
    # Vendor prefix ellenőrzés (opcionális – alapból engedélyezzük "x-")
    _check_vendor_keys(data, "", errs)

    pages = data.get("pages") or []
    if not isinstance(pages, list):
        return errs
    page_ids: List[str] = []
    for i, p in enumerate(pages):
        pid = str(p.get("id") or "")
        if not pid: 
            continue
        if pid in page_ids:
            errs.append(_err(f"pages[{i}].id", f"Duplikált page id: '{pid}'", "duplicate", "Core/Semantic/pageIdUnique"))
        page_ids.append(pid)
    page_set = set(page_ids)

    frag_defs = data.get("fragments") or []
    frag_ids = set()
    if isinstance(frag_defs, list):
        for j, f in enumerate(frag_defs):
            fid = str((f or {}).get("id") or "")
            if fid:
                if fid in frag_ids:
                    errs.append(_err(f"fragments[{j}].id", f"Duplikált fragment id: '{fid}'", "duplicate", "Core/Semantic/fragmentIdUnique"))
                frag_ids.add(fid)

    # next + NextSwitch
    def _check_next(next_val: Any, base_path: str):
        if isinstance(next_val, str):
            if next_val and next_val not in page_set:
                errs.append(_err(base_path, f"Ismeretlen next pageId: '{next_val}'", "ref", "Core/Semantic/nextRef"))
        elif isinstance(next_val, dict):
            cases = next_val.get("cases") or {}
            if isinstance(cases, dict):
                for k, v in cases.items():
                    if isinstance(v, str) and v not in page_set:
                        errs.append(_err(f"{base_path}.cases.{k}", f"Ismeretlen next pageId: '{v}'", "ref", "Core/Semantic/nextSwitchRef"))
            default = next_val.get("default")
            if isinstance(default, str) and default not in page_set:
                errs.append(_err(f"{base_path}.default", f"Ismeretlen next pageId: '{default}'", "ref", "Core/Semantic/nextSwitchDefaultRef"))

    for i, p in enumerate(pages):
        base = f"pages[{i}]"
        if "next" in p:
            _check_next(p.get("next"), f"{base}.next")

        # choices
        chs = p.get("choices")
        if isinstance(chs, list):
            for ci, ch in enumerate(chs):
                np = ch.get("nextPageId")
                if isinstance(np, str) and np not in page_set:
                    errs.append(_err(f"{base}.choices[{ci}].nextPageId", f"Ismeretlen next pageId: '{np}'"))
                acts = ch.get("actions")
                if isinstance(acts, list):
                    for ai, act in enumerate(acts):
                        if (act or {}).get("type") == "unlockFragment":
                            fid = str((act or {}).get("fragmentId") or "")
                            if fid and fid not in frag_ids:
                                errs.append(_err(f"{base}.choices[{ci}].actions[{ai}].fragmentId", f"Ismeretlen fragmentId: '{fid}'"))

        # page.fragments refs
        pfr = p.get("fragments")
        if isinstance(pfr, list):
            for fi, fr in enumerate(pfr):
                fid = str((fr or {}).get("id") or "")
                if fid and fid not in frag_ids:
                    errs.append(_err(f"{base}.fragments[{fi}].id", f"Ismeretlen fragmentId: '{fid}'"))

    return errs
