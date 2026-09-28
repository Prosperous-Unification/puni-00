## Why

The h2puni gate tree is also the Docker build context for `wbs-be-01:solver-image-smoke`. The legacy builder copies file modes verbatim, and the orphan proof runs its caller container as the host uid against root-owned image files. From 2026-09-27 23:17Z a caller with umask 077 checked shas out in that tree, leaving tracked files such as `tsconfig.base.json` at 0600. Bun then lost every path alias (`Cannot find module '@wbs/contracts/solver/supervisor-protocol'`), and `optimization-orphan.proc.db.test.ts` timed out at "first managed child started" after 25 s with no cause logged. Every gate failed for about three hours, including branches that never touched the solver.

## What Changes

**Checkout modes**

- From: the locked checkout inherits the caller's umask.
- To: the locked payload sets umask 022 before any checkout or restore.
- Impact: non-breaking.

**Unreadable tracked inputs**

- From: a tracked file or directory closed to other users reaches the Docker context silently.
- To: after the dirty check, the gate exits 66 naming each such path (bounded listing) and the opt-in repair; the pre-gate checkout is restored as for any refusal. A failing scan fails the gate.
- Impact: a tree an out-of-gate checkout damaged is refused until repaired.

**Opt-in repair**

- From: none.
- To: `H2PUNI_GATE_REPAIR_MODES=1` widens tracked regular files and directories of the pinned tree with `go+rX` under the same lock, without following symlinks, before the scan.
- Impact: non-breaking; off by default.

## Non-Goals

No automatic repair. No change to the solver image, the orphan test or the Dockerfile. No mode check on untracked or ignored files.

## Constraints

The payload is a single-quoted `bash -c` string, so it holds no apostrophes and truncates listings without pipes. Assumed: `xargs -r` and `find -maxdepth 0` behave as documented on current macOS (Apple sources); not run there.

## Capabilities

### New Capabilities

- `gate-readable-checkout`: umask 022 checkout, exit 66 on unreadable tracked inputs, opt-in repair under the lock.

### Modified Capabilities

None.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

`bin/h2puni-gate-lib.sh`, `bin/h2puni-gate.test.sh` cases 37-40, and the Gate section of `AGENTS.md`.
