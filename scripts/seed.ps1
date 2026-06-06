# Seed realistic DevSecOps sample data into the RAG index
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$venvPython = Join-Path $Root "rag-engine\.venv\Scripts\python.exe"
$python = if (Test-Path $venvPython) { $venvPython } else { "python" }

if (-not $env:RAG_ENGINE_URL) {
    $env:RAG_ENGINE_URL = "http://localhost:8000"
}

Write-Host "=== Seeding DevSecOps sample data ===" -ForegroundColor Cyan
Write-Host "RAG_ENGINE_URL=$($env:RAG_ENGINE_URL)"

& $python (Join-Path $Root "scripts\seed.py") @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Done." -ForegroundColor Green
