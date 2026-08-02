#!/bin/sh
# One-time host configuration for the wbs-tool stack (Compose model).
#
# Everything here needs root and runs once per host. After this, all deploy
# operations run unprivileged as $WBS_USER via the docker group.
#
# There is no host Caddy and no bun on the host: the reverse proxy and the
# registry both run as containers (see deploy/compose/base.yml), and images
# are built off-host by Dagger and published by digest.
#
# Usage:
#   sudo WBS_USER=puni1 REGISTRY_USER=wbs REGISTRY_PASS=<pw> sh configure.sh
#
# Optional:
#   REGISTRY_HOST         hostname:port the host docker daemon logs in to
#                         and (if REGISTRY_INSECURE=1) allow-lists as
#                         plaintext HTTP. Defaults to the eventual public
#                         hostname; override with an internal address
#                         (e.g. 127.0.0.1:5000) until DNS/TLS exist for it.
#   REGISTRY_INSECURE=1   add REGISTRY_HOST to the docker daemon's
#                         insecure-registries list and restart docker.
#                         Needed whenever REGISTRY_HOST has no TLS in front
#                         of it yet.
#
# Idempotent: safe to re-run.
set -eu

WBS_USER="${WBS_USER:-puni1}"
WBS_ROOT="${WBS_ROOT:-/srv/wbs}"
REGISTRY_HOST="${REGISTRY_HOST:-registry.infra.bulletpoints.club}"
REGISTRY_USER="${REGISTRY_USER:-wbs}"
REGISTRY_INSECURE="${REGISTRY_INSECURE:-0}"
# Same override pattern as REGISTRY_HOST: defaults to the eventual public
# hostname, override with e.g. ":80" on a host where DNS for it doesn't
# exist yet (a bare ":80" Caddyfile address matches any Host header, with no
# automatic HTTPS / ACME attempt — see tools/tool-remote-scripts/src/swap.ts,
# which the real per-deploy render-route step reads this same variable from).
SITE_ADDRESS="${SITE_ADDRESS:-wbs.bulletpoints.club}"

