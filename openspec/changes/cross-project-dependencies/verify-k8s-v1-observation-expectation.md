# Kubernetes V1 capability observation expectation

Base: `054e81ba6d0fc92b0c807065a47e6f5094e7dbf0`. Isolated worktree:
`/tmp/puni-k8s-v1-expectation`, branch `fix/k8s-v1-expectation`.

The actual capability-command acceptance test retained an empty-support
expectation after the immutable backend descriptor began advertising V1.
The exact Kubernetes Job command correctly returned the frozen backend V1
descriptor. This packet changes that single test expectation to exact equality
with the closed protocol, version, backend role and V1 semantics. The explicit
fake old-binary response remains empty. No production code or guard changed.

The test still executes the emitted command with inherited `DB_PATH` naming
an absent SQLite file and requires the scratch directory to remain empty.
Existing strict CLI argument and descriptor validation remain unchanged.
This correction does not establish store activation or participant exclusion.

## Verification

- Before correction, the focused test failed with actual V1 versus expected
  empty semantics: 0 passed, 1 failed. After correction, the same command,
  `bun test --preload ./tools/test/scratch/preload.ts tools/tool-deploy/src/k8s/dependency-observation.test.ts --test-name-pattern 'exact capability command ignores inherited'`,
  passed: 1 test, 0 failures, 2 assertions.
- The first sandboxed configured full target exited 1: 1339 passed, 24 failed,
  1 error, 1363 tests across 42 files, 183.74 seconds. Disposable registry and
  Git-server fixtures hit `listen EPERM`; the corrected capability test passed.
- Final configured `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run tool-deploy:test --skip-nx-cache --outputStyle=static`
  with authorized disposable localhost access: 1368 passed, 0 failed, 42 files,
  4599 assertions, 185.60 seconds; Nx exited 0 with cache bypassed. The original
  timeout and every assertion remained unchanged.
- Independent review found no issues; its focused rerun passed 1 test with
  0 failures and 2 assertions in 84ms.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint,typecheck -p tool-deploy --skip-nx-cache --outputStyle=static`:
  both targets passed, cache bypassed, 8.0 seconds.

Scoped Prettier and `git diff --check` passed.

No new or changed production safety check requires a new injected fault.
The existing DB-free negative remains a real subprocess with inherited storage
configuration and an unchanged no-created-files assertion.

Dependencies reuse the workspace installation through an ignored `node_modules`
symlink; no frozen install was performed. No host gate, push, live database
operation or deployment is claimed. Integrated exact-SHA acceptance remains
with the parent delivery.
