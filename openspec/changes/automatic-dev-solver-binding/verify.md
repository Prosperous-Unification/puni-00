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

| proof                  | required failure control                      | evidence |
| ---------------------- | --------------------------------------------- | -------- |
| compatibility identity | solver byte changed / unrelated byte changed  | pending  |
| target-pinned runner   | import available only in old live checkout    | pending  |
| pre-reset ordering     | omit each prepare/verify phase                | pending  |
| exclusion              | two different targets overlap                 | pending  |
| interrupted retry      | stop after publish and during install         | pending  |
| live solver change     | poll target differs under `libs/solver-py`    | pending  |
| alarm backstop         | ten consecutive injected preparation failures | pending  |

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
