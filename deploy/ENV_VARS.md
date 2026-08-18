# Production environment variables

Everything the backend expects for a successful deploy. Copy
[`prod.env.example`](prod.env.example) on the server and fill in **Required**.

The frontend production image uses same-origin `/api` (no `VITE_*` required).
Do **not** set `VITE_ENABLE_TEST_CHECKOUT=true` in production.

Optional backend var: `APP_CONTACT_RECIPIENTS` — comma-separated inboxes that
receive landing-page contact-form submissions (`POST /api/contact`). Unset, it
defaults to the platform owners (`tedy@` / `robert@gamestoresolutions.com`). Set
it to route enquiries elsewhere, e.g.
`APP_CONTACT_RECIPIENTS=support@gamestoresolutions.com`. Delivery uses
`MAILER_DSN`, so the form needs a working mailer in production.

JWT **key files** (`config/jwt/*.pem`) are not env vars — generate once on the
server (`lexik:jwt:generate-keypair`); see [`LAUNCH.md`](LAUNCH.md).

---

## Required (app will not run correctly without these)

| Variable | Purpose |
|----------|---------|
| `APP_ENV` | Must be `prod`. |
| `APP_SECRET` | Symfony secret; `openssl rand -hex 16`. |
| `DATABASE_URL` | PostgreSQL 16 DSN (compose: host `db`). |
| `JWT_PASSPHRASE` | Passphrase for the JWT `.pem` keypair. |
| `CORS_ALLOW_ORIGIN` | Regex for allowed browser origins (your public site URL). |
| `MAILER_DSN` | Resend: `resend+api://YOUR_API_KEY@default` (URL-encode special characters in the key). |
| `MESSENGER_TRANSPORT_DSN` | Async queue (default: Doctrine `csv_import`). |
| `MESSENGER_FAILED_TRANSPORT_DSN` | Dead-letter queue (default: Doctrine `failed`). |
| `APP_FRONTEND_URL` | Public SPA URL (emails, SSO return, owner redirects). |
| `DEFAULT_URI` | Base URL for Symfony link generation (usually same as frontend). |
| `APP_MAIL_FROM` | From header on a Resend-verified domain, e.g. `LGS Card Vault <noreply@your-domain>`. |

### Docker Compose only (bundled Postgres)

| Variable | Purpose |
|----------|---------|
| `POSTGRES_DB` | Database name (default `store`). |
| `POSTGRES_USER` | Database user (default `store`). |
| `POSTGRES_PASSWORD` | Must match password inside `DATABASE_URL`. |

---

## Required for real card payments & billing (Square)

Without these, checkout stays in **mock / not ready** mode (pickup / pay-in-store may still work).

| Variable | Purpose |
|----------|---------|
| `SQUARE_ENVIRONMENT` | Set to `production` when live. |
| `SQUARE_PRODUCTION_APPLICATION_ID` | Square app ID (Web Payments SDK + OAuth). |
| `SQUARE_PRODUCTION_APPLICATION_SECRET` | OAuth — each **store** connects its own Square account. |
| `SQUARE_PRODUCTION_ACCESS_TOKEN` | **Platform** token — charges **store owners** for subscription tiers. |
| `SQUARE_PRODUCTION_LOCATION_ID` | **Platform** location for those subscription charges. |
| `SQUARE_PRODUCTION_WEBHOOK_SIGNATURE_KEY` | From webhook subscription in Square dashboard. |
| `SQUARE_WEBHOOK_URL` | Must match webhook URL in Square **exactly** (e.g. `https://your-domain/api/integrations/square/webhook`). |
| `SQUARE_OAUTH_REDIRECT_URI` | Must match OAuth redirect in Square **exactly** (e.g. `https://your-domain/api/integrations/square/callback`). |

Each **store** still completes **Connect Square** in admin (per-merchant OAuth); env vars are the platform app, not each shop’s token.

### Square optional (defaults are fine)

| Variable | Default |
|----------|---------|
| `SQUARE_CURRENCY` | `USD` |
| `SQUARE_COUNTRY` | `US` |
| `SQUARE_API_VERSION` | `2025-01-23` |
| `SQUARE_OAUTH_SCOPES` | Built-in scope list in code |

### Staging / sandbox stack only

| Variable | Purpose |
|----------|---------|
| `SQUARE_SANDBOX_*` | Same five keys as production, under `SQUARE_SANDBOX_` prefix. |
| `SQUARE_ENVIRONMENT=sandbox` | Selects sandbox pair. |

---

## Recommended (not third-party “apps”, but production hygiene)

| Variable | Purpose |
|----------|---------|
| `SENTRY_DSN` | Error tracking (empty = off). |
| `SENTRY_RELEASE` | Optional release tag in Sentry. |

---

## Optional integrations (only if you enable the feature)

| Variable | Feature |
|----------|---------|
| `SSO_OIDC_ISSUER` | Google / Entra / Okta / etc. login |
| `SSO_OIDC_CLIENT_ID` | ↑ |
| `SSO_OIDC_CLIENT_SECRET` | ↑ |
| `SSO_OIDC_SCOPES` | ↑ (default `openid email profile`) |
| `SSO_OIDC_REDIRECT_URI` | Optional override. Must match Google Console exactly, e.g. `https://your-domain/api/auth/sso/callback`. Defaults to `APP_FRONTEND_URL` + that path. |
| `SSO_PROVIDER_NAME` | ↑ UI label (e.g. `Google`) |
| `MAPBOX_ACCESS_TOKEN` | Address autocomplete in store onboarding (mock if empty) |

---

## Usually leave as committed defaults

| Variable | Notes |
|----------|--------|
| `JWT_SECRET_KEY` / `JWT_PUBLIC_KEY` | Paths to `.pem` files in `backend/.env`. |
| `LOCK_DSN` | `flock` is fine for single-server / compose. |
| `APP_SHARE_DIR` | `var/share` unless you mount a volume elsewhere. |

---

## Quick answer: is Square the only integration?

**No.** Minimum live stack:

1. **PostgreSQL** (`DATABASE_URL`)
2. **Email** (`MAILER_DSN` via Resend, plus `APP_MAIL_FROM` on a verified domain)
3. **Square** (full block above) for online checkout and **platform subscription billing**

Optional: **Sentry**, **OIDC SSO**, **Mapbox**.
