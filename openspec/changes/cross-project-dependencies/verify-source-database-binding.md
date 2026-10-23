# Source database binding verification

Base: `63bccebbd32a4585add730753d24d20109288500`. This bounded observer uses the reviewed SourcePins producer and existing live owner/source/solver/backend exclusion stack. It imports no installed-authority producer and establishes no activation grant.

Runtime: `/tmp/puni-pr630-bun142-al30yoqo/bun`, freshly reporting Bun `1.4.2 (744846f84)`. The isolated branch deliberately keeps its frozen base's runtime profile; reconciliation with the later main/Bun 1.4.4 profile belongs to the parent integration. `package.json` and `bun.lock` compared equal to the integration worktree before reusing its existing dependency tree. No dependency installation was performed or claimed.

## Review correction: one shared absolute deadline

The first source-binding profile requires **one identical absolute deadline** for the original source exclusion scope, original solver exclusion scope and binding helper. The new synchronous `assertSourceDevExclusionDeadline` reads only the original SourceScope WeakMap entry, exact owner identity and finite future original deadline; it refuses a copied/foreign/expired token or any shorter/longer supplied budget. Both source and solver guards run before any nested query and after all awaited work immediately before return. Existing optional-tightening source observers and their abort/join semantics are unchanged; bounded read views do not replace the original map authority.

Astra's P2 exposed a real gap in the initial implementation: legacy backend inspection calls `identifySourceAuditInventory -> inspectExcludedSourceMember` without a tightening deadline, so a source scope created with a later original deadline could extend nested reads. The original fixture's identical source/solver deadlines hid that path. The fixture now independently offsets its original source deadline.

Fresh red reproduction on the original implementation: source original deadline = helper/solver deadline + 4000 ms; a stall in the actual nested backend/source `ps` path returned **4002.66 ms late**. Both independently shorter (-1000 ms) and longer (+4000 ms) original source budgets also incorrectly admitted bindings. After correction all three regressions refuse before the first helper query; the stalled nested path is never entered. Replaying the exact reviewer script `/tmp/review-source-db-long-scope.ts` printed `{"injected":false,"returnedAfterDeadlineMs":-5264}` and exited 0.

Additional production guard tests exercise exact success, shorter/longer/nonfinite/past values, copied source token, copied owner, a separate actual live foreign owner, source token expiry after callback and actual elapsed original time while the token remains live.

Watched correction mutations, all restored before final verification:

| Mutation                                                                        | Focused test                               | Observed red oracle                                                |
| ------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| Replace source guard `deadline !== scope.deadline` with `false`                 | `original live owner and exact original`   | 0 pass, 1 fail: a shorter original budget did not throw            |
| Replace `scope?.owner !== owner` with `scope === undefined` in the source guard | `original live owner and exact original`   | 0 pass, 1 fail: copied owner did not throw                         |
| Delete source guard `deadline <= performance.now()` term                        | `elapsed original scope time`              | 0 pass, 1 fail: elapsed original budget left `state.refused` false |
| Delete helper's entry `assertSourceDevExclusionDeadline` call                   | `differing original source deadline -1000` | 0 pass, 1 fail: 592 commands instead of 290 before final refusal   |

The first three commands select `source-dev-exclusion.test.ts`; the fourth selects `source-database-binding.test.ts`, all with the pinned Bun binary, scratch preload and `--timeout=10000`. The pre-fix three-case reproduction used `--timeout=20000` to observe the actual 11-second longer-scope path. Source guard and entry call carry adjacent `Proof:` comments.

## Behavior exercised

The dedicated fixture enters real `withDependencyOwner`, kernel locks, `withSolverDrainUnderOwner`, `withSourceDevExcluded`, gateway fencing and backend fencing. The backend starts terminal, with a real scratch ordinary file named `production.sqlite`; the source resolves its independently pinned literal dotenv to `development.sqlite`. The helper invokes the actual source producer, four separate capability observations (including both backend purposes), actual solver-aware backend completion inspector and actual resolver. Docker/systemd responses are fixture transports; no serialized completion object or supplied source-input observation grants access. The production helper always selects `verifyContainerNamespace`.

The positive cases cover absent inherited storage keys and exact inherited agreement, literal `export`, CRLF, source mount permutations and frozen database projections. Config negatives cover missing, duplicate, quoted, expanded, empty, relative, wrong-root, commented and noncanonical DB paths; inherited empty/conflicting/quoted paths and migration controls refuse. Native pinned Bun runs a DB-free fixture at the actual `apps/wbs/be-01` cwd and reports only DB_PATH/MIGRATE_ON_STARTUP, establishing tier-dotenv fallback and inherited precedence.

Filesystem negatives exercise actual missing/unreadable main/config files, invalid private UTF8, unexpected local dotenv, nonregular/dangling/unreadable sidecars, main and sidecar hardlinks across families, canonical production root confinement and nested database directories. Late faults are injected after the final source tree readback, with an assertion that the injection point was reached: same-byte dotenv replacement, ancestor replacement preserving a dotenv hardlink, prod/dev main replacement and a new dev WAL. These isolate the additional binding checks from the inherited SourcePins tree checks.

Lifetime checks cover copied owner/source/solver identities, exact shared solver budget before any nested query, shorter/longer/nonfinite/elapsed budgets and original solver deadline expiry. Existing solver/source regression suites cover original WeakMap expiry and foreign identities. A fresh pinned Bun subprocess receives a disposable `docker` executable in its startup PATH; the production `runDockerCli` spawns that executable, aborts it at the shared deadline and awaits stdout/stderr/exit settlement before refusal. Runtime-only PATH mutation was unsuitable because this Bun resolves executable search paths at startup; its diagnostic reached the local socket and was permission-denied, with no daemon operation succeeding. The final fixture requires no daemon.

