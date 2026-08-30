#!/usr/bin/env bash
# Runs on h2puni from the triggering checkout before devsync snapshots the old tree.
set -euo pipefail

ENV_PATH=${1:?usage: dev-mcp-preflight.sh <env-path> <exposure-state-path>}
EXPOSURE_PATH=${2:?usage: dev-mcp-preflight.sh <env-path> <exposure-state-path>}

if [ ! -f "$ENV_PATH" ]; then
  printf 'missing MCP environment: %s\n' "$ENV_PATH" >&2
  exit 1
fi
if [ ! -r "$ENV_PATH" ]; then
  printf 'unreadable MCP environment: %s\n' "$ENV_PATH" >&2
  exit 1
fi
# The permission bits, read the way this platform spells them.
#
# `stat -c '%a'` is GNU. macOS ships BSD `stat`, which **refuses the flag
# outright** — `stat: illegal option -- c` — so the substitution was empty here
# and `"" != 600` fired on every Mac: the preflight refused a correctly-moded
# 600 file and could never accept one.
#
# Worse than a false refusal, it made the sibling check pass for the wrong
# reason. `refuses an MCP environment whose permissions expose deployment
# settings` asserts a refusal on an 0644 file — and an erroring `stat` refuses
# everything, so that case passed on this platform **with the mode comparison
# doing nothing at all**. It would have gone on passing with the whole `if`
# deleted.
#
# `%Lp` is BSD's octal permission bits without the file type. Written as a
# `case` on `uname` rather than a `||` fallback on purpose: a fallback cannot
# tell "this platform spells it differently" from "this file cannot be read",
# and the second must never be read as a mode.
case "$(uname -s)" in
  Darwin) env_mode=$(stat -f '%Lp' "$ENV_PATH") ;;
  *) env_mode=$(stat -c '%a' "$ENV_PATH") ;;
esac
if [ "$env_mode" != 600 ]; then
  printf 'MCP environment must have mode 600: %s\n' "$ENV_PATH" >&2
  exit 1
fi

for key in PORT MCP_AUTH_MODE WBS_API_URL MCP_PUBLIC_URL; do
  if ! grep -Eq "^${key}=.+$" "$ENV_PATH"; then
    printf 'missing required %s in MCP environment: %s\n' "$key" "$ENV_PATH" >&2
    exit 1
  fi
done

if [ ! -e "$EXPOSURE_PATH" ]; then
  printf '0\n'
  exit 0
fi
if [ ! -f "$EXPOSURE_PATH" ] || [ ! -r "$EXPOSURE_PATH" ]; then
  printf 'unreadable MCP exposure state: %s\n' "$EXPOSURE_PATH" >&2
  exit 1
fi

state=$(cat "$EXPOSURE_PATH")
case "$state" in
  enabled)
    printf '1\n'
    ;;
  *)
    printf 'malformed MCP exposure state: %s\n' "$EXPOSURE_PATH" >&2
    exit 1
    ;;
esac
