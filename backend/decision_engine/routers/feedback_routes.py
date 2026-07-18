# feedback_routes.py
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field, EmailStr, validator
from datetime import datetime
import os
import json
import uuid
from typing import Literal

# httpx általában elérhető FastAPI környezetben; ha mégsem, az email értesítés csendben kihagyásra kerül
try:
    import httpx
except Exception:
    httpx = None  # type: ignore

router = APIRouter()

# --- Konfiguráció / könyvtárak ---
FEEDBACK_DIR = os.getenv("FEEDBACK_DIR", "feedback")
os.makedirs(FEEDBACK_DIR, exist_ok=True)
FEEDBACK_FILE = os.path.join(FEEDBACK_DIR, "feedback.jsonl")
READ_SECRET = os.getenv("FEEDBACK_READ_SECRET")  # ha üres, GET le van tiltva

# Opcionális email értesítés (Resend)
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "").strip()
FEEDBACK_TO = os.getenv("FEEDBACK_TO", "").strip()         # pl. your@mail.com
FEEDBACK_FROM = os.getenv("FEEDBACK_FROM", "QuestForge <feedback@localhost>").strip()

# --- Pydantic modellek ---

AnswerType = Literal["rating", "boolean", "text"]

class FeedbackItem(BaseModel):
    id: str = Field(..., description="Kérdés azonosító (pl. q1, q2 ... vagy bármilyen string)")
    type: AnswerType
    value: int | bool | str

    @validator("value")
    def validate_value(cls, v: object, values: dict[str, object]) -> object:
        t = values.get("type")
        if t == "rating":
            if not isinstance(v, int) or v < 1 or v > 5:
                raise ValueError("rating értéknek 1..5 közötti egésznek kell lennie")
        elif t == "boolean":
            if not isinstance(v, bool):
                raise ValueError("boolean értéknek True/False-nak kell lennie")
        elif t == "text":
            if not isinstance(v, str):
                raise ValueError("text értéknek stringnek kell lennie")
            if len(v) > 4000:
                raise ValueError("text túl hosszú (max 4000 karakter)")
        return v

class FeedbackPayload(BaseModel):
    sessionId: str | None = Field(None, description="Frontend session / játék azonosító")
    pageId: str | None = Field(None, description="Melyik oldalról küldték (pl. epilogue után)")
    email: EmailStr | None = Field(None, description="Opcionális e-mail feliratkozás/kapcsolat")
    answers: list[FeedbackItem] = Field(..., min_items=1, description="Kitöltött válaszok listája")
    meta: dict[str, object] | None = Field(
        default=None,
        description="Opcionális extra meta (pl. userAgent, perf logok: audio/image, URL, stb.)"
    )
    clientTs: str | None = Field(
        default=None,
        description="Kliens oldali időbélyeg ISO 8601-ben (opcionális)"
    )

    @validator("answers")
    def limit_answers(cls, v: list[FeedbackItem]) -> list[FeedbackItem]:
        # laza limit – ne dőljön el ha kicsit több/kevesebb kérdés van
        if len(v) > 20:
            raise ValueError("Túl sok answer elem (max 20)")
        return v

class FeedbackSaved(BaseModel):
    id: str
    ok: bool = True

# --- Segédfüggvények ---

def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"

