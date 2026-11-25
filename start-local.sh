#!/usr/bin/env bash
# One-command local start: creates .env with random secrets if missing, builds and starts everything with Docker,
# and prints the link once the app is ready.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker with the 'docker compose' plugin is required: https://docs.docker.com/get-docker/" >&2
  echo "No Docker? Run it without Docker instead (Windows, macOS, Linux):  node scripts/dev.mjs" >&2
  exit 1
fi

if [ ! -f .env ]; then
  secret() { if command -v openssl >/dev/null 2>&1; then openssl rand -hex 32; else head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; fi; }
  umask 077
  printf 'JWT_SECRET=%s\nML_SHARED_SECRET=%s\nCORS_ORIGINS=http://localhost:8080\n' "$(secret)" "$(secret)" > .env
  echo "Created .env with fresh random secrets (add ADZUNA_APP_ID / ADZUNA_APP_KEY to it to enable job search)."
fi

echo "Building and starting CVPilot. The first build takes several minutes (it downloads PyTorch and the language model)."
(
  until curl -fsS http://localhost:4000/ready >/dev/null 2>&1; do sleep 3; done
  printf '\n\n  CVPilot is ready:  http://localhost:8080\n\n'
) &

exec docker compose up --build
