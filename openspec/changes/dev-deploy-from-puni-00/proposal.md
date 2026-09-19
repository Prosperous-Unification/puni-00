## Why

Dany, 2026-09-19: WBS work moves to puni-00 and wbs-tool-v1 is retired. The dev
auto-deploy on h2puni still follows wbs-tool-v1: `/home/puni1/wbs-dev/src` has
`origin` = `wbs-tool-v1`, and `/home/puni1/wbs-dev/bin/poll.sh` (cron, every
minute) fetches its `main` and runs that tree's `bin/dev-poll-sync.sh`. A change
merged to puni-00 therefore never reaches dev. wbs-tool-v1 `main` (`73e00574`)
has no commit missing from puni-00, so nothing is lost by switching.

The poller's served-commit check is also broken: since 2026-09-18T10:09Z it logs
`/health still says '<unreadable>'`, so dev has not proven which commit it
serves for over a day. The checkout is at `73e00574`; the running processes are
unverified.

## What Changes

- Dev follows puni-00 `main`: the source checkout's `origin` and the poller
  switch to puni-00, cut over in one step at a commit both repos contain.
- The served-commit check works again, and a deploy whose served commit cannot
  be read counts as failed, not merely logged.
- Prod runbooks and `tool-deploy` defaults name puni-00 as the source.

## Non-Goals

No prod deploy automation (prod stays manual), no k3s cutover, no change to
the dev container layout. Archiving the GitHub repo wbs-tool-v1 is Dany's call
after the cutover is proven.

## Constraints

Dev must keep serving through the switch. The poller loads its loader from the
fetched tree, so puni-00's `bin/dev-poll-sync.sh` must handle everything
puni-00 carries beyond wbs-tool-v1 (`apps/wiki`, Twilight tooling). R5: an
unreadable served commit is a failure.

## Capabilities

### New Capabilities

- `dev-deploy`: which repository dev follows and how a dev deploy proves itself.

## Domain Terms

None.

## Decisions Recorded

Assumption A1: puni-00 `main` becomes the only dev source; falsified if Dany
wants wbs-tool-v1 kept as a mirror.

## Impact

`bin/dev-poll-sync.sh`, the host poller `poll.sh` (outside the repo; its new
text is committed under `ops/` first), `LLM_README.md` deploy section, the
claire queue's WBS task `repo:` paths.
