"""Small CLI to demo ingestion chunking functions."""
from __future__ import annotations

import argparse
from pathlib import Path
from .chunker import chunk_by_traceback, chunk_config, chunk_text


def main() -> None:
    p = argparse.ArgumentParser(description="Demo chunker")
    p.add_argument("file", type=Path, help="Input file to chunk")
    p.add_argument("--mode", choices=["log", "config", "text"], default="log")
    args = p.parse_args()

    text = args.file.read_text(encoding="utf8")
    if args.mode == "log":
        chunks = chunk_by_traceback(text)
    elif args.mode == "config":
        chunks = chunk_config(text)
    else:
        chunks = chunk_text(text)

    for i, c in enumerate(chunks, start=1):
        print(f"--- CHUNK {i} (len={len(c.split())}) ---\n{c}\n")


if __name__ == "__main__":
    main()