def _append_jsonl(record: dict[str, object]) -> None:
    # Egyszerű, gyors JSONL append
    with open(FEEDBACK_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")

def _read_last_lines(limit: int = 50, offset: int = 0) -> list[dict[str, object]]:
    if not os.path.exists(FEEDBACK_FILE):
        return []
    # Egyszerű beolvasás (fejlesztéshez bőven elég, kis mennyiségre optimalizált)
    with open(FEEDBACK_FILE, "r", encoding="utf-8") as f:
        lines = f.readlines()
    # Legfrissebbtől visszafelé
    lines = lines[::-1]
    sliced = lines[offset: offset + limit]
    out: list[dict[str, object]] = []
    for ln in sliced:
        ln = ln.strip()
        if not ln:
            continue
        try:
            out.append(json.loads(ln))
        except Exception:
            # ha sérült sor, ugorjuk
            continue
    return out

async def _maybe_send_email(record: dict[str, object]) -> None:
    """
    Opcionális email értesítés Resend API-val.
    Nem dob tovább kivételt – a mentést nem töri el, ha nincs kulcs vagy hiba van.
    """
    if not RESEND_API_KEY or not FEEDBACK_TO or httpx is None:
        return

    # Minimális, szöveges összefoglaló
    answers_line = ", ".join(
        f"{a.get('id')}={a.get('value')}" for a in record.get("answers", [])
    )
    diag = record.get("meta", {}) or {}
    diag_ua = diag.get("diagnostics", {}).get("ua") if isinstance(diag, dict) else None
    diag_url = diag.get("diagnostics", {}).get("url") if isinstance(diag, dict) else None

    subject = f"Feedback • page={record.get('pageId') or '-'} • session={record.get('sessionId') or '-'}"
    body = "\n".join([
        f"serverTs:   {record.get('ts')}",
        f"clientTs:   {record.get('clientTs')}",
        f"pageId:     {record.get('pageId')}",
        f"sessionId:  {record.get('sessionId')}",
        f"email(opt): {record.get('email') or '-'}",
        f"answers:    {answers_line or '-'}",
        f"UA:         {diag_ua or record.get('requestUa') or '-'}",
        f"URL:        {diag_url or record.get('requestOrigin') or '-'}",
        f"appVersion: {record.get('appVersion') or '-'}",
    ])

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            r = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": FEEDBACK_FROM,
                    "to": [FEEDBACK_TO],
                    "subject": subject,
                    "text": body,
                },
            )
            # Ha nem OK, ne törjük el a mentést
            _ = r.text  # materialize
    except Exception:
        pass

# --- Végpontok ---

@router.get("/feedback/schema")
def get_feedback_schema():
    """Egyszerű séma a frontendnek, hogy mit vár a backend."""
    return {
        "answerTypes": ["rating(1-5)", "boolean", "text"],
        "emailOptional": True,
        "format": {
            "sessionId": "string|optional",
            "pageId": "string|optional",
            "email": "email|optional",
            "clientTs": "ISO8601|optional",
            "answers": [
                {"id": "string", "type": "rating|boolean|text", "value": "int|bool|string"}
            ],
            "meta": {"...": "any|optional"}
        }
    }

@router.post("/feedback", response_model=FeedbackSaved, status_code=201)
async def post_feedback(payload: FeedbackPayload, request: Request):
    """Visszatérés után küldött feedback mentése JSONL-be, opcionális email értesítéssel."""
    rec_id = uuid.uuid4().hex
    server_ts = _now_iso()

    # Minimális privacy: email opcionális; IP/host nem kerül mentésre külön
    record = {
        "id": rec_id,
        "ts": server_ts,
        "clientTs": payload.clientTs,
        "sessionId": payload.sessionId,
        "pageId": payload.pageId,
        "email": payload.email,  # opcionális
        "answers": [a.dict() for a in payload.answers],
        "meta": payload.meta or {},
        # hasznos diagnosztika (UA, origin) ha a frontend nem küldi meta-ban:
        "requestUa": request.headers.get("user-agent", None),
        "requestOrigin": request.headers.get("origin", None),
        "appVersion": os.getenv("APP_VERSION"),  # ha be van állítva
    }

    try:
        _append_jsonl(record)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Mentési hiba: {e}")

    # Opcionális email értesítés (nem kötelező, hibát nem dob tovább)
    try:
        await _maybe_send_email(record)
    except Exception:
        pass

    return FeedbackSaved(id=rec_id)

@router.get("/feedback")
def list_feedback(
    secret: str | None = Query(default=None, description="Olvasáshoz titkos kulcs szükséges"),
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    """Admin/fejlesztő olvasás – CSAK ha FEEDBACK_READ_SECRET be van állítva és helyes."""
    if not READ_SECRET:
        raise HTTPException(status_code=403, detail="Feedback olvasás letiltva (nincs FEEDBACK_READ_SECRET).")
    if secret != READ_SECRET:
        raise HTTPException(status_code=401, detail="Érvénytelen vagy hiányzó secret.")
    try:
        items = _read_last_lines(limit=limit, offset=offset)
        return {"ok": True, "count": len(items), "items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Beolvasási hiba: {e}")
