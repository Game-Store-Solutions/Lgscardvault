# Console & ops commands

Quick reference for Symfony console commands, Messenger workers, and common deploy helpers. Run Symfony commands from `backend/` locally, or via Compose on production:

```bash
# Local
cd backend && php bin/console <command>

# Production (from repo root on the VPS)
docker compose -f deploy/docker-compose.prod.yml --env-file /etc/mtgstore/prod.env \
  run --rm backend php bin/console <command>
```

Full setup narrative: [local-development.md](local-development.md). Feature detail: [architecture index](README.md).

---

## Bootstrap & accounts

| Command | What it does |
|---------|----------------|
| `lexik:jwt:generate-keypair --skip-if-exists` | Creates RSA keys for JWT signing (gitignored). |
| `doctrine:migrations:migrate --no-interaction` | Applies pending DB migrations. |
| `app:seed` | Demo users, `acme-tcg` store, sample inventory. |
| `app:create-admin <email> "<name>" --password=…` | Creates a platform super-admin (admins cannot self-register). |
| `app:seed-report-demo` | Backdated demo orders for reports (dev/local only). |
| `app:mail:preview --to=…` | Sends sample transactional emails to Mailpit. |
| `app:recommend:seed-commander-package` | Seeds a commander + synergistic cards into store inventory via Scryfall. |

---

## Catalog & inventory

| Command | What it does |
|---------|----------------|
| `app:scryfall:sync` | Sync Scryfall bulk data (`default_cards` by default; `--type=oracle_cards` for one printing per name). |
| `app:catalog:sync <game>` | Sync one game’s sets/cards/sealed/prices from TCGCSV. |
| `app:catalog:sync --all` | Sync every active game. |
| `app:catalog:sync onepiece --max-groups=5 -v` | Smoke-test a game (first N sets, verbose). |
| `app:inventory:repair-game-links` | Re-home listings whose “Game: X” note contradicts a game-less card (legacy import fix). |
| `app:synergy:rebuild` | Rebuild local theme synergy edges from the Magic catalog. |

---

## Billing

| Command | What it does |
|---------|----------------|
| `app:subscriptions:charge --dry-run` | List subscriptions due without charging. |
| `app:subscriptions:charge` | Charge vaulted Square cards for due renewals. |
| `app:privacy:sla-remind --dry-run` | List open privacy / takedown requests past 45 days. |
| `app:privacy:sla-remind` | Email `LEGAL_CONTACT_EMAIL` a digest of overdue privacy tickets. |

In production this also runs from `BillingSchedule` (needs `messenger:consume scheduler_billing`).

---

## Commander intelligence

| Command | What it does |
|---------|----------------|
| `app:commanders:sync` | Refresh the local commanders table from Scryfall `is:commander` (weekly schedule). |
| `app:commanders:intelligence --commander="Name"` | Harvest reference decks and rebuild stats for one commander. |
| `app:commanders:intelligence --top=400 --async` | Queue a warm-up for the top N commanders (occasional; don’t re-run while backlog drains). |
| `app:commanders:prune-reference-decks` | Drop stale reference decklists after aggregates settle (`--batch=N`, `--async`). |

Harvest depth / provider toggles live in `backend/config/packages/commander_intelligence.yaml`. Design: [commander-deck-builder.md](commander-deck-builder.md).

---

## Messenger workers

Workers must be running for async work (CSV import, catalog sync jobs, commander harvest, billing tickers).

CSV uploads and Archidekt/catalog work use **separate transports** so one long harvest cannot starve store imports.

| Command | What it does |
|---------|----------------|
| `messenger:consume csv -vv` | Store CSV import queue only. |
| `messenger:consume async -vv` | Catalog sync + commander intelligence (Archidekt harvest, prune, etc.). |
| `messenger:consume csv failed …` / `async failed …` | Same plus dead-letter retry surface (prod defaults). |
| `messenger:consume scheduler_catalog` | Ticks the daily TCGCSV catalog schedule. |
| `messenger:consume scheduler_billing` | Ticks nightly subscription charges. |
| `messenger:consume scheduler_commanders` | Ticks commander catalog sync, intelligence sweep, prune. |
| `debug:scheduler` | Show scheduled tasks and next run times. |
| `messenger:failed:show` | List failed messages. |
| `messenger:failed:show <id> -vv` | Inspect one failure (stack trace). |
| `messenger:failed:retry <id>` | Requeue after fixing the cause. |
| `messenger:failed:remove <id>` | Drop a failed message. |

**Prod (Compose) while Archidekt is draining:**

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file /etc/mtgstore/prod.env up -d \
  --scale worker=1 --scale worker_import=1
```

- `worker` → Archidekt / catalog (`async`)
- `worker_import` → store CSV uploads (`csv`)

Add `MESSENGER_CSV_TRANSPORT_DSN=doctrine://default?queue_name=store_import&auto_setup=1` to `/etc/mtgstore/prod.env` if it is not there yet.

---

## Deploy & Compose helpers

From the repo root on the VPS:

| Command | What it does |
|---------|----------------|
| `./deploy/scripts/deploy.sh` | Fetch `main`, build images, migrate, recreate backend/worker/worker_import/scheduler/frontend, smoke-check. |
| `docker compose -f deploy/docker-compose.prod.yml --env-file /etc/mtgstore/prod.env up -d --scale worker=1 --scale worker_import=1` | One Archidekt worker + one CSV import worker. |
| `docker compose -f deploy/docker-compose.prod.yml --env-file /etc/mtgstore/prod.env ps` | Service status. |
| `docker compose -f deploy/docker-compose.prod.yml --env-file /etc/mtgstore/prod.env logs -f worker` | Tail Archidekt / async worker. |
| `docker compose -f deploy/docker-compose.prod.yml --env-file /etc/mtgstore/prod.env logs -f worker_import` | Tail CSV import worker. |

Local day-to-day:

| Command | What it does |
|---------|----------------|
| `docker compose up -d` | Postgres + Mailpit. |
| `./start-dev.sh` / `.\start-dev.ps1` | Bring up API, CSV worker, and frontend together. |
| `scripts/dev-setup.ps1` | One-time Windows bootstrap (deps, JWT, migrate, seed). |

---

## Tests & lint

| Command | What it does |
|---------|----------------|
| `php bin/phpunit` | Backend tests (`APP_ENV=test`, `store_test` DB). |
| `php bin/console lint:container` | Validate the DI container. |
| `npm run lint && npx tsc --noEmit && npm run build` | Frontend lint, typecheck, production build (from `frontend/`). |
