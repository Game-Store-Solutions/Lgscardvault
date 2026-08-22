# First production launch

Step-by-step guide to go from “works on my machine” to a live site. Operational
day-two tasks (releases, backups, monitoring) stay in [`RUNBOOK.md`](RUNBOOK.md).

**Suggested hosting:** a small VPS (Hetzner, DigitalOcean, Linode, etc.) with
Docker Compose, or any platform that can run the backend + worker + scheduler +
frontend images and a PostgreSQL 16 database. Managed Postgres is fine — skip
the `db` service and point `DATABASE_URL` at the provider.

**SSH to current Hetzner prod:** see [`SSH.md`](SSH.md) — local shortcut is `ssh lgs` (or PowerShell `lgs`).

---

## Phase 0 — Decide URLs and DNS

| Item | Example |
|------|---------|
| Public site | `https://shop.example.com` |
| API (same host) | `https://shop.example.com/api/…` (nginx in the frontend image proxies this) |
| Health checks | `https://shop.example.com/health` and `/health/ready` (proxied to backend) |

1. Point DNS **A/AAAA** at your server (or at a load balancer in front of it).
2. Terminate **TLS** at Caddy, nginx, Traefik, or Cloudflare — forward HTTP to
   the frontend container on port **8080** (only that port needs to be public).
3. Pick a path for secrets on the host, e.g. `/etc/mtgstore/prod.env`.

---

## Phase 1 — Prepare secrets

```bash
sudo mkdir -p /etc/mtgstore
sudo cp deploy/prod.env.example /etc/mtgstore/prod.env
sudo chmod 600 /etc/mtgstore/prod.env
```

Edit `/etc/mtgstore/prod.env`:

- Generate `APP_SECRET`: `openssl rand -hex 16`
- Generate `JWT_PASSPHRASE`: `openssl rand -hex 32`
- Set `POSTGRES_PASSWORD` and the same password inside `DATABASE_URL` (if using compose `db`)
- Set `APP_FRONTEND_URL`, `DEFAULT_URI`, `CORS_ALLOW_ORIGIN`, and `MAILER_DSN`
- Configure **Square production** (Phase 3) before accepting card payments

Clone or copy the repo onto the server (build context paths in compose are
relative to `deploy/`).

---

## Phase 2 — Build and boot

From the repository root on the server:

```bash
export COMPOSE="docker compose -f deploy/docker-compose.prod.yml --env-file /etc/mtgstore/prod.env"

# Build images
$COMPOSE build

# Start database first (if using bundled Postgres)
$COMPOSE up -d db
# Wait until healthy, then:

# One-time: JWT keypair (persisted in the jwt_keys volume)
$COMPOSE run --rm backend php bin/console lexik:jwt:generate-keypair --skip-if-exists

# Run migrations before serving traffic
$COMPOSE run --rm backend php bin/console doctrine:migrations:migrate --no-interaction

# Start app, workers, scheduler, frontend
$COMPOSE up -d
```

**Smoke checks** (after TLS is in place):

```bash
curl -fsS https://shop.example.com/healthz          # frontend container
curl -fsS https://shop.example.com/health          # backend liveness
curl -fsS https://shop.example.com/health/ready    # DB readiness
```

Open the site in a browser: home page loads, register/login works.

---

## Phase 3 — Square (production)

