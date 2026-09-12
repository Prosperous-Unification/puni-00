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

## 2026-09-12 — task 1.2 Astra correction

The earlier deferral above was not authorized. Fault definitions now create a
fresh control for every proof, a fault run can open one source only, and both
sequential and overlapping proofs have isolated lifecycle state. Every reach
method matches the exact configured phase. Adapter-owned seams are installed
inside all three real late-write paths: subtree final satellite, journal history
insert and saved-plan schedule body. Memory reaches these while its cloned state
is still staged; SQLite reaches them before its transaction commits.

### Additional failure-proof table

| Check                                          | Fault injected                                                                                            | Test that observed it                                               | Observed failure                                                                                       |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Shared reach matches its configured phase      | Ignored the reached phase                                                                                 | `a different phase cannot satisfy the named fault`                  | Expected `phase-failed`; received `observed` from the unrelated write assertion.                       |
| Memory reach matches its configured phase      | Ignored the reached phase                                                                                 | `reports a different staged-state phase through the proof recorder` | Expected `phase-failed`; received `observed` from the unrelated saved-plan assertion.                  |
| SQLite reach matches its configured phase      | Ignored the reached phase                                                                                 | `reports a different transaction phase through the proof recorder`  | Expected `phase-failed`; received `observed` from the unrelated journal assertion.                     |
| A prior proof cannot supply reach evidence     | Reused the definition's control                                                                           | `a prior proof cannot satisfy a later proof`                        | Expected `phase-failed`; received `observed` from `unrelated second failure`.                          |
| A reused control is rejected before setup      | Returned the same one-shot control from the definition twice                                              | `a reused control is refused before another setup`                  | The second setup ran, then the recorder escaped on `fault control for counter-read was already armed`. |
| Concurrent proofs keep setup inert             | Shared one control across overlapping proofs                                                              | `concurrent proofs own independent controls`                        | Held setup expected `false`; received `true` after the other proof armed.                              |
| One run cannot decorate two opened sources     | Removed the one-open guard                                                                                | `one fault run cannot open a second source`                         | The second source opened instead of throwing `opened more than one source`.                            |
| Controls are one-shot                          | Removed each shared/memory/SQLite repeated-arm guard                                                      | The three control lifecycle tests                                   | Expected `already armed`; the second arm returned `undefined`.                                         |
| Every adapter phase is wired to its real write | Removed each of the six source seam calls                                                                 | The six `reaches ... inside the real ...` cases                     | Each promise resolved where the test required its named injected rejection.                            |
| Memory rejection keeps staged state private    | Published the staged state from the rejection path; published saved-plan state before its barrier         | The three memory source-path cases                                  | Each public list gained `faulted` beside `sentinel`.                                                   |
| SQLite rejection rolls back the transaction    | Moved each barrier after commit; for saved plans, propagated the original error without a second rollback | The three SQLite source-path cases                                  | Each public list gained `faulted` beside `sentinel`.                                                   |

### Passing correction commands

