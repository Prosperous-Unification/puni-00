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

## 2026-09-12 — task 2.2 user-family cases

The shared runner now registers the four user cases after projects. Both real
source factories offer the users family without a gap. The cases assert a
duplicate username's original and attempted replacement IDs after settlement,
the complete nullable account read through both keys, issuer-plus-subject
identity, and a verified-email collision with the claiming account unchanged.

### Task 2.2 failure-proof table

| Check                                     | Fault injected                                                                                  | Production-path test                                                          | Observed failure                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Registration cannot omit the user kit     | Loaded the independent 19-ID inventory before registering `userRegistrations`                   | `preserves the original IDs and adds the project and user cases`              | The received list omitted all four `users.*` IDs.                               |
| Duplicate username cannot create a new ID | Both decorators overwrote the existing account at the source's real backing seam                | `reinjects account uniqueness, read-shape, issuer, and verified-email faults` | `duplicate` received `user-duplicate`; the original no longer matched.          |
| Nullable password survives both reads     | Both decorators removed `passwordHash` from actual `findById` and `findByUsername` results      | Same source-specific fault test                                               | Both expected `passwordHash: null` fields were absent.                          |
| OIDC identity includes issuer and subject | Both decorators substituted the first issuer when the same subject arrived under another issuer | Same source-specific fault test                                               | `otherIssuer` received `oidc-primary`; `otherStored` was null.                  |
| Verified-email collision refuses creation | Both decorators changed only the conflicting request to unverified before the actual resolution | Same source-specific fault test                                               | `conflict` and `conflicting` received the newly stored `oidc-conflict` account. |

Every fault seeded while inert, reached only its named assertion phase, and was
followed by the unchanged four registrations passing on a fresh source. Memory
required no user gap; its existing exact `estimates.set:unknown_step` gap is
unchanged.

### Task 2.2 verification

- Focused shared inventory: 1 pass, 0 fail.
- Focused memory source: 4 pass, 0 fail, 93 assertions.
- Focused SQLite source: 10 pass, 0 fail, 515 assertions.
- Existing SQLite OIDC repository suite: 5 pass, 0 fail, 12 assertions.
- Conformance target: 29 pass, 0 fail, 47 assertions.
- Memory target: 25 pass, 0 fail, 291 assertions.
- SQLite target: 655 pass, 0 fail, 2,524 assertions across 60 files.
- All six relevant lint/typecheck targets succeeded; the missing-family compile
  fixture remains active.
- Formatting and OpenSpec validation passed in the final verification run.

The full workspace, build, browser and deploy gates were not run: Task 2.2
adds account-store conformance cases and test-only source decorators, without
changing transport-token verification, UI, migration or deploy behavior.

## 2026-09-12 — task 2.3 capacity and priority-band families

The shared runner now registers all three capacity and all three priority-band
cases. Each case observes a complete public map/list or ladder snapshot beside
unchanged project and team sentinels. The ladder replacement case first observes
unconfigured B's default, then writes and pre-asserts independent valid five-band
ladders for A and B before replacing A again. It compares both configured ladders
afterward. Validation remains solely at its existing controller boundary.

### Task 2.3 failure-proof table

| Check                                                | Fault injected                                                                                                                                                                                         | Production-path test                                                          | Observed failure                                                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration cannot omit either configuration kit    | Loaded the independent inventory before registering either six-case kit                                                                                                                                | `preserves the original IDs and adds project, user, and configuration cases`  | Received inventory omitted all six `capacity.*` / `priorityBands.*` IDs.                                                                                        |
| Capacity identity includes project and team          | Both decorators redirected the second same-team write to the first project through the real store                                                                                                      | Source-specific configuration fault test                                      | A's complete map/list held `team-a: 5` instead of 2 and B was empty.                                                                                            |
| Clear means absent rather than zero                  | Memory passed zero into its real store; SQLite enabled its connection-local constraint bypass and passed zero into the real repository                                                                 | Source-specific configuration fault test                                      | `hasClearedKey` received true and both public reads exposed `team-a: 0`.                                                                                        |
| Capacity refuses missing references without rows     | SQLite redirected both requests to held references; memory ran the exact unexcluded case before its gap was recorded                                                                                   | SQLite fault test / `names the observed configuration-reference refusal gaps` | SQLite returned both true and exposed A's row; memory returned both true and exposed rows under the missing project/team keys (`Expected - 6 / Received + 14`). |
| Unconfigured projects receive the default ladder     | Both decorators completed the real reads, then returned empty ladders                                                                                                                                  | Source-specific configuration fault test                                      | Both projects received `[]` instead of all five default bands (`Expected - 54 / Received + 2`).                                                                 |
| Replacement writes the whole five-band ladder        | Both decorators sent the first replacement rung plus four existing A rungs through the real replacement                                                                                                | Source-specific configuration fault test                                      | A retained `Soon`, `Planned`, `Later`, and `Parked`; the complete comparison failed with Expected -10 / Received +10 while B stayed exact.                      |
| Replacement remains scoped to its project            | SQLite installed a connection-local trigger immediately before A's second replacement, broadening that real transaction's delete to B; memory reset B through the staged source before the same A call | Separate source-specific project-scope fault tests                            | Both received B's `Critical/High/Medium/Low/Lowest` defaults instead of its configured `Now/Next/Queued/Deferred/Backlog` ladder (Expected -13 / Received +13). |
| Missing-project replacement refuses without a ladder | SQLite redirected the real replacement to A; memory ran the exact unexcluded case before its gap was recorded                                                                                          | SQLite fault test / memory gap-bypass test                                    | SQLite returned true and changed A; memory returned true and exposed the missing project's stored ladder (`Expected - 16 / Received + 15`).                     |

All injected faults seeded while inert, reached only their named case after arm,
and were followed by the unchanged supported registrations passing against fresh
sources. Memory declares only its two newly observed reference-set limitations;
SQLite executes all six with no gap. Memory's earlier exact
`estimates.set:unknown_step` gap is unchanged.

