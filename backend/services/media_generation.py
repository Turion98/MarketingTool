from __future__ import annotations

from typing import Any

from fastapi import HTTPException, Request

from services.runtime_config import (
    DEFAULT_NEGATIVE_BLOCK,
    DEFAULT_STORY,
    HAS_IMAGE_BACKEND,
    generate_image_asset,
)
from services.story_runtime import (
    assemble_image_prompt_from_fragments,
    find_page_recursive,
    inject_fragments_global_for,
    load_story,
    normalize_prompt_incoming,
    normalize_src_to_path,
)


async def generate_image_payload(req: Request) -> dict[str, Any]:
    if not HAS_IMAGE_BACKEND:
        raise HTTPException(status_code=500, detail="Image backend not loaded")

    body = await req.json()
    page_id = body.get("pageId") or body.get("page_id") or "page"
    raw_prompt = body.get("prompt") or None
    prompt = normalize_prompt_incoming(raw_prompt)

    params = body.get("params") or {}
    style = body.get("styleProfile") or {}
    mode = body.get("mode") or "draft"
    api_key = body.get("apiKey") or None
    story_slug = body.get("storySlug") or body.get("storyId") or None
    reuse = body.get("reuseExisting", True)
    fmt = body.get("format", "png")

    if not prompt:
        try:
            story_path = normalize_src_to_path(
                body.get("src") or ((story_slug + ".json") if story_slug else DEFAULT_STORY)
            )
            story = load_story(story_path)
            page = find_page_recursive(story, page_id)
            if page:
                page_with_fr = inject_fragments_global_for(story, page)
                _, prompt_built = assemble_image_prompt_from_fragments(story, page_with_fr)
                prompt = normalize_prompt_incoming(prompt_built)
        except Exception:
            pass

        if not prompt:
            raise HTTPException(status_code=400, detail="Missing prompt and could not assemble from page")

    if DEFAULT_NEGATIVE_BLOCK:
        low = prompt.lower()
        if DEFAULT_NEGATIVE_BLOCK.lower() not in low:
            prompt = f"{prompt}, Negative: {DEFAULT_NEGATIVE_BLOCK}".strip(", ")

    try:
        res = generate_image_asset(
            prompt=prompt,
            page_id=page_id,
            params=params,
            style_profile=style,
            cache=True,
            fmt=fmt,
            reuse_existing=reuse,
            api_key=api_key,
            mode=mode,
            story_slug=story_slug or "story",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {"ok": True, "url": res.get("url"), "path": res.get("path")}
