#!/bin/sh
# One-time host configuration for the wbs-tool stack (build-on-server model).
#
# Everything here needs root and runs EXACTLY ONCE per host. After this,
# all deploy operations run unprivileged as $WBS_USER.
#
# Usage:
#   sudo sh configure.sh                    # default user 'puni1', no docker
#   sudo WBS_USER=alice sh configure.sh     # different user
#   sudo WITH_DOCKER=1 sh configure.sh      # also install docker (observability stack)
#
# Idempotent: safe to re-run.
set -eu

WBS_USER="${WBS_USER:-puni1}"
WBS_ROOT="${WBS_ROOT:-/srv/wbs}"
BUN_VERSION="${BUN_VERSION:-1.2.20}"
WITH_DOCKER="${WITH_DOCKER:-0}"

log() { printf '[configure] %s\n' "$*"; }

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    log "must run as root: sudo sh configure.sh"
    exit 1
  fi
}

require_user() {
  if ! id "$WBS_USER" >/dev/null 2>&1; then
    log "user '$WBS_USER' does not exist — set WBS_USER=<name>"
    exit 1
  fi
}

install_packages() {
  log "installing base packages"
  apt-get update -y
  # curl+unzip: required by the Bun installer.
  # caddy: TLS terminator / reverse proxy, ships with a systemd unit that already
  #        holds CAP_NET_BIND_SERVICE, so nothing else needs to bind :80/:443.
  apt-get install -y --no-install-recommends \
    ca-certificates curl unzip git caddy
}

install_docker() {
  if [ "$WITH_DOCKER" != "1" ]; then
    log "skipping docker (set WITH_DOCKER=1 to install it for the observability stack)"
    return
  fi
  if command -v docker >/dev/null 2>&1; then
    log "docker already installed — skipping"
  else
    # Ubuntu ships the same upstream version as Docker's own repo, so we avoid
    # the extra keyring + sources.list.d registration entirely.
    log "installing docker from the distro repo"
    apt-get install -y --no-install-recommends docker.io docker-compose-v2
  fi
  log "adding $WBS_USER to the docker group"
  usermod -aG docker "$WBS_USER"
}

install_bun() {
  if command -v bun >/dev/null 2>&1; then
    log "bun already installed ($(bun --version)) — skipping"
    return
  fi
  log "installing bun $BUN_VERSION to /usr/local/bin"
  curl -fsSL https://bun.sh/install | BUN_INSTALL=/usr/local bash -s -- "bun-v${BUN_VERSION}"
}

create_tree() {
  log "creating $WBS_ROOT owned by $WBS_USER"
  for d in "$WBS_ROOT" "$WBS_ROOT/data" "$WBS_ROOT/logs" "$WBS_ROOT/caddy" "$WBS_ROOT/www"; do
    mkdir -p "$d"
  done
  # .env holds real secrets — created empty, never world-readable.
  if [ ! -f "$WBS_ROOT/.env" ]; then
    touch "$WBS_ROOT/.env"
  fi
  chown -R "$WBS_USER:$WBS_USER" "$WBS_ROOT"
  chmod 0750 "$WBS_ROOT"
  chmod 0600 "$WBS_ROOT/.env"

  # Caddy runs as its own user and must traverse $WBS_ROOT to read the config
  # fragments and serve static files. Without this the import glob silently
  # matches nothing and Caddy starts up serving no sites at all.
  # .env stays $WBS_USER-owned at 0600, so caddy still cannot read secrets.
  if id caddy >/dev/null 2>&1; then
    chgrp caddy "$WBS_ROOT" "$WBS_ROOT/caddy" "$WBS_ROOT/www"
    chmod 0750 "$WBS_ROOT"
    # setgid so fragments and assets written later by a deploy inherit the
    # caddy group instead of defaulting back to $WBS_USER's own group.
    chmod 2750 "$WBS_ROOT/caddy" "$WBS_ROOT/www"
  fi
}

enable_linger() {
  # Without lingering, systemd --user services are killed when the last SSH
  # session for $WBS_USER closes. Deployed services must outlive the session.
  log "enabling systemd lingering for $WBS_USER"
  loginctl enable-linger "$WBS_USER"
}

configure_caddy() {
  log "pointing caddy at $WBS_ROOT/caddy for site config"
  # Caddy's config stays root-owned, but it imports a directory $WBS_USER can
  # write. Deploys then edit fragments without ever needing root.
  if ! grep -q "$WBS_ROOT/caddy" /etc/caddy/Caddyfile 2>/dev/null; then
    if [ -f /etc/caddy/Caddyfile ]; then
      cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.pre-wbs.$(date +%s)"
    fi
    printf '# managed by wbs-tool configure.sh\nimport %s/caddy/*.caddy\n' "$WBS_ROOT" \
      > /etc/caddy/Caddyfile
  fi
  # An empty import glob is a hard error in Caddy, so seed a placeholder.
  if [ ! -f "$WBS_ROOT/caddy/00-placeholder.caddy" ]; then
    printf ':8080 {\n\trespond "wbs-tool: no site deployed yet" 200\n}\n' \
      > "$WBS_ROOT/caddy/00-placeholder.caddy"
    chown "$WBS_USER:$WBS_USER" "$WBS_ROOT/caddy/00-placeholder.caddy"
  fi
  systemctl enable caddy >/dev/null 2>&1 || true
  systemctl restart caddy
}

grant_caddy_reload() {
  # The single privileged action a deploy still needs. Scoped to exactly one
  # command so it is not a general root grant.
  log "granting $WBS_USER passwordless 'systemctl reload caddy'"
  printf '%s ALL=(root) NOPASSWD: /usr/bin/systemctl reload caddy\n' "$WBS_USER" \
    > /etc/sudoers.d/wbs-caddy-reload
  chmod 0440 /etc/sudoers.d/wbs-caddy-reload
  visudo -cf /etc/sudoers.d/wbs-caddy-reload >/dev/null
}

main() {
  require_root
  require_user
  install_packages
  install_docker
  install_bun
  create_tree
  enable_linger
  configure_caddy
  grant_caddy_reload
  log "done. '$WBS_USER' can now deploy without root."
  log "next: log out and back in, then verify with: bun --version && caddy version"
}

main "$@"
