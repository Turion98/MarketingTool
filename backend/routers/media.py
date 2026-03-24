from __future__ import annotations

from fastapi import APIRouter, Request

from services.media_generation import generate_image_payload
from services.story_runtime import clear_cache_payload, get_generated_image_response

router = APIRouter(tags=["media"])


@router.post("/api/generate-image")
async def api_generate_image(req: Request):
    return await generate_image_payload(req)


@router.get("/api/image/{story_slug}/{image_name}")
def get_generated_image(story_slug: str, image_name: str):
    return get_generated_image_response(story_slug, image_name)


@router.post("/api/cache/clear")
def clear_cache():
    return clear_cache_payload()


@router.post("/api/testVoice")
def test_voice():
    return {"ok": True}


@router.post("/api/testImage")
def test_image():
    return {"ok": True}
