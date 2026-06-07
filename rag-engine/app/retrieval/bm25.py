"""Optional in-memory BM25 search over retrieved candidate chunks."""

from __future__ import annotations

import re
from typing import Any

from rank_bm25 import BM25Okapi


def tokenize(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z0-9_\-]+", text.lower())


def bm25_rerank(
    query: str,
    candidates: list[dict[str, Any]],
    top_k: int,
) -> list[dict[str, Any]]:
    if not candidates:
        return []

    corpus = [tokenize(item.get("content", "")) for item in candidates]
    if not any(corpus):
        return candidates[:top_k]

    bm25 = BM25Okapi(corpus)
    scores = bm25.get_scores(tokenize(query))
    ranked = sorted(
        zip(candidates, scores, strict=False),
        key=lambda pair: pair[1],
        reverse=True,
    )
    results: list[dict[str, Any]] = []
    for item, score in ranked[:top_k]:
        enriched = dict(item)
        enriched["bm25_score"] = float(score)
        results.append(enriched)
    return results
