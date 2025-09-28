# backend/validators/story_validator.py
from __future__ import annotations
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Tuple, Optional

from jsonschema import Draft7Validator, RefResolver, exceptions as js_exceptions


class ValidationErrorDict(Dict[str, Any]):
    pass


@lru_cache(maxsize=1)
def _schema_base_dir() -> Path:
    here = Path(__file__).resolve().parent
    s1 = here.parent / "schemas" / "CoreSchema.json"
    s2 = here.parent / "CoreSchema.json"
    s3 = here / "CoreSchema.json"
    for p in (s1, s2, s3):
        if p.exists():
            return p.parent
    return here


@lru_cache(maxsize=1)
def _load_core_schema() -> Dict[str, Any]:
    base = _schema_base_dir()
    for p in [base / "CoreSchema.json",
              (base / "schemas" / "CoreSchema.json")]:
        if p.exists():
            with p.open("r", encoding="utf-8") as f:
                return json.load(f)
    raise FileNotFoundError("CoreSchema.json nem található. "
                            "Tedd a 'backend/schemas/CoreSchema.json' helyre.")


@lru_cache(maxsize=1)
def _validator() -> Draft7Validator:
    schema = _load_core_schema()
    resolver = RefResolver(base_uri=_schema_base_dir().as_uri() + "/", referrer=schema)
    return Draft7Validator(schema, resolver=resolver)


def _format_path(err_path) -> str:
    parts: List[str] = []
    for p in err_path:
        if isinstance(p, int):
            parts[-1:] = [f"{parts[-1]}[{p}]"] if parts else [f"[{p}]"]
        else:
            parts.append(str(p))
    return ".".join(parts)


def _format_schema_path(err_schema_path) -> str:
    try:
        return "/".join(map(str, err_schema_path))
    except Exception:
        return ""


def _semver_ok(s: str) -> bool:
    import re
    return bool(re.match(r"^[0-9]+\.[0-9]+\.[0-9]+$", s or ""))


