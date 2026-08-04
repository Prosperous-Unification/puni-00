## Why

Merged work reaches a running system only when someone runs `bun run deploy` by hand
against prod. There is nowhere to look at a change before it is live, and no rehearsal
of the deploy path: the first swap executed for a given commit is the production one.
Prod has no rollback — `--version` and `--since` are parsed and ignored — so a fault
found after a deploy is fixed forward, under whatever pressure is already on.

## What Changes

**A second environment on h2puni**

- From: one environment, rooted at `/srv/wbs`, serving one site.
- To: `dev` alongside `prod`, selected by `WBS_ENV`. Unset keeps prod byte-identical.
- Impact: non-breaking; no prod behaviour changes.

**Dev deploys from source, on request**

- From: every deploy is manual, and dev is built into images like prod.
- To: `git push && ./bin/dev-deploy.sh` resets dev's checkout; the tiers already watch it.
- Impact: dev tracks the pushed commit in seconds. Prod stays manual, image-based and
  dry-run-first.

Revised 2026-08-04. This was going to be a timer on h1claw polling `ci` for the newest
green `main`. Source-run dev made a deploy cheap enough that the operator who pushes can
trigger it directly, which removes the poller, the timer and the CI wait. The cost is that
dev no longer exercises the image path -- see Non-Goals.

**Migrations in dev**

- From: a new migration aborts any deploy until `--with-migrations` is passed.
- To: unchanged for prod. Dev's single be-01 migrates at boot, and a change under the
  migration directory forces the restart that makes that happen.

## Non-Goals

Auto-deploying prod. Rollback. Per-PR environments. A second host. Copying prod data
into dev. Registry retention.

Two former non-goals changed. Dev **is** authenticated now — it serves unreleased code on a
public hostname, so it sits behind basic auth on every path but the WebSocket upgrade.
And dev no longer rehearses the prod deploy path: the swap, health gate, Caddy repoint and
smoke test used to run on dev first and now do not, so a prod dry-run must be deliberate.

## Constraints

- The repo is public, so a self-hosted Actions runner would give fork PRs execution on
  h1claw — which holds the prod SSH key, registry credentials and the GitHub token. Nothing
  in this change accepts inbound connections or grants CI execution on our hosts.
- `be-01.internal` is a network-wide Docker alias: two environments cannot share a network.
- One Caddy owns :80/:443. Joining it to a second network recreates that container —
  seconds of prod downtime, once.
- Blue and green share one SQLite file per environment.
- `deploy.ts` refuses a dirty worktree, so dev needs its own checkout separate from the operator's.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `deployment-pipeline`: remote root, network, site file and container names become
  environment-scoped; adds an unattended dev trigger, build-host mutual exclusion, and
  dev-only migration handling.

## Domain Terms

Environment, Environment root, Deploy trigger.

## Decisions Recorded

- [ADR 0001](../../../docs/adr/0001-dev-environment-shares-the-prod-host.md)

## Impact

`tool-remote-scripts` (`lib/docker.ts`, `swap.ts`), `tool-deploy` (`deploy.ts`,
`remote-state.ts`, `affected.ts`), `tool-smoke`, `deploy/compose/base.yml`. New: a poll
script. No systemd timer: nothing runs between deploys. No lib or contract changes; `apps/fe-01/vite.config.ts` gains a host binding so the dev server is reachable from behind the proxy.