- Focused four-file fault suite: 21 pass, 0 fail, 55 assertions.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run conformance:test --skip-nx-cache`: 29 pass, 0 fail.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run store-memory:test --skip-nx-cache`: 35 pass, 1 declared legacy gap skip, 0 fail.
- `bun test --coverage --coverage-reporter=lcov` in `libs/store-sqlite`: 659 pass, 0 fail, 2,029 assertions across 60 files.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint,typecheck -p conformance,store-memory,store-sqlite --skip-nx-cache`: all six targets succeeded.

The full workspace gate and build/browser targets remain skipped: Task 1.2 has
no UI, browser or deploy surface. Both complete changed-adapter test targets
were run after installing the real seams.

## 2026-09-12 — task 1.2 Astra re-review proof correction

The memory journal source now exposes an internal, conformance-only reader for
the journal fixture's own event array. The proof reads that backing seam rather
than the independently bound public `planEvents` fixture, so it certifies only
the named journal-history mutation and staged rollback. Public journal/history
integration remains explicitly uncertified until Task 5.1.

Memory and SQLite subtree proof copies now contain one estimate satellite on a
real starting step. Each proof establishes its public-reader baseline, records
the completed satellite key at the actual adapter seam, verifies exact root and
estimate restoration after rejection, and performs a successful restored
write.

### Additional failure-proof table

| Check                                                       | Fault injected                                                | Test that observed it                                                | Observed failure                              |
| ----------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------- |
| Memory proof reads the actual journal-history backing seam  | Disconnected `journalHistoryFor` from the journal event array | `reaches a journal late write inside the real staged source`         | Expected `["event-sentinel"]`; received `[]`. |
| Memory history phase follows the actual history mutation    | Moved the staged barrier before the journal event push        | `reaches a journal late write inside the real staged source`         | Expected `["event-faulted"]`; received `[]`.  |
| Memory final-satellite phase follows a real satellite write | Moved the staged barrier before the estimate write            | `reaches the final subtree write inside the real staged source`      | Expected `["faulted:step-1"]`; received `[]`. |
| SQLite final-satellite phase follows a real satellite write | Moved the transaction barrier before the estimate insert      | `reaches the final subtree write inside the real SQLite transaction` | Expected `["faulted:step-1"]`; received `[]`. |

### Passing correction commands

- Focused four-file fault suite: 21 pass, 0 fail, 67 assertions.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run conformance:test --skip-nx-cache`: 29 pass, 0 fail, 47 assertions.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run store-memory:test --skip-nx-cache`: 35 pass, 1 declared legacy gap skip, 0 fail, 223 assertions.
- `bun test --coverage --coverage-reporter=lcov` in `libs/store-sqlite`: 659 pass, 0 fail, 2,033 assertions across 60 files.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t lint,typecheck -p conformance,store-memory,store-sqlite --skip-nx-cache`: all six targets succeeded.

The full workspace gate and build/browser targets remain skipped because this
correction is confined to internal source conformance seams and tests. The one
memory `estimates.set:unknown_step` skip is the pre-existing declared legacy
gap owned by Task 1.3.

## 2026-09-12 — task 1.3 existing-family migration

The steps, estimates, directory and eventLog cases now live in their named
family files and execute through `runCases`. Their twelve IDs remain an
independent exact list in certification. Both source tests open the actual
source factory per case and seed the same explicit two-project fixture. SQLite
runs all twelve cases. Memory runs eleven; bypassing its declaration proves
that `estimates.set:unknown_step` still answers `written`, so the gap remains
with the observed assertion and source revision.

### Task 1.3 failure-proof table

| Check                                                          | Fault injected                                                            | Test that observed it                                                           | Observed failure                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Existing IDs survive the migration                             | Loaded the inventory test before `existingStoreRegistrations` existed     | `preserves the original offered-case IDs`                                       | `SyntaxError: Export named 'existingStoreRegistrations' not found`.                       |
| SQLite executes the real seeded cases                          | Opened the real source with project rows missing required estimate fields | `SQLite runs every offered existing case`                                       | All case setups failed on `undefined is not an object (evaluating 'weights.optimistic')`. |
| Memory gap is an observed failure, not an exclusion assumption | Bypassed the declaration and ran `estimates.set:unknown_step`             | `memory's unknown-step gap names an observed refusal mismatch`                  | `Expected: "unknown_step"`; `Received: "written"`.                                        |
| Added step is observable                                       | `break:steps.add` changed the written name                                | `reinjects the existing add, rename, estimate, remove, range, and prune faults` | `Expected to contain: "Wiring"`; received `"faulted add"`.                                |
| Renamed step is observable                                     | `break:steps.rename` changed the requested name                           | Same shared-runner fault test                                                   | `Expected: "Renamed"`; `Received: "faulted rename"`.                                      |
| Estimate value is observable                                   | `break:estimates.set` incremented realistic days                          | Same shared-runner fault test                                                   | `Expected: 2`; `Received: 3`.                                                             |
| Removed estimate is absent                                     | `break:estimates.remove` omitted the removal                              | Same shared-runner fault test                                                   | Received the extra `"work-a-two"`.                                                        |
| Event range is observed                                        | `break:eventLog.rangeSince` returned no rows                              | Same shared-runner fault test                                                   | `Expected: [1]`; `Received: []`.                                                          |
| Prune count is observed                                        | `break:eventLog.pruneBeyond` returned zero without pruning                | Same shared-runner fault test                                                   | `Expected: 2`; `Received: 0`.                                                             |