### Task 2.3 verification

- Focused shared inventory: 1 pass, 0 fail.
- Focused memory source: 6 pass, 0 fail, 182 assertions.
- Focused SQLite source: 11 pass, 0 fail, 765 assertions.
- Existing SQLite capacity and priority-band suites: 17 pass, 0 fail, 34 assertions.
- Conformance target: 29 pass, 0 fail, 47 assertions.
- Memory target: 27 pass, 0 fail, 380 assertions.
- SQLite target: 656 pass, 0 fail, 2,774 assertions across 60 files.
- All six relevant lint/typecheck targets passed; the missing-family compile
  fixture remains active.
- Formatting, `git diff --check`, OpenSpec strict validation and all 75 artifacts
  passed.

The full workspace, build, browser and deploy gates were not run: Task 2.3 adds
configuration-store conformance cases and test-only source decorators, with no
transport, UI, migration or deployment behavior.

### Task 2.3 review repair and acceptance

Astra's first review observed that an unconfigured B read could not distinguish
preservation from broad deletion because both states returned the default ladder.
The shared case now establishes the configured sentinel described above. The
first-rung proof remains separate and targets A's second replacement by its own
per-project call count, so B's added setup cannot consume its fault window.

Focused repair evidence on 2026-09-12:

- Combined offered-case, first-rung and project-scope proof runs: memory 3 pass,
  0 fail, 150 assertions; SQLite 3 pass, 0 fail, 492 assertions.
- Isolated observed project-scope proof runs before restoration: memory 1 pass,
  0 fail, 22 assertions; SQLite 1 pass, 0 fail, 38 assertions. These test
  results mean the proof harness observed the named shared-case failure and its
  following unchanged-source case passed; the injected source did not pass
  conformance.
- Uncached normal targets after restoration: conformance 29 pass, 0 fail, 47
  assertions; memory 28 pass, 0 fail, 411 assertions; SQLite 657 pass, 0 fail,
  2,821 assertions across 60 files.
- Uncached lint and typecheck targets passed for conformance, store-memory and
  store-sqlite.
- Pinned OpenSpec 1.3.0 strict validation passed for this change; all-artifact
  validation reported 75 passed, 0 failed. Both commands exited 0 after
  non-fatal telemetry DNS warnings from the sandbox.

The six changed files passed focused Prettier checking and `git diff --check`.
The workspace, build, browser and deploy gates remain outside this bounded
repair; the parallel browser owner reported its own result separately.

Astra xhigh accepted the repair on 2026-09-12, with no new Critical or Important
findings. It independently removed the project predicate from a temporary copy
of the actual SQLite replacement adapter and activated that mutation only on
the second A replacement, after both complete stored ladders were pre-asserted.
The intended final comparison failed with A exact and B's configured ladder
replaced by defaults (Expected -13 / Received +13); the restored shared case
passed. A separate all-writes activation failed earlier when B's setup erased A;
that earlier collision is not the acceptance evidence for the final comparison.
The two probe tests passed with 74 assertions in 389 ms. Reports and full output:
`/tmp/source-conformance-2-3-astra-rereview.md` and
`/tmp/source-conformance-2-3-astra-rereview-probes/output.txt`.

Task 2.3 is complete again, bringing this local change to 6/24 tasks. The minor
gap-diagnostic note remains open: two memory gap strings pin diff sizes rather
than observed values; no current false exclusion was demonstrated, and this
repair did not change those cases. The eighteen remaining slices, current-main
integration and final whole-change certification/gates remain pending.

## 2026-09-13 — task 2.4 calendar-marker family

The shared runner now registers both calendar-marker cases. The order case
creates marker-c/marker-a/marker-b with identical date and createdAt, proves the
tie from settled write answers, then asserts marker-a/marker-b/marker-c through
the public list. The write case creates exact A/B sentinels on literal
2026-09-10 with null automatic color, renames and recolors A, clears it to null,
refuses B's three mutations against A, removes A and observes B unchanged.

### Task 2.4 failure-proof table

| Check                                 | Fault injected                                                                                            | Production-path test                                                                 | Observed failure                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Registration includes both marker IDs | Loaded the independent inventory before registering `calendarMarkerRegistrations`                         | `preserves the original IDs and adds project, user, configuration, and marker cases` | Both `calendarMarkers.*` IDs were absent (Expected -2 / Received +0).                                 |
| Tied lists use ID as the third key    | Memory restored insertion order after the real read; SQLite queried the real table by date/createdAt only | Source-specific marker fault test                                                    | Both read c/a/b instead of a/b/c (Expected -1 / Received +1).                                         |
| Writes remain in project scope        | Both decorators routed B's rename of A through A's real rename path                                       | Source-specific marker fault test                                                    | Rename returned true and A read `Mine now` instead of refusal/unchanged (Expected -3 / Received +10). |
| ISO day remains literal               | Both decorators changed only A's create argument from 2026-09-10 to 2026-09-11                            | Source-specific marker fault test                                                    | Settled create answer held 2026-09-11 (Expected -1 / Received +1).                                    |

All three faults were armed after verified two-project seed, reached only after
their case-specific preconditions, failed the shared assertion and were followed
by the unchanged two registrations passing against fresh sources. Neither
source needs a calendar-marker gap. Existing marker adapters were unchanged.

### Task 2.4 verification

- Focused shared inventory: 1 pass, 0 fail, 1 assertion.
- Focused memory source: 8 pass, 0 fail, 263 assertions.
- Focused SQLite source: 13 pass, 0 fail, 918 assertions.
- Existing SQLite marker repository/table/migration suites: 19 pass, 0 fail,
  40 assertions.
- Auckland zoned marker runner: 2 files, 3 tests passed; it emitted the existing
  Vite native-config warning.
- Uncached normal targets: conformance 29 pass, 0 fail, 47 assertions; memory
  29 pass, 0 fail, 461 assertions; SQLite 658 pass, 0 fail, 2,927 assertions
  across 60 files.
