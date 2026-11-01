#!/usr/bin/env bash
# Extract and run the requested commit's deployer outside the checkout it may reset.
set -euo pipefail

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
"$controller_bun" "$controller_program" --check-controller-admission-inherited=legacy || exit 1
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

if [ "$#" -lt 5 ]; then
  echo 'usage: dev-poll-sync.sh <source-checkout> <installed-bin-dir> <bun> <target-sha> <bun-version> [sync-args...]' >&2
  exit 2
fi

SRC=$1
BIN=$2
BUN=$3
SHA=$4
EXPECTED_BUN_VERSION=$5
shift 5
SYNC_ARGS=("$@")

if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "refusing invalid target SHA: $SHA" >&2
  exit 2
fi
if [[ ! "$EXPECTED_BUN_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "refusing invalid managed Bun version: $EXPECTED_BUN_VERSION" >&2
  exit 2
fi

mkdir -p "$BIN"
# Commit candidates are recovery snapshots, not an archive. Bound inode use on
# the durable host while leaving recent targets available for diagnosis. The
# pattern also retires the single-file `sync.<sha>.ts` candidates written
# before 2026-09-07 and their interrupted `.XXXXXXXX` siblings.
find "$BIN" -mindepth 1 -maxdepth 1 -name 'sync.*' -mmin +1440 -exec rm -rf -- {} +

# Reclaiming commit-derived snapshots does not depend on the interpreter. Keep
# it ahead of these refusals so a broken or interrupted managed-Bun handoff
# cannot also pin old candidates while the operator repairs the installation.
if [ ! -x "$BUN" ]; then
  echo "refusing: missing managed Bun $EXPECTED_BUN_VERSION at $BUN; install it with the poller pair per docs/runbook-dev-deploy.md" >&2
  exit 1
fi
if [ "$("$BUN" --version)" != "$EXPECTED_BUN_VERSION" ]; then
  echo "refusing: managed Bun at $BUN does not match $EXPECTED_BUN_VERSION from .bun-version; after a version bump, reinstall the poller pair per docs/runbook-dev-deploy.md" >&2
  exit 1
fi

# The candidate is the target's complete committed tree, checked out detached
# at the exact SHA from a local clone. A local clone hard-links loose and pack
# objects instead of using an alternates file: source `git gc` may unlink its
# names, but the candidate's links keep those objects alive for its bounded
# 24-hour recovery window. Two things
# need the whole tree rather than the deployer's module graph alone:
#
# - The deployer reaches the deploy contract through the workspace tsconfig
#   `paths`, and Bun resolves those from the tsconfig nearest the importing
#   file. A bare `sync.ts` copied into $BIN has none: every tick on h2puni
#   failed on `Cannot find module '@tools/deploy-contract'` the day that copy
#   was first installed (2026-09-07).
# - A solver-affecting target publishes its `be` image from its own build
#   context (TASK-326): Dockerfile, publisher, supervisor unit and lockfile
#   as the target commit has them, with a HEAD that answers the target SHA.
#   A narrower archive executes while a later Dagger snapshot silently comes
#   from the older live checkout.
#
# Reading from the fetched target, rather than the checkout's pre-reset tree,
# is the recovery boundary. A broken target deployer can refuse this attempt,
# but its repaired successor is materialized on the next tick and can deploy
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
git clone --quiet --local --no-checkout "$SRC" "$CANDIDATE_NEXT"
git -C "$CANDIDATE_NEXT" checkout --quiet --detach "$SHA"
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
# third-party packages: relative imports, the tsconfig path aliases the tree
# carries, and Bun/Node builtins only. That is what `sync.ts` already is
# (`@tools/deploy-contract` plus `bun`), and it is now enforced rather than
# assumed. Bun's own resolver is the enforcement: bundling the candidate's
# deployer resolves the whole transitive graph without running it, and with no
# `node_modules` in or above the candidate, any bare specifier that is not a
# builtin cannot resolve.
#
# The guard is two questions, because "it resolved" is not the property that
# matters — "it resolved to a file the candidate carries" is.
#
# 1. `--reject-unresolved`. Bun's default is `--allow-unresolved='*'`: a static
#    bare import fails the build, but an opaque `await import(name)` or
#    `require(name)` is waved straight through. Without the flag a deployer
#    passes this guard and still carries a runtime third-party dependency,
#    which is the exact silence the borrowed symlink had. The cost is that
#    every specifier must be statically analysable, including a computed
#    `node:fs` — a real restriction on the deployer, taken deliberately,
#    because an opaque specifier is precisely what cannot be checked here.
# 2. The resolved input set must live inside the candidate. Resolving is not
#    the same as staying home: `/home/puni1/wbs-dev/src/node_modules/x`, or
#    enough `../`, resolves perfectly well against the pinned checkout this
#    task exists to stop borrowing from. So the build is run from inside the
#    candidate and its metafile inputs are audited; anything absolute or above
#    the candidate refuses the tick.
#
# What neither question covers, stated rather than implied: code assembled at
# run time by `eval` or `new Function` is invisible to any build-time graph,
# and so is any process the deployer SPAWNS. The graph checked here is the one
# `exec` below starts; a child the deployer runs from this tree — the Dagger
# publisher on a solver-affecting tick — resolves for itself, against a tree
# that has no install. docs/runbook-dev-deploy.md says what that means.
#
# The cost is one extra Bun invocation per tick, ahead of a deploy that takes
# orders of magnitude longer — and `dev-poll.sh` exits before this loader
# entirely on a no-change tick, so it is only paid when a target is pending.
RESOLVE_OUT="$CANDIDATE_NEXT/.resolve"
RESOLVE_META="$CANDIDATE_NEXT/.resolve.json"
if ! (cd "$CANDIDATE_NEXT" && "$BUN" build --target=bun --reject-unresolved \
  --outdir="$RESOLVE_OUT" --metafile="$RESOLVE_META" \
  ./tools/tool-devsync/src/sync.ts) > "$CANDIDATE_NEXT/.resolve.log" 2>&1; then
  echo "refusing target $SHA: the deployer's import graph does not resolve inside the extracted candidate." >&2
  echo "The dev deployer may import only relative files, @wbs/* aliases and Bun/Node builtins, with statically analysable specifiers; it runs before any install for this commit exists. See docs/runbook-dev-deploy.md." >&2
  cat "$CANDIDATE_NEXT/.resolve.log" >&2
  exit 1
fi
# The build ran with the candidate as its working directory, so an input that
# escaped it is exactly one that is absolute or starts with `../`.
if ! WBS_RESOLVE_META="$RESOLVE_META" "$BUN" -e '
const meta = JSON.parse(require("fs").readFileSync(process.env.WBS_RESOLVE_META, "utf8"));
const outside = Object.keys(meta.inputs ?? {}).filter(
  (p) => p.startsWith("/") || p === ".." || p.startsWith("../"),
);
if (outside.length) {
  console.error(outside.join("\n"));
  process.exit(1);
}
' > "$CANDIDATE_NEXT/.resolve.log" 2>&1; then
  echo "refusing target $SHA: the deployer resolves files outside the extracted candidate." >&2
  echo "Every file the dev deployer imports must be one the candidate tree carries; a path into the pinned checkout is the stale install this guard exists to refuse. See docs/runbook-dev-deploy.md." >&2
  cat "$CANDIDATE_NEXT/.resolve.log" >&2
  exit 1
fi
# The guard's scratch is removed so the tree the deployer sees is the clean
# target tree, exactly as `git checkout --detach` left it.
#
# Nothing in sync.ts enforces that — `grep status tools/tool-devsync/src/sync.ts`
# is empty, and a comment here once claimed otherwise. What holds the line is
# `poller.test.ts`'s complete-tree case, whose probing Bun runs
# `git status --porcelain` in the candidate and exits 44 `target tree is dirty`;
# deleting this `rm -rf` was watched failing there. Stated rather than implied,
# because a cleanup whose reason is a check that does not exist is one edit away
# from being dropped as redundant.
rm -rf -- "$RESOLVE_OUT" "$RESOLVE_META" "$CANDIDATE_NEXT/.resolve.log"
# Two ticks on one target race to the same name. The loser discards its own
# clean detached clone and runs the winner's, which the commit hash makes
# byte-identical; a tree only ever appears under the final name complete, by
# rename.
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
exec "$BUN" "$CANDIDATE/tools/tool-devsync/src/sync.ts" "$SHA" "${SYNC_ARGS[@]}"
