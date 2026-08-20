#!/usr/bin/env bash
# Production deploy on the VPS. Safe to run from SSH or GitHub Actions.
# Usage (from repo root on the server):
#   ./deploy/scripts/deploy.sh
#   DEPLOY_REF=main ./deploy/scripts/deploy.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

DEPLOY_REF="${DEPLOY_REF:-main}"
COMPOSE=(docker compose -f deploy/docker-compose.prod.yml --env-file /etc/mtgstore/prod.env)
SMOKE_BASE="${SMOKE_BASE:-http://127.0.0.1:8080}"

echo "==> Deploying ${DEPLOY_REF} in ${ROOT_DIR}"

if [[ ! -f /etc/mtgstore/prod.env ]]; then
  echo "Missing /etc/mtgstore/prod.env" >&2
  exit 1
fi

echo "==> git fetch / checkout / pull"
git fetch origin
git checkout "${DEPLOY_REF}"
git pull --ff-only origin "${DEPLOY_REF}"

echo "==> Build images"
"${COMPOSE[@]}" build

echo "==> Ensure database is up"
"${COMPOSE[@]}" up -d db
"${COMPOSE[@]}" exec -T db pg_isready -U "${POSTGRES_USER:-store}" || true

# Wait for healthy db (compose healthcheck)
for _ in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T db pg_isready -U store >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "==> JWT keypair (no-op if exists)"
"${COMPOSE[@]}" run --rm --no-deps backend \
  php bin/console lexik:jwt:generate-keypair --skip-if-exists

echo "==> Migrations"
"${COMPOSE[@]}" run --rm --no-deps backend \
  php bin/console doctrine:migrations:migrate --no-interaction

echo "==> Roll app / workers / scheduler / frontend"
# Recreate app containers even when the frontend image is unchanged. nginx
# otherwise keeps a stale Docker DNS IP for `backend` after a backend-only
# roll and smoke checks 502 until the next frontend bounce.
"${COMPOSE[@]}" up -d --remove-orphans --force-recreate backend worker worker_import scheduler frontend

echo "==> Wait for backend health"
backend_ok=0
for _ in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T backend curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
    backend_ok=1
    break
  fi
  sleep 2
done
if [[ "${backend_ok}" -ne 1 ]]; then
  echo "Backend never became healthy" >&2
  "${COMPOSE[@]}" ps >&2 || true
  "${COMPOSE[@]}" logs --tail=80 backend >&2 || true
  exit 1
fi

echo "==> Smoke checks against ${SMOKE_BASE}"
# Frontend/nginx and backend need a few seconds after `up -d` before accepting.
smoke_ok=0
for _ in $(seq 1 45); do
  if curl -fsS "${SMOKE_BASE}/healthz" >/dev/null \
    && curl -fsS "${SMOKE_BASE}/health" >/dev/null \
    && curl -fsS "${SMOKE_BASE}/health/ready" >/dev/null; then
    smoke_ok=1
    break
  fi
  sleep 2
done
if [[ "${smoke_ok}" -ne 1 ]]; then
  echo "Smoke checks failed against ${SMOKE_BASE}" >&2
  "${COMPOSE[@]}" ps >&2 || true
  exit 1
fi

echo "==> Deploy OK"
"${COMPOSE[@]}" ps
