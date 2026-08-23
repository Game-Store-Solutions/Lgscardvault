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
   - Events (minimum): `oauth.authorization.revoked`, `refund.created`, `refund.updated`, `dispute.created`, `payment.created`
   - Copy **Signature key** → `SQUARE_PRODUCTION_WEBHOOK_SIGNATURE_KEY`
6. Complete Square’s own production checklist for the app (OAuth, payments, webhooks, location tax). Tokenization via Square is the PCI path; the production go-live items are still yours.
7. In **Store admin → Payments**, each live store **Connect Square** (production OAuth).
8. In Square Dashboard → each connected **location**, enable the correct sales tax rate(s). Checkout quotes and charges that location tax on pickup card payments. If Square returns $0 tax in a state that charges sales tax, **card checkout is blocked** (pay-in-store still works). Stores in AK/DE/MT/NH/OR may charge $0.

Until Square is connected, shoppers can still use **pickup + pay in store**. Card-pay + pickup stays the
primary paid path.

**Chargebacks:** `dispute.created` records the dispute on the LGS order (status + reason) and does **not**
restock. Staff respond in Square’s dispute console with pickup proof (name, time window, staff notes, ID if
collected). Refunds from Square still restock via `refund.updated`.

---

## Phase 3b — Launch compliance (mix of software + operator work)

The app now includes pickup-only checkout, location tax, US-only stores, legal pages, license intake, a
privacy-request queue, cookie banner, and a 13+ date-of-birth gate.

Architecture scorecard (what ships vs what is still counsel/ops), with links into the repo:
[architecture/compliance.md](../architecture/compliance.md).

**Have a lawyer confirm:** the platform is **SaaS / software**, each store is merchant of record, and you are **not**
a marketplace facilitator for sales tax. In-app copy states that; it does not replace counsel.

**You still need to do outside the repo:**

1. Form the platform legal entity, get an EIN, appoint a registered agent, and buy business insurance for *your* company (store owners attest to their own insurance during onboarding).
2. Set `LEGAL_ENTITY_NAME`, `LEGAL_CONTACT_EMAIL`, and `LEGAL_ADDRESS` in `prod.env`.
3. Have a lawyer review `/privacy`, `/privacy-request`, `/terms`, `/pickup`, `/merchant-terms`, and `/fan-content`.
4. Each **store owner** needs their own seller’s permit (CDTFA in California). There is **no reliable 50-state permit validation API**. California CDTFA is a manual webpage lookup — admins get a verify link; we do not scrape CDTFA. Owners upload a PDF/image or type the number; approve is blocked until intake is complete.
5. City business license / pawn / secondhand-dealer: collected on the Licenses onboarding step when the owner buys/trades from the public. Local rules still sit with the store.
6. Enable **Square location taxes** for every live store in a **sales-tax state** before taking card payments (see Phase 3). **AK, DE, MT, NH, and OR** have no statewide sales tax — shoppers can complete card checkout with $0 tax.
7. Age gate is date of birth (13+), not ID verification. That is COPPA-shaped, not KYC.
8. Keep **Archidekt harvest off** in production until you have written permission (`ARCHIDEKT_ENABLED=0` is the default in `prod.env.example`).
9. Turn on Sentry (`SENTRY_DSN`), off-host Postgres backups, and an uptime check on `/health/ready` (Phase 5).
10. Walk Square’s production checklist (Phase 3). PCI: you tokenize via Square; you still own go-live.
11. Staff **Platform admin → Privacy** (45-day SLA). Optional digest: `php bin/console app:privacy:sla-remind`.
12. Chargebacks: follow [CHARGEBACKS.md](CHARGEBACKS.md) and respond in Square with pickup proof.

**Permit APIs:** do not integrate a scraper. If a state later publishes a real permit API with a ToS that allows automated checks, we can add an optional verify button — it will not be the source of truth over the uploaded document.

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
- [ ] **Cloudflare Bot Fight / WAF:** skip or allow `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/index.md`, `/auth.md`, `/openapi.json`, `/.well-known/*`, and known AI crawlers. Super Bot Fight Mode returning **403 + challenge HTML** on `/` makes agent-readiness scanners (and GPTBot/ClaudeBot) treat the site as missing those files even when nginx serves them. After a frontend deploy, purge those paths from cache.

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

