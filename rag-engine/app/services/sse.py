"""Server-sent event helpers for streaming query responses."""

from __future__ import annotations

import json
from typing import Any


def format_sse(event_type: str, payload: dict[str, Any]) -> str:
    body = {"type": event_type, **payload}
    return f"data: {json.dumps(body, default=str)}\n\n"
