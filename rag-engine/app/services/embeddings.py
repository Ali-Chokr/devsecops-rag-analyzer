"""Embedding providers: OpenAI API or local Ollama."""

from app.config import Settings


def embed_query(settings: Settings, text: str) -> list[float] | None:
    if settings.llm_provider == "ollama":
        return _embed_ollama(settings, text)
    if settings.llm_provider == "openai" and settings.openai_api_key:
        return _embed_openai(settings, text)
    return None


def _embed_openai(settings: Settings, text: str) -> list[float]:
    from langchain_openai import OpenAIEmbeddings

    embeddings = OpenAIEmbeddings(
        model=settings.openai_embedding_model,
        api_key=settings.openai_api_key,
    )
    return embeddings.embed_query(text)


def _embed_ollama(settings: Settings, text: str) -> list[float]:
    try:
        from langchain_ollama import OllamaEmbeddings
    except ImportError:
        from langchain_community.embeddings import OllamaEmbeddings

    embeddings = OllamaEmbeddings(
        base_url=settings.ollama_base_url,
        model=settings.ollama_embedding_model,
    )
    return embeddings.embed_query(text)
