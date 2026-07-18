"""SQLite-alapú perzisztens állapot az onboarding pipeline futásaihoz.

A tervezés alapelvei:

1. **Normalizált, NEM document-style.** A `OnboardingJob` aggregátum egy
   nagy fa, de az attempt-log append-only — egy retry NEM rewrite-olja
   az egész job-rekordot. Külön tábla per Phase output, FK CASCADE
   tisztításhoz.
2. **Pydantic round-trip mindenhol.** A `support_engine.services.onboarding.contracts`
   modellek `model_dump_json()` / `model_validate_json()` formában
   utaznak; a TEXT mezőkben mindig kanonikus JSON van.
3. **Szinkron `sqlite3` stdlib.** Nincs `aiosqlite` — a pipeline offline
   batch, nem real-time API. A `OnboardingStorage` minden hívás végén
   `commit`-tel zár, és minden hívás new connection-on fut (a stdlib
   sqlite3 nem thread-safe konkurens write-ra default módban; a WAL
   journal_mode és a per-call connection a praktikus megoldás).
4. **Idempotent `init_schema`.** A `CREATE TABLE IF NOT EXISTS` és a
   schema-version tábla biztosítja, hogy egy storage-példány bármikor
   "behangolható" — ez a Phase 2 retry-resume-ot is támogatja.
5. **WAL + FK on.** Minden connection beállítja a `journal_mode=WAL` és
   `foreign_keys=ON` pragmákat. A WAL fontos a mostantól tervezett
   read-while-write UI-folyamatokhoz.
6. **A `load_job(job_id)` egy helyen rakja össze a teljes aggregátumot**
   a 7+ táblából. Ez a "deserializálás" határvonala; minden más
   metódus ÍRJA vagy LOLVASSA a részeket.

Schema verziószám: 1. Migrációk később; ha a `onboarding_schema_version`
táblában talált verzió < `_CURRENT_SCHEMA_VERSION`, a `init_schema`
panic-ol (a felhasználó dönt: drop & recreate, vagy migrate). Ez most
egyszerű — a pipeline még nem produktív.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from support_engine.services.onboarding.brief_contracts import (
    BriefExpansionResult,
    SupportChatbotBrief,
)
from support_engine.services.onboarding.contracts import (
    DomainBlueprint,
    NodeGenerationAttempt,
    NodeGenerationOutcome,
    OnboardingJob,
    OnboardingJobStatus,
    RetryConfig,
    SemanticAuditResult,
    StructuralLintResult,
    VendorPolicyKind,
)


_CURRENT_SCHEMA_VERSION = 2


# --------------------------------------------------------------------------- #
# DDL                                                                         #
# --------------------------------------------------------------------------- #


_SCHEMA_DDL: tuple[str, ...] = (
    """
    CREATE TABLE IF NOT EXISTS onboarding_schema_version (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS onboarding_jobs (
        job_id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        status TEXT NOT NULL,
        status_detail TEXT,
        domain_name TEXT NOT NULL,
        target_locale TEXT NOT NULL,
        vendor_policy TEXT NOT NULL,
        vendor_name TEXT,
        research_source_path TEXT,
        retry_config_json TEXT NOT NULL,
        current_node_index INTEGER NOT NULL DEFAULT 0,
        blueprint_error TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS onboarding_blueprints (
        job_id TEXT PRIMARY KEY,
        blueprint_json TEXT NOT NULL,
        saved_at TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES onboarding_jobs(job_id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS onboarding_node_outcomes (
        job_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        final_status TEXT NOT NULL,
        final_node_dict_json TEXT,
        declared_condition_ids_json TEXT NOT NULL,
        exposed_handoff_condition_ids_json TEXT NOT NULL,
        saved_at TEXT NOT NULL,
        PRIMARY KEY (job_id, node_id),
        FOREIGN KEY (job_id) REFERENCES onboarding_jobs(job_id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS onboarding_node_attempts (
        attempt_id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        node_id TEXT NOT NULL,
        attempt_index INTEGER NOT NULL,
        attempt_json TEXT NOT NULL,
        appended_at TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES onboarding_jobs(job_id) ON DELETE CASCADE
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_node_attempts_job_node
        ON onboarding_node_attempts (job_id, node_id, attempt_index)
    """,
    """
    CREATE TABLE IF NOT EXISTS onboarding_structural_lints (
        job_id TEXT PRIMARY KEY,
        lint_json TEXT NOT NULL,
        saved_at TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES onboarding_jobs(job_id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS onboarding_semantic_audits (
        job_id TEXT PRIMARY KEY,
        audit_json TEXT NOT NULL,
        saved_at TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES onboarding_jobs(job_id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS onboarding_final_stories (
        job_id TEXT PRIMARY KEY,
        story_json TEXT NOT NULL,
        version INTEGER NOT NULL,
        saved_at TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES onboarding_jobs(job_id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS onboarding_events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        phase TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload_json TEXT,
        at TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES onboarding_jobs(job_id) ON DELETE CASCADE
    )
    """,
    """
    CREATE INDEX IF NOT EXISTS idx_events_job_at
        ON onboarding_events (job_id, event_id)
    """,
    # ----------------------------------------------------------------- #
    # Schema v2 — brief-driven flow (Phase 0)                            #
    # ----------------------------------------------------------------- #
    """
    CREATE TABLE IF NOT EXISTS onboarding_briefs (
        job_id TEXT PRIMARY KEY,
        brief_json TEXT NOT NULL,
        saved_at TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES onboarding_jobs(job_id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS onboarding_phase0_results (
        job_id TEXT PRIMARY KEY,
        expansion_json TEXT NOT NULL,
        saved_at TEXT NOT NULL,
        FOREIGN KEY (job_id) REFERENCES onboarding_jobs(job_id) ON DELETE CASCADE
    )
    """,
)


# --------------------------------------------------------------------------- #
# Hibák                                                                       #
# --------------------------------------------------------------------------- #


class StorageError(RuntimeError):
    """Storage-szintű hiba (nem-létező job, schema-mismatch, stb.)."""


class JobNotFound(StorageError):
    """A kért `job_id`-vel nem létezik rekord."""


# --------------------------------------------------------------------------- #
# Helper: timestamps                                                          #
# --------------------------------------------------------------------------- #


def _utcnow() -> datetime:
    """Aware UTC `datetime` (microsec-pontossággal)."""
    return datetime.now(timezone.utc)


def _to_iso(dt: datetime) -> str:
    """Datetime → ISO-8601 string (UTC, suffix 'Z' nélkül; aware)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _from_iso(s: str) -> datetime:
    """ISO-8601 string → aware datetime."""
    return datetime.fromisoformat(s)


# --------------------------------------------------------------------------- #
# Storage class                                                               #
# --------------------------------------------------------------------------- #


class OnboardingStorage:
    """Magas-szintű perzisztens API az onboarding pipeline-hoz.

    Egy storage-példány egy SQLite fájlhoz tartozik. Thread-safe a stdlib
    sqlite3 alap-szinten (per-call connection), de NEM tranzakciós
    méretű — azaz egy `save_node_outcome()` + `append_node_attempt()`
    pár NEM egyetlen tranzakcióban fut. A pipeline orchestrator
    feladata, hogy ezeket helyes sorrendben hívja.

    A `:memory:` fájlnév is támogatott (tesztekhez), de figyelem:
    in-memory DB esetén minden új `_connect()` ÚJ adatbázist nyit. A
    teszt fixture-ök ezért shared in-memory URI-val (`file::memory:?cache=shared`)
    használjanak, vagy disk-fájlt egy ideiglenes tmpdir-ben.
    """

    def __init__(self, db_path: str | Path) -> None:
        self._db_path = str(db_path)
        # Egy `OnboardingStorage` példány-hoz tartózkodó WAL fájlokat a hívó
        # közli a tmpdir cleanupjának; itt nincs explicit __del__.

    # ------------------------------------------------------------------ #
    # Connection                                                          #
    # ------------------------------------------------------------------ #

    def _connect(self) -> sqlite3.Connection:
        """Új connection. WAL + FK on minden hívásnál."""
        conn = sqlite3.connect(
            self._db_path,
            uri=self._db_path.startswith("file:"),
            isolation_level=None,  # autocommit; explicit BEGIN/COMMIT-tel kezelünk
            timeout=10.0,
            detect_types=0,
        )
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA synchronous = NORMAL")
        return conn

    # ------------------------------------------------------------------ #
    # Schema lifecycle                                                    #
    # ------------------------------------------------------------------ #

    def init_schema(self) -> None:
        """Idempotens schema-bootstrap, automatikus v1→v2 migrációval.

        Viselkedés:

        * **Friss DB** (verzió rekord nincs): minden DDL lefut, a verzió
          rekord `_CURRENT_SCHEMA_VERSION` (`2`) lesz.
        * **v1 DB** (`onboarding_briefs` + `onboarding_phase0_results` még
          nincs): a `CREATE TABLE IF NOT EXISTS` ezeket idempotensen
          hozzáadja, és a verzió rekordot `2`-re frissíti.
        * **v2 DB**: no-op (minden DDL `IF NOT EXISTS`-szel idempotens).
        * **v >2** vagy ha drop-recreate-re lenne szükség: `StorageError`.

        A migráció csak additív (új táblák + bump). Adatvesztés nincs;
        a v1 időszakban létrejött jobok továbbra is `brief=None` /
        `phase0_result=None` állapotban olvasódnak vissza.
        """
        conn = self._connect()
        try:
            conn.execute("BEGIN")
            for stmt in _SCHEMA_DDL:
                conn.execute(stmt)

            row = conn.execute(
                "SELECT MAX(version) AS v FROM onboarding_schema_version"
            ).fetchone()
            current = row["v"] if row and row["v"] is not None else None
            if current is None:
                conn.execute(
                    "INSERT INTO onboarding_schema_version (version, applied_at) "
                    "VALUES (?, ?)",
                    (_CURRENT_SCHEMA_VERSION, _to_iso(_utcnow())),
                )
            elif current > _CURRENT_SCHEMA_VERSION:
                raise StorageError(
                    f"Schema verzió {current} > {_CURRENT_SCHEMA_VERSION}. "
                    "Az aktuális kódbázis nem tudja kezelni; frissítsd a "
                    "kódot vagy migrálj le."
                )
            elif current < _CURRENT_SCHEMA_VERSION:
                # Additív migráció: a fenti DDL-ek `IF NOT EXISTS`-szel
                # már létrehozták a hiányzó táblákat. Csak a verzió-rekordot
                # kell felülírni.
                conn.execute(
                    "INSERT INTO onboarding_schema_version (version, applied_at) "
                    "VALUES (?, ?)",
                    (_CURRENT_SCHEMA_VERSION, _to_iso(_utcnow())),
                )
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        finally:
            conn.close()

    # ------------------------------------------------------------------ #
    # Job lifecycle                                                       #
    # ------------------------------------------------------------------ #

    def create_job(
        self,
        *,
        job_id: str,
        domain_name: str,
        target_locale: str,
        vendor_policy: VendorPolicyKind = "generic_blended",
        vendor_name: Optional[str] = None,
        research_source_path: Optional[str] = None,
        retry_config: Optional[RetryConfig] = None,
        status: OnboardingJobStatus = "created",
        status_detail: Optional[str] = None,
    ) -> OnboardingJob:
        """Új job létrehozása. A `job_id` egyedi kell legyen.

        Visszaad egy frissen feltöltött `OnboardingJob`-ot (in-memory).
        """
        now = _utcnow()
        rc = retry_config or RetryConfig()
        job = OnboardingJob(
            job_id=job_id,
            created_at=now,
            updated_at=now,
            status=status,
            status_detail=status_detail,
            domain_name=domain_name,
            target_locale=target_locale,
            vendor_policy=vendor_policy,
            vendor_name=vendor_name,
            research_source_path=research_source_path,
            retry_config=rc,
        )
        conn = self._connect()
        try:
            conn.execute(
                """
                INSERT INTO onboarding_jobs (
                    job_id, created_at, updated_at, status, status_detail,
                    domain_name, target_locale, vendor_policy, vendor_name,
                    research_source_path, retry_config_json, current_node_index,
                    blueprint_error
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
                """,
                (
                    job.job_id,
                    _to_iso(job.created_at),
                    _to_iso(job.updated_at),
                    job.status,
                    job.status_detail,
                    job.domain_name,
                    job.target_locale,
                    job.vendor_policy,
                    job.vendor_name,
                    job.research_source_path,
                    rc.model_dump_json(),
                ),
            )
        except sqlite3.IntegrityError as exc:
            raise StorageError(f"job_id '{job_id}' már létezik") from exc
        finally:
            conn.close()
        return job

    def update_job_status(
        self,
        job_id: str,
        status: OnboardingJobStatus,
        *,
        status_detail: Optional[str] = None,
        current_node_index: Optional[int] = None,
        blueprint_error: Optional[str] = None,
    ) -> None:
        """Job status-frissítés. Csak a megadott mezőket írja át."""
        sets: list[str] = ["status = ?", "updated_at = ?"]
        args: list[Any] = [status, _to_iso(_utcnow())]
        if status_detail is not None:
            sets.append("status_detail = ?")
            args.append(status_detail)
        if current_node_index is not None:
            sets.append("current_node_index = ?")
            args.append(current_node_index)
        if blueprint_error is not None:
            sets.append("blueprint_error = ?")
            args.append(blueprint_error)
        args.append(job_id)
        conn = self._connect()
        try:
            cur = conn.execute(
                f"UPDATE onboarding_jobs SET {', '.join(sets)} WHERE job_id = ?",
                args,
            )
            if cur.rowcount == 0:
                raise JobNotFound(job_id)
        finally:
            conn.close()

    def update_job_meta(
        self,
        job_id: str,
        *,
        domain_name: Optional[str] = None,
        target_locale: Optional[str] = None,
        vendor_policy: Optional[VendorPolicyKind] = None,
        vendor_name: Optional[str] = None,
        research_source_path: Optional[str] = None,
    ) -> None:
        """Job-meta frissítés (domain_name, locale, vendor_*, research_source_path).

        A brief-driven flow használja, amikor a user a brief-en módosít
        (pl. átírja a `card1.vendor_name`-et). A job-rekordon is le kell
        ülnie a változásnak, hogy a dashboard listán helyes header
        jelenjen meg.

        Csak az explicit megadott mezőket írja át; a többi változatlan.
        Üres `set` esetén no-op. `JobNotFound`-ot dob ismeretlen `job_id`-re.
        """
        sets: list[str] = ["updated_at = ?"]
        args: list[Any] = [_to_iso(_utcnow())]
        if domain_name is not None:
            sets.append("domain_name = ?")
            args.append(domain_name)
        if target_locale is not None:
            sets.append("target_locale = ?")
            args.append(target_locale)
        if vendor_policy is not None:
            sets.append("vendor_policy = ?")
            args.append(vendor_policy)
        if vendor_name is not None:
            sets.append("vendor_name = ?")
            args.append(vendor_name)
        if research_source_path is not None:
            sets.append("research_source_path = ?")
            args.append(research_source_path)
        if len(sets) == 1:  # csak az updated_at — no-op
            return
        args.append(job_id)
        conn = self._connect()
        try:
            cur = conn.execute(
                f"UPDATE onboarding_jobs SET {', '.join(sets)} WHERE job_id = ?",
                args,
            )
            if cur.rowcount == 0:
                raise JobNotFound(job_id)
        finally:
            conn.close()

    def list_jobs(
        self,
        *,
        status: Optional[OnboardingJobStatus] = None,
        limit: Optional[int] = None,
    ) -> list[dict[str, Any]]:
        """Header-szintű job-lista (NEM teljes aggregátum).

        A `load_job(job_id)` kéri vissza a teljes `OnboardingJob`-ot.
        Ez itt csak a `onboarding_jobs` sorát adja vissza dict-ként,
        listázáshoz.
        """
        sql = "SELECT * FROM onboarding_jobs"
        args: list[Any] = []
        if status is not None:
            sql += " WHERE status = ?"
            args.append(status)
        sql += " ORDER BY created_at DESC"
        if limit is not None:
            sql += " LIMIT ?"
            args.append(limit)
        conn = self._connect()
        try:
            rows = conn.execute(sql, args).fetchall()
        finally:
            conn.close()
        return [dict(r) for r in rows]

    def load_job(self, job_id: str) -> OnboardingJob:
        """A teljes `OnboardingJob` aggregátum visszaolvasása.

        7 lekérdezésben rakja össze: jobs + blueprints + node_outcomes +
        structural_lints + semantic_audits + final_stories. Az attempts
        listáját egy node_outcome NEM tartalmazza visszaolvasáskor —
        azt külön a `list_node_attempts(job_id, node_id)` adja vissza.
        Ez tudatos: a `OnboardingJob.node_outcomes[i].attempts` mezőt a
        hívó tölti, ha kell (audit nézet); a pipeline orchestrator csak
        a final outcome-ot használja a következő node generálásához.
        """
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT * FROM onboarding_jobs WHERE job_id = ?", (job_id,)
            ).fetchone()
            if row is None:
                raise JobNotFound(job_id)

            blueprint_row = conn.execute(
                "SELECT blueprint_json FROM onboarding_blueprints WHERE job_id = ?",
                (job_id,),
            ).fetchone()

            outcome_rows = conn.execute(
                """
                SELECT node_id, final_status, final_node_dict_json,
                       declared_condition_ids_json, exposed_handoff_condition_ids_json
                FROM onboarding_node_outcomes
                WHERE job_id = ?
                ORDER BY saved_at ASC
                """,
                (job_id,),
            ).fetchall()

            lint_row = conn.execute(
                "SELECT lint_json FROM onboarding_structural_lints WHERE job_id = ?",
                (job_id,),
            ).fetchone()

            audit_row = conn.execute(
                "SELECT audit_json FROM onboarding_semantic_audits WHERE job_id = ?",
                (job_id,),
            ).fetchone()

            story_row = conn.execute(
                "SELECT story_json, version FROM onboarding_final_stories WHERE job_id = ?",
                (job_id,),
            ).fetchone()

            brief_row = conn.execute(
                "SELECT brief_json FROM onboarding_briefs WHERE job_id = ?",
                (job_id,),
            ).fetchone()

            phase0_row = conn.execute(
                "SELECT expansion_json FROM onboarding_phase0_results "
                "WHERE job_id = ?",
                (job_id,),
            ).fetchone()
        finally:
            conn.close()

        rc = RetryConfig.model_validate_json(row["retry_config_json"])

        blueprint: Optional[DomainBlueprint] = None
        if blueprint_row is not None:
            blueprint = DomainBlueprint.model_validate_json(
                blueprint_row["blueprint_json"]
            )

        outcomes: list[NodeGenerationOutcome] = []
        for o in outcome_rows:
            outcomes.append(
                NodeGenerationOutcome(
                    node_id=o["node_id"],
                    attempts=[],  # lazy: list_node_attempts() külön kérés
                    final_status=o["final_status"],
                    final_node_dict=(
                        json.loads(o["final_node_dict_json"])
                        if o["final_node_dict_json"] is not None
                        else None
                    ),
                    declared_condition_ids=json.loads(
                        o["declared_condition_ids_json"]
                    ),
                    exposed_handoff_condition_ids=json.loads(
                        o["exposed_handoff_condition_ids_json"]
                    ),
                )
            )

        structural_lint: Optional[StructuralLintResult] = None
        if lint_row is not None:
            structural_lint = StructuralLintResult.model_validate_json(
                lint_row["lint_json"]
            )

        semantic_audit: Optional[SemanticAuditResult] = None
        if audit_row is not None:
            semantic_audit = SemanticAuditResult.model_validate_json(
                audit_row["audit_json"]
            )

        final_story: Optional[dict[str, Any]] = None
        final_story_version: Optional[int] = None
        if story_row is not None:
            final_story = json.loads(story_row["story_json"])
            final_story_version = int(story_row["version"])

        brief: Optional[SupportChatbotBrief] = None
        if brief_row is not None:
            brief = SupportChatbotBrief.model_validate_json(
                brief_row["brief_json"]
            )

        phase0_result: Optional[BriefExpansionResult] = None
        if phase0_row is not None:
            phase0_result = BriefExpansionResult.model_validate_json(
                phase0_row["expansion_json"]
            )

        return OnboardingJob(
            job_id=row["job_id"],
            created_at=_from_iso(row["created_at"]),
            updated_at=_from_iso(row["updated_at"]),
            status=row["status"],
            status_detail=row["status_detail"],
            domain_name=row["domain_name"],
            target_locale=row["target_locale"],
            vendor_policy=row["vendor_policy"],
            vendor_name=row["vendor_name"],
            research_source_path=row["research_source_path"],
            retry_config=rc,
            blueprint=blueprint,
            blueprint_error=row["blueprint_error"],
            node_outcomes=outcomes,
            current_node_index=int(row["current_node_index"]),
            structural_lint=structural_lint,
            semantic_audit=semantic_audit,
            final_story=final_story,
            final_story_version=final_story_version,
            brief=brief,
            phase0_result=phase0_result,
        )

    # ------------------------------------------------------------------ #
    # Phase 1                                                             #
    # ------------------------------------------------------------------ #

    def save_blueprint(self, job_id: str, blueprint: DomainBlueprint) -> None:
        """Phase 1 output mentése (UPSERT)."""
        self._require_job_exists(job_id)
        conn = self._connect()
        try:
            conn.execute(
                """
                INSERT INTO onboarding_blueprints (job_id, blueprint_json, saved_at)
                VALUES (?, ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                    blueprint_json = excluded.blueprint_json,
                    saved_at = excluded.saved_at
                """,
                (job_id, blueprint.model_dump_json(), _to_iso(_utcnow())),
            )
            conn.execute(
                "UPDATE onboarding_jobs SET updated_at = ? WHERE job_id = ?",
                (_to_iso(_utcnow()), job_id),
            )
        finally:
            conn.close()

    def get_blueprint(self, job_id: str) -> Optional[DomainBlueprint]:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT blueprint_json FROM onboarding_blueprints WHERE job_id = ?",
                (job_id,),
            ).fetchone()
        finally:
            conn.close()
        if row is None:
            return None
        return DomainBlueprint.model_validate_json(row["blueprint_json"])

    # ------------------------------------------------------------------ #
    # Phase 0 — brief & expansion result                                  #
    # ------------------------------------------------------------------ #

    def save_brief(self, job_id: str, brief: SupportChatbotBrief) -> None:
        """A user által kitöltött `SupportChatbotBrief` mentése (UPSERT).

        Egy job-hoz egyetlen "current" brief tartozik — ha a user vissza-
        lép és módosítja, ez UPSERT-elődik. A korábbi snapshot-okat NEM
        verziózzuk a v2 schema-ban (audit-igény esetén v3-ra).
        """
        self._require_job_exists(job_id)
        conn = self._connect()
        try:
            conn.execute(
                """
                INSERT INTO onboarding_briefs (job_id, brief_json, saved_at)
                VALUES (?, ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                    brief_json = excluded.brief_json,
                    saved_at = excluded.saved_at
                """,
                (job_id, brief.model_dump_json(), _to_iso(_utcnow())),
            )
            conn.execute(
                "UPDATE onboarding_jobs SET updated_at = ? WHERE job_id = ?",
                (_to_iso(_utcnow()), job_id),
            )
        finally:
            conn.close()

    def get_brief(self, job_id: str) -> Optional[SupportChatbotBrief]:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT brief_json FROM onboarding_briefs WHERE job_id = ?",
                (job_id,),
            ).fetchone()
        finally:
            conn.close()
        if row is None:
            return None
        return SupportChatbotBrief.model_validate_json(row["brief_json"])

    def save_phase0_result(
        self, job_id: str, result: BriefExpansionResult
    ) -> None:
        """Phase 0 derived result (`research_text` + metadata) mentése (UPSERT).

        A brief változására a Phase 0-t a hívó (orchestrator) ismét lefuttatja,
        és ez a metódus UPSERT-eli az új resulttal. Idempotens.
        """
        self._require_job_exists(job_id)
        conn = self._connect()
        try:
            conn.execute(
                """
                INSERT INTO onboarding_phase0_results
                    (job_id, expansion_json, saved_at)
                VALUES (?, ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                    expansion_json = excluded.expansion_json,
                    saved_at = excluded.saved_at
                """,
                (job_id, result.model_dump_json(), _to_iso(_utcnow())),
            )
            conn.execute(
                "UPDATE onboarding_jobs SET updated_at = ? WHERE job_id = ?",
                (_to_iso(_utcnow()), job_id),
            )
        finally:
            conn.close()

    def get_phase0_result(
        self, job_id: str
    ) -> Optional[BriefExpansionResult]:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT expansion_json FROM onboarding_phase0_results "
                "WHERE job_id = ?",
                (job_id,),
            ).fetchone()
        finally:
            conn.close()
        if row is None:
            return None
        return BriefExpansionResult.model_validate_json(row["expansion_json"])

    # ------------------------------------------------------------------ #
    # Phase 2                                                             #
    # ------------------------------------------------------------------ #

    def append_node_attempt(
        self,
        job_id: str,
        node_id: str,
        attempt: NodeGenerationAttempt,
    ) -> int:
        """Append-only attempt-log írás.

        Visszaad: a beszúrt `attempt_id` (DB sequence). A `attempt_index`
        a `NodeGenerationAttempt`-en már szerepel — ezt a hívó indexeli;
        a storage NEM ellenőrzi a folytonosságot (a Phase 2 retry-loop
        felelőssége).
        """
        self._require_job_exists(job_id)
        conn = self._connect()
        try:
            cur = conn.execute(
                """
                INSERT INTO onboarding_node_attempts
                    (job_id, node_id, attempt_index, attempt_json, appended_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    node_id,
                    attempt.attempt_index,
                    attempt.model_dump_json(),
                    _to_iso(_utcnow()),
                ),
            )
            attempt_id = cur.lastrowid
            assert attempt_id is not None
            return int(attempt_id)
        finally:
            conn.close()

    def list_node_attempts(
        self, job_id: str, node_id: str
    ) -> list[NodeGenerationAttempt]:
        """A node minden attempt-je `attempt_index` szerint sorrendben."""
        conn = self._connect()
        try:
            rows = conn.execute(
                """
                SELECT attempt_json FROM onboarding_node_attempts
                WHERE job_id = ? AND node_id = ?
                ORDER BY attempt_index ASC, attempt_id ASC
                """,
                (job_id, node_id),
            ).fetchall()
        finally:
            conn.close()
        return [
            NodeGenerationAttempt.model_validate_json(r["attempt_json"])
            for r in rows
        ]

    def save_node_outcome(
        self, job_id: str, outcome: NodeGenerationOutcome
    ) -> None:
        """Phase 2 final outcome mentése (UPSERT).

        Az `outcome.attempts` listáját NEM duplikálja — a perzisztált
        attempts az `append_node_attempt` hívásokból gyűlnek. A
        `final_node_dict` és a két ID-lista snapshotolódik.
        """
        self._require_job_exists(job_id)
        conn = self._connect()
        try:
            conn.execute(
                """
                INSERT INTO onboarding_node_outcomes (
                    job_id, node_id, final_status, final_node_dict_json,
                    declared_condition_ids_json, exposed_handoff_condition_ids_json,
                    saved_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(job_id, node_id) DO UPDATE SET
                    final_status = excluded.final_status,
                    final_node_dict_json = excluded.final_node_dict_json,
                    declared_condition_ids_json = excluded.declared_condition_ids_json,
                    exposed_handoff_condition_ids_json =
                        excluded.exposed_handoff_condition_ids_json,
                    saved_at = excluded.saved_at
                """,
                (
                    job_id,
                    outcome.node_id,
                    outcome.final_status,
                    json.dumps(outcome.final_node_dict)
                    if outcome.final_node_dict is not None
                    else None,
                    json.dumps(list(outcome.declared_condition_ids)),
                    json.dumps(list(outcome.exposed_handoff_condition_ids)),
                    _to_iso(_utcnow()),
                ),
            )
            conn.execute(
                "UPDATE onboarding_jobs SET updated_at = ? WHERE job_id = ?",
                (_to_iso(_utcnow()), job_id),
            )
        finally:
            conn.close()

    def get_node_outcomes(self, job_id: str) -> list[NodeGenerationOutcome]:
        """Minden outcome a job-hoz, `attempts=[]` (lazy)."""
        return self.load_job(job_id).node_outcomes

    # ------------------------------------------------------------------ #
    # Phase 3                                                             #
    # ------------------------------------------------------------------ #

    def save_structural_lint(
        self, job_id: str, result: StructuralLintResult
    ) -> None:
        self._require_job_exists(job_id)
        conn = self._connect()
        try:
            conn.execute(
                """
                INSERT INTO onboarding_structural_lints (job_id, lint_json, saved_at)
                VALUES (?, ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                    lint_json = excluded.lint_json,
                    saved_at = excluded.saved_at
                """,
                (job_id, result.model_dump_json(), _to_iso(_utcnow())),
            )
            conn.execute(
                "UPDATE onboarding_jobs SET updated_at = ? WHERE job_id = ?",
                (_to_iso(_utcnow()), job_id),
            )
        finally:
            conn.close()

    def save_semantic_audit(
        self, job_id: str, result: SemanticAuditResult
    ) -> None:
        self._require_job_exists(job_id)
        conn = self._connect()
        try:
            conn.execute(
                """
                INSERT INTO onboarding_semantic_audits (job_id, audit_json, saved_at)
                VALUES (?, ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                    audit_json = excluded.audit_json,
                    saved_at = excluded.saved_at
                """,
                (job_id, result.model_dump_json(), _to_iso(_utcnow())),
            )
            conn.execute(
                "UPDATE onboarding_jobs SET updated_at = ? WHERE job_id = ?",
                (_to_iso(_utcnow()), job_id),
            )
        finally:
            conn.close()

    def save_final_story(
        self, job_id: str, story: dict[str, Any], version: int
    ) -> None:
        """Az összerakott, validált story dict mentése."""
        self._require_job_exists(job_id)
        conn = self._connect()
        try:
            conn.execute(
                """
                INSERT INTO onboarding_final_stories
                    (job_id, story_json, version, saved_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET
                    story_json = excluded.story_json,
                    version = excluded.version,
                    saved_at = excluded.saved_at
                """,
                (job_id, json.dumps(story), version, _to_iso(_utcnow())),
            )
            conn.execute(
                "UPDATE onboarding_jobs SET updated_at = ? WHERE job_id = ?",
                (_to_iso(_utcnow()), job_id),
            )
        finally:
            conn.close()

    # ------------------------------------------------------------------ #
    # Events                                                              #
    # ------------------------------------------------------------------ #

    def log_event(
        self,
        job_id: str,
        *,
        phase: str,
        kind: str,
        payload: Optional[dict[str, Any]] = None,
    ) -> int:
        """Telemetry-event append. FIFO sorrend (event_id sequence)."""
        self._require_job_exists(job_id)
        conn = self._connect()
        try:
            cur = conn.execute(
                """
                INSERT INTO onboarding_events
                    (job_id, phase, kind, payload_json, at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    job_id,
                    phase,
                    kind,
                    json.dumps(payload) if payload is not None else None,
                    _to_iso(_utcnow()),
                ),
            )
            event_id = cur.lastrowid
            assert event_id is not None
            return int(event_id)
        finally:
            conn.close()

    def list_events(
        self, job_id: str, *, phase: Optional[str] = None
    ) -> list[dict[str, Any]]:
        sql = "SELECT * FROM onboarding_events WHERE job_id = ?"
        args: list[Any] = [job_id]
        if phase is not None:
            sql += " AND phase = ?"
            args.append(phase)
        sql += " ORDER BY event_id ASC"
        conn = self._connect()
        try:
            rows = conn.execute(sql, args).fetchall()
        finally:
            conn.close()
        out: list[dict[str, Any]] = []
        for r in rows:
            d = dict(r)
            if d.get("payload_json"):
                d["payload"] = json.loads(d["payload_json"])
            else:
                d["payload"] = None
            del d["payload_json"]
            out.append(d)
        return out

    # ------------------------------------------------------------------ #
    # Internal                                                            #
    # ------------------------------------------------------------------ #

    def _require_job_exists(self, job_id: str) -> None:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT 1 FROM onboarding_jobs WHERE job_id = ?", (job_id,)
            ).fetchone()
        finally:
            conn.close()
        if row is None:
            raise JobNotFound(job_id)

    # ------------------------------------------------------------------ #
    # Cleanup helpers (test / dev)                                        #
    # ------------------------------------------------------------------ #

    def delete_job(self, job_id: str) -> None:
        """Törli a job-ot ÉS a hozzá tartozó összes Phase output-ot
        (FK CASCADE-en keresztül)."""
        conn = self._connect()
        try:
            cur = conn.execute(
                "DELETE FROM onboarding_jobs WHERE job_id = ?", (job_id,)
            )
            if cur.rowcount == 0:
                raise JobNotFound(job_id)
        finally:
            conn.close()


__all__ = [
    "OnboardingStorage",
    "StorageError",
    "JobNotFound",
]

