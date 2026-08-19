#!/usr/bin/env bash
# Per-boot service reconciliation for the LGS Card Vault Cloud Agent.
#
# Brings up the stateful infrastructure the dev servers depend on (PostgreSQL
# and Mailpit) and returns. The application processes themselves (backend API,
# CSV worker, frontend dev server) run as named terminals. Safe to re-run.
set -Eeuo pipefail

echo "==> Starting PostgreSQL"
sudo install -d -o postgres -g postgres /var/run/postgresql
if ! pg_lsclusters -h 2>/dev/null | awk '{print $4}' | grep -q '^online$'; then
  sudo pg_ctlcluster 16 main start
fi
for _ in $(seq 1 30); do
  pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1 && break
  sleep 1
done
pg_isready -h 127.0.0.1 -p 5432

echo "==> Starting Mailpit (SMTP :1025, web UI :8025)"
if ! pgrep -x mailpit >/dev/null 2>&1; then
  nohup mailpit --smtp 0.0.0.0:1025 --listen 0.0.0.0:8025 >/tmp/mailpit.log 2>&1 &
  disown || true
fi

echo "==> Start complete"
