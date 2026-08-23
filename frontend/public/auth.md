# Authentication for LGS Card Vault agents

LGS Card Vault is a first-party storefront. Shoppers and store staff authenticate to **this** site. There is no public OAuth authorization server for third-party apps to register.

## Humans (browser)

1. Create an account at `/register/customer` (players) or `/register/owner` (stores).
2. Sign in at `/login` with email and password.
3. Optional Google SSO, when enabled by the operator, uses `/auth/sso/callback` after Google's OIDC flow.

Email verification may be required before some actions.

## Machine access (same-origin JSON API)

Unauthenticated **GET**s that agents may call:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/stores` | Approved storefronts |
| GET | `/api/stores/{slug}` | One store |
| GET | `/api/stores/{slug}/inventory` | Singles inventory |
| POST | `/api/contact` | Contact form (rate limited; not for bulk mail) |
| GET | `/health` | Liveness |
| GET | `/health/ready` | Database readiness |

Cart, orders, store admin, platform admin, and most other `/api/*` routes require a JWT obtained by a **user** who already has an account:

```http
POST /api/login
Content-Type: application/json

{"email":"user@example.com","password":"..."}
```

On success the response includes a bearer token. Send it as `Authorization: Bearer <token>` on subsequent `/api` requests.

There is no client-credentials grant, dynamic client registration, or RFC 8414 metadata for this API. Do not expect `/.well-known/oauth-authorization-server` or `/.well-known/openid-configuration` on this origin (Google's issuer is `https://accounts.google.com` when SSO is enabled).

## Payments

Checkout uses Square on the storefront (`/s/{slug}/cart`). Agent-native payment protocols (x402, ACP, UCP) are not implemented. Complete purchases in the browser or via Square after a human session.

## Discovery

- API catalog: `/.well-known/api-catalog`
- OpenAPI (public surface): `/openapi.json`
- Site overview: `/llms.txt`
