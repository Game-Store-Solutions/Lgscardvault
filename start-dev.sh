#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
PIDS=()
NAMES=()

stop_process_tree() {
  local pid="$1"
  local child

  if command -v pgrep >/dev/null 2>&1; then
    for child in $(pgrep -P "$pid" 2>/dev/null || true); do
      stop_process_tree "$child"
    done
  fi

  kill "$pid" 2>/dev/null || true
}

cleanup() {
  if ((${#PIDS[@]})); then
    echo
    echo "Stopping dev services..."
    for pid in "${PIDS[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then
        stop_process_tree "$pid"
      fi
    done
  fi
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

start_service() {
  local name="$1"
  local dir="$2"
  shift 2

  (
    cd "$dir"
    echo "Starting $name..."
    exec "$@"
  ) &

  PIDS+=("$!")
  NAMES+=("$name")
}

wait_for_postgres() {
  local deadline=$((SECONDS + 60))

  echo "Waiting for Postgres..."

  until docker compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U store -d store >/dev/null 2>&1; do
    if ((SECONDS >= deadline)); then
      echo "Timed out waiting for Postgres to accept connections." >&2
      exit 1
    fi

    sleep 1
  done
}

wait_for_services() {
  local index
  local exit_code

  while true; do
    for index in "${!PIDS[@]}"; do
      if ! kill -0 "${PIDS[$index]}" 2>/dev/null; then
        exit_code=0
        wait "${PIDS[$index]}" || exit_code="$?"
        echo "${NAMES[$index]} exited with code $exit_code." >&2
        if ((exit_code == 0)); then
          exit 1
        fi
        exit "$exit_code"
      fi
    done

    sleep 1
  done
}

trap cleanup EXIT INT TERM

require_command docker
require_command php
require_command npm

echo "Checking Docker..."
if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running or is unavailable. Start Docker, wait for it to finish starting, then run this script again." >&2
  exit 1
fi

echo "Starting infrastructure..."
docker compose -f "$COMPOSE_FILE" up -d

if [[ ! -d "$ROOT_DIR/backend/vendor" ]]; then
  echo "backend/vendor is missing. Run: cd backend && composer install" >&2
  exit 1
fi

if [[ ! -d "$ROOT_DIR/frontend/node_modules" ]]; then
  echo "frontend/node_modules is missing. Run: cd frontend && npm install" >&2
  exit 1
fi

wait_for_postgres

export DEFAULT_URI="${DEFAULT_URI:-http://127.0.0.1:8000}"

(
  cd "$ROOT_DIR/backend"
  php bin/console doctrine:migrations:migrate --no-interaction
  php bin/console cache:clear --no-warmup
)

start_service "backend API" "$ROOT_DIR/backend" php -S 127.0.0.1:8000 -t public
start_service "CSV import worker" "$ROOT_DIR/backend" php bin/console messenger:consume async -vv
start_service "frontend" "$ROOT_DIR/frontend" npm run dev

echo
echo "Dev services are running:"
echo "  Backend:  http://127.0.0.1:8000"
echo "  Frontend: http://localhost:5173"
echo "  Mailpit:  http://localhost:8025"
echo
echo "Press Ctrl+C to stop the backend, worker, and frontend."

wait_for_services
