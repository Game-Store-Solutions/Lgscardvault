# GitHub Actions deploy secrets

Used by [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml).
Add under GitHub → **Settings** → **Secrets and variables** → **Actions**.

| Secret | Example / notes |
|--------|------------------|
| `DEPLOY_HOST` | `5.78.203.81` (Hetzner public IPv4) |
| `DEPLOY_USER` | `root` |
| `DEPLOY_PATH` | `/opt/lgscardvault/Lgscardvault` |
| `DEPLOY_SSH_KEY` | **Private** key PEM for a key authorized on the server (`-----BEGIN OPENSSH PRIVATE KEY-----` …) |
| `DEPLOY_SSH_PASSPHRASE` | Only if that private key has a passphrase; otherwise omit |

## Recommended: dedicated deploy key (not your laptop key)

On your PC:

```powershell
ssh-keygen -t ed25519 -f $env:USERPROFILE\.ssh\lgs_deploy -C "github-actions-deploy" -N '""'
Get-Content $env:USERPROFILE\.ssh\lgs_deploy.pub
```

On the server (`ssh lgs`):

```bash
mkdir -p /root/.ssh
echo 'PASTE_PUBLIC_KEY_LINE_HERE' >> /root/.ssh/authorized_keys
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys
```

In GitHub Actions secrets, paste the **private** file contents (`lgs_deploy`, not `.pub`) as `DEPLOY_SSH_KEY`.

## Lifecycle

1. Open PR → **CI** runs (tests).
2. Merge to `main` → **CI** runs on `main`.
3. If CI succeeds → **Deploy** workflow SSHs in and runs `deploy/scripts/deploy.sh`
   (`git pull` → `compose build` → migrate → `up -d` → smoke `/health*`).
4. Or run **Actions → Deploy → Run workflow** manually.

## Server prerequisites

- Repo checked out at `DEPLOY_PATH` with `git pull` working (HTTPS or deploy key to GitHub).
- `/etc/mtgstore/prod.env` present.
- Docker + Compose installed.
- Frontend reachable at `http://127.0.0.1:8080` (Caddy terminates public HTTPS).
