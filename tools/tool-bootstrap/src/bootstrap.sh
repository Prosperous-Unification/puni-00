#!/bin/sh
# Bootstrap a fresh Hetzner host (Debian 12 / Ubuntu 24.04) for the wbs-tool stack.
# Idempotent: safe to re-run.
set -eu

# Lock order: shared edge.lock, then poll/deploy/devsync locks. Keep descriptor 8
# inherited through the candidate loader and its deploy child. A retained owner
# marker (including an interrupted publication) closes ordinary deployment.
WBS_EDGE_STATE="${WBS_EDGE_STATE:-/home/puni1/wbs/state}"
if [ ! -d "$WBS_EDGE_STATE" ] || [ -L "$WBS_EDGE_STATE" ]; then
  echo 'invalid canonical edge state; reader preparation required' >&2; exit 1
fi
controller_state_path=$(realpath -- "$WBS_EDGE_STATE") || exit 1
test "$controller_state_path" = "$WBS_EDGE_STATE" || exit 1
ls -A -- "$WBS_EDGE_STATE" >/dev/null || exit 1
if [ ! -f "$WBS_EDGE_STATE/edge.lock" ] || [ -L "$WBS_EDGE_STATE/edge.lock" ] || [ ! -r "$WBS_EDGE_STATE/edge.lock" ]; then
  echo 'invalid existing canonical edge lock; reader preparation required' >&2; exit 1
fi
# Linux Debian/Ubuntu shells support -ef; edge-admission.test.ts runs these with sh.
# shellcheck disable=SC3013
if [ ! "$WBS_EDGE_STATE/edge.lock" -ef /proc/self/fd/8 ]; then
  exec 8<"$WBS_EDGE_STATE/edge.lock" || exit 1
fi
flock -n 8 || { echo "shared edge lock held: $WBS_EDGE_STATE/edge.lock" >&2; exit 75; }
WBS_EDGE_LOCK_FD=8
export WBS_EDGE_LOCK_FD
for edge_owner in "$WBS_EDGE_STATE/edge-owner.json" "$WBS_EDGE_STATE/edge-owner.pending"; do
  if [ -e "$edge_owner" ] || [ -L "$edge_owner" ]; then
    echo "shared edge owner admission closed: $edge_owner; retained marker; no activation" >&2
    exit 1
  fi
done

set -eu
controller_bun='/home/puni1/.local/lib/wbs-solver/bun'
controller_program='/home/puni1/.local/lib/wbs-solver/solver-supervisor.js'
for controller_reader in "$controller_bun" "$controller_program"; do
  if [ ! -f "$controller_reader" ] || [ -L "$controller_reader" ] || [ ! -r "$controller_reader" ] || [ ! -x "$controller_reader" ]; then
    echo 'fixed installed controller reader unavailable; reader preparation or explicit old-reader transition required' >&2
    exit 1
  fi
  controller_file_mode=$(stat -Lc %a -- "$controller_reader") || exit 1
  controller_file_uid=$(stat -Lc %u -- "$controller_reader") || exit 1
  controller_file_gid=$(stat -Lc %g -- "$controller_reader") || exit 1
  controller_file_path=$(realpath -- "$controller_reader") || exit 1
  if [ "$controller_file_mode" != 755 ] || [ "$controller_file_uid" != 1000 ] || [ "$controller_file_gid" != 1000 ] || [ "$controller_file_path" != "$controller_reader" ]; then
    echo 'fixed installed controller reader unavailable; reader preparation required' >&2
    exit 1
  fi
done
controller_bun_parent=$(dirname -- "$controller_bun") || exit 1
controller_program_parent=$(dirname -- "$controller_program") || exit 1
for controller_directory in "$controller_bun_parent" "$controller_program_parent"; do
  test -d "$controller_directory" || exit 1
  test ! -L "$controller_directory" || exit 1
  controller_directory_path=$(realpath -- "$controller_directory") || exit 1
  test "$controller_directory_path" = "$controller_directory" || exit 1
  ls -A -- "$controller_directory" >/dev/null || exit 1
done
controller_bun_parent_identity=$(stat -Lc '%d:%i:%a:%u:%g' -- "$controller_bun_parent") || exit 1
controller_program_parent_identity=$(stat -Lc '%d:%i:%a:%u:%g' -- "$controller_program_parent") || exit 1
controller_bun_identity=$(stat -Lc '%d:%i:%a:%u:%g:%s:%Y:%Z' -- "$controller_bun") || exit 1
controller_program_identity=$(stat -Lc '%d:%i:%a:%u:%g:%s:%Y:%Z' -- "$controller_program") || exit 1
controller_bun_hash=$(sha256sum -- "$controller_bun") || exit 1
controller_program_hash=$(sha256sum -- "$controller_program") || exit 1
for controller_observation in "$controller_bun_parent_identity" "$controller_program_parent_identity" "$controller_bun_identity" "$controller_program_identity" "$controller_bun_hash" "$controller_program_hash"; do
  if [ -z "$controller_observation" ]; then echo 'required installed controller observation was empty' >&2; exit 1; fi
