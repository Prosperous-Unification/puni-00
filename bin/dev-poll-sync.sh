#!/usr/bin/env bash
# Extract and run the requested commit's deployer outside the checkout it may reset.
set -euo pipefail

if [ "$#" -ne 5 ]; then
  echo 'usage: dev-poll-sync.sh <source-checkout> <installed-bin-dir> <bun> <target-sha> <bun-version>' >&2
  exit 2
fi

SRC=$1
BIN=$2
BUN=$3
SHA=$4
EXPECTED_BUN_VERSION=$5

if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "refusing invalid target SHA: $SHA" >&2
  exit 2
fi
if [[ ! "$EXPECTED_BUN_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "refusing invalid managed Bun version: $EXPECTED_BUN_VERSION" >&2
  exit 2
fi

if [ ! -x "$BUN" ]; then
  echo "refusing: missing managed Bun $EXPECTED_BUN_VERSION at $BUN; install it with the poller pair per docs/runbook-dev-deploy.md" >&2
  exit 1
fi
if [ "$("$BUN" --version)" != "$EXPECTED_BUN_VERSION" ]; then
  echo "refusing: managed Bun at $BUN does not match $EXPECTED_BUN_VERSION from .bun-version; after a version bump, reinstall the poller pair per docs/runbook-dev-deploy.md" >&2
  exit 1
fi

mkdir -p "$BIN"
# Commit candidates are recovery snapshots, not an archive. Bound inode use on
# the durable host while leaving recent targets available for diagnosis. The
# pattern also retires the single-file `sync.<sha>.ts` candidates written
# before 2026-09-07 and their interrupted `.XXXXXXXX` siblings.
find "$BIN" -mindepth 1 -maxdepth 1 -name 'sync.*' -mtime +7 -exec rm -rf -- {} +

# The deployer publishes a solver-affecting target from its own build context,
# so a candidate is the target's complete committed tree, not only the module
# graph needed to start sync.ts. A narrow tools/libs archive can execute while
# a later Dagger snapshot silently comes from the older live checkout.
#
# Reading from the fetched target, rather than the checkout's pre-reset tree,
# is the recovery boundary. A broken target deployer can refuse this attempt,
# but its repaired successor is extracted on the next tick and can deploy
# itself — with the contract it was written against, not the one the checkout
# still has. The candidate still runs sync.ts, so solver, restart, recreate
# and post-reset HEAD checks are never bypassed.
CANDIDATE="$BIN/sync.${SHA}"
CANDIDATE_NEXT=''
cleanup_candidate() {
  if [ -n "$CANDIDATE_NEXT" ]; then rm -rf -- "$CANDIDATE_NEXT"; fi
}
trap cleanup_candidate EXIT HUP INT TERM
CANDIDATE_NEXT=$(mktemp -d "$BIN/sync.${SHA}.XXXXXXXX")
# Written to a file first so a refusal from git keeps git's own exit status
# instead of tar's complaint about an empty stream.
git -C "$SRC" archive "$SHA" > "$CANDIDATE_NEXT/.tree.tar"
tar -xf "$CANDIDATE_NEXT/.tree.tar" -C "$CANDIDATE_NEXT"
rm -f -- "$CANDIDATE_NEXT/.tree.tar"
# Packages resolve up the tree from the importing file, as the aliases do.
# The pre-reset checkout's install is the only one on the host, and it is what
# the deployer ran against before candidates existed.
ln -s "$SRC/node_modules" "$CANDIDATE_NEXT/node_modules"
# Two ticks on one target race to the same name. The loser discards its own
# tree and runs the winner's, which the commit hash makes byte-identical; a
# tree only ever appears under the final name complete, by rename.
if mv -T "$CANDIDATE_NEXT" "$CANDIDATE" 2>/dev/null; then
  CANDIDATE_NEXT=''
else
  rm -rf -- "$CANDIDATE_NEXT"
  CANDIDATE_NEXT=''
fi
trap - EXIT HUP INT TERM
# Proof: poller.test.ts requires both the target Docker build inputs and this
# working directory to resolve inside the immutable candidate.
cd "$CANDIDATE"
exec "$BUN" "$CANDIDATE/tools/tool-devsync/src/sync.ts" "$SHA"
