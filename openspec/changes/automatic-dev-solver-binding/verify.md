# Verify — Automatic dev solver binding

No implementation evidence yet. All builds and automated tests run on h2puni or
in CI, never on the queue worker host.

## Structural validation

At `3c98fec8`, on h2puni in detached worktree
`/dev/shm/t326-spec-3c98fec8`:

```text
bunx @fission-ai/openspec@1.3.0 validate --all --json
40 items, 40 passed, 0 failed; automatic-dev-solver-binding valid
```

The first attempt used the repository's unqualified `openspec` command and
failed with exit 127 because h2puni has no global binary. No validation was
claimed from it; the pinned package command above is the accepted gate.

The terminal proof must include:

| proof                  | required failure control                      | evidence                                               |
| ---------------------- | --------------------------------------------- | ------------------------------------------------------ |
| compatibility identity | solver byte changed / unrelated byte changed  | `99810aa`: mutant failed only unrelated-source control |
| target-pinned runner   | import available only in old live checkout    | `99810aa`: 8/8 focused cases green                     |
| pre-reset ordering     | omit each prepare/verify phase                | `d9eeb611`: 75/75; preflight omission failed 2 cases   |
| exclusion              | two different targets overlap                 | `cc6c050d`: overlap refused before second publish      |
| interrupted retry      | stop after publish and during install         | `3017d066`: digest reused; premature completion red    |
| live solver change     | poll target differs under `libs/solver-py`    | pending                                                |
| alarm backstop         | ten consecutive injected preparation failures | pending                                                |

## Identity and target runner

At `99810aa385f240f1f3cb313eec2b83ec6a7aaa9c`, the clean detached h2puni
worktree `/dev/shm/t326-r3-red-76e9ca4f` resolved 78 declared dependencies with
`BAD_COUNT=0`. The target-pinned state suite passed 8/8 cases (16 assertions),
the whole `tool-devsync` project passed 72/72 cases (197 assertions), and its
TypeScript build, ESLint, and Prettier checks passed. The lint output warned
that its standalone invocation had no cached Nx project graph; the full Nx
project test subsequently built that graph and passed.

The initial test-only tree failed because `solver-preparation` did not exist.
After implementation, a control replaced the compatibility path contribution
with the full commit SHA: the unrelated-source case failed at `toBe` while the
other seven cases stayed green. Restoring the production source returned 8/8.
The state and runner cases separately require the host command ledger to stay
empty for old-live-tree code, absent or partial state, a non-digest image, a
different source SHA, and a different compatibility identity.

## Pre-reset preparation ordering

At `d9eeb611f8d291a99a8ed34b1de1ae457cbb6248`, the same clean detached h2puni
worktree passed all 75 `tool-devsync` cases (213 assertions), TypeScript,
ESLint, and Prettier, with all 78 declared dependencies still valid. The
focused preparation suite passed 11/11 cases (32 assertions).

The test-only tree initially failed because
`prepareSolverBindingBeforeReset` was not exported. After implementation, a
control removed the awaited preflight call: the happy-path phase-order case
and the injected preflight-failure case both failed, while the other nine
cases stayed green. Restoring the exact source returned 11/11. The same table
test injects failures at publish, materialize, install, and preflight and
requires the reset ledger to remain empty for every phase.

## Binding exclusion

At `cc6c050d4e2427e047f61f98b5b233597487f5ce`, the exact-head h2puni
`tool-devsync` gate passed 76/76 cases (217 assertions), ESLint, TypeScript,
and Prettier. The focused preparation suite passed 12/12 cases (36
assertions). Its overlap case blocks the first target in publish, submits a
different target, and requires the second target to reach none of publish,
materialize, install, preflight, or reset while the first lease remains held
through reset.

A control replaced the nonblocking acquisition with an unconditional lease.
The overlap case failed because the different target completed instead of
being refused; the other 11 focused cases stayed green. Restoring the exact
source returned 12/12.

## Interrupted binding retry

At `3017d06600b64700982c51c3fa92ed022cfebf74`, the exact-head h2puni
`tool-devsync` gate passed 78/78 cases (226 assertions), ESLint, TypeScript,
and Prettier. The focused preparation suite passed 14/14 cases (45
assertions). It records `published` immediately after the immutable digest is
known, retries an interrupted install from that target-matching checkpoint
without publishing again, and records `complete` only after materialization,
install, and preflight succeed.

A control wrote `complete` before the interrupted install. The retry case
failed on the unexpected complete checkpoint while the other 13 focused cases
stayed green. Restoring the exact source returned 14/14. A mismatched source
checkpoint separately reaches none of publish, checkpoint, materialize,
install, preflight, or reset.
