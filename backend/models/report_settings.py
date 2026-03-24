# models/report_settings.py
from pydantic import BaseModel, EmailStr
from typing import Literal

class ReportSettings(BaseModel):
    storyId: str
    recipients: list[EmailStr]
    frequency: Literal["daily","weekly","monthly"] = "weekly"
    timeOfDay: str = "09:00"            # "HH:MM"
    timezone: str = "Europe/Amsterdam"
    rangeSpec: Literal["last7d","last30d"] = "last7d"
    terminal: list[str] | None = None
