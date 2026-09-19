## Why

Dany, 2026-09-19: WBS work moves to puni-00 and wbs-tool-v1 is retired. The dev
auto-deploy on h2puni still follows wbs-tool-v1: `/home/puni1/wbs-dev/src` has
`origin` = `wbs-tool-v1`, and the host poller (cron, every minute) is this
repo's `bin/dev-poll.sh`, which fetches that remote's `main` and runs
`bin/dev-poll-sync.sh` → `tools/tool-devsync/src/sync.ts`. A puni-00 merge never
reaches dev. wbs-tool-v1 `main` (`73e00574`) has no commit missing from puni-00.

The deploy proof is also broken twice over. Since 2026-09-18T10:09Z
`read_served_commit` logs `'<unreadable>'`; and once `git reset` has moved
`HEAD`, the next tick sees `HEAD == origin/main` and exits before proving
anything, so a failed proof is never retried.

## What Changes

- Dev follows puni-00 `main`, cut over in one attended step with a rollback.
- The proof is named for what it is: `/health.commit` is the **checkout commit**
  (`apps/wbs/be-01/src/deployed-commit.ts` documents why it is not a boot-time
  value). The reader requires HTTP 200, `status:"ok"` and one exact 40-hex
  commit.
- A deploy is done only when proven: the poller keeps a durable
  `last-proven` SHA and re-proves while it differs from `HEAD`, instead of
  exiting on `HEAD == origin/main`.
- `sync.ts` takes its source, container and state paths as inputs so a
  rehearsal cannot touch live dev.

## Non-Goals

No prod deploy change (prod stays manual and does not serve MCP), no k3s work,
no boot-time commit capture. Archiving wbs-tool-v1 on GitHub is Dany's call
after cutover.

## Constraints

Dev keeps serving through the switch. `bin/dev-poll.sh` is the only poller
source; no copy under `ops/`. R5: unreadable proof is a failure.

## Capabilities

### New Capabilities

- `dev-deploy`: which repository dev follows and how a dev deploy proves itself.

## Domain Terms

Checkout commit (new): the commit the dev source tree on disk is at. Add to
`CONTEXT.md` before implementation.

## Decisions Recorded

A1: puni-00 `main` becomes the only dev source; falsified if Dany wants
wbs-tool-v1 kept as a mirror.

## Impact

`bin/dev-poll.sh`, `tools/tool-devsync/src/sync.ts`, `LLM_README.md` deploy
section; claire queue WBS task `repo:` paths.
