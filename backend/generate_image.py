# backend/generate_image.py

import os
import json
import time
import hashlib
from typing import Optional, Dict, Any
from datetime import datetime
from pathlib import Path

import requests
from io import BytesIO
from PIL import Image
import pytesseract
# Állítsd be a Tesseract elérési útját Windows alatt
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

# =========================
# OCR / SAFETY CONFIG
# =========================
ENABLE_OCR_TEXT_CHECK = os.getenv("ENABLE_OCR_TEXT_CHECK", "true").lower() == "true"
OCR_TEXT_MIN_LENGTH = int(os.getenv("OCR_TEXT_MIN_LENGTH", "4"))
OCR_RETRY_LIMIT = int(os.getenv("OCR_RETRY_LIMIT", "2"))  # max 2 retry (össz. 3 generálás)

# =========================
# REPLICATE KULCS + MODELL
# =========================
REPLICATE_API_TOKEN = os.getenv("REPLICATE_API_TOKEN")

REPLICATE_DEFAULT_VERSION = os.getenv(
    "REPLICATE_IMAGE_VERSION",
    "cfc062cde6f7c54dc085f1cf89a9853b14e571db6d501fcdd602a31e6cd6f3c0",
)

# =========================
# KONFIG
# =========================

def get_config():
    if os.path.exists("userConfig.json"):
        with open("userConfig.json", "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

_config = get_config()

ENABLE_IMAGE_CACHE = bool(_config.get("ENABLE_IMAGE_CACHE", True))
ENABLE_IMAGE_PRELOAD = bool(_config.get("ENABLE_IMAGE_PRELOAD", True))
_IMAGE_PARAMS = _config.get("IMAGE_PARAMS", {})
_DEFAULT_FMT = (_config.get("IMAGE_DEFAULT_FMT", "png") or "png").lower()

# log könyvtár
LOG_DIR = "logs"
os.makedirs(LOG_DIR, exist_ok=True)
LOG_FILE = os.path.join(LOG_DIR, "image_gen.jsonl")


# =========================
# HELPER-ek
# =========================
def _log(event: Dict[str, Any]) -> None:
    event["ts"] = datetime.utcnow().isoformat() + "Z"
    line = json.dumps(event, ensure_ascii=False)
    # konzolra
    print("[image_gen]", line, flush=True)
    # fájlba
    try:
        with open(LOG_FILE, "a", encoding="utf-8") as lf:
            lf.write(line + "\n")
    except Exception:
        pass


def _slugify(value: Optional[str]) -> str:
    s = (value or "").strip().lower()
    if not s:
        return "default"
    s = s.replace("\\", "/")
    s = os.path.basename(s)
    if s.endswith(".json"):
        s = s[:-5]
    out = []
    for ch in s:
        if ("a" <= ch <= "z") or ("0" <= ch <= "9") or ch in ("-", "_"):
            out.append(ch)
        else:
            out.append("-")
    slug = "".join(out)
    while "--" in slug:
        slug = slug.replace("--", "-")
    slug = slug.strip("-") or "default"
    return slug


def _compute_prompt_key(
    prompt: Optional[str],
    params: Dict[str, Any],
    style_profile: Dict[str, Any],
    existing_key: Optional[str] = None,
) -> str:
    if existing_key:
        return existing_key
    data_str = json.dumps(
        {
            "prompt": prompt,
            "params": params,
            "style": style_profile,
        },
        sort_keys=True,
    )
    return hashlib.sha1(data_str.encode("utf-8")).hexdigest()


def _build_filename(
    page_id: str,
    prompt_key: str,
    seed: Optional[int],
    fmt: str,
    story_slug: Optional[str] = None,
) -> str:
    safe_story = _slugify(story_slug)
    base_dir = os.path.join("generated", "images", safe_story)
    os.makedirs(base_dir, exist_ok=True)

    pk_hash = hashlib.sha1(prompt_key.encode("utf-8")).hexdigest()[:12]
    seed_str = f"_{seed}" if seed is not None else ""
    filename = f"{page_id}_{pk_hash}{seed_str}.{fmt}"
    return os.path.join(base_dir, filename)


def _write_sidecar_meta(image_path: str, meta: Dict[str, Any]) -> None:
    try:
        with open(image_path + ".json", "w", encoding="utf-8") as mf:
            json.dump(meta, mf, ensure_ascii=False, indent=2)
    except Exception:
        pass


def _run_image_safety(
    image_path: str,
    *,
    page_id: str,
    story_slug: str,
    prompt: str,
) -> Dict[str, Any]:
    """
    Lokális OCR alapú safety:
      - ha ENABLE_OCR_TEXT_CHECK = false → 'skipped'
      - ha true → OCR-rel megnézi, van-e értelmezhető szöveg a képen.

    Nem vizsgál brandet, nyelvet vagy jelentést – csak azt, VAN-E TEXT.
    Ha a kiolvasott szöveg hossza >= OCR_TEXT_MIN_LENGTH → status = 'block'.
    """
    if not ENABLE_OCR_TEXT_CHECK:
        _log({
            "event": "image.safety_skipped",
            "reason": "ocr_disabled",
            "pageId": page_id,
            "storySlug": story_slug,
        })
        return {"status": "skipped", "scores": None, "labels": []}

    try:
        with open(image_path, "rb") as f:
            content = f.read()

        img = Image.open(BytesIO(content))

        # Generikus OCR – nyelv nélkül, csak text presence
        raw_text = pytesseract.image_to_string(img)
        text = (raw_text or "").strip()

        has_text = len(text) >= OCR_TEXT_MIN_LENGTH

        if has_text:
            status = "block"
            labels = ["text_detected"]
        else:
            status = "ok"
            labels = ["no_text"]

        scores = {
            "text_length": len(text),
        }

        _log({
            "event": "image.safety_result",
            "pageId": page_id,
            "storySlug": story_slug,
            "prompt": prompt,
            "status": status,
            "scores": scores,
            "labels": labels,
        })

        return {
            "status": status,
            "scores": scores,
            "labels": labels,
        }

    except Exception as e:
        _log({
            "event": "image.safety_error",
            "pageId": page_id,
            "storySlug": story_slug,
            "prompt": prompt,
            "error": str(e),
        })
        # hiba esetén inkább ne blokkoljunk automatikusan
        return {"status": "error", "scores": None, "labels": []}


def _generate_safe_placeholder_image(
    image_path: str,
    *,
    width: int = 960,
    height: int = 540,
) -> None:
    """
    B fallback:
      - egyszerű, text-mentes 16:9 háttér generálása.
      - cél: stabil, neutrális vizuál, ami nem tör meg semmilyen flow-t.
    """
    # sötét, neutrális háttér (pl. #121826)
    img = Image.new("RGB", (width, height), (18, 24, 38))
    img.save(image_path)


def _normalize_prompt(prompt: Any) -> str:
    """
    A story motor küldhet összetett prompt-objektumot:
    {
        "global": "...",
        "chapter": "...",
        "page": "...",
        "combinedPrompt": "...",
        "negativePrompt": "..."
    }
    A Replicate viszont sima stringet vár. Itt egyetlen stringgé lapítjuk.
    """
    if prompt is None:
        return ""
    # ha már string → kész
    if isinstance(prompt, str):
        return prompt.strip()
    # ha dict → össze kell fűzni
    if isinstance(prompt, dict):
        # ha van combinedPrompt → ezt használjuk elsőnek
        cp = prompt.get("combinedPrompt")
        if cp:
            base = str(cp).strip()
        else:
            parts = []
            for key in ("global", "chapter", "page"):
                v = prompt.get(key)
                if v:
                    parts.append(str(v).strip())
            base = ", ".join(p for p in parts if p)
        neg = prompt.get("negativePrompt")
        if neg:
            # külön jelöljük, hogy negatív
            base = f"{base}, Negative: {str(neg).strip()}"
        return base.strip()
    # bármi más → str()
    return str(prompt).strip()


# =========================
# FŐ FÜGGVÉNY
# =========================

def generate_image_asset(
    *,
    prompt: Optional[str],
    page_id: str,
    seed: Optional[int] = None,
    prompt_key: Optional[str] = None,
    params: Optional[Dict[str, Any]] = None,
    style_profile: Optional[Dict[str, Any]] = None,
    cache: bool = True,
    fmt: str = "png",
    reuse_existing: bool = True,
    api_key: Optional[str] = None,
    mode: str = "draft",
    story_slug: Optional[str] = None,
    story_src: Optional[str] = None,
) -> Dict[str, Any]:
    started = time.perf_counter()
    params = params or {}
    style_profile = style_profile or {}

    # 🔽 fontos: a bejövő prompt lehet OBJECT → laposítsuk az elején
    raw_prompt = prompt
    norm_prompt = _normalize_prompt(prompt)

    # fmt normalizálás
    fmt = (fmt or _DEFAULT_FMT or "png").lower()
    if fmt not in ("png", "jpg", "jpeg", "webp"):
        fmt = "png"

    # 🔽 alap paramok mód szerint – MOSTANTÓL 16:9
    default_params = {
        "draft": {
            "width": 960,
            "height": 540,
            "steps": 12,
            "cfg": 3.5,
            "aspect_ratio": "16:9",   # kényszerített arány
        },
        "refine": {
            "width": 1280,
            "height": 720,
            "steps": 28,
            "cfg": 6.5,
            "aspect_ratio": "16:9",   # kényszerített arány
        },
    }

    # ha van userConfig → engedjük kiegészíteni
    if "draft" in _IMAGE_PARAMS and isinstance(_IMAGE_PARAMS["draft"], dict):
        default_params["draft"].update(_IMAGE_PARAMS["draft"])
    if "refine" in _IMAGE_PARAMS and isinstance(_IMAGE_PARAMS["refine"], dict):
        default_params["refine"].update(_IMAGE_PARAMS["refine"])

    # töltsük fel a bejövő params-ot a mode alapjaival
    for k, v in default_params.get(mode, {}).items():
        params.setdefault(k, v)

    # ha NINCS aspect_ratio a végén, tegyük be 16:9-re
    if "aspect_ratio" not in params:
        w = params.get("width")
        h = params.get("height")
        if w and h:
            ratio = w / h
            if abs(ratio - (16 / 9)) < 0.05:
                params["aspect_ratio"] = "16:9"
            elif abs(ratio - (9 / 16)) < 0.05:
                params["aspect_ratio"] = "9:16"
            else:
                params["aspect_ratio"] = "16:9"
        else:
            params["aspect_ratio"] = "16:9"

    # dimenziók a placeholderhez is
    width = int(params.get("width") or default_params[mode]["width"])
    height = int(params.get("height") or default_params[mode]["height"])

    # prompt key – már a LAPOSÍTOTT promptból számolunk
    pk = _compute_prompt_key(norm_prompt, {**params, "mode": mode}, style_profile, prompt_key)

    # story slug
    effective_slug = story_slug or _slugify(story_src)

    # kimeneti fájl
    out_file = _build_filename(page_id, pk, seed, fmt, story_slug=effective_slug)
    out_rel = os.path.relpath(out_file).replace("\\", "/")
    out_url = f"/{out_rel}" if not out_rel.startswith("/") else out_rel

    api_key = api_key or REPLICATE_API_TOKEN

    # 🔁 OCR retry logika
    max_retries = OCR_RETRY_LIMIT if ENABLE_OCR_TEXT_CHECK else 0
    attempt = 0

    if not api_key:
        _log({
            "event": "image.no_api_key",
            "pageId": page_id,
            "prompt": norm_prompt,
            "rawPrompt": raw_prompt,
            "mode": mode,
            "storySlug": effective_slug,
        })
    else:
        while attempt <= max_retries:
            try:
                REPLICATE_VERSION = REPLICATE_DEFAULT_VERSION

                replicate_input: Dict[str, Any] = {
                    "prompt": norm_prompt or "",
                }

                if "width" in params:
                    replicate_input["width"] = params["width"]
                if "height" in params:
                    replicate_input["height"] = params["height"]
                if "aspect_ratio" in params:
                    replicate_input["aspect_ratio"] = params["aspect_ratio"]
                if "steps" in params:
                    replicate_input["num_inference_steps"] = params["steps"]
                if "cfg" in params:
                    replicate_input["guidance_scale"] = params["cfg"]

                _log({
                    "event": "image.replicate_request",
                    "pageId": page_id,
                    "prompt": norm_prompt,
                    "input": replicate_input,
                    "mode": mode,
                    "storySlug": effective_slug,
                    "attempt": attempt,
                })

                create_resp = requests.post(
                    "https://api.replicate.com/v1/predictions",
                    headers={
                        "Authorization": f"Token {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "version": REPLICATE_VERSION,
                        "input": replicate_input,
                    },
                    timeout=30,
                )
                create_resp.raise_for_status()
                pred = create_resp.json()
                pred_id = pred.get("id")

                real_url = None

                if pred_id:
                    for _ in range(40):
                        time.sleep(2)
                        poll_resp = requests.get(
                            f"https://api.replicate.com/v1/predictions/{pred_id}",
                            headers={"Authorization": f"Token {api_key}"},
                            timeout=30,
                        )
                        poll_resp.raise_for_status()
                        poll = poll_resp.json()
                        st = poll.get("status")
                        if st == "succeeded":
                            out = poll.get("output") or []
                            if out:
                                real_url = out[0] if isinstance(out, list) else out
                            else:
                                _log({
                                    "event": "image.replicate_no_output",
                                    "pageId": page_id,
                                    "prompt": norm_prompt,
                                    "rawPrompt": raw_prompt,
                                    "mode": mode,
                                    "storySlug": effective_slug,
                                    "poll": poll,
                                    "attempt": attempt,
                                })
                            break
                        if st in ("failed", "canceled"):
                            _log({
                                "event": "image.replicate_failed_status",
                                "status": st,
                                "pageId": page_id,
                                "prompt": norm_prompt,
                                "rawPrompt": raw_prompt,
                                "mode": mode,
                                "storySlug": effective_slug,
                                "poll": poll,
                                "attempt": attempt,
                            })
                            break

                # ha nincs output → próbálkozunk cache-sel a loop után
                if not real_url:
                    break

                # letöltés + mentés
                duration_ms = int((time.perf_counter() - started) * 1000)
                final_url = real_url
                saved_local = False

                if isinstance(real_url, str) and real_url.startswith(("http://", "https://")):
                    try:
                        resp = requests.get(real_url, timeout=60)
                        resp.raise_for_status()

                        os.makedirs(os.path.dirname(out_file), exist_ok=True)

                        with open(out_file, "wb") as f:
                            f.write(resp.content)

                        final_url = out_url
                        saved_local = True

                        # OCR safety check
                        safety = _run_image_safety(
                            out_file,
                            page_id=page_id,
                            story_slug=effective_slug,
                            prompt=norm_prompt or "",
                        )

                        # ha block, és még van retry
                        if safety.get("status") == "block" and attempt < max_retries:
                            _log({
                                "event": "image.safety_block_retry",
                                "pageId": page_id,
                                "storySlug": effective_slug,
                                "prompt": norm_prompt,
                                "rawPrompt": raw_prompt,
                                "safety": safety,
                                "attempt": attempt,
                            })
                            try:
                                os.remove(out_file)
                            except Exception:
                                pass
                            attempt += 1
                            continue  # új generate

                        # ha block, és NINCS több retry → B fallback
                        if safety.get("status") == "block" and attempt >= max_retries:
                            _log({
                                "event": "image.safety_block_placeholder_fallback",
                                "pageId": page_id,
                                "storySlug": effective_slug,
                                "prompt": norm_prompt,
                                "rawPrompt": raw_prompt,
                                "safety": safety,
                                "attempt": attempt,
                            })
                            try:
                                os.remove(out_file)
                            except Exception:
                                pass

                            # safe 16:9 háttér generálása
                            _generate_safe_placeholder_image(
                                out_file,
                                width=width,
                                height=height,
                            )
                            final_url = out_url

                            meta = {
                                "pageId": page_id,
                                "promptKey": pk,
                                "seed": seed,
                                "mode": mode,
                                "cacheHit": False,
                                "durationMs": duration_ms,
                                "flags": {
                                    "ENABLE_IMAGE_CACHE": ENABLE_IMAGE_CACHE,
                                    "ENABLE_IMAGE_PRELOAD": ENABLE_IMAGE_PRELOAD,
                                },
                                "source": "placeholder",
                                "storySlug": effective_slug,
                                "prompt": norm_prompt,
                                "rawPrompt": raw_prompt,
                                "params": params,
                                "styleProfile": style_profile,
                                "replicateUrl": real_url,
                                "safety": safety,
                                "placeholder": True,
                            }
                            _write_sidecar_meta(out_file, meta)

                            _log({
                                "event": "image.placeholder_returned",
                                "pageId": page_id,
                                "storySlug": effective_slug,
                                "path": final_url,
                            })

                            return {
                                "path": final_url,
                                "url": final_url,
                                "seed": seed,
                                "cacheHit": False,
                                "promptKey": pk,
                                "mode": mode,
                                "storySlug": effective_slug,
                                "source": "placeholder",
                                "placeholder": True,
                            }

                        # ide csak akkor jutunk, ha NEM block (ok / skipped / error)
                        meta = {
                            "pageId": page_id,
                            "promptKey": pk,
                            "seed": seed,
                            "mode": mode,
                            "cacheHit": False,
                            "durationMs": duration_ms,
                            "flags": {
                                "ENABLE_IMAGE_CACHE": ENABLE_IMAGE_CACHE,
                                "ENABLE_IMAGE_PRELOAD": ENABLE_IMAGE_PRELOAD,
                            },
                            "source": "replicate_saved",
                            "storySlug": effective_slug,
                            "prompt": norm_prompt,
                            "rawPrompt": raw_prompt,
                            "params": params,
                            "styleProfile": style_profile,
                            "replicateUrl": real_url,
                            "safety": safety,
                        }
                        _write_sidecar_meta(out_file, meta)

                    except Exception as e:
                        _log({
                            "event": "image.save_error",
                            "error": str(e),
                            "pageId": page_id,
                            "prompt": norm_prompt,
                            "rawPrompt": raw_prompt,
                            "mode": mode,
                            "storySlug": effective_slug,
                            "replicateUrl": real_url,
                            "attempt": attempt,
                        })

                _log({
                    "event": "image.replicate_success",
                    "pageId": page_id,
                    "prompt": norm_prompt,
                    "rawPrompt": raw_prompt,
                    "mode": mode,
                    "storySlug": effective_slug,
                    "replicateUrl": real_url,
                    "savedLocal": saved_local,
                    "path": final_url,
                    "durationMs": duration_ms,
                    "attempt": attempt,
                })

                return {
                    "path": final_url,
                    "url": final_url,
                    "seed": seed,
                    "cacheHit": False,
                    "promptKey": pk,
                    "mode": mode,
                    "storySlug": effective_slug,
                    "source": "replicate_saved" if saved_local else "replicate_remote",
                }

            except Exception as e:
                replicate_body = None
                try:
                    if hasattr(e, "response") and e.response is not None:
                        replicate_body = e.response.text
                except Exception:
                    replicate_body = None

                _log({
                    "event": "image.replicate_error",
                    "error": str(e),
                    "replicateResponse": replicate_body,
                    "pageId": page_id,
                    "prompt": norm_prompt,
                    "rawPrompt": raw_prompt,
                    "mode": mode,
                    "storySlug": effective_slug,
                    "attempt": attempt,
                })
                # itt nem retry-olunk végtelenül, kilépünk a loopból
                break

    # 3) HA NEM SIKERÜLT → PRÓBÁLJUK A CACHE-T (MÁSODLAGOS!)
    if ENABLE_IMAGE_CACHE and cache and os.path.exists(out_file):
        duration_ms = int((time.perf_counter() - started) * 1000)
        meta = {
            "pageId": page_id,
            "promptKey": pk,
            "seed": seed,
            "mode": mode,
            "cacheHit": True,
            "durationMs": duration_ms,
            "flags": {
                "ENABLE_IMAGE_CACHE": ENABLE_IMAGE_CACHE,
                "ENABLE_IMAGE_PRELOAD": ENABLE_IMAGE_PRELOAD,
            },
            "source": "cache",
            "storySlug": effective_slug,
        }
        _write_sidecar_meta(
            out_file,
            {
                **meta,
                "prompt": norm_prompt,
                "rawPrompt": raw_prompt,
                "params": params,
                "styleProfile": style_profile,
            },
        )
        _log({"event": "image.cache_fallback", **meta, "path": out_url})
        return {
            "path": out_url,
            "url": out_url,
            "seed": seed,
            "cacheHit": True,
            "promptKey": pk,
            "mode": mode,
            "storySlug": effective_slug,
            "source": "cache",
        }

    # 4) SE REPLICATE, SE CACHE → HIBA (frontend fallback veszi át)
    duration_ms = int((time.perf_counter() - started) * 1000)
    _log({
        "event": "image.no_source_available",
        "pageId": page_id,
        "prompt": norm_prompt,
        "rawPrompt": raw_prompt,
        "mode": mode,
        "storySlug": effective_slug,
        "durationMs": duration_ms,
    })
    raise RuntimeError("Image generation failed: no replicate output and no cached image.")
