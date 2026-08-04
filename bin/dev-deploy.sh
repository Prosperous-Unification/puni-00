#!/usr/bin/env bash
# Deploy the current HEAD to dev. Run this after pushing.
#
# There is no poller and no CI gate. The push happens on h1claw, so the trigger
# happens on h1claw too -- nothing runs between deploys, and there is no timer
# to notice has died. CI still runs and still reports; it is simply not in the
# path between a push and dev being current.
#
# The build host rule still holds: this builds nothing. It asks h2puni to move
# its checkout, and the watchers already running there do the rest.
set -euo pipefail

SHA=$(git rev-parse HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "refusing: working tree is dirty, so dev would not match any commit" >&2
  exit 1
fi

# A SHA that exists only here cannot be fetched by h2puni. Without this the
# deploy fails on the remote with a bare "reference is not a tree", pointing at
# the wrong machine.
if ! git branch -r --contains "$SHA" >/dev/null 2>&1 || [ -z "$(git branch -r --contains "$SHA" 2>/dev/null)" ]; then
  echo "refusing: ${SHA:0:8} is not on any remote branch -- push first" >&2
  exit 1
fi

echo "[dev-deploy] $BRANCH @ ${SHA:0:8} -> dev"
ssh h2puni "bash -lc 'cd /home/puni1/wbs-dev/src && bun tools/tool-devsync/src/sync.ts $SHA'"

DEV_PASS=$(ssh h2puni 'grep ^DEV_BASIC_AUTH_PASS= /home/puni1/wbs-dev/basic-auth.env | cut -d= -f2-')

# Printing a status code and exiting 0 regardless is how a 502 reads as a
# successful deploy. Each tier is asserted, and a miss fails the script.
fail=0
check() { # name expected url
  local got
  got=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 -u "dany:$DEV_PASS" "$2")
  if [ "$got" = "$1" ]; then
    printf '[dev-deploy] %-28s %s\n' "$3" "$got"
  else
    printf '[dev-deploy] %-28s %s (expected %s) FAIL\n' "$3" "$got" "$1" >&2
    fail=1
  fi
}

# What each code proves, measured rather than assumed:
#
#   /            200 -- Vite served the app shell.
#   /api/health  404 -- be-01 ANSWERED. It mounts /health at its own root, so
#                       Caddy's un-stripped /api prefix reaches a route be-01
#                       does not have. The 404 is Elysia's. If be-01 were dead
#                       Caddy would return 502, which is the signal this
#                       catches. A 200 here would mean the route moved.
#   /ws          404 -- gw-01 answered a plain GET on the socket path. Same
#                       reasoning: 502 means dead.
#
# Do not "fix" the 404s into 200s without moving the routes -- the point is
# that a specific non-5xx code proves the right process replied.
check 200 https://dev.wbs.bulletpoints.club/ 'fe (app shell)'
check 404 https://dev.wbs.bulletpoints.club/api/health 'be (answered, not 502)'
check 404 https://dev.wbs.bulletpoints.club/ws 'gw (answered, not 502)'

if [ "$fail" -ne 0 ]; then
  echo "[dev-deploy] dev is NOT healthy at ${SHA:0:8} -- check: ssh h2puni 'docker logs --tail 50 wbs-dev-src'" >&2
  exit 1
fi
echo "[dev-deploy] dev healthy at ${SHA:0:8}"
