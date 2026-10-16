# Verification

## Scope and identity

Isolated checkout: `/tmp/burokrat-f1-cell-store-sol`, branch
`chore/burokrat-f1-cell-store`, based on
`5c228a6a70b43faf225a0a49e5a511266f5dc058`. An authenticated
`git ls-remote origin refs/heads/main` returned that exact SHA before implementation.

The original `cell-card-store.test.ts` and store transitions are unchanged. React
delivery now lives in `use-card-open-on.ts`; six callers import it there.

## Checks observed

Commands below ran from the checkout root unless marked frontend cwd.

| Command                                                                                                                                                                                     | Observed output                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `BUN_TMPDIR=/tmp/f1-bun-temp BUN_INSTALL_CACHE_DIR=/tmp/f1-bun-cache bun install --frozen-lockfile`                                                                                         | Checked 1573 installs across 1447 packages; exit 0.           |
| `TZ=UTC bunx vitest run src/components/wbs/cell-card-store.test.ts src/components/wbs/use-card-open-on.test.tsx src/test-tiers.test.ts --no-file-parallelism --maxWorkers=1` (frontend cwd) | 3 files passed, 25 tests passed; exit 0.                      |
| `TZ=UTC bunx vitest run --config vitest.node.config.ts src/components/wbs/cell-card-store.test.ts --no-file-parallelism --maxWorkers=1` (frontend cwd)                                      | 1 file passed, 16 tests passed; exit 0.                       |
| `TZ=UTC bunx vitest run src/components/wbs/plan-table.test.tsx -t 'card\|hover\|focus' --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000` (frontend cwd)         | 1 file passed; 5 passed, 43 filtered skips; exit 0.           |
| `NX_DAEMON=false bunx nx run wbs-fe-01:typecheck --skip-nx-cache`                                                                                                                           | Successfully ran typecheck and its module dependency; exit 0. |
| `NX_DAEMON=false bunx nx run wbs-fe-01:lint --skip-nx-cache`                                                                                                                                | Successfully ran lint; exit 0, 4m 36s.                        |
| `bun test --timeout 30000 apps/twilight-structure/twilight-burokrat/cli/src/architecture/f1.architecture.test.ts`                                                                           | 1 pass, 0 fail, 5 assertions; exit 0.                         |
| `bunx prettier --check` over every changed source file and this change directory                                                                                                            | All matched files use Prettier code style; exit 0.            |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                                                    | 205 items passed, 0 failed; exit 0.                           |

Existing runner warnings: Vite reports the config's `__dirname` usage and the Node
manifest's JSON import attributes; Nx cannot create its plugin socket in this sandbox
and runs plugins in its main process. The default five-second Bun architecture test
timeout expired at 5083ms; the explicit 30-second run passed in 7.24 seconds.

## Installed production F1 proof

The installed executable was
`/tmp/burokrat-entrypoint-exact-consumer/node_modules/.bin/twib`, with package source
revision `ac774f0c358db369c2048e537151e263cc29361e`. Both completed invocations used the
unchanged `/tmp/binary-assets-successor-policy.json`, SHA-256
`052a3aa30b1ae091968cf01318c7ad89a32e4e3dc144479e73d0c6da0ae965de`.
No policy, selector or rule implementation changed.

```sh
/tmp/burokrat-entrypoint-exact-consumer/node_modules/.bin/twib check staged /tmp/burokrat-f1-cell-store-sol 5c228a6a70b43faf225a0a49e5a511266f5dc058 /tmp/binary-assets-successor-policy.json --rule F1
/tmp/burokrat-entrypoint-exact-consumer/node_modules/.bin/twib check working /tmp/burokrat-f1-cell-store-sol 5c228a6a70b43faf225a0a49e5a511266f5dc058 /tmp/binary-assets-successor-policy.json --rule F1
```

The staged pure-store [verdict](evidence/f1-green.json) has `allowed:true`,
`findings:[]` and `unevaluated:[]`. The working-tree
[verdict with the React import restored](evidence/f1-react-fault.json) has exactly one
F1 finding at the actual production store path, naming `external:react`.

The existing policy observes F1 as debt, so both CLI commands exit 0 and report
`allowed:true`. A zero-findings assertion over the complete verdict is the failure
oracle; its Bun invocation passed on the pure store and exited 1 on the injected import:

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const verdict = JSON.parse(readFileSync(process.argv[2], 'utf8'));
assert.deepEqual(verdict.unevaluated, []);
assert.deepEqual(verdict.findings, []);
```

The assertion failed on the fault verdict with `AssertionError: Expected values to be
strictly deep-equal`, displaying the store's F1 debt finding. The injected import was
then removed; `git diff --exit-code -- apps/wbs/fe-01/src/components/wbs/cell-card-store.ts`
confirmed the restored source exactly matched the staged pure source. Completed graph
runs were serial. Only evidence and task-status artifacts changed afterward.

Initial simultaneous graph attempts produced no verdict: the committed baseline's
wrapper reported `validator exited null`, and the staged/working attempts were stopped
by identity-checked SIGTERM at the parent agent's request for shared-host memory.
Those interrupted attempts supply no acceptance evidence; the serial reruns above do.
The selected F1 evaluation has `certifies:false`; it does not certify the whole repo.

## Failure proofs

No safety guard changed. The existing F1 validator and new delivery regressions were
observed failing on the following faults.

| Injected fault                                   | Observing test/check                                    | Observed output                                                                            |
| ------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Hook module absent before extraction             | `use-card-open-on.test.tsx`                             | Failed import resolution for the missing delivery module before production edits.          |
| Client snapshot replaced with constant false     | Both selected-cell delivery tests                       | 2 failed, 1 passed; expected true, received false. Restored.                               |
| Server snapshot replaced with constant true      | Server-rendering delivery test                          | 1 failed, 2 passed; expected `<span>false</span>`, received `<span>true</span>`. Restored. |
| React import restored to actual production store | Installed production graph plus zero-findings assertion | Exactly one F1 debt finding, no unevaluated rules; assertion exited 1. Restored.           |

## Task completion and spec sync

All three task slices are checked complete. The implementation matches the two delta
requirements and their five scenarios: production F1 purity, selected-cell isolation,
cell/store replacement, server snapshot and unchanged timing. No technical design
artifact was needed for the direct hook extraction. No new domain terms were introduced.
Delta spec sync is pending; this packet remains an active OpenSpec change for review.

## Deferred gate and limitations

The parent explicitly reserved the host gate for the reviewed immutable head. No push,
PR or deployment was performed. `bunx nx format:check --all`, the full
test/lint/typecheck/build gate, browser tests, build and `bin/h2puni-gate.sh <sha>` have
not run in this worker packet. Focused format verification passed as recorded above.
The F1 graph evidence is for staged/working candidates; a committed full survey is
reserved for integration. No claim of full WBS debt elimination or release acceptance
is made here.
