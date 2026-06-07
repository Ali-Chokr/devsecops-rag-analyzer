from app.retrieval.rrf import reciprocal_rank_fusion


def test_rrf_merges_dense_and_sparse_results():
    dense = [{"id": "a", "content": "first"}, {"id": "b", "content": "second"}]
    sparse = [{"id": "b", "content": "second"}, {"id": "c", "content": "third"}]
    merged = reciprocal_rank_fusion([dense, sparse], k=60)
    ids = [item["id"] for item in merged]
    assert "b" in ids
    assert len(ids) == 3
