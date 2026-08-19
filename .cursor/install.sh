#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap for the LGS Card Vault monorepo.
#
# Runs after the repository is checked out. Prepares the PostgreSQL cluster,
# installs backend (Composer) and frontend (npm) dependencies, generates the
# JWT keypair, applies migrations to the dev and test databases, and seeds the
# demo data. Safe to run repeatedly.
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ensure_postgres() {
  # The socket dir lives on tmpfs, so recreate it on a fresh boot before start.
  sudo install -d -o postgres -g postgres /var/run/postgresql
  if ! pg_lsclusters -h 2>/dev/null | awk '{print $4}' | grep -q '^online$'; then
    sudo pg_ctlcluster 16 main start
  fi
  for _ in $(seq 1 30); do
    pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "PostgreSQL did not become ready in time." >&2
  return 1
}

provision_databases() {
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='store'" | grep -q 1 \
    || sudo -u postgres psql -c "CREATE ROLE store LOGIN PASSWORD 'store';"
  for db in store store_test; do
    sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'" | grep -q 1 \
      || sudo -u postgres psql -c "CREATE DATABASE ${db} OWNER store;"
  done
}

echo "==> Ensuring PostgreSQL is running"
ensure_postgres
provision_databases

echo "==> Backend: composer install"
cd "$ROOT_DIR/backend"
composer install --no-interaction --no-progress

echo "==> Backend: generate JWT keypair (if missing)"
php bin/console lexik:jwt:generate-keypair --skip-if-exists

echo "==> Backend: run migrations (dev + test databases)"
php bin/console doctrine:migrations:migrate --no-interaction
APP_ENV=test php bin/console doctrine:migrations:migrate --no-interaction

echo "==> Backend: seed demo data (skips if already seeded)"
php bin/console app:seed

echo "==> Frontend: npm ci"
cd "$ROOT_DIR/frontend"
npm ci

echo "==> Install complete"
