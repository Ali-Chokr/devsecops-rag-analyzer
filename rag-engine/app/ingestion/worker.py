"""Ingest worker: consumes file-backed ingest jobs, runs chunker, and POSTs to RAG `/ingest`.

Usage: run this alongside the RAG engine (or as a separate process). It polls
`data/ingest_jobs/` for new jobs, processes them, and moves job files to
`data/ingest_jobs/processed/` or `data/ingest_jobs/failed/`.
"""
from __future__ import annotations

import json
import os
import shutil
import time
from pathlib import Path
from typing import Any

import httpx

from .chunker import chunk_by_traceback, chunk_config, chunk_text


def _data_dir() -> Path:
    if data_dir := os.environ.get("DATA_DIR"):
        return Path(data_dir)
    return Path(__file__).resolve().parents[3] / "data"


def _rag_engine_url() -> str:
    return os.environ.get("RAG_ENGINE_URL", "http://localhost:8000")


def _backend_url() -> str:
    return os.environ.get("BACKEND_URL", "http://localhost:3000")


def _backend_api_key() -> str | None:
    return os.environ.get("API_KEY") or None


def _poll_interval() -> float:
    return float(os.environ.get("INGEST_POLL_INTERVAL", "2.0"))


INGEST_JOBS = _data_dir() / "ingest_jobs"
PROCESSED = INGEST_JOBS / "processed"
FAILED = INGEST_JOBS / "failed"


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
        "k8s": "k8s",
        "ansible": "ansible",
        "log": "log",
    }
    source_type = source_map.get(source_hint or "", "log")
    meta = job_meta.get("meta", {}) if isinstance(job_meta, dict) else {}
    if not isinstance(meta, dict):
        meta = {}
    for c in chunks:
        docs.append(
            {
                "content": c,
                "source_type": source_type,
                "metadata": meta,
                "environment": job_meta.get("environment") if isinstance(job_meta, dict) else None,
                "service_name": job_meta.get("service") if isinstance(job_meta, dict) else None,
            }
        )
    return docs


def read_raw_text(raw_path: Path) -> str | None:
    try:
        with raw_path.open("r", encoding="utf8") as rf:
            if raw_path.suffix.lower() in (".yml", ".yaml", ".log", ".txt"):
                return rf.read()
            try:
                raw_data = json.load(rf)
            except json.JSONDecodeError:
                rf.seek(0)
                return rf.read()
            if isinstance(raw_data, dict) and "payload" in raw_data:
                return json.dumps(raw_data.get("payload"), indent=2)
            return json.dumps(raw_data, indent=2)
    except Exception as exc:
        print(f"Failed to read raw file {raw_path}: {exc}")
        return None


def notify_backend_status(job_id: str | None, status: str, error_message: str | None = None):
    if not job_id:
        return
    url = _backend_url().rstrip("/") + f"/api/ingest/jobs/{job_id}/status"
    headers: dict[str, str] = {"Content-Type": "application/json"}
    api_key = _backend_api_key()
    if api_key:
        headers["X-API-Key"] = api_key
    payload: dict[str, Any] = {"status": status}
    if error_message:
        payload["error_message"] = error_message
    try:
        with httpx.Client(timeout=10.0) as client:
            client.patch(url, json=payload, headers=headers)
    except Exception as exc:
        print(f"Failed to notify backend of job status: {exc}")


def process_job_file(job_file: Path):
    try:
        with job_file.open("r", encoding="utf8") as f:
            payload = json.load(f)
    except Exception as exc:
        print(f"Failed to read job file {job_file}: {exc}")
        return False

    job = payload.get("job") or {}
    job_id = payload.get("id") or job.get("file_id")
    notify_backend_status(job_id, "processing")

    raw_file = job.get("raw_file")
    if not raw_file:
        print(f"Job {job_file} missing raw_file")
        move_to_failed(job_file, job_id, "missing raw_file")
        return False

    raw_path = Path(raw_file)
    if not raw_path.exists():
        print(f"Raw file {raw_path} does not exist for job {job_file}")
        move_to_failed(job_file, job_id, f"raw file not found: {raw_path}")
        return False

    raw_text = read_raw_text(raw_path)
    if raw_text is None:
        move_to_failed(job_file, job_id, "failed to read raw file")
        return False

    chunker = choose_chunker(raw_text, raw_path)
    chunks = chunker(raw_text)
    if not chunks:
        print(f"No chunks produced for {raw_path}")
        move_to_failed(job_file, job_id, "no chunks produced")
        return False

    docs = build_documents(chunks, job, source_hint=job.get("source"))

    ingest_url = _rag_engine_url().rstrip("/") + "/ingest"
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(ingest_url, json={"documents": docs})
            resp.raise_for_status()
            print(f"Ingested {len(docs)} docs for job {job_file.name}: {resp.json()}")
    except Exception as exc:
        print(f"Failed to POST to {ingest_url}: {exc}")
        move_to_failed(job_file, job_id, f"ingest failed: {exc}")
        return False

    move_to_processed(job_file)
    notify_backend_status(job_id, "completed")
    return True


def move_to_processed(p: Path):
    PROCESSED.mkdir(parents=True, exist_ok=True)
    dest = PROCESSED / p.name
    shutil.move(str(p), str(dest))


def move_to_failed(p: Path, job_id: str | None = None, error_message: str | None = None):
    FAILED.mkdir(parents=True, exist_ok=True)
    dest = FAILED / p.name
    shutil.move(str(p), str(dest))
    notify_backend_status(job_id, "failed", error_message)


def main_loop():
    INGEST_JOBS.mkdir(parents=True, exist_ok=True)
    while True:
        job_files = sorted(INGEST_JOBS.glob("*.json"))
        # ignore processed/failed subdirs
        job_files = [f for f in job_files if f.parent == INGEST_JOBS]
        if not job_files:
            time.sleep(_poll_interval())
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
    print(
        f"Starting ingest worker; watching {INGEST_JOBS}, "
        f"RAG_ENGINE_URL={_rag_engine_url()}"
    )
    main_loop()
