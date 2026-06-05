"""Ingest worker: consumes file-backed ingest jobs, runs chunker, and POSTs to RAG `/ingest`.

Usage: run this alongside the RAG engine (or as a separate process). It polls
`data/ingest_jobs/` for new jobs, processes them, and moves job files to
`data/ingest_jobs/processed/` or `data/ingest_jobs/failed/`.
"""
from __future__ import annotations

import json
import shutil
import time
from pathlib import Path
from typing import Any

import httpx

from .chunker import chunk_by_traceback, chunk_config, chunk_text


REPO_ROOT = Path(__file__).resolve().parents[3]
INGEST_JOBS = REPO_ROOT / "data" / "ingest_jobs"
PROCESSED = INGEST_JOBS / "processed"
FAILED = INGEST_JOBS / "failed"

RAG_ENGINE_URL = "http://localhost:8000"  # override with env or args if needed
POLL_INTERVAL = 2.0


def choose_chunker(text: str, raw_path: Path | None = None):
    lower = text.lower()
    if "traceback" in lower or "exception:" in lower:
        return chunk_by_traceback
    if raw_path and raw_path.suffix in (".yml", ".yaml"):
        return chunk_config
    # heuristics for k8s manifests
    if "apiversion" in lower or "kind:" in lower:
        return chunk_config
    return chunk_text


def build_documents(chunks: list[str], job_meta: dict[str, Any], source_hint: str | None = None):
    docs = []
    source_map = {
        "gitlab": "gitlab_ci",
    }
    source_type = source_map.get(source_hint, "log")
    for c in chunks:
        docs.append(
            {
                "content": c,
                "source_type": source_type,
                "metadata": job_meta.get("meta", {}) if isinstance(job_meta, dict) else {},
                "environment": job_meta.get("environment") if isinstance(job_meta, dict) else None,
                "service_name": job_meta.get("service") if isinstance(job_meta, dict) else None,
            }
        )
    return docs


def process_job_file(job_file: Path):
    try:
        with job_file.open("r", encoding="utf8") as f:
            payload = json.load(f)
    except Exception as exc:
        print(f"Failed to read job file {job_file}: {exc}")
        return False

    job = payload.get("job") or {}
    raw_file = job.get("raw_file")
    if not raw_file:
        print(f"Job {job_file} missing raw_file")
        move_to_failed(job_file)
        return False

    raw_path = Path(raw_file)
    if not raw_path.exists():
        print(f"Raw file {raw_path} does not exist for job {job_file}")
        move_to_failed(job_file)
        return False

    # attempt to parse raw file as JSON to extract payload if present
    try:
        raw_data = None
        with raw_path.open("r", encoding="utf8") as rf:
            try:
                raw_data = json.load(rf)
            except Exception:
                raw_text = rf.read()
            else:
                # if file was written by WebhooksService, it wraps payload under 'payload'
                if isinstance(raw_data, dict) and "payload" in raw_data:
                    raw_text = json.dumps(raw_data.get("payload"), indent=2)
                else:
                    raw_text = json.dumps(raw_data, indent=2)
    except Exception as exc:
        print(f"Failed to read raw file {raw_path}: {exc}")
        move_to_failed(job_file)
        return False

    chunker = choose_chunker(raw_text, raw_path)
    chunks = chunker(raw_text)
    if not chunks:
        print(f"No chunks produced for {raw_path}")
        move_to_failed(job_file)
        return False

    docs = build_documents(chunks, job, source_hint=job.get("source"))

    ingest_url = RAG_ENGINE_URL.rstrip("/") + "/ingest"
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(ingest_url, json={"documents": docs})
            resp.raise_for_status()
            print(f"Ingested {len(docs)} docs for job {job_file.name}: {resp.json()}")
    except Exception as exc:
        print(f"Failed to POST to {ingest_url}: {exc}")
        move_to_failed(job_file)
        return False

    move_to_processed(job_file)
    return True


def move_to_processed(p: Path):
    PROCESSED.mkdir(parents=True, exist_ok=True)
    dest = PROCESSED / p.name
    shutil.move(str(p), str(dest))


def move_to_failed(p: Path):
    FAILED.mkdir(parents=True, exist_ok=True)
    dest = FAILED / p.name
    shutil.move(str(p), str(dest))


def main_loop():
    INGEST_JOBS.mkdir(parents=True, exist_ok=True)
    while True:
        job_files = sorted(INGEST_JOBS.glob("*.json"))
        # ignore processed/failed subdirs
        job_files = [f for f in job_files if f.parent == INGEST_JOBS]
        if not job_files:
            time.sleep(POLL_INTERVAL)
            continue
        for jf in job_files:
            print(f"Processing job {jf}")
            try:
                # rename to indicate processing
                processing = jf.with_suffix(jf.suffix + ".processing")
                jf.rename(processing)
                success = process_job_file(processing)
                # if processing moved the file, nothing else to do
            except Exception as exc:
                print(f"Error processing {jf}: {exc}")


if __name__ == "__main__":
    print(f"Starting ingest worker; watching {INGEST_JOBS}")
    main_loop()
