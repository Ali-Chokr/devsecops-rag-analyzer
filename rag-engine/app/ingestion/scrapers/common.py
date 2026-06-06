"""Shared helpers for scrapers: persistence and ingest job enqueue."""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def data_dir() -> Path:
    if configured := os.environ.get("DATA_DIR"):
        return Path(configured)
    return Path(__file__).resolve().parents[4] / "data"


def scraped_dir(source: str) -> Path:
    path = data_dir() / "scraped" / source
    path.mkdir(parents=True, exist_ok=True)
    return path


def ingest_jobs_dir() -> Path:
    path = data_dir() / "ingest_jobs"
    path.mkdir(parents=True, exist_ok=True)
    return path


def timestamp_slug() -> str:
    return datetime.now(timezone.utc).isoformat().replace(":", "-").replace(".", "-")


def save_raw_file(source: str, filename: str, content: str) -> Path:
    safe_name = re.sub(r"[^\w.\-]+", "_", filename)
    dest = scraped_dir(source) / f"{timestamp_slug()}-{safe_name}"
    dest.write_text(content, encoding="utf-8")
    return dest


def enqueue_job(job: dict[str, Any]) -> Path:
    job_id = f"{timestamp_slug()}-{os.getpid()}.json"
    dest = ingest_jobs_dir() / job_id
    payload = {
        "id": job_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "queued",
        "job": job,
    }
    dest.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return dest


def build_job(
    *,
    source: str,
    raw_file: Path,
    environment: str | None,
    service_name: str | None,
    meta: dict[str, Any],
) -> dict[str, Any]:
    return {
        "source": source,
        "raw_file": str(raw_file),
        "environment": environment,
        "service": service_name,
        "meta": {
            **meta,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
        },
    }


def walk_yaml_files(root: Path) -> list[Path]:
    if not root.exists():
        raise FileNotFoundError(f"Scrape path does not exist: {root}")

    patterns = ("*.yaml", "*.yml")
    files: list[Path] = []
    for pattern in patterns:
        files.extend(root.rglob(pattern))
    return sorted({path.resolve() for path in files})
