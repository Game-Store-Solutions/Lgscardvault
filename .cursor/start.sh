#!/usr/bin/env bash
# Per-boot service startup for the LGS Card Vault Cloud Agent.
#
# Brings up the stateful infrastructure (PostgreSQL, Mailpit) and the three
# application processes (backend API, CSV import worker, frontend dev server)
# in the background, then returns. Logs stream to /tmp/*.log. Safe to re-run:
# every service is guarded so a second invocation does not spawn duplicates.
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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
pgrep -x mailpit >/dev/null 2>&1 \
  || nohup mailpit --smtp 0.0.0.0:1025 --listen 0.0.0.0:8025 >/tmp/mailpit.log 2>&1 &

echo "==> Starting backend API (http://127.0.0.1:8000)"
pgrep -f 'php -S 127.0.0.1:8000' >/dev/null 2>&1 \
  || (cd "$ROOT_DIR/backend" && nohup php -S 127.0.0.1:8000 -t public >/tmp/backend.log 2>&1 &)

echo "==> Starting CSV import worker"
pgrep -f 'messenger:consume async' >/dev/null 2>&1 \
  || (cd "$ROOT_DIR/backend" && nohup php bin/console messenger:consume async -vv >/tmp/worker.log 2>&1 &)

echo "==> Starting frontend dev server (http://localhost:5173)"
pgrep -f 'vite' >/dev/null 2>&1 \
  || (cd "$ROOT_DIR/frontend" && nohup npm run dev -- --host >/tmp/frontend.log 2>&1 &)

echo "==> Start complete"