### Task 1.3 passing commands

- Focused three-file suite: 5 pass, 0 fail, 71 assertions.
- Coverage-mode source-conformance files: memory 2 pass/0 fail and SQLite 2
  pass/0 fail; evidence matching is stable with Bun's ANSI presentation
  removed before comparing the recorded text.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run conformance:test --skip-nx-cache`:
  29 pass, 0 fail, 47 assertions.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run store-memory:test --skip-nx-cache`:
  23 pass, 0 fail, 226 assertions.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run store-sqlite:test --skip-nx-cache`:
  647 pass, 0 fail, 2,051 assertions across 60 files.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p conformance store-memory store-sqlite --skip-nx-cache`:
  all three targets succeeded; the missing-family compile fixture remains active.
- The matching three-project lint run succeeded; OpenSpec strict validation and
  all 75 artifacts passed.
- Prettier checks for every changed source/evidence file and `git diff --check`
  passed.

The full workspace, build, deploy and browser gates were not run: this slice
moves the four existing adapter contract cases and changes no browser,
transport or deployment behavior.

One earlier command is explicitly invalid evidence: `bun test libs/conformance
libs/store-memory libs/store-sqlite` was invoked from the repository root after
direct TypeScript builds. Bun also collected generated `dist/out-tsc` test
duplicates, which cannot resolve workspace aliases or migration paths from
that location. The official project-scoped Nx targets above run from each
project's configured working directory and replaced that command; all three
passed.

## 2026-09-12 — task 1.3 Astra lifecycle correction

SQLite fixture setup now owns its source and temporary directory from creation
through verified seeding. Every setup failure closes the real source and then
removes the directory; if cleanup also fails, the original and cleanup failures
are retained together. Fault proof setup opens, seeds and verifies the source
while the control is inert. Only the selected shared case runs after arming,
and runner failures outside its assertion phase are classified as phase
failures rather than assertion observations.

### Lifecycle failure-proof table

| Check                                             | Fault injected                                                                  | Production-path test                                                          | Observed RED                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Failed setup releases both resources              | Rejected the first real `users.create` during seed                              | `failed SQLite setup closes its source and removes its temporary directory`   | Close count was `0` rather than `1`; the temporary directory still existed.                                      |
| Setup and cleanup failures are both retained      | Rejected seed and then rejected the real source close                           | `failed SQLite setup preserves its original and cleanup failures`             | `Expected: true`, `Received: false` after replacing the aggregate with cleanup alone.                            |
| Seed reach cannot certify the shared assertion    | Called the decorated real `steps.add` from project seed and then rejected setup | `a seed failure cannot become an observed shared-case assertion`              | Proof was `observed` with `reachedDuringSeed === true` although the shared assertion never ran.                  |
| Cleanup reach cannot certify the shared assertion | Rejected close after the decorated real `steps.add` reached its fault           | `a cleanup failure after fault reach is a phase failure, not assertion proof` | Proof was `observed`; its text also contained `cleanup failed: injected cleanup failure after actual steps.add`. |

### Lifecycle correction verification

- Focused SQLite source-conformance file: 6 pass, 0 fail, 273 assertions.
- Full SQLite adapter target: 651 pass, 0 fail, 2,282 assertions across 60 files.
- Direct SQLite TypeScript build and focused ESLint check passed.
- The final proportional multi-project and OpenSpec commands are recorded in
  the Task 1.3 report.

No later source family was implemented. The full workspace, build, deploy and
browser gates remain skipped because this correction changes only test fixture
ownership and certification classification.

## 2026-09-12 — task 1.3 Astra diagnostic correction

The execution runner and fault-proof recorder now use one internal failure
renderer. It retains an aggregate's own context and recursively renders its
members in insertion order, so setup, cleanup and nested cleanup failures
survive both returned certification-report boundaries.

