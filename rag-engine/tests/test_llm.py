from app.services.llm import build_prompt, summarize_snippet


def test_build_prompt_includes_context_and_history():
    prompt = build_prompt(
        "error X-402",
        [{"content": "timeout reduced", "source_type": "ansible", "metadata": {}}],
        [{"role": "user", "content": "What failed?"}],
    )
    assert "error X-402" in prompt
    assert "timeout reduced" in prompt
    assert "User: What failed?" in prompt


def test_summarize_snippet_truncates():
    text = "a" * 300
    result = summarize_snippet(text, 50)
    assert len(result) <= 50
    assert result.endswith("...")
