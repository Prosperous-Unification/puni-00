# Verification Report

**Change**: `dev-boot-commit-convergence`
**Verified at**: `2026-10-27`
**Verifier**: the implementing agent, on a laptop worktree from `origin/main` `3cd6e2751`

## Structural validation

- `OPENSPEC_TELEMETRY=0 bunx openspec validate --all --json` — exit 0; `items: 300`, `passed: 300`,
  `failed: 0`; `dev-boot-commit-convergence` valid with no issues.

## Task completion

Every slice in `tasks.md` is checked.

## Delta spec sync

- `specs/dev-deploy` — ✗ needs sync at archive (two ADDED requirements onto `openspec/specs/dev-deploy`).

## Failure-proof table

Each fault was injected into the production file, the named test was run and observed failing,
and the file was restored byte for byte.

| Check                                                     | Injected fault                                        | Observed                                                                                                                                                   |
| --------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| be-01 reports the boot commit                             | `bootCommit,` struck from `boot.ts`'s `buildApp` call | `names the commit its checkout is at, not one captured at startup` failed: expected `c…3`, received `null`                                                 |
| `bootCommit` does not follow HEAD                         | endpoint answered `const bootCommit = commit`         | same test failed on the second read: expected `c…3`, received `d…4`                                                                                        |
| Health 200 contract requires `bootCommit`                 | field struck from the 200 schema                      | `health distinguishes ready, migration and dependency states while retaining both commit fields` failed: `issues` received undefined                       |
| `RefusalDetail` carries `bootCommit`                      | field struck from `dependency_unavailable`            | `wbs-contracts:typecheck` failed with TS2353 in `refusal.test.ts`                                                                                          |
| Convergence compares the boot commit with HEAD            | `&& observed.commit === head` removed                 | four `convergeBootCommits` cases failed; sync.test.ts `refuses a deploy whose be-01 still runs the previous commit` received `(resolved without throwing)` |
| A stale tier is restarted                                 | `await dependencies.restart()` removed                | `restarts a tier the watcher never reloaded, then accepts its new boot` and two siblings failed; both sync.test.ts rehearsals failed on their docker calls |
| The production restart reaches Docker                     | `docker restart` replaced by a no-op                  | both sync.test.ts rehearsals failed on the observed docker calls (no `restart`)                                                                            |
| `sync()` converges before reporting success               | the `convergeBootCommits` call removed from `sync()`  | `refuses a deploy whose be-01 still runs the previous commit` received `(resolved without throwing)`                                                       |
| A deploy that already restarted gets the cold-boot window | first window always `budget.watchMs`                  | `gives a deploy that already restarted the cold-boot window` failed on a restart at 10000                                                                  |

### Review fixes (2026-10-27, after the Fable review of PR #762)

| Check                                                   | Injected fault                                                      | Observed                                                                                                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1: a stale boot is synced but unproven                 | poller's `sync_rc -eq "$STALE_BOOT_EXIT"` branch disabled           | `retries only the proof after a stale boot, never the reset or the restart` failed: observations gained `reset`, `sync`, `restart` on each of ticks two and three                                               |
| S1: the deployer exits 76 for a stale boot              | `instanceof StaleBootError` branch in `lockedSyncExitCode` disabled | `exits 76 for a reset be-01 never booted` failed (the StaleBootError was rethrown)                                                                                                                              |
| S4: the poller proves `bootCommit`                      | `read_served_commit` reads `"commit"` again (grep and sed)          | served-commit fixtures `stale process`, `no bootCommit`, `null bootCommit`, `short SHA` and the stale-boot tick test failed (5 fail)                                                                            |
| S2: `restarted` reaches convergence from `needsRestart` | `restarted: false` passed from `sync()`                             | `gives a deploy that restarted for a RESTART_PATHS change the cold-boot window` (bun.lock rehearsal): expected 1 restart, received 2                                                                            |
| S3: an unreadable `/health` is named                    | `read.exitCode !== 0` branch disabled                               | `names an unreadable health as the reason, with one restart` received `be-01: health body is not JSON`                                                                                                          |
| N1: windows are bounded                                 | `\|\| dependencies.now() >= deadline` removed                       | `restarts a tier whose boot commit never moves, then reports it` failed fast on `fake clock ran past 3600000ms` instead of hanging                                                                              |
| Fast path: restart at once when nothing reloads         | predicate answers false                                             | `restarts at once when the reset reloads nothing` failed on its event order; sync.test.ts `refuses a deploy whose be-01 still runs the previous commit` hit the 5000 ms test timeout waiting out its 5 s window |
| Fast path: unknown boot commit keeps the window         | `diff.exitCode !== 1` (true on a git error)                         | `waits the window when the boot commit is unknown to git`: expected restart index > 1, received 1                                                                                                               |

