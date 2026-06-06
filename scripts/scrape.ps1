# Run K8s/Ansible scrapers and enqueue ingest jobs
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$venvPython = Join-Path $Root "rag-engine\.venv\Scripts\python.exe"
$python = if (Test-Path $venvPython) { $venvPython } else { "python" }

if (-not $env:DATA_DIR) { $env:DATA_DIR = Join-Path $Root "data" }
if (-not $env:SCRAPER_K8S_PATH) { $env:SCRAPER_K8S_PATH = Join-Path $Root "scripts\seed-data\sources\k8s" }
if (-not $env:SCRAPER_ANSIBLE_PATH) { $env:SCRAPER_ANSIBLE_PATH = Join-Path $Root "scripts\seed-data\sources\ansible" }
if (-not $env:SCRAPER_ENVIRONMENT) { $env:SCRAPER_ENVIRONMENT = "staging" }

Write-Host "=== Running infrastructure scrapers ===" -ForegroundColor Cyan
& $python -m app.ingestion.scrape --source all --environment $env:SCRAPER_ENVIRONMENT @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Host "Scrape jobs enqueued. Ensure ingest-worker is running." -ForegroundColor Green
