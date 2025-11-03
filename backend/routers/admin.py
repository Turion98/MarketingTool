# backend/routers/admin.py
from fastapi import APIRouter, Depends
from auth_admin import get_admin
from cache import clear_caches

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/ping")
def admin_ping(_=Depends(get_admin)):
    return {"ok": True, "role": "admin", "msg": "pong"}

@router.post("/restart")
def admin_restart(_=Depends(get_admin)):
    try:
        clear_caches()
        return {"ok": True, "msg": "Caches cleared, system restart ready"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
