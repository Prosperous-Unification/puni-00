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
printf '[dev-deploy] https://dev.wbs.bulletpoints.club -> '
curl -s -o /dev/null -w '%{http_code}\n' --max-time 15 \
  -u "dany:$DEV_PASS" https://dev.wbs.bulletpoints.club/
