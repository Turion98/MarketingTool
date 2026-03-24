# report_scheduler.py
import datetime as dt
import json
import os
import threading
import time
from pathlib import Path
from typing import Callable
from zoneinfo import ZoneInfo

from email_utils import send_mail_with_pdf
from services.contracts import JSONObject

SETTINGS_FILE = Path("analytics/_schedules.json")
REPORT_DIR = Path("analytics/reports")

GenerateReportCallback = Callable[[str, str, str | None, str | None, str | None], tuple[bytes, str, str]]

_generate_cb: GenerateReportCallback | None = None

def set_generate_cb(cb: GenerateReportCallback) -> None:
    """Main állítja be: export_report_html_pdf(storyId, rangeSpec, _from, _to, terminal) -> (bytes, from, to)"""
    global _generate_cb
    _generate_cb = cb

def load_settings() -> JSONObject:
    if SETTINGS_FILE.exists():
        return json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    return {}

def save_settings(data: JSONObject) -> None:
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")

def should_run(now: dt.datetime, last_run_iso: str | None, freq: str, time_of_day: str, tz: str) -> bool:
    # egyszerű ellenőrzés: adott napon/órában még nem futott
    zoned_now = now.astimezone(ZoneInfo(tz))
    hh, mm = map(int, time_of_day.split(":"))
    if zoned_now.hour != hh or zoned_now.minute != mm:
        return False
    if not last_run_iso:
        return True
    last = dt.datetime.fromisoformat(last_run_iso).astimezone(ZoneInfo(tz))
    if freq == "daily":
        return (zoned_now.date() != last.date())
    if freq == "weekly":
        return (zoned_now.isocalendar()[:2] != last.isocalendar()[:2])  # (year, week)
    if freq == "monthly":
        return (zoned_now.year, zoned_now.month) != (last.year, last.month)
    return False

def scheduler_loop() -> None:
    state = load_settings()
    while True:
        try:
            now = dt.datetime.now(dt.timezone.utc)
            changed = False
            for storyId, cfg in list(state.items()):
                last_run = cfg.get("_lastRun")
                if should_run(now, last_run, cfg.get("frequency","weekly"), cfg.get("timeOfDay","09:00"), cfg.get("timezone","Europe/Amsterdam")):
                    if not _generate_cb:
                        continue
                    REPORT_DIR.joinpath(storyId).mkdir(parents=True, exist_ok=True)
                    pdf_bytes, f, t = _generate_cb(
                        storyId,
                        cfg.get("rangeSpec","last7d"),
                        None, None,
                        ",".join(cfg.get("terminal", []) or [])
                    )
                    ts = now.astimezone(ZoneInfo(cfg.get("timezone","Europe/Amsterdam"))).strftime("%Y%m%d_%H%M")
                    fname = f"report_{storyId}_{ts}.pdf"
                    (REPORT_DIR / storyId / fname).write_bytes(pdf_bytes)
                    # email (ha van címzett)
                    recipients = cfg.get("recipients") or []
                    if recipients:
                        subject = f"[Qzera] Report – {storyId} – {cfg.get('rangeSpec','last7d')} ({f} → {t})"
                        body = f"Automatikus riport a(z) {storyId} kampányról.\nIdőszak: {f} → {t}"
                        try:
                            send_mail_with_pdf(subject, body, recipients, pdf_bytes, fname)
                        except Exception as e:
                            print("[scheduler] email error:", e)
                    # stamp
                    state[storyId]["_lastRun"] = now.isoformat()
                    changed = True
            if changed:
                save_settings(state)
        except Exception as e:
            print("[scheduler] error:", e)
        time.sleep(60)

def start_scheduler(app=None) -> None:
    t = threading.Thread(target=scheduler_loop, daemon=True)
    t.start()
