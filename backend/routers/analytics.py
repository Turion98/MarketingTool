from __future__ import annotations

from fastapi import APIRouter, Query, Request

from services.analytics import (
    AnalyticsBatch,
    get_day,
    ingest_batch,
    list_days,
    rollup_day,
    rollup_range,
)

router = APIRouter(tags=["analytics"])


@router.post("/api/analytics/batch")
def post_analytics_batch(batch: AnalyticsBatch, request: Request):
    return ingest_batch(batch, request)


@router.get("/api/analytics/days")
def list_analytics_days(storyId: str):
    return list_days(storyId)


@router.get("/api/analytics/day")
def get_analytics_day(storyId: str, day: str):
    return get_day(storyId, day)


@router.get("/api/analytics/rollup")
def get_rollup_day(storyId: str, day: str):
    return rollup_day(storyId, day)


@router.get("/api/analytics/rollup-range")
def get_rollup_range(
    storyId: str,
    _from: str = Query(..., alias="from"),
    _to: str = Query(..., alias="to"),
    terminal: str | None = Query(default=None, description="Vesszővel elválasztott terminal pageId lista"),
):
    return rollup_range(storyId, _from, _to, terminal)
