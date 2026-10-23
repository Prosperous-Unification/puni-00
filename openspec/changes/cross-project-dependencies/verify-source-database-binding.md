# Source database binding verification

Base: `63bccebbd32a4585add730753d24d20109288500`. This bounded observer uses the reviewed SourcePins producer and existing live owner/source/solver/backend exclusion stack. It imports no installed-authority producer and establishes no activation grant.

Runtime: `/tmp/puni-pr630-bun142-al30yoqo/bun`, freshly reporting Bun `1.4.2 (744846f84)`. The isolated branch deliberately keeps its frozen base's runtime profile; reconciliation with the later main/Bun 1.4.4 profile belongs to the parent integration. `package.json` and `bun.lock` compared equal to the integration worktree before reusing its existing dependency tree. No dependency installation was performed or claimed.

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

Final focused command: **163 passed, 0 failed**, 670 assertions across four files, 175.04 seconds. The complete final run includes the corrected Node error matcher and the production Docker CLI fixture.

No full Nx test target, Caddy suite, host-wide gate, live host audit/adoption, production store, sudo, service operation, image pull or activation was run. This is local read-only binding evidence, with ordinary scratch identity files rather than SQLite connections. It does not prove installed-authority exclusion, universal dev-family namespace exclusion, storage compatibility/capture/backup, activation permission, restoration or controller handoff. A full host gate and merged-main runtime retest remain parent-coordinated work.