- All six uncached lint/typecheck targets for conformance, store-memory and
  store-sqlite succeeded.
- Pinned OpenSpec 1.3.0 strict validation passed; all-artifact validation
  reported 75 passed, 0 failed.

The full workspace, build, browser and deploy gates were not run: Task 2.4 adds
one shared store-family kit and test-only source faults, with no application,
transport, migration or deployment behavior. Task 3.1 remains untouched and
Task 2.4 stays unchecked until independent review.

### Task 2.4 review fix round 1 — mutable-input oracle

Astra's review mutated the exact object passed to `create` in place. The first
oracle reused that object after `await`, so both source proof tests received
`assertion-passed` for the literal-date fault instead of `observed`: memory
0 pass / 1 fail / 23 assertions; SQLite 0 pass / 1 fail / 47 assertions.

The case now passes an independent clone into each real source and retains its
untouched expected marker. Both permanent source faults use
`Object.assign(marker, { date: '2026-09-11' })`. A temporary capture assertion
exposed the intended settled create-answer diff in both sources: expected
2026-09-10, received 2026-09-11 (Expected -1 / Received +1). The capture runs
failed with memory 0 pass / 1 fail / 18 assertions and SQLite 0 pass / 1 fail /
42 assertions. With the capture removed, the focused proof/restoration tests
passed with memory 1/0/34 and SQLite 1/0/74.

After restoration, the complete memory source-conformance file passed 8 tests
with 263 assertions and the complete SQLite file passed 13 tests with 918
assertions. All six uncached lint/typecheck targets for conformance,
store-memory and store-sqlite succeeded. Focused formatting and diff checks are
recorded in the task report.

Astra xhigh accepted fix round 1 on 2026-09-12. The shared case passes independent
clones at both create calls while the expected marker objects remain untouched, and
both permanent source faults retain the demonstrated in-place `Object.assign`
mutation. The re-review found no new Critical or Important breakage and needed no
additional probe. Task 2.4 is complete; the source change is now 7/24 tasks. Task
3.1 remains untouched. Reports: `/tmp/source-conformance-2-4-astra-review.md` and
`/tmp/source-conformance-2-4-astra-rereview.md`.

## 2026-09-13 — task 3.1 work-item family

The shared runner now registers all five work-item cases. Each source opens the
real public `WorkItemStore`, verifies both deterministic projects and their row
IDs before fault activation, and observes state only through
`listByProject`/`findById`. Memory ran every case without a new gap; SQLite ran
all five and retains zero gaps.

### Task 3.1 failure-proof table

| Check                                        | Fault injected                                                                                                                 | Production-path test                                                  | Observed failure                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Registration includes all five work-item IDs | Loaded the independent inventory before registering `workItemRegistrations`                                                    | `preserves the original IDs and adds each completed family inventory` | All five `workItems.*` IDs were absent (Expected -5 / Received +0).                                                                     |
| Insert applies declared respacing            | Both decorators passed an empty `respaced` list into the real insert                                                           | Source-specific work-item fault test                                  | The second sibling remained at position 11 instead of 30.                                                                               |
| Unknown-team refusal is atomic               | Both decorators first completed and publicly verified the scalar rename, then invoked the real patch carrying the unknown team | Source-specific work-item fault test                                  | The refusal was modeled, but the complete settled row changed from `Work 1` to `Escaped rename` (SQLite also advanced revision 1 to 2). |
| Every surviving child is promoted            | Both decorators omitted `work-a-child-two` from the real promotion list                                                        | Source-specific work-item fault test                                  | Memory retained its old `work-a-one` parent link; SQLite refused and rolled back, so `didRefuse` was true and the parent remained.      |
| Clearing one frozen number is key-specific   | Both decorators appended a null update for the other frozen row to the real batch                                              | Source-specific work-item fault test                                  | `work-a-two` received null instead of retaining `020`.                                                                                  |

`workItems.move:parent-position` deliberately has no fifth mutation. Its normal
case moves one row beneath a different parent, respaces the existing child and
compares the exact project/parent/position set while project B remains an exact
public-read sentinel. All four faults were first run as inert controls and
failed the proof test as `phase-failed`; after implementation they were observed
at the named assertion and the unchanged registrations passed on fresh sources.

### Task 3.1 verification

- Registration RED: 0 pass, 1 fail; five expected IDs missing. Restored: 1 pass,
  0 fail, 1 assertion.
- Exact unexcluded five-case runs before faults: memory 1 pass, 0 fail, 43
  assertions; SQLite 1 pass, 0 fail, 63 assertions.
- Focused normal plus four proof/restoration runs: memory 2 pass, 0 fail, 113
  assertions; SQLite 2 pass, 0 fail, 165 assertions.
- Complete source files: memory 10 pass, 0 fail, 600 assertions; SQLite 15 pass,
  0 fail, 1,083 assertions.
- Existing SQLite work-item suite: 38 pass, 0 fail, 87 assertions.
- Uncached normal targets: conformance 29 pass / 47 assertions; memory 31 pass /
  798 assertions; SQLite 660 pass / 3,092 assertions across 60 files.
- All six uncached lint/typecheck targets for conformance, store-memory and
  store-sqlite succeeded.
- Focused Prettier and `git diff --check` passed after the evidence update.
- Pinned OpenSpec 1.3.0 strict validation passed; all-artifact validation
  reported 75 passed and 0 failed.

The source-specific `test:conformance` targets remain a planned Task 7.2
integration and do not exist in the three current project files, so no such
command is claimed here. The full workspace, build, browser and deploy gates
were not run: this slice adds a shared store conformance kit and test-only
source decorators, without application, transport, migration or deployment
behavior. Task 3.1 remains unchecked pending independent review; Task 3.2 was
not started.

### Task 3.1 Astra fix round 1 — complete public snapshots

