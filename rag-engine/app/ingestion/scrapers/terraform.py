"""Terraform configuration scraper (filesystem)."""

from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any

from .common import build_job, enqueue_job, save_raw_file


def _parse_terraform_metadata(content: str, filename: str) -> dict[str, Any]:
    resource = _match(r'resource\s+"([^"]+)"\s+"([^"]+)"', content)
    module = _match(r'module\s+"([^"]+)"', content)
    provider = _match(r'provider\s+"([^"]+)"', content)
    return {
        "file": filename,
        "resource_type": resource[0] if resource else None,
        "resource_name": resource[1] if resource else None,
        "module_name": module,
        "provider": provider,
    }


def _match(pattern: str, content: str) -> tuple[str, str] | str | None:
    found = re.search(pattern, content, re.MULTILINE)
    if not found:
        return None
    if found.lastindex and found.lastindex >= 2:
        return found.group(1), found.group(2)
    return found.group(1)


def _service_name(meta: dict[str, Any], filename: str) -> str | None:
    if meta.get("resource_name"):
        return str(meta["resource_name"])
    if meta.get("module_name"):
        return str(meta["module_name"])
    return Path(filename).stem or None


def walk_terraform_files(root: Path) -> list[Path]:
    if not root.exists():
        raise FileNotFoundError(f"Scrape path does not exist: {root}")

    patterns = ("*.tf", "*.tfvars", "*.hcl")
    files: list[Path] = []
    for pattern in patterns:
        files.extend(root.rglob(pattern))
    return sorted({path.resolve() for path in files})


def scrape_terraform_filesystem(
    root: Path,
    *,
    environment: str | None = None,
) -> list[Path]:
    queued: list[Path] = []
    for source_path in walk_terraform_files(root):
        content = source_path.read_text(encoding="utf-8")
        meta = _parse_terraform_metadata(content, source_path.name)
        saved = save_raw_file("terraform", source_path.name, content)
        job = build_job(
            source="terraform",
            raw_file=saved,
            environment=environment,
            service_name=_service_name(meta, source_path.name),
            meta={**meta, "source_path": str(source_path)},
        )
        queued.append(enqueue_job(job))
    return queued


def scrape_terraform(
    *,
    path: str | Path | None = None,
    environment: str | None = None,
    mode: str | None = None,
) -> list[Path]:
    selected_mode = (mode or os.environ.get("SCRAPER_TERRAFORM_MODE", "filesystem")).lower()
    if selected_mode != "filesystem":
        raise ValueError(f"Unsupported terraform scraper mode: {selected_mode}")

    root = Path(path or os.environ.get("SCRAPER_TERRAFORM_PATH", "")).expanduser()
    if not str(root):
        raise ValueError("SCRAPER_TERRAFORM_PATH or --path is required for filesystem mode")
    return scrape_terraform_filesystem(root, environment=environment)