### Diagnostic failure-proof table

| Check                                              | Fault injected                                                                                                  | Production-path test                                                     | Observed RED                                                                                            |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `ExecutionReport` retains all setup/cleanup causes | The real SQLite seed rejected, then actual source close threw a cleanup aggregate containing a nested aggregate | `the execution report surfaces nested SQLite setup and cleanup failures` | Expected `original report setup sentinel`; received only `SQLite conformance setup and cleanup failed`. |
| `FaultProof` retains all setup/cleanup causes      | The same real SQLite setup/cleanup shape ran through `recordFaultProof`                                         | `the fault proof surfaces nested SQLite setup and cleanup failures`      | Expected `original proof setup sentinel`; received only `SQLite conformance setup and cleanup failed`.  |

Both restored tests assert the complete surfaced string, including the outer
context, original setup sentinel, cleanup sentinel and nested cleanup sentinel.
They also retain setup classification, require one real close and verify the
temporary directory is absent.

### Diagnostic correction verification

- Focused SQLite source-conformance file: 8 pass, 0 fail, 282 assertions.
- Conformance target: 29 pass, 0 fail, 47 assertions.
- Memory target: 23 pass, 0 fail, 226 assertions.
- Full SQLite target: 653 pass, 0 fail, 2,291 assertions across 60 files.
- All six conformance/memory/SQLite lint and typecheck targets succeeded; the
  missing-family compile fixture remains active.
- OpenSpec strict validation succeeded and all 75 artifacts passed.

No later source family was implemented. Full workspace, build, deploy and
browser gates remain skipped because this correction changes only shared
conformance diagnostic rendering and its real SQLite probes.

## 2026-09-12 — task 2.1 project-family cases

The shared runner now registers all three project cases before the preserved
twelve existing cases. Both real source factories open independently seeded
two-project fixtures with distinct owners and explicit stamps. Creation checks
the complete project and ordered starting steps; update pre-asserts both
project sentinels, renames only A and refuses an unknown ID; access history
gives the two actors deliberately different orders and timestamps.

### Task 2.1 failure-proof table

| Check                                    | Fault injected                                                                           | Production-path test                                                    | Observed failure                                                          |
| ---------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Registration cannot omit the project kit | Loaded the independent 15-ID inventory before registering `projectRegistrations`         | `preserves the original IDs and adds the project cases`                 | The received list omitted all three `projects.*` IDs.                     |
| Create persists both starting steps      | Both source decorators passed an empty starting-step list into the real project `create` | `reinjects project step, scope, and reader-order faults` in each source | Expected the two `project-created-*` rows; received `[]`.                 |
| Update is scoped to project A            | Both source decorators repeated the real update against project B                        | Same source-specific fault tests                                        | Project B expected `Project 2`; received `Renamed project`.               |
| Access order is caller-specific          | Both source decorators ignored the requested user and read owner A's access rows         | Same source-specific fault tests                                        | Owner B expected `Project 1, Project 2`; received `Project 2, Project 1`. |

Each fault proof seeded while inert, reached its named method only after arm,
failed the shared assertion, and was followed by a restored run of those same
three registrations. Memory required no project gap; its existing exact
`estimates.set:unknown_step` gap is unchanged.

### Task 2.1 verification

- Focused shared inventory: 1 pass, 0 fail.
- Focused memory source: 3 pass, 0 fail, 72 assertions.
- Focused SQLite source: 9 pass, 0 fail, 398 assertions.
- Existing SQLite project repository and settings suites: 35 pass, 0 fail, 87 assertions.
- Conformance target: 29 pass, 0 fail, 47 assertions.
- Memory target: 24 pass, 0 fail, 270 assertions.
- SQLite target: 654 pass, 0 fail, 2,407 assertions across 60 files.
- All six conformance/memory/SQLite lint and typecheck targets succeeded; the
  missing-family compile fixture remains active.
- OpenSpec strict validation succeeded and all 75 artifacts passed.

The full workspace, build, browser and deploy gates were not run: Task 2.1
adds one store-family conformance kit and test-only source decorators, with no
transport, UI, migration or deploy behavior.