Astra's review found the insert, move, promotion and freeze assertions projected
away most of each `LabelledWorkItem`. The cases now compare independently
constructed complete project-A lists and unchanged complete project-B lists.
Affected survivors carry nonempty team, service, type and external-reference
witnesses before fault activation; SQLite also carries the seeded tag witness.
Literal placement, frozen-number and removal-settlement assertions remain.

The complete expected lists retain revision. They allow only the two precise
public outcomes the sources expose: no structural bookkeeping bump, or exact
increments of moved +1; reparented children +1 with the position-only sibling
unchanged; and frozen rows +2/+1 across the two batches. The expected rows are
cloned before the operation, including source-minted external-reference IDs, so
neither mutable request input nor the settled source answer can rewrite the
oracle.

- Exact five-case runs: memory 1 pass / 83 assertions; SQLite 1 pass / 103
  assertions. No new memory gap; SQLite remains at zero gaps.
- The unchanged four permanent faults failed inside the complete snapshot
  assertions, and their restored proof tests passed: memory 1/0/129; SQLite
  1/0/161.
- Complete source files passed: memory 10/0/923; SQLite 15/0/1,474. The existing
  SQLite work-item suite passed 38/0/87.
- All six uncached lint/typecheck targets for conformance, store-memory and
  store-sqlite passed after the fix.

Astra xhigh accepted fix round 1 at `6a8481a7` on 2026-09-12. The re-review
confirmed that every affected case now compares complete, independently built
public project-A arrays alongside an unchanged project-B sentinel. Revision
variance is restricted to whole-array alternatives for the exact durable
outcomes exposed by the two sources, so rows from incompatible alternatives
cannot be mixed. The four permanent faults still fail inside those complete
snapshots. No Critical or Important finding remains. Task 3.1 is complete; the
source change is now 8/24 tasks, and Task 3.2 is next. Review:
`/tmp/source-conformance-3-1-astra-rereview.md`.

## 2026-09-13 — task 3.2 estimate ownership and actuals implementation evidence

The shared runner now registers `estimates.moveAll:ownership` and all four
actual cases. Every case uses two seeded projects with two work items and two
steps, distinct estimate values or actual timestamps, complete pre-operation
public snapshots and an unchanged project-B sentinel. Settled assertions keep
the complete composite keys, estimate trios, actual days and `recordedAt`.

Memory's real unexcluded `actuals.set:unknown_step` run failed at the shared
assertion with expected `unknown_step` and received `written`. That exact new
gap is declared only after the observed run. The existing estimate unknown-step
gap was bypassed again and remains open with the same mismatch. SQLite executed
all five new cases and retains zero gaps.

### Task 3.2 failure-proof table

| Check                               | Fault injected through the real source                                                      | Production-path test                                                  | Observed failure                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Registration includes all five IDs  | Loaded the independent inventory before estimate ownership and actual registrations existed | `preserves the original IDs and adds each completed family inventory` | All five IDs were absent (Expected -5 / Received +0).                               |
| Estimate move transfers ownership   | Copied both source trios through real `set` calls and omitted source removal                | Source-specific estimate/actual fault test                            | Both `work-a-one` trios remained beside the target trios (Received +14 diff lines). |
| Actual replacement restamps the row | Replaced the days through real `set` while retaining the first `recordedAt`                 | Same source-specific fault test                                       | Expected `recordedAt: 201`; received 101.                                           |
| Actual removal is pair-specific     | Invoked real removal for the requested pair and the same step on `work-a-two`               | Same source-specific fault test                                       | The complete `work-a-two`/`step-a-dev` survivor was absent.                         |
| Actual move transfers ownership     | Copied both source rows through real `set` calls and omitted source removal                 | Same source-specific fault test                                       | Both `work-a-one` rows remained beside the target rows (Received +12 diff lines).   |
| Actual set refuses a missing step   | Redirected the missing-step write through a real known-step `set` call                      | Same source-specific fault test                                       | Expected `unknown_step`; received `written`.                                        |

All controls were inert during verified seed, armed afterward, reached their
named phase and failed a settled shared assertion. Restored registrations ran
against fresh sources: memory passed the four offered cases and reported its
actual unknown-step gap as `not-offered`; SQLite passed all five.

### Task 3.2 verification

- Registration RED: 0 pass / 1 fail / 1 assertion, five IDs absent. Restored:
  1/0/1.
- Focused final runs: memory 4/0/464; SQLite 2/0/667. The memory run includes
  both estimate and actual unknown-step bypass evidence.
- Existing adapter coverage: SQLite estimate/actual suites 15/0/26; complete
  memory-source suite 9/0/153.
- Uncached normal targets: conformance 29/0/47; memory 33/0/1,294; SQLite
  661/0/3,728 across 60 files.
- All six uncached lint/typecheck targets for conformance, store-memory and
  store-sqlite passed. Pinned OpenSpec strict validation passed; all-artifact
  validation reported 75 passed and 0 failed. Formatting and diff results are
  in the Task 3.2 report.

The source-specific `test:conformance` targets remain deferred to Task 7.2 and
are absent from the current project files. The full workspace, build, browser
and deploy gates were not run because this slice adds shared conformance cases
and test-only source decorators only. Task 3.2 remains unchecked pending
independent review; Task 3.3 was not started.

### Task 3.2 Astra fix round 1 — complete settlement observations

The missing-step case now retains its outcome and reads both complete project
lists before one combined assertion. The real memory bypass and both source
faults expose received `written` together with the escaped
`work-a-one`/`no-such-step` row, days 13 at `recordedAt: 201`. The observed
memory gap remains exact; SQLite retains zero gaps.

Removal now asserts both complete project lists after call one, then repeats
them after the idempotent second call. A new permanent fault suppresses only
the first call and was observed failing in that first settlement window with
the complete targeted row still present. The retained broad-deletion fault was
re-observed there with the complete `work-a-two`/`step-a-dev`/days-5/
`recordedAt`-103 survivor absent.

