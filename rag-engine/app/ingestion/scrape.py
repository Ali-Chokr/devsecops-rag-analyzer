"""CLI for K8s/Ansible scrapers.

Examples:
  python -m app.ingestion.scrape --source k8s
  python -m app.ingestion.scrape --source ansible --environment staging
  python -m app.ingestion.scrape --source all --daemon
"""
from __future__ import annotations

import argparse
import os
import time

from .scrapers.ansible import scrape_ansible
from .scrapers.k8s import scrape_k8s
from .scrapers.terraform import scrape_terraform


def run_once(args: argparse.Namespace) -> int:
    environment = args.environment or os.environ.get("SCRAPER_ENVIRONMENT")
    queued: list = []

    if args.source in ("k8s", "all"):
        jobs = scrape_k8s(
            path=args.path,
            environment=environment,
            mode=args.mode,
            namespace=args.namespace,
        )
        queued.extend(jobs)
        print(f"K8s scraper enqueued {len(jobs)} job(s)")

    if args.source in ("ansible", "all"):
        jobs = scrape_ansible(
            path=args.path,
            environment=environment,
            mode=args.mode,
            repo_url=args.repo_url,
            branch=args.branch,
            playbook_subpath=args.subpath,
        )
        queued.extend(jobs)
        print(f"Ansible scraper enqueued {len(jobs)} job(s)")

    if args.source in ("terraform", "all"):
        jobs = scrape_terraform(
            path=args.path,
            environment=environment,
            mode=args.mode,
        )
        queued.extend(jobs)
        print(f"Terraform scraper enqueued {len(jobs)} job(s)")

    print(f"Total jobs enqueued: {len(queued)}")
    return len(queued)


def main() -> int:
    parser = argparse.ArgumentParser(description="Scrape K8s manifests and Ansible playbooks")
    parser.add_argument(
        "--source",
        choices=["k8s", "ansible", "terraform", "all"],
        default="all",
    )
    parser.add_argument("--path", help="Filesystem root to scan (overrides SCRAPER_*_PATH)")
    parser.add_argument("--environment", help="Environment tag for ingested chunks")
    parser.add_argument("--mode", choices=["filesystem", "api", "git"], help="Scraper mode override")
    parser.add_argument("--namespace", help="Kubernetes namespace for api mode")
    parser.add_argument("--repo-url", help="Git repo URL for ansible git mode")
    parser.add_argument("--branch", default="main", help="Git branch for ansible git mode")
    parser.add_argument("--subpath", default="", help="Subdirectory within git repo to scan")
    parser.add_argument(
        "--daemon",
        action="store_true",
        help="Run continuously using SCRAPER_INTERVAL_SECONDS",
    )
    args = parser.parse_args()

    interval = int(os.environ.get("SCRAPER_INTERVAL_SECONDS", "0"))
    if args.daemon:
        if interval <= 0:
            interval = 300
        print(f"Starting scraper daemon (interval={interval}s)")
        while True:
            try:
                run_once(args)
            except Exception as exc:
                print(f"Scrape cycle failed: {exc}")
            time.sleep(interval)
        return 0

    run_once(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