def _semantic_checks(data: Dict[str, Any]) -> List[ValidationErrorDict]:
    """
    Sémán túli referenciacheckek, duplikációk, whitelist, stb.
    """
    errs: List[ValidationErrorDict] = []

    # --- schemaVersion whitelist
    allowed = { "1.0.0" }   # itt bővítheted később
    sv = str(data.get("schemaVersion") or "")
    if not _semver_ok(sv) or (allowed and sv not in allowed):
        errs.append(ValidationErrorDict({
            "path": "schemaVersion",
            "message": f"Nem engedélyezett schemaVersion: '{sv}'. Engedélyezett: {', '.join(sorted(allowed))}",
            "keyword": "whitelist",
            "schemaPath": "Core/VersionWhitelist"
        }))

    # --- oldalak és ID-k
    pages = data.get("pages") or []
    if not isinstance(pages, list):
        return errs

    # pageId gyűjtés + duplikáció
    page_ids: List[str] = []
    for i, p in enumerate(pages):
        pid = str(p.get("id") or "")
        if not pid:
            continue
        if pid in page_ids:
            errs.append(ValidationErrorDict({
                "path": f"pages[{i}].id",
                "message": f"Duplikált page id: '{pid}'",
                "keyword": "duplicate",
                "schemaPath": "Core/Semantic/pageIdUnique"
            }))
        page_ids.append(pid)

    page_set = set(page_ids)

    # fragment bank (a CoreSchema szerint: array of {id})
    frag_defs = data.get("fragments") or []
    frag_ids = set()
    if isinstance(frag_defs, list):
        for j, f in enumerate(frag_defs):
            fid = str((f or {}).get("id") or "")
            if fid:
                if fid in frag_ids:
                    errs.append(ValidationErrorDict({
                        "path": f"fragments[{j}].id",
                        "message": f"Duplikált fragment id: '{fid}'",
                        "keyword": "duplicate",
                        "schemaPath": "Core/Semantic/fragmentIdUnique"
                    }))
                frag_ids.add(fid)

    # bejárás: next/choices/fragment hivatkozások
    def _check_next(next_val: Any, base_path: str):
        if isinstance(next_val, str):
            if next_val not in page_set:
                errs.append(ValidationErrorDict({
                    "path": base_path,
                    "message": f"Ismeretlen next pageId: '{next_val}'",
                    "keyword": "ref",
                    "schemaPath": "Core/Semantic/nextRef"
                }))
        elif isinstance(next_val, dict):
            # NextSwitch
            cases = (next_val.get("cases") or {}) if isinstance(next_val.get("cases"), dict) else {}
            default = next_val.get("default")
            for k, v in cases.items():
                if isinstance(v, str) and v not in page_set:
                    errs.append(ValidationErrorDict({
                        "path": f"{base_path}.cases.{k}",
                        "message": f"Ismeretlen next pageId: '{v}' (case '{k}')",
                        "keyword": "ref",
                        "schemaPath": "Core/Semantic/nextSwitchRef"
                    }))
            if isinstance(default, str) and default not in page_set:
                errs.append(ValidationErrorDict({
                    "path": f"{base_path}.default",
                    "message": f"Ismeretlen next pageId: '{default}' (default)",
                    "keyword": "ref",
                    "schemaPath": "Core/Semantic/nextSwitchDefaultRef"
                }))

    for i, p in enumerate(pages):
        base = f"pages[{i}]"

        # next
        if "next" in p:
            _check_next(p.get("next"), f"{base}.next")

        # choices[].nextPageId + actions.unlockFragment
        if isinstance(p.get("choices"), list):
            for ci, ch in enumerate(p["choices"]):
                np = ch.get("nextPageId")
                if isinstance(np, str) and np not in page_set:
                    errs.append(ValidationErrorDict({
                        "path": f"{base}.choices[{ci}].nextPageId",
                        "message": f"Ismeretlen next pageId: '{np}'",
                        "keyword": "ref",
                        "schemaPath": "Core/Semantic/choiceNextRef"
                    }))

                if isinstance(ch.get("actions"), list):
                    for ai, act in enumerate(ch["actions"]):
                        t = (act or {}).get("type")
                        if t == "unlockFragment":
                            fid = str((act or {}).get("fragmentId") or "")
                            if fid and fid not in frag_ids:
                                errs.append(ValidationErrorDict({
                                    "path": f"{base}.choices[{ci}].actions[{ai}].fragmentId",
                                    "message": f"Ismeretlen fragmentId: '{fid}'",
                                    "keyword": "ref",
                                    "schemaPath": "Core/Semantic/unlockFragmentRef"
                                }))

        # fragments[] refs az oldalon
        if isinstance(p.get("fragments"), list):
            for fi, fr in enumerate(p["fragments"]):
                fid = str((fr or {}).get("id") or "")
                if fid and fid not in frag_ids:
                    errs.append(ValidationErrorDict({
                        "path": f"{base}.fragments[{fi}].id",
                        "message": f"Ismeretlen fragmentId: '{fid}'",
                        "keyword": "ref",
                        "schemaPath": "Core/Semantic/fragmentRef"
                    }))

    return errs


def validate_story_dict(data: Dict[str, Any]) -> Tuple[bool, List[ValidationErrorDict], List[str]]:
    v = _validator()
    errors: List[ValidationErrorDict] = []

    if not isinstance(data, dict):
        errors.append(ValidationErrorDict({
            "path": "",
            "message": "A gyökérelemnek JSON objektumnak kell lennie.",
            "keyword": "type",
            "schemaPath": ""
        }))
        return False, errors, []

    # 1) JSON Schema szerinti hibák
    try:
        for err in sorted(v.iter_errors(data), key=lambda e: e.path):
            errors.append(ValidationErrorDict({
                "path": _format_path(err.path),
                "message": err.message,
                "keyword": getattr(err, "validator", None) or "",
                "schemaPath": _format_schema_path(err.schema_path),
            }))
    except js_exceptions.ValidationError as e:
        errors.append(ValidationErrorDict({
            "path": _format_path(e.path),
            "message": str(e),
            "keyword": getattr(e, "validator", None) or "",
            "schemaPath": _format_schema_path(getattr(e, "schema_path", [])),
        }))

    # 2) Szemantikus referenciacheckek
    if not errors:
        sem_errs = _semantic_checks(data)
        errors.extend(sem_errs)

    ok = len(errors) == 0
    warnings: List[str] = []  # ide tehetünk később "soft" szabályokat
    return ok, errors, warnings
