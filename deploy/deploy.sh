#!/usr/bin/env bash
# Build-on-server deploy for the wbs-tool stack.
#
# Runs UNPRIVILEGED as the deploy user. The only privileged action is
# `systemctl reload caddy`, which configure.sh granted via a scoped sudoers rule.
# Run configure.sh once as root before this ever works.
#
# Usage (on the server, from the repo checkout):
#   ./deploy/deploy.sh
#   WBS_PUBLIC_URL=https://wbs.example.com ./deploy/deploy.sh
#   SKIP_PULL=1 ./deploy/deploy.sh          # deploy the working tree as-is
set -euo pipefail

WBS_ROOT="${WBS_ROOT:-/srv/wbs}"
BE_PORT="${BE_PORT:-3100}"
GW_PORT="${GW_PORT:-3200}"
# Public origin the browser will use. Defaults to plain HTTP on the host's
# address; set this to an https:// URL once DNS and a real domain exist.
WBS_PUBLIC_URL="${WBS_PUBLIC_URL:-http://$(hostname -I | awk '{print $1}')}"
SITE_ADDRESS="${SITE_ADDRESS:-:80}"
SKIP_PULL="${SKIP_PULL:-0}"

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_DIR="$HOME/.config/systemd/user"

log() { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[deploy] %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- preflight
preflight() {
  [ -d "$WBS_ROOT" ] || die "$WBS_ROOT missing — run configure.sh as root first"
  command -v bun >/dev/null || die "bun not found — run configure.sh as root first"

  # Secrets are the one thing this script will not invent. Both services 401
  # against each other if these drift, so fail loudly rather than guess.
  [ -s "$WBS_ROOT/.env" ] || die "$WBS_ROOT/.env is empty — add INTERNAL_AUTH_SECRET and JWT_SIGNING_KEY_CURRENT (32+ chars each)"
  for key in INTERNAL_AUTH_SECRET JWT_SIGNING_KEY_CURRENT; do
    grep -q "^${key}=" "$WBS_ROOT/.env" || die "$WBS_ROOT/.env is missing $key"
  done
}

# ------------------------------------------------------------------- source
pull() {
  if [ "$SKIP_PULL" = "1" ]; then
    log "SKIP_PULL=1 — deploying the working tree as-is"
    return
  fi
  log "pulling latest"
  git -C "$REPO_DIR" pull --ff-only
}

install_deps() {
  log "installing dependencies"
  (cd "$REPO_DIR" && bun install --frozen-lockfile)
}

# ------------------------------------------------------- non-secret env files
# Regenerated every deploy so they always match this script's port choices.
# Secrets live only in $WBS_ROOT/.env, which this never touches.
render_env() {
  log "writing per-service env files"
  cat > "$WBS_ROOT/be-01.env" <<EOF
PORT=$BE_PORT
LOG_LEVEL=info
GW_URL=http://127.0.0.1:$GW_PORT
DB_PATH=$WBS_ROOT/data/wbs.db
VERSION=$(git -C "$REPO_DIR" rev-parse --short HEAD)
EOF
  cat > "$WBS_ROOT/gw-01.env" <<EOF
PORT=$GW_PORT
LOG_LEVEL=info
BE_URL=http://127.0.0.1:$BE_PORT
VERSION=$(git -C "$REPO_DIR" rev-parse --short HEAD)
EOF
}

# --------------------------------------------------------------- frontend
build_frontend() {
  log "building fe-01 for $WBS_PUBLIC_URL"
  local ws_scheme=ws
  case "$WBS_PUBLIC_URL" in https://*) ws_scheme=wss ;; esac
  local ws_host="${WBS_PUBLIC_URL#*://}"

  # Vite inlines VITE_* at build time, so these must be set before the build
  # rather than supplied to the running service.
  (cd "$REPO_DIR" && \
    VITE_BE_URL="$WBS_PUBLIC_URL" \
    VITE_GW_URL="$WBS_PUBLIC_URL" \
    VITE_WS_URL="${ws_scheme}://${ws_host}/ws" \
    bunx nx run fe-01:build)

  log "publishing assets to $WBS_ROOT/www"
  rm -rf "${WBS_ROOT:?}/www/"*
  cp -r "$REPO_DIR/dist/apps/fe-01/." "$WBS_ROOT/www/"
}

# ------------------------------------------------------------------- caddy
render_caddy() {
  log "rendering caddy site config"
  sed -e "s|{{SITE_ADDRESS}}|$SITE_ADDRESS|g" \
      -e "s|{{BE_PORT}}|$BE_PORT|g" \
      -e "s|{{GW_PORT}}|$GW_PORT|g" \
      "$REPO_DIR/deploy/caddy/wbs.caddy.tmpl" > "$WBS_ROOT/caddy/10-wbs.caddy"
  # The placeholder from configure.sh would otherwise keep answering on :8080.
  rm -f "$WBS_ROOT/caddy/00-placeholder.caddy"
}

# ----------------------------------------------------------------- services
install_units() {
  log "installing systemd user units"
  mkdir -p "$UNIT_DIR"
  cp "$REPO_DIR"/deploy/systemd/wbs-*.service "$UNIT_DIR/"
  systemctl --user daemon-reload
  systemctl --user enable wbs-be-01.service wbs-gw-01.service >/dev/null
}

restart_services() {
  log "restarting services"
  systemctl --user restart wbs-be-01.service
  systemctl --user restart wbs-gw-01.service
  sudo -n systemctl reload caddy
}

# -------------------------------------------------------------------- verify
health_check() {
  log "waiting for health"
  local ok=0
  for _ in $(seq 1 30); do
    if curl -fsS --max-time 2 "http://127.0.0.1:$BE_PORT/health" >/dev/null 2>&1 \
    && curl -fsS --max-time 2 "http://127.0.0.1:$GW_PORT/health" >/dev/null 2>&1; then
      ok=1; break
    fi
    sleep 1
  done
  [ "$ok" = "1" ] || die "services did not come up — check: journalctl --user -u wbs-be-01 -n 50"

  # Proves the gw->be shared secret actually matches. A 401 here is the exact
  # failure that unit tests cannot see, because they inject the secret directly.
  local secret code
  secret="$(grep '^INTERNAL_AUTH_SECRET=' "$WBS_ROOT/.env" | cut -d= -f2-)"
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    "http://127.0.0.1:$BE_PORT/internal/forward" \
    -H 'content-type: application/json' \
    -H "x-internal-auth: $secret" \
    -d '{"message":{"type":"ping"},"trace_id":"deploy-check"}')"
  [ "$code" = "200" ] || die "internal auth check failed (HTTP $code) — gw-01 and be-01 disagree on INTERNAL_AUTH_SECRET"

  log "be-01 ok, gw-01 ok, internal auth ok"
}

main() {
  preflight
  pull
  install_deps
  render_env
  build_frontend
  render_caddy
  install_units
  restart_services
  health_check
  log "deployed $(git -C "$REPO_DIR" rev-parse --short HEAD) — $WBS_PUBLIC_URL"
}

main "$@"
