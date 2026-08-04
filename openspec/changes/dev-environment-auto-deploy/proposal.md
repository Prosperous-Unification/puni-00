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

**Dev deploys itself**

- From: every deploy is manual.
- To: a timer on h1claw deploys the newest green `main` to dev, once per SHA, and smokes it.
- Impact: dev tracks main within minutes. Prod stays manual and dry-run-first.

**Migrations in dev**

- From: a new migration aborts any deploy until `--with-migrations` is passed.
- To: unchanged for prod. Dev passes it automatically and names the migration when it reports.

## Non-Goals

Auto-deploying prod. Rollback. Per-PR environments. A second host. Copying prod data
into dev. Authentication on the dev site. Registry retention.

## Constraints

- The repo is public, so a self-hosted Actions runner would give fork PRs execution on
  h1claw — which holds the prod SSH key, registry credentials and the GitHub token. The
  trigger must be outbound-only.
- `be-01.internal` is a network-wide Docker alias: two environments cannot share a network.
- One Caddy owns :80/:443. Joining it to a second network recreates that container —
  seconds of prod downtime, once.
- Blue and green share one SQLite file per environment.
- `deploy.ts` refuses a dirty worktree, so the timer needs its own checkout.

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
script and systemd user timer. No app, lib or contract changes.
