"""Hybrid retrieval: pgvector dense search + PostgreSQL full-text (BM25-style) + RRF."""

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import Settings
from app.retrieval.rrf import reciprocal_rank_fusion


def dense_search(session: Session, query_embedding: list[float], top_k: int) -> list[dict[str, Any]]:
    sql = text(
        """
        SELECT id::text, content, metadata, source_type,
               1 - (embedding <=> :embedding::vector) AS dense_score
        FROM document_chunks
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> :embedding::vector
        LIMIT :top_k
        """
    )
    rows = session.execute(
        sql,
        {"embedding": str(query_embedding), "top_k": top_k},
    ).mappings().all()
    return [dict(r) for r in rows]


def sparse_search(session: Session, query: str, top_k: int) -> list[dict[str, Any]]:
    sql = text(
        """
        SELECT id::text, content, metadata, source_type,
               ts_rank(content_tsv, plainto_tsquery('english', :query)) AS sparse_score
        FROM document_chunks
        WHERE content_tsv @@ plainto_tsquery('english', :query)
        ORDER BY sparse_score DESC
        LIMIT :top_k
        """
    )
    rows = session.execute(sql, {"query": query, "top_k": top_k}).mappings().all()
    return [dict(r) for r in rows]


def hybrid_retrieve(
    session: Session,
    settings: Settings,
    query: str,
    query_embedding: list[float] | None,
) -> list[dict[str, Any]]:
    top_k = settings.retrieval_top_k
    dense_results: list[dict[str, Any]] = []
    if query_embedding:
        dense_results = dense_search(session, query_embedding, top_k)

    sparse_results = sparse_search(session, query, top_k)

    if not dense_results and not sparse_results:
        return []

    if not dense_results:
        return sparse_results[:top_k]
    if not sparse_results:
        return dense_results[:top_k]

    return reciprocal_rank_fusion(
        [dense_results, sparse_results],
        k=settings.rrf_k,
        id_key="id",
    )[:top_k]
