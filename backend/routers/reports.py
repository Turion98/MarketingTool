from __future__ import annotations

from fastapi import APIRouter, Body, Query
from fastapi.responses import HTMLResponse, Response

from models.report_settings import ReportSettings
from services.reports import (
    build_html_report,
    delete_report_settings_payload,
    export_report_payload,
    get_export_token_payload,
    get_report_settings_payload,
    html_to_pdf_bytes,
    put_report_settings_payload,
    report_send_payload,
    report_send_test_payload,
)
from services.runtime_config import get_logo_url

router = APIRouter(tags=["reports"])


@router.get("/api/analytics/export_token")
def get_export_token(
    storyId: str,
    days: int = 7,
    secret: str = Query(..., description="DEV clear secret for token issuance"),
):
    return get_export_token_payload(storyId, days, secret)


@router.get("/api/analytics/export")
def export_report(
    token: str,
    storyId: str | None = None,
    range: str | None = Query(default="last7d", description="last7d|last30d|custom"),
    _from: str | None = None,
    _to: str | None = None,
    fmt: str = Query(default="html", description="html|json|pdf"),
    terminal: str | None = None,
):
    sid, f, t, roll = export_report_payload(token, storyId, range, _from, _to, fmt, terminal)
    if fmt == "json":
        return roll
    if fmt == "pdf":
        html = build_html_report(roll, logo_url=get_logo_url())
        pdf_bytes = html_to_pdf_bytes(html)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{sid}_{f}_{t}.pdf"'},
        )
    html = build_html_report(roll, logo_url=get_logo_url())
    return HTMLResponse(html)


@router.get("/api/report-settings")
def get_report_settings(storyId: str):
    return get_report_settings_payload(storyId)


@router.put("/api/report-settings")
def put_report_settings(storyId: str, body: ReportSettings):
    return put_report_settings_payload(storyId, body)


@router.delete("/api/report-settings")
def delete_report_settings(storyId: str):
    return delete_report_settings_payload(storyId)


@router.post("/api/report-send")
def report_send(storyId: str):
    return report_send_payload(storyId)


@router.post("/api/report-settings/test")
def report_send_test(body: ReportSettings = Body(...)):
    return report_send_test_payload(body)
