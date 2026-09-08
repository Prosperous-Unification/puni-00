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

# The deployer is one file, but it reaches the deploy contract through the
# `@wbs/*` tsconfig paths, and Bun resolves those from the tsconfig nearest the
# importing file. A bare `sync.ts` copied into $BIN has none: every tick on
# h2puni failed on `Cannot find module '@wbs/deploy-contract'` the day that
# copy was first installed (2026-09-07). So the candidate is the target's own
# `tools/`, `libs/` and root configs, laid out as the commit has them, and the
# deployer runs from inside that tree.
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
git -C "$SRC" archive "$SHA" -- tools libs tsconfig.base.json package.json > "$CANDIDATE_NEXT/.tree.tar"
tar -xf "$CANDIDATE_NEXT/.tree.tar" -C "$CANDIDATE_NEXT"
rm -f -- "$CANDIDATE_NEXT/.tree.tar"
# NO INSTALL IS LINKED IN, AND THAT IS THE CONTRACT (TASK-376).
#
# Until 2026-09-08 this linked `$SRC/node_modules` into the candidate. The
# checkout's install is pinned to whatever commit the checkout last reset to,
# which is by definition not the target being deployed. So the borrowed link
# had two failure modes and no success mode worth keeping: a package the
# target added is missing, or — worse, because it is silent — a package the
# target bumped resolves to the pre-reset version. Either way the new deployer
# needs an install that can only arrive through the new deployer, which is the
# bootstrap deadlock the candidate tree exists to break.
#
# The answer is that the deployer's import graph is out of bounds for
# third-party packages: relative imports, the `@wbs/*` aliases the archive
# above carries, and Bun/Node builtins only. That is what `sync.ts` already is
# (`@wbs/deploy-contract` plus `bun`), and it is now enforced rather than
# assumed. Bun's own resolver is the enforcement: bundling the candidate's
# deployer resolves the whole transitive graph without running it, and with no
# `node_modules` in or above the candidate, any bare specifier that is not a
# builtin cannot resolve.
#
# The cost is one extra Bun invocation per tick, ahead of a deploy that takes
# orders of magnitude longer. What it buys: the day someone adds a real
# dependency to this graph, the tick refuses here by name instead of deploying
# against a stale install.
#
# `--reject-unresolved` is load-bearing, not belt-and-braces. Bun's default is
# `--allow-unresolved='*'`: a static bare import fails the build, but an opaque
# `await import(name)` or `require(name)` is allowed straight through. Without
# the flag a deployer could pass this guard and still carry a runtime
# third-party dependency — resolved, if at all, against whatever the host
# happens to have — which is the exact silence the borrowed symlink had.
RESOLVE_OUT="$CANDIDATE_NEXT/.resolve"
if ! "$BUN" build --target=bun --reject-unresolved --outdir="$RESOLVE_OUT" \
  "$CANDIDATE_NEXT/tools/tool-devsync/src/sync.ts" > "$CANDIDATE_NEXT/.resolve.log" 2>&1; then
  echo "refusing target $SHA: the deployer's import graph does not resolve inside the extracted candidate." >&2
  echo "The dev deployer may import only relative files, @wbs/* aliases and Bun/Node builtins; it runs before any install for this commit exists. See docs/runbook-dev-deploy.md." >&2
  cat "$CANDIDATE_NEXT/.resolve.log" >&2
  exit 1
fi
rm -rf -- "$RESOLVE_OUT" "$CANDIDATE_NEXT/.resolve.log"
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
cd "$SRC"
exec "$BUN" "$CANDIDATE/tools/tool-devsync/src/sync.ts" "$SHA"