All Task 3.2 permanent diagnostics now require exact signed multi-line evidence
for the intended composite rows and values. Ownership pins both extra source
rows alongside complete destination rows; replacement pins expected 201 and
received 101 on work-a-one/dev; missing-step pins both outcome and escaped row.

- Focused memory bypass/fault/restoration: 3/0/153; focused SQLite
  fault/restoration: 1/0/182.
- Complete source files: memory 12/0/1,114; SQLite 16/0/1,737.
- Existing adapters: SQLite estimate/actual 15/0/26; memory source 9/0/153.
- Uncached targets: conformance 29/0/47; memory 33/0/1,312; SQLite
  661/0/3,746 across 60 files.
- All six uncached lint/typecheck targets passed.

Formatting, diff and pinned OpenSpec validation evidence is retained in the
Task 3.2 report. The same proportional skips apply. Independent review remains
pending; Task 3.2 remains unchecked and Task 3.3 has not started.

Astra xhigh accepted fix round 1 at `3110f637` on 2026-09-13. Its focused
re-review confirmed that the missing-step case completes both public reads
before comparing outcome and state, the first removal is observed before the
idempotent second call, and every Task 3.2 diagnostic distinguishes the exact
composite rows, timestamps and expected/received direction it claims. The two
removal controls share the closed case-derived fault ID but have distinct
required phases and opposite complete-row diagnostics on fresh sources. No
Critical, Important or Minor issue remains. Task 3.2 is complete; the source
change is now 9/24 tasks, and Task 3.3 is next. Reviews:
`/tmp/source-conformance-3-2-astra-review.md` and
`/tmp/source-conformance-3-2-astra-rereview.md`.

## 2026-09-13 — task 3.3 measure metric identity and ownership evidence

The shared runner now registers all four measure cases. Set and remove place
`token_estimate`, `token_actual`, and `hours_actual` together on one pair and
retain complete other-item, other-step, and other-project sentinels. Set replaces
one metric's value and `recordedAt`; remove observes its first settlement before
the idempotent second call; move transfers every source metric and timestamp,
leaves no source rows, and preserves target and project sentinels. Missing-step
settlement retains its outcome and completes both public project reads before
one combined comparison.

Memory's real unexcluded `measures.set:unknown_step` run failed in the shared
assertion with expected `unknown_step`, received `written`, and the complete
escaped `work-a-one/no-such-step/token_estimate` row, value 21 at `recordedAt` 201. That exact gap was declared only after the run. All three supported measure
cases still execute in memory; SQLite executes all four and retains zero gaps.

### Task 3.3 failure-proof table

| Check                                   | Fault injected through the real source                                           | Production-path test                                                  | Observed failure                                                                                          |
| --------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Registration includes all four IDs      | Loaded the independent inventory before measure registration existed             | `preserves the original IDs and adds each completed family inventory` | All four measure IDs were absent (`Expected - 4 / Received + 0`).                                         |
| Set identity includes metric            | Removed both non-target metrics through real remove calls before the replacement | Source-specific measure fault test                                    | Complete hours value 12/time 103 and token estimate value 10/time 101 survivors were expected but absent. |
| Replacement preserves the supplied time | Passed the replacement through real set with stale `recordedAt`                  | Same source-specific fault test                                       | On the complete token-actual row, expected 201 and received 102.                                          |
| Remove identity includes metric         | Ran real remove for the requested metric and both pair survivors                 | Same source-specific fault test                                       | The same complete hours and token-estimate survivors were absent in the first settlement window.          |
| Move transfers every metric             | Moved only token-estimate rows through real set/remove calls                     | Same source-specific fault test                                       | Complete hours and token-actual rows remained received on work-a-one instead of expected work-a-two.      |
| Move preserves `recordedAt`             | Ran real move, then rewrote the destination token-actual row with time 999       | Same source-specific fault test                                       | On the complete destination row, expected 102 and received 999.                                           |
| Missing step is refused without a write | Accepted and durably wrote the absent-step request                               | Same source-specific fault test                                       | Received `written` plus the complete escaped token-estimate row in project A's public read.               |

Every source control's injected mutation stayed inert through the complete
measure setup snapshots, then activated at its named target operation, reached
that exact phase, and failed the settled shared assertion. The harness arms the
control after base-source seeding and before the shared case begins; the
operation-specific guards keep setup unaffected. Restored cases ran against
fresh sources. The permanent diagnostics pin full composite rows, values,
timestamps, and expected/received direction.

### Task 3.3 verification

- Inventory RED: 0/1/1 with four absent IDs; restored 1/0/1.
- Focused final proof/gap runs: memory 2/0/130; SQLite 1/0/167.
- Complete source files: memory 14/0/1,282; SQLite 17/0/1,969.
- Existing measure/memory suites: SQLite 11/0/22; memory 9/0/153.
- Uncached targets: conformance 29/0/47; memory 35/0/1,480; SQLite
  662/0/3,978 across 60 files.
- All six uncached lint/typecheck targets passed.
- Formatting, diff, and pinned OpenSpec validation evidence is in the Task 3.3
  report after the terminal rerun.

The source-specific conformance targets remain deferred to Task 7.2. The full
workspace, build, browser, and deploy gates were skipped as outside this shared
case and test-decorator slice. Task 3.3 remains unchecked pending independent
review; Task 3.4 was not started.

Astra xhigh approved `b2e37575` on 2026-09-13 with no Critical or Important
issue. Fresh focused review runs passed the memory gap/proof/restoration paths
with 2 tests and 130 assertions, and SQLite's six proofs plus all four restored
cases with 1 test and 167 assertions. The one Minor finding corrected the
evidence above to distinguish when the harness arms its control from when an
operation-specific fault can activate; it did not affect proof validity. Task
3.3 is complete; the source change is now 10/24 tasks, and Task 3.4 is next.
Review: `/tmp/source-conformance-3-3-astra-review.md`.

## 2026-09-13 — task 3.4 progress state and ownership evidence