done
WBS_EDGE_LOCK_FD=8; export WBS_EDGE_LOCK_FD
"$controller_bun" "$controller_program" --check-controller-admission-inherited=required || exit 1
for controller_reader in "$controller_bun" "$controller_program"; do
  if [ ! -f "$controller_reader" ] || [ -L "$controller_reader" ] || [ ! -r "$controller_reader" ] || [ ! -x "$controller_reader" ]; then
    echo 'fixed installed controller reader changed during admission' >&2
    exit 1
  fi
  controller_file_path=$(realpath -- "$controller_reader") || exit 1
  test "$controller_file_path" = "$controller_reader" || exit 1
done
for controller_directory in "$controller_bun_parent" "$controller_program_parent"; do
  test -d "$controller_directory" || exit 1
  test ! -L "$controller_directory" || exit 1
  controller_directory_path=$(realpath -- "$controller_directory") || exit 1
  test "$controller_directory_path" = "$controller_directory" || exit 1
  ls -A -- "$controller_directory" >/dev/null || exit 1
done
controller_current_bun_parent_identity=$(stat -Lc '%d:%i:%a:%u:%g' -- "$controller_bun_parent") || exit 1
controller_current_program_parent_identity=$(stat -Lc '%d:%i:%a:%u:%g' -- "$controller_program_parent") || exit 1
controller_current_bun_identity=$(stat -Lc '%d:%i:%a:%u:%g:%s:%Y:%Z' -- "$controller_bun") || exit 1
controller_current_program_identity=$(stat -Lc '%d:%i:%a:%u:%g:%s:%Y:%Z' -- "$controller_program") || exit 1
controller_current_bun_hash=$(sha256sum -- "$controller_bun") || exit 1
controller_current_program_hash=$(sha256sum -- "$controller_program") || exit 1
if [ "$controller_current_bun_parent_identity" != "$controller_bun_parent_identity" ] || [ "$controller_current_program_parent_identity" != "$controller_program_parent_identity" ] || [ "$controller_current_bun_identity" != "$controller_bun_identity" ] || [ "$controller_current_program_identity" != "$controller_program_identity" ] || [ "$controller_current_bun_hash" != "$controller_bun_hash" ] || [ "$controller_current_program_hash" != "$controller_program_hash" ]; then
  echo 'fixed installed controller reader changed during admission' >&2
  exit 1
fi

log() { printf '[bootstrap] %s\n' "$*"; }

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    log "must run as root (or via sudo)"; exit 1
  fi
}

install_packages() {
  log "apt update + base packages"
  apt-get update -y
  apt-get install -y --no-install-recommends \
    curl ca-certificates gnupg unzip sudo
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    log "docker already installed — skipping"
    return
  fi
  log "installing docker engine + compose plugin"
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091  # /etc/os-release exists on the target host, not in this repo
  echo \
    "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
    https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
}

install_bun() {
  if command -v bun >/dev/null 2>&1; then
    log "bun already installed — skipping"
    return
  fi
  log "installing bun (pinned)"
  # Keep in sync with configure.sh's BUN_VERSION: that script re-pins to the
  # same version unconditionally (converging even if this one is skipped
  # because bun was already present), but the two defaults drifting apart is
  # exactly the kind of leftover-vs-current confusion this project has hit
  # before — see configure.sh's own comment on why the pin matters.
  BUN_VERSION="${BUN_VERSION:-1.3.14}"
  curl -fsSL "https://bun.sh/install" | BUN_INSTALL=/usr/local bash -s -- "bun-v${BUN_VERSION}"
}

create_tree() {
  log "creating /home/puni1/wbs/* tree"
  # `compose` holds swap.js's rendered per-colour compose overrides
  # (lib/docker.ts's tierComposeFile: /home/puni1/wbs/compose/<app>-<color>.yml) —
  # writeAtomic() does not mkdir -p, so the first-ever swap on a fresh host
  # would fail here if this directory did not already exist (item 2 of the
  # cross-review fix: this was missing from both this script and
  # configure.sh, and the server only ever worked because it was created by
  # hand during earlier rehearsals).
  for d in /home/puni1/wbs/bin /home/puni1/wbs/compose /home/puni1/wbs/releases /home/puni1/wbs/state /home/puni1/wbs/state/fragments \
           /home/puni1/wbs/data /home/puni1/wbs/logs /home/puni1/wbs/caddy; do
    mkdir -p "$d"
  done
  chmod 0750 /home/puni1/wbs
  touch /home/puni1/wbs/.env
  chmod 0600 /home/puni1/wbs/.env
}

main() {
  require_root
  install_packages
  install_docker
  install_bun
  create_tree
  log "bootstrap complete"
}

main "$@"
