# MTG Store — Multi-Tenant Symfony + React

Monorepo for a multi-tenant Magic: The Gathering store platform with Scryfall card data, per-store inventory, customer accounts, CSV bulk import, and role-based admin access.

## Stack

- **Backend:** Symfony 8, API Platform, PostgreSQL, JWT (Lexik), Symfony Messenger (async CSV import)
- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS v4, TanStack Query, React Router
- **Data:** Scryfall `oracle_cards` bulk sync + live search fallback

> **Architecture docs:** end-to-end flowcharts for every feature (frontend → route → service → repository → DB) live in [`architecture/`](architecture/README.md). Start there if you want to understand where a feature lives before touching code.

---

## Prerequisites

Install these first. Versions in parentheses are what this guide was verified against.

| Tool | Version | Notes |
|------|---------|-------|
| PHP | 8.4 (8.4.11) | CLI. Must have `sodium`, `openssl`, `ctype`, `iconv`, `pdo_pgsql` extensions — see [PHP extensions](#php-extensions) |
| Composer | 2.x (2.8.11) | Global `composer` or a local `composer.phar` both work |
| Node.js | 20+ (24.13.0) | |
| npm | 10+ (11.6.2) | |
| Docker + Compose | (29.6.1) | Provides PostgreSQL 16 and Mailpit |

### PHP extensions

The backend **will not install** without the `sodium` extension (required by the JWT library) and needs `pdo_pgsql` to talk to Postgres. Verify:

```bash
php -m | grep -E "sodium|openssl|pdo_pgsql|ctype|iconv"
```

If any are missing, enable them in your `php.ini` (find it with `php --ini`). On Windows uncomment the relevant lines:

```ini
extension=sodium
extension=openssl
extension=pdo_pgsql
```

---

## Quick start

```bash
# 1. Infrastructure (Postgres + Mailpit)
docker compose up -d

# 2. Backend
cd backend
composer install
php bin/console lexik:jwt:generate-keypair --skip-if-exists
php bin/console doctrine:migrations:migrate --no-interaction
php bin/console app:seed
php -S 127.0.0.1:8000 -t public          # leave running

# 3. CSV import worker (separate terminal — see note below)
cd backend
php bin/console messenger:consume async -vv

# 4. Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. The frontend proxies `/api` → `http://127.0.0.1:8000` (configured in `frontend/vite.config.ts`), so no frontend env file is needed for local dev.

The detailed walk-through below explains each step and the platform-specific gotchas.

---

## Detailed setup

### 1. Start infrastructure

```bash
docker compose up -d
```

This starts:
- **PostgreSQL 16** on `127.0.0.1:5432` (db `store`, user `store`, password `store`)
- **Mailpit** on `127.0.0.1:8025` (web UI) / `1025` (SMTP)

Check it's healthy:

```bash
docker compose ps
```

> **⚠️ Port 5432 conflict (common on Windows/dev machines with a native Postgres install).**
> If you have PostgreSQL installed as a Windows service, it will also bind `5432` and silently intercept the app's connection, causing `FATAL: password authentication failed for user "store"` even though the container is fine.
>
> Check who owns the port:
> ```powershell
> Get-NetTCPConnection -LocalPort 5432 -State Listen |
>   ForEach-Object { Get-Process -Id $_.OwningProcess } | Select-Object Id, ProcessName
> ```
> The cleanest fix (keeps Docker on the canonical port, matching production) is to stop the native service and set it to manual start:
> ```powershell
> # Run elevated (Admin)
> Get-Service *postgres* | Stop-Service -Force
> Get-Service *postgres* | Set-Service -StartupType Manual
> ```
> Then `docker compose up -d` again. To restore the native service later: `Set-Service <name> -StartupType Automatic; Start-Service <name>`.

### 2. Install backend dependencies

```bash
cd backend
composer install          # or: php ../composer.phar install
```

> If install fails with `ext-sodium ... is missing`, enable the `sodium` extension (see [PHP extensions](#php-extensions)) and re-run.

### 3. Generate JWT keys

Lexik signs JWTs with an RSA keypair that is **not** committed. Generate it:

```bash
php bin/console lexik:jwt:generate-keypair --skip-if-exists
```

This writes `config/jwt/private.pem` and `config/jwt/public.pem` using the passphrase in `backend/.env` (`JWT_PASSPHRASE`).

> **⚠️ Windows `OPENSSL_CONF` gotcha.** If the command fails with
> `error:80000002:system library::No such file or directory`, your shell has an
> `OPENSSL_CONF` env var pointing at a config file that doesn't exist (e.g. a
> leftover from a PostgreSQL/ODBC install). Clear it for the command, or generate
> the keys directly with the OpenSSL CLI:
> ```bash
> export OPENSSL_CONF=          # bash — unset for this session
> mkdir -p config/jwt
> PASS=$(grep '^JWT_PASSPHRASE=' .env | cut -d= -f2)
> openssl genpkey -algorithm RSA -out config/jwt/private.pem -aes256 -pass pass:$PASS -pkeyopt rsa_keygen_bits:4096
> openssl pkey -in config/jwt/private.pem -passin pass:$PASS -pubout -out config/jwt/public.pem
> ```

### 4. Run migrations

```bash
php bin/console doctrine:migrations:migrate --no-interaction
```

Creates all tables plus the `messenger_messages` table (the async transport auto-sets-up on first use as well).

### 5. Seed demo data

```bash
php bin/console app:seed
```

Creates the demo users, the `acme-tcg` store, and sample inventory (pulls a few sample cards from Scryfall).

### 6. Run the backend server

```bash
php -S 127.0.0.1:8000 -t public
```

API docs: **http://127.0.0.1:8000/api/docs**

### 7. Run the CSV import worker

CSV imports are processed **asynchronously** via Symfony Messenger using the Doctrine transport (`MESSENGER_TRANSPORT_DSN=doctrine://default?queue_name=csv_import` in `.env`). Uploads will be accepted and queued, but **rows won't process until a worker is running**:

```bash
php bin/console messenger:consume async -vv
```

Leave this running in its own terminal during development. (Skip it if you're not testing CSV import.)

### 8. Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**.

---

## Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Super admin | admin@store.local | password123 |
| Store owner | owner@store.local | password123 |
| Customer | customer@store.local | password123 |

Demo store: **`/s/acme-tcg`**

To create additional super-admins (the only supported way — admin accounts cannot self-register):

```bash
php bin/console app:create-admin admin2@store.local "Second Admin" --password=changeme123
```

---

## Roles

- **ROLE_SUPER_ADMIN** — platform admin (`/platform/admin`), manage stores/users, trigger Scryfall sync, view all imports
- **ROLE_STORE_OWNER** — manage inventory, branding, CSV imports & orders for owned store(s) (`/s/{slug}/admin`)
- **ROLE_USER** — browse stores, register, and hold per-store customer accounts (favorites, want lists)

---

## API highlights

- `POST /api/login` — JWT login
- `POST /api/register` — customer/owner registration
- `GET  /api/me` — current user profile
- `GET  /api/stores` — public store directory
- `GET  /api/stores/{slug}/inventory` — public store inventory
- `GET  /api/catalog/search?q=` — authenticated card search (local + Scryfall fallback)
- `POST /api/stores/{slug}/inventory` — add inventory item (store owner)
- `POST /api/stores/{slug}/csv-imports` — upload a CSV import (store owner)
- `PATCH /api/stores/{slug}/settings` — update store branding/spotlight (store owner)
- `POST /api/admin/scryfall/sync` — super-admin bulk sync

Full API docs: **http://127.0.0.1:8000/api/docs**

---

## Multi-game catalog (TCGCSV)

The card catalog is multi-game: Magic, Pokémon, One Piece, Flesh and Blood, and
Riftbound. Sets, sealed products (booster boxes, bundles, decks), and non-Magic
singles are mirrored from [TCGCSV](https://tcgcsv.com), a free daily copy of the
TCGplayer catalog. **Magic singles stay Scryfall-sourced** — TCGCSV supplies
Magic's sealed products only.

```bash
php bin/console app:catalog:sync onepiece --max-groups=5 -v   # smoke test: first 5 sets, verbose
php bin/console app:catalog:sync onepiece                     # one game, full catalog
php bin/console app:catalog:sync --all                        # every active game
```

A full game is thousands of requests (products + prices per set), paced to
~10/s. Start with `--max-groups` to confirm a game looks right before running
the whole thing. Progress is written per set with `-v`; each run is recorded in
`catalog_sync_runs` and visible under **Platform admin → Sync jobs**, where
super-admins can also trigger a sync (`POST /api/admin/catalog/sync/{code}`,
queued on the worker). One failing set is counted and skipped rather than
aborting the run.

### Staying current automatically

TCGCSV republishes at 20:00 UTC daily. A Symfony Scheduler schedule queues a
sync per active game starting 20:30 UTC, staggered 20 minutes apart, so the
catalog keeps itself current with no cron entry:

```bash
php bin/console debug:scheduler                        # what runs, and when next
php bin/console messenger:consume scheduler_catalog    # the schedule ticker
php bin/console messenger:consume async                # runs the syncs themselves
```

Both workers must be running. The schedule is stateful (cache-backed), so a
worker that was down at 20:30 still runs the missed sync when it comes back
instead of skipping a day. Games are read from the database — enabling a game
puts it on the schedule with no code change.

---

## Scryfall sync

```bash
php bin/console app:scryfall:sync                      # default_cards — every printing (recommended)
php bin/console app:scryfall:sync --type=oracle_cards  # one printing per card name (smaller/faster)
```

Streams the chosen Scryfall bulk file to disk (gzipped JSONL — the only format Scryfall serves since 2026-07-20; the legacy JSON-array format still parses as a fallback), parses it incrementally, and upserts the local catalog with multi-row `ON CONFLICT` batches — memory stays flat even for the multi-hundred-MB `default_cards` file.

**`default_cards` is what makes the catalog self-sufficient**: store CSV imports identify a printing by set + collector number, and only the all-printings dataset can resolve those locally (indexed natural-key lookup) without falling back to the Scryfall API. Schedule it via cron to keep prices fresh.

Super-admins can also trigger a sync via `POST /api/admin/scryfall/sync` (defaults to the smaller `oracle_cards` so the synchronous request stays within HTTP timeouts; accepts `{"type": "default_cards"}`).

---

## Services & ports

| Service | URL |
|---------|-----|
| Frontend (Vite) | http://localhost:5173 |
| Backend API | http://127.0.0.1:8000 |
| API docs (Swagger) | http://127.0.0.1:8000/api/docs |
| Mailpit (email UI) | http://localhost:8025 |
| PostgreSQL | 127.0.0.1:5432 |

---

## Testing & CI

CI runs on every push and PR (`.github/workflows/ci.yml`): the backend job spins
up PostgreSQL 16, migrates a test database, lints the DI container, and runs
PHPUnit; the frontend job runs lint, typecheck, and build.

**Backend (PHPUnit).** Tests use a dedicated `store_test` database (the test env
appends a `_test` suffix to `DATABASE_URL`) and [`dama/doctrine-test-bundle`](https://github.com/dmaicher/doctrine-test-bundle)
wraps each test in a transaction that rolls back, so the schema is migrated once
and tests never pollute each other.

```bash
cd backend
createdb -h 127.0.0.1 -U store store_test           # once
APP_ENV=test php bin/console doctrine:migrations:migrate --no-interaction
php bin/phpunit
```

Coverage focuses on the correctness- and concurrency-critical paths: the
`ON CONFLICT` card upserter, natural-key catalog resolution, the inventory
merge/optimistic-lock write path, CSV row claiming + stale-claim requeue, and
inventory/order pagination.

**Frontend.**

```bash
cd frontend
npm run lint && npx tsc --noEmit && npm run build
```

### Requiring green CI before merge (branch protection)

CI already runs on every pull request. To make it a **merge gate**, a repository
admin enables branch protection once (GitHub → *Settings → Branches → Add branch
ruleset*, or *Branches → Add rule* for `master`):

- **Require status checks to pass before merging** → add the **`CI success`**
  check. That single job aggregates the backend and frontend jobs (it only
  passes when both do), so you require one check and new jobs are covered
  automatically as they're added to its `needs` list.
- Recommended alongside: *Require a pull request before merging* and *Require
  branches to be up to date before merging*.

Until protection is enabled, CI still reports pass/fail on each PR — it just
isn't enforced.

---

## Production configuration

**Secrets are never read from the committed `.env` in production.** The values in
`backend/.env` are development-only defaults; override every secret with real
environment variables injected by your platform or secrets manager:

| Variable | Notes |
|----------|-------|
| `APP_ENV` | Set to `prod`. |
| `APP_SECRET` | Fresh random value (e.g. `openssl rand -hex 16`). |
| `DATABASE_URL` | Production PostgreSQL DSN. |
| `JWT_PASSPHRASE` | Passphrase for the JWT keypair; generate the keypair in the target environment (`bin/console lexik:jwt:generate-keypair`) — the `.pem` files are gitignored and never shipped. |
| `CORS_ALLOW_ORIGIN` | Regex for your real frontend origin(s). |
| `MAILER_DSN` | Production SMTP. |

The `.pem` keys and `.env.local` are excluded from the Docker build context
(`backend/.dockerignore`), so secrets can't be baked into an image.

### Container image

`backend/Dockerfile` is a multi-stage production build (Composer `--no-dev` +
optimized autoloader → [FrankenPHP](https://frankenphp.dev) runtime with OPcache
and `opcache.validate_timestamps=0`):

```bash
cd backend
docker build -t mtg-store-backend .
docker run -p 8000:8000 \
  -e APP_ENV=prod \
  -e APP_SECRET="$(openssl rand -hex 16)" \
  -e DATABASE_URL="postgresql://user:pass@db-host:5432/store?serverVersion=16" \
  -e JWT_PASSPHRASE="…" \
  mtg-store-backend
```

Run migrations against the production database as a release step
(`php bin/console doctrine:migrations:migrate --no-interaction`), and sync the
catalog via the worker (`php bin/console app:scryfall:sync`).

The frontend has its own production image (`frontend/Dockerfile`): a Node build
served by nginx with SPA fallback, long-cached fingerprinted assets, and an
`/api` proxy to the backend.

> **Full deploy, worker supervision, backups/DR, log rotation, and monitoring
> are documented in [`deploy/RUNBOOK.md`](deploy/RUNBOOK.md)**, with reference
> systemd/supervisor units and a `deploy/docker-compose.prod.yml` composition.

### Workers

CSV imports and catalog syncs run on Symfony Messenger workers — **if none is
running, uploads queue forever.** Run `messenger:consume async` for the work
itself and `messenger:consume scheduler_catalog` for the daily catalog
schedule. Supervise them (systemd/supervisor/compose —
see the runbook) so crashes auto-restart and memory growth is bounded
(`--time-limit`/`--memory-limit`). Messages that exhaust their retries land in a
`failed` dead-letter transport (`messenger:failed:show|retry`) rather than being
lost.

### Health probes

Two unauthenticated endpoints (outside the `/api` JWT firewall) for load
balancers and orchestrators:

| Endpoint | Purpose | Behavior |
|----------|---------|----------|
| `GET /health` | Liveness | `200 {"status":"ok"}` — no I/O; is the process up? |
| `GET /health/ready` | Readiness | Pings the DB; `200` when reachable, `503` when not (pull the instance from rotation). |

The Docker image's `HEALTHCHECK` hits `/health`.

### Security & observability

- **Login brute-force protection:** the `login` firewall throttles failed
  logins (5 per IP+username per 15 min) and returns **`429 Too Many Requests`**
  once exceeded. Tune `max_attempts`/`interval` in `config/packages/security.yaml`.
- **API rate limiting:** catalog search and CSV upload are per-client rate
  limited (`config/packages/rate_limiter.yaml`) — generous ceilings that only
  trip on abuse, and never touch background import processing.
- **Request correlation:** every response carries an `X-Request-Id` (an inbound
  one from a proxy/gateway is honored, otherwise generated). Unhandled
  exceptions are logged with structured context (`request_id`, method, path,
  status) so a single request can be traced across logs.
- **Error tracking:** set `SENTRY_DSN` to capture 5xx and terminal worker
  failures (off by default; uses the raw Sentry SDK). Correlate via the
  `X-Request-Id` header.
- **Logs:** the app logs to `stderr` (12-factor) — in the container image these
  are captured by your orchestrator's log driver. (`symfony/monolog-bundle`
  isn't yet Symfony 8.1 compatible; wire it in for JSON handlers/routing once it
  is.)
- **CI security:** dependency audits (`composer audit`, `npm audit`) and secret
  scanning (gitleaks) run in CI as a required check.

---

## Troubleshooting

| Symptom | Cause / Fix |
|---------|-------------|
| `ext-sodium ... is missing` on `composer install` | Enable `extension=sodium` in `php.ini`. |
| `error:80000002:system library::No such file or directory` on key generation | Bad `OPENSSL_CONF` env var — see [step 3](#3-generate-jwt-keys). |
| `password authentication failed for user "store"` | A native Postgres is shadowing the Docker container on port 5432 — see the [port conflict note](#1-start-infrastructure). |
| `Unable to find the JWT key` / 401 on every request | JWT keys not generated — run [step 3](#3-generate-jwt-keys). |
| CSV upload accepted but rows stay "pending" | The Messenger worker isn't running — see [step 7](#7-run-the-csv-import-worker). |
| Want a totally clean DB | `docker compose down -v && docker compose up -d`, then re-run migrations + seed. |
