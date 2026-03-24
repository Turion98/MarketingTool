from __future__ import annotations

import os

from fastapi import APIRouter, Query

from services.runtime_config import (
    DEFAULT_STORY,
    ENABLE_IMAGE_CACHE,
    ENABLE_IMAGE_PRELOAD,
    HAS_IMAGE_BACKEND,
    HAS_VOICE_BACKEND,
    STORIES_DIR,
)
from services.story_runtime import (
    get_fragments_payload,
    get_landing_payload,
    get_page_payload,
    get_public_landing_payload,
    get_story_payload,
)

router = APIRouter(tags=["runtime"])


@router.get("/api/story")
def get_story(src: str | None = Query(default=None)):
    return get_story_payload(src)


@router.get("/health")
def health():
    sfx_dir = os.path.join("assets", "sfx")
    return {
        "ok": True,
        "imageBackend": HAS_IMAGE_BACKEND,
        "voiceBackend": HAS_VOICE_BACKEND,
        "flags": {
            "ENABLE_IMAGE_CACHE": ENABLE_IMAGE_CACHE,
            "ENABLE_IMAGE_PRELOAD": ENABLE_IMAGE_PRELOAD,
        },
        "storiesDir": STORIES_DIR,
        "defaultStory": DEFAULT_STORY,
        "mockVoiceAvailable": os.path.exists("assets/mock_voice.mp3"),
        "generatedAudioDirExists": os.path.isdir("generated/audio"),
        "sfxCount": len(os.listdir(sfx_dir)) if os.path.isdir(sfx_dir) else 0,
    }


@router.get("/api/landing")
def get_landing(src: str | None = None):
    return get_landing_payload(src)


@router.get("/fragments")
def get_fragments(src: str | None = Query(default=None)):
    return get_fragments_payload(src)


@router.get("/landing")
def get_landing_public(src: str | None = Query(default=None)):
    return get_public_landing_payload(src)


@router.get("/page/{page_id}")
def get_page(page_id: str, src: str | None = Query(default=None)):
    return get_page_payload(page_id, src)
