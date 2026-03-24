# backend/cache.py
from __future__ import annotations
import json
import os
from typing import Callable, TypeVar, cast

from cachetools import TTLCache
from threading import RLock, local

from services.contracts import JSONValue, StoryDocument

# ---- Env + alapok ----
MAX_ITEMS = int(os.getenv("CACHE_MAX_ITEMS", "512"))
STORY_TTL = int(os.getenv("CACHE_STORY_TTL", "300"))
PAGE_TTL  = int(os.getenv("CACHE_PAGE_TTL",  "120"))
WL_TTL    = int(os.getenv("CACHE_WL_SUGGEST_TTL", "300"))

PagePayload = dict[str, JSONValue]
WhiteLabelPayload = dict[str, JSONValue]
CacheValueT = TypeVar("CacheValueT")

_story_cache: TTLCache[str, StoryDocument] = TTLCache(maxsize=MAX_ITEMS, ttl=STORY_TTL)
_page_cache: TTLCache[str, PagePayload] = TTLCache(maxsize=MAX_ITEMS * 2, ttl=PAGE_TTL)
_wl_cache: TTLCache[str, WhiteLabelPayload] = TTLCache(maxsize=MAX_ITEMS, ttl=WL_TTL)

_story_lock = RLock()
_page_lock  = RLock()
_wl_lock    = RLock()

# ---- Thread-local: legutóbbi cache státusz (HIT/MISS) ----
_tls = local()

def _set_last(kind: str, hit: bool | None) -> None:
    """kind ∈ {'story','page','wl'}; hit ∈ {True, False}."""
    if not hasattr(_tls, "last"):
        _tls.last = {}
    _tls.last[kind] = hit

def _get_last(kind: str) -> bool | None:
    return getattr(_tls, "last", {}).get(kind)

def was_last_story_hit() -> bool | None:
    """True → HIT, False → MISS, None → még nem történt lekérdezés ezen a szálon."""
    return _get_last("story")

def was_last_page_hit() -> bool | None:
    return _get_last("page")

def was_last_wl_hit() -> bool | None:
    return _get_last("wl")

# (Opcionális) Alternatív API: azonnali státusz-visszaadás
# Így: data, hit = load_story_cached_with_status(path)
def _with_status(ret: CacheValueT, hit: bool) -> tuple[CacheValueT, bool]:
    return ret, hit

# ---- Kulcsgenerátorok ----
def story_key(path: str) -> str:
    return os.path.abspath(path)

def page_key(path: str, page_id: str) -> str:
    return f"{os.path.abspath(path)}::{page_id}"

def wl_key(client_domain: str, campaign_id: str, mode: str) -> str:
    return f"{client_domain.strip().lower()}|{campaign_id.strip()}|{mode.strip()}"

# ---- Story JSON cache (nyers, még nem injektált) ----
def get_story_from_disk(path: str) -> StoryDocument:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return cast(StoryDocument, data if isinstance(data, dict) else {})

def load_story_cached(path: str) -> StoryDocument:
    """
    Visszafelé kompatibilis API.
    A legutóbbi státuszt thread-localban állítja: was_last_story_hit().
    """
    k = story_key(path)
    with _story_lock:
        data = _story_cache.get(k)
        if data is None:
            _set_last("story", False)  # MISS
            data = get_story_from_disk(path)
            _story_cache[k] = data
        else:
            _set_last("story", True)   # HIT
        return data

def load_story_cached_with_status(path: str) -> tuple[StoryDocument, bool]:
    """
    Új, kényelmi API: közvetlenül visszaadja a (data, hit) párost.
    """
    k = story_key(path)
    with _story_lock:
        data = _story_cache.get(k)
        if data is None:
            data = get_story_from_disk(path)
            _story_cache[k] = data
            _set_last("story", False)
            return _with_status(data, False)
        else:
            _set_last("story", True)
            return _with_status(data, True)

# ---- Oldal cache (már SFX-normalizált + fragmentsGlobal injektált) ----
def get_page_cached(path: str, page_id: str, build_fn: Callable[[], PagePayload]) -> PagePayload:
    """
    Visszafelé kompatibilis API.
    A legutóbbi státuszt thread-localban állítja: was_last_page_hit().
    """
    k = page_key(path, page_id)
    with _page_lock:
        data = _page_cache.get(k)
        if data is None:
            _set_last("page", False)  # MISS
            data = build_fn()
            _page_cache[k] = data
        else:
            _set_last("page", True)   # HIT
        return data

def get_page_cached_with_status(
    path: str, page_id: str, build_fn: Callable[[], PagePayload]
) -> tuple[PagePayload, bool]:
    """
    Új, kényelmi API: (data, hit)
    """
    k = page_key(path, page_id)
    with _page_lock:
        data = _page_cache.get(k)
        if data is None:
            data = build_fn()
            _page_cache[k] = data
            _set_last("page", False)
            return _with_status(data, False)
        else:
            _set_last("page", True)
            return _with_status(data, True)

# ---- White-label javaslat cache ----
def get_wl_suggest_cached(
    client_domain: str, campaign_id: str, mode: str, build_fn: Callable[[], WhiteLabelPayload]
) -> WhiteLabelPayload:
    """
    Visszafelé kompatibilis API.
    A legutóbbi státuszt thread-localban állítja: was_last_wl_hit().
    """
    k = wl_key(client_domain, campaign_id, mode)
    with _wl_lock:
        data = _wl_cache.get(k)
        if data is None:
            _set_last("wl", False)  # MISS
            data = build_fn()
            _wl_cache[k] = data
        else:
            _set_last("wl", True)   # HIT
        return data

def get_wl_suggest_cached_with_status(
    client_domain: str, campaign_id: str, mode: str, build_fn: Callable[[], WhiteLabelPayload]
) -> tuple[WhiteLabelPayload, bool]:
    """
    Új, kényelmi API: (data, hit)
    """
    k = wl_key(client_domain, campaign_id, mode)
    with _wl_lock:
        data = _wl_cache.get(k)
        if data is None:
            data = build_fn()
            _wl_cache[k] = data
            _set_last("wl", False)
            return _with_status(data, False)
        else:
            _set_last("wl", True)
            return _with_status(data, True)

# ---- Ürítés mindenkire ----
def clear_caches() -> None:
    with _story_lock:
        _story_cache.clear()
    with _page_lock:
        _page_cache.clear()
    with _wl_lock:
        _wl_cache.clear()
    # törlés után nincs releváns "last" státusz
    _set_last("story", None)
    _set_last("page",  None)
    _set_last("wl",    None)
