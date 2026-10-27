## 1. Report the boot commit

- [x] 1.1 Add `bootCommit` to the health contract's 200 and 503 shapes and `RefusalDetail`, read it once at the start of `bootBe01`, and pass it to the endpoint. Tests: `names the commit its checkout is at, not one captured at startup` (boot.db.test.ts), the contract's health shape test and refusal type test. Negatives: strike the boot wiring; make `bootCommit` follow `commit`; strike the field from the 200 schema; strike it from `RefusalDetail`.

## 2. Converge on the boot commit after a reset

- [x] 2.1 Add `convergeBootCommits` with an injected clock, fake tiers and a single restart, and `bootCommitOf` for the `/health` body. Tests: boot-convergence.test.ts. Negatives: remove the commit comparison; remove the restart.
- [x] 2.2 Call it from `sync()` after the reset, restart and recreate checks, through `docker exec … curl` and `docker restart`. Tests: the two rehearsal cases in `boot-commit convergence after reset` (sync.test.ts) over a real git origin and a fake `docker`. Negatives: remove the call; make the docker restart a no-op.

## 3. Document

- [x] 3.1 Runbook section _Which commit dev runs_, the app-source row, ADR 0005 amendment, `LLM_README.md` dev line and the _Boot commit_ glossary term.

## 4. Review fixes (2026-10-27)

- [x] 4.1 Exit 76 for a stale boot and have the poller record it as synced but unproven. Tests: `exits 76 for a reset be-01 never booted`, `rethrows any other failure for the ordinary exit` (sync.test.ts), `retries only the proof after a stale boot…` and `pins the stale-boot exit to the deployer constant` (poller.test.ts). Negatives: remove the `instanceof StaleBootError` branch; remove the poller's stale-boot branch.
- [x] 4.2 Prove on `bootCommit` in `bin/dev-poll.sh`. Tests: the served-commit fixtures, including `stale process`, `no bootCommit` and `null bootCommit`. Negative: read `"commit"` again.
- [x] 4.3 Prove the `restarted` plumbing and the unreadable-health observer through `sync()`. Tests: `gives a deploy that restarted for a RESTART_PATHS change the cold-boot window`, `names an unreadable health as the reason, with one restart`. Negatives: pass `restarted: false`; remove the `exitCode !== 0` branch.
- [x] 4.4 Restart at once when the reset changes nothing a watcher reloads; make the fake clock yield and refuse past an hour. Tests: `restarts at once when the reset reloads nothing`, `still waits the window…`, `never takes the shortcut…`, `waits the window when the reset changes watched code`, `waits the window when the boot commit is unknown to git`. Negatives: predicate answering false; `diff.exitCode !== 1`; deadline removed.
