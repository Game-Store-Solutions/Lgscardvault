# One-time local bootstrap (Windows PowerShell): dependencies, JWT keys,
# migrations, seed data. For day-to-day running use .\start-dev.ps1 instead.
# Run after Docker Desktop is up.

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

Write-Host "Starting Postgres + Mailpit..."
docker compose up -d

Write-Host "Backend setup..."
Set-Location backend
if (-not (Test-Path .env.local)) {
  Copy-Item .env.local.example .env.local
  Write-Host "Created backend/.env.local from example — add your Square sandbox keys."
}
composer install --no-interaction
php bin/console lexik:jwt:generate-keypair --skip-if-exists
if ($LASTEXITCODE -ne 0) {
  Write-Host "Lexik keygen failed (common on Windows). Using config/openssl.cnf fallback..."
  $env:OPENSSL_CONF = Join-Path (Get-Location) "config\openssl.cnf"
  php bin/generate-jwt-keys.php
}
php bin/console doctrine:migrations:migrate --no-interaction
php bin/console app:seed

Write-Host ""
Write-Host "Dev stack ready. In separate terminals run:"
Write-Host "  cd backend; php -S 127.0.0.1:8000 -t public"
Write-Host "  cd frontend; npm install; npm run dev"
Write-Host ""
Write-Host "Frontend: http://localhost:5173"
Write-Host "API docs: http://127.0.0.1:8000/api/docs"
Write-Host "Mailpit:  http://localhost:8025"
