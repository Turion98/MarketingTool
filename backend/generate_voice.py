import os
import re
import time
import json
import hashlib
import tempfile
from typing import Optional, Dict, Any

import requests

from config_loader import get_config

# --- Kimeneti könyvtár (FastAPI static mount alá) ---
AUDIO_DIR = os.path.join("generated", "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)

# --- Helperek ---
def _slug(s: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_-]", "_", s or "")

def _sha1_8(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()[:8]

def _estimate_duration_ms(text: str, wpm: int = 140) -> int:
    words = max(1, len((text or "").strip().split()))
    minutes = words / max(60, wpm)
    return int(minutes * 60_000)

def _pick_voice_id(cfg: Dict[str, Any], prompt_data: Dict[str, Any], override_voice: Optional[str] = None) -> str:
    """
    Eldönti, melyik voice ID-t használjuk.
    - Elsőbbség: override_voice paraméter
    - Második: prompt_data.voice_id vagy voice név mappingból
    - Harmadik: config default voice_id
    - Negyedik: ElevenLabs saját default ID
    """
    if override_voice:
        voices_map = (cfg.get("elevenlabs_voices") or {})
        if override_voice in voices_map:
            return str(voices_map[override_voice])
        return override_voice  # lehet, hogy közvetlen ID

    v_id = prompt_data.get("voice_id")
    if v_id:
        return str(v_id)

    v_name = prompt_data.get("voice")
    voices_map = (cfg.get("elevenlabs_voices") or {})
    if v_name and v_name in voices_map:
        return str(voices_map[v_name])

    if cfg.get("elevenlabs_default_voice_id"):
        return str(cfg["elevenlabs_default_voice_id"])

    return "EXAVITQu4vr4xnSDxMaL"  # fallback ID

def _build_voice_settings(cfg: Dict[str, Any], prompt_data: Dict[str, Any], override_style: Optional[str] = None) -> Dict[str, Any]:
    """
    Összeállítja a voice_settings-et.
    - default_vs → cfg.elevenlabs_voice_settings → prompt_data.voice_settings → override_style
    """
    default_vs = {
        "stability": 0.5,
        "similarity_boost": 0.8,
    }
    cfg_vs = cfg.get("elevenlabs_voice_settings") or {}
    pd_vs = prompt_data.get("voice_settings") or {}
    merged = {**default_vs, **cfg_vs, **pd_vs}

    if override_style:
        # Ha a style paraméter egy előre definiált beállítás, itt alakítható
        merged["style"] = override_style

    return merged

def call_elevenlabs_tts(
    api_key: str,
    text: str,
    voice_id: str,
    *,
    model_id: Optional[str] = None,
    voice_settings: Optional[Dict[str, Any]] = None,
    fmt: str = "mp3",
    timeout: int = 45,
) -> bytes:
    """ElevenLabs TTS – REST hívás. Kérés audio/mpeg vagy más formátumban."""
    fmt = (fmt or "mp3").lower()
    if fmt not in ("mp3", "wav", "ogg"):
        fmt = "mp3"

    # ✅ pontos Accept header mapping
    accept_map = {
        "mp3": "audio/mpeg",
        "wav": "audio/wav",
        "ogg": "audio/ogg",
    }
    accept_header = accept_map[fmt]

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": accept_header,
    }
    payload: Dict[str, Any] = {"text": text}
    if model_id:
        payload["model_id"] = model_id
    if voice_settings:
        payload["voice_settings"] = voice_settings

    resp = requests.post(url, json=payload, headers=headers, timeout=timeout)
    try:
        resp.raise_for_status()
    except requests.HTTPError as e:
        try:
            msg = resp.json()
        except Exception:
            msg = resp.text
        raise RuntimeError(f"ElevenLabs HTTP error {resp.status_code}: {msg}") from e

    ctype = (resp.headers.get("Content-Type") or "")
    if "audio" not in ctype:
        raise RuntimeError(f"Unexpected content-type from ElevenLabs: {ctype}")

    return resp.content

# --- FŐ FÜGGVÉNY ---
def generate_voice_asset(
    page_id: str,
    api_key: Optional[str] = None,
    reuse_existing: bool = True,
    *,
    prompt_override: Optional[str] = None,
    voice: Optional[str] = None,
    style: Optional[str] = None,
    fmt: str = "mp3"
) -> Dict[str, Any]:
    """
    Legenerálja (vagy cache-ből visszaadja) a narrációt az adott page-hez.
    - Cache kulcs: (page_id + prompt + voice_id + model_id + fmt) -> rövid hash
    - Kimenet:
        { ok, message, file, url, cached, durationMs, backend, error }
    """
    cfg = get_config()

    # ✅ LAZY import: ne dőljön el az app, ha a json_loader importkor fájlt nyitna
    try:
        from json_loader import get_voice_prompt  # type: ignore
    except Exception as e:
        return {"ok": False, "error": f"voice loader import failed: {e}"}

    # ✅ Prompt betöltés védelemmel
    try:
        prompt_data = get_voice_prompt(page_id) or {}
    except Exception as e:
        return {"ok": False, "error": f"voice prompt load failed: {e}"}

    text = (prompt_override or prompt_data.get("prompt") or "").strip()
    if not text:
        return {"ok": False, "error": "No voice prompt found for this page."}

    api_key = (api_key or cfg.get("elevenlabs_api_key"))
    if not api_key:
        return {"ok": False, "error": "No ElevenLabs API key provided."}

    model_id = (cfg.get("elevenlabs_model_id") or "eleven_multilingual_v2")
    voice_id = _pick_voice_id(cfg, prompt_data, override_voice=voice)
    voice_settings = _build_voice_settings(cfg, prompt_data, override_style=style)

    # Stabil hash kulcs
    cache_key_src = f"{page_id}::{voice_id}::{model_id}::{(fmt or 'mp3').lower()}::{text}"
    h8 = _sha1_8(cache_key_src)

    safe_page = _slug(page_id)
    ext = {"mp3": "mp3", "wav": "wav", "ogg": "ogg"}.get((fmt or "mp3").lower(), "mp3")
    filename = f"{safe_page}-{h8}.{ext}"
    audio_path = os.path.join(AUDIO_DIR, filename)
    public_url = f"/generated/audio/{filename}"

    # WPM biztonságos cast
    try:
        wpm = int(cfg.get("voice_wpm", 140))
    except Exception:
        wpm = 140

    # Cache ellenőrzés
    if reuse_existing and os.path.exists(audio_path):
        return {
            "ok": True,
            "message": "Voice already exists.",
            "file": audio_path,
            "url": public_url,
            "cached": True,
            "durationMs": _estimate_duration_ms(text, wpm=wpm),
            "backend": "elevenlabs",
        }

    # Generálás
    try:
        audio_bytes = call_elevenlabs_tts(
            api_key=api_key,
            text=text,
            voice_id=str(voice_id),
            model_id=model_id,
            voice_settings=voice_settings,
            fmt=ext,
            timeout=int(cfg.get("elevenlabs_timeout_sec", 45)),
        )
    except Exception as e:
        return {"ok": False, "error": f"TTS generation failed: {e}"}

    # Ideiglenes fájlmentés, majd átnevezés
    with tempfile.NamedTemporaryFile(dir=AUDIO_DIR, delete=False) as tf:
        tf.write(audio_bytes)
        tmp_path = tf.name
    os.replace(tmp_path, audio_path)

    return {
        "ok": True,
        "message": "Voice generated.",
        "file": audio_path,
        "url": public_url,
        "cached": False,
        "durationMs": _estimate_duration_ms(text, wpm=wpm),
        "backend": "elevenlabs",
    }
