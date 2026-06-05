"""Simple chunking heuristics for configs and logs.

This module provides lightweight functions used during ingestion to split
large documents into smaller chunks suitable for embedding and indexing.
"""
from __future__ import annotations

import re
from typing import Iterable, List


def chunk_text(text: str, max_tokens: int = 500) -> List[str]:
    """Very small heuristic chunker that splits on paragraph breaks and keeps
    chunks under approximately `max_tokens` words (not exact tokens).
    """
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    chunks: List[str] = []
    current: List[str] = []
    current_len = 0

    for p in paragraphs:
        words = p.split()
        if current_len + len(words) <= max_tokens:
            current.append(p)
            current_len += len(words)
        else:
            if current:
                chunks.append("\n\n".join(current))
            # if single paragraph is too long, chunk it by sentences
            if len(words) > max_tokens:
                sentences = re.split(r'(?<=[.!?])\s+', p)
                buf: List[str] = []
                buf_len = 0
                for s in sentences:
                    s_words = s.split()
                    if buf_len + len(s_words) <= max_tokens:
                        buf.append(s)
                        buf_len += len(s_words)
                    else:
                        chunks.append(" ".join(buf))
                        buf = [s]
                        buf_len = len(s_words)
                if buf:
                    chunks.append(" ".join(buf))
                current = []
                current_len = 0
            else:
                current = [p]
                current_len = len(words)

    if current:
        chunks.append("\n\n".join(current))

    return chunks


TRACEBACK_SPLIT_RE = re.compile(r"(^\s*Traceback \(most recent call last\):|\n\s*Traceback \(most recent call last\):)", re.I)


def chunk_by_traceback(log_text: str, max_lines: int = 200) -> List[str]:
    """Split logs by traceback blocks and by time windows when possible.

    Heuristic:
    - Split at occurrences of Python-like "Traceback (most recent call last):".
    - Otherwise, split into windows of `max_lines` lines.
    """
    parts: List[str] = []
    if TRACEBACK_SPLIT_RE.search(log_text):
        # split but keep the delimiter with the following block
        pieces = TRACEBACK_SPLIT_RE.split(log_text)
        # pieces alternates between segments and delimiter tokens; rebuild
        i = 0
        while i < len(pieces):
            if TRACEBACK_SPLIT_RE.match(pieces[i]):
                # delimiter at pieces[i]
                if i + 1 < len(pieces):
                    parts.append(pieces[i] + pieces[i + 1])
                    i += 2
                else:
                    parts.append(pieces[i])
                    i += 1
            else:
                parts.append(pieces[i])
                i += 1
    else:
        lines = [l for l in log_text.splitlines() if l.strip() or True]
        for i in range(0, len(lines), max_lines):
            parts.append("\n".join(lines[i : i + max_lines]))

    # post-process small parts by merging adjacent small ones
    merged: List[str] = []
    for p in parts:
        if not merged:
            merged.append(p)
        elif len(p.split()) < 50 and len(merged[-1].split()) < 50:
            merged[-1] = merged[-1] + "\n\n" + p
        else:
            merged.append(p)

    return [m for m in merged if m.strip()]


def chunk_config(config_text: str) -> List[str]:
    """Chunk configuration files by logical blocks.

    Heuristics:
    - For YAML/Ansible: split on document separators (`---`) or on top-level anchors
    - For Kubernetes manifests (YAML): split on `---`
    - For scripts: split on comment separators and function definitions
    """
    if "---" in config_text:
        docs = [d.strip() for d in config_text.split("---") if d.strip()]
        return docs

    # split by two or more newlines (logical block)
    blocks = [b.strip() for b in re.split(r"\n\s*\n{1,}", config_text) if b.strip()]
    return blocks


if __name__ == "__main__":
    # small demo when run as script
    sample = """
    ERROR: something failed

    Traceback (most recent call last):
      File "/app/main.py", line 10, in <module>
        main()
    Exception: boom
    """
    print("Chunks by traceback:\n")
    for i, c in enumerate(chunk_by_traceback(sample)):
        print(f"--- chunk {i+1} ---\n{c}\n")
