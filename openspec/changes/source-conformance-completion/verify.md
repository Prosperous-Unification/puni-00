# Source conformance completion verification

## 2026-09-12 — task 1.1 execution-aware certification infrastructure

Task 1.1 adds the closed nineteen-family manifest, exact admission-specific
history cases, typed capability declarations, lifecycle-owned execution and
terminal exact-set certification. The four existing source kits remain on the
legacy runner until task 1.3 moves their bodies.

### Failure-proof table

| Check                                     | Fault injected                                                                    | Test that observed it                                         | Observed failure                                                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration set cannot lose a family     | Removed the missing-registration refusal after omitting the projects kit          | `rejects a missing family`                                    | Expected `missing registered cases: projects: projects.create:steps`; received the later `missing case reports: projects: projects.create:steps, ...` diagnostic. |
| Registration set rejects duplicates       | Removed the duplicate-registration refusal after registering the first case twice | `rejects a duplicated case`                                   | Expected `duplicate registered cases`; received `duplicate case reports: projects: projects.create:steps`.                                                        |
| Declaration does not imply execution      | Marked a registration with no body as passed                                      | `a declared body is not a passed body`                        | Expected status `incomplete`; received `passed`.                                                                                                                  |
| Incomplete execution cannot certify       | Removed the incomplete-status refusal                                             | `refuses a body that was declared but never invoked`          | Expected `incomplete cases`; certification did not throw.                                                                                                         |
| Cleanup is part of passing                | Marked the cleanup-failure branch passed                                          | `a failed close cannot certify its case`                      | Expected `failed cases ... (cleanup: injected close failure)`; certification did not throw.                                                                       |
| A focused run is not full certification   | Reported every execution as full                                                  | `focused execution reports partial`                           | Expected `partial`; received `full`.                                                                                                                              |
| Unknown gaps cannot excuse cases          | Removed declaration gap validation after the offered body executed                | `rejects an unknown gap after executing the offered baseline` | Expected `unknown gaps`; certification did not throw.                                                                                                             |
| Duplicate gaps cannot hide one exclusion  | Removed duplicate-gap validation                                                  | `rejects a duplicated gap`                                    | Expected `duplicate gaps`; certification did not throw.                                                                                                           |
| Capability and terminal status agree      | Removed capability/status correlation                                             | `rejects not-offered status for an offered case`              | Expected `capability status mismatch`; certification did not throw.                                                                                               |
| Port additions require manifest additions | Removed the expected-error guard from the composition-extension fixture           | `conformance:typecheck`                                       | TS2741: property `conformanceProbe` is missing in `CASE_MANIFEST`.                                                                                                |
| A caller cannot shrink full certification | Exposed a caller-supplied `expected` override                                     | `conformance:typecheck`                                       | TS2578: the forbidden-property `@ts-expect-error` became unused.                                                                                                  |

### Passing commands

- `bun test src` in `libs/conformance`: 12 pass, 0 fail across 5 files.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run conformance:lint`: success.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run conformance:typecheck`: success after restoring the compile guard.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run conformance:test`: 12 pass, 0 fail.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p store-memory,store-sqlite --parallel=2`: both source typechecks succeeded.
- `bun test src/source-conformance.test.ts` in `libs/store-memory`: 20 pass, 1 declared legacy gap skip, 0 fail.
- `bun test src/sqlite-source.db.test.ts` in `libs/store-sqlite`: 14 pass, 0 fail.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate source-conformance-completion --strict`: valid.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate --all --json`: 75/75 artifacts valid.

### Explicitly not run in task 1.1

- The full h2puni workspace gate, full source test targets, browser tests and
  builds are deferred to the integrated task 7.3 gate; this slice changes only
  the conformance library and exercised both current source consumers directly.
- New `store-*:test:conformance` targets do not exist yet; task 7.2 owns them.
- No later store-family bodies, broken-source helpers or source-specific fault
  controls were implemented; tasks 1.2 onward own those changes.

One command is explicitly invalid evidence: `bun test src` was accidentally
invoked from the repository root after a formatting pass. Bun collected
unrelated workspace suites and sandboxed listener tests failed on `EPERM`. The
process ended; the command was replaced by the scoped `conformance:test` target
and is not counted above.

## 2026-09-12 — task 1.1 round-one certification corrections

The execution state is now a discriminated union: unexecuted cases cannot carry
started lifecycle evidence, while a pass requires a fixture identity, start and
end timing, and completed cleanup. Certification validates those relationships
again at runtime and verifies that a passed case's registration had an
`openAndRun` body. Assertion failure detection uses a separate caught flag so a
legal `Promise.reject(undefined)` cannot collide with the absence sentinel.

### Additional failure-proof table

