# Logical recovery verification

Implementation baseline: `bb14bb1cf3afc0559e4d0864374e11c652751751` on `feat/agentic-recovery-r2-20261028` in the existing isolated worktree. The owner approved the recommendations in R2 on 2026-10-28 for implementation, tests and review. Architectural merge and production remain held.

## Current evidence

- Source and migration inventories found format3 and migrations0001–0003 unchanged. New recovery behavior, upgrade/down, dispatcher and R5 proofs are UNRUN.
- The initial unchanged runs-subtree baseline is recorded in `/tmp/puni-r2-baseline-runs-20261028.stdout` and `.stderr`; its subprocess stdin operations encounter sandbox `EPERM`. It is not a passing baseline or recovery proof. A new owned minimal probe isolates sandbox denial of Bun1.4.4 `sendto` on subprocess socketpair stdin; the identical probe passes outside the sandbox. The unchanged test suite requires an approved execution outside that sandbox; no guard or fixture is weakened.
- The initial sandbox baseline actually exited1 (native30832). The byte-identical runs-subtree command outside the sandbox actually exited0 (native59610): **1649 passed, zero failed,5198expect calls across40 files in194.19s**. Logs are `/tmp/puni-r2-baseline-runs-20261028b.stdout` and `.stderr`. This accepts the existing-code baseline only, with no new recovery or R5 credit. The command was `bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-dash/cli/src/runs --timeout=60000` using pinned Bun1.4.4; no production/test source or fixture changed between attempts. Approved planning documents were added separately.
- Historical actual-main CI40630891442 at4172768f ended failure, not success. Its primary workspace PID-marker and browser F-016 failures remain historical; later unchanged jobs passing do not prove a fix. Diagnosis lives in `/tmp/puni-r2-main-ci-diagnosis-20261028.md`.

## Required proof record

For every new or changed check, record the production operation, injected fault, exact RED command and intended unsafe observation, restoration and GREEN command, and the adjacent `Proof:` location. Missing and unreadable artifact dependencies require distinct observations. Inherited guard failures are regressions, not new R5 credit.

| Obligation                                                      | State | Evidence required                                                        |
| --------------------------------------------------------------- | ----- | ------------------------------------------------------------------------ |
| Actual-byte exchange/value and claim projection correspondence  | UNRUN | Missing/unreadable/corrupt/ref/value/context faults through real helpers |
| Complete current and historical-prefix witnesses                | UNRUN | Valid n/n+1/n+2 cuts and independently broken new associations           |
| Begin and fresh-mutation interlocks with immutable replay       | UNRUN | Memory/SQLite and real transaction-order races                           |
| Exact bounded fence staging/observation and domination          | UNRUN | Real receiver counterexample/control, retry limits and captured ordering |
| Atomic closure and retained capacity                            | UNRUN | Late SQL aborts after acceptance/hold/barrier, complete rollback/reopen  |
| Genuine populated3 preservation and unused down                 | UNRUN | Pinned predecessor-created histories and byte/row/schema comparison      |
| Already-open, queued and BUSY legacy writers                    | UNRUN | Pinned old executable, actual post-upgrade writes and allowed exceptions |
| Lifecycle, selected tests, lint, typecheck, format and OpenSpec | UNRUN | Exact commands, actual exits and explicit skips                          |
| Exact-candidate host gate and independent reviews               | UNRUN | Current-SHA canonical gate and scoped/final review records               |

Logical recovery alone does not complete write recovery, physical continuation or full S0/S7a. Do not mark parent recovery tasks complete from these intermediate checks.