1. In [Square Developer Dashboard](https://developer.squareup.com/apps), open your app → **Production**.
2. **OAuth** → add redirect URL:
   `https://<your-domain>/api/integrations/square/callback`
   (must match `SQUARE_OAUTH_REDIRECT_URI` in `prod.env`).
3. Copy **Application ID**, **Application secret**, and platform **Access token**
   / **Location ID** into `SQUARE_PRODUCTION_*` in `prod.env`.
4. Set `SQUARE_ENVIRONMENT=production` and restart backend:
   `$COMPOSE up -d backend worker scheduler`
5. **Webhooks** → create subscription:
   - URL: `https://<your-domain>/api/integrations/square/webhook` (= `SQUARE_WEBHOOK_URL`)
   - Events (minimum): `oauth.authorization.revoked`, `refund.created`, `refund.updated`, `dispute.created`
   - Copy **Signature key** → `SQUARE_PRODUCTION_WEBHOOK_SIGNATURE_KEY`
6. In **Store admin → Payments**, each live store **Connect Square** (production OAuth).

Until Square is connected, shoppers can still use **pickup + pay in store** when
online payments are unavailable (see checkout UX). Card-pay + pickup stays the
primary paid path.

**Sales tax:** in Square Dashboard → each connected store location, enable the
correct sales tax rate(s). Checkout quotes and charges that location tax on
pickup card payments. Pay-in-store reservations collect tax at the counter.

---

## Phase 3b — Launch compliance (you do this outside the repo)

The app now includes pickup-only checkout, location tax, US-only stores, and
legal pages. You still need to:

1. Set `LEGAL_ENTITY_NAME`, `LEGAL_CONTACT_EMAIL`, and `LEGAL_ADDRESS` in `prod.env`.
2. Have a lawyer review `/privacy`, `/terms`, `/pickup`, and `/merchant-terms`.
3. Get a **CDTFA seller’s permit** if *you* sell cards from a California store (each store owner needs their own permit in their state).
4. Enable **Square location taxes** for every live store before taking card payments.
5. Keep **Archidekt harvest off** in production until you have written permission (`ARCHIDEKT_ENABLED`).
6. Confirm city rules if you use sell/trade (secondhand dealer).
7. Turn on Sentry, off-host Postgres backups, and an uptime check (`LAUNCH.md` Phase 5).

---

## Phase 4 — Catalog and platform data

The card catalog must be populated before search/inventory feels complete:

```bash
$COMPOSE run --rm backend php bin/console app:scryfall:sync
```

This can take a while; it is safe to run in the background. Nightly refresh is
scheduled when the **scheduler** service is running (see RUNBOOK).

Create your real platform admin / store owner accounts in production — do **not**
rely on dev seeds (`owner@store.local`).

---

## Phase 5 — Hardening checklist

- [ ] TLS certificate auto-renewal
- [ ] Firewall: only 443 (and 22 for SSH if needed); block public Postgres
- [ ] `SENTRY_DSN` for error tracking
- [ ] Off-host Postgres backups (`pg_dump` — see RUNBOOK)
- [ ] Uptime monitor on `/health/ready`
- [ ] GitHub **branch protection** + CI green before merge (`.github/workflows/ci.yml`)
- [ ] Optional: Google SSO redirect `https://<domain>/api/auth/sso/callback`

---

## Phase 6 — Releases after launch

**Automated:** merge to `main` (green CI) triggers [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)
→ SSH → [`scripts/deploy.sh`](scripts/deploy.sh). Secrets: [`GITHUB_SECRETS.md`](GITHUB_SECRETS.md).

**Manual on the server:**

```bash
cd /opt/lgscardvault/Lgscardvault
./deploy/scripts/deploy.sh
```

Or: `build` → `migrate` → `up -d` → smoke `/health` and `/health/ready` (see RUNBOOK).

---

## Troubleshooting

| Symptom | Likely fix |
|---------|------------|
| Login: *encode the JWT token* | Regenerate keypair with matching `JWT_PASSPHRASE`; see RUNBOOK §1 |
| `/health/ready` 503 | `DATABASE_URL` wrong or `db` not reachable |
| CSV imports never finish | Workers not running — `docker compose ps worker` |
| Subscriptions not billing | **scheduler** replica must be exactly 1 and running |
| Square webhook 401 | `SQUARE_WEBHOOK_URL` must match subscription URL exactly; check signature key |
| OAuth redirect mismatch | Square dashboard URL must match `SQUARE_OAUTH_REDIRECT_URI` byte-for-byte |

---

## What we have not automated yet

- Terraform / cloud-specific modules (optional later)
- GHCR image registry deploys (current pipeline builds on the VPS after `git pull`)

Push-to-deploy after merge to `main` is configured — see [`GITHUB_SECRETS.md`](GITHUB_SECRETS.md).

