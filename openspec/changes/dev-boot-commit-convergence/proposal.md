## Why

On 2026-10-26, after #758 merged as `3cd6e2751`, dev's be-01 `/health` answered that commit while the running process still served the previous `/api/openapi.json` and behaviour: `bun --watch` had not reloaded after the poller's reset, and only `docker restart wbs-dev-src` fixed it. `/health`'s `commit` reads the checkout on every request, so it proves what is on disk and never which code runs.

## What Changes

**be-01 `/health`**

- From: `commit` only, the checkout commit read per request.
- To: also `bootCommit`, the checkout commit read once at boot through the same resolver, on the 200 answer and on every 503 refusal. `commit` keeps its meaning, because the dev observability probe reads it as the disk.
- Impact: additive; prod answers `null` for both.

**`tools/tool-devsync` after a reset**

- From: a code-only reset trusts the watchers and restarts nothing.
- To: it waits a bounded window for be-01's `bootCommit` to equal the new HEAD, restarts the container once if it does not, waits a second bounded window, and then fails the deploy naming what be-01 reported.
- Impact: a reset touching nothing under `apps/`, `libs/` or `tools/` restarts the container at once. A stale boot exits 76, and the poller records it as synced but unproven, so later ticks retry only the proof.

**Poller proof**

- From: proven when `/health` `commit` equals the fetched SHA.
- To: proven only when `bootCommit` does.

## Capabilities

- `dev-deploy` (modified): adds the boot-commit report and the post-reset convergence.

## Non-Goals

- gw-01 and mcp-01 do not gain a boot commit; the container restart covers them but their staleness is not observed.
- The installed poller on h2puni is not reinstalled by this change; the runbook names the step.
- No path heuristic decides that a reset "cannot have affected" a tier; that would rebuild the false assurance this removes.
- Prod's blue/green health gate is untouched.

## Constraints

- `sync.ts`'s import graph stays free of third-party packages (TASK-376).
- Convergence is bounded and then throws; an unreadable or field-less `/health` is a modeled "not yet booted" state inside the window, never a success.
- Tests run with an injected clock and fake tiers; the `sync()` path is exercised end to end in rehearsal mode with a fake `docker`.
