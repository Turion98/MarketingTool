from __future__ import annotations

import json
import os
import re
import traceback
from datetime import datetime, timedelta
from typing import cast

from fastapi import HTTPException, Request
from pydantic import BaseModel

from services.contracts import AnalyticsBatchHeader, AnalyticsEvent, AnalyticsProps, JSONValue
from services.runtime_config import ANALYTICS_DIR


def story_analytics_dir(story_id: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", story_id).strip("_") or "unknown"
    d = os.path.join(ANALYTICS_DIR, safe)
    os.makedirs(d, exist_ok=True)
    return d


class AnalyticsEventModel(BaseModel):
    id: str | None = None
    t: str
    ts: int | None = None
    storyId: str | None = None
    sessionId: str
    runId: str | None = None
    pageId: str | None = None
    refPageId: str | None = None
    props: AnalyticsProps | None = None


class AnalyticsBatch(BaseModel):
    storyId: str
    userId: str | None = None
    device: dict[str, object] | None = None
    events: list[AnalyticsEventModel]
    domain: str | None = None


def ingest_batch(batch: AnalyticsBatch, request: Request) -> dict[str, JSONValue]:
    try:
        now_ms = int(datetime.utcnow().timestamp() * 1000)
        host = request.headers.get("host") or ""
        host_domain = host.split(":")[0] if host else None
        batch_domain = batch.domain or host_domain or "unknown"

        norm_events: list[AnalyticsEvent] = []
        for e in batch.events:
            d = cast(AnalyticsEvent, e.model_dump())

            if not d.get("storyId"):
                d["storyId"] = batch.storyId
            if not d.get("ts"):
                d["ts"] = now_ms
            if not d.get("id"):
                d["id"] = f"{d['sessionId']}:{d.get('t', 'evt')}:{d['ts']}"

            props = d.get("props") or {}
            rid = d.get("runId") or d.get("rid") or props.get("runId") or props.get("rid")
            if rid:
                d["runId"] = str(rid)
                props["runId"] = str(rid)
            if d.get("runId") and not props.get("runId"):
                props["runId"] = str(d["runId"])
            d["props"] = props

            if not isinstance(props, dict):
                props = {}
            if not props.get("domain"):
                props["domain"] = batch_domain
            d["props"] = props
            norm_events.append(d)

        output_dir = story_analytics_dir(batch.storyId)
        by_day: dict[str, list[AnalyticsEvent]] = {}
        for obj in norm_events:
            day = datetime.utcfromtimestamp(obj["ts"] / 1000.0).strftime("%Y-%m-%d")
            by_day.setdefault(day, []).append(obj)

        written_total = 0
        written_files: list[str] = []
        for day, events in by_day.items():
            out_path = os.path.join(output_dir, f"{day}.jsonl")
            with open(out_path, "a", encoding="utf-8") as f:
                header: AnalyticsBatchHeader = {
                    "_type": "batch_header",
                    "ts": datetime.utcnow().isoformat() + "Z",
                    "storyId": batch.storyId,
                    "userId": batch.userId,
                    "device": batch.device or {},
                    "domain": batch_domain,
                    "count": len(events),
                }
                f.write(json.dumps(header, ensure_ascii=False) + "\n")
                for obj in events:
                    f.write(json.dumps(obj, ensure_ascii=False) + "\n")

            written_total += len(events)
            written_files.append(f"{batch.storyId}/{day}.jsonl")

        return {"ok": True, "written": written_total, "files": written_files}
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


def list_days(story_id: str) -> dict[str, JSONValue]:
    d = story_analytics_dir(story_id)
    files = sorted([f for f in os.listdir(d) if f.endswith(".jsonl")])
    days = [f[:-6] for f in files]
    return {"storyId": story_id, "days": days}


def get_day(story_id: str, day: str) -> dict[str, JSONValue]:
    d = story_analytics_dir(story_id)
    path = os.path.join(d, f"{day}.jsonl")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Not found")
    with open(path, "r", encoding="utf-8") as f:
        return {"storyId": story_id, "day": day, "lines": f.read().splitlines()}


def rollup_day(story_id: str, day: str) -> dict[str, JSONValue]:
    d = story_analytics_dir(story_id)
    path = os.path.join(d, f"{day}.jsonl")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Not found")

    sessions: set[str] = set()
    users: set[str] = set()
    pages: set[str] = set()

    def _puzzle_by_kind() -> dict[str, dict[str, int]]:
        return {
            "riddle": {"tries": 0, "solved": 0},
            "runes": {"tries": 0, "solved": 0},
            "unknown": {"tries": 0, "solved": 0},
        }

    counters = {
        "pageViews": 0,
        "choices": 0,
        "puzzles": {"tries": 0, "solved": 0, "byKind": _puzzle_by_kind()},
        "runes": 0,
        "mediaStarts": 0,
        "mediaStops": 0,
        "completions": 0,
    }
    page_views: dict[str, int] = {}
    domains: dict[str, dict[str, object]] = {}

    def ensure_domain(dom: str) -> dict[str, object]:
        existing = domains.get(dom)
        if existing:
            return existing
        agg = {
            "domain": dom,
            "sessionsSet": set(),
            "usersSet": set(),
            "runsSet": set(),
            "totals": {
                "pageViews": 0,
                "choices": 0,
                "puzzles": {"tries": 0, "solved": 0, "byKind": _puzzle_by_kind()},
                "runes": 0,
                "mediaStarts": 0,
                "mediaStops": 0,
                "completions": 0,
            },
        }
        domains[dom] = agg
        return agg

    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = (line or "").strip()
            if not line:
                continue

            obj = cast(dict[str, JSONValue], json.loads(line))
            if obj.get("_type") == "batch_header":
                uid_hdr = obj.get("userId")
                if uid_hdr:
                    users.add(str(uid_hdr))
                continue

            t = obj.get("t")
            session_id = obj.get("sessionId")
            page_id = obj.get("pageId")
            props = obj.get("props") or {}
            if not isinstance(props, dict):
                props = {}

            dom = props.get("domain") or obj.get("domain") or "unknown"
            dom_agg = ensure_domain(str(dom))

            rid = obj.get("runId") or props.get("runId") or obj.get("rid") or props.get("rid")
            uid = props.get("userId")
            if uid:
                users.add(str(uid))

            if session_id:
                sessions.add(str(session_id))
                dom_agg["sessionsSet"].add(str(session_id))
            if page_id:
                pages.add(str(page_id))
            if uid:
                dom_agg["usersSet"].add(str(uid))
            if rid:
                dom_agg["runsSet"].add(str(rid))

            if t == "page_enter":
                counters["pageViews"] += 1
                dom_agg["totals"]["pageViews"] += 1
                if page_id:
                    pid = str(page_id)
                    page_views[pid] = page_views.get(pid, 0) + 1
            elif t == "choice_select":
                counters["choices"] += 1
                dom_agg["totals"]["choices"] += 1
            elif t == "puzzle_try":
                counters["puzzles"]["tries"] += 1
                dom_agg["totals"]["puzzles"]["tries"] += 1
                kind = (props.get("kind") or "unknown").strip() or "unknown"
                if kind not in counters["puzzles"]["byKind"]:
                    counters["puzzles"]["byKind"][kind] = {"tries": 0, "solved": 0}
                counters["puzzles"]["byKind"][kind]["tries"] += 1
                if kind not in dom_agg["totals"]["puzzles"]["byKind"]:
                    dom_agg["totals"]["puzzles"]["byKind"][kind] = {"tries": 0, "solved": 0}
                dom_agg["totals"]["puzzles"]["byKind"][kind]["tries"] += 1
            elif t == "puzzle_result":
                if props.get("isCorrect"):
                    counters["puzzles"]["solved"] += 1
                    dom_agg["totals"]["puzzles"]["solved"] += 1
                kind = (props.get("kind") or "unknown").strip() or "unknown"
                if kind not in counters["puzzles"]["byKind"]:
                    counters["puzzles"]["byKind"][kind] = {"tries": 0, "solved": 0}
                if props.get("isCorrect"):
                    counters["puzzles"]["byKind"][kind]["solved"] += 1
                if kind not in dom_agg["totals"]["puzzles"]["byKind"]:
                    dom_agg["totals"]["puzzles"]["byKind"][kind] = {"tries": 0, "solved": 0}
                if props.get("isCorrect"):
                    dom_agg["totals"]["puzzles"]["byKind"][kind]["solved"] += 1
            elif t == "rune_unlock":
                counters["runes"] += 1
                dom_agg["totals"]["runes"] += 1
            elif t == "media_start":
                counters["mediaStarts"] += 1
                dom_agg["totals"]["mediaStarts"] += 1
            elif t == "media_stop":
                counters["mediaStops"] += 1
                dom_agg["totals"]["mediaStops"] += 1
            elif t in ("game_complete", "game:complete"):
                counters["completions"] += 1
                dom_agg["totals"]["completions"] += 1

    top_pages = sorted(page_views.items(), key=lambda kv: kv[1], reverse=True)[:10]
    domains_out = []
    for dom, agg in domains.items():
        domains_out.append(
            {
                "domain": dom,
                "sessions": len(agg["sessionsSet"]),
                "users": len(agg["usersSet"]),
                "runs": len(agg["runsSet"]),
                "totals": agg["totals"],
            }
        )
    domains_out.sort(key=lambda x: x["sessions"], reverse=True)

    return {
        "storyId": story_id,
        "day": day,
        "sessions": len(sessions),
        "users": len(users),
        "pages": len(pages),
        "totals": counters,
        "topPages": [{"pageId": k, "views": v} for k, v in top_pages],
        "domains": domains_out,
    }


def _daterange(start_date: datetime, end_date: datetime):
    cur = start_date
    while cur <= end_date:
        yield cur
        cur = cur + timedelta(days=1)


def _safe_parse_jsonl_line(line: str) -> dict[str, JSONValue] | None:
    line = (line or "").strip()
    if not line:
        return None
    try:
        return json.loads(line)
    except Exception:
        return None


def rollup_range(
    story_id: str,
    _from: str,
    _to: str,
    terminal: str | None = None,
) -> dict[str, JSONValue]:
    dropoff_after_ms = 180_000
    now_ms = int(datetime.utcnow().timestamp() * 1000)
    # #region agent log
    def _debug_log(message: str, data: dict[str, object], hypothesis_id: str) -> None:
        try:
            with open(r"c:\Users\csorg\Desktop\MarketingTool\debug-84b9bb.log", "a", encoding="utf-8") as lf:
                lf.write(
                    json.dumps(
                        {
                            "sessionId": "84b9bb",
                            "runId": "pre-fix",
                            "hypothesisId": hypothesis_id,
                            "location": "backend/services/analytics.py:rollup_range",
                            "message": message,
                            "data": data,
                            "timestamp": int(datetime.utcnow().timestamp() * 1000),
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
        except Exception:
            pass
    # #endregion
    d = story_analytics_dir(story_id)
    # #region agent log
    _debug_log(
        "rollup_range invoked",
        {"storyId": story_id, "from": _from, "to": _to, "terminal": terminal, "analyticsDir": d},
        "H2",
    )
    # #endregion
    try:
        start = datetime.strptime(_from, "%Y-%m-%d")
        end = datetime.strptime(_to, "%Y-%m-%d")
        if end < start:
            raise HTTPException(status_code=400, detail="'to' korábbi mint 'from'")
    except ValueError:
        raise HTTPException(status_code=400, detail="Dátum formátum: YYYY-MM-DD")

    terminal_pages: set[str] = set()
    if terminal:
        terminal_pages = {p.strip() for p in terminal.split(",") if p.strip()}

    def _is_end_page_id(pid: str, end_flags_for_run: dict[str, bool]) -> bool:
        if not pid:
            return False
        s = str(pid)
        if end_flags_for_run.get(s):
            return True
        if s == "__END__":
            return True
        if s.startswith("END_") or s.startswith("END__"):
            return True
        if s.startswith("end_") or s.startswith("end__"):
            return True
        if terminal_pages and s in terminal_pages:
            return True
        return False

    per_session_events: dict[str, list[dict[str, object]]] = {}
    per_run_events: dict[str, list[dict[str, object]]] = {}
    session_user: dict[str, str] = {}
    run_user: dict[str, str] = {}
    run_session: dict[str, str] = {}
    sessions_all: set[str] = set()
    users_all: set[str] = set()
    runs_all: set[str] = set()
    dau: dict[str, dict[str, set[str]]] = {}
    page_views: dict[str, int] = {}
    page_sessions: dict[str, set[str]] = {}
    choice_counts: dict[str, dict[str, int]] = {}
    exits_after_page: dict[str, int] = {}
    drop_offs: dict[str, dict[str, object]] = {}

    def _puzzles_totals() -> dict[str, object]:
        return {
            "tries": 0,
            "solved": 0,
            "byKind": {
                "riddle": {"tries": 0, "solved": 0},
                "runes": {"tries": 0, "solved": 0},
                "unknown": {"tries": 0, "solved": 0},
            },
        }

    totals = {
        "pageViews": 0,
        "choices": 0,
        "puzzles": _puzzles_totals(),
        "runes": 0,
        "mediaStarts": 0,
        "mediaStops": 0,
        "ctaShown": 0,
        "ctaClicks": 0,
        "completions": 0,
    }

    end_pages: dict[str, dict[str, object]] = {}
    outcomes: dict[str, dict[str, object]] = {}
    paths: dict[str, dict[str, object]] = {}
    step_transitions: dict[str, dict[str, set[str]]] = {}
    completed_sessions = 0
    total_session_duration = 0
    completed_runs = 0
    domains: dict[str, dict[str, object]] = {}

    def ensure_domain(dom: str) -> dict[str, object]:
        existing = domains.get(dom)
        if existing:
            return existing
        agg = {
            "domain": dom,
            "sessionsSet": set(),
            "usersSet": set(),
            "runsSet": set(),
            "totals": {
                "pageViews": 0,
                "choices": 0,
                "puzzles": _puzzles_totals(),
                "runes": 0,
                "mediaStarts": 0,
                "mediaStops": 0,
                "ctaShown": 0,
                "ctaClicks": 0,
                "completions": 0,
            },
        }
        domains[dom] = agg
        return agg

    runes_option_counts: dict[str, int] = {}
    runes_solved_attempts: list[int] = []
    runes_solved_by_attempt: dict[int, int] = {}
    riddle_retries_per_run: list[float] = []
    riddle_wrong_by_page: dict[str, int] = {}
    riddle_run_tries: int = 0
    riddle_run_solved: int = 0

    for day_dt in _daterange(start, end):
        day = day_dt.strftime("%Y-%m-%d")
        path = os.path.join(d, f"{day}.jsonl")
        if not os.path.exists(path):
            continue

        dau.setdefault(day, {"users": set(), "sessions": set()})
        with open(path, "r", encoding="utf-8") as f:
            for raw in f:
                obj = _safe_parse_jsonl_line(raw)
                if not obj:
                    continue

                if obj.get("_type") == "batch_header":
                    uid_hdr = obj.get("userId")
                    if uid_hdr:
                        users_all.add(str(uid_hdr))
                        dau[day]["users"].add(str(uid_hdr))
                    continue

                t = obj.get("t")
                ts = obj.get("ts")
                props = cast(AnalyticsProps, obj.get("props") or {})
                if not isinstance(props, dict):
                    props = {}

                dom = props.get("domain") or obj.get("domain") or "unknown"
                dom_agg = ensure_domain(str(dom))

                sid = (
                    obj.get("sessionId")
                    or props.get("sessionId")
                    or obj.get("sid")
                    or props.get("sid")
                )
                pid = (
                    obj.get("pageId")
                    or props.get("pageId")
                    or obj.get("page")
                    or props.get("page")
                    or obj.get("pg")
                    or props.get("pg")
                )
                rid = (
                    obj.get("runId")
                    or props.get("runId")
                    or obj.get("rid")
                    or props.get("rid")
                )
                uid2 = props.get("userId")

                if sid:
                    sessions_all.add(str(sid))
                    dau[day]["sessions"].add(str(sid))
                    dom_agg["sessionsSet"].add(str(sid))
                if uid2:
                    users_all.add(str(uid2))
                    dau[day]["users"].add(str(uid2))
                    dom_agg["usersSet"].add(str(uid2))
                    if sid and str(sid) not in session_user:
                        session_user[str(sid)] = str(uid2)
                if rid:
                    runs_all.add(str(rid))
                    dom_agg["runsSet"].add(str(rid))
                    if uid2 and str(rid) not in run_user:
                        run_user[str(rid)] = str(uid2)
                    if sid and str(rid) not in run_session:
                        run_session[str(rid)] = str(sid)

                if t == "page_enter":
                    totals["pageViews"] += 1
                    dom_agg["totals"]["pageViews"] += 1
                    if pid:
                        pid_s = str(pid)
                        page_views[pid_s] = page_views.get(pid_s, 0) + 1
                        page_sessions.setdefault(pid_s, set()).add(
                            str(sid) if sid else f"__nosession_{ts}"
                        )
                elif t == "choice_select":
                    totals["choices"] += 1
                    dom_agg["totals"]["choices"] += 1
                    cid_raw = props.get("choiceId") or props.get("id") or props.get("choice_id")
                    cid = str(cid_raw).strip() if cid_raw is not None else ""
                    if not cid:
                        nxt = props.get("nextPageId") or props.get("next")
                        if nxt is not None and str(nxt).strip():
                            cid = f"next:{str(nxt).strip()}"
                    pid_use = pid or obj.get("refPageId")
                    if pid_use and cid:
                        pid_s = str(pid_use)
                        choice_counts.setdefault(pid_s, {})
                        choice_counts[pid_s][cid] = choice_counts[pid_s].get(cid, 0) + 1
                elif t == "puzzle_try":
                    kind = (props.get("kind") or "unknown").strip() or "unknown"
                    if kind != "riddle":
                        totals["puzzles"]["tries"] += 1
                        dom_agg["totals"]["puzzles"]["tries"] += 1
                        totals["puzzles"]["byKind"].setdefault(kind, {"tries": 0, "solved": 0})["tries"] += 1
                        dom_agg["totals"]["puzzles"]["byKind"].setdefault(
                            kind, {"tries": 0, "solved": 0}
                        )["tries"] += 1
                elif t == "puzzle_result":
                    kind = (props.get("kind") or "unknown").strip() or "unknown"
                    if kind != "riddle":
                        if props.get("isCorrect"):
                            totals["puzzles"]["solved"] += 1
                            dom_agg["totals"]["puzzles"]["solved"] += 1
                        if props.get("isCorrect"):
                            totals["puzzles"]["byKind"].setdefault(kind, {"tries": 0, "solved": 0})["solved"] += 1
                            dom_agg["totals"]["puzzles"]["byKind"].setdefault(
                                kind, {"tries": 0, "solved": 0}
                            )["solved"] += 1
                    if kind == "runes":
                        for label in props.get("pickedLabels") or []:
                            if isinstance(label, str) and label.strip():
                                key = label.strip()[:200]
                                runes_option_counts[key] = runes_option_counts.get(key, 0) + 1
                        if props.get("isCorrect"):
                            attempt = props.get("attempt")
                            a = int(attempt) if attempt is not None else 1
                            runes_solved_attempts.append(a)
                            runes_solved_by_attempt[a] = runes_solved_by_attempt.get(a, 0) + 1
                elif t == "rune_unlock":
                    totals["runes"] += 1
                    dom_agg["totals"]["runes"] += 1
                elif t == "media_start":
                    totals["mediaStarts"] += 1
                    dom_agg["totals"]["mediaStarts"] += 1
                elif t == "media_stop":
                    totals["mediaStops"] += 1
                    dom_agg["totals"]["mediaStops"] += 1
                elif t in ("game_complete", "game:complete"):
                    totals["completions"] += 1
                    dom_agg["totals"]["completions"] += 1
                elif t == "cta_shown":
                    totals["ctaShown"] += 1
                    dom_agg["totals"]["ctaShown"] += 1
                elif t == "cta_click":
                    totals["ctaClicks"] += 1
                    dom_agg["totals"]["ctaClicks"] += 1

                if sid:
                    per_session_events.setdefault(str(sid), []).append(
                        {"t": t, "ts": ts, "pageId": pid, "props": props, "day": day, "rid": rid}
                    )
                if rid:
                    per_run_events.setdefault(str(rid), []).append(
                        {"t": t, "ts": ts, "pageId": pid, "props": props, "day": day, "sid": sid}
                    )

    for sid, evs in per_session_events.items():
        if not evs:
            continue

        evs.sort(key=lambda e: (e.get("ts") or 0, e.get("t") or ""))
        first_ts = evs[0].get("ts") or 0
        last_ts = evs[-1].get("ts") or first_ts

        if isinstance(first_ts, str):
            try:
                first_ts = int(first_ts)
            except Exception:
                first_ts = 0
        if isinstance(last_ts, str):
            try:
                last_ts = int(last_ts)
            except Exception:
                last_ts = first_ts

        total_session_duration += max(0, last_ts - first_ts)
        has_complete_event = any(e.get("t") in ("game_complete", "game:complete") for e in evs)

        saw_terminal = False
        if terminal_pages:
            for e in evs:
                if (e.get("t") == "page_enter") and (e.get("pageId") in terminal_pages):
                    saw_terminal = True
                    break

        if has_complete_event or saw_terminal:
            completed_sessions += 1

        last_page_enter = None
        for e in reversed(evs):
            if e.get("t") == "page_enter" and e.get("pageId"):
                last_page_enter = e.get("pageId")
                break
        if last_page_enter:
            exits_after_page[str(last_page_enter)] = exits_after_page.get(str(last_page_enter), 0) + 1

    session_run_counts: dict[str, int] = {}
    for rid_key, sid_val in run_session.items():
        if sid_val:
            sk = str(sid_val)
            session_run_counts[sk] = session_run_counts.get(sk, 0) + 1

    session_restart_ts: dict[str, list[int]] = {}
    restart_from_run_ids: set[str] = set()
    for sid_s, sess_evs in per_session_events.items():
        for e in sess_evs:
            if e.get("t") != "ui_click":
                continue
            props = e.get("props") or {}
            if not isinstance(props, dict):
                continue
            ctrl = str(props.get("control") or "").lower()
            rfrom = props.get("restartFromRunId")
            if rfrom:
                restart_from_run_ids.add(str(rfrom))
            if "restart" not in ctrl:
                continue
            ts_val = e.get("ts") or 0
            try:
                ts_val = int(ts_val)
            except (TypeError, ValueError):
                ts_val = 0
            session_restart_ts.setdefault(str(sid_s), []).append(ts_val)

    restart_total_runs = 0
    restart_runs_with = 0
    restart_completed_with = 0
    restart_completed_without = 0
    stale_non_completed_runs = 0
    missing_drop_page_runs = 0
    path_conv: dict[str, dict[str, object]] = {}
    end_type_dist: dict[str, dict[str, object]] = {}

    for rid, evs in per_run_events.items():
        if not evs:
            continue

        evs.sort(key=lambda e: (e.get("ts") or 0, e.get("t") or ""))
        riddle_evs = [
            e
            for e in evs
            if e.get("t") == "puzzle_result" and (e.get("props") or {}).get("kind") == "riddle"
        ]
        if riddle_evs:
            by_page: dict[str, dict[str, object]] = {}
            for e in riddle_evs:
                pid = e.get("pageId") or (e.get("props") or {}).get("puzzleId")
                if pid is None or pid == "":
                    continue
                by_page[str(pid)] = e
            if by_page:
                riddle_run_tries += 1
                attempt_vals = []
                for p, e in by_page.items():
                    a = (e.get("props") or {}).get("attempt")
                    attempt_vals.append(int(a) if a is not None else 1)
                retries_sum = sum(max(0, a - 1) for a in attempt_vals)
                riddle_retries_per_run.append(retries_sum / len(by_page))
                has_wrong = any((e.get("props") or {}).get("isCorrect") is False for e in by_page.values())
                if not has_wrong:
                    riddle_run_solved += 1
                if has_wrong:
                    for pid, e in by_page.items():
                        if (e.get("props") or {}).get("isCorrect") is False:
                            riddle_wrong_by_page[pid] = riddle_wrong_by_page.get(pid, 0) + 1

        uid_run = run_user.get(rid)
        sid_run = run_session.get(rid)
        restart_total_runs += 1

        seq: list[str] = []
        end_flags_for_run: dict[str, bool] = {}
        for e in evs:
            t_e = e.get("t")
            if t_e == "page_enter" and e.get("pageId"):
                pid2 = str(e["pageId"])
                if not seq or seq[-1] != pid2:
                    seq.append(pid2)
                props_e = e.get("props") or {}
                if isinstance(props_e, dict) and props_e.get("isEnd"):
                    end_flags_for_run[pid2] = True

        completed = False
        end_alias = None
        end_props: dict[str, object] | None = None
        for e in evs:
            if e.get("t") in ("game_complete", "game:complete"):
                completed = True
                pa = e.get("props") or {}
                if isinstance(pa, dict) and pa.get("endAlias"):
                    end_alias = str(pa["endAlias"])
                if isinstance(pa, dict):
                    end_props = pa
                break

        if completed:
            completed_runs += 1

        final_page_id = str(seq[-1]) if seq else None
        outcome_id = str(end_alias) if end_alias else final_page_id
        final_is_end = bool(final_page_id and _is_end_page_id(str(final_page_id), end_flags_for_run))

        first_ts_run = 0
        if evs:
            try:
                first_ts_run = min(int(e.get("ts") or 0) for e in evs)
            except (TypeError, ValueError):
                first_ts_run = 0
        has_restart_click_in_run = any(
            e.get("t") == "ui_click"
            and isinstance(e.get("props"), dict)
            and "restart" in str((e.get("props") or {}).get("control") or "").lower()
            for e in evs
        )
        has_restart_run_start_marker = any(
            e.get("t") == "ui_click"
            and isinstance(e.get("props"), dict)
            and str((e.get("props") or {}).get("control") or "").lower() == "run_start"
            and str((e.get("props") or {}).get("trigger") or "").lower() == "restart"
            for e in evs
        )
        run_has_restart = bool(
            str(rid) in restart_from_run_ids
            or has_restart_click_in_run
            or has_restart_run_start_marker
        ) or bool(
            sid_run
            and any(restart_ts < first_ts_run for restart_ts in session_restart_ts.get(str(sid_run), []))
        )
        if run_has_restart:
            restart_runs_with += 1
            if completed:
                restart_completed_with += 1
        else:
            if completed:
                restart_completed_without += 1

        cta_shown_events_run = sum(1 for e in evs if e.get("t") == "cta_shown")
        cta_shown_run = 1 if cta_shown_events_run > 0 else 0
        cta_click_run = sum(1 for e in evs if e.get("t") == "cta_click")
        is_terminal_end = bool(final_page_id and terminal_pages and str(final_page_id) in terminal_pages)
        is_outcome = bool(outcome_id and (completed or is_terminal_end))

        if is_outcome:
            ep = end_pages.setdefault(
                str(outcome_id),
                {
                    "pageId": str(outcome_id),
                    "runsSet": set(),
                    "usersSet": set(),
                    "sessionsSet": set(),
                    "ctaShown": 0,
                    "ctaClicks": 0,
                },
            )
            ep["runsSet"].add(str(rid))
            if uid_run:
                ep["usersSet"].add(str(uid_run))
            if sid_run:
                ep["sessionsSet"].add(str(sid_run))
            ep["ctaShown"] += int(cta_shown_run)
            ep["ctaClicks"] += int(cta_click_run)

            oc = outcomes.setdefault(
                str(outcome_id),
                {
                    "outcomeId": str(outcome_id),
                    "runsSet": set(),
                    "usersSet": set(),
                    "ctaShown": 0,
                    "ctaClicks": 0,
                },
            )
            oc["runsSet"].add(str(rid))
            if uid_run:
                oc["usersSet"].add(str(uid_run))
            oc["ctaShown"] += int(cta_shown_run)
            oc["ctaClicks"] += int(cta_click_run)

            if final_is_end and seq:
                end_type_val: str | None = None
                if end_props and isinstance(end_props, dict):
                    et = end_props.get("endType")
                    if isinstance(et, str) and et.strip():
                        end_type_val = et.strip()
                if not end_type_val:
                    end_type_val = str(seq[-1])
                if end_type_val:
                    etd = end_type_dist.setdefault(end_type_val, {"id": end_type_val, "count": 0})
                    etd["count"] += 1

        for i in range(len(seq) - 1):
            step_id = seq[i]
            nxt = seq[i + 1]
            step_transitions.setdefault(step_id, {}).setdefault(nxt, set()).add(str(rid))

        if seq:
            if not is_outcome or not final_page_id:
                continue
            if terminal_pages and str(final_page_id) not in terminal_pages:
                continue

            full_path_id = " > ".join(seq)
            pc = path_conv.setdefault(full_path_id, {"pathId": full_path_id, "runs": 0, "endRuns": 0})
            pc["runs"] += 1
            if final_is_end:
                pc["endRuns"] += 1

            seq_key = (seq[:20] + ["…"] + seq[-4:]) if len(seq) > 25 else seq
            path_id = " > ".join(seq_key)
            p = paths.setdefault(
                path_id,
                {
                    "pathId": path_id,
                    "runs": 0,
                    "usersSet": set(),
                    "topOutcomeCounts": {},
                    "ctaShown": 0,
                    "ctaClicks": 0,
                },
            )
            p["runs"] += 1
            if uid_run:
                p["usersSet"].add(str(uid_run))
            endp = str(outcome_id)
            p["topOutcomeCounts"][endp] = p["topOutcomeCounts"].get(endp, 0) + 1
            p["ctaShown"] += int(cta_shown_run)
            p["ctaClicks"] += int(cta_click_run)

        last_enter = None
        for e in reversed(evs):
            if e.get("t") == "page_enter" and e.get("pageId"):
                last_enter = str(e["pageId"])
                break
        last_page_any = None
        for e in reversed(evs):
            pid_any = e.get("pageId")
            if pid_any:
                last_page_any = str(pid_any)
                break

        last_ts_run = 0
        for e in evs:
            ts_val = e.get("ts")
            try:
                ts_i = int(ts_val) if ts_val is not None else 0
            except (TypeError, ValueError):
                ts_i = 0
            if ts_i > last_ts_run:
                last_ts_run = ts_i

        is_terminal = bool(final_is_end or (last_enter and terminal_pages and last_enter in terminal_pages))
        is_stale_run = bool(last_ts_run and (now_ms - last_ts_run >= dropoff_after_ms))
        drop_page = last_enter or last_page_any
        if (not completed) and is_stale_run:
            stale_non_completed_runs += 1
            if not drop_page:
                missing_drop_page_runs += 1
        if drop_page and (not completed) and (not is_terminal) and is_stale_run:
            dd = drop_offs.setdefault(drop_page, {"pageId": drop_page, "runsSet": set()})
            dd["runsSet"].add(str(rid))

    session_count = len(sessions_all)
    user_count = len(users_all)
    run_count = len(runs_all)
    avg_runs_per_user = (run_count / user_count) if user_count else 0.0
    avg_session_ms = int(round(total_session_duration / session_count)) if session_count else 0
    completion_rate = (completed_runs / run_count) if run_count else 0.0
    puzzle_success_rate = (
        (totals["puzzles"]["solved"] / totals["puzzles"]["tries"])
        if totals["puzzles"]["tries"] > 0
        else 0.0
    )
    cta_ctr = (totals["ctaClicks"] / totals["ctaShown"]) if totals["ctaShown"] else 0.0

    dau_series = []
    for day in sorted(dau.keys()):
        dau_series.append({"day": day, "users": len(dau[day]["users"]), "sessions": len(dau[day]["sessions"])})

    pages_out = []
    for pid, views in sorted(page_views.items(), key=lambda kv: kv[1], reverse=True):
        uniq = len(page_sessions.get(pid, set()))
        exits = exits_after_page.get(pid, 0)
        exit_rate = (exits / uniq) if uniq else 0.0
        pages_out.append(
            {
                "pageId": pid,
                "views": views,
                "uniqueSessions": uniq,
                "exitsAfterPage": exits,
                "exitRate": round(exit_rate, 4),
            }
        )

    choices_out = []
    for pid, counters in choice_counts.items():
        if not counters:
            continue
        choices_out.append(
            {
                "pageId": pid,
                "choices": [
                    {"choiceId": cid, "count": n}
                    for cid, n in sorted(counters.items(), key=lambda kv: kv[1], reverse=True)
                ],
            }
        )
    choices_out.sort(key=lambda x: sum(c["count"] for c in x["choices"]), reverse=True)

    end_pages_out = []
    for pid, v in end_pages.items():
        end_pages_out.append(
            {
                "pageId": pid,
                "runs": len(v["runsSet"]),
                "users": len(v["usersSet"]),
                "ctaShown": v["ctaShown"],
                "ctaClicks": v["ctaClicks"],
            }
        )
    end_pages_out.sort(key=lambda x: x["runs"], reverse=True)

    outcomes_out = []
    for oid, v in outcomes.items():
        outcomes_out.append(
            {
                "outcomeId": oid,
                "runs": len(v["runsSet"]),
                "users": len(v["usersSet"]),
                "ctaShown": v["ctaShown"],
                "ctaClicks": v["ctaClicks"],
            }
        )
    outcomes_out.sort(key=lambda x: x["runs"], reverse=True)

    paths_out = []
    for path_id, v in paths.items():
        top_outcome = None
        if v.get("topOutcomeCounts"):
            top_outcome = max(v["topOutcomeCounts"].items(), key=lambda kv: kv[1])[0]
        paths_out.append(
            {
                "pathId": path_id,
                "runs": v["runs"],
                "users": len(v["usersSet"]),
                "topOutcomeId": top_outcome,
                "ctaShown": v["ctaShown"],
                "ctaClicks": v["ctaClicks"],
            }
        )
    paths_out.sort(key=lambda x: x["runs"], reverse=True)
    paths_out = paths_out[:20]

    steps_out = []
    for step_id, next_map in step_transitions.items():
        opts = [{"value": nxt, "runs": len(rids)} for nxt, rids in next_map.items()]
        opts.sort(key=lambda x: x["runs"], reverse=True)
        steps_out.append({"stepId": step_id, "stepType": "logic", "options": opts[:12]})
    steps_out.sort(key=lambda x: sum(o["runs"] for o in x["options"]), reverse=True)
    steps_out = steps_out[:30]

    domains_out = []
    for dom, v in domains.items():
        domains_out.append(
            {
                "domain": dom,
                "sessions": len(v["sessionsSet"]),
                "users": len(v["usersSet"]),
                "runs": len(v["runsSet"]),
                "totals": v["totals"],
            }
        )
    domains_out.sort(key=lambda x: x["sessions"], reverse=True)

    drop_offs_out = []
    for page_id, v in drop_offs.items():
        drop_offs_out.append({"pageId": page_id, "dropOffRuns": len(v["runsSet"])})
    drop_offs_out.sort(key=lambda x: x["dropOffRuns"], reverse=True)
    drop_offs_out = drop_offs_out[:20]

    path_conversion_out = []
    for v in path_conv.values():
        total_r = int(v.get("runs") or 0)
        end_r = int(v.get("endRuns") or 0)
        rate = (end_r / total_r) if total_r else 0.0
        path_conversion_out.append(
            {
                "pathId": v["pathId"],
                "runs": total_r,
                "endRuns": end_r,
                "conversionRate": round(rate, 4),
            }
        )
    path_conversion_out.sort(key=lambda x: x["runs"], reverse=True)
    # #region agent log
    _debug_log(
        "rollup_range computed summary",
        {
            "storyId": story_id,
            "runCount": run_count,
            "completedRuns": completed_runs,
            "outcomesCount": len(outcomes_out),
            "dropOffCount": len(drop_offs_out),
            "staleNonCompletedRuns": stale_non_completed_runs,
            "missingDropPageRuns": missing_drop_page_runs,
            "dropoffAfterMs": dropoff_after_ms,
        },
        "H3",
    )
    # #endregion

    no_restart_runs = restart_total_runs - restart_runs_with
    completion_with_restart = restart_completed_with / restart_runs_with if restart_runs_with else 0.0
    completion_without_restart = restart_completed_without / no_restart_runs if no_restart_runs else 0.0
    restart_stats = {
        "totalRuns": restart_total_runs,
        "runsWithRestart": restart_runs_with,
        "completionRateWithRestart": round(completion_with_restart, 4),
        "completionRateWithoutRestart": round(completion_without_restart, 4),
    }

    end_dist_out = []
    total_end = sum(int(v.get("count") or 0) for v in end_type_dist.values())
    for et_id, v in end_type_dist.items():
        cnt = int(v.get("count") or 0)
        share = (cnt / total_end) if total_end else 0.0
        end_dist_out.append({"id": et_id, "count": cnt, "share": round(share, 4)})
    end_dist_out.sort(key=lambda x: x["count"], reverse=True)

    puzzle_runes_top_options: list[dict[str, object]] = []
    for label, cnt in sorted(runes_option_counts.items(), key=lambda kv: kv[1], reverse=True)[:2]:
        puzzle_runes_top_options.append({"label": label, "count": cnt})
    runes_avg_attempt_when_solved = (
        sum(runes_solved_attempts) / len(runes_solved_attempts) if runes_solved_attempts else None
    )
    runes_solved_by_attempt_out: list[dict[str, object]] = []
    for a in sorted(runes_solved_by_attempt.keys()):
        runes_solved_by_attempt_out.append({"attempt": a, "count": runes_solved_by_attempt[a]})

    totals["puzzles"]["byKind"]["riddle"] = {"tries": riddle_run_tries, "solved": riddle_run_solved}
    riddle_avg_retries = (
        sum(riddle_retries_per_run) / len(riddle_retries_per_run) if riddle_retries_per_run else 0.0
    )
    total_wrong = sum(riddle_wrong_by_page.values())
    riddle_wrong_by_question_out: list[dict[str, object]] = []
    for pid, cnt in sorted(riddle_wrong_by_page.items(), key=lambda kv: kv[1], reverse=True):
        pct = (cnt / total_wrong) if total_wrong else 0.0
        riddle_wrong_by_question_out.append({"pageId": pid, "count": cnt, "pct": round(pct, 4)})

    return {
        "storyId": story_id,
        "from": _from,
        "to": _to,
        "dropOffs": drop_offs_out,
        "sessions": session_count,
        "users": user_count,
        "runs": run_count,
        "totals": totals,
        "puzzleRunesTopOptions": puzzle_runes_top_options,
        "puzzleRunesStats": {
            "avgAttemptWhenSolved": round(runes_avg_attempt_when_solved, 2)
            if runes_avg_attempt_when_solved is not None
            else None,
            "solvedByAttempt": runes_solved_by_attempt_out,
        },
        "riddleStats": {
            "avgRetriesPerRun": round(riddle_avg_retries, 4),
            "runsWithRiddle": len(riddle_retries_per_run),
            "wrongByQuestion": riddle_wrong_by_question_out,
        },
        "kpis": {
            "completionRate": round(completion_rate, 4),
            "avgSessionDurationMs": avg_session_ms,
            "puzzleSuccessRate": round(puzzle_success_rate, 4),
            "ctaCtr": round(cta_ctr, 4),
            "avgRunsPerUser": round(avg_runs_per_user, 4),
        },
        "dau": dau_series,
        "pages": pages_out,
        "choices": choices_out,
        "paths": paths_out,
        "steps": steps_out,
        "endPages": end_pages_out,
        "outcomes": outcomes_out,
        "domains": domains_out,
        "pathConversion": path_conversion_out,
        "restartStats": restart_stats,
        "endDistribution": end_dist_out,
        "notes": {
            "completion": "completionRate run-alapú (game_complete / game:complete alapján). Terminal listát a dropoff/exit értelmezéshez használjuk.",
            "exitAfterPage": "Az adott időszakban session-önként az utolsó page_enter oldalt számoljuk exitként.",
            "paths": "Paths/steps/endPages/outcomes run-on belüli page_enter sorrendből épülnek.",
            "ctaShown": "endPages/outcomes/paths ctaShown mező run-szintű (egy run-ban max 1), a totals.ctaShown esemény-szintű marad.",
            "dropOffs": "Drop-off akkor számolódik, ha a run nem completed, nem terminal, és az utolsó run-esemény óta legalább 180 mp eltelt. Page fallback: utolsó page_enter, különben utolsó pageId-es event.",
        },
    }
