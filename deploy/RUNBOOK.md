# Operations runbook

Operational reference for running the MTG Store platform in production. Pairs
with the [Production configuration](../architecture/local-development.md#production-configuration) guide
section (secrets, container images, health probes).

**First time going live?** Start with [`LAUNCH.md`](LAUNCH.md) (DNS, secrets
template, JWT volume, Square production, smoke tests). Use this runbook for
ongoing releases and operations.

- Secrets template: [`prod.env.example`](prod.env.example)
- Backend image: [`backend/Dockerfile`](../backend/Dockerfile) (FrankenPHP)
- Frontend image: [`frontend/Dockerfile`](../frontend/Dockerfile) (nginx)
- Worker supervision: [`deploy/systemd/`](systemd/) · [`deploy/supervisor/`](supervisor/)
- Reference composition: [`deploy/docker-compose.prod.yml`](docker-compose.prod.yml)

---

## 1. Secrets

Never use the committed `backend/.env` values in production. Inject real values
via an env file (`/etc/mtgstore/prod.env`) or a secrets manager. Required:

| Variable | Notes |
|----------|-------|
| `APP_ENV` | `prod` |
| `APP_SECRET` | `openssl rand -hex 16` |
| `DATABASE_URL` | production PostgreSQL DSN |
| `JWT_PASSPHRASE` | passphrase for the JWT keypair (below) |
| `MESSENGER_TRANSPORT_DSN` / `MESSENGER_FAILED_TRANSPORT_DSN` | queue + dead-letter |
| `CORS_ALLOW_ORIGIN` | regex for the real frontend origin(s) |
| `MAILER_DSN` | Resend: `resend+api://YOUR_API_KEY@default` |
| `SENTRY_DSN` | optional; enables error tracking when set |

**JWT keypair** is not committed (gitignored). Generate it once in the target
environment (and re-run only during a deliberate key rotation — it invalidates
all issued tokens):

```bash
php bin/console lexik:jwt:generate-keypair --skip-if-exists
```

> If login returns *"An error occurred while trying to encode the JWT token"*,
> the keypair and `JWT_PASSPHRASE` are out of sync — regenerate with
> `--overwrite` (see README troubleshooting).

---

## 2. Release / deploy

**Preferred:** merge to `main` with green CI → GitHub Actions **Deploy** runs
[`scripts/deploy.sh`](scripts/deploy.sh) on the VPS (see [`GITHUB_SECRETS.md`](GITHUB_SECRETS.md)).

**Manual** (SSH on the server), in order:

```bash
cd /opt/lgscardvault/Lgscardvault   # or your DEPLOY_PATH
./deploy/scripts/deploy.sh
```

Equivalent steps:

```bash
# 1. Pull/build the new images.
docker compose -f deploy/docker-compose.prod.yml --env-file /etc/mtgstore/prod.env build

# 2. Run DB migrations BEFORE swapping app containers.
docker compose -f deploy/docker-compose.prod.yml run --rm backend \
  php bin/console doctrine:migrations:migrate --no-interaction

# 3. Roll the app + worker + frontend.
docker compose -f deploy/docker-compose.prod.yml --env-file /etc/mtgstore/prod.env up -d

# 4. Smoke-check.
curl -fsS https://your-host/health           # liveness
curl -fsS https://your-host/health/ready      # readiness (DB reachable)
```

Migrations are forward-only and safe to run while the old version serves; roll
app containers after they complete.

---

## 3. Workers (CSV import + catalog sync)

Imports and catalog syncs run on Symfony Messenger workers — **if no worker
runs, uploads queue forever**. Supervise them so a crash auto-restarts and
long-lived PHP memory growth is bounded:

- **systemd:** [`deploy/systemd/mtgstore-worker@.service`](systemd/mtgstore-worker@.service)
  → `systemctl enable --now mtgstore-worker@1 mtgstore-worker@2`
- **supervisor:** [`deploy/supervisor/mtgstore-worker.conf`](supervisor/mtgstore-worker.conf)
- **compose:** the `worker` service (replicas: 2) in the prod compose

Each worker runs with `--time-limit=3600 --memory-limit=256M`, exiting cleanly
so the supervisor restarts it. Multiple workers are safe (rows are claimed with
`SELECT … FOR UPDATE SKIP LOCKED`).

### Dead-letter queue

Messages that exhaust their retries go to the `failed` transport instead of
being lost:

```bash
php bin/console messenger:failed:show          # list
php bin/console messenger:failed:show <id> -vv # inspect one (stack trace)
php bin/console messenger:failed:retry <id>    # requeue after fixing the cause
php bin/console messenger:failed:remove <id>   # drop
```

A terminal failure is also reported to Sentry (when `SENTRY_DSN` is set).

---

## 4. Catalog sync

The local `cards` catalog only replaces the Scryfall API once it holds every
printing. Seed and refresh it with the **all-printings** dataset (streams, safe
to run long — schedule via cron, e.g. nightly, to keep prices current):

```bash
php bin/console app:scryfall:sync            # default_cards (all printings)
```

The admin endpoint (`POST /api/admin/scryfall/sync`) dispatches to the worker
and returns 202; use the CLI for the initial full sync.

---

## 5. Backups & disaster recovery

**What to back up:** the PostgreSQL database is the only stateful component.
Uploaded CSVs are not persisted to disk (rows live in the DB); the catalog can
be rebuilt from Scryfall; the JWT keypair should be backed up separately (its
loss logs everyone out but is otherwise recoverable by regenerating).

**Nightly logical backup + retention:**

```bash
# Back up (run from cron; store off-host, e.g. object storage).
pg_dump "$DATABASE_URL" --format=custom --file="store-$(date +%F).dump"

# Restore into a fresh database.
pg_restore --clean --if-exists --dbname "$DATABASE_URL" store-YYYY-MM-DD.dump
```

- Keep ≥7 daily + ≥4 weekly copies off-host; encrypt at rest.
- For low RPO, also enable continuous archiving (WAL) / use a managed Postgres
  with point-in-time recovery.
- **Test restores regularly** — restore last night's dump into a scratch DB and
  run `php bin/console doctrine:migrations:up-to-date` + the `/health/ready`
  probe. A backup you haven't restored is not a backup.

---

## 6. Log rotation

Per-import logs accumulate under `var/log/imports/import-<jobId>.log` and the
app/worker logs under `var/log/`. Rotate them (example `/etc/logrotate.d/mtgstore`):

```
/var/www/mtgstore/backend/var/log/*.log /var/www/mtgstore/backend/var/log/imports/*.log {
    weekly
    rotate 8
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
```

In containers, logs go to stdout/stderr and are handled by the container log
driver — configure rotation there (e.g. Docker `json-file` `max-size`/`max-file`).

---

## 7. Monitoring checklist

- **Uptime:** poll `/health` (liveness) and `/health/ready` (readiness) from
  your monitor; page on readiness failures.
- **Errors:** set `SENTRY_DSN` to capture 5xx and terminal worker failures.
  Correlate with the `X-Request-Id` response header.
- **Queue depth / dead-letter:** alert if `messenger:failed:show` is non-empty
  or the `csv_import` queue backs up (workers down).
- **DB:** connection saturation, disk, replication lag (if applicable).