The shared runner now registers `progress.set:replace`,
`progress.remove:absence`, `progress.moveAll:ownership`, and
`progress.set:unknown_step`. Every case compares complete, sorted public lists
for projects A and B, including other-item, other-step, target, and
other-project sentinels with exact state and `statedAt`. Stored progress is
limited to `in_progress` and `done`; removal proves `not_started` by absence
after its first settlement and again after an idempotent second call.

Move seeds two distinct source-step statements (`done` at 101 and
`in_progress` at 102), a separate target-step sentinel, and a project-B
sentinel. Its settled result requires both source rows to disappear and both
destination rows to retain their state and timestamp. The missing-step case
retains its outcome, completes both public project reads, and then makes one
combined outcome/state assertion.

Memory's real, unexcluded `progress.set:unknown_step` run failed in the shared
assertion with expected `unknown_step`, received `written`, and the complete
escaped `work-a-one/no-such-step/done` row at `statedAt: 201`. The exact
case-specific gap was declared only after that run. The three supported memory
cases still execute; SQLite executes all four with zero gaps.

### Task 3.4 failure-proof table

| Check                                   | Fault injected through the real source                                                            | Production-path test                                                  | Observed failure                                                                                                                                  |
| --------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration includes all four IDs      | Loaded the independent inventory before progress registration existed                             | `preserves the original IDs and adds each completed family inventory` | All four progress IDs were absent (`Expected - 4 / Received + 0`).                                                                                |
| Set replaces state and timestamp        | Replaced the incoming `done` at 201 with the stale `in_progress` at 101 through real `set`        | Source-specific progress fault test                                   | The complete `work-a-one/step-a-dev` row showed expected `done`/201 and received `in_progress`/101.                                               |
| Remove means storage absence            | Ran real `remove`, then crossed the test-only port boundary with a `not_started` surrogate at 201 | Same source-specific fault test                                       | The complete surrogate row was received in project A's public list where no row was expected.                                                     |
| Move transfers every source statement   | Copied both source rows through real `list` and `set` calls without removing either source row    | Same source-specific fault test                                       | Both complete source remnants were received: dev `done`/101 and qa `in_progress`/102, beside their complete destination rows and target sentinel. |
| Missing step is refused without a write | Accepted and durably wrote the absent-step request                                                | Same source-specific fault test                                       | Received `written` plus the complete escaped `work-a-one/no-such-step/done` row at 201 after both public project reads completed.                 |

The SQLite surrogate uses its test-only SQL boundary to insert the invalid
stored state and then exposes it through the real public progress reader. The
memory surrogate uses an adjacent justified test-only cast because the precise
port excludes the invalid state. The harness arms each control after
base-source seeding and before the shared case; operation-specific guards keep
its injected mutation inactive through the complete progress setup snapshots,
then activate it at the named target operation. Each fault reaches that exact
phase and fails a signed, structured, complete-row diagnostic taken from
observed output. Restorations use fresh real sources.

### Task 3.4 verification

- Inventory RED: 0/1/1 with four absent IDs; restored 1/0/1.
- Focused final gap/proof runs: memory 3/0/548; SQLite 2/0/766.
- Existing progress/memory suites: domain progress 8/0/77; SQLite progress
  10/0/20; memory source 9/0/153.
- Uncached targets: conformance 29/0/47; memory 37/0/1,661. SQLite's exact
  uncached target command completed directly with coverage at 663/0/4,176
  across 60 files.
- All six uncached lint/typecheck targets, formatting, diff, and pinned
  OpenSpec validation are recorded in the Task 3.4 report after their terminal
  rerun.

The first SQLite Nx stream completed without a retained exit result, and an
immediate retry hit Nx's recursive-invocation guard; neither run is counted as
evidence. The direct target command is the retained SQLite evidence. The
source-specific `test:conformance` targets remain deferred to Task 7.2 and are
absent from the current project files. Full workspace, build, browser, and
deploy gates were skipped as outside this shared conformance and test-decorator
slice. Task 3.4 remains unchecked pending independent review; Task 4.1 was not
started.

### Task 3.4 Astra fix round 1 — progress-only SQLite setup ownership

The progress-only third-step seed now runs as `seedSqliteSource`'s final seed
operation, after the verified base seed but inside the same resource owner. A
rejection therefore closes the source and removes its temporary directory for
both the ordinary case opener and `proveFault`; `throwAfterCleanup` retains the
original and cleanup failures without a second cleanup implementation. A
successful seed still hands ownership to the normal fixture teardown, which
closes exactly once.

Permanent negatives reject only the add of `PROGRESS_SENTINEL_STEP_ID`, after
the base seed succeeds. With the late seed moved back outside the owner, both
entry paths failed on expected `{ closeCalls: 1, directoryExists: false }` and
received `{ closeCalls: 0, directoryExists: true }`; the aggregation case
failed on `Expected: true · Received: false`. A separate double-cleanup
injection failed with expected `closeCalls: 1` and received `closeCalls: 2`.
Restored cleanup coverage passed 4/0/59, progress proof/restoration remained
2/0/766, and the complete SQLite source-conformance file passed 22/0/2,226.

Adjacent comments now identify the isolated SQLite test database at the CHECK
and FK overrides, the forbidden `not_started` and missing-step rows, restoration
in `finally`, and the direct `step_progress` read required because the public
reader's normal inner step join hides the stored orphan.

Fresh uncached targets passed: conformance 29/0/47, memory 37/0/1,661, and
SQLite 667/0/4,235 across 60 files. All six uncached lint/typecheck targets
passed. Formatting, diff, and pinned OpenSpec evidence is retained in the
updated Task 3.4 report. Independent re-review remains pending; Task 3.4 stays
unchecked and Task 4.1 remains untouched.