The fast path is safe because it can only shorten the wait: it is skipped after the deploy's own
restart, for any unreported tier, and whenever git cannot answer.

Not proved: the S1 mapping in `bin/dev-deploy.sh`. A manual deploy that exits 76 leaves
`last-synced` unwritten, so the next poller tick does one bounded reset-back and re-sync, which
then exits 76 and is recorded. The manual script is unchanged.

## Commands

- `bunx nx run-many -t typecheck -p wbs-be-01 wbs-contracts tool-devsync --skip-nx-cache` — exit 0.
- `bunx nx run-many -t typecheck -p wbs-fe-01 wbs-mcp-01 wbs-gw-01 wbs-contracts` — exit 0.
- `bunx nx run-many -t typecheck -p wbs-core wbs-store-sqlite wbs-store-memory wbs-domain wbs-auth wbs-realtime wbs-runtime-portable wbs-conformance tool-observability-stack` — exit 0.
- `bunx nx run-many -t lint -p wbs-be-01 wbs-contracts tool-devsync` — exit 0 after sorting one
  import; tool-devsync keeps two pre-existing unused-directive warnings in `service-kinds*.ts`.
- `env -u CLAUDECODE bunx nx run-many -t test -p wbs-contracts wbs-be-01 --skip-nx-cache` — exit 0;
  contracts `605 pass, 0 fail`; be-01 `3703 pass, 3 skip, 0 fail` across 253 files.
- `env -u CLAUDECODE bunx nx run tool-devsync:test --skip-nx-cache` — exit 1; `954 pass, 4 fail`
  across 50 files. One failure was `the production index checker resolves current Markdown links
and anchors`, refusing this file while it was still untracked; staged, it passes. The other three
  were `performance-level.test.ts` cases refused with `Performance shifted port 9100 is occupied`
  while another worktree on the same laptop ran the same suite on the same shifted ports. A rerun of
  that file during the other lane's run failed 17 of 82 cases on the same refusal; this change touches
  no performance-level code. CI is the clean run.
- `env -u CLAUDECODE bun test src/boot-convergence.test.ts src/sync.test.ts` (tool-devsync) — `16 pass`
  and `57 pass`, `0 fail`.
- After the review fixes: `env -u CLAUDECODE bun test src/boot-convergence.test.ts src/sync.test.ts
src/poller.test.ts` — `113 pass, 0 fail` across 3 files; `bunx nx run-many -t typecheck lint -p
tool-devsync --skip-nx-cache` — exit 0 (the same two pre-existing warnings).
- After the review fixes: `env -u CLAUDECODE bunx nx run tool-devsync:test --skip-nx-cache` — exit 0;
  `972 pass, 0 fail` across 50 files (713 s), performance-level included.
- Host gate: the coordinator reported `bin/h2puni-gate.sh 000f2d1a7` passing on h2puni; this
  agent did not observe it, and the review-fix commit has not been gated on the host.
- `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD` — exit 0.
- `bunx prettier --check` on every changed file — exit 0.

## Not run

- The full gate (`bin/h2puni-gate.sh`, `nx format:check --all`, workspace-wide `run-many -t test lint
typecheck build`): the brief limits this run to the touched projects and forbids touching h2puni;
  CI runs the full gate on the PR.
- No live dev observation: the convergence has not run against `wbs-dev-src`. The first deploy of
  this commit reloads be-01 (its source changed), so it is the first live proof.
