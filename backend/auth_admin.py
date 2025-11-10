# backend/auth_admin.py
import os
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, status
from fastapi.security import APIKeyHeader

load_dotenv()

ADMIN_HEADER = APIKeyHeader(name="x-admin-key", auto_error=False)
ADMIN_KEY = os.getenv("ADMIN_KEY", "local-admin-key")

def get_admin(admin_key: str = Depends(ADMIN_HEADER)):
    if admin_key != ADMIN_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing admin key",
        )
    return {"role": "admin"}
