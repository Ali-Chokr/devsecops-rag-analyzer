# DevSecOps RAG Analyzer - first-time setup (Windows PowerShell)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "=== DevSecOps RAG Analyzer setup ===" -ForegroundColor Cyan

if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "Created .env from .env.example - add OPENAI_API_KEY or set LLM_PROVIDER=ollama" -ForegroundColor Yellow
}

$venvPath = Join-Path $Root "rag-engine\.venv"
if (-not (Test-Path $venvPath)) {
    Write-Host "Creating Python venv in rag-engine/.venv ..." -ForegroundColor Green
    python -m venv $venvPath
}
$pip = Join-Path $venvPath "Scripts\pip.exe"
& $pip install --upgrade pip
& $pip install -r (Join-Path $Root "rag-engine\requirements.txt")

Write-Host "Node dependencies (backend + frontend) ..." -ForegroundColor Green
Set-Location (Join-Path $Root "backend")
npm install
Set-Location (Join-Path $Root "frontend")
npm install

Set-Location $Root
Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "Next steps:"
Write-Host "  1. Install Docker Desktop for PostgreSQL"
Write-Host "  2. docker compose up -d postgres"
Write-Host "  3. Terminal A: cd backend; npm run start:dev"
Write-Host "  4. Terminal B: cd rag-engine; activate venv; uvicorn app.main:app --reload --port 8000"
Write-Host "  5. Terminal C: cd frontend; npm start"
Write-Host "  6. Seed demo data: .\scripts\seed.ps1"
Write-Host "  7. Open devops-rag-assistant.code-workspace in Cursor"
