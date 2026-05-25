"""Pytest: import előtt env + backend a sys.path-on (services.*)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

_backend_root = Path(__file__).resolve().parents[1]
if str(_backend_root) not in sys.path:
    sys.path.insert(0, str(_backend_root))

os.environ.setdefault(
    "ANTHROPIC_API_KEY",
    "sk-ant-api03-test00000000000000000000000000000000000000000000",
)
