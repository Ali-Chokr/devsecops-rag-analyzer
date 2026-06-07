from app.retrieval.hybrid import (
    _sparse_query_terms,
    dedupe_by_seed_file,
    diversify_by_source_type,
)


def test_sparse_query_terms_extracts_error_codes():
    terms = _sparse_query_terms(
        "X-402 payment service staging deploy failure on 192.168.1.50"
    )
    assert "X-402" in terms
    assert "192.168.1.50" in terms


def test_diversify_limits_single_source_type():
    chunks = [
        {"id": "1", "source_type": "gitlab_ci", "sparse_score": 1.0},
        {"id": "2", "source_type": "gitlab_ci", "sparse_score": 0.9},
        {"id": "3", "source_type": "k8s", "sparse_score": 0.8},
        {"id": "4", "source_type": "log", "sparse_score": 0.7},
    ]
    result = diversify_by_source_type(chunks, top_k=4, max_per_type=1)
    types = [c["source_type"] for c in result]
    assert types.count("gitlab_ci") == 1
    assert "k8s" in types
    assert "log" in types


def test_dedupe_by_seed_file():
    chunks = [
        {"id": "1", "metadata": {"seed_file": "a.json"}, "source_type": "log"},
        {"id": "2", "metadata": {"seed_file": "a.json"}, "source_type": "log"},
        {"id": "3", "metadata": {"seed_file": "b.json"}, "source_type": "k8s"},
    ]
    result = dedupe_by_seed_file(chunks)
    assert len(result) == 2
    assert {c["id"] for c in result} == {"1", "3"}
