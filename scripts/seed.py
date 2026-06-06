#!/usr/bin/env python3
"""Seed the RAG index with realistic DevSecOps sample data.

Reads files from scripts/seed-data/, chunks them, and POSTs to the RAG /ingest API.

Usage (from repo root, with Postgres + RAG engine running):
  python scripts/seed.py
  python scripts/seed.py --url http://localhost:8000
  python scripts/seed.py --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

import httpx

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
SEED_DIR = SCRIPT_DIR / "seed-data"
RAG_ENGINE_DIR = REPO_ROOT / "rag-engine"

sys.path.insert(0, str(RAG_ENGINE_DIR))

from app.ingestion.chunker import chunk_by_traceback, chunk_config, chunk_text  # noqa: E402

CHUNKERS = {
    "log": chunk_by_traceback,
    "config": chunk_config,
    "text": chunk_text,
}


def load_manifest() -> dict[str, Any]:
    manifest_path = SEED_DIR / "manifest.json"
    with manifest_path.open(encoding="utf-8") as f:
        return json.load(f)


def chunk_source(text: str, mode: str) -> list[str]:
    chunker = CHUNKERS.get(mode, chunk_text)
    chunks = chunker(text)
    return [c for c in chunks if c.strip()]


def build_documents(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    for source in manifest["sources"]:
        file_path = SEED_DIR / source["file"]
        if not file_path.exists():
            raise FileNotFoundError(f"Seed source not found: {file_path}")

        text = file_path.read_text(encoding="utf-8")
        if file_path.suffix == ".json":
            try:
                parsed = json.loads(text)
                text = json.dumps(parsed, indent=2)
            except json.JSONDecodeError:
                pass

        mode = source.get("chunk_mode", "text")
        chunks = chunk_source(text, mode)
        if not chunks:
            chunks = [text]

        for index, content in enumerate(chunks):
            metadata = dict(source.get("metadata", {}))
            metadata["seed_file"] = source["file"]
            metadata["chunk_index"] = index
            documents.append(
                {
                    "content": content,
                    "source_type": source["source_type"],
                    "metadata": metadata,
                    "environment": source.get("environment"),
                    "service_name": source.get("service_name"),
                }
            )
    return documents


def post_ingest(url: str, documents: list[dict[str, Any]]) -> dict[str, Any]:
    ingest_url = url.rstrip("/") + "/ingest"
    with httpx.Client(timeout=60.0) as client:
        response = client.post(ingest_url, json={"documents": documents})
        response.raise_for_status()
        return response.json()


def check_health(url: str) -> None:
    health_url = url.rstrip("/") + "/health"
    with httpx.Client(timeout=10.0) as client:
        response = client.get(health_url)
        response.raise_for_status()
        payload = response.json()
        if payload.get("database") != "connected":
            raise RuntimeError(f"RAG engine database not connected: {payload}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed DevSecOps sample data into the RAG index")
    parser.add_argument(
        "--url",
        default=os.environ.get("RAG_ENGINE_URL", "http://localhost:8000"),
        help="RAG engine base URL (default: RAG_ENGINE_URL or http://localhost:8000)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print chunk summary without calling /ingest",
    )
    args = parser.parse_args()

    manifest = load_manifest()
    documents = build_documents(manifest)

    print(f"Loaded {len(manifest['sources'])} source files -> {len(documents)} chunks")
    for source in manifest["sources"]:
        count = sum(1 for d in documents if d["metadata"].get("seed_file") == source["file"])
        print(f"  - {source['file']}: {count} chunk(s) [{source['source_type']}, {source.get('environment', 'n/a')}]")

    if args.dry_run:
        print("\nDry run complete. Demo queries:")
        for query in manifest.get("demo_queries", []):
            print(f"  - {query}")
        return 0

    print(f"\nChecking RAG engine health at {args.url} ...")
    check_health(args.url)

    print(f"Posting {len(documents)} documents to {args.url}/ingest ...")
    result = post_ingest(args.url, documents)
    print(f"Seed complete: inserted={result.get('inserted', 0)}")

    if demo_queries := manifest.get("demo_queries"):
        print("\nTry these queries in the UI or api/dev.http:")
        for query in demo_queries:
            print(f"  - {query}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