Astra xhigh accepted fix round 1 at `986d966d` on 2026-09-13. Fresh focused
baseline ran nine tests with 208 assertions, including the four cleanup cases,
the inherited setup/aggregation paths, and progress proofs/restoration. Moving
the progress seed outside the owner again made all three permanent late-seed
negatives fail with the recorded leaks and lost aggregation; injecting double
cleanup failed on two closes instead of one. Restored cleanup coverage passed
4/0/59. Both I1 and M1 are closed, and no new Critical, Important or Minor
finding remains. Task 3.4 is complete; the source change is now 11/24 tasks,
and Task 4.1 is next. Reviews: `/tmp/source-conformance-3-4-astra-review.md` and
`/tmp/source-conformance-3-4-astra-rereview.md`.

## 2026-09-13 — task 4.1 dependency and empty-retention evidence

The shared runner now registers `dependencies.add:idempotent-pair`,
`dependencies.remove:pair`, `dependencies.removeAllFor:touching-set`, and
`eventLog.pruneBeyond:empty-sequence`. Both memory and SQLite offer all four
cases with zero new gaps.

Dependency fixtures add two project-A survivor rows inside the source-owned
seed lifecycle. Each case then seeds literal complete edges in projects A and B
and compares the complete public lists, including ID, project, predecessor and
successor, after setup and after every settled operation. Adding the same pair
under a second ID retains the original edge only. Exact pair removal preserves
edges sharing either endpoint. Full-set removal takes incoming, outgoing and
doomed-to-doomed edges while retaining the survivor and other-project edges.
The repeated add, remove and removeAllFor calls are observed in separate
post-settlement snapshots.

The event-log case records exact sequence-0/1 records and a second-subscription
sentinel, prunes every retained row with `pruneBeyond(0)`, and observes empty
ranges, null oldest sequences and unchanged latest sequence positions. Its next
real `recordEvent` return is compared as a complete record with sequence 2;
the public range independently confirms that literal record.

### Task 4.1 failure-proof table

| Check                                     | Fault injected through the real source                                                     | Production-path test                                                  | Observed failure                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Registration includes all four IDs        | Loaded the independent inventory before dependency and empty-sequence registration existed | `preserves the original IDs and adds each completed family inventory` | All four IDs were absent (`Expected - 4 / Received + 0`).                    |
| Add identity is the ordered pair          | Decorated add/list with an ID-keyed view after real adds                                   | Source-specific dependency fault test                                 | The complete received second-ID edge duplicated `work-a-one -> work-a-two`.  |
| Remove uses both pair predicates          | Omitted the successor predicate and ran real removes for every matching predecessor        | Same source-specific test                                             | The complete expected same-predecessor edge was absent.                      |
| Full-set removal includes incoming edges  | Ran real removes for outgoing edges only                                                   | Same source-specific test                                             | The complete incoming survivor-to-doomed edge remained received.             |
| Full-set removal uses every doomed ID     | Passed only the first doomed ID to the real removeAllFor                                   | Same source-specific test                                             | The complete outgoing edge from the second doomed row remained received.     |
| Empty retention does not reset allocation | Derived the next returned sequence from retained MAX after the real prune and append       | Source-specific event-log fault test                                  | The complete next record showed expected sequence 2 and received sequence 0. |

Every control is created per fresh source and remains inert through verified
base seeding. The shared case completes and checks its public setup snapshot
before the targeted operation. Each permanent source decorator then reaches
its distinct named phase and fails the intended signed complete-edge or
complete-record assertion. Restorations open fresh real sources.

### Task 4.1 verification

- Inventory RED: 0/1/1 with four absent registrations; restored 1/0/1.
- Focused real cases plus proofs/restoration: memory 3/0/617 assertions; SQLite
  3/0/897.
- Existing SQLite dependency/event-log suites: 16/0/27; staged memory source:
  9/0/153.
- Full uncached targets: conformance 29/0/47; memory 39/0/1,873; SQLite
  669/0/4,499 across 60 files.
- All six uncached lint/typecheck targets passed for conformance, store-memory
  and store-sqlite.
- Pinned OpenSpec 1.3.0 strict validation reported the change valid; the
  all-artifact JSON run reported 75 passed and 0 failed.

Nx could not use its sandboxed plugin sockets and ran plugins in-process; every
retained target command still completed with exit 0. The source-specific
`test:conformance` targets remain deferred to Task 7.2 and do not exist. The
full workspace, build, browser, deploy and h2puni SHA gate were skipped as
outside this shared conformance/test-decorator slice and because no commit was
authorized. Task 4.1 remains unchecked pending independent review; Task 4.2 was
not started.

### Task 4.1 Astra repair — independent oracles, durable sequence fault and memory ownership

Dependency cases now pass a structured clone to every `add`, leaving each
complete expected edge independent from the source input. Permanent mutation
faults change the original input ID in place on both real source paths and the
setup-list assertion reports the signed complete-edge replacement from
`dependency-idempotent-original` to `dependency-idempotent-mutated`. Removing
the clone made both source proof suites report `assertion-passed` for that
fault; restoring it returned both suites to passing proof observations.

The ID-keyed fault forwards the first three adds unchanged and checks after
each that its target phase has not been reached. It arms only for the second ID
on the established ordered pair, then removes the original pair and inserts
the second ID through the real dependency port. Both source-owned public lists
therefore report the exact signed original-to-second-ID replacement. Injecting
premature reach on either source failed with `dependency ID fault reached
during setup`; restoration passed both focused suites.

The retained-MAX fault now changes actual allocation state before the real
append: memory resets its adapter-owned `nextSeq` map from retained rows, and
SQLite updates `event_sequencer.next_seq`. Each decorator verifies through the
public range and `latestSeq` APIs that the stored record and returned record
both carry sequence 0, then the shared case's first next-record assertion
reports the exact sequence 2 to 0 change. Disabling either persistence seam
made its proof `assertion-passed`; restoration returned both focused proofs to
passing observations.

