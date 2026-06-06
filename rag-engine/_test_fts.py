from sqlalchemy import create_engine, text

e = create_engine(
    "postgresql+psycopg://devops_rag:devops_rag_secret@localhost:5432/devops_rag"
)
queries = [
    "X-402",
    "error code X-402",
    "We got error code X-402 on the production server. Based on our deployment scripts and past logs, what configuration change likely caused this?",
]
with e.connect() as c:
    for q in queries:
        n = c.execute(
            text(
                "SELECT COUNT(*) FROM document_chunks "
                "WHERE content_tsv @@ plainto_tsquery('english', :q)"
            ),
            {"q": q},
        ).scalar()
        print(f"{n} hits for: {q[:60]}...")
