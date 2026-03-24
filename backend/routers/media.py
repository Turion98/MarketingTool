from __future__ import annotations

from fastapi import APIRouter

from services.contracts import (
    CacheClearResponse,
    ImageGenerationRequest,
    ImageGenerationResponse,
    SimpleOkResponse,
)
from services.media_generation import generate_image_payload
from services.story_runtime import clear_cache_payload, get_generated_image_response

router = APIRouter(tags=["media"])


@router.post("/api/generate-image", response_model=ImageGenerationResponse)
def api_generate_image(req: ImageGenerationRequest) -> ImageGenerationResponse:
    return generate_image_payload(req)


@router.get("/api/image/{story_slug}/{image_name}")
def get_generated_image(story_slug: str, image_name: str):
    return get_generated_image_response(story_slug, image_name)


@router.post("/api/cache/clear", response_model=CacheClearResponse)
def clear_cache() -> CacheClearResponse:
    payload = clear_cache_payload()
    return CacheClearResponse(ok=bool(payload["ok"]), message=str(payload["message"]))


@router.post("/api/testVoice", response_model=SimpleOkResponse)
def test_voice() -> SimpleOkResponse:
    return SimpleOkResponse()


@router.post("/api/testImage", response_model=SimpleOkResponse)
def test_image() -> SimpleOkResponse:
    return SimpleOkResponse()
