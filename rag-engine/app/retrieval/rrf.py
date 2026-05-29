"""Reciprocal Rank Fusion for merging dense and sparse retrieval results."""

from collections import defaultdict
from typing import Any


def reciprocal_rank_fusion(
    ranked_lists: list[list[dict[str, Any]]],
    k: int = 60,
    id_key: str = "id",
) -> list[dict[str, Any]]:
    """
    Merge multiple ranked result lists using RRF.
    Each item in ranked_lists should be ordered best-first.
    """
    scores: dict[str, float] = defaultdict(float)
    items: dict[str, dict[str, Any]] = {}

    for ranked in ranked_lists:
        for rank, item in enumerate(ranked, start=1):
            item_id = str(item[id_key])
            scores[item_id] += 1.0 / (k + rank)
            if item_id not in items:
                items[item_id] = item

    merged_ids = sorted(scores.keys(), key=lambda x: scores[x], reverse=True)
    return [{**items[i], "rrf_score": scores[i]} for i in merged_ids]
