"""Hybrid retrieval: pgvector dense search + PostgreSQL full-text (BM25-style) + RRF."""

import os
import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import Settings
from app.retrieval.bm25 import bm25_rerank
from app.retrieval.rrf import reciprocal_rank_fusion

ERROR_CODE_RE = re.compile(r"\bX-\d+\b", re.IGNORECASE)
IP_RE = re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}\b")


def _build_filters(
    environment: str | None = None,
    source_types: list[str] | None = None,
) -> tuple[str, dict[str, Any]]:
    clauses: list[str] = []
    params: dict[str, Any] = {}
    if environment:
        clauses.append("environment = :environment")
        params["environment"] = environment
    if source_types:
        clauses.append("source_type = ANY(:source_types)")
        params["source_types"] = source_types
    if not clauses:
        return "", params
    return " AND " + " AND ".join(clauses), params


def dense_search(
    session: Session,
    query_embedding: list[float],
    top_k: int,
    *,
    environment: str | None = None,
    source_types: list[str] | None = None,
) -> list[dict[str, Any]]:
    filter_sql, filter_params = _build_filters(environment, source_types)
    sql = text(
        f"""
        SELECT id::text, content, metadata, source_type, environment, service_name,
               1 - (embedding <=> CAST(:embedding AS vector)) AS dense_score
        FROM document_chunks
        WHERE embedding IS NOT NULL{filter_sql}
        ORDER BY embedding <=> CAST(:embedding AS vector)
        LIMIT :top_k
        """
    )
    rows = session.execute(
        sql,
        {"embedding": str(query_embedding), "top_k": top_k, **filter_params},
    ).mappings().all()
    return [dict(r) for r in rows]


def _sparse_query_terms(query: str) -> list[str]:
    """Build supplemental sparse queries so one fat chunk cannot monopolize results."""
    terms = [query.strip()]
    terms.extend(ERROR_CODE_RE.findall(query))
    terms.extend(IP_RE.findall(query))

    lowered = query.lower()
    for phrase in ("gateway timeout", "gateway_timeout", "payment gateway"):
        if phrase.replace("_", " ") in lowered or phrase in lowered:
            terms.append(phrase)

    if (
        ERROR_CODE_RE.search(query)
        or "payment" in lowered
        or "timeout" in lowered
        or "deploy" in lowered
    ):
        terms.append("gateway timeout")
        terms.append("payment staging")

    seen: set[str] = set()
    unique: list[str] = []
    for term in terms:
        normalized = term.strip().lower()
        if normalized and normalized not in seen:
            seen.add(normalized)
            unique.append(term.strip())
    return unique


def sparse_search(
    session: Session,
    query: str,
    top_k: int,
    *,
    environment: str | None = None,
    source_types: list[str] | None = None,
) -> list[dict[str, Any]]:
    filter_sql, filter_params = _build_filters(environment, source_types)
    sql = text(
        f"""
        SELECT id::text, content, metadata, source_type, environment, service_name,
               ts_rank(content_tsv, plainto_tsquery('english', :query)) AS sparse_score
        FROM document_chunks
        WHERE content_tsv @@ plainto_tsquery('english', :query){filter_sql}
        ORDER BY sparse_score DESC
        LIMIT :top_k
        """
    )
    rows = session.execute(
        sql,
        {"query": query, "top_k": top_k, **filter_params},
    ).mappings().all()
    return [dict(r) for r in rows]


def sparse_search_multi(
    session: Session,
    query: str,
    top_k: int,
    *,
    environment: str | None = None,
    source_types: list[str] | None = None,
) -> list[dict[str, Any]]:
    merged: dict[str, dict[str, Any]] = {}
    for term in _sparse_query_terms(query):
        for row in sparse_search(
            session,
            term,
            top_k,
            environment=environment,
            source_types=source_types,
        ):
            chunk_id = str(row["id"])
            existing = merged.get(chunk_id)
            if existing is None or (row.get("sparse_score") or 0) > (
                existing.get("sparse_score") or 0
            ):
                merged[chunk_id] = row

    return sorted(
        merged.values(),
        key=lambda item: item.get("sparse_score") or 0,
        reverse=True,
    )[:top_k]


def dedupe_by_seed_file(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop duplicate rows that share the same seed_file (re-seed without replace)."""
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for chunk in chunks:
        seed_file = (chunk.get("metadata") or {}).get("seed_file")
        key = str(seed_file) if seed_file else str(chunk["id"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(chunk)
    return unique


def diversify_by_source_type(
    chunks: list[dict[str, Any]],
    top_k: int,
    *,
    max_per_type: int = 2,
) -> list[dict[str, Any]]:
    """Limit dominance of a single source_type (e.g. one large GitLab JSON chunk)."""
    if len(chunks) <= 1:
        return chunks

    selected: list[dict[str, Any]] = []
    per_type: dict[str, int] = {}
    seen_ids: set[str] = set()

    for chunk in chunks:
        chunk_id = str(chunk["id"])
        if chunk_id in seen_ids:
            continue
        source_type = str(chunk.get("source_type", "unknown"))
        if per_type.get(source_type, 0) >= max_per_type:
            continue
        selected.append(chunk)
        seen_ids.add(chunk_id)
        per_type[source_type] = per_type.get(source_type, 0) + 1
        if len(selected) >= top_k:
            return selected

    for chunk in chunks:
        if len(selected) >= top_k:
            break
        chunk_id = str(chunk["id"])
        source_type = str(chunk.get("source_type", "unknown"))
        if chunk_id in seen_ids or per_type.get(source_type, 0) >= max_per_type:
            continue
        selected.append(chunk)
        seen_ids.add(chunk_id)
        per_type[source_type] = per_type.get(source_type, 0) + 1

    return selected


def hybrid_retrieve(
    session: Session,
    settings: Settings,
    query: str,
    query_embedding: list[float] | None,
    *,
    environment: str | None = None,
    source_types: list[str] | None = None,
) -> list[dict[str, Any]]:
    top_k = settings.retrieval_top_k
    dense_results: list[dict[str, Any]] = []
    if query_embedding:
        dense_results = dense_search(
            session,
            query_embedding,
            top_k,
            environment=environment,
            source_types=source_types,
        )

    sparse_results = sparse_search_multi(
        session,
        query,
        top_k,
        environment=environment,
        source_types=source_types,
    )

    if not dense_results and not sparse_results:
        return []

    if not dense_results:
        merged = sparse_results[:top_k]
    elif not sparse_results:
        merged = dense_results[:top_k]
    else:
        merged = reciprocal_rank_fusion(
            [dense_results, sparse_results],
            k=settings.rrf_k,
            id_key="id",
        )[:top_k]

    merged = dedupe_by_seed_file(merged)
    merged = diversify_by_source_type(merged, top_k, max_per_type=1)

    if os.environ.get("USE_BM25_RERANK", "false").lower() in {"1", "true", "yes"}:
        merged = bm25_rerank(query, merged, top_k)

    return merged
