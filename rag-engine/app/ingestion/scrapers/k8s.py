"""Kubernetes manifest scraper (filesystem or kubectl API)."""

from __future__ import annotations

import os
import re
import subprocess
from pathlib import Path
from typing import Any

from .common import build_job, enqueue_job, save_raw_file, walk_yaml_files


def _parse_k8s_metadata(content: str, filename: str) -> dict[str, Any]:
    kind = _match(r"^kind:\s*(\S+)", content)
    name = _match(r"^\s*name:\s*(\S+)", content)
    namespace = _match(r"^\s*namespace:\s*(\S+)", content)
    return {
        "file": filename,
        "kind": kind,
        "name": name,
        "namespace": namespace,
    }


def _match(pattern: str, content: str) -> str | None:
    found = re.search(pattern, content, re.MULTILINE)
    return found.group(1) if found else None


def _service_name(meta: dict[str, Any], filename: str) -> str | None:
    if meta.get("name"):
        return str(meta["name"])
    stem = Path(filename).stem
    return stem or None


def scrape_k8s_filesystem(
    root: Path,
    *,
    environment: str | None = None,
) -> list[Path]:
    queued: list[Path] = []
    for source_path in walk_yaml_files(root):
        content = source_path.read_text(encoding="utf-8")
        meta = _parse_k8s_metadata(content, source_path.name)
        saved = save_raw_file("k8s", source_path.name, content)
        job = build_job(
            source="k8s",
            raw_file=saved,
            environment=environment or meta.get("namespace"),
            service_name=_service_name(meta, source_path.name),
            meta=meta,
        )
        queued.append(enqueue_job(job))
    return queued


def scrape_k8s_api(
    *,
    environment: str | None = None,
    namespace: str | None = None,
) -> list[Path]:
    args = ["kubectl", "get", "all", "-o", "yaml"]
    if namespace:
        args.extend(["-n", namespace])
    else:
        args.append("-A")

    result = subprocess.run(
        args,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "kubectl command failed")

    documents = [doc.strip() for doc in result.stdout.split("---") if doc.strip()]
    queued: list[Path] = []
    for index, content in enumerate(documents, start=1):
        meta = _parse_k8s_metadata(content, f"kubectl-all-{index}.yaml")
        saved = save_raw_file("k8s", f"kubectl-all-{index}.yaml", content)
        job = build_job(
            source="k8s",
            raw_file=saved,
            environment=environment or meta.get("namespace"),
            service_name=_service_name(meta, saved.name),
            meta={**meta, "mode": "api"},
        )
        queued.append(enqueue_job(job))
    return queued


def scrape_k8s(
    *,
    path: str | Path | None = None,
    environment: str | None = None,
    mode: str | None = None,
    namespace: str | None = None,
) -> list[Path]:
    selected_mode = (mode or os.environ.get("SCRAPER_K8S_MODE", "filesystem")).lower()
    if selected_mode == "api":
        return scrape_k8s_api(environment=environment, namespace=namespace)

    root = Path(path or os.environ.get("SCRAPER_K8S_PATH", "")).expanduser()
    if not str(root):
        raise ValueError("SCRAPER_K8S_PATH or --path is required for filesystem mode")
    return scrape_k8s_filesystem(root, environment=environment)