| Check                                                 | Fault injected                                                                                   | Test that observed it                                                     | Observed failure                                                                                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Setup rejection cannot become a pass                  | Reported the setup catch as a completed pass                                                     | `a setup rejection is failed execution and cannot certify`                | Expected `failed cases ... (setup: injected setup failure)`; certification did not throw.                      |
| Ordinary assertion failure still fails after cleanup  | Ignored the caught assertion after successful cleanup                                            | `an assertion rejection still cleans up and cannot certify`               | Expected `failed cases ... (assertion: injected assertion failure)`; certification did not throw.              |
| Undefined rejection is still an assertion failure     | Restored `assertionFailure !== undefined` as the caught sentinel                                 | `an undefined assertion rejection fails after cleanup and cannot certify` | Expected `failed cases ... (assertion: undefined)`; certification did not throw.                               |
| Cleanup does not erase an undefined assertion reason  | Restored the same sentinel while cleanup also rejected                                           | `an undefined assertion rejection is retained when cleanup also fails`    | Expected `undefined; cleanup failed: injected close failure`; received only `cleanup: injected close failure`. |
| Declaration metadata cannot be relabeled as a pass    | Removed runtime execution-evidence validation after changing only `incomplete` to `passed`       | `refuses a declaration-only case relabeled as passed`                     | Expected `invalid execution evidence`; certification did not throw.                                            |
| A pass carries lifecycle identity and timing          | Removed runtime execution-evidence validation from a passed record without fixture/timing fields | `refuses a passed case with missing lifecycle evidence`                   | Expected `invalid execution evidence`; certification did not throw.                                            |
| Passed evidence requires an invoked registration body | Removed the registration-body check while retaining an untouched passed report                   | `refuses passed evidence paired with a declaration-only registration`     | Expected `invalid execution evidence`; certification did not throw.                                            |
| Pass is assigned only after cleanup                   | Removed runtime execution-evidence validation after changing completed phase to `assertion`      | `refuses a pass recorded before successful cleanup`                       | Expected `invalid execution evidence`; certification did not throw.                                            |

### Passing correction commands

- `bun test src` in `libs/conformance`: 20 pass, 0 fail across 5 files.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run conformance:lint --skip-nx-cache`: success.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run conformance:typecheck --skip-nx-cache`: success; the existing missing-family compile fixture remains active.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p store-memory,store-sqlite --parallel=2 --skip-nx-cache`: both source typechecks succeeded.
- `bun test src/source-conformance.test.ts` in `libs/store-memory`: 20 pass, 1 declared legacy gap skip, 0 fail.
- `bun test src/sqlite-source.db.test.ts` in `libs/store-sqlite`: 14 pass, 0 fail.
- Prettier checks for every changed source/evidence file and `git diff --check`: clean.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate source-conformance-completion --strict`: valid.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate --all --json`: 75/75 artifacts valid.

The Task 1.1 scope skips recorded above remain unchanged for this correction.

## 2026-09-12 — task 1.2 named broken-source proof infrastructure

`brokenSource` retains the source factory's parameter and result types, and
`replaceMethod` uses a Proxy that binds both the replacement and every
untouched method to the real class instance. Each fault owns a per-run control;
the proof recorder verifies setup, arms the fault, requires entry into its
named phase and only then records a named assertion failure. Memory and SQLite
controls expose separate staged-write and transaction-write reach methods for
later adapter-owned late-failure seams; neither is ambient production state.

### Task 1.2 failure-proof table

| Check                                               | Fault injected                                     | Test that observed it                                   | Observed failure                                                                                       |
| --------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Fault is inert through verified setup               | Removed the shared control's pre-arm guard         | `an armed fault reaches its named assertion`            | Expected `observed`; received `setup-failed` with `baseline counter was not one`.                      |
| Recorder arms before the exercise                   | Removed `fault.control.arm()`                      | `an armed fault reaches its named assertion`            | Expected `observed`; received `phase-failed` with `fault did not reach counter-read`.                  |
| Forwarded class methods keep their receiver         | Returned the raw prototype function from the Proxy | `a class port keeps unmodified prototype methods`       | `TypeError: Cannot access invalid private field` at `this.#count`.                                     |
| Setup errors are not assertion proofs               | Classified the setup catch as observed             | `a pre-setup failure does not prove an atomicity check` | Expected `setup-failed`; received `observed` with the fixture error as `observedFailure`.              |
| Pre-phase operation errors are not assertion proofs | Classified the exercise catch as observed          | `a pre-setup failure does not prove an atomicity check` | Expected `phase-failed`; received `observed` with the operation error as `observedFailure`.            |
| An unrelated assertion cannot replace phase reach   | Removed the `control.reached()` check              | `a pre-setup failure does not prove an atomicity check` | Expected `phase-failed`; received `observed` with `an unrelated assertion failed`.                     |
| Memory late-write control is inert before arm       | Removed its pre-arm guard                          | `arms a named staged-state write point per run`         | Expected `false`; received `true`.                                                                     |
| SQLite late-write control is inert before arm       | Removed its pre-arm guard                          | `arms a named transaction write point per run`          | Expected `false`; received `true`.                                                                     |
| Factory and fault registry remain closed            | Removed all three expected-error guards            | `conformance:typecheck`                                 | TS2554 for the missing factory argument; TS2322 for the arbitrary fault ID and mismatched owning case. |

### Task 1.2 verification

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run conformance:test --skip-nx-cache`: 23 pass, 0 fail across 7 files.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run conformance:lint --skip-nx-cache`: success.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run conformance:typecheck --skip-nx-cache`: success after restoring all compile guards.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint,typecheck -p store-memory,store-sqlite --parallel=4 --skip-nx-cache`: all four targets succeeded.
- `bun test src/testing/faults.test.ts` in each source: 1 pass, 0 fail per source.
- `bun test src/source-conformance.test.ts` in memory: 20 pass, 1 declared legacy gap skip, 0 fail.
- `bun test src/sqlite-source.db.test.ts` in SQLite: 14 pass, 0 fail.
- Prettier checks for every changed source/evidence file and `git diff --check`: clean.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate source-conformance-completion --strict`: valid.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.3.0 validate --all --json`: 75/75 artifacts valid.

The complete memory/SQLite test targets, full workspace gate and build/browser
targets were not run: Task 1.2 adds test-only infrastructure and changes no
adapter operation. Later case mutations and installation into actual adapter
transaction/staged-state operations remain owned by their ordered store-family
tasks.
