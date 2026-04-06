from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from feedback_routes import router as feedback_router
from middleware.http import NoCacheStoriesMiddleware, SecurityHeadersMiddleware
from router.white_label import router as white_label_router
from routers.admin import router as admin_router
from routers.analytics import router as analytics_router
from routers.media import router as media_router
from routers.embed_access import router as embed_access_router
from routers.reports import router as reports_router
from routers.runtime import router as runtime_router
from services.reports import start_report_scheduler
from services.runtime_config import STORIES_DIR
from storysvc.router import router as stories_router


def _cors_allow_origins() -> list[str]:
    """Comma-separated extra origins via CORS_EXTRA_ORIGINS (e.g. Vercel preview URL)."""
    origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://thequestell.com",
        "https://www.thequestell.com",
    ]
    extra = os.getenv("CORS_EXTRA_ORIGINS", "")
    if extra.strip():
        origins.extend(o.strip() for o in extra.split(",") if o.strip())
    return origins


app = FastAPI()

app.add_middleware(NoCacheStoriesMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_allow_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(feedback_router, prefix="/api")
app.include_router(stories_router, prefix="/api")
app.include_router(white_label_router)
app.include_router(admin_router, prefix="/api")
app.include_router(runtime_router)
app.include_router(media_router)
app.include_router(analytics_router)
app.include_router(reports_router)
app.include_router(embed_access_router, prefix="/api")

if os.path.isdir("assets"):
    app.mount("/assets", StaticFiles(directory="assets"), name="assets")
if os.path.isdir("generated"):
    app.mount("/generated", StaticFiles(directory="generated"), name="generated")
if os.path.isdir("generated/audio"):
    app.mount("/generated/audio", StaticFiles(directory="generated/audio"), name="generated-audio")
if os.path.isdir(STORIES_DIR):
    app.mount("/stories", StaticFiles(directory=STORIES_DIR), name="stories")


@app.on_event("startup")
def _on_startup():
    start_report_scheduler(app)