## Watched R5 mutations

All mutations were temporary and restored before verification. The commands used the pinned binary, repository scratch preload and `--timeout=10000`.

```sh
bun test tools/tool-remote-scripts/src/lib/source-database-binding.test.ts \
  --preload ./tools/test/scratch/preload.ts --timeout=10000 \
  --test-name-pattern '<pattern below>'
```

| Production mutation                                            | Pattern                                           | Observed red oracle                                                      |
| -------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| Replace `assertDistinct` body with an empty body               | `fault main-hardlink\|fault sidecar-hardlink`     | 0 pass, 2 fail; missing expected rejection                               |
| Delete retained-path identity loop from configuration `read()` | `refuses late same-byte\|refuses late ancestor`   | 0 pass, 2 fail; missing expected rejection                               |
| Delete inherited DB_PATH/MIGRATE_ON_STARTUP agreement branch   | `inherited storage disagreement`                  | 0 pass, 5 fail; missing expected rejection                               |
| Delete `!host.startsWith(root + '/data/')` term                | `outside canonical`                               | 0 pass, 1 fail; missing expected rejection                               |
| Delete final `lastDev`/`lastProd` family recheck block         | `late dev-main\|late dev-sidecar\|late prod-main` | 0 pass, 3 fail; missing expected rejection                               |
| Delete helper's entry `assertSolverExclusionDeadline` call     | `exact shared solver deadline`                    | 0 pass, 1 fail; command count 592 instead of 290 before mismatch refusal |

The actual textual mutations were made by bounded Python string replacements against saved copies, including:

```python
# Cross-family check.
a = source.index('function assertDistinct(')
b = source.index('/**', a)
source = source[:a] + 'function assertDistinct(prod: Family,dev: Family): void {}\n' + source[b:]
# Retained ancestor/file check.
a = source.index('      for (const entry of retained) {')
b = source.index('      return Buffer.concat(bytes);', a)
source = source[:a] + source[b:]
# Entry operation budget.
source = source.replace('    assertSolverExclusionDeadline(owner, solver, deadline);', '', 1)
```

The solver guard itself was separately mutated and observed:

```sh
bun test tools/tool-remote-scripts/src/lib/solver-exclusion.test.ts \
  --preload ./tools/test/scratch/preload.ts --timeout=10000 \
  --test-name-pattern 'solver deadline guard'
```

Replacing `deadline !== scope.deadline` with `false` caused the shorter-budget assertion to fail (0 pass, 1 fail). Deleting `deadline <= performance.now()` and selecting `original budget after actual time` caused `expiredRefused` to remain false (0 pass, 1 fail). Restored guards pass both tests. Adjacent production `Proof:` comments identify these observed faults.

Literal-path validation, private mode/hash/UTF8/profile checks and native inventory membership also rely on the mandatory inherited SourcePins/resolver checks. Their production-path negatives are regression coverage; no independent omission proof is claimed where a second required guard still rejects the same malformed input. In particular quoted/relative/expanded paths remain rejected by the actual resolver if only the literal profile branch is omitted.

## Commands and limits

The focused configured command is:

```sh
bun test tools/tool-remote-scripts/src/lib/source-database-binding.test.ts \
  tools/tool-remote-scripts/src/lib/source-dev-exclusion.test.ts \
  tools/tool-remote-scripts/src/lib/solver-exclusion.test.ts \
  tools/tool-remote-scripts/src/lib/source-dev-inputs.test.ts \
  tools/tool-remote-scripts/src/lib/backend-config.test.ts \
  --preload ./tools/test/scratch/preload.ts --timeout=10000
```

Project lint, typecheck and build use `NX_DAEMON=false NX_ISOLATE_PLUGINS=false` with the pinned binary directory first on PATH. Real Nx output was inspected, including `Successfully ran target` and uncached task execution. The first lint run failed on concrete test/fixture style diagnostics, which were corrected. The initial combined test run exposed twelve Node `assert.rejects` string-format mismatches (`Error:` prefix), which were corrected before the final run.

- `nx run tool-remote-scripts:lint`: passed.
- `nx run tool-remote-scripts:typecheck`: passed.
- `nx run tool-remote-scripts:build --skip-nx-cache`: passed, including its three dependency tasks.
- `bun build .../source-database-binding.ts --target=bun`: passed, 44 modules; bundled import exports the callable observer and leaves an initially empty scratch cwd empty.
- `openspec validate --all --json`: passed; 277 items, 277 passed, 0 failed.

Initial slice focused command: **163 passed, 0 failed**, 670 assertions across four files, 175.04 seconds. That run includes the corrected Node error matcher and the production Docker CLI fixture. The correction also runs the full `source-dev-exclusion.test.ts` regression suite: **224 passed, 0 failed**, 895 assertions across five files, 180.63 seconds. This includes the original source observers' tightening, original-scope lifetime and abort/join/cleanup settlement negatives.

No full Nx test target, Caddy suite, host-wide gate, live host audit/adoption, production store, sudo, service operation, image pull or activation was run. This is local read-only binding evidence, with ordinary scratch identity files rather than SQLite connections. It does not prove installed-authority exclusion, universal dev-family namespace exclusion, storage compatibility/capture/backup, activation permission, restoration or controller handoff. A full host gate and merged-main runtime retest remain parent-coordinated work.