log() { printf '[configure] %s\n' "$*"; }
die() { printf '[configure] %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "must run as root"
id "$WBS_USER" >/dev/null 2>&1 || die "user '$WBS_USER' does not exist"
[ -n "${REGISTRY_PASS:-}" ] || die "REGISTRY_PASS must be set"

log "installing docker + htpasswd"
apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates curl git docker.io docker-compose-v2 apache2-utils python3
usermod -aG docker "$WBS_USER"

log "disabling any pre-existing host Caddy (a containerised Caddy owns 80/443 now)"
if systemctl list-unit-files caddy.service >/dev/null 2>&1; then
  systemctl disable --now caddy || true
fi
rm -f /etc/sudoers.d/wbs-caddy-reload

log "creating $WBS_ROOT"
for d in "$WBS_ROOT" "$WBS_ROOT/data" "$WBS_ROOT/logs" "$WBS_ROOT/caddy" "$WBS_ROOT/state"; do
  mkdir -p "$d"
done
[ -f "$WBS_ROOT/.env" ] || touch "$WBS_ROOT/.env"
chown -R "$WBS_USER:$WBS_USER" "$WBS_ROOT"
chmod 0750 "$WBS_ROOT"
chmod 0600 "$WBS_ROOT/.env"

# caddy:2-alpine hard-errors (and crash-loops) with no /etc/caddy/Caddyfile
# at all, so a fresh host needs one before the first real deploy ever runs.
#
# Written UNCONDITIONALLY, every re-run — this file's own content never
# changes, it always just imports site.caddy (see
# deploy/compose/Caddyfile.bootstrap for the full history: this used to be a
# placeholder written only-if-absent, with the real `import site.caddy`
# version left for "the deploy pipeline" to install later, except nothing
# ever did — `caddy reload` kept exiting 0 forever while silently still
# serving the placeholder, invisibly, until Task 12's rehearsal caught it
# live). Keep in sync with deploy/compose/Caddyfile.bootstrap — duplicated
# inline here, rather than read from that file, because this script is
# copied to the host alone (see the module docstring's `scp ... sh
# configure.sh` usage), with no guarantee the rest of the repo is present
# alongside it.
log "writing $WBS_ROOT/caddy/Caddyfile (imports site.caddy)"
cat > "$WBS_ROOT/caddy/Caddyfile" <<'CADDYFILE'
import site.caddy
CADDYFILE
chown "$WBS_USER:$WBS_USER" "$WBS_ROOT/caddy/Caddyfile"

# Caddy would then hard-error on `import site.caddy` if site.caddy itself
# didn't exist — so seed one, but ONLY if absent: unlike Caddyfile, this
# file's real content is deploy state (which colour each tier currently
# routes to), rewritten by every real swap's render-route step, and must
# never be clobbered by a later re-run of this script. The seed says every
# tier is honestly "not yet deployed" — the exact same shape a real
# render-route would produce for a tier with no observed colour (see
# tools/tool-remote-scripts/src/lib/site.ts's `routeBlock`) — rather than
# guessing a colour, so the first real deploy of any tier reads back a
# clean, un-corrupted `null` for every tier it hasn't touched yet.
if [ ! -f "$WBS_ROOT/caddy/site.caddy" ]; then
  log "seeding $WBS_ROOT/caddy/site.caddy (nothing deployed yet, for any tier)"
  cat > "$WBS_ROOT/caddy/site.caddy" <<CADDYFILE
$SITE_ADDRESS {
	encode gzip

	handle /ws* {
		respond "gw-01 not yet deployed" 503
	}

	handle /api/* {
		respond "be-01 not yet deployed" 503
	}

	handle {
		respond "fe-01 not yet deployed" 503
	}

	log {
		output file /var/log/caddy/access.log
	}
}

registry.infra.bulletpoints.club {
	reverse_proxy registry:5000 {
		header_up X-Forwarded-Proto {scheme}
		header_up X-Forwarded-For {remote_host}
	}
	request_body {
		max_size 2GB
	}
}
CADDYFILE
  chown "$WBS_USER:$WBS_USER" "$WBS_ROOT/caddy/site.caddy"
fi

log "writing registry htpasswd"
# bcrypt (-B) is the only format registry:2 accepts.
htpasswd -Bbn "$REGISTRY_USER" "$REGISTRY_PASS" > "$WBS_ROOT/registry.htpasswd"
chown "$WBS_USER:$WBS_USER" "$WBS_ROOT/registry.htpasswd"
chmod 0640 "$WBS_ROOT/registry.htpasswd"

log "recording REGISTRY_PASS in $WBS_ROOT/.env so later deploys can re-authenticate"
# Preserve every other line already in .env (app secrets live here too);
# only the REGISTRY_PASS line itself is replaced.
env_tmp="$WBS_ROOT/.env.tmp.$$"
grep -v '^REGISTRY_PASS=' "$WBS_ROOT/.env" > "$env_tmp" 2>/dev/null || true
printf 'REGISTRY_PASS=%s\n' "$REGISTRY_PASS" >> "$env_tmp"
mv "$env_tmp" "$WBS_ROOT/.env"
chown "$WBS_USER:$WBS_USER" "$WBS_ROOT/.env"
chmod 0600 "$WBS_ROOT/.env"

log "enabling systemd lingering for $WBS_USER"
loginctl enable-linger "$WBS_USER"

if [ "$REGISTRY_INSECURE" = "1" ]; then
  log "checking whether $REGISTRY_HOST needs allow-listing as an insecure (plaintext HTTP) registry"
  mkdir -p /etc/docker
  daemon_json=/etc/docker/daemon.json
  [ -f "$daemon_json" ] || printf '{}\n' > "$daemon_json"
  # Only restart docker (which bounces every running container — caddy,
  # registry, and anything else on the host, e.g. dagger-engine) if this
  # actually changes the file. Restarting unconditionally on every re-run
  # would contradict "idempotent, safe to re-run" above.
  daemon_json_changed=$(python3 - "$daemon_json" "$REGISTRY_HOST" <<'PY'
import json, sys
path, host = sys.argv[1], sys.argv[2]
with open(path) as f:
    text = f.read().strip()
cfg = json.loads(text) if text else {}
regs = set(cfg.get("insecure-registries", []))
if host in regs:
    print("unchanged")
else:
    regs.add(host)
    cfg["insecure-registries"] = sorted(regs)
    with open(path, "w") as f:
        json.dump(cfg, f, indent=2)
        f.write("\n")
    print("changed")
PY
)
  if [ "$daemon_json_changed" = "changed" ]; then
    log "added $REGISTRY_HOST to insecure-registries — restarting docker to apply"
    systemctl restart docker
  else
    log "$REGISTRY_HOST already allow-listed — skipping docker restart"
  fi
fi

log "logging the host docker daemon in to $REGISTRY_HOST"
# The server pulls its own images. Without this, `docker compose up` fails to
# authenticate against the registry it is itself hosting.
su - "$WBS_USER" -c "echo '$REGISTRY_PASS' | docker login '$REGISTRY_HOST' -u '$REGISTRY_USER' --password-stdin"

log "done. '$WBS_USER' can now deploy without root."
