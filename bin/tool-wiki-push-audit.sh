#!/usr/bin/env bash
set -euo pipefail

candidate_root=${1:?candidate checkout is required}
revision=${2:?committed revision is required}
activation_root=${TOOL_WIKI_ACTIVATION_ROOT:-}

# Proof: gate-entrypoints.test.ts runs this production script without external activation and
# observes an explicit non-certifying inactive report with exit 0.
if [[ -z $activation_root || ! -e $activation_root/active-v1 ]]; then
  printf '%s\n' '{"schemaVersion":1,"status":"inactive","certified":false,"reason":"external activation marker is not provisioned"}'
  exit 0
fi

if ! trusted_root=$(realpath -- "$activation_root") || [[ ! -d $trusted_root ]]; then
  printf 'external activation root is not a readable directory\n' >&2
  exit 78
fi
if ! candidate=$(realpath -- "$candidate_root") || [[ ! -d $candidate ]]; then
  printf 'candidate checkout is not a readable directory\n' >&2
  exit 78
fi
case "$trusted_root" in
  "$candidate" | "$candidate"/*)
    printf 'external activation root resolved inside candidate checkout\n' >&2
    exit 78
    ;;
esac

marker="$trusted_root/active-v1"
if [[ ! -f $marker ]] || [[ ! -r $marker ]] || [[ $(<"$marker") != tool-wiki-active-v1 ]]; then
  printf 'external activation marker is unreadable or malformed\n' >&2
  exit 78
fi
descriptor="$trusted_root/launcher-path"
if [[ ! -r $descriptor ]]; then
  printf 'external activation has no readable launcher descriptor\n' >&2
  exit 78
fi
launcher_ref=$(<"$descriptor")
if [[ $launcher_ref != /* ]]; then launcher_ref="$trusted_root/$launcher_ref"; fi
if ! launcher=$(realpath -- "$launcher_ref") || [[ ! -f $launcher ]] || [[ ! -r $launcher ]]; then
  printf 'external launcher is not a readable regular file\n' >&2
  exit 78
fi
# Proof: gate-entrypoints.test.ts invokes this production script through a symlinked candidate
# workspace while the external descriptor resolves back into it; canonical comparison exits 78.
case "$launcher" in
  "$candidate"/*)
    printf 'external launcher resolved inside candidate checkout\n' >&2
    exit 78
    ;;
esac

# Proof: gate-entrypoints.test.ts supplies a relative descriptor and observes the external
# launcher receive the canonical candidate path and exact revision, independent of caller cwd.
exec bash "$launcher" committed "$candidate" "$revision"