Memory base seeding and family companion seeding now share one cleanup owner
for ordinary and proof entry paths. Permanent negatives reject the second
dependency survivor insert. Bypassing that owner produced `closeCalls = 0` in
both paths and replaced the expected aggregate with the lone setup error.
Restored tests close once in both failure paths, retain both setup and cleanup
errors in one `AggregateError`, and leave a successful fixture open until its
single normal teardown.

Fresh terminal evidence after restoration:

- Focused repair proofs: memory dependency 1/0/111 and event 1/0/45; SQLite
  dependency 1/0/143 and event 1/0/53. Memory lifecycle 4/0/43.
- Full uncached targets: conformance 29/0/47; memory 43/0/1,927; SQLite
  669/0/4,514 across 60 files.
- Existing adapter suites: memory source 9/0/153; SQLite dependency/event-log
  16/0/27.
- All six uncached lint/typecheck targets passed for conformance, store-memory
  and store-sqlite.
- Pinned OpenSpec 1.3.0 strict validation reported the change valid; all
  artifacts reported 75 passed and 0 failed.

Task 4.1 stays unchecked for review. The absent source-specific conformance
targets remain owned by Task 7.2. The full workspace, build, browser, deploy
and h2puni SHA gates were skipped; this repair is confined to source
conformance/test seams, and no commit was authorized.

### Task 4.1 Astra repair round 2 — canonical ID-keyed duplicate

The dependency identity fault now models the binding-matrix regression
directly. It forwards the three setup adds unchanged and checks that its phase
has not been reached. At the second-ID operation, memory inserts by ID into its
adapter-owned committed dependency table. SQLite removes the isolated
fixture's pair-unique index and calls the real repository `add`. Neither fault
removes the original edge or overlays the reader.

Before the shared assertion runs, each decorator reads the real public project
list and requires the pair to contain exactly the complete original and
second-ID records. The shared complete-list assertion then reports only the
extra second-ID edge, with all four fields and received `+` direction.

Disabling memory's source-owned ID insertion produced the exact public-state
failure with the complete second-ID edge absent. Disabling SQLite's isolated
index removal produced the same failure after its real add settled as a no-op.
In both focused proof tests, the signed extra-edge diagnostic could no longer
match. Restoring the seams passed memory at 1/0/112 and SQLite at 1/0/144.

Fresh restored verification:

- Complete source-conformance files: memory 22/0/1,730; SQLite 24/0/2,506.
- Existing SQLite dependency repository: 8/0/13.
- Uncached `test` targets for conformance, store-memory and store-sqlite all
  passed; all six uncached lint/typecheck targets also passed.
- Formatting, diff and pinned OpenSpec evidence is recorded in the Task 4.1
  report after the final terminal run.

Task 4.1 remains unchecked for independent review. Task 4.2 is untouched. No
commit or push was performed.

Astra xhigh accepted Task 4.1 at `a192c886` on 2026-09-13 with no Critical,
Important or Minor findings. Its final independent probes confirmed that both
real adapters retain the original and second IDs in source-owned state, expose
both through public reads and fail first at the shared complete-edge assertion.
The reviewer also reran the setup-timing, input-mutation, durable-sequence and
memory-cleanup proofs; 26 focused tests passed with 564 assertions. Task 4.1 is
checked complete and Task 4.2 is next. Reviews:
`/tmp/source-conformance-4-1-astra-review.md`,
`/tmp/source-conformance-4-1-astra-rereview.md` and
`/tmp/source-conformance-4-1-astra-final-review.md`.

### Task 4.2 directory assignment scope and team refusal atomicity

`directory.assign:scope-replace-clear` now establishes three survivor
assignments around one target pair: another item on the same step, another
step on the same item, and another project. After initial assignment,
replacement, and clearing, it compares complete assignment records through
`assignmentsFor`, `assignmentsOf`, and both `assignmentsInProject` results.
Those project results also compare the exact named people implied by the same
assignment state.

`directory.patchTeam:atomic-refusal` establishes two complete teams and two
services. A patch combining `Directory escaped` with an unknown service must
return `unknown_service`; complete team and service lists must still contain
the original target name, ownership, and the second team/service sentinel.

The inventory test was run before registration and failed 0/1/1 with both
case IDs absent (`Expected - 2 / Received + 0`). After registration it passed
1/0/1. Permanent memory and SQLite decorators remain inert through setup and
reach only these named phases:

- `directory.assign:scope-replace-clear:pair-scope` performs a real
  collateral clear of the same-step survivor before the real target
  replacement. The shared complete-state assertion reports the missing
  `work-a-two` / `step-a-dev` / `person-a` assignment.
- `directory.patchTeam:atomic-refusal:early-rename` performs and publicly
  verifies a real name-only patch, then invokes the real combined patch and
  refusal. The shared complete-team assertion reports expected
  `Directory original` and received `Directory escaped` while service
  ownership stays complete.

Removing the collateral clear changed each focused proof from `observed` to
`assertion-passed`. Removing the early rename made each decorator's exact
public-state guard receive `Directory original` where `Directory escaped` was
expected. After restoration the focused memory proof passed 1/0/68 assertions
and SQLite passed 1/0/84.

Fresh restored verification:

- Existing SQLite directory and assignment suites: 15/0/56.
- Complete source-conformance files: memory 29/0/1,816 across two files;
  SQLite 25/0/2,590.
- Uncached targets: conformance 29/0/47, memory 44/0/1,996, SQLite
  670/0/4,599 across 60 files.
- All six lint/typecheck commands passed for conformance, store-memory, and
  store-sqlite.
- Pinned OpenSpec 1.3.0 strict validation reported the change valid; the
  all-artifact JSON run reported 75 passed and 0 failed.

Nx could not create sandboxed plugin-worker sockets and ran plugins in the
main process; the retained target commands completed successfully. The
source-specific `test:conformance` targets remain deferred to Task 7.2 and do
not exist. Full workspace, build, browser, deploy, and the h2puni SHA gate were
skipped because this slice changes shared cases and test-only fault seams and
no commit was authorized. Task 4.2 remains unchecked pending independent
review; Task 4.3 was not started.
