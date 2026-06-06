"""Ansible playbook fetcher (filesystem or git remote)."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

from .common import build_job, enqueue_job, save_raw_file, walk_yaml_files


def _parse_ansible_metadata(content: str, filename: str) -> dict[str, Any]:
    playbook_name = _match(r'^- name:\s*(.+)$', content)
    hosts = _match(r'^\s*hosts:\s*(\S+)', content)
    service_name = _match(r'^\s*service_name:\s*(\S+)', content)
    return {
        "file": filename,
        "playbook_name": playbook_name,
        "hosts": hosts,
        "service_name": service_name,
    }


def _match(pattern: str, content: str) -> str | None:
    found = re.search(pattern, content, re.MULTILINE)
    return found.group(1).strip() if found else None


def _service_name(meta: dict[str, Any], filename: str) -> str | None:
    if meta.get("service_name"):
        return str(meta["service_name"])
    stem = Path(filename).stem
    for suffix in ("-staging", "-prod", "-production", "-dev"):
        if stem.endswith(suffix):
            return stem[: -len(suffix)]
    return stem or None


def scrape_ansible_filesystem(
    root: Path,
    *,
    environment: str | None = None,
) -> list[Path]:
    queued: list[Path] = []
    for source_path in walk_yaml_files(root):
        content = source_path.read_text(encoding="utf-8")
        meta = _parse_ansible_metadata(content, source_path.name)
        saved = save_raw_file("ansible", source_path.name, content)
        job = build_job(
            source="ansible",
            raw_file=saved,
            environment=environment or meta.get("hosts"),
            service_name=_service_name(meta, source_path.name),
            meta=meta,
        )
        queued.append(enqueue_job(job))
    return queued


def _git_cache_dir() -> Path:
    return Path(__file__).resolve().parents[4] / "data" / "cache" / "ansible-git"


def scrape_ansible_git(
    repo_url: str,
    *,
    branch: str = "main",
    environment: str | None = None,
    playbook_subpath: str = "",
) -> list[Path]:
    cache_dir = _git_cache_dir()
    if cache_dir.exists() and (cache_dir / ".git").exists():
        subprocess.run(["git", "-C", str(cache_dir), "fetch", "--all"], check=True)
        subprocess.run(["git", "-C", str(cache_dir), "checkout", branch], check=True)
        subprocess.run(["git", "-C", str(cache_dir), "pull", "origin", branch], check=True)
    else:
        cache_dir.parent.mkdir(parents=True, exist_ok=True)
        if cache_dir.exists():
            shutil.rmtree(cache_dir)
        subprocess.run(["git", "clone", "--branch", branch, repo_url, str(cache_dir)], check=True)

    scan_root = cache_dir / playbook_subpath if playbook_subpath else cache_dir
    queued = scrape_ansible_filesystem(scan_root, environment=environment)
    for job_file in queued:
        # tag jobs as git-sourced
        import json

        payload = json.loads(job_file.read_text(encoding="utf-8"))
        payload["job"]["meta"]["mode"] = "git"
        payload["job"]["meta"]["repo_url"] = repo_url
        job_file.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return queued


def scrape_ansible(
    *,
    path: str | Path | None = None,
    environment: str | None = None,
    mode: str | None = None,
    repo_url: str | None = None,
    branch: str | None = None,
    playbook_subpath: str = "",
) -> list[Path]:
    selected_mode = (mode or os.environ.get("SCRAPER_ANSIBLE_MODE", "filesystem")).lower()
    if selected_mode == "git":
        git_url = repo_url or os.environ.get("SCRAPER_ANSIBLE_GIT_URL")
        if not git_url:
            raise ValueError("SCRAPER_ANSIBLE_GIT_URL or --repo-url is required for git mode")
        return scrape_ansible_git(
            git_url,
            branch=branch or os.environ.get("SCRAPER_ANSIBLE_GIT_BRANCH", "main"),
            environment=environment,
            playbook_subpath=playbook_subpath or os.environ.get("SCRAPER_ANSIBLE_SUBPATH", ""),
        )

    root = Path(path or os.environ.get("SCRAPER_ANSIBLE_PATH", "")).expanduser()
    if not str(root):
        raise ValueError("SCRAPER_ANSIBLE_PATH or --path is required for filesystem mode")
    return scrape_ansible_filesystem(root, environment=environment)
