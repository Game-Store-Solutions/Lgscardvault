# One-shot: wire GitHub Actions → Hetzner auto-deploy
#
# Run in PowerShell from anywhere after:
#   1) You can `ssh lgs` (laptop key)
#   2) `gh auth login` once (repo access)
#
# This script:
#   - Ensures a passphrase-less deploy key exists (~/.ssh/lgs_deploy)
#   - Installs the public key on the VPS authorized_keys
#   - Sets GitHub Actions secrets for the Deploy workflow
#   - Pulls latest main on the server and chmod +x deploy.sh

$ErrorActionPreference = "Stop"
$Repo = "Game-Store-Solutions/Lgscardvault"
$DeployHost = "5.78.203.81"
$DeployUser = "root"
$DeployPath = "/opt/lgscardvault/Lgscardvault"
$KeyPath = Join-Path $env:USERPROFILE ".ssh\lgs_deploy"
$PubPath = "$KeyPath.pub"

$gh = "${env:ProgramFiles}\GitHub CLI\gh.exe"
if (-not (Test-Path $gh)) {
  $cmd = Get-Command gh -ErrorAction SilentlyContinue
  if (-not $cmd) { throw "GitHub CLI (gh) not found. Install: winget install GitHub.cli" }
  $gh = $cmd.Source
}

if (-not (Test-Path $KeyPath)) {
  ssh-keygen -t ed25519 -f $KeyPath -C "github-actions-lgs-deploy" -N '""'
}

Write-Host "==> Checking gh auth..."
& $gh auth status
if ($LASTEXITCODE -ne 0) {
  Write-Host "Run: gh auth login"
  throw "gh not authenticated"
}

Write-Host "==> Installing deploy public key on server (uses your ssh Host 'lgs')..."
$pub = (Get-Content $PubPath -Raw).Trim()
$remote = @"
set -euo pipefail
mkdir -p /root/.ssh
chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
grep -qxF '$pub' /root/.ssh/authorized_keys || echo '$pub' >> /root/.ssh/authorized_keys
cd $DeployPath
git pull --ff-only origin main || true
chmod +x deploy/scripts/deploy.sh
echo SERVER_WIRED_OK
"@
ssh lgs $remote

Write-Host "==> Setting GitHub Actions secrets on $Repo ..."
$priv = Get-Content $KeyPath -Raw
echo $DeployHost | & $gh secret set DEPLOY_HOST -R $Repo
echo $DeployUser | & $gh secret set DEPLOY_USER -R $Repo
echo $DeployPath | & $gh secret set DEPLOY_PATH -R $Repo
$priv | & $gh secret set DEPLOY_SSH_KEY -R $Repo

Write-Host "==> Done. Trigger a test deploy:"
Write-Host "  gh workflow run Deploy -R $Repo"
Write-Host "Or merge a PR to main (after green CI)."
