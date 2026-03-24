from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from datetime import datetime, timedelta
from urllib.parse import quote

from fastapi import HTTPException

from email_utils import send_mail_with_pdf
from models.report_settings import ReportSettings
from report_scheduler import load_settings, save_settings, set_generate_cb, start_scheduler
from services.analytics import rollup_range
from services.contracts import JSONValue
from services.runtime_config import get_logo_url

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
HAS_PDF = True


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _unb64url(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def sign_token(payload: dict, ttl_seconds: int = 7 * 24 * 3600) -> str:
    data = {
        **payload,
        "iat": int(time.time()),
        "exp": int(time.time()) + int(ttl_seconds),
    }
    body = _b64url(json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8"))
    sig = hmac.new(SECRET_KEY.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).digest()
    return body + "." + _b64url(sig)


def verify_token(token: str) -> dict:
    try:
        body, sig = token.split(".", 1)
        expect = _b64url(hmac.new(SECRET_KEY.encode("utf-8"), body.encode("utf-8"), hashlib.sha256).digest())
        if not hmac.compare_digest(expect, sig):
            raise HTTPException(status_code=401, detail="Invalid token signature")
        payload = json.loads(_unb64url(body).decode("utf-8"))
        if int(payload.get("exp", 0)) < int(time.time()):
            raise HTTPException(status_code=401, detail="Token expired")
        return payload
    except ValueError:
        raise HTTPException(status_code=400, detail="Malformed token")
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


def get_export_token_payload(story_id: str, days: int, secret: str) -> dict[str, JSONValue]:
    if secret != os.getenv("DEV_CLEAR_SECRET", "KAB1T05Z3r!25"):
        raise HTTPException(status_code=401, detail="Invalid secret")
    ttl = max(1, min(int(days), 90)) * 24 * 3600
    token = sign_token({"storyId": story_id}, ttl_seconds=ttl)
    return {"ok": True, "token": token, "validDays": days}


def resolve_range(range_: str | None, _from: str | None, _to: str | None):
    today = datetime.utcnow().date()
    if range_ in ("last7d", "7d"):
        start = today - timedelta(days=6)
        end = today
    elif range_ in ("last30d", "30d"):
        start = today - timedelta(days=29)
        end = today
    elif _from and _to:
        start = datetime.strptime(_from, "%Y-%m-%d").date()
        end = datetime.strptime(_to, "%Y-%m-%d").date()
    else:
        start = today - timedelta(days=6)
        end = today
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


def _format_pct(x: float) -> str:
    try:
        return f"{x * 100:.1f}%"
    except Exception:
        return "0.0%"


def _ms_to_hms(ms: int) -> str:
    s = int(ms // 1000)
    h = s // 3600
    m = (s % 3600) // 60
    sec = s % 60
    out = []
    if h:
        out.append(f"{h}h")
    out.append(f"{m}m")
    if sec:
        out.append(f"{sec}s")
    return " ".join(out)


def build_html_report(roll: dict[str, JSONValue], logo_url: str | None = None) -> str:
    dau_labels = [d["day"] for d in roll.get("dau", [])]
    dau_users = [d["users"] for d in roll.get("dau", [])]
    dau_sessions = [d["sessions"] for d in roll.get("dau", [])]
    pages = roll.get("pages", [])
    top_dropout = sorted(pages, key=lambda x: x.get("exitRate", 0), reverse=True)[:5]
    k = roll.get("kpis", {})
    totals = roll.get("totals", {})
    logo_html = (
        f'<img src="{logo_url}" alt="logo" style="height:42px;margin-right:12px;border-radius:6px;" />'
        if logo_url
        else ""
    )

    html = f"""<!doctype html>
<html>
<head>
<meta charset="utf-8"/>
<title>Report – {roll.get('storyId')}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  body{{background:#0f0f11;color:#eee;font:14px/1.5 system-ui,Segoe UI,Roboto,Helvetica,Arial}}
  .wrap{{max-width:980px;margin:24px auto;padding:16px}}
  .header{{display:flex;align-items:center;gap:12px;margin-bottom:16px}}
  h1{{font-size:20px;margin:0}}
  .kpi-grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:16px 0}}
  .kpi{{background:#17171a;border:1px solid #2a2a2f;padding:12px;border-radius:12px}}
  .kpi .lbl{{opacity:.8;font-size:12px}}
  .kpi .val{{font-size:20px;font-weight:700;margin-top:4px}}
  .sect{{margin:18px 0}}
  .card{{background:#17171a;border:1px solid #2a2a2f;padding:12px;border-radius:12px;margin:12px 0}}
  table{{width:100%;border-collapse:collapse}}
  th,td{{border-bottom:1px solid #2a2a2f;padding:6px 8px;text-align:left}}
  .muted{{opacity:.8}}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">{logo_html}<div><h1>Campaign Report – {roll.get('storyId')}</h1>
  <div class="muted">{roll.get('from')} → {roll.get('to')}</div></div></div>

  <div class="kpi-grid">
    <div class="kpi"><div class="lbl">Users (period)</div><div class="val">{roll.get('users',0)}</div></div>
    <div class="kpi"><div class="lbl">Sessions (period)</div><div class="val">{roll.get('sessions',0)}</div></div>
    <div class="kpi"><div class="lbl">Completion rate</div><div class="val">{_format_pct(k.get('completionRate',0))}</div></div>
    <div class="kpi"><div class="lbl">Avg session</div><div class="val">{_ms_to_hms(k.get('avgSessionDurationMs',0))}</div></div>
    <div class="kpi"><div class="lbl">Puzzle success</div><div class="val">{_format_pct(k.get('puzzleSuccessRate',0))}</div></div>
    <div class="kpi"><div class="lbl">Runs</div><div class="val">{roll.get('runs',0)}</div></div>
    <div class="kpi"><div class="lbl">Runs (period)</div><div class="val">{roll.get('runs',0)}</div></div>
  </div>

  <div class="sect card">
    <h3 style="margin:0 0 8px">DAU trend</h3>
    <canvas id="dau"></canvas>
  </div>

  <div class="sect">
    <div class="card">
      <h3 style="margin:0 0 8px">Top dropout pages</h3>
      <table>
        <thead><tr><th>Page</th><th>Unique sessions</th><th>Exits</th><th>Exit rate</th></tr></thead>
        <tbody>
          {''.join(f"<tr><td>{quote(p.get('pageId',''))}</td><td>{p.get('uniqueSessions',0)}</td><td>{p.get('exitsAfterPage',0)}</td><td>{_format_pct(p.get('exitRate',0))}</td></tr>" for p in top_dropout)}
        </tbody>
      </table>
    </div>

    <div class="card">
      <h3 style="margin:0 0 8px">Totals</h3>
      <table>
        <tbody>
          <tr><td>Page views</td><td>{totals.get('pageViews',0)}</td></tr>
          <tr><td>Choices</td><td>{totals.get('choices',0)}</td></tr>
          <tr><td>Puzzle tries</td><td>{(totals.get('puzzles') or {}).get('tries', 0)}</td></tr>
          <tr><td>Puzzle solved</td><td>{(totals.get('puzzles') or {}).get('solved', 0)}</td></tr>
          <tr><td>Runes</td><td>{totals.get('runes',0)}</td></tr>
          <tr><td>Media starts</td><td>{totals.get('mediaStarts',0)}</td></tr>
          <tr><td>Media stops</td><td>{totals.get('mediaStops',0)}</td></tr>
          <tr><td>Completions</td><td>{totals.get('completions',0)}</td></tr>
          <tr><td>CTA shown</td><td>{totals.get('ctaShown',0)}</td></tr>
          <tr><td>CTA clicks</td><td>{totals.get('ctaClicks',0)}</td></tr>
          <tr><td>CTA CTR</td><td>{_format_pct(k.get('ctaCtr',0))}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<script>
const lbls = {json.dumps(dau_labels)};
const users = {json.dumps(dau_users)};
const sessions = {json.dumps(dau_sessions)};
const ctx = document.getElementById('dau').getContext('2d');
</script>
</body>
</html>"""
    return html


def html_to_pdf_bytes(html_str: str) -> bytes:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.set_content(html_str, wait_until="networkidle")
        pdf = page.pdf(
            format="A4",
            print_background=True,
            margin={"top": "12mm", "right": "12mm", "bottom": "12mm", "left": "12mm"},
        )
        browser.close()
        return pdf


def export_report_html_pdf(
    storyId: str,
    rangeSpec: str = "last7d",
    _from: str | None = None,
    _to: str | None = None,
    terminal: str | None = None,
) -> tuple[bytes, str, str]:
    f, t = resolve_range(rangeSpec, _from, _to)
    roll = rollup_range(storyId, f, t, terminal)
    html = build_html_report(roll, logo_url=get_logo_url())
    pdf_bytes = html_to_pdf_bytes(html)
    return pdf_bytes, f, t


def export_report_payload(
    token: str,
    storyId: str | None,
    range_value: str | None,
    _from: str | None,
    _to: str | None,
    fmt: str,
    terminal: str | None,
):
    payload = verify_token(token)
    sid_from_token = payload.get("storyId")
    sid = storyId or sid_from_token
    if not sid or sid != sid_from_token:
        raise HTTPException(status_code=400, detail="storyId mismatch or missing")

    f, t = resolve_range(range_value, _from, _to)
    roll = rollup_range(sid, f, t, terminal)
    return sid, f, t, roll


def get_report_settings_payload(story_id: str):
    data = load_settings()
    cfg = data.get(story_id)
    if not cfg:
        raise HTTPException(status_code=404, detail="No settings")
    return cfg


def put_report_settings_payload(story_id: str, body: ReportSettings):
    if story_id != body.storyId:
        raise HTTPException(status_code=400, detail="storyId mismatch")
    data = load_settings()
    data[story_id] = body.model_dump()
    save_settings(data)
    return {"ok": True}


def delete_report_settings_payload(story_id: str):
    data = load_settings()
    if story_id in data:
        del data[story_id]
        save_settings(data)
    return {"ok": True}


def report_send_payload(story_id: str):
    data = load_settings()
    cfg = data.get(story_id)
    if not cfg or not cfg.get("recipients"):
        raise HTTPException(status_code=400, detail="No recipients configured")

    pdf_bytes, f, t = export_report_html_pdf(
        story_id,
        cfg.get("rangeSpec", "last7d"),
        None,
        None,
        ",".join(cfg.get("terminal", []) or []),
    )
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M")
    fname = f"report_{story_id}_{ts}.pdf"
    subject = f"[Qzera] Report – {story_id} – {cfg.get('rangeSpec','last7d')} ({f} → {t})"
    body = f"Automatikus riport a(z) {story_id} kampányról.\nIdőszak: {f} → {t}"
    send_mail_with_pdf(subject, body, cfg["recipients"], pdf_bytes, fname)
    return {"ok": True, "sentTo": cfg["recipients"], "period": [f, t]}


def report_send_test_payload(body: ReportSettings):
    if not body.recipients:
        raise HTTPException(status_code=400, detail="No recipients configured")

    pdf_bytes, f, t = export_report_html_pdf(
        body.storyId,
        body.rangeSpec or "last7d",
        None,
        None,
        ",".join(body.terminal or []),
    )
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M")
    fname = f"report_{body.storyId}_{ts}.pdf"
    subject = f"[Qzera] Report – {body.storyId} – {body.rangeSpec or 'last7d'} ({f} → {t}) [TEST]"
    msg = f"Teszt riport a(z) {body.storyId} kampányról.\nIdőszak: {f} → {t}"
    send_mail_with_pdf(subject, msg, body.recipients, pdf_bytes, fname)
    return {"ok": True, "test": True, "sentTo": body.recipients, "period": [f, t]}


def start_report_scheduler(app) -> None:
    try:
        set_generate_cb(export_report_html_pdf)
    except Exception:
        pass
    start_scheduler(app)
