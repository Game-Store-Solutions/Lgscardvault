# GitHub Actions deploy secrets

Used by [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).

## Fastest path (recommended)

From your PC (PowerShell), in the repo:

```powershell
# 1) Log into GitHub CLI once (browser)
& "$env:ProgramFiles\GitHub CLI\gh.exe" auth login

# 2) Ensure `ssh lgs` works (enter key passphrase if asked)

# 3) Wire deploy key + secrets + chmod on server
powershell -ExecutionPolicy Bypass -File deploy/scripts/wire-github-deploy.ps1

# 4) Test
& "$env:ProgramFiles\GitHub CLI\gh.exe" workflow run Deploy -R Game-Store-Solutions/Lgscardvault
```

After that: **merge PR → green CI → Deploy runs automatically.**

A passphrase-less key is created at `~/.ssh/lgs_deploy` for Actions only (keep your laptop key separate).

---

## Secrets (set by the script above)

| Secret | Example / notes |
|--------|------------------|
| `DEPLOY_HOST` | `5.78.203.81` |
| `DEPLOY_USER` | `root` |
| `DEPLOY_PATH` | `/opt/lgscardvault/Lgscardvault` |
| `DEPLOY_SSH_KEY` | Private key `~/.ssh/lgs_deploy` |
| `DEPLOY_SSH_PASSPHRASE` | Omit when using `lgs_deploy` |

## Lifecycle

1. Open PR → **CI** runs (tests).
2. Merge to `main` → **CI** on `main`.
3. CI success → **Deploy** SSHs in → `deploy/scripts/deploy.sh`
4. Or **Actions → Deploy → Run workflow**.

## Server prerequisites

- Repo at `DEPLOY_PATH` with working `git pull`
- `/etc/mtgstore/prod.env`
- Docker + Compose
- App on `http://127.0.0.1:8080` (Caddy for public HTTPS)
