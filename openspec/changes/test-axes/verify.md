# Verification Report

## Task 1.1 — contract and delta validation

| Check                                                                               | Fresh observation                      |
| ----------------------------------------------------------------------------------- | -------------------------------------- |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate test-axes --strict` | Exit 0; `Change 'test-axes' is valid`. |

Proof: copied `specs/test-axes/spec.md` to `/tmp/test-axes-spec-023.md`, deleted only the `#### Scenario: [TEST-AXES-023] ...` heading, then reran strict validation. It exited 1 with `ADDED "Manual dispositions expire for review" must include at least one scenario`. Restored the file from the backup and confirmed `cmp` equality. The working tree was clean before the mutation.

**Change**: `test-axes`
**Verified at**: `2026-09-20`
**Verifier**: Codex executor, attempt `010-3-record-the-decision.whole.20260919T221212Z`

## 1. Structural Validation

- [x] Baseline before this packet: 96 items passed, 0 failed.
- [x] After both changes were written: 98 items passed, 0 failed.

```text
{ "items": 98, "passed": 98, "failed": 0 }
```

The baseline and final count differ by two, exactly the two changes in this packet. OpenSpec validation checks structure; it does not prove that scenario bodies are non-vacuous, requirements are complete, classifications are correct or later checks are enforced.

## 2. Intent Limit

The proposal is below the 400-word limit:

```text
271 openspec/changes/test-axes/proposal.md
```

## 3. Task Completion

- [ ] Implementation tasks remain open by design. This packet records a proposed architectural change and does not implement its rollout slices.

## 4. Delta Spec Sync

| Capability  | Sync status | Note                                                           |
| ----------- | ----------- | -------------------------------------------------------------- |
| `test-axes` | N/A         | Proposed change; nothing is archived or synced by this packet. |

## 5. Failure Proofs

| Check (file)              | Fault injected                                                                      | Test that observed the failure                                                | Result                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `specs/test-axes/spec.md` | Removed the sole `#### Scenario:` heading from `TEST-AXES-023`, leaving its bullets | `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` | Exit 1; `ADDED "Manual dispositions expire for review" must include at least one scenario`; totals 97 passed, 1 failed. Patch: `/tmp/puni-batch1/010-3-record-the-decision.whole.20260919T221212Z/evidence/proof-2-fault.patch`. Failing report: `/tmp/puni-batch1/010-3-record-the-decision.whole.20260919T221212Z/evidence/proof-2-failing.json`. |

Proof: on 2026-09-20, restoring the saved bytes passed `cmp`, and validation returned 98 passed, 0 failed.

The validator does not check GIVEN, WHEN or THEN content; removing those bullets remained valid in the planning probe, so this proof makes no claim that scenario bodies are checked.

## 6. Scenario Identifier Decision

Inherited from the 010.3 planning probe on 2026-09-19 and 2026-09-20; not rerun here: OpenSpec 1.12.0 accepted a scenario title beginning `#### Scenario: [SERVICE-TAXONOMY-001] ...` with the change valid and no issues.

The bracket form is adopted because it is visible in rendered documents, matches the test-title convention exactly, and lives in the title rather than in a comment that a transformation could drop. This settles open item 1 of the code organization design.

## 7. Open Item

Whether `libs/wbs/adapters/store-memory/src/testing/source-conformance.test.ts` should gain a distinguishing suffix remains open and is owned by rollout Task 5, which names the level targets. This packet renames no file and changes no target.

## 8. Executor Checks

All commands below ran against the restored, formatted working tree on 2026-09-20.

```text
$ OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 status --change test-axes --json
intent done; specs done; design ready; tasks done; verify done
isPlanningComplete false; isComplete false

$ OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json
{ "items": 98, "passed": 98, "failed": 0 }
strict single-report predicate: passed
baseline + 2 predicate: passed (96 + 2 = 98)

$ NX_DAEMON=false bunx nx format:check --all
exit 0; no output
```

The absent `design.md` and false planning flags are expected for this change. The whole `tool-devsync:test` target and the host gate remain pending planner verification because this executor may not write Git objects or use the host gate.

## Decision

- [ ] Archive readiness is outside this packet. The change remains proposed until its implementation tasks and evidence are complete.

## 9. Additive Level-Target Amendment

Slice S amended the change's own intent before implementation: the proposal now permits additive test targets and reporting while forbidding any rename, removal or repurposing of an existing target. The level-selection requirement now says that classification repurposes no existing target and that a level target is added alongside the targets already present.

The strict OpenSpec totals did not move:

| Observation                       | Items | Passed | Failed |
| --------------------------------- | ----: | -----: | -----: |
| Before the amendment              |   103 |    103 |      0 |
| After the amendment               |   103 |    103 |      0 |
| After the restored negative proof |   103 |    103 |      0 |

The proposal remains below the intent limit: `wc -w openspec/changes/test-axes/proposal.md` printed `285`.

| Check (file)              | Fault injected                                                                                                 | Test that observed the failure                                                | Result                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `specs/test-axes/spec.md` | Removed only the `#### Scenario: [TEST-AXES-023] A manual disposition is overdue` heading, leaving its bullets | `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` | Exit 1; 103 items, 102 passed, 1 failed; `ADDED "Manual dispositions expire for review" must include at least one scenario`. Patch: `s4-manual-disposition-scenario-heading.patch` in the attempt's evidence directory. Failing report: `s4-manual-disposition-scenario-heading.failing` in the attempt's evidence directory. Standard error: `s4-manual-disposition-scenario-heading.stderr` in the attempt's evidence directory. |

Proof: on 2026-09-20, the fault above produced the named structured error and exit 1. Restoring the saved bytes passed `cmp`, and strict validation then returned 103 passed, 0 failed.

## 10. Level-Selection Table

Slice A added the typed declarations for the first three level targets and the inventory checks for their two adopted projects. It did not add or modify an Nx target.

| Command                                                                                                                    | Exit | Observation                                                    |
| -------------------------------------------------------------------------------------------------------------------------- | ---: | -------------------------------------------------------------- |
| `bun --version`                                                                                                            |    0 | `1.4.2`                                                        |
| `bun test --help \| grep -c -- "--reporter-outfile"`                                                                       |    0 | `2` matching help lines                                        |
| `test ! -e tools/tool-devsync/src/test-levels.ts`                                                                          |    0 | The production module was absent before the test was written.  |
| `cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts src/test-levels.test.ts` before the module existed |    1 | `Cannot find module './test-levels'`; 0 pass, 1 fail, 1 error. |
| The same focused test after the module was added                                                                           |    0 | 5 pass, 0 fail; `Ran 5 tests across 1 file.`                   |

| Check                  | Fault injected                                                     | Test that observed the failure                                                       | Result                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Level-table precedence | Deleted the `conformanceFiles.includes(...)` branch from `levelOf` | `resolves the plain and the database conformance suffixes through target membership` | Exit 1; received `api` and `unit` in place of the two expected `conformance` values. Patch: `A-1.patch`; output: `A-1.failing`. Restoring the saved bytes passed `cmp`; the focused file then passed 5 of 5. |
| Unknown-level refusal  | Replaced `levelOf`'s final throw with `return 'unit'`              | `refuses a file that matches no row`                                                 | Exit 1; `Received function did not throw` and `Received value: "unit"`. Patch: `A-2.patch`; output: `A-2.failing`. Restoring the saved bytes passed `cmp`; the focused file then passed 5 of 5.              |
| Outside-root inventory | Deleted the one `KNOWN_OUTSIDE_TEST_ROOTS` entry                   | `keeps every test file outside a declared test root on the known list`               | Exit 1; named `libs/wbs/application/core/testing/portable-composition.spec.ts`. Patch: `A-3.patch`; output: `A-3.failing`. Restoring the saved bytes passed `cmp`; the focused file then passed 5 of 5.      |

Proof: on 2026-09-20, each fault above failed its named test with the recorded diagnostic. Each restoration passed `cmp`, and the complete focused file passed before the next fault was injected.

The restored, owned-path tree was then checked on 2026-09-20:

| Command                                                                                                                                                                | Exit | Observation                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---: | ----------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run tool-devsync:typecheck`                                                                                                                   |    0 | Nx reported `Successfully ran target typecheck for project tool-devsync`.                       |
| `NX_DAEMON=false bunx nx run tool-devsync:lint`                                                                                                                        |    0 | Nx reported `Successfully ran target lint for project tool-devsync`; no ESLint diagnostic.      |
| `NX_DAEMON=false bunx nx run tool-devsync:build`                                                                                                                       |    0 | Nx reported `Successfully ran target build for project tool-devsync and 4 tasks it depends on`. |
| `GSETTINGS_BACKEND=memory bunx prettier --check tools/tool-devsync/src/test-levels.ts tools/tool-devsync/src/test-levels.test.ts openspec/changes/test-axes/verify.md` |    0 | `All matched files use Prettier code style!`                                                    |
| `NX_DAEMON=false bunx nx format:check --all`                                                                                                                           |    0 | No output.                                                                                      |
| `cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts src/test-levels.test.ts`                                                                       |    0 | 5 pass, 0 fail; `Ran 5 tests across 1 file.`                                                    |
| Strict `OPENSPEC_TELEMETRY=0` single-report validation block                                                                                                           |    0 | 103 items, 103 passed, 0 failed; report: `openspec-validation.7v51FB.json`.                     |

## Slice B — the API and unit levels run alone and report as JUnit

Executor attempts `110-1-test-axes.B.*` and `110-1-test-axes.B-finish.*`, then the planner. The executor did B0 to B10 and faults B-1 to B-8; both attempts then stopped on B-9, having changed the `cwd` of the aggregate `wbs-core:test` target (the first identical line in the file) instead of `wbs-core:test:unit`, so the named case rightly stayed green. The planner injected B-9 with a JSON edit of `targets["test:unit"].options.cwd`, ran B12, wrote the nine `Proof:` comments and this record.

- B4, tests first: 7 pass, 2 fail, as prescribed. B9, implemented: the focused file passes 9 of 9. B8: both selectors ran 535 tests across 52 files. B10: `wbs-store-sqlite:test:api`, `wbs-store-sqlite:test:unit` and `wbs-core:test:unit` passed and wrote their JUnit reports under `tmp/junit/`, which is ignored.
- B12: `selects each terminal source file exactly and keeps normal test inclusion`: 1 pass, 0 fail, 18 filtered out.

| Row | Fault                                                                  | Named failing test                                                                     | Observed                                                                                                                                | Evidence (basenames, first attempt's evidence directory unless said) |
| --- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| B-1 | `test:api`'s exclusion of `source-conformance.db.test.ts` removed      | `collects exactly the files of its own level`                                          | `wbs-store-sqlite:test:api is declared api and collects src/testing/source-conformance.db.test.ts, which is conformance`                | `B-1.patch`, `B-1.failing`                                           |
| B-2 | `--reporter=junit` removed from `wbs-core:test:unit`                   | `writes a JUnit report where the declaration says`                                     | `wbs-core:test:unit does not pass --reporter=junit`                                                                                     | `B-2.patch`, `B-2.failing`                                           |
| B-3 | `--test-name-pattern=NO_MATCH` added to `test:api`                     | both cases                                                                             | `command shape: a declared level target may not pass --test-name-pattern=NO_MATCH; only coverage and JUnit reporting flags are allowed` | `B-3.patch`, `B-3.failing`                                           |
| B-4 | selector replaced by `find src --bogus-flag`                           | `collects exactly the files of its own level`                                          | throws `the file selector failed` before the array assertion                                                                            | `B-4.patch`, `B-4.failing`                                           |
| B-5 | `AGGREGATE_TARGETS` emptied                                            | `accounts for every test-running target as a level, an aggregate or a known exception` | `wbs-core:test` and `wbs-store-sqlite:test` named as unaccounted                                                                        | `B-5.patch`, `B-5.failing`                                           |
| B-6 | `! -name 'assignment-scope.db.test.ts'` added to `test:api`'s selector | `collects exactly the files of its own level`                                          | `wbs-store-sqlite:test:api is declared api and does not collect src/assignment-scope.db.test.ts, which is api`                          | `B-6.patch`, `B-6.failing`                                           |
| B-7 | only the reporter outfile's basename changed to `wrong.xml`            | `writes a JUnit report where the declaration says`                                     | `wbs-core:test:unit does not write ../../../../tmp/junit/wbs-core.unit.xml`                                                             | `B-7.patch`, `B-7.failing`                                           |
| B-8 | only the `mkdir` directory changed to `../../../../tmp/wrong`          | `writes a JUnit report where the declaration says`                                     | `wbs-core:test:unit does not create ../../../../tmp/junit`                                                                              | `B-8.patch`, `B-8.failing`                                           |
| B-9 | only `wbs-core:test:unit`'s `cwd` changed to `libs/wbs/application`    | `collects exactly the files of its own level`                                          | `wbs-core:test:unit runs in libs/wbs/application, not libs/wbs/application/core`; 8 pass, 1 fail; restored with `cmp`, then 9 pass      | planner's run; not kept with the executor's evidence                 |

Planner's whole-suite run after slice B, 2026-09-20: `tool-devsync:test` first FAILED on a pin the packet did not name: `workspace-inventory.test.ts` expected 163 parent-relative rows and received 166, one for each of the three level targets' JUnit paths. Re-pinned with the observed failure beside it; the namespacing digest then moved because of those comment lines and was re-pinned too. After both: `tool-devsync` test, typecheck and lint succeed; `committed-target-facts.test.ts` 2 pass (the new `test:api` target default does not disturb any pinned fact); `wbs-store-sqlite:test:api`, `wbs-store-sqlite:test:unit` and `wbs-core:test:unit` succeed; format check clean.

## Slice C — scenario identifiers and citations

Executor attempt `110-1-test-axes.C.20260920T163528Z` allocated identifiers to the three scenarios of `project-assignment-reads` and cited them in the three existing tests that prove those scenarios. The Unit test carries a citation although T1 does not require one, because the scenario has no other proving level. `tasks.md` remains unticked: task 2.2 is larger than this increment.

| Command / observation                                     | Exit | Result                                                                                          |
| --------------------------------------------------------- | ---: | ----------------------------------------------------------------------------------------------- |
| Focused devsync baseline                                  |    0 | 9 pass, 0 fail; `Ran 9 tests across 1 file.` (`C0-test-levels.log`)                             |
| Strict OpenSpec baseline                                  |    0 | 103 items, 103 passed, 0 failed (`openspec-validation.C0.QEkKAj.json`)                          |
| `bun test src/assignment-scope.db.test.ts` baseline       |    0 | 2 pass, 0 fail; `Ran 2 tests across 1 file.` (`C0-assignment-scope.log`)                        |
| `bun test src/service/work-item.service.test.ts` baseline |    0 | 98 pass, 0 fail; `Ran 98 tests across 1 file.` (`C0-work-item-service.log`)                     |
| Focused devsync red after adding the five cases           |    1 | 12 pass, 2 fail; both real-spec cases named the three unidentified scenarios (`C3-red.failing`) |
| Three identifier-filtered test runs                       |    0 | Each ran 1 test across 1 file with 0 fail (`C7-001.log`, `C7-002.log`, `C7-003.log`)            |
| Both complete cited test files                            |    0 | Baselines unchanged: 2 and 98 tests (`C7-assignment-scope.log`, `C7-work-item-service.log`)     |
| Focused devsync after allocation                          |    0 | 14 pass, 0 fail; `Ran 14 tests across 1 file.` (`C7-test-levels.log`)                           |
| Strict OpenSpec validation after allocation               |    0 | Totals unchanged: 103 items, 103 passed, 0 failed (`openspec-validation.C8.0VgaTu.json`)        |

| Row | Fault                                                              | Named failing test                                             | Observed                                                                                                                | Evidence                   |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| C-1 | Deleted the no-scenario guard from `assertSpecification`           | `refuses a specification that holds no scenario`               | Exit 1; `Received function did not throw`; `Received value: []`                                                         | `C-1.patch`, `C-1.failing` |
| C-2 | Deleted the unidentified-scenario guard from `scenarioIdentifiers` | `refuses a specification whose scenario carries no identifier` | Exit 1; `Received function did not throw`; `Received value: [ "DEMO-001" ]`                                             | `C-2.patch`, `C-2.failing` |
| C-3 | Removed `[PROJECT-ASSIGNMENT-READS-002]` from the specification    | `leaves no scenario without an identifier`                     | Exit 1; received `Assignment write among unrelated projects`; `allocates the identifiers once and in order` also failed | `C-3.patch`, `C-3.failing` |
| C-4 | Deleted the no-requirement guard from `assertSpecification`        | `refuses a specification that holds no requirement`            | Exit 1; `Received function did not throw`; `Received value: []`                                                         | `C-4.patch`, `C-4.failing` |

Proof: on 2026-09-20, every fault above failed its named test with the recorded diagnostic. Each passing version was restored by copying the retained bytes, each restoration passed `cmp`, and the complete focused file then passed 14 of 14 before the next fault.

Pending planner verification: the whole `tool-devsync:test` target because its namespacing case writes Git objects; `wbs-store-sqlite:test`, `wbs-core:test` and the root `bun run test:unit` aggregates; and `bin/h2puni-gate.sh <sha>`, which is unavailable on this machine.

Final restored-tree checks:

| Command                                                      | Exit | Result                                                                                                           |
| ------------------------------------------------------------ | ---: | ---------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run tool-devsync:typecheck`         |    0 | Nx reported `Successfully ran target typecheck for project tool-devsync` (`C10-typecheck.log`)                   |
| `NX_DAEMON=false bunx nx run tool-devsync:lint`              |    0 | Nx reported `Successfully ran target lint for project tool-devsync`; no ESLint diagnostic (`C10-lint.log`)       |
| `NX_DAEMON=false bunx nx run tool-devsync:build`             |    0 | Nx reported `Successfully ran target build for project tool-devsync and 4 tasks it depends on` (`C10-build.log`) |
| Prettier `--write` then `--check` over the six Slice C paths |    0 | `All matched files use Prettier code style!` (`C10-prettier-write.log`, `C10-prettier-check.log`)                |
| `NX_DAEMON=false bunx nx format:check --all`                 |    0 | Status marker `status=0` (`C10-format-check.log`)                                                                |
| Focused devsync file                                         |    0 | 14 pass, 0 fail; `Ran 14 tests across 1 file.` (`C10-test-levels.log`)                                           |

Planner, after slice C, 2026-09-20: replayed C-4 outside the sandbox (the requirement-heading guard removed from `test-levels.ts`): `refuses a specification that holds no requirement` failed with `Expected substring: "no ### Requirement:"` against `Received function did not throw`, 13 pass and 1 fail; restored byte for byte. `tool-devsync` test, typecheck and lint succeed (neither whole-suite pin moved); `wbs-store-sqlite:test:api`, `wbs-store-sqlite:test:unit` and `wbs-core:test:unit` succeed with the three cited titles; format check clean; OpenSpec 103 of 103.

## Slice D — strict JUnit reading and the scenario join

Executor attempt `110-1-test-axes.D.20260920T173907Z` added a JUnit reader backed by the already-declared `saxes` 6.0.0 parser and joined only passing cited tests to scenario identifiers. No dependency file was changed and no install command was run.

| Command / observation                                                     | Exit | Result                                                                                                            |
| ------------------------------------------------------------------------- | ---: | ----------------------------------------------------------------------------------------------------------------- |
| Focused devsync baseline                                                  |    0 | 14 pass, 0 fail; `Ran 14 tests across 1 file.` (`D0-baseline.log`)                                                |
| Focused devsync after adding the forty-one cases but before their exports |    1 | Import-resolution failure: `Export named 'passedCitations' not found`; 0 pass, 1 fail, 1 error (`D2-red.failing`) |
| Focused devsync after implementing the reader and join                    |    0 | 55 pass, 0 fail; `Ran 55 tests across 1 file.` (`D4-green.log`)                                                   |

| Row  | Fault                                                    | Named failing test                                                                                        | Observed                                                                                                                          | Evidence                     |
| ---- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| D-1  | Deleted the passing-outcome guard from `passedCitations` | `does not count a skipped or a failing test as coverage`                                                  | The uncovered list lost `DEMO-001` and `DEMO-002`; `does not read a citation out of a comment or out of failure text` also failed | `D-1.patch`, `D-1.failing`   |
| D-2  | Deleted the outcome assignment in `readJUnitReport`      | `reads the report Bun really writes, nesting, escapes and outcomes included`                              | Skipped and failed cases were received as `passed`; both coverage-outcome cases also failed                                       | `D-2.patch`, `D-2.failing`   |
| D-3  | Deleted the retained parser-error rethrow                | `refuses a document with a second root element`                                                           | The named case returned a passing citation instead of throwing; nineteen other malformed-document cases also failed               | `D-3.patch`, `D-3.failing`   |
| D-4  | Replaced the doctype handler with a no-op                | `refuses a document type declaration`                                                                     | `Received function did not throw`                                                                                                 | `D-4.patch`, `D-4.failing`   |
| D-5  | Replaced the CDATA handler with a no-op                  | `refuses a CDATA section`                                                                                 | `Received function did not throw`; the outside-root CDATA case also failed                                                        | `D-5.patch`, `D-5.failing`   |
| D-6  | Replaced the processing-instruction handler with a no-op | `refuses a processing instruction after the declaration`                                                  | `Received function did not throw`                                                                                                 | `D-6.patch`, `D-6.failing`   |
| D-7  | Deleted the qualified-element guard                      | `refuses a namespaced element name`                                                                       | Received the later unsupported-element error instead of the qualified-name error                                                  | `D-7.patch`, `D-7.failing`   |
| D-8  | Deleted the `xmlns` attribute guard                      | `refuses an xmlns attribute`                                                                              | `Received function did not throw`                                                                                                 | `D-8.patch`, `D-8.failing`   |
| D-9  | Deleted the qualified-attribute guard                    | `refuses a namespaced attribute name`                                                                     | `Received function did not throw`                                                                                                 | `D-9.patch`, `D-9.failing`   |
| D-10 | Deleted the `testsuites` root guard                      | `refuses a report whose root is not testsuites`                                                           | Received the later testcase-parent error instead of the root error                                                                | `D-10.patch`, `D-10.failing` |
| D-11 | Deleted the testcase-parent guard                        | `refuses a testcase whose parent is not a testsuite`                                                      | `Received function did not throw`; the nested-testcase case also failed                                                           | `D-11.patch`, `D-11.failing` |
| D-12 | Deleted the outcome-parent guard                         | `refuses an outcome element outside a testcase`                                                           | Received the later `holds no testcase` error instead of the parent error                                                          | `D-12.patch`, `D-12.failing` |
| D-13 | Deleted the unsupported-element-inside-testcase guard    | `refuses an unsupported element inside a testcase`; `refuses a testcase hidden inside an outcome element` | Both named tests returned a passing case instead of throwing                                                                      | `D-13.patch`, `D-13.failing` |
| D-14 | Deleted the missing-name guard                           | `refuses a testcase that names no test`                                                                   | Returned a case whose `name` was `undefined`                                                                                      | `D-14.patch`, `D-14.failing` |
| D-15 | Deleted the missing-file guard                           | `refuses a testcase that names no file`                                                                   | Returned a case whose `file` was `undefined`                                                                                      | `D-15.patch`, `D-15.failing` |
| D-16 | Deleted the empty-report guard                           | `refuses a report that holds no testcase`                                                                 | `Received value: []`                                                                                                              | `D-16.patch`, `D-16.failing` |
| D-17 | Replaced the close-tag stack pop with a no-op            | `reads an identifier out of a passing test title`                                                         | Threw that a later testcase was inside the still-open testcase; four other cases also failed                                      | `D-17.patch`, `D-17.failing` |

Proof: on 2026-09-20, every fault above failed at the named assertion about its guard. Each passing version was restored by copying retained bytes, every restoration passed `cmp`, and the complete focused file then passed 55 of 55 before the next fault.

Pending planner verification: the whole `tool-devsync:test` target because its namespacing case writes Git objects; `wbs-store-sqlite:test`, `wbs-core:test` and the root `bun run test:unit` aggregates; and `bin/h2puni-gate.sh <sha>`, which is unavailable on this machine. Slice D neither discovers nor updates whole-suite pins.

Final restored-tree checks:

| Command                                                        | Exit | Result                                                                                                          |
| -------------------------------------------------------------- | ---: | --------------------------------------------------------------------------------------------------------------- |
| `NX_DAEMON=false bunx nx run tool-devsync:typecheck`           |    0 | Nx reported `Successfully ran target typecheck for project tool-devsync` (`D6-typecheck.log`)                   |
| `NX_DAEMON=false bunx nx run tool-devsync:lint`                |    0 | Nx reported `Successfully ran target lint for project tool-devsync`; no ESLint diagnostic (`D6-lint.log`)       |
| `NX_DAEMON=false bunx nx run tool-devsync:build`               |    0 | Nx reported `Successfully ran target build for project tool-devsync and 4 tasks it depends on` (`D6-build.log`) |
| Prettier `--write` then `--check` over the three Slice D paths |    0 | `All matched files use Prettier code style!` (`D6-prettier-write.log`, `D6-prettier-check.log`)                 |
| `NX_DAEMON=false bunx nx format:check --all`                   |    0 | Status marker `status=0` (`D6-format-check.log`)                                                                |
| Focused devsync file                                           |    0 | 55 pass, 0 fail; `Ran 55 tests across 1 file.` (`D6-focused-final.log`)                                         |
| Strict `OPENSPEC_TELEMETRY=0` single-report validation block   |    0 | 103 items, 103 passed, 0 failed (`openspec-validation.D6.*.json`)                                               |

Planner, after slice D, 2026-09-20: replayed D-13 outside the sandbox (the `if (open.includes('testcase') && !OUTCOME_ELEMENT.has(tag.name))` block deleted from `readJUnitReport`): both `refuses an unsupported element inside a testcase` and `refuses a testcase hidden inside an outcome element` failed, 53 pass and 2 fail; restored byte for byte. `tool-devsync` test, typecheck and lint succeed with the new file staged (neither whole-suite pin moved); format check clean. `saxes` 6.0.0 was already declared and locked; no install ran.

## Slice E — trusted report provenance and the coverage table

Executor attempt `110-1-test-axes.E.20260920T180131Z` bound each report to a declared level target, its collected files and the modification times of the test files it names, then added the hand-run scenario coverage command. `tasks.md` remains unticked: tasks 2.1 and 2.2 are each larger than this increment.

| Command / observation                                               | Exit | Result                                                                                                               |
| ------------------------------------------------------------------- | ---: | -------------------------------------------------------------------------------------------------------------------- |
| Focused devsync baseline                                            |    0 | 55 pass, 0 fail; `Ran 55 tests across 1 file.` (`E0-baseline.log`)                                                   |
| Focused devsync after adding the two cases but before their exports |    1 | Import-resolution failure: `Export named 'assertReportCovers' not found`; 0 pass, 1 fail, 1 error (`E2-red.failing`) |
| Focused devsync after implementing provenance                       |    0 | 57 pass, 0 fail; `Ran 57 tests across 1 file.` (`E4-green.log`)                                                      |
| `wbs-store-sqlite:test:api`                                         |    0 | 656 pass across 56 files; wrote `tmp/junit/wbs-store-sqlite.api.xml` (`E6-api.log`)                                  |
| `wbs-store-sqlite:test:unit`                                        |    0 | 35 pass across 8 files; wrote `tmp/junit/wbs-store-sqlite.unit.xml` (`E7-sqlite-unit-baseline.log`)                  |
| `wbs-core:test:unit`                                                |    0 | 535 pass across 52 files; wrote `tmp/junit/wbs-core.unit.xml` (`E6-core-unit.log`)                                   |
| Coverage command                                                    |    0 | Three covered rows, all `yes` (`coverage-table.md`)                                                                  |

```text
| Scenario | Covered by a passing citing test |
| --- | --- |
| PROJECT-ASSIGNMENT-READS-001 | yes |
| PROJECT-ASSIGNMENT-READS-002 | yes |
| PROJECT-ASSIGNMENT-READS-003 | yes |
```

| Row           | Fault                                                                                                     | Command or assertion that observed it | Observed                                                                                      | Evidence                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| E-1           | Removed `[PROJECT-ASSIGNMENT-READS-001]` from the passing API test title and regenerated the API report   | Coverage command                      | Exit 0; scenario 001 was `**no**`, while 002 and 003 stayed `yes`                             | `E-1.patch`, `E-1.failing`                                               |
| E-2           | Changed that API test to `it.skip`, then regenerated the API report                                       | Coverage command                      | Exit 0; scenario 001 was `**no**`, while 002 and 003 stayed `yes`                             | `E-2.patch`, `E-2.failing`                                               |
| E-3           | Replaced the API report with the SQLite Unit report                                                       | Coverage command                      | Exit nonzero; named all seven foreign Unit files and said the API report was from another run | `E-3.patch`, `E-3.failing`                                               |
| E-4           | Replaced the API report with a well-formed report holding no testcase                                     | Coverage command                      | Exit nonzero; `the JUnit report:1:0: holds no testcase`                                       | `E-4.patch`, `E-4.failing`                                               |
| E-5           | Appended a trailing newline to `assignment-scope.db.test.ts` after its report was written                 | Coverage command                      | Exit nonzero; named the stale file and said to rerun `wbs-store-sqlite:test:api`              | `E-5.patch`, `E-5.failing`                                               |
| E-6-absent    | Moved the core Unit report aside                                                                          | Coverage command                      | Exit nonzero; no readable report, with `ENOENT` as the cause                                  | `E-6-absent.patch`, `E-6-absent.fault.sh`, `E-6-absent.failing`          |
| E-6-directory | Replaced the core Unit report path with a directory                                                       | Coverage command                      | Exit nonzero; no readable report, with `EISDIR` as the cause                                  | `E-6-directory.patch`, `E-6-directory.fault.sh`, `E-6-directory.failing` |
| E-7           | Invoked the coverage command with no arguments                                                            | Coverage command                      | Exit nonzero; printed `usage: scenario-coverage-cli.ts <capability> <project:target>…`        | `E-7.patch`, `E-7.failing`                                               |
| E-8           | Invoked the coverage command with only the capability                                                     | Coverage command                      | Exit nonzero; printed the same usage message                                                  | `E-8.patch`, `E-8.failing`                                               |
| E-9           | Named aggregate target `wbs-core:test`                                                                    | Coverage command                      | Exit nonzero; `wbs-core:test is not a declared level target`                                  | `E-9.patch`, `E-9.failing`                                               |
| E-10          | Structurally deleted `targets["test:unit"].options.command` from `libs/wbs/application/core/project.json` | Coverage command                      | Exit nonzero; `wbs-core:test:unit is not declared in its project manifest`                    | `E-10.patch`, `E-10.failing`                                             |

Proof: on 2026-09-20, every fault above produced the recorded outcome. Every mutated file was restored from retained passing bytes and passed `cmp` before its assertions; after each proof, all three declared targets regenerated their reports and the coverage command printed the same three-row all-`yes` table.

Findings retained from the packet: only three test levels and two projects are adopted; the level targets are not in the gate; `assertReportIsCurrent` is an mtime heuristic over named test files rather than a content binding; the JUnit reader trusts `saxes` for XML well-formedness and validates only the documented Bun-report structure; and the new untracked CLI prevents the namespacing index check from passing until the planner stages it. The section 7 open item is answered: `source-conformance.test.ts` needs no distinguishing suffix, because row 2 of the level table resolves it through target membership and the isolation case exercises the real target.

Pending planner verification: the whole `tool-devsync:test` target because its namespacing case writes Git objects and the new CLI is untracked; `wbs-store-sqlite:test`, `wbs-core:test`, the root `bun run test:unit`, the two forbidden frontend test targets, and `bin/h2puni-gate.sh <sha>`. Slice E neither discovers nor updates whole-suite pins.

Final restored-tree checks:

| Command                                                                                          | Exit | Result                                                                                                          |
| ------------------------------------------------------------------------------------------------ | ---: | --------------------------------------------------------------------------------------------------------------- |
| `cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts src/test-levels.test.ts` |    0 | 57 pass, 0 fail; `Ran 57 tests across 1 file.` (`E9-focused.log`)                                               |
| `NX_DAEMON=false bunx nx run tool-devsync:typecheck`                                             |    0 | Nx reported `Successfully ran target typecheck for project tool-devsync` (`E9-typecheck.log`)                   |
| `NX_DAEMON=false bunx nx run tool-devsync:lint`                                                  |    0 | Nx reported `Successfully ran target lint for project tool-devsync`; no ESLint diagnostic (`E9-lint.log`)       |
| `NX_DAEMON=false bunx nx run tool-devsync:build`                                                 |    0 | Nx reported `Successfully ran target build for project tool-devsync and 4 tasks it depends on` (`E9-build.log`) |
| Focused `workspace-targets.test.ts` source-conformance case                                      |    0 | 1 pass, 0 fail, 18 filtered out (`E9-workspace-target.log`)                                                     |
| `committed-target-facts.test.ts`                                                                 |    0 | 2 pass, 0 fail (`E9-committed-target-facts.log`)                                                                |
| `bun test src/assignment-scope.db.test.ts`                                                       |    0 | 2 pass, 0 fail (`E9-assignment-scope.log`)                                                                      |
| `bun test src/service/work-item.service.test.ts`                                                 |    0 | 98 pass, 0 fail (`E9-work-item-service.log`)                                                                    |
| Strict `OPENSPEC_TELEMETRY=0` single-report validation block                                     |    0 | 103 items, 103 passed, 0 failed (`openspec-validation.E9.W2Ubia.json`)                                          |
| Prettier `--check` over the twelve cumulative paths                                              |    0 | `All matched files use Prettier code style!` (`E9-prettier-check.log`)                                          |
| `NX_DAEMON=false bunx nx format:check --all`                                                     |    0 | Status marker `status=0` (`E9-format-check.log`)                                                                |
| Coverage command                                                                                 |    0 | Three rows, all `yes` (`E9-coverage-final.log`)                                                                 |

Planner, after slice E, 2026-09-20, on the production path and outside the sandbox: ran `wbs-store-sqlite:test:api`, `wbs-store-sqlite:test:unit` and `wbs-core:test:unit` uncached (fresh reports under the ignored `tmp/junit/`), then `bun tools/tool-devsync/src/scenario-coverage-cli.ts project-assignment-reads wbs-store-sqlite:test:api wbs-store-sqlite:test:unit wbs-core:test:unit`: all three scenarios `yes`. Negative: with `[PROJECT-ASSIGNMENT-READS-003]` removed from the unit test's title and `wbs-core:test:unit` rerun, the same command printed `PROJECT-ASSIGNMENT-READS-003 | **no**` (it reports and exits zero by design in this increment); title restored byte for byte, target rerun, row back to `yes`. `tool-devsync` test, typecheck and lint succeed with the new file staged; format check clean; OpenSpec 103 of 103 in this clone.

# B3 allocator continuation — 2026-10-09

This continuation adds the first checked-in allocation journal with 73 imported IDs from the active `project-assignment-reads`, `service-taxonomy` and `test-axes` specs. The existing three project-assignment tests already cite `PROJECT-ASSIGNMENT-READS-001` through `003` (Slice C). The `scenario` CLI returns proposed journal/spec edits for import and allocation, and validates one selected spec; it writes neither artifact. Rename events retain the ID and record the prior title and revision; split events issue new IDs with a predecessor. A retired ID stays reserved. The derived index is the only current identity view.

| Check                                                                                                                                                  | Fresh observation                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test src/rules/scenarios.test.ts` in the Burokrat CLI directory                                                                                   | Exit 0; 10 pass, 0 fail, 24 assertions.                                                                                                                                                           |
| `bunx tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json`                                                                 | Exit 0.                                                                                                                                                                                           |
| `bun .../cli/src/cli.ts scenario validate . <spec>` for each of the three adopted specs                                                                | Each exited 0 with `{"unidentified":[]}`.                                                                                                                                                         |
| `bunx nx run wbs-store-sqlite:test:api`                                                                                                                | 1,171 pass and 3 fail. All three failures are `EPERM: operation not permitted, write` in `src/testing/write-lock-holder.ts` under this sandbox; a clean API report is not yet proven here.        |
| `bunx nx run wbs-store-sqlite:test:unit`                                                                                                               | Exit 0; 40 pass, 0 fail across 9 files.                                                                                                                                                           |
| `bunx nx run wbs-core:test:unit`                                                                                                                       | Exit 0; 846 pass, 0 fail across 87 files.                                                                                                                                                         |
| `bun test src/rules/scenarios.test.ts src/rules/rules.test.ts src/cli.test.ts` in the Burokrat CLI directory                                           | 70 pass, 17 fail across 3 files. The 17 rule failures reproduce the clean baseline’s 17 failures, mostly missing trusted runtime configuration in K2/K3/K4/K5/K6/F1; the new scenario tests pass. |
| `bun tools/tool-devsync/src/scenario-coverage-cli.ts project-assignment-reads wbs-store-sqlite:test:api wbs-store-sqlite:test:unit wbs-core:test:unit` | Exit 0; the three `PROJECT-ASSIGNMENT-READS` rows printed `yes`. This joins a failed API target, so it is a provisional table, not clean certifying evidence.                                     |

Negative proof: the production CLI case `production CLI refuses an identified scenario without imported provenance` passed with exit 1 and `EXAMPLE-001`. Replacing the refusal branch with `continue` made that case fail: expected CLI exit 1, received 0. The source was restored. The journal continuation unit test rejects removal of a retirement tombstone or rewrite of an earlier event when supplied a trusted prior journal. It does not yet exercise a production CLI candidate/base boundary; that integration remains open.

The first coverage table from the earlier pilot was three `yes` rows for `PROJECT-ASSIGNMENT-READS-001` to `003` (Slice E). A fresh join prints the same rows, but the API target did not pass in this sandbox; the citation-removal negative remains historical. This continuation does not close task 2.2: the specifications-family rule path, canonical whole-tree spec selection, candidate/base journal continuity and full production negatives still need implementation.

## B3 duplicate-ID correction — 2026-10-09

The production `scenario import` and `scenario validate` commands now reject two headings with the same already-imported ID in one spec. Previously both exited 0 because the importer skipped each heading already present in the journal and the validator checked them independently. The shared heading parser now refuses the second occurrence before either command can accept it.

| Check                                                                                  | Fresh observation                             |
| -------------------------------------------------------------------------------------- | --------------------------------------------- |
| `bun test src/rules/scenarios.test.ts` in Burokrat CLI                                 | Exit 0; 13 pass, 0 fail, 31 assertions.       |
| `bunx tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json` | Exit 0.                                       |
| `bunx eslint` on the two changed scenario source files                                 | Exit 0.                                       |
| `bunx prettier --check` on the two changed scenario source files                       | Exit 0; all matched files use Prettier style. |

Proof: before the duplicate-ID guard, the production CLI test failed because `scenario import` exited 0 with two `EXAMPLE-001` headings and an existing import event. Reordering the same test showed `scenario validate` also exited 0. With the guard in place, both CLI calls exit 1 and name `duplicate scenario identifier: EXAMPLE-001`. Replacing the guard with `if (false)` reproduced the validator's exit-0 failure, then restoring it returned the focused suite to 13 passes.

The source-path proof was corrected: a production CLI negative rejects `openspec/specs/example/not-spec.md` at the `SourcePath` input boundary. The direct importer has its own guard; replacing that guard with `if (false)` made its negative accept the invalid source and emit an `EXAMPLE-001` import event. The guard was restored. Task 2.2 remains open for trusted base integration, whole-tree selection, citation-removal proof and a clean API target.

### B3 external boundary matrix and ordinal continuation

Two further defects emerged from production CLI negatives. `EXAMPLE-DETAIL-001` was accepted as an `example` ID because `startsWith('EXAMPLE-')` admitted another namespace after the hyphen. The derived index now checks a numeric suffix. A scenario named `constructor` inherited a function from `Object.prototype` during predecessor lookup; allocation now reads only own predecessor keys. The allocator and the report join accept ordinal 1000 and later. The journal decoder's schema does not cap the ID width; the old three-digit regular expressions in the allocator, CLI predecessor selector and report join were widened consistently.

| Fault injected                                                                         | Named negative observed with the fault                                                                               |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Skip journal index derivation after valid JSON/schema decode                           | Failed: expected `malformed scenario journal`, received raw `scenario identifier was already reserved: EXAMPLE-001`. |
| Remove the numeric suffix test for an `example` event with `EXAMPLE-DETAIL-001`        | Failed: expected namespace mismatch, received `scenario identifier lacks current allocator provenance: EXAMPLE-001`. |
| Disable import collision check for the same ID with another title                      | Failed: expected exit 1, received 0.                                                                                 |
| Disable predecessor check for `EXAMPLE-999`                                            | Failed: expected exit 1, received 0.                                                                                 |
| Return from the usage branch for unsupported action and predecessor argument on import | Each failed: expected exit 1, received 0.                                                                            |
| Disable empty-allocation refusal                                                       | Failed: expected exit 1, received 0.                                                                                 |
| Return an empty string after missing or unreadable journal read                        | Both failed: expected `ENOENT` or `EISDIR`, received malformed JSON instead.                                         |
| Read an inherited predecessor for the ordinary title `constructor`                     | Failed: expected exit 0, received 1 and `unknown or inactive scenario predecessor: function Object()`.               |
| Skip CLI source-path validation                                                        | Failed: received `cannot read scenario specification ... ENOENT` after the invalid path passed the input boundary.   |
| Restore three-digit allocator identifier parsing                                       | Direct allocator test failed with `scenario identifier does not match ... EXAMPLE-1000`.                             |
| Restore three-digit report-join identifier parsing                                     | Direct report-join test failed: expected `['EXAMPLE-1000']`, received an unidentified scenario.                      |

The production negatives with intact guards also distinguish absent journal `ENOENT` from unreadable journal-path `EISDIR`; reject unsupported action, extra argument and predecessor on import; reject an allocation with no unidentified headings; and reject an imported ID assigned another title. The source-path and duplicate-heading faults are recorded above. Every injected fault was restored before the final focused checks. These are exact path proofs for the listed checks. Candidate/base continuity is deferred until it has a production caller.

| Restored-tree check                                                     | Fresh observation                             |
| ----------------------------------------------------------------------- | --------------------------------------------- |
| `bun test src/rules/scenarios.test.ts`                                  | Exit 0; 26 pass, 0 fail, 59 assertions.       |
| `bun test --preload ../test/scratch/preload.ts src/test-levels.test.ts` | Exit 0; 58 pass, 0 fail, 63 assertions.       |
| Burokrat CLI `tsc --build --force`                                      | Exit 0.                                       |
| Scoped ESLint on the five changed source/test files                     | Exit 0.                                       |
| Prettier check on six changed code/spec files                           | Exit 0; all matched files use Prettier style. |

The next review pass added production CLI negatives for the remaining active B3 checks. The unused `assertScenarioJournalExtends` helper and its unit-only test were removed; trusted candidate/base continuity returns with its production integration in the next B3 slice.

| Additional injected fault                                           | Named negative observed with the fault                                                                          |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Disable no-heading refusal                                          | `scenario import` expected exit 1, received 0.                                                                  |
| Disable event title-shape check for newline-bearing title           | Expected `malformed scenario journal`, received later `scenario identifier lacks current allocator provenance`. |
| Disable inactive or foreign predecessor predicate individually      | Each `scenario allocate --predecessor` negative expected exit 1, received 0.                                    |
| Let `example-detail` IDs into `example` ordinal selection           | Foreign-predecessor negative expected its predecessor diagnostic, received `EXAMPLE-NaN` identifier mismatch.   |
| Disable second-retirement refusal                                   | Expected `unknown or inactive scenario`, received later provenance error.                                       |
| Disable rename prior-title check                                    | Expected rename diagnostic, received later provenance error.                                                    |
| Bypass journal schema decoder for version 2 or numeric event title  | Both expected `malformed scenario journal`, received later provenance error.                                    |
| Decode invalid UTF-8 with replacement                               | Expected `cannot read scenario journal`, received malformed JSON with replacement character.                    |
| Disable direct importer capability-shape guard                      | Expected `scenario source has no capability`, received later identifier mismatch.                               |
| Rethrow raw JSON syntax or schema errors from journal reader        | Each production CLI negative lost its named `malformed scenario journal` boundary diagnostic.                   |
| Disable import reservation refusal or validation provenance refusal | Two import negatives and three validation negatives respectively expected exit 1, received 0.                   |

Each fault was applied one at a time to the active source and restored before the next probe. The exact outputs are retained under `/tmp/puni-b3-guard-probes/` in this workspace. Final restored-tree checks: Burokrat `scenarios.test.ts` exit 0, 43 pass and 94 assertions; devsync `test-levels.test.ts` exit 0, 58 pass and 63 assertions; Burokrat TypeScript build exit 0; scoped ESLint on five source/test files exit 0. The final formatting and diff checks follow this record. A production candidate/base comparison, whole-tree spec selection, citation-removal proof, clean API target and h2puni gate remain open with task 2.2.

## Task 2.1 continuation — 2026-10-09

The classifier now lives in `libs/shared/domain/test-levels`. Its ten rows distinguish all eight levels with exact `.ts`/`.tsx` suffixes; callers supply frontend root and policy/runner membership. Burokrat re-exports the pure API and devsync imports the shared library. The pilot target checker gained separate store-memory Unit and Conformance targets and a separate SQLite Conformance target, leaving pinned legacy Conformance commands unchanged. The existing store-memory `test:unit` is declared a mixed aggregate. The frontend declarations add Node Unit, root Unit, UTC View and Auckland View report identities.

| Fresh check                                                                                                         | Observation                                                                              |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Shared classifier `bun test src/index.test.ts`                                                                      | Exit 0; 4 pass, 20 assertions.                                                           |
| Burokrat `bun test src/rules/test-collection.test.ts`                                                               | Exit 0; 3 pass, 4 assertions.                                                            |
| Devsync `bun test --preload ../test/scratch/preload.ts src/test-levels.test.ts`                                     | Exit 0; 59 pass, 67 assertions.                                                          |
| `NX_CACHE_PROJECT_GRAPH=false bunx eslint` on shared classifier, Burokrat collection and devsync level source/tests | Exit 0 after the shared-library extraction; Nx module boundaries intact.                 |
| `bunx tsc -p ... --noEmit` for shared classifier, Burokrat CLI and devsync                                          | Each exited 0.                                                                           |
| Frontend `vitest run --config vitest.node.config.ts src/test-tiers.test.ts vitest.view-level.test.ts`               | Exit 0; 2 files, 8 tests.                                                                |
| Frontend `vitest run --config vitest.unit-root.config.ts`                                                           | Exit 0; 2 files, 21 tests.                                                               |
| `vitest list --filesOnly --json` for Node Unit, root Unit, UTC View and Auckland View                               | 70, 2, 104 and 2 distinct files, respectively.                                           |
| `wbs-store-memory:test:unit:level`                                                                                  | Exit 0; 73 tests in seven files; JUnit `tmp/junit/wbs-store-memory.unit.xml` exists.     |
| `wbs-store-memory:test:conformance:level`                                                                           | Exit 0; 73 tests in one file; JUnit `tmp/junit/wbs-store-memory.conformance.xml` exists. |
| `wbs-store-sqlite:test:conformance:level`                                                                           | Exit 0; 73 tests in one file; JUnit `tmp/junit/wbs-store-sqlite.conformance.xml` exists. |

All successful Nx runs above used `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-test-axes-nx`. A first plain `bunx nx run` exited 0 after daemon/plugin socket denials without showing any `> nx run` line or producing reports; that exit was not counted as a run. Removing the SQLite API selector exclusion for `source-conformance.db.test.ts` made the devsync production target audit fail with `wbs-store-sqlite:test:api is declared api and collects src/testing/source-conformance.db.test.ts, which is conformance`; the selector was restored. Replacing the shared Performance suite-membership guard with `if (false)` made its negative fail because `elsewhere/check.spec.ts` was accepted as Performance; the guard was restored. Tests also reject `.db.test.js` and `.test.jsx`, and classify `.db.test.tsx` as View.

`wbs-fe-01:test:unit:level` exited 1 on the Node phase; its JUnit contains 844 tests, five failures, including `spawnSync bun/sh EPERM` under this sandbox and one timeout-oracle failure. The root Unit phase did not run after that failure, though its standalone 21-test command passed. `wbs-fe-01:test:view:level` produced a zero-byte UTC report and no Auckland report after more than 150 seconds and was interrupted with exit 130. Those targets remain unverified. No Browser, Performance, Architecture or Manual target/report inventory or candidate-bound collection manifest is claimed complete. There is no declared Performance fixture with thresholds, so an empty Performance level must be an explicit `no-cases` refusal; a real fixture and isolation proof remain required. Task 2.1 stays open.

## Task 2.1 target selection review correction — 2026-10-09

Astra review found that the new memory Unit and both Conformance commands passed an empty `find` substitution to Bun, which then default-discovered unrelated tests. The three project.json commands now remove their prior JUnit, capture `find` output, stop on selector error, and emit a named `no-cases` failure for an empty selection before starting Bun. The pure `planTestCollection` helper had no production caller, so it and its test were removed; the future collection-plan contract remains in design, without an enforcement claim.

| Command or proof                                                                                                                                                             | Observed result                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test src/test-levels.test.ts --test-name-pattern='refuses empty or failed selection before Bun runs'` before the target guards                                          | Exit 1; `wbs-store-memory:test:unit:level empty` launched `unrelated.test.ts`, 1 pass, target exit 0 instead of refusal.                                                                                                            |
| Same focused test after guards                                                                                                                                               | Exit 0; 1 pass, 22 assertions initially; each of the three actual project.json commands refused both empty selection and `find` failure in an isolated scratch project, did not run its unrelated sentinel and removed stale JUnit. |
| Empty-guard fault: change memory Unit `if [ -z "$files" ]` to `if [ -z "never" ]`                                                                                            | Named test exit 1; `unrelated.test.ts` ran and passed, target exit 0. Guard restored.                                                                                                                                               |
| Selector-error fault: replace memory Unit `files=$(find …) && if` with `files=$(find …); if`                                                                                 | Named test exit 1; `find: ‘src’: No such file or directory` was followed by false `no-cases: wbs-store-memory:test:unit:level`. Error-status guard restored.                                                                        |
| `bun test src/test-levels.test.ts` after the first guard correction                                                                                                          | Exit 0; 60 pass, 89 assertions. The extra selector-error oracle was added after this run and is rerun below.                                                                                                                        |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-test-axes-nx bunx nx run <target> --skip-nx-cache` for memory Unit, memory Conformance, SQLite Conformance | Each exit 0 with an actual `> nx run` line and new JUnit; 73 tests in 7, 1 and 1 files, respectively.                                                                                                                               |
| View exclusion fault: remove `...NODE_SUITES` from `vitest.view.config.ts` and run `bunx vitest run --config vitest.node.config.ts vitest.view-level.test.ts`                | Exit 1; `excludes every Node suite from the UTC View run` lacked `playwright-config.test.ts`. Restored and corrected the adjacent `Proof:` comment.                                                                                 |
| Final `bun test src/test-levels.test.ts` with both guard oracles                                                                                                             | Exit 0; 60 pass, 0 fail, 95 assertions.                                                                                                                                                                                             |
| Restored `bunx vitest run --config vitest.node.config.ts vitest.view-level.test.ts`                                                                                          | Exit 0; 2 tests in 1 file.                                                                                                                                                                                                          |
| `bunx tsc -p tools/tool-devsync/tsconfig.json --noEmit`                                                                                                                      | Exit 0.                                                                                                                                                                                                                             |

The empty-selector proof uses a root `unrelated.test.ts` that Bun would discover with no positional files. Both failure states begin with a passing stale report; the test requires it to be absent afterward. The `find` error is checked separately from a valid but empty selection. A JUnit output path alone still does not bind a report to target, config, candidate and collected files, so task 2.1 remains open.

Final scoped `NX_CACHE_PROJECT_GRAPH=false bunx eslint` on the changed devsync and View sources exited 0 after auto-sorting one new test import. Prettier check on the changed source, project manifests and design/verify note exited 0; `git diff --check` exited 0. `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` exited 0 with 158 items passed and 0 failed. The h2puni gate, complete frontend View execution and Browser/Performance/Manual report proof remain unverified.

Astra rereview found the guarded-command parser's report-clear/write equality had no observed breakability proof. The new test mutates the real memory Unit target command to clear `wrong.xml` while still writing `wbs-store-memory.unit.xml`; `parseLevelCommand` rejects it. Replacing the equality check with `if (false)` made that named test fail: expected a throw, received a parsed command whose JUnit outfile still pointed to `wbs-store-memory.unit.xml`. The check was restored. The focused test passed 1/1 before the mutation and is rerun with the full devsync suite below.

After restoration, `bun test src/test-levels.test.ts` exited 0 with 61 tests and 97 assertions. Scoped `NX_CACHE_PROJECT_GRAPH=false bunx eslint` on the two devsync level files and `bunx tsc -p tools/tool-devsync/tsconfig.json --noEmit` each exited 0.

## Task 2.1 Browser reporter increment — 2026-10-09

The ordinary Playwright config declares `tmp/junit/wbs-fe-01.browser.ordinary.xml` in both local and CI reporter branches; the packaged config declares a separate `tmp/junit/wbs-fe-01.browser.packaged.xml`. Focused config tests assert the exact `['junit', { outputFile }]` reporter tuple. They do not run browsers or establish report freshness.

| Check or injected fault                                                                                                                                                                                                  | Observed result                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx vitest run --config vitest.node.config.ts playwright-config.test.ts`                                                                                                                                               | Exit 1; 14 passed, 1 failed because an existing authentication test hit sandbox `spawnSync bun EPERM`. The two new reporter assertions passed. |
| `bunx vitest run --config vitest.node.config.ts playwright-config.test.ts --testNamePattern='writes a JUnit report for the ordinary Browser suite\|serves the namespaced build with the namespaced Caddy configuration'` | Exit 0; 2 passed, 13 skipped.                                                                                                                  |
| Remove the ordinary local JUnit tuple only, rerun its named test                                                                                                                                                         | Exit 1; expected JUnit tuple, received `[['list']]`. Restored.                                                                                 |
| Remove the ordinary CI JUnit tuple only, rerun its named test                                                                                                                                                            | Exit 1; expected JUnit tuple, received `[['list'], ['html', …]]`. Restored.                                                                    |
| Remove the packaged JUnit tuple, rerun its named test                                                                                                                                                                    | Exit 1; expected JUnit tuple, received `[['list']]`. Restored.                                                                                 |
| Final focused reporter tests after all restorations                                                                                                                                                                      | Exit 0; 2 passed, 13 skipped.                                                                                                                  |
| Scoped ESLint and `bunx tsc -p apps/wbs/fe-01/tsconfig.spec.json --noEmit`                                                                                                                                               | Each exit 0.                                                                                                                                   |

At this increment, actual ordinary, packaged and portable Browser target execution, collected file lists, conditional project selection, and candidate-bound report manifests were unverified. The portable target is checked in the next increment; Task 2.1 remains open.

## Task 2.1 portable Browser reporter increment — 2026-10-09

`libs/wbs/application/core/playwright.config.ts` now keeps the `line` reporter and adds `tmp/junit/wbs-core.browser.portable.xml` as a distinct absolute JUnit output. The new config test lives under the core Unit test root.

| Check or injected fault                                                                                                                                   | Observed result                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test src/playwright-config.test.ts` before adding the JUnit tuple                                                                                    | Exit 1; received reporter `'line'`, which is not an array containing the expected tuple.                                                                                                       |
| Same focused test after adding the tuple                                                                                                                  | Exit 0; 1 pass, 1 assertion.                                                                                                                                                                   |
| Remove only the JUnit tuple and rerun the named config test                                                                                               | Exit 1; expected `['junit', { outputFile: …/wbs-core.browser.portable.xml }]`, received `[['line']]`. Tuple restored.                                                                          |
| `bunx playwright test --config=libs/wbs/application/core/playwright.config.ts --list`                                                                     | Exit 0; exactly 2 tests in `portable-composition.spec.ts`, Chromium project only.                                                                                                              |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-test-axes-nx bunx nx run wbs-core:test:portable --skip-nx-cache` in the command sandbox | Exit 1 after `build:portable`; Chromium launch failed with `sandbox_host_linux.cc:41 … Operation not permitted`. Direct Playwright run showed 1 passed, 1 failed for that launch error.        |
| Same Nx target in an approved unsandboxed command                                                                                                         | Exit 0; actual `build:portable` and `test:portable` lines, 2 passed. Wrote readable 730-byte `tmp/junit/wbs-core.browser.portable.xml` with `tests="2" failures="0"`, one suite and two cases. |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-test-axes-nx bunx nx run wbs-core:test:unit --skip-nx-cache`                            | Exit 0; 847 pass across 88 files, including the new config test; JUnit written.                                                                                                                |
| `bunx tsc -p libs/wbs/application/core/tsconfig.json --noEmit`                                                                                            | Exit 0.                                                                                                                                                                                        |

The actual Playwright JUnit has `<testsuite name="portable-composition.spec.ts" hostname="chromium">` and two `<testcase classname="portable-composition.spec.ts">` entries, but no testcase `file` attribute. The installed Playwright reporter implementation constructs `classname: suiteName` and no `file`. Burokrat's current `readJUnitReport` rejects a testcase without `file`; no file-level scenario join or candidate-bound report claim is made from this XML alone. The companion manifest/adapter remains required before ledger consumption.

Scoped `NX_CACHE_PROJECT_GRAPH=false bunx eslint` on the portable config and new test exited 0 after sorting the test imports. Prettier check and `git diff --check` exited 0. The h2puni gate was not run for this slice.

## Performance declaration and empty-target checkpoint — 2026-10-09

This is an intermediate Task 2.1 slice. The candidate-owned declaration is valid and empty.
`wbs-fe-01:test:performance:level` clears prior JUnit and binding files, validates the
declaration, and exits nonzero with `no-cases: no performance fixtures declare thresholds`
before Playwright. A nonempty declaration currently exits with the explicit
`Performance runner execution is not yet implemented` error; it does not emit a pass.

| Check                                                                                                                   | Fresh observation                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun test src/performance-level.test.ts` in `tools/tool-devsync`                                                        | Exit 0; 8 pass, 0 fail, 30 assertions. These call the production adapter and distinguish absent `ENOENT`, unreadable directory `EISDIR`, malformed JSON, absent/unreadable config, path/threshold/schema/identity faults and stale report removal.                                                                                                                       |
| `bun test src/index.test.ts` in `libs/shared/domain/test-evidence`                                                      | Exit 0; 5 pass, 0 fail, 13 assertions.                                                                                                                                                                                                                                                                                                                                   |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-nx-axes bunx nx run wbs-fe-01:test:performance:level` | Exit 1; actual Nx target invoked `bun tools/tool-devsync/src/performance-level.ts` and printed the named `no-cases` error. Neither `tmp/junit/wbs-fe-01.performance.xml` nor its companion manifest existed afterward. An earlier Nx invocation without the three environment settings exited 0 after socket warnings without running any target, so it is not evidence. |
| Scoped TypeScript for devsync, shared evidence and frontend E2E tsconfigs                                               | Exit 0.                                                                                                                                                                                                                                                                                                                                                                  |
| Scoped ESLint after generating the Nx project graph                                                                     | Exit 0. Immediately after `nx reset`, ESLint warned that it skipped the module boundary rule for lack of a cached graph; that run is excluded.                                                                                                                                                                                                                           |

Production-path fault probes were restored after each observed failure:

| Disabled check                                             | Named test failure observed                                                                                                      |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Empty-case predicate                                       | Expected `no-cases`, received the nonempty-runner error.                                                                         |
| Prior JUnit removal                                        | The stale passing XML remained readable after `no-cases`.                                                                        |
| Prior binding removal                                      | The stale passing manifest remained readable after `no-cases`.                                                                   |
| Config path validation                                     | Expected normalized-path refusal for `../outside.config.ts`, received a later config-identity error.                             |
| Fixture path validation, and separately its `..` branch    | Expected normalized-path refusal for `../outside.perf.spec.ts`, received the later runner error.                                 |
| Finite-threshold guard                                     | JSON `1e999` reached the later runner error instead of the finite-threshold refusal.                                             |
| Nonempty title guard                                       | Empty title hierarchy reached the later runner error.                                                                            |
| Duplicate case-ID guard                                    | The duplicate was reported only as a runner-tuple collision, failing the case-ID refusal.                                        |
| Duplicate runner-tuple guard                               | Two IDs claimed one tuple and reached the later runner error.                                                                    |
| Outer schema undeclared-key rejection                      | An unexpected field reached the later runner error.                                                                              |
| Case schema undeclared-key rejection                       | A case-local unexpected field reached the later runner error.                                                                    |
| Schema error branch                                        | An unexpected field became `TypeError: undefined is not an object (evaluating 'path.startsWith')` instead of the schema refusal. |
| Fixed config and fixed project identity guards, separately | Each changed identity reached the later runner error instead of its named refusal.                                               |
| Selected config readability check                          | A missing config reached `no-cases` instead of `ENOENT`; the absent/unreadable-config test failed.                               |

The next required slice is strict Playwright JSON discovery, same-selection execution,
fresh finite observations, independent Burokrat comparison, trusted-policy/candidate binding,
JUnit plus companion manifest, and a real reviewed Performance fixture/run. No
Performance pass or Task 2.1 completion is claimed here. `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate test-axes --strict` exited 0 with `Change 'test-axes' is valid`. Bare `bunx openspec` could not determine an executable and is excluded. The h2puni gate remains unrun.

### Astra P2 corrections to the empty/refusal checkpoint

The declaration now decodes raw bytes with fatal UTF-8 handling. The focused adapter tests exit 0 with 8 passes and 30 assertions; scoped TypeScript and ESLint exit 0 after restoration. Before the fix, a single
`0xff` byte in the candidate declaration caused `SyntaxError: JSON Parse error: Unrecognized
token '�'`; the production test expected a UTF-8 refusal and failed. With fatal decoding it
passes. Turning `fatal` back off made the same named test fail with the replacement-character
JSON error; the fault was restored.

Both explicit `wbs-fe-01:lint` and `lint:fast` command lists include the dedicated
`playwright.performance.config.ts`. The owning `wbs-fe-01:lint --skip-nx-cache` baseline
exited 0 in 56.2 seconds. Injecting `const injectedLintFault = ;` into that config made the
same Nx target exit 1 in 56.5 seconds; direct scoped ESLint named the file at `3:26` with
`Parsing error: Expression expected`. The syntax fault was restored, and a fresh owning `wbs-fe-01:lint --skip-nx-cache` rerun exited 0 in 56.7 seconds. `lint:fast` execution
has not yet been independently run; its explicit command list contains the same path.

### Performance policy and pure judge checkpoint — 2026-10-09

The existing external `RulePolicy` has an optional `performance` record that the registered
`PERF-THRESHOLD` rule requires in every mode. It pins declaration/config paths, config bytes,
project, runner version and domain-separated case digests. The candidate declaration is
required; an empty reviewed selection is `no-cases` and unevaluated. A synthetic nonempty
scratch candidate passed through the production `check --rule PERF-THRESHOLD
--performance-evidence <json>` path, which validates candidate, policy and declaration
digests, selection, exact reviewed/executed cases and observations, then independently
recomputes comparisons. This JSON transport is caller-supplied and **untrusted**; the verdict
has `certifies:false`. It does not prove Playwright ran or close Task 2.1.

Focused observations: `bun test src/evidence/performance.test.ts --timeout=30000` passed
16/16 (114 assertions) after the final production registry negatives were added. The shared
`test-evidence` suite passed 8/8 (24 assertions). Changed-file ESLint, Burokrat spec
TypeScript and shared evidence TypeScript each exited 0. The full
`src/rules/rules.test.ts` suite initially had 62 passes and two failures because ambient
graph fixtures lack a Performance declaration; both tests were changed to expect the new
unevaluated rule, and the focused ambient group then passed 2/2. Fresh full-suite results
then passed 64/64 (565 assertions) with
`TOOL_WIKI_TRUSTED_NODE_MODULES=/tmp/puni-test-axes-080-34/node_modules`.
Without that trust environment, the suite's TypeScript graph cases are unavailable;
the no-env run is excluded. `bunx tsc -p
apps/twilight-structure/twilight-burokrat/cli/tsconfig.spec.json --noEmit` passed after
fixing readonly fixture titles, possibly absent process pipes and indexed JSON access.

Observed fault removal, each restored: absent-declaration and empty no-cases guards made
their named CLI tests exit 0; candidate, policy and declaration digest guards made the
changed-identity CLI test accept stale evidence; disabling fatal evidence decoding changed
the UTF-8 refusal to malformed JSON; mutating unreadable/malformed diagnostics and the
evidence schema error branch failed the named boundary test. Every pure judge guard for
reviewed config/path/project, selected config/project/digest/version/args/environment,
runner exit, review set/digest, execution set and observation presence/count/unit was
individually disabled and made its named judge test fail. A duplicated registry comparison
of candidate config bytes to selection digest was removed: the candidate bytes already
equal the reviewed policy digest, and the judge separately requires selection digest to
equal that same reviewed digest. Its removal did not weaken the negative.
The production missing-evidence, missing-config, changed-config and changed-declaration
selection guards also each failed their named CLI test when disabled. Removing the
failed/skipped status predicate made those cases appear passing in the judge test.

Pending: strict Playwright discovery and run adapter, trusted runner-produced manifest,
JUnit, same-selection reconciliation, real reviewed Performance fixture/run and operational
proof. The h2puni gate remains unrun because Task 2.1 is incomplete.

### Astra Performance judge proof correction

A production scratch run with observation 220 ms against a reviewed `lte 200 ms`
threshold now reaches the registered rule. In enforce mode it returns one
`PERF-THRESHOLD` refusal, `allowed:false`, exit 1; in observe mode it returns the
same finding as debt, `allowed:true`, exit 0, and `certifies:false` in both modes.
Replacing the registered rule's failed-case filter with an empty selection made this
named test fail (the finding disappeared). This probes the actual comparison-to-finding
path while preserving the rule model's observe semantics.

The changed-reviewed-case test updates the evidence policy digest after mutating the
external policy, so it now reaches `Performance reviewed digest mismatch` rather than
stopping at policy identity. Disabling that case-digest guard made the named production
test fail because the expected mismatch disappeared. The nine-argument CLI flag and
evidence-without-PERF selected-rule guards each have a production negative: `--other-evidence`
and `--rule MOD-INDEX --performance-evidence` exit 1 with distinct diagnostics.
Disabling either guard made the same named test fail. All four mutations were restored.

After restoring the guards, the focused Performance judge suite passed 18/18 with 139
assertions (`TOOL_WIKI_TRUSTED_NODE_MODULES=/tmp/puni-test-axes-080-34/node_modules bun
test src/evidence/performance.test.ts --timeout=30000`). Burokrat spec TypeScript,
changed-file ESLint, Prettier check and `git diff --check` each exited 0. The broader
rules suite was not rerun for this proof-only correction; its last run was 64/64 at
`13637f19c`.

The threshold-breach production case also ran in ratchet mode with its fixture directory
inside the adopted set (finding `refusal`, exit 1) and outside it (finding `debt`, exit 0).
Both verdicts remain non-certifying. Disabling the failed-case filter removed the finding;
replacing the finding path with the declaration path changed adoption and made the named
ratchet test fail. Both mutations were restored.
The final focused Performance suite passed 18/18 with 149 assertions; Burokrat spec
TypeScript, changed-file ESLint, Prettier check and `git diff --check` exited 0.

### Performance Playwright collector checkpoint — 2026-10-09

The candidate declaration remains empty. A scratch-only committed candidate with one
reviewed `lte 200 ms` case exercised the production adapter: Burokrat candidate identity
and preflight, detached checkout, Playwright JSON `--list`, Playwright execution, fresh
attachment decoding, independent Burokrat comparison, JUnit and a non-certifying digest
manifest. An observed 180 ms run produced one passing testcase. A scratch 280 ms run
caused a nonzero target with `failures="1"` and a `<failure>` testcase in JUnit; before
the report fix the same test failed with `ENOENT` for the absent JUnit file. The target
and manifest still say `certifies:false`; this scratch proof is not a repository
Performance obligation.

The Playwright process uses bounded asynchronous invocation with JSON, stdout and
stderr redirected to separate files. Direct diagnostic runs of `node
node_modules/playwright/cli.js` and the executable shebang, each with `--workers=1`,
exited 0 in 0.8 and 0.7 seconds respectively, emitted 3183 and 3170 JSON bytes and
empty stderr. The prior `Bun.spawnSync` run hung. A scratch fixture deliberately waiting
60 seconds was killed after the 20-second bound; the production test passed in 22.37
seconds and found no reusable JUnit, binding or evidence. Disabling the timeout refusal
made that named test fail: it received `JSON reporter output is unavailable` instead of
`timed out`. Playwright receives only PATH, HOME, TMPDIR, LANG and its JSON output path.
The scratch config reads `PLAYWRIGHT_GREP`; injecting a nonmatching value into the parent
environment left the normal run passing. Inheriting the parent environment while
preserving the reporter path made that test fail before collection, so the isolation
dependency is observed. The runner evidence records an empty selection-affecting
environment.

The Burokrat `candidate-identity` command returns the same candidate hash as `check`,
changes after a committed content change and refuses an absent revision. Its response
includes tool name, project version `0.1.0`, schema version, selected revision and
`certifies:false`; the adapter validates these before Playwright. Changing the response
version to `0.0.0` made the scratch target fail with `Burokrat candidate identity tool
version mismatch`. The shared declaration digest now uses portable noble SHA-256. Bun
and Node both produced the fixed canonical vector
`8c1df4f0bb152a042cad1b463d284d99740391ce7561ad6db969bdb0bf64b670`.

Parser guard-to-negative map, using `decodePlaywrightReport` on the production parser
entrypoint. Every listed guard was disabled individually and its named test failed;
the adjacent source `Proof:` comments name the observed fault. The discovery/report
schema fixtures additionally test the remaining field-level malformed records.

Named tests below are all in `tools/tool-devsync/src/performance-playwright.test.ts`:
**D** = “refuses malformed discovery records at each runner boundary”; **C** =
“refuses malformed report, config, project and paths”; **S** = “refuses unknown,
duplicate and missing collection identities”; **R** = “refuses list execution and
altered run outcomes or observation attachments”; **M** = “refuses malformed
execution and measurement transport records”. Each mutant command used `bun test
tools/tool-devsync/src/performance-playwright.test.ts --test-name-pattern '<named
test>'`; each exited 1 and was restored before the fresh suite.

| Boundary                                | Named test | Negative fixture                               | Guard-removal observation                                                   |
| --------------------------------------- | ---------- | ---------------------------------------------- | --------------------------------------------------------------------------- |
| Plain record, array, nonempty string    | D          | malformed config, null projects, empty version | later runner-version error, `null.length` TypeError, empty version accepted |
| Config path and selected project        | C          | outside config, firefox project                | both foreign selections accepted                                            |
| Spec and nested-suite file              | S, D       | other spec, other nested file                  | spec accepted; nested mismatch reached later spec error                     |
| File containment                        | C          | `../outside` suite file, outside root fixture  | later nested mismatch; later undeclared case with `../../` path             |
| Exact case and collection set           | S          | unknown title, duplicate collected case        | later undefined lookup; duplicate accepted                                  |
| Per-spec test count and project         | D          | zero selected tests, firefox test              | later invalid record; firefox case accepted                                 |
| List-only and run result count          | R          | list carrying execution, run missing result    | list accepted; later invalid record                                         |
| Top-level reporter errors               | D          | nonempty errors                                | report accepted                                                             |
| Observation attachment count and format | R, M       | absent attachment, text/plain                  | later invalid record; text/plain accepted                                   |
| Base64 and measurement identity         | R          | malformed base64, foreign case ID              | later JSON error; foreign measurement accepted                              |

Fresh focused outputs after restoring all mutants: `bun test
tools/tool-devsync/src/performance-playwright.test.ts
tools/tool-devsync/src/performance-level.test.ts
libs/shared/domain/test-evidence/src/index.test.ts --timeout=60000` passed
29/29 with 135 assertions in 30.20 seconds. With
`TOOL_WIKI_TRUSTED_NODE_MODULES=/tmp/puni-test-axes-080-34/node_modules`,
`bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/performance.test.ts
--timeout=30000` passed 20/20 with 166 assertions in 29.79 seconds.
`bunx tsc -p tools/tool-devsync/tsconfig.spec.json --noEmit`, `bunx tsc -p
libs/shared/domain/test-evidence/tsconfig.spec.json --noEmit` and `bunx tsc -p
apps/twilight-structure/twilight-burokrat/cli/tsconfig.spec.json --noEmit`
each exited 0 with empty output. Changed-file ESLint exited 0; Prettier check
reported `All matched files use Prettier code style!`; `git diff --check`
exited 0. The full h2puni gate and a real repository Performance target run
were not attempted because Task 2.1 and trusted certification remain open.

Certification is **not implemented**. A digest manifest cannot attest execution:
the current Burokrat transport still accepts caller-supplied JSON and does not recompute
JUnit/discovery/run artifact bytes. Astra's required next boundary is an externally
authenticated receipt binding manifest digest, invocation, candidate and trusted
collector/runtime identity, plus Burokrat verification of those bytes, case sets and
comparisons. The manifest also needs raw discovery/run artifact digests. A real reviewed
nonempty repository fixture and run remain mandatory before Task 2.1 can be complete.

### Performance collector boundary corrections after Astra review

The adapter invokes Burokrat from a fresh empty directory outside the candidate and
passes only PATH, HOME, TMPDIR and LANG. A committed scratch `bunfig.toml` preload writes
a sentinel if Bun starts in the candidate; the normal target left it absent. Mutating
the Burokrat CWD back to the candidate made the named scratch success test exit 1:
its final `ENOENT` sentinel assertion received “operation unexpectedly succeeded”.
The externally selected policy path is supplied by the trusted caller or an operator
environment value, never by the candidate declaration. Burokrat performs the trusted
policy read; the adapter binds the bytes by digest but cannot itself authenticate the
caller. A missing policy selection refused with `externally selected`; removing that
guard made the named policy test receive a generic `resolve(undefined)` TypeError.
An unreadable path refused with `ENOENT`. A policy omitting `performance` was refused
at preflight with `preflight unavailable`, before Playwright.

The detached checkout is checked for pinned HEAD, clean Git status and exact
declaration/config bytes before discovery, after discovery, before execution and after
execution. Candidate HEAD is checked after both phases. The real scratch target
refused an untracked file written during discovery (`checkout changed after discovery`),
an untracked file written during execution (`checkout changed after execution`), an
empty commit in the checkout (`checkout HEAD changed after execution`), a modified
config hidden with Git `assume-unchanged` (`checkout inputs differ after execution`)
and an original-candidate commit during execution (`candidate revision changed`).
No JUnit was emitted for these refusals. Removing the status guard made the dirty-run
named test exit 1 because `runPerformanceLevel` unexpectedly succeeded; removing HEAD,
content and original-revision guards made their named tests exit 1 after the expected
identity refusal was replaced by a later Burokrat `Performance runner exited 1`
unevaluated verdict. Removing the clean-candidate guard made its named test fail
because the target unexpectedly succeeded on an untracked candidate file. Removing
the repository-root guard changed the nested-root test's named refusal to a later
dirty-status refusal. Persistent changes are covered; transient write-and-restore
between snapshots is unverified and cannot certify this runner.

JUnit output is now checked by the repository's `saxes` XML parser in the scratch
production test. A measured case title containing U+0001 was refused before JUnit;
disabling the XML 1.0 character guard made that named target unexpectedly succeed.
A measured title with tab, newline and CR round-tripped exactly through parsed JUnit
attributes because those characters use numeric entities. Removing tab entity
encoding made the named test fail: the parsed tab became a space. A scratch config
also appended `0xff` to the actual Playwright JSON reporter file on process exit;
the target refused `reporter output is not valid UTF-8` before JSON parsing. Turning
off fatal UTF-8 decoding made the same named test fail with `malformed Playwright
discovery JSON` instead.

The production `readVerdict` decoder accepts only schema 1, the selected
`PERF-THRESHOLD` rule, shaped findings/unevaluated records and coherent `allowed`
with process exit 0/1. Its named malformed-verdict test accepts a debt finding as
allowed and a refusal finding as disallowed; wrong schema, foreign rule/finding,
foreign unevaluated record and mismatched allowed/exit each refuse. Disabling each
of schema, selected-rule, finding, unevaluated and allowed/exit guards made the named
test exit 1, respectively accepting schema 2 or MOD-INDEX, reaching only a later
status error, or accepting an incoherent exit-0 `allowed:false`. `assertPreflight`
requires the selected candidate and exactly one missing-run Performance obligation;
its named test failed when candidate equality or the missing-run reason check was
disabled. Exact finding reconciliation also has a named missing/foreign/duplicate
finding negative; disabling it made the missing-finding test accept no Burokrat
finding for a measured failure. The production scratch target refuses failed and
skipped Playwright cases even when their attachments report passing numbers.

Fresh post-correction scoped verification: `bun test
tools/tool-devsync/src/performance-playwright.test.ts
tools/tool-devsync/src/performance-level.test.ts
libs/shared/domain/test-evidence/src/index.test.ts --timeout=60000` exited 0 with
44 passes, 269 assertions across three files in 69.61 seconds.
`TOOL_WIKI_TRUSTED_NODE_MODULES=/tmp/puni-test-axes-080-34/node_modules bun test
apps/twilight-structure/twilight-burokrat/cli/src/evidence/performance.test.ts
--timeout=30000` exited 0 with 20 passes, 166 assertions in 29.73 seconds.
Changed-file ESLint, devsync spec TypeScript and Prettier check exited 0.
The real repository Performance target still has no reviewed case; no full gate or
operational certification claim is made.

### Performance collector final guard audit

Further scratch runner negatives use the actual `runPerformanceLevel` production
entrypoint. `exit-list` exits 7 after Playwright writes valid JSON; it refuses
`discovery failed`. `empty-list` exits 0 with a zero-byte reporter file; it
refuses `discovery emitted no JSON`. A discovery-stage alteration of the original
candidate's Git HEAD refuses `candidate revision changed after discovery`; a run
JSON version altered to `0.0.0` refuses `discovery and execution selection changed`.
Both a missing result record and a missing observation attachment refuse at the
strict parser boundary before JUnit. A changed tracked fixture hidden with either
`assume-unchanged` or `skip-worktree` refuses `tracked input index flags changed
after execution`. The index scan conservatively requires normal `H` entries for
all tracked checkout files at every snapshot. Persistent tracked changes with
masked index flags are therefore rejected; write-and-restore between boundaries
remains outside this non-certifying adapter's guarantee.

Each mutation below changed only the named production guard, ran `bun test
tools/tool-devsync/src/performance-level.test.ts --test-name-pattern '<name>'
--timeout=60000`, observed exit 1, then restored source:

| Disabled guard                 | Named test fragment                              | Observed fault under mutant                                                                                                    |
| ------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| discovery exit status          | `nonzero discovery`                              | expected `discovery failed`; target unexpectedly succeeded                                                                     |
| empty discovery reporter       | `nonzero discovery`                              | expected `discovery emitted no JSON`; received `malformed Playwright discovery JSON`                                           |
| candidate HEAD after discovery | `candidate HEAD changed by Playwright discovery` | expected `candidate revision changed after discovery`; received later `candidate revision changed during Playwright execution` |
| list/run version comparison    | `runner version differs from discovery`          | expected selection-change refusal; target unexpectedly succeeded                                                               |
| empty Burokrat verdict output  | `malformed or foreign Burokrat PERF verdicts`    | expected `preflight unavailable`; received malformed JSON refusal                                                              |
| Burokrat verdict record shape  | `malformed or foreign Burokrat PERF verdicts`    | expected `run verdict is malformed`; received later `run verdict shape is malformed`                                           |
| checkout index flags           | `dirty, committed or content-masked checkout`    | expected index-flags refusal; received later Burokrat `Performance runner exited 1` refusal                                    |
| one-to-one finding consumption | `reconciles only the measured case findings`     | expected two-case [A,B] versus [A,A] refusal; returned findings were accepted                                                  |
| run result cardinality         | `execution report without a case result`         | expected one-result refusal; received `invalid Playwright JSON case result`                                                    |
| observation cardinality        | `missing measured attachments`                   | expected one-observation refusal; received `invalid Playwright JSON observation attachment`                                    |

The two-case finding test first failed against the old membership-only implementation:
`Expected substring: "findings differ"; Received function did not throw`. The
new one-to-one consumption passes the same test. Direct production decoder
negatives also distinguish empty, malformed JSON, and malformed Burokrat verdict
records. The earlier selected-policy preflight target negative asserts
`preflight unavailable` with no JUnit; it cannot silently start Playwright.

Fresh post-audit suite: `bun test tools/tool-devsync/src/performance-playwright.test.ts
tools/tool-devsync/src/performance-level.test.ts
libs/shared/domain/test-evidence/src/index.test.ts --timeout=60000` exited 0:
49 passes, 0 failures, 331 assertions across three files in 93.95 seconds.
`TOOL_WIKI_TRUSTED_NODE_MODULES=/tmp/puni-test-axes-080-34/node_modules bun test
apps/twilight-structure/twilight-burokrat/cli/src/evidence/performance.test.ts
--timeout=30000` exited 0: 20 passes, 0 failures, 166 assertions in 30.27
seconds. No real repository Performance case or trusted certification was run.
After the test type refinement, `bunx tsc -p tools/tool-devsync/tsconfig.spec.json
--noEmit` exited 0 with empty output; the shared and Burokrat spec TypeScript
checks also exited 0 with empty output. Changed-file ESLint exited 0 with empty
output. Prettier check reported `All matched files use Prettier code style!`;
`git diff --check` exited 0 with empty output. The full h2puni gate was skipped
because Task 2.1 and trusted Performance certification remain open.

A final selected-verdict transport test substitutes only the real Burokrat
`check` process output while the scratch production target runs. Empty preflight
stdout refuses `preflight unavailable`; `{` refuses malformed preflight JSON;
`{}` refuses a malformed preflight verdict. After a valid measured run, a
foreign 64-character candidate SHA and a coherent exit-1 PERF unevaluated
obligation each refuse `judge refused the measured run`, with no JUnit.
`readVerdict` already rejects exit codes outside 0/1, so a duplicate outer
exit-code predicate was removed. Disabling the post-run candidate predicate
made the named foreign-candidate/unevaluated test exit 1 because its first
target unexpectedly succeeded; disabling the unevaluated predicate made its
second target unexpectedly succeed. Both source guards were restored.
After restoration, the affected preflight/post-run target command with
`--test-name-pattern 'missing or malformed Burokrat preflight transport|foreign
candidate or unevaluated obligation' --timeout=60000` exited 0: 2 passes,
0 failures, 35 assertions in 15.36 seconds. Devsync spec TypeScript,
changed devsync ESLint, Prettier check and `git diff --check` each exited 0.
The root agent independently reran the final-tree focused collector/parser/shared
suite after the two additional target tests: 51 passes, 0 failures, 366
assertions in 109.22 seconds. `openspec validate --all --json` validated
158/158 changes and exited 0. These results do not certify actual repository
Performance execution, and Tasks 2.1, 2.2 and 3.1 remain open.

## B3 specifications rule checkpoint

### B3 scenario heading AST correction — 2026-10-09

The canonical specification evaluator, scenario importer, allocator and CLI predecessor mapping
now use one `mdast-util-from-markdown` heading extractor. It selects only top-level, depth-four
ATX headings whose source starts with the literal `#### Scenario: ` prefix. It uses AST block
structure to exclude fenced code, indented code, HTML blocks and nested headings. The journal
title remains the exact raw source after the prefix, including inline Markdown and trailing
whitespace. Allocation inserts only `[ID] ` at the source title offset, preserving indentation
and original line endings. A separate production CLI case checks an indented scenario with CR
line endings and a literal backtick title while ignoring fenced and indented-code examples.

Four production `check --rule SPEC-SCENARIOS` negatives cover a list container ending before a
heading, backticks inside an HTML `<pre>` block, a lone-CR fence close and a three-space
scenario heading. Before the AST replacement, each candidate with unallocated `EXAMPLE-999`
exited 0 despite the test expecting 1. The restored AST evaluator exits 1 for each and names
`EXAMPLE-999` in its unevaluated reason. As a guard-disabled proof, the previous fence scanner
from the committed version was temporarily restored at the evaluator call, and all four tests
again failed with expected exit 1, received 0 (0 passes, 4 failures); the source was restored
byte for byte afterward. Task 2.2 remains open.

The source-offset refusal has a broken-parser dependency test. Deleting the parsed heading's
position makes the extractor throw `scenario heading has no source offsets`; replacing that
refusal with `if (false)` made the same test fail with `Received function did not throw` and an
empty heading list. The guard was restored before final checks.

The final scoped Burokrat scenario/specification suite exited 0 with 81 passes, 0 failures and
609 assertions across three files in 69.79 seconds. The Burokrat CLI TypeScript build and
package build both exited 0. Changed-file lint, Prettier and `git diff --check` were rerun after
the last formatting fix. OpenSpec validation covered 158 of 158 items with no failures.

The production `check --rule SPEC-SCENARIOS` path now requires external
`RulePolicy.scenarios` authority. It selects an immutable base and candidate,
compares journal event values as an append-only prefix, checks active canonical
scenario headings in both directions, and emits a versioned evidence digest.
The rule remains non-certifying. The focused production suite exited 0 with
25 passes, 0 failures and 360 assertions. The test cases include a deleted
retirement event that would otherwise resurrect an identifier, absent and
malformed journals, a symlink journal and spec, Git replacement commit and blob
objects, staged checkout ancestry, an absent or mismatched bootstrap, archived
copies, conflicting active copies, fenced headings, both rule modes for legacy
unidentified headings and a base-only evidence-identity change.

### B3 review correction — 2026-10-09

The scanner's CommonMark fence handling was corrected again after two
production CLI negatives exposed false greens. A closing fence followed by a
horizontal tab now closes, and a backtick fence opener with a backtick in its
info string is rejected. In each fixture, the now-visible unallocated
`EXAMPLE-999` makes `check --rule SPEC-SCENARIOS` exit 1. Before the fixes,
both tests expected exit 1 and received 0. Replacing the closing-fence
horizontal-whitespace predicate with spaces only made its focused test fail
again (expected exit 1, received 0); disabling the backtick-info predicate
did the same for its focused test. Both source guards were restored. The
restored full `specifications.test.ts` run exited 0 with 32 passes, 0 failures
and 454 assertions. Scoped Burokrat TypeScript and changed-file ESLint checks
exited 0; Prettier reported both changed source files unchanged. This repair
does not complete Task 2.2.

The pinned base must itself be a commit object. The production CLI now checks
its Git object type before resolving the full SHA, and uses that validated
commit for selection equality and ancestry. An annotated tag object pointing
at the candidate previously peeled into a passing self-base; its new
production test first failed with expected exit 1, received 0, then passed
after the fix. The Markdown scenario scanner now retains the opening fence's
marker and length and closes only on the same marker with at least that length
and whitespace after it. Four-marker backtick and tilde fences containing a
shorter three-marker line and an unallocated heading each first failed with
expected exit 0, received 1, then passed after the fix.

The full-SHA negative goes through `check --rule SPEC-SCENARIOS` and is rejected
by the external RulePolicy parser before a verdict is emitted. An explicit
wrong bootstrap journal digest is rejected by the production CLI. A prior
final HEAD recheck had no race proof; it was removed. The staged and working
selection still checks the pinned base against the checkout HEAD when it
validates ancestry, but this slice does not claim to detect a subsequent HEAD
change during evaluation. Task 2.2 remains open.

| Disabled guard                                                      | Production test                                | Observed fault                                                                                                           |
| ------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| RulePolicy full-SHA parser widened to `string`                      | `malformed full base SHA`                      | Exit 1; expected `baseRevision` in stderr, received empty stderr because the local guard emitted an unevaluated verdict. |
| Pinned Git object-type check replaced with `false`                  | `annotated tag object pinned to the candidate` | Exit 1; expected refusal exit 1, received 0.                                                                             |
| Bootstrap candidate-journal digest comparison replaced with `false` | `requires a reviewed bootstrap`                | Exit 1; expected wrong-digest refusal exit 1, received 0.                                                                |
| Fence length comparison replaced with `true`                        | Both `shorter ... fence` cases                 | Exit 1; each expected exit 0 and received 1 for an unallocated heading still inside the containing fence.                |

Each mutant was restored from saved bytes before the next mutation. The
restored focused specifications file exited 0 with 30 passes, 0 failures and
426 assertions. After formatting, it again exited 0 with 30 passes, 0 failures
and 426 assertions. The Burokrat CLI TypeScript and changed-file ESLint checks
exited 0 with empty output. Prettier check exited 0. OpenSpec validated 158 of
158 items with no failures. The neighboring Burokrat run named
`specifications.test.ts`, `rules.test.ts`, `rule-policy.test.ts` and
`read-candidate.test.ts`; Bun found three files (there is no separate
`rule-policy.test.ts`) and exited 0 with 95 passes, 0 failures and 1008
assertions. `git diff --check` exited 0.

Each named source guard below was temporarily disabled, the indicated focused
production test exited 1 with the observed fault, and the source was restored:

| Disabled guard                                    | Production test                              | Observed fault                                                |
| ------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| Required external `policy.scenarios` input        | `requires external specifications authority` | Expected `policy.scenarios` in stderr; received empty stderr. |
| Strict committed base predecessor                 | `pinned as its own base`                     | Expected exit 1; received 0.                                  |
| Staged base ancestry to checkout HEAD             | `staged selection requires`                  | Expected exit 1; received 0.                                  |
| Staged policy pin equals selected base            | `policy pin different`                       | Expected exit 1; received 0.                                  |
| Exact base-event prefix                           | `resurrection after deleting`                | Expected exit 1; received 0.                                  |
| Reviewed bootstrap base binding                   | `requires a reviewed bootstrap`              | Expected exit 1 for wrong base; received 0.                   |
| Bootstrap prohibited over existing journal        | `bootstrap when the base already`            | Expected exit 1; received 0.                                  |
| Journal regular-blob mode                         | `journal stored as a Git symlink`            | Expected `regular blob`; received malformed-journal reason.   |
| Git replacement isolation for candidate selection | `trusted base`                               | Expected exit 0; received 1.                                  |
| Git replacement isolation for blob reads          | `selected journal blob`                      | Expected exit 0; received 1.                                  |
| Code-fence exclusion                              | `ignores fenced scenario headings`           | Expected exit 0; received 1.                                  |
| Active-copy conflict refusal                      | `archive copies but refuses conflicting`     | Expected exit 1; received 0.                                  |
| Reverse active-journal inventory check            | `removed identified heading`                 | Expected exit 1; received 0.                                  |
| Base and policy terms in evidence digest          | `evidence identity changes`                  | Expected unequal digests; received identical digest.          |

The final scoped run with `TOOL_WIKI_TRUSTED_NODE_MODULES` over the new
specifications tests, existing rules tests, repository policy tests and
candidate reader tests exited 0: 95 passes, 0 failures and 971 assertions in
112.76 seconds. After the staged policy-pin negative and guard proof were added,
the same four-file suite exited 0: 96 passes, 0 failures and 982 assertions in
113.86 seconds. The Burokrat spec TypeScript check and changed-file ESLint
exited 0 with empty output; `git diff --check` exited 0. OpenSpec validated
158/158 changes and specs. The package build test and full h2puni gate were
not run for this incremental, non-certifying rule slice. A working-snapshot
run against the actual repository and an
external copy of its tracked policy exited 1 with `conflicting active
specification copies: wbs-domain`. This is the deliberate fail-closed limit of
the current selector: it only collapses byte-identical active copies and does
not yet merge a sole unambiguous OpenSpec `MODIFIED` overlay. It also does not
prove scenario citation removal in the coverage table or a clean pilot API
target run. Task 2.2 remains open, along with Tasks 2.1 and 3.1.

## B3 requirement overlay selector checkpoint (2026-10-09)

Selector version 2 now reads every selected active spec as an immutable Git blob, parses top-level Markdown requirements, and applies `ADDED`, `MODIFIED`, and `REMOVED` by exact capability and title. It retains canonical order, sorts independent additions, rejects competing operations, missing predecessors, malformed operation sections, dropped canonical scenarios and removals without journal retirements. Identical synced `ADDED` requirements collapse into one lineage. The report and digest include every input path and content digest, effective requirements, source aliases (including journal sources), applied operations and removals. Archive copies are excluded. Task 2.2 remains open; this selector is not a coverage ledger or certification.

Production Burokrat specifications suite, final restored tree: `bun test apps/twilight-structure/twilight-burokrat/cli/src/rules/specifications.test.ts --timeout=60000` exited 0, 53 pass, 0 fail, 755 assertions. `bunx tsc -p apps/twilight-structure/twilight-burokrat/cli/tsconfig.lib.json --noEmit` exited 0. `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` exited 0, 158/158. Scoped ESLint initially found import ordering; `eslint --fix` corrected only that ordering. The final scoped ESLint check and `git diff --check` exited 0. Changed-file Prettier check found this newly appended verification section, which was then formatted.

R5 fault injections were applied one at a time to the production selector/rule, each restored in `finally` before the next. All thirteen named production negatives failed with the guard disabled: competing operation, retained canonical scenario, journal retirement, all-input identity, orphan heading, unknown operation, missing operation, scenario-free requirement, empty requirement inventory, empty active input inventory, duplicate canonical requirement, divergent synced copy, and unsupported rename. Probe runner: `/tmp/puni-overlay-guard-probes.ts`; each injected run exited 1. The earlier preimplementation red run failed eight overlay cases against the whole-file selector.

An immutable-blob probe of committed `6e5474044e768d67638444d0eefba3df9bec7aee` selected 224 active spec inputs and refused the first unsupported `RENAMED Requirements` section at `openspec/changes/gantt-calendar-axis/specs/wbs-domain/spec.md`. This is expected fail-closed behavior; current active changes need reconciliation before the candidate can pass. The citation-removal production ledger proof and clean API run remain open.

### Depth-one section and canonical requirement correction

The parser now ends requirement and operation sections at depth-one headings and admits main-spec requirements only under an exact `## Requirements` heading. Four production CLI negatives cover an orphan scenario after `# Notes`, an invented overlay requirement after `# Notes`, an invented canonical requirement after `# Notes`, and a canonical requirement under `## Notes`. They first failed against the previous parser and pass on the corrected selector. The older removed-heading fixture gained `## Requirements` so it still reaches its intended journal refusal. The existing missing-predecessor proof was corrected: disabling its guard caused `undefined is not an object (evaluating 'predecessor.scenarios')`, not an accepted lineage.

Each new safety boundary was fault injected and restored: omitting depth-one headings made the orphan test report allocator provenance instead of the orphan refusal; omitting the overlay operation reset accepted an invented requirement; omitting the canonical section reset accepted an invented requirement; disabling the canonical-section guard accepted a requirement under Notes. Each corresponding production test exited 1 at its intended assertion. The restored `specifications.test.ts` run exited 0 with 57 passes, 0 failures and 811 assertions. Scoped TypeScript, ESLint, changed-file Prettier and `git diff --check` exited 0; OpenSpec validation exited 0 with 158/158 valid items. The full gate was not run for this correction.

## Task 2.1 level runner guard checkpoint (2026-10-09)

The FE Unit and View level commands now remove both phase reports before their first Vitest phase. The SQLite API and Unit commands and core Unit command now remove stale JUnit, distinguish a failing `find` from an empty selection, and refuse `no-cases` before Bun can auto-discover an unrelated test. Aggregate target commands were not changed. Task 2.1 stays open for other levels and clean execution evidence.

Production-command tests were written first. The FE test initially failed both cases because stale first-phase XML survived the stubbed `bunx` exit 67. The expanded Bun test initially failed because the SQLite API command ran `unrelated.test.ts` and exited 0 on an empty selection. After the changes, `bunx vitest run vitest.view-level.test.ts --config vitest.node.config.ts` exited 0 with 4 passes, and `bun test tools/tool-devsync/src/test-levels.test.ts --timeout=60000` exited 0 with 61 passes and 124 assertions. A Vite native-config advisory appeared on the FE run; it did not affect the result.

R5 injections against each changed Bun command were restored after each run. Removing its `rm` left stale XML readable; changing its empty guard from `$files` to `never` let Bun run `unrelated.test.ts`; changing `&& if` to `; if` mislabeled a failed `find` as `no-cases`. All nine injected runs failed the same production-command test. Removing the pre-phase `rm` from each FE target left stale XML readable when stubbed `bunx` exited 67; both named tests failed. All commands were restored.

Scoped `bunx tsc -p tools/tool-devsync/tsconfig.json --noEmit` and `bunx tsc -p apps/wbs/fe-01/tsconfig.json --noEmit` exited 0. Changed-file ESLint initially found an unnecessary optional chain; after correction it exited 0. Changed-file Prettier and `git diff --check` exited 0. `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` exited 0 with 158/158 valid items.

A broader `bun test tools/tool-devsync/src/workspace-targets.test.ts --timeout=60000` run exited 1 with 19 passes and 3 failures. Fresh failures: source conformance discovery included `wbs-store-memory:test:unit:level` beyond the expected map; the agent-shell output-variable audit named five existing level targets; the fast-tier audit missed `shared-test-evidence` and `shared-test-levels`. These are open Task 2.1 audit gaps. A clean SQLite API run, full FE phase runs and the h2puni gate were not run in this slice.

### Task 2.1 workspace target audit correction — 2026-10-09

Commit `ed9fd62635a9c9cb3fb9c04795291e1110e7c900` resolved the three audit findings above. The conformance inventory now evaluates declared selectors with the production `parseLevelCommand` and `collectedFiles` functions, recognizes both Conformance level targets, and proves the memory Unit selector excludes its Conformance fixture. The five level targets named by the output-variable audit now set `CLAUDECODE=0` and `AGENT=0`. Both `shared-test-evidence` and `shared-test-levels` now declare `test:unit` targets and are included in the root fast tier.

| Check or injected fault                                                     | Fresh result                                                                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `bun test tools/tool-devsync/src/workspace-targets.test.ts --timeout=60000` | Exit 0; 22 passed, 0 failed, 77 assertions.                                                             |
| Remove the memory Unit `! -path` exclusion                                  | Named audit assertion failed because its Conformance fixture became a Unit collection member. Restored. |
| Remove the memory Conformance selector                                      | Named audit assertion failed because the declared Conformance level target disappeared. Restored.       |
| `bunx nx run shared-test-evidence:test:unit --skip-nx-cache`                | Exit 0; 11 passed.                                                                                      |
| `bunx nx run shared-test-levels:test:unit --skip-nx-cache`                  | Exit 0; 4 passed.                                                                                       |
| Memory Unit and Conformance; SQLite Conformance targets                     | Each exited 0; 73 tests passed.                                                                         |
| TypeScript, ESLint, Prettier, strict OpenSpec validation, diff check        | Each exited 0; OpenSpec reported 158/158.                                                               |

This resolves those three target-audit gaps. FE Unit still fails under this sandbox with `spawnSync bun EPERM`; FE View still produces a zero-byte UTC report and no Auckland report and was interrupted after about two minutes. SQLite API still has three sandbox write-lock-holder `EPERM` failures. These execution results remain unverified; the h2puni gate was not run.

### Browser collector checkpoint — 2026-10-09

The additive ordinary, packaged and portable Browser level targets call one detached-checkout collector. It performs JSON-only discovery, JSON plus raw JUnit execution, exact case and outcome reconciliation, and separate normalized JUnit/manifest renames. The companion manifest retains raw artifact digests, build artifact digest where applicable, selected environment and Burokrat candidate identity, and declares `certifies:false`.

`bun test tools/tool-devsync/src/browser-level.test.ts tools/tool-devsync/src/browser-playwright.test.ts` exited 0 on the restored tree with 14 passes and 52 assertions. Scoped ESLint and `bunx tsc --build --force tools/tool-devsync/tsconfig.json` exited 0. Each of 23 Browser JSON/JUnit parser guard removals failed a named negative, then the source was restored. Twelve collector-helper guard removals likewise failed named production-path negatives: stale pointer removal, dirty candidate, hidden index flag, moved revision, UTF-8, malformed JSON, timeout, invalid port shift, invalid regular Chromium selection, changed config bytes, changed artifact bytes and nonzero command exit. These probes do not certify the collector; their failure modes prove the local checks can break.

Final restored-tree broader checks: Browser plus shared test-evidence tests exited 0 with 25 passes, 0 failures and 85 assertions. Scoped ESLint and devsync TypeScript exited 0. `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` exited 0 with 158/158 valid items.

The sandboxed portable collector executed a fresh build, JSON discovery and JSON/JUnit run on committed `4c3dedbea`; it wrote a failing normalized report with 1 pass, 1 failure and exited 1. Its raw JSON records Chromium's `sandbox_host_linux.cc` fatal `Operation not permitted` while launching the second case. The same committed command was then approved for unsandboxed execution and exited 0. Its fresh normalized JUnit reports 2 tests, 0 failures, 0 skips and binds the portable test file; the worktree remained clean. Earlier historical two-pass evidence and the list-only two-skipped report are distinct from this current collector run. Ordinary and packaged modes, Burokrat consumption and classification of Browser evidence, an externally authenticated receipt, and Burokrat byte verification remain open. Task 2.1 remains open.

### Browser collector review fixes — 2026-10-09

The collector now kills the entire detached process group on timeout and rejects at its deadline, even when a descendant inherited the output pipes. Execution JSON with an intentionally skipped opt-in case is preserved as `skipped`; raw and normalized JUnit must agree, and a run with only skipped cases is refused. The manifest records passing and skipped counts separately. Packaged and portable modes inventory every regular served file with a path and digest after build, then compare the whole inventory after discovery and execution. New, changed, symlinked, special and absent served files are refused.

Each invocation writes discovery, execution, raw JUnit, normalized XML and manifest to an immutable bundle. A single atomic rename publishes `tmp/junit/browser/<mode>.current.json`; `readBrowserPublication` pins that pointer and checks the immutable XML/manifest binding. Legacy shared XML and manifest files are removed and ignored by the reader. The report remains `certifies:false`; this is operational collection evidence, pending independent Burokrat verification and authenticated invocation receipt.

Focused restored-tree Browser tests exited 0 with 19 passes, 0 failures and 85 assertions. A real descendant inherited both pipes, the timed-out call returned in under 300 ms, and its delayed marker was absent after 500 ms. The concurrent bundle test published two invocations and verified the selected XML/manifest pair; mutation and forged-pointer negatives were refused. Twelve guard-disabled probes each failed its named negative and were restored: direct-child-only kill, disabled deadline rejection, skip decoder, all-skipped guard, served-inventory comparison, root symlink, nested symlink, special-file guard, empty inventory, atomic pointer rename, report digest comparison and pointer bundle identity. A changed JS asset, changed CSS asset and inserted file each failed the production input comparison.

Scoped TypeScript initially exited 0; ESLint found one test arrow style error, which was fixed. Final restored-tree `bun test` exited 0 with 19 passes, 0 failures and 85 assertions. `bunx tsc --build --force tools/tool-devsync/tsconfig.json`, scoped ESLint, changed-file Prettier, `git diff --check` and strict OpenSpec validation all exited 0; OpenSpec reported 158/158 valid items. The revised collector has not yet had a real portable, ordinary or packaged execution, and the h2puni gate was not run; Task 2.1 remains open.

### Browser current-pointer ownership fix — 2026-10-09

The collector now admits each mode attempt under a short filesystem lock, replaces that mode's owner token and removes its previous current pointer before candidate preflight. Publication requires the same owner token under that lock. Lock contention is bounded; refusal removes the pointer. A failed admitted invocation leaves no current pointer, and a newer failed attempt prevents an older concurrent collector from publishing. Immutable bundles and the atomic pointer rename remain in place; the manifest still declares `certifies:false`.

Production-path negatives observed a readable successful pointer followed by a dirty candidate refusal, then `readBrowserPublication` refused with `ENOENT`. A deterministic overlapping invocation admitted a newer attempt, failed it, then released the older publisher; the older publisher refused with `ownership changed` and no current pointer was readable. A stuck lock refused at its deadline and cleared prior success; a subsequent invocation after a throwing owner was admitted and published successfully.

Guard-disabled probes were restored after each run: removing admission pointer invalidation made the success-then-dirty test fail because the reader unexpectedly succeeded; disabling the owner comparison made the concurrent test fail because the older publisher unexpectedly succeeded; removing lock-refusal invalidation made the stuck-lock test fail because the reader unexpectedly succeeded; disabling the lock deadline left the stuck-lock test pending until external `timeout` exited 124. The first test run after adding the new API failed at the missing `withBrowserInvocation` export, then the restored implementation passed the three focused tests.

Final restored-tree checks: `bun test tools/tool-devsync/src/browser-level.test.ts tools/tool-devsync/src/browser-playwright.test.ts --timeout=60000` exited 0 with 21 passes, 0 failures and 99 assertions. Devsync TypeScript build, scoped ESLint, changed-file Prettier and `git diff --check` exited 0. Strict OpenSpec validation exited 0 with 158/158 valid items. No revised real Browser mode run or h2puni gate was performed for this fix; Task 2.1 remains open.

### Browser timed-out admission revocation — 2026-10-09

A newer Browser attempt that times out waiting for the mode lock now atomically replaces the mode owner token before clearing the current pointer. Invocation publications carry that token in a version 2 pointer; the reader compares it to the current owner. This also rejects a late pointer from a publisher that had already passed its ownership check when the timeout occurred. A later attempt may conservatively refuse if it races with revocation.

The combined production-path regression admitted and paused A, held the mode lock, timed out B, released the lock and A, then observed A refuse with `ownership changed` and no readable pointer. It also published a simulated in-flight A bundle carrying the old token and observed the reader refuse with `ownership changed`. Before the fix, the regression failed because A unexpectedly published. Disabling owner-token revocation made the regression fail at A's expected refusal; disabling the reader token comparison made it fail at the simulated late pointer's expected refusal. Each mutation was restored.

Final restored-tree Browser tests exited 0 with 22 passes, 0 failures and 107 assertions. Devsync TypeScript build, scoped ESLint and Prettier exited 0. Strict OpenSpec validation reported 158/158 valid items. The h2puni gate and real mode collection were not run for this race fix; Task 2.1 remains open.

### Browser request-generation race fix — 2026-10-09

An attempt now atomically writes a unique `portable.latest-request` (or the corresponding mode) before waiting for the admission lock. The most recent completed request-token rename is the authority. Admission checks that token before and after owner rename; publication checks it before and after writing the bundle. A timed-out newer attempt leaves its token current. It does not overwrite the owner or delete a later attempt's pointer. A subsequent attempt may supersede it. The pointer reader accepts only version 2 pointers and requires the pointer owner to equal both the owner file and latest-request file; missing or unreadable trusted files refuse. These publication artifacts still have `certifies:false`.

The admission-paused A/B-timeout regression was introduced before the protocol change. With only the pause hook added, it failed because A unexpectedly succeeded. With request generation in place, A refused before collection, left no owner or readable pointer, and a later C published successfully. Separate deterministic negatives pause A after owner rename and during pointer staging, time out B, and verify A cannot finish collection or report publication success. An admitted A/B-timeout regression also checks that A creates no bundle; a simulated late A pointer remains unreadable. The reader test distinguishes missing latest-request (`ENOENT`) from unreadable latest-request (`EISDIR`).

Six guard-disabled probes were restored after each run and each failed its named negative: skipping the atomic request rename (missing generation), removing either admission comparison (A writes owner or enters collection), removing the pre-bundle comparison (A creates a bundle), removing the post-bundle comparison (A reports success), and removing the reader comparison (late A pointer becomes readable). The new generation token is never cleared by an older attempt's cleanup. Prior owner-revocation and lock-timeout pointer-removal behavior in the preceding section is superseded by this protocol.

Final restored-tree checks: Browser collector and Playwright boundary tests exited 0 with 25 passes, 0 failures and 132 assertions. Devsync TypeScript build, scoped ESLint, changed-file Prettier and `git diff --check` exited 0. OpenSpec validation exited 0 with 158/158 valid items. A real Browser mode run and the h2puni gate were not run for this race fix; Task 2.1 remains open.

### Burokrat Browser diagnostic consumer — 2026-10-09

The `inspect-browser` command now reads one committed candidate and an external RulePolicy Browser mode pin. It pins the current pointer, validates owner and latest-request tokens, reads required bundle files as regular files without symlinks, independently parses raw discovery/run JSON and both JUnit documents, reconciles exact case identities/outcomes/counts/config/project/runner version and candidate config bytes, checks the declared served inventory shape, then rechecks pointer and tokens. The pure Playwright reporter contract moved to shared test-evidence so collector and consumer use the same decoder without a Devsync import. The diagnostic emits `observedCases`, `authentication:{kind:'absent'}` and `certifies:false`; it has no verified coverage output or rule integration.

Focused Browser consumer and shared reporter tests exited 0 with 23 passes, 0 failures and 69 assertions after the XML structural and all-skipped negatives were added. The production CLI positive printed diagnostic observations, and a staged selection was refused. Focused negatives covered stale owner/request tokens, pointer and token changes during inspection, missing and symlinked bundle files, non-UTF-8 discovery, mismatched raw digest, manifest case, normalized JUnit and config policy, unsafe pointer, malformed XML, invalid served inventory path/digest/duplicate, and unexpected selection environment. Six guard-disabled probes failed their named negative (external mode pin, candidate config digest, symlink refusal, stale token, manifest case parity and all-skipped refusal); each source was restored before the next probe. `bunx tsc --noEmit` for the Burokrat library and devsync exited 0. The Burokrat spec typecheck exited 1 at unchanged `rules/specifications.test.ts:757` because its expected removal shape includes `capability` beyond the declared `{title,ids}` type; this test file was outside the Browser slice. OpenSpec strict validation reported 158/158 valid items.

The bundle does not include Playwright process exit status, build artifact bytes, or an authenticated collector receipt. The diagnostic cannot independently attest process success or recompute served artifact digests. The h2puni gate and a real revised Browser mode run were not performed for this slice. Task 2.1 remains open.

### Browser diagnostic review correction — 2026-10-09

The shared raw JUnit parser now rejects a second outcome child in one testcase. A production `inspect-browser` fixture with a passing case and a skipped case carried `<failure/><skipped/>` for the skipped case, while its JSON cases and root counts matched the later skipped status. Before the guard, the CLI exited 0 and the named negative failed; with the guard, it exited 1 with `Browser JUnit duplicate outcome`. This remains diagnostic observation only: `authentication:{kind:'absent'}`, `certifies:false`, and no verified coverage.

Two existing regular-file proof claims now have production-path negatives. A committed candidate without the pinned config received the named candidate-blob refusal; disabling that guard failed the named test with a TypeError reading `entry.blob`. A directory at `manifest.json` received the named regular-file refusal; disabling that guard failed the named test with `EISDIR`. Both guards were restored, and their adjacent `Proof:` comments now state the observed failures. The Burokrat specifications test fixture's removal type now includes its actual `capability` field, with no cast or weakened contract.

The focused Browser suite exited 0 with 15 passes and 37 assertions. Burokrat `tsc -p .../tsconfig.spec.json --noEmit`, scoped ESLint, changed-file Prettier and `git diff --check` exited 0. OpenSpec strict validation exited 0 with 158/158 valid items. An expanded run of shared test-evidence and Browser tests exited 1 with 25 passes and 1 failure: Node v24.20.0 could not resolve the extensionless `./browser-playwright` import in shared `index.ts` during its Bun/Node digest-vector test. Explicit `.ts` specifiers on that export and the parser's import made the test pass 11/11, and `tsc --rewriteRelativeImportExtensions` accepted them; the repository compiler policy does not yet enable that option. This runtime boundary remains open pending the compiler-policy decision.

The bundle still omits process exit status and an authenticated collector receipt. Packaged and portable served artifact bytes remain unavailable to this consumer, so it cannot recompute their digests. A real revised Browser mode run and the h2puni gate were not run for this correction. Task 2.1 remains open.

### Task 2.1 Architecture first-rule runner — 2026-10-09

`twilight-burokrat:test:architecture:level` is an additive Nx target. Its versioned fixture map currently adopts **only MOD-INDEX**, whose dedicated Architecture test calls the real `check committed` CLI with an unindexed candidate and requires its non-certifying refusal (`certifies:false`). The runner clears old JUnit before reading the map, validates the registered rule and exact rule-named `.architecture.test.ts` file selection, refuses missing or non-regular files and a missing selector directory, and requires a passing testcase for each selected file. Other registered rules have no Architecture mapping yet; this is one Task 2.1 slice, not level or task completion. Existing targets were not renamed or repurposed.

The focused suite exited 0 with 10 passes, 0 failures and 42 assertions. The uncached Nx target exited 0, collected one Architecture file and wrote `tmp/junit/twilight-burokrat.architecture.xml` with one testcase. Burokrat TypeScript build, scoped ESLint, changed-file Prettier and `git diff --check` exited 0. Strict OpenSpec validation reported `Change 'test-axes' is valid`. Nx printed a denied plugin-worker socket warning and ran its plugin in the main process; the target itself ran and printed its testcase.

Production-path negatives covered empty and missing mapping, unknown or duplicate rule, mixed-level Unit file, one rule mapped to another rule's negative, missing or symlinked mapped fixture, unmapped Architecture file, missing selector directory, failing fixture, all-skipped fixture and stale JUnit removal. Disabling each corresponding runner guard made its named test fail; removing the JUnit outfile dependency made the fresh-report test fail. Replacing MOD-INDEX registry evaluation with an empty observed result made its new negative fixture fail because the CLI exited 0 instead of 1. Each probe restored its source. The h2puni gate was not run for this incomplete Task 2.1 slice; the target report remains operational test evidence and grants no certification.

Review correction: the production runner now has a malformed-policy negative. With `schemaVersion:2`, it refused before Bun ran and left no stale JUnit. Replacing `parseOrThrow` with a trust cast made the named test fail because the runner exited 0. The Architecture-file guard's Proof comment now records its actual disabled-guard behavior: the later exact rule-file check refused `src/unit.test.ts` with the wrong diagnosis, and the mixed-level test failed. Both probes restored the source. The focused suite exited 0 with 11 passes, 0 failures and 45 assertions; scoped TypeScript, ESLint and Prettier exited 0. Task 2.1 remains open.

### Task 2.1 Architecture INV-CLASSIFY fixture — 2026-10-09

The fixture map now also adopts `INV-CLASSIFY` at its exact rule-named Architecture file. Its negative creates and commits `unknown.zzz`, runs the real `check committed --rule INV-CLASSIFY` CLI with the shipped classification policy, and requires exit 1, `allowed:false`, `certifies:false`, no findings, and the exact unevaluated reason `ordinary content unknown.zzz matched 0 classification rules`. The existing `MOD-INDEX` fixture and target contract remain in place.

Red: before mapping the new file, `bun src/architecture-level.ts . ../../../../tmp/junit/twilight-burokrat.architecture.xml` exited 1 at `unmapped architecture fixture: src/architecture/inv-classify.architecture.test.ts`. Green: after mapping, the same command exited 0 with 2 passes across 2 files. For the R5 production-path probe, I removed the `classifyEntries` call from `rules/registry.ts`; `bun test src/architecture/inv-classify.architecture.test.ts --timeout=60000` exited 1 in the named test with `Expected: 1` and `Received: 0` at its CLI exit assertion. I restored the call before final checks. The adjacent `Proof:` comment records the fault and observation.

Final focused `bun test` over `architecture-level.test.ts` and both mapped fixtures exited 0: 12 passes, 0 failures, 50 assertions. This includes the exact rule-to-file, empty map, selected-file, unmapped-file and all-skipped guards. Uncached `NX_DAEMON=false bunx nx run twilight-burokrat:test:architecture:level --skip-nx-cache` exited 0 and printed 2 passes. Fresh `tmp/junit/twilight-burokrat.architecture.xml` has exactly two testcases: one each for `INV-CLASSIFY` and `MOD-INDEX`, with zero failures and zero skips. Scoped Burokrat spec typecheck, ESLint, changed-file Prettier and `git diff --check` exited 0. Nx used its main-process plugin fallback after a denied worker socket. The pinned `bunx @fission-ai/openspec@1.12.0 validate --all --json` exited 0 with 158 passed and 0 failed items; its `validate test-axes --strict` form exited 0 with `Change 'test-axes' is valid`. The h2puni gate was not run for this bounded slice. This is operational test evidence only, with no certification. Task 2.1 remains open.

### Task 2.1 Architecture MOD-DIRECT-ENTRIES fixture — 2026-10-09

The exact rule-named fixture map now also adopts `MOD-DIRECT-ENTRIES`. Its dedicated negative commits a candidate whose root module index declares 41 direct entries, runs the real `check committed --rule MOD-DIRECT-ENTRIES` CLI with external policy enforcing only that rule, and requires exit 1, `allowed:false`, `certifies:false`, no unevaluated rules, and one `refusal` finding at `README.md` with `index declares 41 direct entries, limit 40`. A missing declaration would leave the shared index report unavailable and exercise the rule's prerequisite refusal instead of its own limit, so the candidate keeps all 41 declarations present. `MOD-INDEX` and `INV-CLASSIFY` remain mapped.

R5 production-path probe: replacing the registry's `reviewDebt.map` observations with an empty list made `bun test apps/twilight-structure/twilight-burokrat/cli/src/architecture/mod-direct-entries.architecture.test.ts` exit 1 in the named test: the actual CLI returned 0 while the fixture expected 1. Restoring the mapping made the fixture pass. Its adjacent `Proof:` comment records that fault and observation.

After restoration, focused `bun test` over `architecture-level.test.ts` and all three mapped fixtures exited 0: 13 passes, 0 failures, 55 assertions. The uncached `NX_DAEMON=false bunx nx run twilight-burokrat:test:architecture:level --skip-nx-cache` exited 0 with 3 passes across exactly 3 Architecture files. Its fresh `tmp/junit/twilight-burokrat.architecture.xml` named one testcase per mapped rule, with zero failures and zero skips. `bunx tsc --project apps/twilight-structure/twilight-burokrat/cli/tsconfig.json --noEmit`, scoped ESLint, changed-file Prettier and `git diff --check` exited 0. The pinned `bunx @fission-ai/openspec@1.12.0 validate --all --json` exited 0 with 158 passed and 0 failed items. Nx again used its main-process plugin fallback after a denied worker socket. The h2puni gate was not run for this bounded slice; this remains operational test evidence, not certification. Task 2.1 remains open.

### Task 2.1 Architecture F7 fixture — 2026-10-09

The fourth exact rule-named fixture mapping adopts `F7` while preserving `MOD-INDEX`, `INV-CLASSIFY` and `MOD-DIRECT-ENTRIES`. Its dedicated negative commits a 50-line `src/large.ts` and writes the rule policy outside the candidate repository. That policy sets ceiling 40, pins the file at maximum 45 and enforces F7. The real `check committed --rule F7` CLI must exit 1 with `allowed:false`, `certifies:false`, no unevaluated rules and exactly one `refusal` finding at `src/large.ts`: `50 lines exceeds its pinned maximum 45`.

Red: before adding the mapping, `bun src/architecture-level.ts . ../../../../tmp/junit/twilight-burokrat.architecture.xml` exited 1 with `unmapped architecture fixture: src/architecture/f7.architecture.test.ts`. After mapping, the focused fixture passed. R5 production-path probe: replacing F7's registry observations with `[]` made `bun test src/architecture/f7.architecture.test.ts --timeout=60000` fail in the named test, with CLI exit 0 against expected 1. The registry was restored; the adjacent `Proof:` comment records the fault and observation.

Final focused suite over `architecture-level.test.ts` and the four mapped fixtures exited 0: 14 passes, 0 failures and 60 assertions. Uncached `NX_DAEMON=false bunx nx run twilight-burokrat:test:architecture:level --skip-nx-cache` exited 0 with four passes. Its fresh nonempty JUnit report had exactly four distinct rule-named testcases, zero failures and zero skips. Scoped Burokrat TypeScript, F7 ESLint, changed-file Prettier and pinned `@fission-ai/openspec@1.12.0 validate test-axes --strict` each exited 0; OpenSpec reported `Change 'test-axes' is valid`. Nx used its main-process plugin fallback after its worker socket was denied. The h2puni gate was not run for this bounded slice. Task 2.1 remains open and this target report grants no certification.

### Task 2.1 Architecture MOD-LAYOUT fixture — 2026-10-09

The fifth exact rule-named fixture mapping adopts `MOD-LAYOUT` while retaining the four existing mappings. Its dedicated negative commits a candidate with a module index at `src/m/README.md` and a kinded `src/m/m.feature.ts`, but no `src/m/contract.ts`. The external policy enforces only MOD-LAYOUT. The real `check committed --rule MOD-LAYOUT` CLI exits 1 with `allowed:false`, `certifies:false`, `unevaluated:[]`, and exactly one `refusal` finding at `src/m`: `module directory declares no contract file`.

Red: before mapping, `bun src/architecture-level.ts . ../../../../tmp/junit/twilight-burokrat.architecture.xml` exited 1 with `error: unmapped architecture fixture: src/architecture/mod-layout.architecture.test.ts`. R5 production-path probe: replacing the registry's `moduleLayoutObservations(...)` with `[]` made `bun test src/architecture/mod-layout.architecture.test.ts --timeout=60000` exit 1 in the named test: `Expected: 1`, `Received: 0` for the CLI exit code. The registry call was restored; the adjacent `Proof:` comment records the fault and observation.

After restoration, focused `bun test` over `architecture-level.test.ts` and all five mapped fixtures exited 0: 15 passes, 0 failures, 65 assertions across six files. Uncached `NX_DAEMON=false bunx nx run twilight-burokrat:test:architecture:level --skip-nx-cache` exited 0 with 5 passes. The fresh `tmp/junit/twilight-burokrat.architecture.xml` names exactly five distinct rule cases, with zero failures and zero skips. Scoped Burokrat TypeScript, MOD-LAYOUT ESLint, changed-file Prettier and pinned `bunx @fission-ai/openspec@1.12.0 validate test-axes --strict` each exited 0; OpenSpec reported `Change 'test-axes' is valid`. Prettier required one formatting edit before the clean check. Nx used its main-process plugin fallback after its worker socket was denied. The h2puni gate was not run for this bounded slice. Task 2.1 remains open; this operational target report grants no certification.

### Task 2.1 Architecture REL-EXTRACT fixture — 2026-10-09

The sixth exact rule-named fixture mapping adopts `REL-EXTRACT` and retains the previous five mappings. Its dedicated negative commits a candidate with a declared `dynamic-shell-read` relationship whose selected endpoints have no resolvable selector. The external policy configures the TypeScript relationship extractor, selects REL-EXTRACT and enforces it. The real `check committed --rule REL-EXTRACT` CLI returns exit 1, `allowed:false`, `certifies:false`, `unevaluated:[]`, and exactly one `refusal` finding at `.` with subject `dynamic-shell-read` and message `declared relationship is unresolved: the shell computes the variable name at runtime`.

Red: before mapping the fixture, `bun src/architecture-level.ts . ../../../../tmp/junit/twilight-burokrat.architecture.xml` exited 1 with `unmapped architecture fixture: src/architecture/rel-extract.architecture.test.ts`. R5 production-path probe: replacing the registry's unresolved observations with `[]` made `bun test src/architecture/rel-extract.architecture.test.ts --timeout=60000` fail in the named test. The CLI returned exit 0 with `allowed:true`, `findings:[]`, while the test expected exit 1. The registry was restored; the adjacent `Proof:` comment records this observation.

After restoration, the focused suite over `architecture-level.test.ts` and all six mapped fixtures exited 0: 16 passes, 0 failures and 70 assertions across seven files. Uncached `NX_DAEMON=false bunx nx run twilight-burokrat:test:architecture:level --skip-nx-cache` exited 0 with six passes. Its fresh `tmp/junit/twilight-burokrat.architecture.xml` contains exactly six distinct rule testcases, zero failures and zero skips. Scoped Burokrat TypeScript, REL-EXTRACT ESLint, changed-file Prettier, `git diff --check`, and pinned `bunx @fission-ai/openspec@1.12.0 validate test-axes --strict` each exited 0; OpenSpec reported `Change 'test-axes' is valid`. Nx used its main-process plugin fallback after its worker socket was denied. The h2puni gate was not run for this bounded slice. Task 2.1 remains open; this operational report grants no certification.

### Task 2.1 Architecture F1 fixture — 2026-10-09

The seventh rule-named mapping adds F1 and preserves the six existing fixtures. Its dedicated negative commits `src/m/store.ts` with a type import from `react`, and an external policy declares that path plain TypeScript and enforces F1. The candidate includes the Nx workspace and TypeScript relationship inputs. The real `check committed --rule F1` CLI returns exit 1, `allowed:false`, `certifies:false`, `unevaluated:[]`, and exactly one `refusal` finding at `src/m/store.ts`, subject `external:react`, with message `declared plain TypeScript imports external:react through 'react'`.

Red: before mapping the fixture, `bun src/architecture-level.ts . ../../../../tmp/junit/twilight-burokrat.architecture.xml` exited 1 with `unmapped architecture fixture: src/architecture/f1.architecture.test.ts`. R5 production-path probe: replacing F1's `reactObservations(...)` in `rules/registry.ts` with `[]` made the focused fixture fail. The real CLI returned exit 0, `allowed:true`, `findings:[]`, `unevaluated:[]`; the test expected exit 1. The registry source was restored byte for byte with `cmp`; its diff is empty. The adjacent `Proof:` comment records the fault and observation.

After restoration, the focused suite over `architecture-level.test.ts` and all seven mapped fixtures exited 0: 17 passes, 0 failures and 75 assertions across eight files. Uncached `NX_DAEMON=false bunx nx run twilight-burokrat:test:architecture:level --skip-nx-cache` exited 0 with seven passes across exactly seven Architecture files. Its fresh `tmp/junit/twilight-burokrat.architecture.xml` contains seven distinct rule cases, zero failures and zero skips. Scoped Burokrat TypeScript, F1 ESLint, changed-file Prettier, `git diff --check`, and pinned `bunx @fission-ai/openspec@1.12.0 validate test-axes --strict` exited 0; OpenSpec reported `Change 'test-axes' is valid`. Nx used its main-process plugin fallback after its worker socket was denied. The h2puni gate was not run for this bounded slice. Task 2.1 remains open; this operational report grants no certification.

### Task 2.1 Architecture K2 fixture — 2026-10-09

The eighth exact rule-named mapping adds K2 and preserves the previous seven fixtures. Its dedicated negative commits `src/b/view/panel.ts` importing `src/a/a.resource.ts`; a feature file establishes `src/b` as the delivery file's module root. The candidate includes a root module index and TypeScript relationship inputs. An external policy enforces only K2. The real `check committed --rule K2` CLI returns exit 1, `allowed:false`, `certifies:false`, `unevaluated:[]`, and exactly one `refusal` finding at `src/b/view/panel.ts`, subject `src/a/a.resource.ts`, with message `delivery imports resource src/a/a.resource.ts through '../../a/a.resource'`.

Red: before mapping the new file, the Architecture runner exited 1 with `unmapped architecture fixture: src/architecture/k2.architecture.test.ts`. The first focused CLI run also showed why the candidate needs a source module root: without `src/b/b.feature.ts`, K2 returned `findings:[]` and exit 0. With that valid root, the fixture passed. R5 production-path probe: replacing the registry's `directionObservations(graph, imports, direction)` with `[]` made the named focused K2 fixture fail. The real CLI returned exit 0, `allowed:true`, `findings:[]`, `unevaluated:[]` against the expected exit 1. The registry call was restored; the adjacent `Proof:` comment records the fault and observation.

After restoration, `bun test src/architecture-level.test.ts src/architecture/*.architecture.test.ts --timeout=60000` exited 0 with 18 passes, 0 failures and 80 assertions across nine files. Uncached `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-test-axes-nx-k2 bunx nx run twilight-burokrat:test:architecture:level --skip-nx-cache` exited 0 with eight passes. The fresh JUnit report contains eight distinct rule testcases, zero failures and zero skips. Scoped Burokrat spec typecheck, K2 ESLint, changed-file Prettier and `git diff --check` exited 0. Pinned `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate test-axes --strict` exited 0 with `Change 'test-axes' is valid`. The h2puni gate was not run for this bounded slice; Task 2.1 remains open and this target report grants no certification.

### Task 2.1 Architecture K3 fixture — 2026-10-09

The ninth exact rule-named mapping adds K3 and preserves the previous eight fixtures. Its dedicated negative commits `src/m/m.feature.ts` importing `src/m/m.repository.ts`, with the same import and kind suffixes as the existing K3 rule test. The candidate includes a root module index and TypeScript relationship inputs. An external policy enforces only K3. The real `check committed --rule K3` CLI returns exit 1, `allowed:false`, `certifies:false`, `unevaluated:[]`, and exactly one `refusal` finding at `src/m/m.feature.ts`, subject `src/m/m.repository.ts`, with message `feature imports repository src/m/m.repository.ts through './m.repository'`.

Red: before mapping the new file, the Architecture runner exited 1 with `unmapped architecture fixture: src/architecture/k3.architecture.test.ts`. R5 production-path probe: replacing the registry's `directionObservations(graph, imports, direction)` with `[]` made the named focused K3 fixture fail. The real CLI returned exit 0, `allowed:true`, `findings:[]`, `unevaluated:[]` against the expected exit 1. The registry call was restored; the adjacent `Proof:` comment records the fault and observation.

After restoration, `bun test src/architecture-level.test.ts src/architecture/*.architecture.test.ts --timeout=60000` exited 0 with 19 passes, 0 failures and 85 assertions across ten files. Uncached `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-test-axes-nx-k3 bunx nx run twilight-burokrat:test:architecture:level --skip-nx-cache` exited 0 with nine passes. The fresh JUnit report contains nine distinct rule testcases, zero failures and zero skips. Scoped Burokrat spec TypeScript, K3 ESLint, changed-file Prettier and `git diff --check` exited 0. Pinned `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate test-axes --strict` exited 0 with `Change 'test-axes' is valid`. The h2puni gate was not run for this bounded slice; Task 2.1 remains open and this target report grants no certification.

### Task 2.1 Architecture K4 fixture — 2026-10-09

The tenth exact rule-named mapping adds K4 and preserves the previous nine fixtures. Its dedicated negative commits `src/m/m.resource.ts` importing `src/m/m.feature.ts`, matching the import and kind suffixes of the existing K4 rule test. The candidate includes a root module index and TypeScript relationship inputs. An external policy enforces only K4. The real `check committed --rule K4` CLI returns exit 1, `allowed:false`, `certifies:false`, `unevaluated:[]`, and exactly one `refusal` finding at `src/m/m.resource.ts`, subject `src/m/m.feature.ts`, with message `resource imports feature src/m/m.feature.ts through './m.feature'`.

Red: before mapping the new file, the Architecture runner exited 1 with `unmapped architecture fixture: src/architecture/k4.architecture.test.ts`. R5 production-path probe: replacing the registry's `directionObservations(graph, imports, direction)` with `[]` made the named focused K4 fixture fail. The real CLI returned exit 0, `allowed:true`, `findings:[]`, `unevaluated:[]` against the expected exit 1. The registry call was restored byte for byte with `cmp`; the adjacent `Proof:` comment records the fault and observation.

After restoration, the focused K4 test exited 0 with one pass and five assertions. `bun test src/architecture-level.test.ts src/architecture/*.architecture.test.ts --timeout=60000` exited 0 with 20 passes, 0 failures and 90 assertions across 11 files. Uncached `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-test-axes-nx-k4 bunx nx run twilight-burokrat:test:architecture:level --skip-nx-cache` exited 0 with ten passes. The fresh JUnit report contains ten distinct rule testcases, zero failures and zero skips. Scoped Burokrat spec TypeScript, K4 ESLint, changed-file Prettier and `git diff --check` exited 0. Pinned `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate test-axes --strict` exited 0 with `Change 'test-axes' is valid`. The h2puni gate was not run for this bounded slice; Task 2.1 remains open and this target report grants no certification.

### Task 2.1 Architecture K5 fixture — 2026-10-09

The eleventh exact rule-named mapping adds K5 and preserves the previous ten fixtures. Its dedicated negative commits `src/m/m.repository.ts` importing `src/m/m.resource.ts`, matching the existing K5 rule test. The candidate includes a root module index and TypeScript relationship inputs. An external policy enforces only K5. The real `check committed --rule K5` CLI returns exit 1, `allowed:false`, `certifies:false`, `unevaluated:[]`, and exactly one `refusal` finding at `src/m/m.repository.ts`, subject `src/m/m.resource.ts`, with message `repository imports resource src/m/m.resource.ts through './m.resource'`.

Red: before mapping the new file, the Architecture runner exited 1 with `unmapped architecture fixture: src/architecture/k5.architecture.test.ts`. R5 production-path probe: replacing the registry's `directionObservations(graph, imports, direction)` with `[]` made the named focused K5 fixture fail. The real CLI returned exit 0, `allowed:true`, `findings:[]`, `unevaluated:[]` against the expected exit 1. The registry call was restored; the adjacent `Proof:` comment records the fault and observation.

After restoration, `bun test src/architecture-level.test.ts src/architecture/*.architecture.test.ts --timeout=60000` exited 0 with 21 passes, 0 failures and 95 assertions across 12 files. Uncached `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-test-axes-nx-k5 bunx nx run twilight-burokrat:test:architecture:level --skip-nx-cache` exited 0 with 11 passes. The fresh JUnit report contains 11 distinct rule cases, zero failures and zero skips. Task 2.1 remains open; this operational report grants no certification.

Scoped Burokrat spec TypeScript, K5 ESLint, changed-file Prettier and `git diff --check` each exited 0. Pinned `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate test-axes --strict` exited 0 with `Change 'test-axes' is valid`. The h2puni gate was not run for this bounded slice.

### Task 2.1 Architecture K6 fixture — 2026-10-09

The twelfth exact rule-named mapping adds K6 and preserves the previous eleven fixtures. Its dedicated negative commits `src/b/b.feature.ts` importing `src/a/a.feature.ts`, matching the existing K6 rule test's cross-module feature import. The candidate includes a root module index and TypeScript relationship inputs. An external policy enforces only K6. The real `check committed --rule K6` CLI returns exit 1, `allowed:false`, `certifies:false`, `unevaluated:[]`, and exactly one `refusal` finding at `src/b/b.feature.ts`, subject `src/a/a.feature.ts`, with message `feature in src/b imports feature in src/a`.

Red: before mapping the new file, the Architecture runner exited 1 with `unmapped architecture fixture: src/architecture/k6.architecture.test.ts`. R5 production-path probe: replacing K6's registry `sidewaysObservations` with `() => []` made the named focused K6 fixture fail. The real CLI returned exit 0, `allowed:true`, `findings:[]`, `unevaluated:[]` against expected exit 1. The registry source was restored, and the adjacent `Proof:` comment records the fault and observation.

After restoration, `bun test src/architecture-level.test.ts src/architecture/*.architecture.test.ts --timeout=60000` exited 0 with 22 passes, 0 failures and 100 assertions across 13 files. Uncached `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-test-axes-nx-k6 bunx nx run twilight-burokrat:test:architecture:level --skip-nx-cache` exited 0 with twelve passes. The fresh JUnit report contains twelve distinct rule files, zero failures, zero errors and zero skips. Scoped Burokrat spec TypeScript, K6 ESLint, changed-file Prettier and `git diff --check` each exited 0. Pinned `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate test-axes --strict` exited 0 with `Change 'test-axes' is valid`. The h2puni gate was not run for this bounded slice; Task 2.1 remains open and this target report grants no certification.

### Task 2.1 Architecture PERF-THRESHOLD synthetic fixture — 2026-10-09

The thirteenth mapping adopts `PERF-THRESHOLD` at its dedicated Architecture file. The fixture creates a committed **synthetic** candidate with one declared 200 ms `lte` case, a committed toy config and fixture path, and a synthetic execution record reporting a passed runner case with a 220 ms observation. An external `RulePolicy` reviews the exact case digest, config digest, declaration path, project and runner version. The real Burokrat `check committed --rule PERF-THRESHOLD --performance-evidence` CLI recomputes the comparison and returns the exact enforce refusal finding, exit 1, `allowed:false`, `certifies:false` and an empty unevaluated list. This static rule negative does not establish a real repository Performance case, a Playwright run or runner certification.

Red: before mapping, the Architecture runner exited 1 with `unmapped architecture fixture: src/architecture/perf-threshold.architecture.test.ts`. R5 production-path probe: replacing the registry's failed-case filter with an empty selection made the named fixture fail at its exit assertion. The real CLI returned exit 0, `allowed:true`, `findings:[]`, `unevaluated:[]` for the 220 ms observation over the 200 ms threshold. The registry was restored; the adjacent `Proof:` comment records the fault and observation.

After restoration, the focused Architecture suite exited 0 with 23 passes, 0 failures and 105 assertions across 14 files. The uncached `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-test-axes-nx-perf bunx nx run twilight-burokrat:test:architecture:level --skip-nx-cache` exited 0 with 13 passes. Fresh JUnit has exactly 13 distinct rule files, zero failures, zero errors and zero skips. Scoped Burokrat spec TypeScript, fixture ESLint, changed-file Prettier, `git diff --check` and pinned `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate test-axes --strict` each exited 0; OpenSpec reported `Change 'test-axes' is valid`. The h2puni gate was not run for this bounded slice. Task 2.1 remains open; the operational target report grants no certification.

### Task 2.1 Architecture SPEC-SCENARIOS fixture — 2026-10-09

The fourteenth mapping adopts `SPEC-SCENARIOS` in its dedicated Architecture file and preserves the previous thirteen mappings. The fixture creates an independent Git repository with a real canonical `openspec/specs/example/spec.md` and an append-only journal containing the identified `EXAMPLE-001` scenario. It commits that base, then commits a candidate that keeps the journal event prefix unchanged and adds `#### Scenario: Legacy case` under the same requirement. An external `RulePolicy.scenarios.baseRevision` pins the exact base SHA and enforces only `SPEC-SCENARIOS`. The production `check committed --rule SPEC-SCENARIOS` CLI returns exit 1, `allowed:false`, `certifies:false`, `unevaluated:[]`, and one refusal finding at the spec path: `scenario heading lacks identifier: Legacy case`.

Red: before mapping the new file, the Architecture runner exited 1 with `unmapped architecture fixture: src/architecture/spec-scenarios.architecture.test.ts`. R5 production-path probe: replacing the registry's `outcome.report.unidentified.map(...)` with `[].map(...)` made the named focused fixture fail at its exit assertion. The real CLI returned exit 0, `allowed:true`, `findings:[]`, `unevaluated:[]`; the verdict still listed the unidentified scenario in its specifications report. The registry mapping was restored; the adjacent `Proof:` comment records the injected fault and observed failure.

After restoration, the named fixture exited 0 with one pass and five assertions. The focused Architecture suite exited 0 with 24 passes, 0 failures and 110 assertions across 15 files. Uncached `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-test-axes-nx-spec-scenarios bunx nx run twilight-burokrat:test:architecture:level --skip-nx-cache` exited 0 with 14 passes. The fresh JUnit report contains 14 distinct rule files, zero failures, zero errors and zero skips. Scoped Burokrat TypeScript and fixture ESLint exited 0. Pinned `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate test-axes --strict` exited 0 with `Change 'test-axes' is valid`. This completes the Architecture fixture target's current 14-rule map only. Task 2.1 and B3 remain open; this operational evidence grants no certification. The h2puni gate was not run for this bounded slice.

### Task 2.1 portable Browser execution — 2026-10-09

On commit `3cfbf79a24aa16a288a6668f989fe1be42177169`, `bunx nx run wbs-core:test:browser:portable:level --skip-nx-cache` exited 0 with cache skipped. The portable Chromium run used Playwright 1.63.0 and passed both collected cases in `libs/wbs/application/core/testing/portable-composition.spec.ts`. The invocation bundle is `tmp/junit/browser/ab1a6d28-60d5-44f2-afe6-7b631e53f2a8`; its manifest binds candidate digest `21422da6edcb2e3011232d2b6759cdb2493b49573051c829489d5e447e0bdebc`, config digest, served artifact inventory, exact case identities, and raw discovery/execution/JUnit digests. The normalized report is `report.xml`. The collector explicitly sets `certifies:false` because raw artifacts and invocation lack external authentication; this run is operational evidence and does not close Task 2.1 or grant coverage. Ordinary and packaged Browser runs, Burokrat-side Browser evidence consumption, and full candidate-bound report verification remain open.

## Task 3.1.1 — Manual schema readers and committed CLI entry (2026-10-09)

The new `inspect-manual <repository> <committed-sha> <external-rule-policy> <report-path>` command reads candidate disposition/procedure bytes from committed Git objects and report/environment/approval bytes through the existing external stable-artifact reader. `RulePolicy.manual` pins exact disposition, report, environment and approval byte digests. Every schema is version 1 and rejects undeclared keys. This is a decoding increment: output is `state:"unevaluated"`, `certifies:false`, with no coverage or Manual JUnit. Semantic joins, B3 resolution, chronology, freshness and final verdicts remain Tasks 3.1.2–3.1.5.

TDD RED: before adding the command, `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/manual.test.ts` exited 1 with six named production CLI tests failing on `unknown command: inspect-manual`. GREEN: the final focused run (`--timeout=60000`) exited 0, 17 passed, 0 failed, 49 assertions. It exercised exact identities and absent, unreadable directory, malformed UTF-8/JSON, unknown version/fields, duplicate pins/steps, symlink, path escape, missing authority and wrong command arity.

R5 watched mutations: each probe replaced only the named guard, ran the matching production CLI test by `--test-name-pattern`, observed exit 1 with a failed assertion, then restored the original bytes and asserted byte equality. Probes: symlink, regular file, fatal UTF-8, JSON error context, committed regular blob, required Manual authority, duplicate pins, canonical alias pins, report pin, disposition pin, duplicate step ID, external environment/approval pin, version 1, top-level disposition/procedure/report/environment/review/acceptance unknown keys, nested scope/module/procedure-step/report-step unknown keys, external/candidate pin unknown keys, Manual authority unknown keys and command arity. The alias-path test itself was first observed RED against raw pin paths (`Manual report differs from external policy pin`), then GREEN after canonical duplicate detection; restoring raw paths made its named duplicate assertion fail again. All original source bytes were restored after mutation probes.

Final scoped checks after restoration:

| Command                                                                                              | Result                                       |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/manual.test.ts --timeout=60000` | Exit 0; 17 pass, 0 fail, 49 assertions       |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:typecheck --skip-nx-cache`   | Exit 0; Nx reported target success           |
| Scoped `bunx eslint` on five changed source/test files                                               | Exit 0, no diagnostics                       |
| Scoped `bunx prettier --check` on five changed source/test files                                     | Exit 0; all matched files use Prettier style |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate test-axes --strict`                  | Exit 0; `Change 'test-axes' is valid`        |
| `git diff --check`                                                                                   | Exit 0                                       |

The full h2puni gate and broader Burokrat suite were not run for this bounded slice. No Manual observation is certified by these checks.

### Task 3.1.1 review correction — external path interpretation and unreadability (2026-10-09)

A production CLI regression fixture reproduced the review finding before the fix. It created `jump` as a symlink to `other/deep`, wrote malformed JSON to the pinned direct `report.json`, and wrote valid report bytes to `other/report.json`. The CLI received `<base>/jump/../report.json`. Lexical `resolve` inspected and matched `<base>/report.json`, while the stable reader opened `<base>/other/report.json` through the symlink. The named test exited 1 because the command itself exited **0** and printed `state:"unevaluated",certifies:false` instead of refusing. This was a reader identity error even though the output was non-certifying.

The Manual external boundary now requires canonical absolute paths before symlink inspection, pin matching or opening. It checks each path component and throws contextual `cannot inspect <subject> <component>: <error>` on any `lstat` failure. Manual policy pins use the same canonical spelling, with direct equality at lookup. The traversal fixture now exits 1 with `path is not canonical absolute`. Existing direct symlink fixtures still refuse. The former directory fixture remains a non-regular-file negative. A separate `chmod 000` **regular** report fixture, run as UID 1000, exited 1 with `cannot open manual report ... EACCES`; a `chmod 000` parent directory exited 1 with `cannot inspect manual report ... EACCES`. The parent directory permissions are restored before cleanup; the regular report is deleted during fixture cleanup.

Watched production-path probes restored original bytes byte-for-byte after each run:

| Isolated fault                                                            | Named CLI assertion observed                                                                                                                                               |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Disable only the canonical-path refusal                                   | Traversal test exited 1 because the named canonical-path assertion failed; direct pin equality then refused with `Manual report differs from external policy pin`          |
| Remove canonical validation of policy pin paths                           | CLI exited 0 with `state:"unevaluated"` because the extra noncanonical alias pin was accepted without validation, while the original canonical pin satisfied report lookup |
| Replace the component `lstat` contextual throw with a return              | Missing-component test exited 1 because it lost `cannot inspect ... ENOENT`; unreadable-parent test separately lost `cannot inspect ... EACCES`                            |
| Remove the stable external reader's `cannot open <subject>` error wrapper | Chmod-000 regular-file test exited 1 because raw `EACCES` lost the named `cannot open manual report` context                                                               |

After restoration, `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/manual.test.ts --timeout=60000` exited 0 with 20 passes, zero failures and 58 assertions. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:typecheck --skip-nx-cache`, scoped ESLint, scoped Prettier check, `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate test-axes --strict`, and `git diff --check` each exited 0. No full h2puni gate or broader Burokrat suite was run for this corrective slice. Manual output remains explicitly unevaluated and non-certifying.

### Task 3.1.2 — committed Manual scenario and procedure resolution (2026-10-09)

`inspect-manual` now requires `policy.scenarios`, calls B3 `evaluateSpecifications` on the selected committed candidate and externally pinned base, and resolves the disposition ID from B3's effective selection. B3 reads the immutable journal and selected spec blobs, checks lineage and allocator provenance, and refuses competing active operations. The CLI returns the selected ID/title while retaining `state:"unevaluated"`, `certifies:false` and no coverage. Assumption: the pre-existing `policy.scenarios.baseRevision` is the reviewed base authority for this slice; no separate Manual base pin is introduced. The fixture commits its journal and main spec in that base, then commits Manual records in the candidate.

TDD RED: seven first-slice CLI tests failed before implementation: resolved scenario was absent from output; missing reason lost its named finding; empty steps, mismatched procedure, unknown and retired IDs, and competing active specs exited 0. Two additional tests failed before their guards: empty/repeated/blank touched modules and blank step fields exited 0. GREEN after implementation: the focused suite exited 0 with 34 passes, zero failures and 97 assertions. It includes separate committed-procedure absence, missing Git object, malformed UTF-8, malformed JSON and symlink-mode cases. For the unreadable object case, the test deletes the selected loose Git blob after commit; `readCandidateBlob` names `cannot read selected blob ... manual/procedure.json`. Filesystem permissions on the worktree cannot establish readability of an immutable Git object and were not used for this negative.

R5 watched removals ran one matching production CLI test per fault and restored exact original source bytes after each run. Every probe exited 1 with a failed test assertion:

| Removed or bypassed check                       | Observed test failure                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Missing-reason guard                            | Named `Manual disposition reason` became schema text `reason must be a string (was missing)` |
| Blank-reason guard                              | Whitespace-only reason made the command exit 0                                               |
| Nonempty, unique, nonblank touched-module guard | Empty module set made the command exit 0                                                     |
| Nonempty procedure-step guard                   | Empty steps made the command exit 0                                                          |
| Procedure/disposition identity guard            | Mismatched scenario made the command exit 0                                                  |
| Nonblank step-field guard                       | Blank instruction made the command exit 0                                                    |
| B3 effective selector call                      | Competing active specs made the command exit 0                                               |
| Active scenario membership guard                | Unknown ID lost the named active-scenario finding and reached the title finding              |
| Effective title guard                           | Stale title made the command exit 0                                                          |
| External `policy.scenarios` guard               | Missing authority lost the named finding and failed later on undefined authority             |

Final scoped checks after restoration and task documentation:

| Command                                                                                              | Result                                       |
| ---------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/manual.test.ts --timeout=60000` | Exit 0; 34 pass, 0 fail, 97 assertions       |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:typecheck --skip-nx-cache`   | Exit 0; Nx target succeeded                  |
| `bunx prettier --check` on Manual source/test and this change's tasks/verify files                   | Exit 0; all matched files use Prettier style |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate test-axes --strict`                  | Exit 0; `Change 'test-axes' is valid`        |
| `git diff --check`                                                                                   | Exit 0                                       |

The full h2puni gate and broader Burokrat suite were not run in this isolated implementation slice. Report/review joins, source freshness and final verdict mapping remain Tasks 3.1.3–3.1.5, so no Manual observation is certified here.

## Task 3.1.3 — exact Manual approval chain and observation

The CLI captures one `Date` at its boundary and passes it to the pure Manual chain evaluator. The evaluator joins the candidate disposition and procedure digests to the report and external review; joins the report and environment to the external acceptance; compares exact scenario, scope, run, operator and timestamp identities; validates UTC calendar instants and the review date; and requires one ordered passing report observation for each procedure step plus a passing aggregate. Both approvals and the environment remain selected only by exact external `policy.manual` byte pins. A missing approval refuses at the existing stable external reader. The report's `testedRevision` is separately returned and checked through the committed Git-object reader; it can precede the selected `revision`. Source ancestry and history currency remain for 3.1.4. The structured synthetic observation says `state:"passing"`, `validation:"passed"`, `outcome:"passed"`, `currency:"unevaluated"`, `certifies:false`, and emits no coverage or passing Manual JUnit.

Assumptions: external policy pins are the trust authority for reviewer and acceptance identities; the CLI cannot independently authenticate a human. A reviewer equal to the report operator is refused as self-assertion. The UTC review deadline remains valid through its named date. The tested SHA must name an exact existing commit; this slice does not infer current source from it. Review and environment observation timestamps must not be in the future, while run and acceptance ordering follows the design's explicit `startedAt <= completedAt <= acceptedAt <= capturedNow` relation.

TDD RED: the exact-chain CLI case observed `state:"unevaluated"`; repinned relation, date and step cases exited 0 before the evaluator. The later `testedRevision` output and nonexistent tested commit cases also failed before their implementation. GREEN: `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/manual.test.ts --timeout=60000` exited 0 with 72 passes, zero failures and 180 assertions. It includes a selected descendant with an unrelated commit and an earlier tested commit, plus an absent acceptance approval that names its missing path and `ENOENT`.

R5 watched mutations: sequentially replacing each new evaluator refusal with a no-op made its matching named production CLI assertion fail, then the exact source bytes were restored. The 31-probe run covered report scenario and digests; review scenario, digests, scope and identity; environment revision, digest and attributes; acceptance report/environment digests, run, operator, times and identity; invalid/future instants and date, run/acceptance order, deadline-before-review and overdue date; missing, duplicate, extra, failed and skipped steps; and failed aggregate. A candidate-equality probe from that run was superseded by the 3.1.3/3.1.4 boundary decision. Separate restored probes observed the blank run-ID and operator assertions fail, the wrong-tested-revision assertion fail when the report/environment revision join was removed, and the nonexistent-tested-commit assertion fail when the committed-object read was bypassed. The existing reader and policy-pin mutation proofs in 3.1.1 cover absent and altered external approvals.

Final scoped checks: Burokrat typecheck with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false` and `--skip-nx-cache` exited 0; scoped ESLint and Prettier check exited 0; pinned `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate test-axes --strict` exited 0. The full h2puni gate and broader suite were skipped for this isolated slice. Source-history freshness (3.1.4), final verdict mappings (3.1.5) and B4 coverage remain unverified.

Review correction: `provenance` now says `policy-pinned-external-approval`. The schema and external pins do not classify real versus synthetic records. A named production CLI assertion first failed with the former `synthetic-external-approval` label and passed after this change. This field describes the source of authority only; `currency:"unevaluated"` and `certifies:false` still prevent certification.

Exact tested-object proof: a committed annotated tag object was used as the report and environment `sourceRevision`, with every external digest repinned. The production CLI refused `Manual tested revision is not an exact commit`. Removing only the exact SHA equality caused the named tag-object CLI test to fail because Git dereferenced the tag to its target commit; restoring the guard restored refusal. The ordinary fixture review deadline is `9999-12-31`, while the overdue fixture has a 1999 review instant and a 2000 deadline. Named negatives exercise invalid UTC calendar date `2026-02-30` and a valid deadline before `reviewedAt` separately. The focused affected command passed 5 tests and 20 assertions after restoration. Final focused suite: 73 passed, zero failed, 183 assertions. Burokrat typecheck, scoped ESLint and Prettier, strict pinned OpenSpec, and `git diff --check` each exited 0. The exact on-date deadline boundary was not separately exercised because the CLI samples the real clock; the far-future and overdue fixtures keep the required ordinary and refusal paths stable.

## Task 3.1.4 — immutable Manual source currency

The inspector now binds the approved review/report scope to the tested commit's own immutable journal, complete active-spec selection, containing requirement, tested procedure and indexed touched modules. The selected disposition remains bound to the current policy pin and B3 effective selection. Each module digest uses version 1 canonical JSON over its index path and the byte-sorted `{path,mode,blob}` tuples of its own index and all nearest-index members. The CLI checks every full-DAG commit reachable after the tested commit, including merged branches. Descendants reconstruct complete historical snapshots before filtering touched IDs; older newly reachable side commits compare every parent edge for relevant requirement/procedure/module paths and any README that may change ownership. A valid intervening difference is stale even after a revert; missing or malformed source/history refuses. Both current and stale synthetic observations remain `certifies:false`, with no coverage or passing Manual JUnit. Final state/verdict mappings remain Task 3.1.5.

Ordered evidence:

1. TDD RED: seven production `inspect-manual` CLI cases failed with `currency:"unevaluated"`; a valid later procedure edit instead refused on candidate procedure digest. They covered exact/current, unrelated descendant, requirement, procedure, module content/membership and change-then-revert.
2. TDD GREEN: the same seven cases passed after binding the approval chain to the tested procedure and comparing complete source scopes over history. Further named CLI cases passed for tested revision before the current B3 base; sibling and overlay requirement edits; identical overlay archive movement; module index/content/add/remove/rename/mode/nested ownership; requirement/procedure/membership change and revert; pretested side-branch current versus edit/revert stale; malformed historical index/journal; nonancestor, shallow, grafted, and missing commit/tree/blob history; replacement objects; incomplete reviewed scope; historical title; and repaired candidate with invalid tested steps.
3. R5 mutation sweep: sixteen sequential production-code/dependency mutations all made their named CLI assertions fail, with source restored after each: shallow, graft, nonancestor, reviewed module IDs, historical journal, full-DAG versus first-parent, requirement, procedure, module, own index tuple, member mode, side path, object preflight, intermediate snapshots, tested procedure selection, and replacement-object setting. Separate watched probes killed baseline requirement and module digest comparisons, historical title, empty tested steps, missing module ID, complete-index dependency and NUL-terminated Git path output. Adjacent `Proof:` comments identify the injected faults and observations.
4. A preliminary full Manual suite run reported 103 pass and two failures among 105 cases. One was an error-order regression on mismatched environment/tested revision; the exact join was moved before object loading and its focused case passed. The other was an existing six-invocation test exceeding its 5-second limit after history reconstruction; its 12-second limit and focused rerun passed. A clean full-suite rerun follows below.
5. `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/manual.test.ts --timeout=60000` exited 0: **112 pass, 0 fail, 262 assertions**, 154.40 seconds. It includes the two corrected cases. The CLI still returns `certifies:false`; no coverage ledger or passing Manual JUnit was emitted.
6. A real Git DAG case added after that run showed a relevant module difference only against the second parent of a pretested side merge. The production CLI returned stale; limiting side-branch comparison to the first parent returned current and failed the named assertion. The final exact-source suite rerun exited 0: **113 pass, 0 fail, 264 assertions**, 155.22 seconds, with the second-parent case included.
7. Final scoped checks after the exact-source suite all exited 0: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:typecheck --skip-nx-cache`; ESLint on the three changed TypeScript files; Prettier check on those files plus this change's design, tasks and verify files; `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate test-axes --strict` (`Change 'test-axes' is valid`); and `git diff --check`. The full h2puni gate and broader Burokrat suite were not run in this isolated slice. Task 3.1.5 verdict mappings and B4 coverage remain unverified.

### 3.1.4 review correction — full history object closure and malformed snapshots

Three production CLI negatives were RED on `1f63d9b`: deleting the older module blob on an excluded second parent returned a passing/stale observation; a pretested side edit/revert under a U+FEFF-prefixed module directory returned current because Git path decoding stripped the BOM; and unsupported-version or empty-step intermediate procedures returned stale. After the corrections, the same cases respectively refuse, return stale, and refuse. The side-parent check now verifies each unique parent's full Git object closure with replacement objects disabled. The Git `-z` path decoder preserves a leading BOM. Every intervening procedure is schema and structurally validated before its digest is compared; the tested and selected procedures retain their own boundary checks.

Additional named production CLI negatives refuse an intervening symlink canonical spec, duplicate containing scenario ID, historical journal/spec title disagreement, tested procedure title repaired only in the selected candidate, malformed Git parent output, duplicate or blank intermediate procedure steps, and an intermediate procedure title mismatch. Each of these guards, plus the three corrections above, was individually disabled against its named CLI case; each mutation made the assertion fail, and source bytes were restored. The excluded-parent blob and BOM cases also failed before their implementation. No final verdict mapping or certification was added.

The restored exact-source full Manual suite, `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/manual.test.ts --timeout=60000`, exited 0: **125 pass, 0 fail, 288 assertions**, 170.31 seconds. This supersedes the 113-case result for the review correction; the earlier result remains the exact evidence for the initial slice.

Post-suite scoped checks each exited 0: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:typecheck --skip-nx-cache`; ESLint on Manual source/test and the index reader; Prettier check on those files and this change's design, tasks and verify files; `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate test-axes --strict` (`Change 'test-axes' is valid`); and `git diff --check`. The full h2puni gate and broader Burokrat suite were not run in this isolated review correction.

### 3.1.4 review correction — valid intermediate rename and revert

A production CLI fixture changed the active scenario title, journal rename, disposition title and procedure title from `Example` to `Alternate` at an intermediate commit, then restored the selected spec, disposition and procedure with an inverse journal rename. The approved tested report and current policy remained unchanged. RED on `5f210b2`: the CLI refused `Manual historical procedure scenario differs from disposition`; the expected noncertifying currency is stale. The intermediate procedure title now joins the same-revision selected requirement title, while its scenario ID remains fixed. GREEN: the valid rename/revert case and the existing wrong-procedure-title negative both passed. A watched mutation replacing the historical title with the reviewed title made the positive CLI case fail; a second mutation disabling the join made the wrong-title CLI negative fail. Both source mutations were restored before the final suite.

The first full Manual suite, `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/manual.test.ts --timeout=60000`, exited 0: **126 pass, 0 fail, 291 assertions**, 171.73 seconds. Scoped ESLint then found an unsafe `JSON.parse` member access in the new test assertion; adding a test-only typed boundary fixed it. The restored exact-source full-suite rerun exited 0: **126 pass, 0 fail, 291 assertions**, 171.95 seconds. Both runs include the valid rename/revert and wrong-title negatives.

Final scoped checks after that rerun each exited 0: Burokrat typecheck with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false` and `--skip-nx-cache`; ESLint on Manual source/test and the index reader; Prettier check on those files plus this change's design, tasks and verify files; pinned strict OpenSpec validation (`Change 'test-axes' is valid`); and `git diff --check`. The full h2puni gate and broader Burokrat suite were not run for this isolated correction.

## Task 3.1.5 — final Manual CLI verdict mapping

The Manual inspector now returns a typed evaluated verdict with independent validation, outcome and currency. A current passing run emits `state:current` and exits zero; a stale passing run emits `state:stale` and exits one; a consistent failed or skipped run emits `state:failed` and exits one; an overdue review emits `state:overdue`, `validation:refused`, a scenario/date finding and exits one. Overdue outranks failed and stale; failed outranks stale. Missing, malformed, untrusted and inconsistent records still refuse on stderr with no JSON. The output binds `procedureDigest` to the tested procedure and names the selected procedure digest separately. Every observation remains `certifies:false`; the synthetic current CLI case found no coverage field or Manual XML in its fixture directory.

Ordered TDD and R5 evidence:

1. RED: the exact approved CLI case still said `state:passing`; stale returned exit zero; valid failed/skipped runs refused as nonpassing; overdue threw to stderr. The combined overdue/failed/stale case could not produce a structured verdict. After repinning changed report digests, all named cases reached their intended production boundary.
2. GREEN: named production CLI cases passed for current, stale, consistent failed and skipped, overdue, failed-over-stale, overdue-over-failed-and-stale, failed-over-skipped aggregate, contradictory aggregate refusal, blank observation refusal and tested-versus-selected procedure digests. The legacy contradictory failed-step and failed-aggregate cases remain refusals.
3. Watched mutations, each restored before the next, made a named CLI assertion fail: disabling overdue, failed or stale verdict branches; changing the current state; replacing overdue validation, finding or failed outcome; disabling the noncurrent CLI exit; changing the refused-inspection CLI exit to zero; substituting the selected procedure digest; disabling failed/skipped aggregate precedence, aggregate consistency, blank observation or overdue-date comparison; disabling failed-over-stale precedence; and changing `certifies:false` to true. The production path generated no coverage or passing Manual JUnit in these fixtures.
4. The restored exact-source full Manual suite, `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/manual.test.ts --timeout=60000`, exited 0: **134 pass, 0 fail, 345 assertions**, 182.36 seconds. It includes the legacy refusal cases after the evaluated verdict mapping.
5. Final scoped checks after that run each exited 0: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:typecheck --skip-nx-cache`; ESLint on Manual source/test and CLI; Prettier check on those files plus this change's design, tasks and verify files; `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate test-axes --strict` (`Change 'test-axes' is valid`); and `git diff --check`. The full h2puni gate and broader Burokrat suite were not run in this isolated slice. B4 coverage remains unverified.
6. A final refused-inspection CLI exit mutation changed `fail()` to exit zero. The inconsistent-report CLI case then failed its exit assertion while still reporting the named stderr finding with no JSON; the source was restored and its `Proof:` comment added. The final annotated-source full-suite rerun exited 0: **134 pass, 0 fail, 345 assertions**, 182.01 seconds.
7. Scoped checks after the final rerun again exited 0: Burokrat typecheck with Nx cache skipped, ESLint on Manual source/test and CLI, Prettier check on those files and design/tasks/verify, pinned strict OpenSpec validation (`Change 'test-axes' is valid`), and `git diff --check`.

Astra's review of `304526f38fdbf9deed04decd79a38c9d610f2178` approved the behavior with one R2 naming correction: `manualVerdict` became `deriveVerdict`; its call site was renamed with no behavior change. The focused production CLI command over current, stale, failed, skipped, overdue, precedence and refused cases exited 0: **9 pass, 0 fail, 65 assertions**. Burokrat typecheck, scoped ESLint, Prettier, strict pinned OpenSpec (`Change 'test-axes' is valid`) and `git diff --check` each exited 0 after the rename. The full Manual suite was not rerun for this symbol-only correction; the prior 134-case full-suite result is recorded above.

## Task 2.1a — covered target declarations and collection verification

This slice adds `tool-devsync:test-levels:verify` as a production Nx target. Its CLI audits the existing six Bun level targets and the frontend Unit/View targets with four distinct Vitest phases and declared JUnit paths. It executes the targets' real Bun selectors and Vitest `list --filesOnly` configs, canonicalizes workspace file paths, classifies each collected file through the shared ten-row classifier, and refuses cross-level and omitted files. Vitest 5 returned empty piped stdout despite exit zero; `--json=<unique owned file>` is the observed listing boundary. The verifier refuses absent, malformed, empty, duplicate, nonregular and escaping listed paths, and removes its owned directory. Explicit aggregate declarations cover SQLite, core, memory and frontend legacy test targets plus the FE Browser aggregate; unknown, undeclared mixed and changed aggregate commands or members refuse. Named exceptions remain inventory entries only, with their separate execution contracts unverified here.

Ordered TDD and watched R5 evidence:

1. RED: before implementation, the frontend declaration, collection and unknown/mixed target tests failed. A proposed memory `test:unit` aggregate selecting only Conformance resolved unexpectedly; a memory Unit selector omitting `space-fixture.test.ts` made the production CLI exit zero; an appended aggregate `--test-name-pattern=conformance` also resolved. The manifest override `wrong/root` CLI negative returned zero before root validation.
2. GREEN: the production CLI with a temporary SQLite manifest whose API selector includes `libs/wbs/adapters/store-sqlite/src/testing/source-conformance.db.test.ts` exits one and names that file, declared `api` and actual `conformance`. A temporary memory manifest with `test:mixed: bun test src` exits one and names `wbs-store-memory:test:mixed` plus `conformance and unit`. The Bun omitted-file CLI, frontend omitted-root-suite CLI, exact aggregate filter, unknown declaration, missing required target, FE phase/report and bad Vitest JSON cases all refuse by name. A normal CLI run prints `Verified declared test collections`.
3. Each source mutation was restored before the next. Disabling the API level comparison made the named **CLI** assertion receive exit zero. Disabling the undeclared mixed check lost its named mixed-level diagnostic. Disabling Bun/FE complete-collection guards made their omitted-file CLI tests receive exit zero. Disabling the exact aggregate command or level-set checks made the filter and omitted-Conformance cases resolve; disabling FE Unit dependency, FE command equality or Browser member equality made their respective aggregate negatives resolve. Disabling missing-target, unknown-target, selected-file regularity, FE command/cwd/phase/report/foreign-level/duplicate-phase checks made the named negative fail. Vitest JSON read, no-files, entry-shape, duplicate, project-containment and owned-temp-cleanup mutations each made the named fault fail. CLI argument, override-root, manifest-shape and identity guard mutations each made the named CLI negative fail.
4. Restored-source `bun test tools/tool-devsync/src/test-levels.test.ts --timeout=30000`: exit 0, **81 pass, 0 fail, 199 assertions**, 8.93 seconds before the additional listed-directory fault; its exact final rerun follows below. `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-test-axes-nx-21a bunx nx run tool-devsync:test-levels:verify --skip-nx-cache`: exit 0, printed `> nx run tool-devsync:"test-levels:verify"`, `Verified declared test collections`, and Nx success with cache skipped. An earlier nested Nx call from a piped Bun test had exited zero with empty stdout and was not counted; the direct Nx run above is the production target evidence.
5. Fresh `bunx tsc --build --force tools/tool-devsync/tsconfig.json`, scoped ESLint on the three changed TS files, Prettier check on the changed TS/JSON and design/tasks files, pinned strict OpenSpec validation (`Change 'test-axes' is valid`), and `git diff --check` all exited zero. The broader devsync suite, actual FE Unit/View execution, candidate-bound report receipts and the h2puni gate were not run in this collection slice. No Manual JUnit, passing synthetic coverage or Task 2.1 completion is claimed.
6. A final injected Vitest list containing the existing `apps/wbs/fe-01/src` directory refused it as a nonregular collected file. Disabling the regular-file guard made the named negative receive exit zero; source bytes were restored. The exact final suite and checks below include this case.
7. The last R5 sweep watched four additional guards: disabling the empty-Bun-selector refusal returned `[]`; disabling the missing-aggregate guard produced a TypeError instead of the named target; disabling the Vitest nonzero-exit guard reported absent JSON instead of the runner failure; disabling the present-but-commandless Bun target refusal produced a parser diagnostic instead of the named target. All corresponding named tests failed under mutation and source bytes were restored.
8. Final restored-source `bun test tools/tool-devsync/src/test-levels.test.ts --timeout=30000`: exit 0, **82 pass, 0 fail, 206 assertions**, 9.12 seconds. After that run, tool-devsync TypeScript build, scoped ESLint, Prettier check including `verify.md`, strict pinned OpenSpec (`Change 'test-axes' is valid`) and `git diff --check` each exited zero. The direct Nx verifier target also reran after the final source edit and printed the actual `> nx run` line and success with cache skipped. This is the final source/test evidence for Task 2.1a.

### Task 2.1a review correction: target envelopes and independent Node suite authority

Astra's review found that the first verifier accepted missing Nx executors, collection-changing Nx options, a changed frontend runner command, a missing cross-project Browser member and an injected View file in the Node list. The new FE-owned `vitest.node-suites.json` backs the app's `NODE_SUITES` export; the verifier reads its JSON bytes independently of the Vitest list and rejects bad version/shape, noncanonical or duplicate paths, blank reasons, missing/nonregular files and symlink escapes. It validates covered Nx envelopes, Bun JUnit paths, the exact frontend runner grammar and each Browser aggregate member in its owning project manifest. Collection verification still neither executes those level targets nor authenticates a report receipt.

1. RED production CLI cases before the correction: the missing SQLite API executor, removed frontend JUnit reporter, missing core portable Browser member and an intercepted Node list containing `apps/wbs/fe-01/src/lib/api.test.ts` each returned exit zero. The new Node authority test first failed because the imported FE source was not a valid tools project dependency; the FE-owned manifest boundary resolved that without a cross-project code import.
2. GREEN focused production CLI cases cover the four faults and changed dependencies, Nx `configurations`/`defaultConfiguration`, `options.args`/`commands`/`env`/forwarding/cwd, Bun JUnit reporter/outfile/directory, frontend selector/timezone/reporter, aggregate options, Node additions and omissions, and strict manifest input faults. Each refusal names its boundary. The manifest fixtures cover missing, unreadable, malformed JSON, bad version/keys, empty/duplicate entries, traversal/backslashes, blank reasons, absent/nonregular files, direct symlinks and symlinked parent escape.
3. Watched mutations, restored after each named test: removing the Bun executor, envelope, cwd, reporter, outfile or report-directory guard made its production CLI assertion fail; removing exact frontend command equality made the removed-reporter/selector/timezone case fail; removing independent Node membership made the injected View suite case fail; removing Browser member presence, member command/options or aggregate envelope checks made their respective CLI assertions fail. Replacing the override manifest read with the committed manifest, disabling manifest regularity, strict shape/version, nonempty suites, reason, canonical path, duplicate, regular member or realpath checks each made its named CLI fixture fail. The mixed-target guard's watched removal loses the _named mixed-level diagnostic_ while the unknown-target guard still throws. All mutated source bytes were restored.
4. After formatting and the fixture type correction, restored-source `bun test tools/tool-devsync/src/test-levels.test.ts --timeout=30000`: exit 0, **88 pass, 0 fail, 285 assertions**, 15.03 seconds. Direct `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-test-axes-nx-21a bunx nx run tool-devsync:test-levels:verify --skip-nx-cache`: exit 0, printed `Verified declared test collections` and Nx success with cache skipped. Fresh `bunx tsc --build --force tools/tool-devsync/tsconfig.json`, scoped ESLint, Prettier check, pinned strict OpenSpec (`Change 'test-axes' is valid`) and `git diff --check` each exited 0. The first tool-devsync typecheck found two test-only fixture keys absent from `ManifestTarget`; its type was expanded to represent those rejected Nx fields and the rerun exited 0. FE app typecheck still hits the unchanged baseline `vitest.view-level.test.ts:61` TS4111 `process.env.PATH` issue; this slice does not claim a passing FE build, real level execution, candidate-bound receipts or Task 2.1 completion.

### Task 2.1a second review correction: aggregate execution and report uniqueness

Production CLI RED cases accepted a memory aggregate with a missing executor, FE `test` with its `test:unit` target deleted, and memory Unit with a second conflicting `--reporter-outfile`; all returned exit zero. The correction validates every legacy aggregate's Nx executor and collection-changing options, resolves FE `test:unit` to its exact runnable command and envelope, and requires exactly one Bun outfile flag with the declared path. Expanded CLI cases cover wrong executor, extra args/commands/env/forwarding, added dependencies/configuration selection, FE Unit no-op/filter, conflicting outfiles in both orders and an identical duplicate. Focused GREEN before final formatting: **3 pass, 0 fail, 22 assertions**. Watched source mutations were restored independently: bypassing the legacy aggregate envelope, FE dependency target join or outfile-family count made each corresponding named production CLI test fail. The entry/reason manifest `Proof:` and undeclared-mixed diagnostic `Proof:` comments now state the observed failure boundary accurately. Final suite and scoped checks are recorded below.

After a test-only index-signature correction, exact-source `bun test tools/tool-devsync/src/test-levels.test.ts --timeout=30000` exited 0: **91 pass, 0 fail, 315 assertions**, 15.60 seconds. `bunx tsc --build --force tools/tool-devsync/tsconfig.json`, scoped ESLint, Prettier check, strict pinned OpenSpec (`Change 'test-axes' is valid`), `git diff --check`, and direct `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-test-axes-nx-21a bunx nx run tool-devsync:test-levels:verify --skip-nx-cache` exited 0; the Nx command printed `Verified declared test collections`. The first typecheck caught TS4111 in the new test fixture and was rerun successfully after its fix. This remains a collection-only correction; level execution and authenticated report receipts remain open in Task 2.1.

## Task 2.1b — committed frontend Unit and View execution

The only source edit was the type-safe indexed `process.env['PATH']` access in `vitest.view-level.test.ts`; it preserves the existing PATH value and introduces no new safety guard. The frontend TypeScript build and relevant ESLint exited 0 before the mechanical fix was committed as `8bd3c94c68cd04f0951e9e63e82778cacf50d8da`. Prettier, strict pinned OpenSpec and `git diff --check` also exited 0. No watched guard mutation was required for this syntax-only change.

The first uncached Unit target run in the default sandbox exited 1 in 10.8 seconds. Its parseable Node JUnit had 847 cases and five failures: `playwright-config.test.ts` could not spawn `bun`; two `short-date.test.ts` cases could not spawn `bun`; `node-tier.test.ts` could not spawn `sh`; the `vitest-budget.test.ts` timeout oracle received empty stderr instead of its expected 500 ms diagnostic. Its root phase did not start. The four subprocess failures reported `EPERM`; the same target passed outside that subprocess-restricted environment without source or timeout changes, and the timeout oracle passed there too. The sandbox report and absent root report were not counted.

The first elevated View attempt used an outer `timeout 300s` for observation and ended exit 124 while UTC was still serially progressing; UTC XML was zero bytes and Auckland had not started, so neither was counted. The UTC Vitest parent remained live and worker PIDs rotated while consuming CPU. A separate 180-second verbose UTC diagnostic, also bounded and not counted as evidence, identified completed tests in six heavy WBS files and ended at `src/components/wbs/plan-keyboard.test.tsx` / “a chord at the grid’s edge is consumed rather than leaking to the browser.” This measured serial workload justified a 1,200-second outer observation bound for the unchanged production command. The target's `--testTimeout=30000` and `--hookTimeout=30000` remained unchanged.

On committed SHA `8bd3c94c68cd04f0951e9e63e82778cacf50d8da`, uncached `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-test-axes-nx-21b timeout 240s bunx nx run wbs-fe-01:test:unit:level --skip-nx-cache` exited 0 in 11.6 seconds. The same invocation with `timeout 1200s` and `test:view:level` exited 0 in 9m 6s; UTC and Auckland both finished. Both commands ran outside the default subprocess-restricted sandbox because the four observed `EPERM` failures blocked the required child launches there. Bun was 1.4.2, Node v24.20.0, Vitest 5.0.0 and local Nx v23.2.0. The declared environment kept `CLAUDECODE=0`, `AGENT=0`, UTC for Node/root/UTC View and `Pacific/Auckland` for zoned View. The outer timeouts guarded observation only; they did not change runner selection or test/hook budgets.

| Fresh report                            |  Bytes | Cases | File IDs | Failure/error/skip | SHA-256                                                            |
| --------------------------------------- | -----: | ----: | -------: | -----------------: | ------------------------------------------------------------------ |
| `tmp/junit/wbs-fe-01.unit.xml`          | 193421 |   847 |       70 |              0/0/0 | `569c82632444a7c45236d109889e8d34c1574bc458b39ed8929f5e45dfda5e50` |
| `tmp/junit/wbs-fe-01.unit.root.xml`     |   4441 |    21 |        2 |              0/0/0 | `fc5223852596999a29d1951589383d2b9efd201fc67f4d84029bbafecf7d8808` |
| `tmp/junit/wbs-fe-01.view.utc.xml`      | 889786 |  2656 |      104 |              0/0/0 | `d512c37c16ca12680465ea6d37db74e0ca5607d9bf1ddb5a83c5b4bd5656fd4a` |
| `tmp/junit/wbs-fe-01.view.auckland.xml` |   1204 |     3 |        2 |              0/0/0 | `d20a876ad711cf02005c8d83aef6380c112cd73fbe38cd8f5c5bb348e77bf651` |

All four XML documents parsed. For each phase, the set of testcase `classname` file IDs exactly equaled the canonical file set from that phase's declared Vitest config/args: Node 70/70 (also exact FE `NODE_SUITES` manifest membership), root 2/2, UTC View 104/104 and Auckland View 2/2, with no missing or extra IDs. The production `tool-devsync:test-levels:verify --skip-nx-cache` target reran on the same committed candidate and exited 0, printing `Verified declared test collections`. These reports establish operational execution and class/file membership for this run only; they are not candidate-bound authenticated receipts, do not certify coverage, and do not complete Task 2.1. Clean API, Browser ordinary/packaged, a real Performance fixture, a human Manual run and final Conformance/Architecture execution remain open.

## Task 2.1c — clean SQLite API operational execution

On clean committed source `2ceb4c46139c6025d0c4557b11e2d834285d8e92`, `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-test-axes-nx-21c timeout 600s bunx nx run wbs-store-sqlite:test:api --skip-nx-cache` exited 0 outside the subprocess-restricted sandbox. Nx printed its `> nx run` line and `Successfully ran target test:api`, with cache skipped and duration 1m 34s. Bun reported **1,174 pass, 0 fail, 3,598 assertions across 86 files** in 93.43 seconds. The target's own `--timeout=30000`, selector and write-lock-holder subprocess assertions were unchanged. Its held-write-lock refusal and later successful fresh attempt both passed in the log at about 1.50s and 1.46s. The prior sandbox-only `EPERM` failures therefore did not recur in this subprocess-capable execution environment.

The target first removed its prior XML. Its fresh `tmp/junit/wbs-store-sqlite.api.xml` is **301,579 bytes**, SHA-256 `aa3ded3171b8a437e27c15e10e64c2c1d5f615d23da175b960967c4e11f4c846`, and parses as 1,174 cases with **0 failures, 0 errors and 0 skips**. Bun 1.4.2, Node v24.20.0 and local Nx v23.2.0 were observed; the target declares no environment override, and `TZ`, `CI`, `CLAUDECODE`, `AGENT` and `NODE_ENV` were unset in the launch shell. The Nx invocation set `NX_DAEMON=false`, `NX_ISOLATE_PLUGINS=false` and a task-specific socket directory. The 600-second wrapper was an observation bound and did not alter Bun's test budget.

The committed target's `parseLevelCommand` yielded `find src -name '*.db.test.ts' ! -name 'source-conformance.db.test.ts'`. Executing that selector through `collectedFiles` produced **86** project-relative paths. The report's testcase `file` set and testsuite `file` set each matched those 86 paths exactly, with no missing or extra paths; every testcase had a file ID. Bun's `classname` names describe blocks, so `file` is the correct identity field here. Every selected path classified as API under the shared level table. The Conformance target identified `src/testing/source-conformance.db.test.ts`, which was absent from the API selection and both report file sets.

The committed-candidate `tool-devsync:test-levels:verify --skip-nx-cache` target exited 0 and printed `Verified declared test collections`. Focused production negatives for a Conformance file in API, changed Bun Nx/report envelope, a missing selected file, an omitted Bun file and exact own-level collection passed: **5 pass, 0 fail, 34 assertions**. This slice changed no production code or safety guard, so it required no new watched mutation. The report is operational, noncertifying evidence without an authenticated candidate-bound receipt. Task 2.1 remains open for Browser ordinary/packaged, a real Performance fixture, human Manual run, final Conformance/Architecture execution and trusted receipt integration.

The precise existing R5 trio also ran on the same source: `bun test tools/tool-devsync/src/test-levels.test.ts --timeout=30000 -t 'names the Conformance file|refuses empty or failed selection|refuses a second conflicting Bun report'` exited 0 with **3 pass, 0 fail, 65 assertions**. These guards retain their previously recorded watched mutation proofs; no guard changed in this documentation-only slice.

## Task 2.1d — packaged Browser operational execution and inspection

Ordered evidence:

1. **Initial RED and cause.** On clean `3f2d5b301063875adf78f70e00e74c92012cc3a4`, the exact uncached `wbs-fe-01:test:browser:packaged:level` target exited 1 after publishing failing invocation `0f8fc8f0-71a2-4bc8-b385-8ea6d4120eb0`: the entry case passed and the signed-in case timed out on the People heading. A bounded Chromium trace against the same built app/Caddyfile showed `/directory` and every requested built JS/CSS asset returning 200, `/api/auth/me` returning the existing 200 JSON stub, then an unstubbed `/api/onboarding` returning 200 HTML. That HTML's SHA-256 equaled built `index.html` (`05b85b9441b3f4a1fa2ae2502adcc247bbb5ef7fe009a109541a59588dc35bb3`); the DOM rendered `The server returned an unexpected response. Try again.` with no headings. No page error or failed request occurred. A temporary diagnostic route returning the `readOnboarding` contract's 403 JSON `{ "error": "onboarding_inactive" }` made People and `Name of Kat` render. The packaged fixture then added only that route, preserving its existing stubs, cases, Caddyfile, retries and timeouts. Direct packaged Playwright exited 0 with 2/2 cases in 4.7 seconds. Its `/api/people/load` call still receives Caddy's HTML fallback and the app shows a load-unavailable notice; the existing People/Kat assertions pass, but this run makes no API-service claim.
2. **Normal Caddy teardown RED/GREEN.** Playwright 1.63.0 kills the `webServer` process group on normal exit when `gracefulShutdown` is absent; after passing runs the Docker daemon's Caddy container remained bound to 4341. An actual disposable Playwright `webServer` probe with a unique labeled container on 4342, `gracefulShutdown:{signal:'SIGTERM',timeout:10000}` and the same Caddy mounts exited 0, logged Caddy's SIGTERM shutdown, removed the container and left socket connect refused. The otherwise identical no-graceful control on 4343 exited 0 but left container `d033a96b5df9…` and a connectable port; that exact container was stopped after inspection. A no-`exec` SIGTERM probe also cleaned successfully, so the production Docker command retained its original shape. The production config adds only bounded graceful SIGTERM. The watched final-shape mutation removed that option in disposable clean commit `de1205002d6e0e2e0b73f5601e09a8d7825e7b22`: the exact uncached Nx target itself passed in 9.2 seconds, but the production lifecycle assertion exited 1 with `Caddy container remained on 4341 after mutant_final`; exact ID `a307f20190bd…` had the mutant collector's scratch mounts and socket connect succeeded. That exact ID was stopped, socket became closed, the mutation worktree was removed and the source was restored. The lifecycle verifier ran the exact target under `timeout 2700s`, required a successful `docker ps --filter publish=4341`, checked its output empty and `connect_ex(127.0.0.1:4341)!=0` before and after. Astra found the first verifier could treat Docker exit 1 with empty stdout as clean. With stub Docker exiting 1 and empty stdout, the corrected verifier exited 1 with `Docker container inventory unavailable during preflight for fault_inventory` before starting Nx. A watched verifier mutation that replaced that refusal with an empty inventory, paired with a stub `bunx` exiting 0, falsely printed `packaged lifecycle fault_mutant passed`; restoring the check refused the same stubs by name. The corrected verifier body is reproduced below, SHA-256 `1d558685c6327bfc7ff3ee9a280a3680ac7c4fa7fcad569c97a7c892dae25a28`. This proves normal exit only. Deadline/forced-kill Docker cleanup was not exercised and remains unverified.
3. **Browser manifest contract RED/GREEN.** On committed source `0109cf8eeb0ce90d253cb24864634463db50bba7`, the untouched real collector bundle's `candidate` was a canonical 64-character digest; production `inspect-browser` with an external policy exited 1, `Browser candidate identity is malformed`, because its consumer expected an object. A canonical-digest fixture also made the named production CLI test RED. Astra ruled that version 1 carries only the digest. The consumer now independently reads the committed selection, requires a lowercase SHA-256 manifest digest equal to its canonical candidate hash, and compares manifest revision separately. The production CLI refuses missing, malformed, old-object and foreign digests, changed revision, and an empty descendant whose tree is identical but digest is different. Watched removal of digest equality made foreign-digest and same-tree-descendant CLI negatives exit 0; removal of revision equality made the changed-revision CLI negative exit 0. Replacing strict digest validation with string coercion lost the named missing-candidate diagnostic. Each mutation was restored. Before the correction, the real untouched-bundle CLI assertion exited 1; afterward the same invocation exited 0 with two observed passed cases, `authentication:{kind:'absent'}`, `certifies:false`, and no verified coverage.
4. **Committed execution.** The corrected, clean candidate `319d9e7333fb43023071af5e2bdc2281d83f7dfa` ran the exact uncached command `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-test-axes-nx-21d-<attempt> timeout 2700s bunx nx run wbs-fe-01:test:browser:packaged:level --skip-nx-cache` twice sequentially without manual cleanup between runs. Both exited 0 (Nx durations 8.8s and 8.8s); invocation IDs were `655ecb8b-63e2-46d7-9be6-24cf812d15c9` and `7b5d1803-0d9f-4cbc-9cfb-36217cc0e610`. After each, no Docker container published 4341 and socket `connect_ex` returned 111. A separate attempted rerun while `tasks.md` was dirty refused at candidate preflight in 182ms and cleared the pointer; it did not execute cases or start Docker and is not counted. The second clean invocation's untouched bundle was read by production `readBrowserPublication` and `inspect-browser` against the external observe-only policy. The policy has 14 registered rules, pins packaged Chromium and config digest `5357369628a85d7cba0217633df9f0a5a0ce218cd85208feb0d951ffafbbed7f`, and has SHA-256/policy digest `5109660e5f10d676411af217707086bb2278bd357afe01187b93763e6285918a`. Inspection returned two observed `passed` cases, `authentication:{kind:'absent'}`, `certifies:false`.

| Second invocation file | Bytes | SHA-256                                                            |
| ---------------------- | ----: | ------------------------------------------------------------------ |
| `discovery.json`       |  3512 | `37663b4200340de1facb1a6a6a6e5fed897457992a91ff1747859b893422b9d8` |
| `execution.json`       |  4619 | `8a496a2dbf2446a9253f35bc60f3b15cf37f8a58a02238f72f28089de16e58ea` |
| `playwright.xml`       |   634 | `ce7e308a93f057e44f8b39c6703b011fccc28e58efb3ce9890053cc4908a9ec3` |
| `report.xml`           |   561 | `b5e5342928a23149e4321bc98a990e12478bf176a22522fed0793283c680bff4` |
| `manifest.json`        |  3043 | `e0c83d717ff2a0e485578a964718431079c419ddcb82c6f774ad17322eb082c3` |

Both raw and normalized JUnit parsed with exactly the two declared `packaged.spec.ts` cases—entry fallback and directory reload—and 0 failures, 0 errors, 0 skips; normalized testcase `file` was the exact declared `apps/wbs/fe-01/e2e-packaged/packaged.spec.ts` for each. Discovery and execution each reported Playwright 1.63.0, Chromium and no top-level errors, with the same config path. The manifest declared `CI=1`, candidate digest `d5bb1f74c88ed7dd20a7c9c3d5537d9f7b98baeb98bec30c3cb1a6e132bbf63d`, one nonempty built `index.html` and eight served regular-file inventory entries, including seven assets. The built index digest was `05b85b9441b3f4a1fa2ae2502adcc247bbb5ef7fe009a109541a59588dc35bb3`. Bun was 1.4.2, Node v24.20.0, local Nx v23.2.0, Docker 29.7.2 and the `caddy:2-alpine` image was `sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f` (Caddy v2.11.7). This inventory and these reports are collector observations; served bytes and process exits are not independently authenticated by Burokrat.

5. **Scoped checks and limits.** The final focused Browser suite command over `browser.test.ts`, `browser-level.test.ts` and `browser-playwright.test.ts` exited 0: **44 pass, 0 fail, 190 assertions**. FE and Burokrat uncached TypeScript targets, scoped ESLint, changed-file Prettier, `git diff --check`, and pinned `bunx @fission-ai/openspec@1.12.0 validate test-axes --strict` exited 0; OpenSpec reported `Change 'test-axes' is valid`. Uncached `tool-devsync:test-levels:verify` exited 0 and printed `Verified declared test collections`. The h2puni gate, ordinary Browser, revised portable Browser, trusted served-byte/runner receipts and full Task 2.1 completion were not run or claimed in this slice.

After the lifecycle verifier correction, two sequential runs on clean committed `1d414674fc3233fb258fe34e02af38482fb4b57b` passed with no manual cleanup between them: invocation `31a05185-db2d-4d4c-b309-fef3d18365e6` (Nx 8.8s) then `f4c70d8b-2591-45f2-84e1-31402838121d` (Nx 8.7s). Each required Docker inventory success, found no container publishing 4341, and got socket `connect_ex=111` before and after. The second untouched bundle passed production `inspect-browser` against the same external policy: two observed passed cases, authentication absent, `certifies:false`. This later run supplements the second-invocation hashes above; it does not change their recorded bytes.

The lifecycle verifier used for those runs has this exact body (argument 1 is the attempt name; run it from a clean committed candidate root with Docker and Chromium available):

```bash
#!/usr/bin/env bash
set -euo pipefail

run_name="$1"
capture_containers() {
  if containers=$(docker ps --filter publish=4341 --format '{{.ID}} {{.Names}} {{.Ports}}'); then
    return
  fi
  printf 'Docker container inventory unavailable during %s\n' "$1" >&2
  exit 1
}
probe_port() {
  python3 -c 'import socket,sys; connection=socket.socket(); status=connection.connect_ex(("127.0.0.1",4341)); connection.close(); print("port4341_connect_ex="+str(status)); sys.exit(0 if status != 0 else 1)'
}
probe_port
capture_containers "preflight for $run_name"
if [[ -n "$containers" ]]; then
  printf 'Caddy port 4341 was occupied before %s\n' "$run_name" >&2
  printf '%s\n' "$containers" >&2
  exit 1
fi
NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR="/tmp/puni-test-axes-nx-21d-${run_name}" timeout 2700s bunx nx run wbs-fe-01:test:browser:packaged:level --skip-nx-cache > "/tmp/fe-browser-packaged-21d-${run_name}.log" 2>&1
capture_containers "postrun for $run_name"
if [[ -n "$containers" ]]; then
  printf 'Caddy container remained on 4341 after %s\n' "$run_name" >&2
  printf '%s\n' "$containers" >&2
  exit 1
fi
probe_port
printf 'packaged lifecycle %s passed\n' "$run_name"
```

## Task 2.1e — ordinary Browser execution, parser correction (pre-publication)

The clean starting revision was `e8334c08dc40572032adc08e2e8461e498ba4086`. With `E2E_PORT_SHIFT=1900`, the config derives BE 5000, GW 5100 and FE 6100; checked socket probes returned `connect_ex=111` for all three before the run. Playwright's default Chromium and opted-in `channel:'chromium'` both launched and closed outside the subprocess-restricted sandbox, each reporting Chromium `153.0.8010.12`. The external observe-only ordinary policy `/tmp/puni-browser-ordinary-policy-21e.json` has SHA-256 `ea10856f12586c7655571b86dbfec91092c394d8c772206f8d18b79b4f52652e`, pins config digest `daef305d125c93bf13dcb9171dd44356d118b5d1072ddca121bf43ae6387b4be` and exact projects `chromium` plus `chromium-regular`, and declares all 14 registered rules in observe mode.

The first exact uncached target command, `E2E_PORT_SHIFT=1900 PLAYWRIGHT_CHROMIUM_REGULAR=1 NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-ordinary-nx-21e timeout 2700s bunx nx run wbs-fe-01:test:browser:ordinary:level --skip-nx-cache`, exited **1** after 23m47s. Its discovery JSON reported Playwright 1.63.0, 427 selected specs (426 `chromium`, one `chromium-regular`) and zero top-level discovery errors. The collector then refused raw JUnit with `Browser JUnit structure is malformed` at `reconcileBrowserJunit`, before publishing a bundle. Its log is `/tmp/puni-ordinary-browser-21e.log`, SHA-256 `758708b8f7b9b4af62e2a611b20c5e4463437e8ebdf89bb50baa10efa1fde179`; the failed run is not counted as passing execution. The collector's scratch cleanup removed its raw JUnit, and all three ports were closed afterward.

Installed Playwright 1.63.0's JUnit reporter adds testcase annotation metadata as `properties/property`. A bounded, direct one-case diagnostic in a detached checkout of the same revision ran the existing opt-in `rendering-baseline.spec.ts` skip with the same config, two-project environment and `json,junit` reporters. It exited 0 with **one skipped**, and its raw XML (`/tmp/puni-ordinary-skip-red.xml`, SHA-256 `f373c26873f1d72fce23e366f930ee8e68e443993323576560e8f1acdf03130a`) contains `<testcase><properties><property name="skip" value="opt-in baseline experiment, not the acceptance gate"/></properties><skipped/></testcase>`. The first direct probe from the main root failed before collection because the root lacks setup-generated `AUTH_MODE`; the detached probe ran the collector's `tools/dev/setup.ts` and succeeded. The production shared parser rejected the `properties` tag because only outcome/stdout children were admitted. This is the observed cause; no suite selection, retry or timeout was changed.

TDD RED: `bun test tools/tool-devsync/src/browser-playwright.test.ts --timeout=60000` with the reporter-shaped skip fixture exited 1, **10 pass, 1 fail**, at `Browser JUnit structure is malformed`. The parser now admits only a first-child, attribute-free `properties` element under `testcase`, containing at least one `property` with exact `name` and `value` attributes and a nonblank name. Any annotation name is descriptive metadata; the JSON/JUnit identity, outcome and summary parity checks still determine status. The actual one-case XML reconciled through `reconcileBrowserJunit` with a skipped case after the fix. The first combined `bun test tools/tool-devsync/src/browser-playwright.test.ts apps/twilight-structure/twilight-burokrat/cli/src/evidence/browser.test.ts --timeout=60000` exited 0: **30 pass, 0 fail, 124 assertions**. The new production `inspect-browser` CLI case accepted valid annotation properties with `certifies:false` and absent authentication, and refused unknown/missing/blank property attributes, duplicate/late properties, stray property children, nonwhitespace property content and empty properties with no JSON output.

Watched mutations on that production CLI case were restored after each observation. Removing the reporter-properties allowance made its valid case fail with `Browser JUnit structure is malformed`. Removing the first-child position term, properties attribute term, property attribute count term, nonblank property-name term, nonempty-properties guard or nonwhitespace-text guard each made the named malformed-property CLI assertion fail because a bad XML bundle exited 0 where exit 1 was required. All seven mutant test exits were 1; the restored source passed. This proves the parser checks are breakable.

Post-format scoped validation on the corrected source: `bun test tools/tool-devsync/src/browser-level.test.ts tools/tool-devsync/src/browser-playwright.test.ts apps/twilight-structure/twilight-burokrat/cli/src/evidence/browser.test.ts --timeout=60000` exited 0 with **45 pass, 0 fail, 231 assertions**. Fresh forced TypeScript builds for `libs/shared/domain/test-evidence`, `tools/tool-devsync` and the Burokrat CLI each exited 0 with no diagnostics. The first scoped ESLint run found two test-only shorthand callbacks returning void; after braces were added, ESLint exited 0 with no diagnostics. Changed-file Prettier check exited 0, strict pinned OpenSpec reported `Change 'test-axes' is valid`, and `git diff --check` exited 0. The h2puni heavy gate was not run for this scoped correction. A full corrected ordinary target, immutable publication inspection, exact case reconciliation, normal server teardown checks and committed-source review remain pending in this pre-publication record.

The first committed parser candidate `eeeb79c8344f71df71cd10f7c92611645a614706` passed the full uncached ordinary target in **23m13s**. It selected 427 cases (426 `chromium`, one `chromium-regular`); the published bundle has 387 passed and 40 skipped cases, zero failed or errored cases, raw JUnit with 42 suites/427 cases, normalized JUnit with 427 cases, Playwright 1.63.0, revision equal to the commit SHA, and `certifies:false`. Those skips are 36 rendering-baseline opt-in cases, three scroll-stability opt-in cases, and one Gantt upward-drag case; all 40 identities remain skipped debt. Production `inspect-browser` accepted the untouched pointer under the external policy above and returned `authentication:{kind:"absent"}`. All three shifted ports were released after normal exit. The invocation is `802bb80b-6b4b-4395-8739-aec680f96767`; bundle is `tmp/junit/browser/802bb80b-6b4b-4395-8739-aec680f96767`; raw JUnit SHA-256 is `cae604e330f184e7f4bccce51a9a3beae1d0a210d154e39bdc97843e5c427d5b`; normalized JUnit SHA-256 is `164546309d1bde0486bb817c2a503b309830282099901ead227192ed6924fa54`.

Astra's exact-SHA review reproduced two additional annotation-boundary false accepts through production `inspect-browser`: whitespace-only property names and nonempty CDATA inside a property. The parser now trims property names and applies the existing character-data refusal to both SAX `text` and `cdata`; valid CDATA remains allowed for failure/stdout nodes. The production CLI regression refuses both forms. Removing the trimmed-name guard made the named test exit 1 because the malformed bundle was incorrectly accepted; removing the CDATA handler did the same. Both mutants were restored, and the corrected combined Browser suites passed **45/45, 237 assertions**. Fresh forced TypeScript builds for all three affected projects, scoped ESLint, changed-file Prettier, strict pinned OpenSpec validation and `git diff --check` passed on the corrected working tree. The first full target is evidence for its exact `eeeb79c8` candidate only. The corrected candidate still requires a full ordinary-target rerun, untouched publication inspection, port-release confirmation, and Astra approval before 2.1e can be checked off. Forced-timeout cleanup remains unverified.

On corrected commit `0847a26fab0d49fad895e1d234ad3165f43e3674`, two further uncached full ordinary runs completed collection but exited 1 on the same existing case: `hover-cards.spec.ts`, “Done stands by the notes marker, and closes the editor when pressed.” Both had 386 passed, 40 skipped, one failed, no Playwright process errors, and published immutable diagnostics; the exact external-policy `inspect-browser` run on invocation `ecad9eee-e578-451a-a3b7-3e0bcce1bf54` retained 427 identities including that failure, `authentication:{kind:"absent"}`, and `certifies:false`. Its raw JUnit digest is `5948a5ac3b6a5b51eb1db1977113b2c6d5e3a22d7a98bb04de85738722f48cf3`; normalized digest is `4443cce201d150bf2c4ab83fb10ad67acda5b65626f23d5c221da2c73c2d87b3`. In each failure, the rendered notes tooltip did not appear within 30 seconds after Done blurred the editor; all three ports were released after normal exit. A direct one-case replay passed once, the isolated `hover-cards.spec.ts` passed all 37 cases, and the same failing case passed 5/5 repeated isolated executions. These diagnostics establish an order/load-sensitive browser test failure but do not identify its root cause. Do not count either corrected-SHA full run as acceptance evidence. Task 2.1e remains unchecked until a clean full target succeeds on a committed candidate and its untouched bundle is inspected; no suite filter, retry, or timeout was changed to obtain a green run.

## Task 2.1e accepted ordinary Browser and revised portable observation — 2026-10-09

This entry supersedes the pending 2.1e status above. On clean committed `a0102f0b1e807c0a49212885af065f068217fd52`, the controller ran the uncached ordinary Browser level target with `E2E_PORT_SHIFT=1900` and `PLAYWRIGHT_CHROMIUM_REGULAR=1`; it exited 0 in 23m10s. Invocation `f002ab90-ae65-4c6e-b38f-69b0453e7d0f` published immutable discovery, execution, raw Playwright JUnit, normalized JUnit and manifest under `tmp/junit/browser/<invocation>/`. The manifest names the exact revision and candidate digest `3777b2230b67eb232e4b8d6e72cad5a54bf1d8cf53f709f3998526156ccd00d6`, with 387 passed, 40 skipped and no failed/errored cases across 427 selected identities in `chromium` and `chromium-regular`. The 40 skips remain debt: 36 rendering baseline opt-ins, three scroll stability opt-ins and one Gantt upward drag case. The raw and normalized JUnit retained all 427 identities. The controller observed shifted BE 5000, GW 5100 and FE 6100 refusing connections after normal exit. My read-only hash review of the published bundle found discovery `90cba42a22805e3a484c6591e4185cb25981cd9acb1984e6ef03a5f532c1ee15`, execution `6516421c2f517057db6a77556b343a1922fed9ed9398d6e33187f7da90b57d16`, raw JUnit `67e11d040d8c9534513f19b65c2bb164944ed9e57104184f1271bc2f7ef14901`, normalized JUnit `164546309d1bde0486bb817c2a503b309830282099901ead227192ed6924fa54` and manifest `3b94da2b7368798f9af55cf2ef6bb5f0b84dc6c57cf2e28e35c20e186fcccf53`. Production `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts inspect-browser /tmp/puni-test-axes-080-34 a0102f0b1e807c0a49212885af065f068217fd52 /tmp/puni-ordinary-browser-policy.json ordinary` exited 0 and reconciled all 427 cases under external policy digest `fa7761620d34f36080221fa06b0846e46fdaac26d4953497a2d0e37eafa1199c`; it returned authentication absent and `certifies:false`.

The same candidate's uncached `wbs-core:test:browser:portable:level` exited 0 in 5s. Invocation `230f0aaf-2288-4c91-b89f-55db63926957` published two passing Chromium cases, zero skipped/failed/errored. The bundle's discovery, execution, raw JUnit, normalized JUnit and manifest SHA-256 digests are respectively `f02ff6dbb094e1cb6ce49fbdfcea9cc3a542da7e60ca49f10d2c69ccdbe8a018`, `b70656aaa9e08a4bc1454a5d08a9d4ce55fe1526ddb30de8fc0ac2a6480ba81e`, `c6056440edc76848ac18f4e7d6086b7462961dcbcf32bda08b329ab05bd3e4c4`, `440c444c559beb3e8722479266c7c9d4a238c4020cd65ffc5fbab05ccbf03e78` and `7ad748969632e5015822bcd7106265041379a6793d2ca7e12e4a223f5faa39bd`. Production `inspect-browser` against the same external policy and exact candidate exited 0 with those two case identities, authentication absent and `certifies:false`. These are operational reports without authenticated runner/served-byte receipts; they do not complete Task 2.1.

## Task 2.2 — rename extension, pilot reports and open whole-tree reconciliation

Branch `feat/test-axes-b3-rename` committed selector version 3 support for exact `RENAMED Requirements` pairs in `8e22edc4a`, with strict blank/padded endpoint checks and a multi-slot canonical order test in `7f7f73f82`. The final production specifications suite passed **75/75, 1,071 assertions** after the empty-section case was added. Fresh forced CLI TypeScript build, changed-file Prettier, scoped ESLint, strict `test-axes` and `gantt-calendar-axis` OpenSpec validation and `git diff --check` exited 0. Watched production negatives: removing endpoint uniqueness let a chain exit 0; removing the cross-change endpoint guard let a competing destination exit 0; removing pair syntax changed reversed endpoints into a null-access refusal; removing exact nonblank title validation let a whitespace-only destination exit 0. A later review also removed the heading diagnostic guard and observed the heading-in-pair CLI assertion fail with a generic pair refusal; removed the empty-section guard and observed the empty RENAMED section beside a valid ADDED operation exit 0; removed the absent-predecessor guard and observed the unknown-source assertion fail with an undefined-object error; removed the occupied-destination guard and observed the same-title rename exit 0; and removed the shared pair-syntax guard with an odd missing-TO line and observed the assertion fail with a null-access error. Every mutation was restored, and its focused production CLI negative passed on the restored code.

The first committed whole-tree selection after the rename extension refused the active `gantt-calendar-axis` pair because its `FROM` title had no active canonical predecessor. Accepted archived Gantt lineage was composed into `openspec/specs/wbs-domain/spec.md`, and the active calendar delta was reconciled with the later Detail switch behavior while retaining canonical scenario titles. That source reconciliation is `7f7f73f82`; archive files are not runtime selector input. The next committed check refused a new `deployment-pipeline` requirement falsely marked MODIFIED. Its requirement delta was corrected to ADDED in `21c2cf8a0`; a follow-up restored the proposal's Modified Capabilities classification, which names the existing deployment-pipeline capability and its new requirement, preserving handoff holds. On `21c2cf8a0`, production `check committed /tmp/puni-test-axes-b3-rename 21c2cf8a0 /tmp/puni-22-policy.json --rule SPEC-SCENARIOS` exits 1 with `competing overlay operation: di-composition: A module's label names its private bindings in failures`. The policy pins base `a0102f0b1e807c0a49212885af065f068217fd52`; no conflict check was relaxed. Task 2.2 and prerequisite 2.2a remain unchecked.

The pilot targets were run uncached from this isolated worktree with the declared Nx targets. The sandboxed `wbs-store-sqlite:test:api` failed on `EPERM` from the real write-lock-holder subprocess; the same target rerun outside the sandbox passed **1,174/1,174, 3,598 assertions** and wrote `tmp/junit/wbs-store-sqlite.api.xml` (SHA-256 `58f76b2aa529a357a5d51e78668601051fb6d41044123d4302cdfc5ed4f0883c`). `wbs-store-sqlite:test:unit` passed **40/40, 726 assertions**, report `tmp/junit/wbs-store-sqlite.unit.xml` (SHA-256 `fb6839d9a9f34a9be599dc58154ddbdea01d343dfe15a39a4cc5ca1c23b59195`). `wbs-core:test:unit` passed **847/847, 2,537 assertions**, report `tmp/junit/wbs-core.unit.xml` (SHA-256 `4a805473fa025ab1f0e8646336aefe9420053e17446e1742461d98367eba29bd`). The reports are fresh but were produced while the selector/spec worktree had unrelated uncommitted edits, so they are operational pilot evidence rather than a clean committed candidate receipt.

`bun tools/tool-devsync/src/scenario-coverage-cli.ts project-assignment-reads wbs-store-sqlite:test:api wbs-store-sqlite:test:unit wbs-core:test:unit` exited 0 and printed `yes` for `PROJECT-ASSIGNMENT-READS-001`, `002` and `003`. The passing citations are in `libs/wbs/adapters/store-sqlite/src/assignment-scope.db.test.ts` for 001/002 and `libs/wbs/application/core/src/module/work-item/work-item.resource.test.ts` for 003. For the negative, a disposable worktree at base `7f7f73f82` committed only the removal of `[PROJECT-ASSIGNMENT-READS-003]` from that Unit test title as `e4a87e0fb3c9b01ec51367dd44ef25993f7f38fc`; its file SHA-256 changed from `f90305741498e64286d125e23f0c92d79de20550fe8bb1f6be9389b40c43db68` to `c69c0349aa589de8f2e274fb4408a29c8d67823f79ace361ccff0f6facae0acd`. The disposable uncached `wbs-core:test:unit` passed **847/847** and wrote a fresh core JUnit with SHA-256 `81f950fd6286414006e758ba90ae02cea470b1686c2cc927eebf8afd1b522028`. Its coverage command, using that report and copied unchanged pilot API/SQLite Unit reports, exited 0 and printed 001 `yes`, 002 `yes`, 003 `**no**`. The disposable worktree was removed. The main source test still hashes `f90305741498e64286d125e23f0c92d79de20550fe8bb1f6be9389b40c43db68`, and the original coverage join again prints three `yes` rows. This proves citation sensitivity without claiming B4 certified coverage.

### Task 2.2a active operation inventory

The following raw fragment inventory was taken from the active spec files at commit `21c2cf8a0`. Digest is SHA-256 of the requirement heading and body fragment through the next level-two/three heading. The 12 rows labelled missing are MODIFIED records without a same-title canonical or active ADDED declaration; the Gantt destination row is already resolved by its explicit rename pair. The eight overlap groups contain 16 records; six overlap groups are ADDED plus MODIFIED, and two are MODIFIED plus MODIFIED. A MODIFIED member in an ADDED plus MODIFIED group is also a missing canonical-predecessor record, producing 18 reviewed predecessor records from 12 plus six; the explicit Gantt rename resolves one, leaving 17 unresolved after the solver-binding correction. This inventory is a triage aid; the production selector's committed verdict remains authority. No unresolved row was reclassified or selected by file order.

| Finding             | Capability             | Exact requirement title                                               | Operation | Active path                                                                                     | Fragment SHA-256                                                   | Review state                            |
| ------------------- | ---------------------- | --------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------- |
| missing predecessor | wbs-domain             | One pointed row, and each face lights the other's answer              | MODIFIED  | `openspec/changes/pointed-row-one-ink/specs/wbs-domain/spec.md`                                 | `11d1ed837ee2235c71ff70f1e83e5cf19130b842dba9d807acf680612e714e83` | requires source lineage review          |
| missing predecessor | wbs-domain             | The notes preview is one card, on hover and while editing             | MODIFIED  | `openspec/changes/notes-preview-unify/specs/wbs-domain/spec.md`                                 | `ec2f0af5da1bc9b041547a9a160348933834170eda45e57ebfdc8f49ef1d28ba` | requires source lineage review          |
| missing predecessor | wbs-domain             | A work item's name renders inline markdown                            | MODIFIED  | `openspec/changes/markdown-work-item-names/specs/wbs-domain/spec.md`                            | `14a2a174dd80133d58e8af410aabed6b3b1b2954ff492ce415e82a62d5cc0f25` | requires source lineage review          |
| missing predecessor | wbs-domain             | The hover preview's heading is structure the app writes               | MODIFIED  | `openspec/changes/markdown-work-item-names/specs/wbs-domain/spec.md`                            | `1ddbd2c091df1956b3a90df318e7893377432e7debc2f1d738032c7b4cfc236d` | requires source lineage review          |
| missing predecessor | wbs-domain             | The export and the search read the name's source                      | MODIFIED  | `openspec/changes/markdown-work-item-names/specs/wbs-domain/spec.md`                            | `9c1a40e08202878d66a85234a5ed56187f02df59b3701a49998ef150a625635b` | requires source lineage review          |
| missing predecessor | wbs-domain             | Every hint is drawn by the page                                       | MODIFIED  | `openspec/changes/hint-press-cancels/specs/wbs-domain/spec.md`                                  | `72b3e14c4a1820b23ac80cad0545cc7fafe01b4dc8e476ffca519030b3c5313f` | requires source lineage review          |
| missing predecessor | wbs-domain             | A waiting tool hint shows a wait ring                                 | MODIFIED  | `openspec/changes/hint-press-cancels/specs/wbs-domain/spec.md`                                  | `92195eb32ec8495f169539b2470e6683c1129b6a3ae5640aed4fed181cba9e64` | requires source lineage review          |
| missing predecessor | wbs-domain             | One pointed row, and each face lights the other's answer              | MODIFIED  | `openspec/changes/pointed-row-render-cost/specs/wbs-domain/spec.md`                             | `79c621d9a9a12d4db1a9092a0480c50c1692529f494d28567e9d7de5845277b5` | requires source lineage review          |
| missing predecessor | wbs-domain             | The calendar day is the SVG unit                                      | MODIFIED  | `openspec/changes/gantt-calendar-axis/specs/wbs-domain/spec.md`                                 | `c611e7d3563a60936a4391cf758a938899b6033273ba82ea2a60195481c03503` | resolved by explicit Gantt rename pair  |
| missing predecessor | wbs-domain             | A dragged Gantt panel stays inside the column it lives in             | MODIFIED  | `openspec/changes/gantt-height-column-clamp/specs/wbs-domain/spec.md`                           | `0373fa2548b53fb0d17288631e696c7e4a6c103e41e24145b05e12126ae92b0a` | requires source lineage review          |
| missing predecessor | wbs-domain             | The panel's top edge follows the pointer                              | MODIFIED  | `openspec/changes/gantt-height-column-clamp/specs/wbs-domain/spec.md`                           | `782967ab0b077945d4b24df966e722e31bd694b74b3e6b5b60ebb4bf9e1a1a8c` | requires source lineage review          |
| missing predecessor | wbs-domain             | A remembered height is a claim about a window that may have changed   | MODIFIED  | `openspec/changes/gantt-height-column-clamp/specs/wbs-domain/spec.md`                           | `c384ecffb65e41287a1120c0e0729751e48aac4cb1a0ad9f49f0a991f0758f78` | requires source lineage review          |
| overlap 1           | wbs-domain             | A bar explains itself and finds its row                               | MODIFIED  | `openspec/changes/gantt-bar-hover/specs/wbs-domain/spec.md`                                     | `57ed30eae56b5daab73542e9c6a94ef63fc029307397dfc7c63fb41bf2f32668` | active dependency; no path-order winner |
| overlap 1           | wbs-domain             | A bar explains itself and finds its row                               | MODIFIED  | `openspec/changes/gantt-calendar-axis/specs/wbs-domain/spec.md`                                 | `cc2a1e916fb207c02c512864c50a952b77bb9289eca1979c086f5fe8ccb8e102` | active dependency; no path-order winner |
| overlap 2           | wbs-domain             | One pointed row, and each face lights the other's answer              | MODIFIED  | `openspec/changes/pointed-row-one-ink/specs/wbs-domain/spec.md`                                 | `11d1ed837ee2235c71ff70f1e83e5cf19130b842dba9d807acf680612e714e83` | active dependency; no path-order winner |
| overlap 2           | wbs-domain             | One pointed row, and each face lights the other's answer              | MODIFIED  | `openspec/changes/pointed-row-render-cost/specs/wbs-domain/spec.md`                             | `79c621d9a9a12d4db1a9092a0480c50c1692529f494d28567e9d7de5845277b5` | active dependency; no path-order winner |
| overlap 3           | scheduler-optimization | Every duration crossing the solver boundary is computed by the caller | MODIFIED  | `openspec/changes/unestimated-steps-take-no-schedule-time/specs/scheduler-optimization/spec.md` | `992cb9f629f483e991ded8733d272f6df8986d5e6e75f86cb6e3145cb8d0a642` | active dependency; no path-order winner |
| overlap 3           | scheduler-optimization | Every duration crossing the solver boundary is computed by the caller | ADDED     | `openspec/changes/dual-optimized-scheduler/specs/scheduler-optimization/spec.md`                | `bb70df76b22fa6d2a0893d9bf7712ca5a194e5fbae2874777eaf1693fb9054b5` | active dependency; no path-order winner |
| overlap 4           | wbs-domain             | A column with a declared width can be dragged to another width        | MODIFIED  | `openspec/changes/name-column-drag/specs/wbs-domain/spec.md`                                    | `a5c33929d2bd60447711769c176606087115bec9099a7c65b0f593f287b78c27` | active dependency; no path-order winner |
| overlap 4           | wbs-domain             | A column with a declared width can be dragged to another width        | ADDED     | `openspec/changes/column-widths-drag/specs/wbs-domain/spec.md`                                  | `3d10305d27221b2730616437f36df82ae37fd0bd6d0eec132fc1cb2a85f9877c` | active dependency; no path-order winner |
| overlap 5           | di-composition         | A module's label names its private bindings in failures               | ADDED     | `openspec/changes/adopt-di-composition/specs/di-composition/spec.md`                            | `ad631114966a56d85f6d9ad3fe5d47ee64052241991908a257f344813c44895e` | active dependency; no path-order winner |
| overlap 5           | di-composition         | A module's label names its private bindings in failures               | MODIFIED  | `openspec/changes/di-bag-label-surface/specs/di-composition/spec.md`                            | `5226bb8736fc3359e513a53796a5950232dec822b8a3cf57f6951834755a8375` | active dependency; no path-order winner |
| overlap 6           | wbs-estimate-cell      | The result is the folded step cell's main reading                     | MODIFIED  | `openspec/changes/keep-single-estimate-visible/specs/wbs-estimate-cell/spec.md`                 | `7b291b57d9c7b95c5077e1dfa908a66b8683bebb3d25e76ae97b90fdb994e360` | active dependency; no path-order winner |
| overlap 6           | wbs-estimate-cell      | The result is the folded step cell's main reading                     | ADDED     | `openspec/changes/estimate-cell-at-rest/specs/wbs-estimate-cell/spec.md`                        | `6f4f06f3ff242c4419d7043b63207487c1bb6a80b488eb1937275d7085b3877d` | active dependency; no path-order winner |
| overlap 7           | wbs-estimate-cell      | A flat trio is not said twice                                         | MODIFIED  | `openspec/changes/keep-single-estimate-visible/specs/wbs-estimate-cell/spec.md`                 | `f1102040c794e14fab385c12b50dcef4e19bbe9b5842ccb0348aebf6bff142f9` | active dependency; no path-order winner |
| overlap 7           | wbs-estimate-cell      | A flat trio is not said twice                                         | ADDED     | `openspec/changes/estimate-cell-at-rest/specs/wbs-estimate-cell/spec.md`                        | `a336f80824d43704832c240cf656b1398d13948198bf0bb9eb044b9bd0f7eb83` | active dependency; no path-order winner |
| overlap 8           | wbs-domain             | The notes editor closes on Escape and on Done, and both save          | ADDED     | `openspec/changes/notes-editor-done/specs/wbs-domain/spec.md`                                   | `7906d3f9cc0a7b83f9338fe5f9da05b6793cad2ef2cb5e391f8ec73e6f18d784` | active dependency; no path-order winner |
| overlap 8           | wbs-domain             | The notes editor closes on Escape and on Done, and both save          | MODIFIED  | `openspec/changes/notes-done-by-the-marker/specs/wbs-domain/spec.md`                            | `92d3eb02498aa83a9a53f83513675fd1f336421b75dda8abf720b36faf133172` | active dependency; no path-order winner |

### Task 2.2a bounded source reconciliation — 2026-10-09

Starting commit `2e4a4525562945c47814e7bfe39cecbfa3b7c2d0` had a clean worktree. The accepted predecessor is `openspec/changes/archive/2026-09-01-tool-hints-wait/specs/wbs-domain/spec.md` (SHA-256 `f883c059d9294ee71a33ce55ab802cd407cdaa972de372a4dae8129db4cf4afb`). Source commit `2104be5c999f3c98780e1f64ce20e4c9d5daed3b` copies its complete `Every hint is drawn by the page` and `A waiting tool hint shows a wait ring` requirement fragments into the canonical wbs-domain spec. Their heading-and-body fragment SHA-256 digests are `e5d6d2fdd4f6d19eeefe2b90a15ae1095632297cc4203322a1fbc9643a2e7e6b` and `7b442784848b9eba60bdc5c837efdb93e42958b24b2ff037ed73a7b63c29c32b`. The canonical file SHA-256 is now `caf119d804796893d96426a300f2c066146b3ec9aa7bf959d1ca938049ac5823`.

The same source commit retains eight archived scenario bodies in `hint-press-cancels` under their corresponding two MODIFIED requirements, with no change to its existing press behavior: `a cursor crossing the toolbar`, `a fact nested inside a hinted control`, `the pointer moves on`, `the keyboard`, `a tap`, `a mark with nothing to say today`, `the ring goes with the pointer`, and `a fact draws no ring`. The prior fragment inventory normalized trailing whitespace with `trimEnd()`: those two normalized canonical requirement fragment hashes are `e5d6d2fdd4f6d19eeefe2b90a15ae1095632297cc4203322a1fbc9643a2e7e6b` and `7b442784848b9eba60bdc5c837efdb93e42958b24b2ff037ed73a7b63c29c32b`; raw selector-fragment hashes are `d94c262ef8171fde3d3e0625e2561bb69947e3996ca3a5ba82bcd7cf7dbecc3e` and `8c4343da2292ae202d625de93a7c6b9f9ad90f8a76a3fef9d568edfb549c20d2`. Seven active scenario heading/body fragments match their archived bytes exactly. The `a fact draws no ring` active fragment is 194 bytes and the archived fragment 193 bytes because the active spec includes the separating newline; after `trimEnd()` their bytes match. The active hint delta SHA-256 is `e875ca6f48973d8dd64c727c986f67edf048a097020570a145b970911e5f9138`.

The three `markdown-work-item-names` requirements and the single `notes-preview-unify` requirement are new titles with no canonical predecessor in the reviewed lineage, so their section labels changed from MODIFIED to ADDED; their requirement/scenario bodies stayed unchanged. Those file SHA-256 digests are `91ad11621b4de4d4d59c524316d05126bee1d537dce95fb6da42325844628ac2` and `f4a2bba60de90a0196af359ac9cdbe442627e84a6892793664336e9320ef3257`. The three explicitly held `gantt-height-column-clamp` records, all eight competing active overlap groups, and every task checkbox and WBS record remain untouched. The older inventory table above is explicitly an inventory at `21c2cf8a0`; these four labels and two hint predecessor entries are now reconciled, while its other rows remain review input.

Focused checks on the source commit:

| Command                                                                                                                                                               | Exit | Observation                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate hint-press-cancels --strict --json`                                                                   |    0 | One item passed; zero issues.                                                                                                                                                                                                                                                                                         |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate markdown-work-item-names --strict --json`                                                             |    0 | One item passed; zero issues.                                                                                                                                                                                                                                                                                         |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate notes-preview-unify --strict --json`                                                                  |    0 | One item passed; zero issues.                                                                                                                                                                                                                                                                                         |
| `GSETTINGS_BACKEND=memory bunx prettier --check` over the four changed source spec files                                                                              |    0 | All matched files use Prettier style.                                                                                                                                                                                                                                                                                 |
| `git diff --cached --check` before source commit                                                                                                                      |    0 | No whitespace errors.                                                                                                                                                                                                                                                                                                 |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check committed /tmp/puni-test-axes-b3-rename 2104be5c9 /tmp/puni-22-policy.json --rule SPEC-SCENARIOS` |    1 | Production JSON: `allowed:false`, `certifies:false`, `findings:[]`, `unevaluated:[{"ruleId":"SPEC-SCENARIOS","reason":"competing overlay operation: di-composition: A module's label names its private bindings in failures"}]`; candidate digest `880eb030bfbf1b139f2a41c0f03693c693c426f899d381160050c9c5f036b1c8`. |

The selector policy SHA-256 is `4d84f3d3454a82cfcd12b99677dda5c385795f02d1001a2062438065bfd95c01` and pins base `a0102f0b1e807c0a49212885af065f068217fd52`. The refusal is an unresolved active DI overlap. No selector check was relaxed and this slice does not complete Task 2.2 or 2.2a.

### Task 2.1g Performance implementation checkpoint — 2026-10-09

Design ruling: the dedicated Performance config now needs `CI=1` and one shifted base URL. Its earlier empty `selectionEnvironment` assumption is invalid for the real FE/BE/GW stack. The shared validator and Burokrat judge require exactly `{CI:'1', E2E_PORT_SHIFT:<canonical decimal>}` with shift 1–9999 except 100, 1000 and 1100. The runner captures the pair once and passes it to setup, three services, discovery and execution; evidence and manifest bind it. Cost if this ruling is wrong: accepting a different effective URL could evaluate the wrong stack, while rejecting a valid shift blocks Performance execution. Astra's re-review of the amended contract remains required before treating this ruling as approved.

Design ruling: tests may inject only the three launch descriptors into the same internal runner in an isolated subprocess and scratch repository. The production CLI constructs the shared ordinary FE/BE/GW descriptors and rejects alternate-service arguments; descriptor injection supplies no readiness, ownership, cleanup, policy or publication answer. Cost if wrong: a synthetic test path could pass while the ordinary stack is unsupervised, so the CLI's missing-input and alternate-service refusals and the exact shared descriptor comparison are mandatory boundary proofs.

Observed production-path probes on this worktree (the loopback tests used an approved sandbox escalation because ordinary sandbox socket binding returned `Failed to listen at 127.0.0.1`):

| Probe                              | RED                                                                                                                                                                                                                                      | GREEN                                                                                                                                                                                                                                                                             |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real fixture discovery             | `bun node_modules/playwright/cli.js test --config apps/wbs/fe-01/playwright.performance.config.ts --project chromium --list --reporter=json`: `suites:[]`, `errors:[No tests found]`                                                     | With `E2E_PORT_SHIFT=6000`, one suite and the declared `[TEST-AXES-038]` case; exit 0                                                                                                                                                                                             |
| Orphaned separate-session children | Replacing forced SIGKILL with SIGTERM made `bun test tools/tool-devsync/src/performance-processes.test.ts --test-name-pattern 'immediately exiting wrapper'` fail after 8.05 s: `Performance owned process cleanup did not converge`     | Same elevated command: 1 pass, 0 fail; listener child and TERM-resistant child absent from `/proc`, unrelated process still present                                                                                                                                               |
| Shifted port admission             | With the port guard absent, the occupied-port production test failed: expected `occupied`, got `operation unexpectedly succeeded`                                                                                                        | Elevated occupied-port test: 1 pass, 0 fail; existing listener remained                                                                                                                                                                                                           |
| Readiness                          | Before supervised startup, the failed-GW production test failed: expected `readiness`, got `operation unexpectedly succeeded`                                                                                                            | Elevated failed-readiness test: 1 pass, 0 fail; no current pointer                                                                                                                                                                                                                |
| Threshold diagnostics              | Removing pointer invalidation made the synthetic 280 ms versus 200 ms threshold test fail: expected current pointer `ENOENT`, got `operation unexpectedly succeeded`                                                                     | Elevated timing threshold test: 1 pass, 0 fail; failing JUnit, 280 ms observation and `failure.json` retained only in invocation bundle                                                                                                                                           |
| Lock                               | Disabling flock refusal made the busy-lock test fail: expected `lock is busy`, got `operation unexpectedly succeeded`                                                                                                                    | Busy-lock test: 1 pass, 0 fail; old pointer preserved                                                                                                                                                                                                                             |
| Env binding                        | With environment omitted from Burokrat's digest, `binds the exact shifted CI environment into the selection digest` failed because 6000 and 6500 yielded the same SHA; under the old empty-env rule, the `{}` rejection assertion failed | `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/performance.test.ts --test-name-pattern 'selection environment\|shifted CI environment'`: 1 pass, 20 filtered, 0 fail, 2 assertions; shared decoder focused test: 1 pass, 11 filtered, 0 fail, 13 assertions |
| Sequential publication             | Before current-pointer publication, the real runner test failed `ENOENT ... performance.current.json`                                                                                                                                    | Elevated sequential test: 1 pass, 0 fail; distinct immutable invocation bundles and current pointers                                                                                                                                                                              |
| Execution deadline                 | The elevated `bun test tools/tool-devsync/src/performance-level.test.ts --test-name-pattern 'kills a hung Playwright child'` returned 1 pass, 0 fail in 123.27 s                                                                         | A 180-second hung fixture hit the independent 120-second collector deadline; cleanup completed; no current pointer or legacy outputs and a timeout `failure.json` remained                                                                                                        |
| Production CLI boundary            | Disabling the alternate-service argument guard made the focused CLI negative exit 1: expected `does not accept alternate service arguments`, received missing declaration `ENOENT`                                                       | Restored focused CLI test: 1 pass, 0 fail, 4 assertions; missing real declaration refused and `--services=synthetic` refused before admission                                                                                                                                     |

These are noncertifying operational proofs. Exact committed real-stack execution and the two uncached target runs belong to 2.1h; no 2.1h completion is claimed here.

The complete elevated runner suite exposed an unresolved intermittent cleanup race: one run passed 38/39 with a shifted-port test-input mismatch, and after correcting that input two exact full runs each passed 39/40 but failed the 120-second timeout case because an adopted zombie's `waitpid` did not return its PID. Two later exact full runs passed 40/40 (345 assertions, 231.65 s and 231.20 s), and isolated timeout plus seven-case lifecycle sequence passed. The first named failed invariant is `Performance waitpid failed for adopted <pid>`; return value, errno and post-call `/proc` identity are now included in that refusal, but the two passing reruns did not produce a diagnostic sample. A separate FFI probe against a known nonchild returned `waited=-1, errno=10` (`ECHILD`), proving the diagnostic reads errno. Fifty short many-child owner runs and twenty 30-cycle Bun-parent owner runs did not reproduce the race. Task 2.1g remains unchecked until this cleanup invariant converges and the exact full suite is repeatably green. Cost if this race is ignored: a timeout can leave owned descendants or lose the original failure behind cleanup failure, so no success pointer can be trusted.

### Task 2.1g reviewed lifecycle corrections and full-mount fault — 2026-10-09

The owner now runs only in an isolated supervisor subprocess. The Bun test process remains outside subreaper state; an unrelated child launched outside that supervisor after owner creation survived the owner's drain. A controller may inject only launch descriptors for scratch tests. Kernel parentage/adoption in the exclusive supervisor, `/proc` start time and pidfd identity remain the ownership authority; an environment marker is not used. Cost if that ruling is wrong: an unrelated child could be signaled or an env-cleared adopted child could escape cleanup. The supervised setup is `bun run tools/dev/setup.ts` in the detached checkout; it seeds ignored `.env` files from committed examples. The runner creates its own checkout `tmp/` before ordinary BE launch, as the shared descriptor's per-invocation SQLite path needs that parent. It removes the whole detached checkout after cleanup. Cost if the directory is omitted: BE exits during readiness before the measured case; putting a database outside the checkout would weaken invocation isolation.

The exact external diagnostic policy bytes are retained in [policy.json](evidence/performance-fullmount-fault/policy.json), SHA-256 `79d24f20bc78b417246605f04d8bef209a0aef299aef6c6cf6d3d3bf2160cb77`. The controller wrote and selected it **outside** the candidate, and the candidate had no policy-selection input. This experiment did not establish filesystem write isolation from a same-user candidate process; the retained policy bytes and digest describe what the judge read, not an inability to edit the external path. It pins config SHA-256 `56cd892eba44a0b1e33199a81df18fb33c36953e2b6fe8e8bf4e5017ede5dae7`, Playwright `1.63.0`, `wbs-folded-mounted-cells` case digest `c307d8b165a0ab4d11cb9e98ce8310fb804729a88fa12fea9a939be869016e53`, and the unchanged `count lte 1200` declaration. The checked-in policy was not changed and still has `reviewedCases:[]`. This disposable policy supplies only a noncertifying fault experiment; it is not a human review or trusted admission for 2.1h.

The disposable committed candidate was `ae83c43ae851021eec7e4625c43d6abd4ec2bec6` with Burokrat candidate identity `814fc266babe1e75ab81bc2bc96ec1344f958416f29fe2511705f6a6d85c79c2`. Its product-path [fault patch](evidence/performance-fullmount-fault/candidate-fault.patch) replaces the `viewportRows` filtered entry set with all entries; the 100-row `[TEST-AXES-038]` fixture, declaration and 1200 threshold stayed unchanged. The first exact elevated `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-performance-fullmount-nx-21g E2E_PORT_SHIFT=6000 PUNI_PERFORMANCE_RULE_POLICY=/tmp/puni-performance-fullmount-controller-21g/external-policy.json bunx nx run wbs-fe-01:test:performance:level --skip-nx-cache` exited 1 in 25.6 s at BE readiness (`http://localhost:9100/health exited 1`): the detached checkout lacked `tmp/` for the database. The focused production-path test with the mkdir disabled likewise exited 1, 0 pass/1 fail, at BE exit 27; restored mkdir exited 0, 1 pass/0 fail, 6 assertions.

The second exact elevated Nx command above exited **1** in **1m 0s** with `Performance threshold failure: wbs-folded-mounted-cells`. The [run JSON](evidence/performance-fullmount-fault/run.json), [discovery JSON](evidence/performance-fullmount-fault/discovery.json) and [evidence JSON](evidence/performance-fullmount-fault/evidence.json) bind the real 100-row mounted-cell observation **1500 count**, above 1200, and exact selection `{CI:'1',E2E_PORT_SHIFT:'6000'}`. The [failing JUnit](evidence/performance-fullmount-fault/report.xml) has tests=1, failures=1 and SHA-256 `fee7a546032e78f613440630ebe00e65cb3c39b3fc150750908ff1ffb2f4abd4`; [manifest](evidence/performance-fullmount-fault/manifest.json) binds the same report digest, and evidence SHA-256 is `55e28cc9259d4aad2573a1bf8417ba066bfbf7ca341f2ba16bddb0b01d799063`. [Failure diagnostics](evidence/performance-fullmount-fault/failure.json) retain the threshold error with `cleanupFailures:[]`. The current-success pointer and all three legacy outputs were absent. A fresh elevated Bun bind probe found ports 9100, 9200 and 10200 free. `git worktree list --porcelain` showed no runner-created detached checkout after the target; only the intentionally retained disposable fault and manual diagnostic worktrees appeared. These saved artifacts make the fault result reviewable after scratch deletion and remain `certifies:false`.

The natural timeout race was captured on a 124.28-second combined runner test: `waitpid(..., WNOHANG)` returned **0** with `/proc` still reporting adopted zombie state `Z`; errno 22 was stale because a zero return is not an error. An injected zero-return owner test first failed with `Performance waitpid failed for adopted ... waited=0 errno=22 observed=Z` (0 pass/1 fail), then passed after bounded rescan (1 pass, 0 fail) while the injected `-1/ECHILD` refusal also passed (focused pair: 2 pass, 0 fail, 10 assertions). The combined 120-second runner assertion needs a fresh rerun after this correction. A global `/proc` enumeration fault was then injected at the first stop inventory: the owner test initially left an established child alive (0 pass/1 fail), then passed with fallback draining of registered identities (1 pass, 0 fail, 5 assertions); the recorded ambiguity still refuses publication. The child-observed exact-env test covered setup, three services, discovery and execution while descriptor extras said CI=0/shift=9999 and a test preload mutated parent env after setup spawn. Moving extras after the exact pair made it fail with observed CI=0/shift=9999 (0 pass/1 fail); restored order passed (1 pass, 0 fail, 13 assertions). A 1 MB stderr-pipe supervisor test and a never-exiting supervisor test passed together (2 pass, 0 fail, 4 assertions), proving concurrent pipe drain and bounded test harness wait.

Final-tree correction evidence supersedes that paragraph's pending combined-run sentence. The named combined immediate-wrapper, separate-session listener and TERM-resistant sleeper test passed with the independent 120-second execution deadline in the full runner suite. A test-only preload made the first `pidfd_open` see a verified exit, then returned the same PID with a changed `/proc` start time. Before the direct-child identity guard, `bun test tools/tool-devsync/src/performance-processes.test.ts --test-name-pattern 'does not transfer direct ownership'` exited 1: expected `PID identity changed for <pid>`, received `Error: cleanup unexpectedly succeeded`. After the guard, the exact command exited 0 with **1 pass, 0 fail, 5 assertions** in 8.09 seconds; the simulated foreign process stayed alive and was terminated only by test teardown. This is a refused ambiguity, so the eight-second cleanup deadline still ends in failure, with no foreign signal.

`bun test tools/tool-devsync/src/performance-processes.test.ts` on the final source exited 0 with **22 pass, 0 fail, 112 assertions** in 23.29 seconds. It covers prerequisite refusals, adopted separate-session and env-cleared children, a first-inventory zombie, later foreign children, transient `pidfd_open`, post-open descriptor closure, discovery and signal-time identity changes, signal and inventory faults with continued sibling drain, `waitpid` zero and ECHILD paths, and bounded direct-child settlement. The complete elevated `bun test tools/tool-devsync/src/performance-level.test.ts` on the same production source exited 0 with **47 pass, 0 fail, 423 assertions** in 392.51 seconds. Its 123.11-second hung-Playwright case and 124.10-second combined orphan/deadline case both passed; threshold breach, child-observed exact environment, retained failure plus cleanup context, post-run inventory ambiguity, atomic bundle member and no-pointer negatives also passed. These tests use isolated supervisors and scratch candidates; they do not substitute for Task 2.1h's two successful exact real-stack runs. Task 2.1h remains unchecked.

After a formatting-only pass, the owner suite passed again with **22 pass, 0 fail, 112 assertions** in 23.20 seconds. `bunx tsc --build --force tools/tool-devsync/tsconfig.json`, scoped `bunx eslint` for the eight changed/new TypeScript files, changed-file `bunx prettier --check`, strict pinned `test-axes` OpenSpec validation, and `git diff --check` each exited 0. ESLint warned that no cached Nx ProjectGraph was available and skipped `@nx/enforce-module-boundaries`; its other rules ran. The host-wide h2puni gate, an authenticated collector receipt and Task 2.1h's two exact successful ordinary-stack target runs are unverified here. Task 2.1g's checkbox stays open pending final code review and whole-tree gate evidence; this record does not claim 2.1h completion.

### Task 2.1g second ownership and supervisor review — 2026-10-09

Architecture ruling: the captured `{CI:'1',E2E_PORT_SHIFT:<canonical decimal>}` pair is the only selector environment for the detached invocation, and the scratch test boundary may inject only FE/BE/GW launch descriptors. The dedicated invocation supervisor, kernel parentage/adoption, exact `/proc` start time and validated pidfd are ownership authority; an environment marker is not. Cost if wrong: an ambient environment or synthetic descriptor could select a different stack, or an unowned process could be signaled. These are the already reviewed production/scratch boundaries, restated here because the second ownership review depends on them.

Astra found that a reused non-direct owned PID could seed foreign descendants: the old selection admitted B/C from `owned.has(pid)` and expanded the tree before rejecting changed root A. The new isolated preload keeps A's PID but changes its observed start time after A/B/C were inventoried. Initial watched `bun test tools/tool-devsync/src/performance-processes.test.ts --test-name-pattern 'does not signal foreign grandchildren'` exited 1: foreign grandchild C was absent where the test required it alive. The first pre-expansion fix also exited 1: trace showed rejected A was re-added through wrapper expansion, then C was reselected after adoption. The corrected owner rejects changed roots before selection, excludes descendant paths through them, and carries exact `(PID,starttime)` taint across scans so later adoption cannot confer ownership. The focused command then exited 0 with **1 pass, 0 fail, 5 assertions** in 123 ms: A/B/C survived, an independently owned sibling drained, and cleanup refused success. Cost if taint is too broad: a genuinely adopted child could escape cleanup; binding it to exact identities and only descendants of a rejected root limits that refusal to ambiguous ancestry.

A separate shell wrapper exited while a background sleep retained inherited stderr. The old fixture helper's exit-only race left stderr EOF outside its deadline: `bun test tools/tool-devsync/src/performance-supervisor-test.test.ts --test-name-pattern 'stderr pipe holder'` exited 1 with `Received: "unbounded pipe wait"` after 500 ms. Racing the combined exit and pipe collection against one deadline, then cancelling the reader, made the same test exit 0 with **1 pass, 0 fail, 3 assertions** in 186 ms. The combined owner/helper suite exited 0 with **26 pass, 0 fail, 124 assertions** in 23.66 seconds. Cost if this helper bound is absent: a test supervisor can hang after its wrapper exits, hiding a cleanup failure and preventing a terminal verdict.

On the corrected tree, the complete elevated `bun test tools/tool-devsync/src/performance-level.test.ts` exited 0 with **47 pass, 0 fail, 423 assertions** in 391.90 seconds. The hung Playwright case passed in 123142.97 ms; the immediate-wrapper separate-session listener plus TERM-resistant sleeper case passed in 124168.29 ms. Retained threshold plus cleanup diagnostics, post-run inventory ambiguity, atomic evidence publication, and absent current-pointer negatives all passed. The full runner result does not establish the host-wide h2puni gate or Task 2.1h's two successful exact real-stack runs; both tasks remain unchecked pending review/gate and 2.1h evidence respectively.

### Task 2.1h viewport-budget experiment and geometry diagnostic — 2026-10-09

The committed 100-row, two-step folded Performance case exceeded its 1200 mounted-cell threshold with the original symmetric row allowance/publication step of 768/640: revision `7b7fd5793541caaf0caaa14710ff5af1b8179222` measured **1230**. The bounded paired 704/576 experiment in `d1809b0b705efc18e2af62b944260e58848eefd7` preserved the 128 px difference but measured **1260**. Both elevated uncached real-stack Nx targets exited **1** with `Performance threshold failure: wbs-folded-mounted-cells`. The focused 100-row model was watched RED at 1230 before the paired edit and GREEN after it, but assumed a 700 px frame and 28 px rows; the product diagnostic later observed an 805 px frame and 26.1875 px rows. The model is not authoritative product measurement. The fixture inputs, 1200 threshold and policy rule stayed unchanged.

The diagnostic-only `f7485f5e20ff1b313f1749ca37bcf42537bd2089` candidate adds a separate `puni.performance.samples.v1` attachment while preserving the original scalar `puni.performance.observation.v1` maximum. It records geometry after the original two animation frames and again after two further frames at each unchanged position. Those extra frames add a fixed interval between sample positions, so this run is **not** an exact replay of the earlier candidate and cannot count toward 2.1h. The fixture SHA-256 is `13958a81ce15d773e40ceef7fc2d2642b66a8eaedf5d60b59f4fa87fa16d91f1`. The exact elevated command was `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-performance-diagnostic-nx-21h E2E_PORT_SHIFT=6200 PUNI_PERFORMANCE_RULE_POLICY=/tmp/puni-test-axes-controller-21h/external-policy.json bunx nx run wbs-fe-01:test:performance:level --skip-nx-cache`. It exited **1** in **58.4 s**, again at **1260 > 1200**.

| Revision and row constants                                          | Retained invocation bundle                                                                                    | Candidate digest                                                   | Observation and result                               |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------- |
| `7b7fd5793541caaf0caaa14710ff5af1b8179222`, 768/640                 | [baseline](evidence/performance-viewport-baseline/manifest.json) (`0208cdc4-6b7a-4e3d-b13a-8509d59c914e`)     | `08523f78e4de68e0f8fa164400e9ffbd1dbd333bdcbacc589c96cf8c8fe9d2d0` | 1230; Nx 1; threshold failure; cleanup failures `[]` |
| `d1809b0b705efc18e2af62b944260e58848eefd7`, 704/576                 | [paired](evidence/performance-viewport-paired/manifest.json) (`caee58c2-b50a-4729-aded-91fd914c1790`)         | `2c1d5ef32cb2ef9c31c459cda46fdf10c90dcd69814c28a37f799bb900643fe3` | 1260; Nx 1; threshold failure; cleanup failures `[]` |
| `f7485f5e20ff1b313f1749ca37bcf42537bd2089`, 704/576 plus diagnostic | [diagnostic](evidence/performance-viewport-diagnostic/manifest.json) (`509c41f6-da0c-4c2d-8283-38bdb7ccf7a2`) | `42d7e7f2e40a80e820c87e10da6a5073ea7b052346ee9b0aba5ceabb433680e8` | 1260; Nx 1; threshold failure; cleanup failures `[]` |

All three manifests bind config SHA-256 `56cd892eba44a0b1e33199a81df18fb33c36953e2b6fe8e8bf4e5017ede5dae7`, controller-selected external policy SHA-256 `79d24f20bc78b417246605f04d8bef209a0aef299aef6c6cf6d3d3bf2160cb77`, Playwright `1.63.0`, and exact selection `{CI:'1',E2E_PORT_SHIFT:'6200'}`. The declaration case digest remains `c307d8b165a0ab4d11cb9e98ce8310fb804729a88fa12fea9a939be869016e53`; the diagnostic fixture changed candidate identity, not the declaration record. The controller policy bytes are retained in [the prior policy artifact](evidence/performance-fullmount-fault/policy.json), and the checked-in policy has no reviewed case. Each saved JUnit has one threshold failure and SHA-256 `fee7a546032e78f613440630ebe00e65cb3c39b3fc150750908ff1ffb2f4abd4`. The diagnostic failure file records `cleanupFailures:[]`; the current-success pointer and three legacy output files were absent. A fresh elevated bind probe printed `9300:free`, `9400:free`, `10400:free`; `git worktree list --porcelain` showed no runner-created detached checkout. The preceding sandbox-only bind probe returned `EPERM` for all three ports and did not establish occupancy.

The [diagnostic run JSON](evidence/performance-viewport-diagnostic/run.json) has original scalar-time samples below. Every later two-frame follow-up matched its original count, scroll position, frame and row range. Frame bounds were top 87/bottom 892, client height 805, scroll height 2851; every mounted row was 26.1875 px high with 15 cells. The bottom requested scrollTop 2851 was browser-clamped to 2046.

| Selected row | Requested / actual scrollTop | Calculated bucket / window | Mounted row indices | Mounted rows / cells | Intersecting rows / cells |
| -----------: | ---------------------------: | -------------------------- | ------------------- | -------------------: | ------------------------: |
|            0 |                        0 / 0 | 0; [0, 1509]               | 0–57                |             58 / 870 |                  30 / 450 |
|           50 |                  1400 / 1400 | 1152; [448, 2661]          | pinned 0, 17–99     |            84 / 1260 |                  32 / 480 |
|           99 |                  2851 / 2046 | 1728; [1024, 2851]         | pinned 0, 39–99     |             62 / 930 |                  23 / 345 |

At all six readings, `mountedRows` equaled the row-detail array length and `mountedCells` equaled the sum of its row cell counts. The middle sample's 84 rows explain its scalar maximum. The calculated bucket/window uses exported constants and observed scrollTop; it does **not** observe the React hook's internal published state. `renderingGeometry` and row-detail DOM reads are separate evaluations that could straddle an update. No disagreement or later change appeared here, but this is not an atomic DOM snapshot. The original candidate's inferred middle interval of pinned row 0 plus rows 19–99 would yield 82 × 15 = 1230; its bundle contains only a scalar maximum, so that baseline row range remains an inference. The observations support a bucket-boundary explanation for the failed paired experiment, without justifying another numeric value alone.

Saved bundle SHA-256 values in `discovery.json`, `run.json`, `evidence.json`, `manifest.json`, `report.xml`, `failure.json` order:

| Bundle                                                               | SHA-256 values                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [baseline](evidence/performance-viewport-baseline/manifest.json)     | `b970286282fba5bc3d5b53d949101d63917c074c9195163c45a915468ea4cbc5`, `0ce26f973cf0fe7dfd1ec200fdadd464b9e78e5aec08c2e7070f2a26cb1cae7d`, `0ac5e7beabf00e1e1874945197e08a070b4d0d3759e4b9cbc471c946bf962ebb`, `2325c9e2d5c776264f47834872296d139fd0c5a1865c8eeaf8424b3ae05b1fae`, `fee7a546032e78f613440630ebe00e65cb3c39b3fc150750908ff1ffb2f4abd4`, `4a81789c0c5b64971ac404e77bb003a87cbdeadcd4e21a5c358b58b2e8b2e008` |
| [paired](evidence/performance-viewport-paired/manifest.json)         | `1af3de90ddd9a952f0303a6b2d8a941bf088b80a742d567acb15685c6f185595`, `8c04216dd17c849f9a6f34f093d5dbed08f9e25ed39cb358479bfd193461bbcf`, `f2b1369dcd996e950c8d034ca9c562307e5d30870a54df5774f12e2f2ba1f90f`, `11aa45f3dd4127bb532d0366c2708ed6ad11cef452b55f44525a3a2274396671`, `fee7a546032e78f613440630ebe00e65cb3c39b3fc150750908ff1ffb2f4abd4`, `d4ae4c72ad4d49bd5b5d580f6b3da30454e01c509cb351e16d5ff0bb8ab388e4` |
| [diagnostic](evidence/performance-viewport-diagnostic/manifest.json) | `b666812af54b551a4f95b67c2773f8aea7284b2e2ac662a353261273c62e60eb`, `ff976a8bd0319bd3f7fbc94ec3064808ce71f6f151d467dd2620b4e228f7772a`, `bca30049505ba4abf65676fc35234c7601710f5e156d26ef606dadde18cf2d68`, `7ed7424d392e196cc19c5d8b5cb2e9c604a883a5db2c49e5879c700ef75de8e4`, `fee7a546032e78f613440630ebe00e65cb3c39b3fc150750908ff1ffb2f4abd4`, `1651b36ee29001fc40debc355b74be90d4029637f6724dcbaa20001d730b81c3` |

The paired-source focused command `bunx vitest run src/components/wbs/plan-viewport.test.ts src/components/wbs/use-plan-viewport.test.ts --config vitest.config.ts` from `apps/wbs/fe-01` exited **0**, 9/9 passed. The selected ordinary real Browser baseline `CI=1 E2E_PORT_SHIFT=6700 bunx playwright test rendering-baseline.spec.ts --config=apps/wbs/fe-01/playwright.config.ts --project=chromium --grep='broad Find|editor that left|measured row above|row drag at the frame edge|windowed table and the complete Gantt'` exited **0**, 5/5 passed in 39.0 s on the paired source. It covered editor draft/selection, initially unmounted keyboard destination, evicted commit/Escape/refusal, anchored height correction, row drag, and table/Gantt pairing with resize. For the diagnostic source, `bun test tools/tool-devsync/src/performance-playwright.test.ts` exited **0**, 7 pass/0 fail/43 assertions; forced FE/tool TypeScript builds, scoped ESLint, changed-file Prettier and `git diff --check` exited 0. Same-environment scroll commit cost was **not measured**. The existing 50 ms frame-gate debt remains open; these runs do not establish the historical eight-step, 1000-row or 300 px matrix. Tasks 2.1g and 2.1h remain unchecked; no host-wide h2puni gate was run on these diagnostic commits.

#### Asymmetric row-selection RED/GREEN checkpoint

Astra reviewed the updated design for one 640 px publication bucket with 128 px logical allowance before it and 768 px after it. `logicalTotal` is the `placeRows` extent, not DOM `scrollHeight`. The algebra promises nominal allowances before clipping; the observed 24 px header/body offset means real visible coverage needs DOM evidence. The implementation uses one `selectRows` helper for current-window comparison, next-window comparison and rendering; it leaves the column selector, pinned active/requested-focus union, spacer heights, logical indices, anchor correction and physical scroll motion unchanged.

The test-first `bunx vitest run src/components/wbs/plan-viewport.test.ts --config vitest.config.ts -t 'excludes early rows at the real middle bucket'` exited **1**, 1 failed/8 skipped before source edits: the old symmetric selector returned pinned row 0 plus rows 19–99 while the expected asymmetric selector starts at row 43. After the new before/after row API and shared hook selector, the same command exited **0**, 1 passed/8 skipped. The 100-row, 26.1875 px, 805 px frame model then had 58 selected rows, 870 cells; this remains a model, not the product threshold observation. The full focused `bunx vitest run src/components/wbs/plan-viewport.test.ts src/components/wbs/use-plan-viewport.test.ts --config vitest.config.ts` exited **0**, 11/11 passed after the shared-selector refactor.

The pure coverage test traverses 639/640 and 1279/1280 bucket boundaries in both directions, frame heights 480/700/900, a measured 88 px wrapped row, and plan-end clipping. Injecting `ROW_OVERSCAN_AFTER_PX=ROW_OVERSCAN_BEFORE_PX` made its focused command exit **1** with `expected false to be true`; restoring 768 px passed. Injecting the old 768 px before-allowance into only the current-window comparison made the row-publication hook test exit **1** with `Maximum update depth exceeded`; restoring the shared selector passed. These mutations prove the trailing allowance and one-selector invariant are breakable; they are restored in the source.

The new ordinary DOM case `a row window covers the visible table through bucket edges and frame resize` seeded 100 rows with wrapped names, sampled 0/639/640/1279/1280/1400/end and reverse motion, then resized and resampled. It checks contiguous visible mounted rows against the actual header/body frame, allowing the first or last logical row at plan ends. The elevated real FE/BE/GW command `CI=1 E2E_PORT_SHIFT=6700 bunx playwright test rendering-baseline.spec.ts --config=apps/wbs/fe-01/playwright.config.ts --project=chromium --grep='a row window covers the visible table through bucket edges and frame resize'` passed **1/1** in 15.6 s. Deliberately reducing the trailing allowance to 128 px made the same command exit **1** at actual scrollTop 639 with `gaps: ['bottom']`; restoring 768 px passed **1/1** in 14.7 s. After the one-selector refactor, the combined real Browser command with grep `a row window covers|broad Find|editor that left|measured row above|row drag at the frame edge|windowed table and the complete Gantt` exited **0**, **6/6 passed in 42.9 s**, covering editor draft/selection and navigation, evicted commit/Escape/refusal, anchor correction, drag, boundary/resize coverage and table/Gantt pairing. The DOM case then gained an explicit assertion that at least one mounted wrapped row is taller than 30 px; its same focused real Browser command exited **0**, **1/1 passed in 14.7 s**. WebServer emitted websocket EPIPE messages during these runs, but Playwright reported all selected cases passed.

The Performance fixture was restored byte-for-byte to its original scalar-only two-RAF protocol from `d1809b0b705efc18e2af62b944260e58848eefd7`; `git diff` against that revision for the fixture was empty and its SHA-256 is `24c8bd13ce6f0f4345157ac22f8bfd53d2f9c4bb7db199a9d6c3d6bf5693b9d5`. The diagnostic attachment and extra two-frame waits are absent from the candidate fixture; all three diagnostic bundles remain retained above. The initial forced FE TypeScript build failed only because test code used unsupported `toReversed()`; replacing it with a copied `.reverse()` made the same build exit **0** with no diagnostics. Strict pinned OpenSpec validation exited **0**, one item passed and zero issues. The exact real Performance target on a committed asymmetric candidate and the host-wide h2puni gate remain unrun at this checkpoint; 2.1g and 2.1h remain unchecked.

#### Two uncached exact committed real-stack Performance runs

The source candidate `682935f2ec3ae83cd17325ba6e4ac541a4057b13` had a clean worktree and the restored original scalar-only Performance fixture (SHA-256 `24c8bd13ce6f0f4345157ac22f8bfd53d2f9c4bb7db199a9d6c3d6bf5693b9d5`). The controller-selected external policy remained `/tmp/puni-test-axes-controller-21h/external-policy.json`, SHA-256 `79d24f20bc78b417246605f04d8bef209a0aef299aef6c6cf6d3d3bf2160cb77`. The exact elevated command, run **twice sequentially with no intervening source edit**, was `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-performance-asymmetric-nx-21h E2E_PORT_SHIFT=6200 PUNI_PERFORMANCE_RULE_POLICY=/tmp/puni-test-axes-controller-21h/external-policy.json bunx nx run wbs-fe-01:test:performance:level --skip-nx-cache`. Both commands exited **0**; Nx printed `Successfully ran target test:performance:level for project wbs-fe-01`, `Cache: Skipped (--skip-nx-cache)`, and durations **58.7 s** and **59.1 s** respectively. No task input, fixture, threshold or service descriptor changed between runs.

| Run | Saved immutable bundle                                                                                                           | Bound candidate digest                                             |              Actual scalar result | JUnit                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------: | ---------------------------------------- |
| 1   | [asymmetric first](evidence/performance-viewport-asymmetric-1/manifest.json), invocation `1a0b2808-9236-4b1b-a6d7-d53be3790cdf`  | `4b4a8bac2d0cb5b331b8b1e0af7eff54f93c0540f7a4f4d609d77960ab73d12d` | **915 cells**, `lte 1200`, passed | tests 1, failures 0, errors 0, skipped 0 |
| 2   | [asymmetric second](evidence/performance-viewport-asymmetric-2/manifest.json), invocation `ed701f5d-7557-4e2d-a433-39b75306025b` | `4b4a8bac2d0cb5b331b8b1e0af7eff54f93c0540f7a4f4d609d77960ab73d12d` | **915 cells**, `lte 1200`, passed | tests 1, failures 0, errors 0, skipped 0 |

Each [discovery JSON](evidence/performance-viewport-asymmetric-1/discovery.json) contained exactly the `[TEST-AXES-038]` declared title and no errors; each [run JSON](evidence/performance-viewport-asymmetric-1/run.json) had no errors and the normalized [evidence JSON](evidence/performance-viewport-asymmetric-1/evidence.json) bound that case as passed with one `folded-mounted-cells` observation of 915 `count`. Both manifests bind revision `682935f2ec3ae83cd17325ba6e4ac541a4057b13`, policy digest above, config digest `56cd892eba44a0b1e33199a81df18fb33c36953e2b6fe8e8bf4e5017ede5dae7`, Playwright `1.63.0`, exact selector `{CI:'1',E2E_PORT_SHIFT:'6200'}`, and `certifies:false`. The second success pointer named only invocation `ed701f5d-7557-4e2d-a433-39b75306025b`; the two invocation IDs and raw discovery/run hashes differ, proving fresh collection rather than report reuse. The three legacy output paths were absent. `git worktree list --porcelain` showed no runner-created checkout after the second run, and a fresh elevated bind probe printed `9300:free`, `9400:free`, `10400:free`. This is operational threshold evidence under the disposable external policy, not an authenticated collector receipt or human review of the checked-in empty policy.

Saved SHA-256 values in `discovery.json`, `run.json`, `evidence.json`, `manifest.json`, `report.xml` order:

| Run                                                                | SHA-256 values                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [first](evidence/performance-viewport-asymmetric-1/manifest.json)  | `ffc7e76801b4f2a5c2bd3d63a993118a4aef2357778b37e5d9b0ef7130ed29d4`, `0d66d210a42eddf443db4699334a21e09420be5a6ae14d4d12ce17839dc29968`, `16903c553f6995e885c7c0b6f46418db54fb427189a6260f92ebdf6b1711ab18`, `99357aa260c324651ad6d8aa4247e18190c0acc593b4934b28672ea971304459`, `455f0862bae525fb78b4ed2f5110e534f41a98f663ea91e5a38b3b5087f135cb` |
| [second](evidence/performance-viewport-asymmetric-2/manifest.json) | `a53e68219baf3e2a3c2c2b68db8bd755b6b586692348c998fc40af8c7d49769c`, `b941e76c963352975dcf8cc3cf4d794f2e36eed54e56fdc274c009e27b6dd14c`, `16903c553f6995e885c7c0b6f46418db54fb427189a6260f92ebdf6b1711ab18`, `c5dabdc00549a31579e46bbeb2ca614f5aa5d8e43bf51972e06a92b7c5b80644`, `455f0862bae525fb78b4ed2f5110e534f41a98f663ea91e5a38b3b5087f135cb` |

The h2puni host-wide gate and an authenticated Performance collector receipt remain unverified in this record. The two successful runs demonstrate the 2.1h operational target criterion for the exact source commit above; they do not complete Task 2.1's trusted admission obligation or establish the historical eight-step/1000-row scroll-cost matrix. Same-environment scroll commit cost remains unmeasured and the 50 ms frame-gate debt is unchanged.

### WBS descriptor producer boundary — 2026-10-09

The host gate reported `tool-devsync:lint` at `performance-level.ts:16`: devsync imported the WBS frontend project by a relative path. Direct `bunx eslint tools/tool-devsync/src/performance-level.ts` reproduced that one Nx module-boundary error. WBS now owns a JSON producer next to its ordinary descriptor factory. The devsync runner invokes the producer from its detached candidate through the existing owned process supervisor, bounds it to ten seconds, captures each stream in the invocation bundle and refuses a stream above 64 KiB. It decodes strict UTF-8 and JSON, then checks all three exact commands, directories, URLs and environment records against the selected shift and invocation database path before launch. The shared portable evidence library contains no WBS startup policy.

| Production-path probe        | Injected fault                                                                                                                                                                          | Observed result                                                                                                                                                                                                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malformed producer output    | Candidate WBS CLI wrote `{invalid-json`                                                                                                                                                 | Focused elevated Bun test exited 0, 1 pass/7 assertions and refused `invalid JSON` before launch. Temporarily rethrowing the raw parser fault made the same test exit 1 on `SyntaxError` instead of the named refusal; the contextual guard was restored.                                                |
| Exact stack boundary         | Candidate WBS CLI changed one command, cwd, URL or environment value in four committed fixtures                                                                                         | Focused elevated Bun test exited 0, 1 pass/28 assertions; all four were refused before service launch with no success pointer. Temporarily removing the exact-stack guard made it exit 1 on service readiness instead of that refusal; the guard was restored.                                           |
| Producer transport           | Candidate WBS CLI emitted 65,537 bytes on stdout or stderr, emitted invalid UTF-8 or an object instead of three services, supplied a numeric environment value, or slept twelve seconds | Focused elevated Bun tests refused each case before service launch with no success pointer; the sleep hit the ten-second deadline and the owner cleaned up. Oversize stream artifacts were truncated to exactly 64 KiB. The final transport selection passed with 46 assertions in 27.42 seconds.        |
| Producer argument boundary   | Real WBS CLI was invoked with no arguments and with a relative root                                                                                                                     | Both subprocesses exited nonzero with the named root/shift/database refusal before emitting descriptors.                                                                                                                                                                                                 |
| Project inventory            | Omitted `shared-test-evidence` and `shared-test-levels` from the expected product rows                                                                                                  | Two exhaustiveness cases exited 1 on the exact missing root/name and `product:shared` tuples; after adding both rows, they passed, 2/2.                                                                                                                                                                  |
| Restart inventory            | Omitted the two shared library manifests from `RESTART_PATHS`                                                                                                                           | The library-manifest coverage case first failed on `test-evidence`, then `test-levels`; after adding both paths, it passed, 1/1.                                                                                                                                                                         |
| Colored verifier diagnostics | Set `FORCE_COLOR=1` in the test parent                                                                                                                                                  | The frontend grammar case failed because ANSI bytes split `error:`. Pinning `FORCE_COLOR=0` only for verifier fixture children restored that case; the remaining direct Node-list and identity fixture children were pinned likewise and passed, 2/2. Exit-status and diagnostic text assertions remain. |
| Documentation anchor         | Linked the measured rendering record with `#L65`                                                                                                                                        | The production index checker and routed-document link checks passed after the link targeted the existing completed Linux matrix heading, 2/2.                                                                                                                                                            |

The relevant `performance-level.test.ts`, `sync.test.ts` and `test-levels.test.ts` suites completed with **191 pass, 0 fail, 908 assertions** in 412.69 seconds before the new producer protocol cases and pipe capture were added. After pipe capture, the four focused producer protocol cases passed with **85 assertions** in 44.72 seconds. The process-owner suite passed **24 tests, 122 assertions** in 23.82 seconds. Direct WBS producer invocation emitted the three expected shifted descriptors for shift 6000. `bunx @fission-ai/openspec@1.12.0 validate test-axes --json` reported one valid change and no issues. The real host gate and the full repository gate were not rerun in this slice.

Final scoped checks: direct ESLint over all tool-devsync sources, its two workspace modules and the new WBS producer exited 0; TypeScript `--noEmit` passed for tool-devsync lib/spec and WBS frontend e2e/spec; Prettier checked all changed files and `git diff --check` passed. With `FORCE_COLOR=1`, the 28 declared-level tests passed with 238 assertions. The complete workspace-projects suite passed 17 tests, and both production Markdown link checks passed. The canonical host gate is left to the ordered gate run.

### Task 2.1g ancestry-cycle refusal proof — 2026-10-09

A test-only preload rewrote one adopted child's `/proc/<pid>/stat` parent PID to itself after the ordinary owner inventory was active. The owner also held an independent direct sibling. With the production ancestry-cycle guard temporarily removed, elevated `bun test tools/tool-devsync/src/performance-processes.test.ts --test-name-pattern 'cyclic process-inventory ancestry'` exited **1**, 0 pass/1 fail: the isolated supervisor timed out after 8.04 seconds inside the unbounded ancestor walk. Restoring the guard and its adjacent `Proof:` comment made the same command exit **0**, 1 pass/0 fail/5 assertions in 109 ms; cleanup reported `PID ancestry cycle`, did not signal the cyclic adopted child, and drained the independent sibling. The test's teardown terminated the ambiguous child within its isolated supervisor. The final owner/helper suites together exited **0**, 27 pass/0 fail/129 assertions in 23.82 seconds. A real `/proc` cycle is not expected from Linux; the injected malformed inventory proves that this refusal remains bounded and breakable. No 2.1g or 2.1h completion is claimed by this proof.

### 080.34 recovery and descriptor capture review — 2026-10-10

The exact recovery baseline is 12a894aba93970c82c9c5eb243b681974fec2928, retained by the h2puni gate clone and copied as a Git bundle into the ignored local recovery area. The lost 0f0ed, d3ab and b35aab changes were reconstructed from recorded patch calls into an isolated clone. This recovery carries no claim that the original lost commit objects were recovered. The ordinary descriptor factory remains WBS-owned in apps/wbs/fe-01/playwright.ordinary-servers.ts; the detached candidate's CLI imports it locally. Astra reviewed and approved this source boundary.

A focused elevated transport run on the recovered pre-review code passed 1 test and 42 assertions. Adding the own-**proto** negative made the same production runner fail because it reached service readiness instead of refusing the foreign environment key. Adding a producer descendant that kept stdout and stderr open made its focused production test fail with invalid JSON instead of a ten-second whole-phase timeout. After the decoder and staged pipe changes, the elevated transport selection passed 1 test and 83 assertions in 36.12 seconds, including missing and nonzero producers, malformed array/member/fields, the own-**proto** key, 65,537-byte streams, invalid UTF-8, and producer sleep. The inherited-pipe case passed 1 test and 8 assertions in 12.67 seconds; its marker PID was absent from /proc and no current pointer appeared. Injected second-open and combined overflow/close faults passed 1 test and 19 assertions in 5.16 seconds; the second-open marker proved the first file handle closed, while the combined failure retained both messages and a complete 64 KiB diagnostic. Both oversize streams published exactly 64 KiB under final names with no temporary suffix. These are production-path fixture observations, not a collector receipt.

Four scoped TypeScript --noEmit checks (tool-devsync lib/spec and WBS FE e2e/spec) exited 0. The first direct ESLint run found only import ordering in performance-level.ts; autofix was applied and the focused rerun exited 0. Workspace-projects passed 17 tests/20 assertions; test-levels passed 91 tests/315 assertions; RESTART_PATHS library-manifest coverage passed 1 test/23 assertions. The pinned OpenSpec 1.12.0 validator reported test-axes valid with zero issues in an elevated run after local bunx could not create its temporary directory. The real WBS descriptor CLI exited nonzero for missing arguments and relative root and emitted three shifted descriptors for absolute arguments. The canonical host gate and Task 2.1h uncached real-stack reruns remain outstanding at this checkpoint.

The R5 mutation audit exposed one false-green assertion: disabling the three-service array guard still let the transport test pass, because Bun included the guard's source text in String(error). The test now selects only diagnostic lines beginning with error:. With the check restored, transport passed 1 test/83 assertions. Repeating the temporary mutation failed at the object-output fixture (0 pass/1 fail/33 assertions). Independently disabling the descriptor member guard failed at the null member (0/1/40), the required-fields guard at the numeric command (0/1/47), and the producer nonzero-exit guard at exit 23 (0/1/68). Each temporary edit was restored by a finally block before the next run. The own-**proto** and inherited-pipe tests had already shown RED on the recovered pre-review code and GREEN on the corrected code.

Final scoped review checks on this recovered candidate: Nx lint:fast passed for tool-devsync in 7.4 seconds and wbs-fe-01 in 55.0 seconds with daemon and plugin isolation disabled for the sandbox. Prettier --check passed for all 15 changed tracked/new paths; all four TypeScript --noEmit configurations and git diff --check exited 0. The canonical host-wide h2puni gate has not yet run on this recovery candidate.

### Astra artifact-retention review follow-up — 2026-10-10

Astra's exact review of ec243add7 found that failure.json flattened the outer AggregateError, losing the original overflow and close causes. It also found that a second diagnostic rename failure could replace the earlier capture failure. An artifact-level production fixture first failed: failure.json held only the outer message (0 pass/1 fail/20 assertions) even though the thrown Bun error displayed both causes. The corrected runner recursively renders nested Error, AggregateError.errors and Error.cause into a bounded 256 KiB diagnostic field, and combines the phase and rename errors before cleaning all temporary and final stream names. A combined 65,537-byte stdout, injected output close fault and injected second rename fault now leaves no stream artifact, temporary suffix or success pointer while failure.json names all three causes. The focused staged-handle selection passed 1 test/33 assertions in 7.24 seconds. Temporarily flattening the chain failed that test at 20 assertions; temporarily dropping the phase failure when the rename fails failed it at 31 assertions. Both edits were restored.

A separate inherited-pipe fixture made reader.cancel reject after canceling the underlying stream. The production runner retained the timeout and cancellation failure in failure.json, reaped the descendant and published no current pointer (1 test/9 assertions in 12.53 seconds). Temporarily dropping cancellation errors from the chain failed its artifact assertion (0 pass/1 fail/7 assertions), then the edit was restored. These proofs address the saved artifact and cleanup paths; they do not certify the Performance level.

On the final review-fix tree, the four focused descriptor cases passed together: 4 pass/0 fail/133 assertions in 67.98 seconds. After the lint fixes for the caught rename cause and test-only reader method binding, rejecting cancellation and staged capture/rename passed again: 2 pass/0 fail/42 assertions in 19.59 seconds. Tool-devsync lib/spec TypeScript and focused ESLint exited 0. The pinned OpenSpec validator again reported one valid test-axes change with zero issues. The full host gate is still pending.

### Recursive diagnostic bounds — 2026-10-10

Four production fault preloads attached crafted close failures to an overflowing descriptor capture: a 17-level cause chain, a self-referential cause, an AggregateError with 65 members and a message of 100,000 multibyte characters. The artifact writer refused each chain, left no `failure.json` or current pointer, and surfaced the corresponding depth, cycle or diagnostic-bound error. The UTF-8 fixture first failed against the code-unit counter (0 pass/1 fail/30 assertions); after byte counting, the focused test passed (1 pass/32 assertions). Removing each individual guard then made that same production test fail: depth at 6 assertions, cycle at 14, entries at 22 and UTF-8 bytes at 30. Each mutation was restored before the next run. This establishes the 256 KiB bound in UTF-8 bytes. Final focused Bun test of diagnostic bounds and staged handles passed 2 tests/65 assertions; tool-devsync lib/spec TypeScript, focused ESLint, Prettier check on the five changed paths and `git diff --check` exited 0. Pinned OpenSpec validation reported one valid change and zero issues. The full host gate remains pending.

### Colored gate diagnostic parser — 2026-10-10

The canonical gate on `708797e1d150cdc4c0828b236265435b22ae5b73` failed the named descriptor transport test at 3.321 seconds; its assertion output was truncated, so the gate's color setting and assertion count were unavailable. A focused elevated reproduction using `FORCE_COLOR=1 bun test tools/tool-devsync/src/performance-level.test.ts --test-name-pattern 'bounds and validates WBS descriptor producer transport before service launch'` failed at `expectFailureMessage` (0 pass/1 fail/6 assertions) in 2.49 seconds: Bun's VT color codes prefixed the `error: ` diagnostic line, so the helper found no exact-prefix lines. This supports the inferred gate cause. After removing VT codes before its strict line filter, the same command passed 1 test/83 assertions in 36.11 seconds. Disabling the production three-service array guard under the same colored command then failed the named diagnostic assertion at 33 assertions (0 pass/1 fail), proving source text remains excluded. The guard mutation was restored. The canonical gate has not yet been rerun on this fix.

### Burokrat selection environment test typing — 2026-10-10

Forced Burokrat TypeScript build failed before the type-only test change at `performance.test.ts:597` with TS2322: an inferred union gave omitted environment keys an `undefined` value incompatible with the production string-only environment record. The three existing refused environments are now contextually typed as `readonly PerformanceSelection['selectionEnvironment'][]`, with no production contract change. The same forced build exited 0, and the affected existing Bun test passed 1 test/10 assertions. The canonical gate has not yet been rerun on this candidate.

### Burokrat gate fixture repairs — 2026-10-10

Under `FORCE_COLOR=1`, the Architecture unmapped-fixture negative failed before stderr normalization (0 pass/1 fail/2 assertions): VT prefixes hid an anchored `error:` line. Removing VT controls in the test helper, while retaining anchored diagnostic assertions, made that negative pass 1 test/3 assertions and the full Architecture test file pass 10 tests/41 assertions.

The kind-inventory production CLI negative first refused the fixture policy because it omitted the registered `PERF-THRESHOLD` mode (0 pass/1 fail/7 assertions). Its rule modes now come from `registeredRules()`, including `SPEC-SCENARIOS` and `PERF-THRESHOLD`, while the selected CLI rule remains `K2`. A focused local run then exposed a separate test-harness omission, `trusted TypeScript runtime modules are not configured`; the child now receives the installed TypeScript module root resolved from the test file, without changing the production guard. The K2 case passed 1 test/9 assertions; the full kind-inventory file under color passed 22 tests/282 assertions. A new production CLI negative omitted the unselected `PERF-THRESHOLD` mode while selecting `K2` and observed exit 1 with the named missing-mode error (1 test/9 assertions). Temporarily disabling the production registered-rule coverage loop made the omission negative fail (0 pass/1 fail/7 assertions); the loop was restored. The existing explicit missing-trusted-runtime negative passed 1 test/10 assertions.

The six applicable check IDs in the shared test-evidence and test-levels READMEs initially had no executable authority in `docs/wiki-policy/relationships.json`: a new on-disk pilot oracle failed with six missing target facts (0 pass/1 fail/7 assertions). The declaration now registers each exact `test`, `lint` and `typecheck` Nx target configuration, generated directly from the current Nx relationship extractor. The oracle passed 1 test/7 assertions; deleting one newly registered fact made it fail again at 7 assertions, then the fact was restored. The five on-disk pilot policy cases passed together (5 tests/25 assertions). The previously failing production pilot `pins exact pre-index tuples and passes observe lint from external trust` passed with the six facts under color and trusted runtime modules (1 test/60 assertions, 42.10 seconds). Removing `check.test-evidence.test` made that same production pilot fail with `unknown applicable check in libs/shared/domain/test-evidence/README.md: check.test-evidence.test` (0 pass/1 fail/59 assertions, 41.63 seconds). After restoring the fact, it passed again (1 test/60 assertions, 41.73 seconds).

The production pilot command for the green, missing-fact red and restored-green sequence was `FORCE_COLOR=1 TOOL_WIKI_TRUSTED_NODE_MODULES=/tmp/puni-test-axes-08034-recovery/node_modules bun test apps/twilight-structure/twilight-burokrat/cli/src/policy/pilot-policy.test.ts --test-name-pattern 'pins exact pre-index tuples and passes observe lint from external trust'`.

For a deleted intermediate Manual commit object, local Git emitted `specifications base is not a candidate ancestor`; the gate host reported `cannot verify specifications ancestry`. Production `isAncestor` maps Git exit 1 to the former and other nonzero exits to the latter. The commit-case assertion now accepts only those two anchored diagnostic lines after VT normalization. The tree and blob refusal assertions remain unchanged. All three missing-object cases retained CLI exit 1 and passed under color (3 tests/6 assertions). The canonical gate has not yet been rerun on these repairs.

| Final scoped command                                                                                                                                                                                                                                                                                                                                                                                                 | Result                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `FORCE_COLOR=1 bun test apps/twilight-structure/twilight-burokrat/cli/src/architecture-level.test.ts`                                                                                                                                                                                                                                                                                                                | Exit 0; 10 tests, 41 assertions.       |
| `FORCE_COLOR=1 TOOL_WIKI_TRUSTED_NODE_MODULES=/tmp/puni-test-axes-08034-recovery/node_modules bun test apps/twilight-structure/twilight-burokrat/cli/src/rules/kind-inventory.test.ts`                                                                                                                                                                                                                               | Exit 0; 22 tests, 282 assertions.      |
| `FORCE_COLOR=1 bun test apps/twilight-structure/twilight-burokrat/cli/src/policy/pilot-policy.test.ts --test-name-pattern 'on-disk bootstrap policy, mapping and relationship files'`                                                                                                                                                                                                                                | Exit 0; 5 tests, 25 assertions.        |
| `FORCE_COLOR=1 bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/manual.test.ts --test-name-pattern 'inspect-manual refuses a missing intermediate'`                                                                                                                                                                                                                                               | Exit 0; 3 tests, 6 assertions.         |
| `FORCE_COLOR=1 bun test apps/twilight-structure/twilight-burokrat/cli/src/rules/rules.test.ts --test-name-pattern 'refuses K3 when the trusted modules are unconfigured'`                                                                                                                                                                                                                                            | Exit 0; 1 test, 10 assertions.         |
| `bunx tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json`                                                                                                                                                                                                                                                                                                                               | Exit 0.                                |
| `bunx eslint apps/twilight-structure/twilight-burokrat/cli/src/architecture-level.test.ts apps/twilight-structure/twilight-burokrat/cli/src/rules/kind-inventory.test.ts apps/twilight-structure/twilight-burokrat/cli/src/policy/pilot-policy.test.ts apps/twilight-structure/twilight-burokrat/cli/src/evidence/manual.test.ts`                                                                                    | Exit 0.                                |
| `bunx prettier --check apps/twilight-structure/twilight-burokrat/cli/src/architecture-level.test.ts apps/twilight-structure/twilight-burokrat/cli/src/rules/kind-inventory.test.ts apps/twilight-structure/twilight-burokrat/cli/src/policy/pilot-policy.test.ts apps/twilight-structure/twilight-burokrat/cli/src/evidence/manual.test.ts docs/wiki-policy/relationships.json openspec/changes/test-axes/verify.md` | Exit 0.                                |
| `git diff --check`                                                                                                                                                                                                                                                                                                                                                                                                   | Exit 0.                                |
| `bunx --bun @fission-ai/openspec@1.12.0 validate test-axes --json`                                                                                                                                                                                                                                                                                                                                                   | Exit 0; one valid change, zero issues. |

### Shared relationship lint selector corpus pin — 2026-10-10

The six registered shared-library target facts add exactly ten legitimate legacy selector contexts: each `lint` fact repeats five current recursive Nx input selectors. On the previous `34` selector, `311` occurrence and `e02259ff...` digest pin, `bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts --test-name-pattern 'every legacy source occurrence and relevant text family is pinned'` failed (0 pass/1 fail/1 assertion). The observed corpus had 44 current recursive selectors, 321 total occurrences, digest `c35b2d7d8bbec7e6ea72fe432c94aa3a738a22124482219e0c2339b9b7d56daf` and no unclassified entries; all other category and coverage values were unchanged. Updating only those three pins made the same focused command pass (1 test/1 assertion). Injecting `const roundOneFault = 'apps/be-01/src'` into the classified Tool Dagger source then made it fail again (0 pass/1 fail/1 assertion): production-transition contexts rose from 18 to 19, total occurrences to 322 and digest to `fd2cc28472fbf5713591902eed7e65b023cc537964b4171a25a9837c134f189b`, with no unclassified entries. Restoring the source made the focused command pass again (1 test/1 assertion). The scanner and all other pins remain unchanged; the canonical host gate has not yet run on this candidate.

### Task 2.2a first DI source lineage correction — 2026-10-10

The clean starting revision was `47e11463fb612bc44ae34839b7733e01702bff7c`. The externally selected observe policy was a byte-identical copy of `docs/code-organization/rule-policy.json` at `/tmp/puni-spec-scenarios-08034-policy.json`, SHA-256 `c9c53c903bd253f16cf5f9d6bca1a02d75f215b9b2b8478612b408d83101c5b1`, pinning base `53a87a60dd7a7da80ad929c44f36a9739e75e5bf`. Before the correction, the production committed check selected `SPEC-SCENARIOS` and exited 1 with `competing overlay operation: di-composition: A module's label names its private bindings in failures`.

The approved source correction changes only the `di-bag-label-surface` section `MODIFIED` to `ADDED` and its exact requirement title to `Module labels and binding origins are read from explicit metadata`. A byte comparison against the starting Git blob after those two substitutions returned `sourceOnlyTwoLineChange:true`; all four scenario headings and the body are unchanged. The original `adopt-di-composition` ADDED requirement and its three scenarios remain in place. No canonical spec was synthesized, no archive became runtime input, and the selector and source holds were not changed.

The new production CLI scratch-candidate test loads the two actual active delta spec files. Before the source edit, `bun test apps/twilight-structure/twilight-burokrat/cli/src/rules/specifications.test.ts --test-name-pattern 'production selector retains the distinct DI label and binding-origin requirements'` failed (0 pass/1 fail/13 assertions) on the exact competing DI operation. After the two-line source edit, it passed (1 test/18 assertions), with two distinct ADDED operation identities and the original three plus surface four scenario titles. A second production CLI case adds the same surface source as another active change and asserts the exact competing-operation refusal; it passed (1 test/14 assertions). Removing that second active operation from the fixture made this named negative fail (expected exit 1, received 0; 0 pass/1 fail/13 assertions). Restoring it passed again (1 test/14 assertions). The adjacent `Proof:` comment names this injected dependency fault.

`bun test apps/twilight-structure/twilight-burokrat/cli/src/rules/specifications.test.ts` passed 77 tests and 1,103 assertions. After formatting, the two new production cases passed together (2 tests/32 assertions). Scoped `bunx eslint apps/twilight-structure/twilight-burokrat/cli/src/rules/specifications.test.ts`, `bunx tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json`, `bunx prettier --check` on the test and DI spec, and `git diff --check` all exited 0. The pinned OpenSpec 1.12.0 binary at `/tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js` validated `di-bag-label-surface` and `test-axes` separately with `--type change --strict --json`: each exited 0, one valid change, zero issues.

The production `check working /tmp/puni-test-axes-08034-recovery 53a87a60dd7a7da80ad929c44f36a9739e75e5bf /tmp/puni-spec-scenarios-08034-policy.json --rule SPEC-SCENARIOS` then exited 1 with the next active refusal, `competing overlay operation: wbs-domain: A bar explains itself and finds its row`. This slice resolves the DI overlap only; Task 2.2a and all handoff holds remain open. No canonical gate has run on this candidate.

## 2026-10-10: Notes diagnosis and B4 diagnostic planning

Baseline is clean committed `21a6df4ff4c85cf549ce4117ab82ef5591a1483b` before this planning edit. Notes composed sync/archive is paused: the initial real Chromium Escape→Done pair exited 1 (Escape passed; Done failed its final saved-note tooltip assertion at `hover-cards.spec.ts:1379`). An unchanged Done-only run passed. Its rerun cleared the original Playwright trace/screenshot/context before they were copied; the original failure log `/tmp/puni-notes-browser-pre.log` and extracted action/snapshot facts remain, but the lost trace is not claimed available.

One temporary instrumented paired run passed 2/2 in 10.9s. Its retained evidence is `/tmp/puni-notes-diagnostic-20261010-1638/`; Done blurred the textarea, cleared editing state, received command HTTP 200, then entered the marker and opened its card. The temporary hooks were restored with matching hashes and a clean checkout. This observes a successful path; it does not identify the earlier failure's cause.

Three subsequent uninstrumented pairs, with workers=1 and trace=on, each exited 0 with 2/2 passing (10.8s, 10.7s, 10.7s). Exact commands, exit files and six preserved traces are under `/tmp/puni-notes-repeat-20261010/`, summarized in its `report.md`. The owned 5000/5100/6100 listeners were absent after every run and the checkout remained clean. No retry, timeout, expectation, source or archive edit was used. The intermittent Notes obligation remains open; no additional blind repetition is planned. These diagnostic artifacts are local operational evidence, not a committed evidence bundle or certification.

Astra approved Task 4.1a's Browser observation foundation independently of the incomplete B3 whole-tree selection. Its contract and ordered continuation are in this change's spec/design/tasks. The allocator proposed six new events TEST-AXES-042 through TEST-AXES-047 via `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts scenario allocate . openspec/changes/test-axes/specs/test-axes/spec.md`; the existing journal event prefix was checked equal before applying the proposal. An initial attempt through source `bin.ts` refused because an installed package manifest was absent; it produced no allocation, and the established source CLI entry above succeeded. No runtime implementation, new guard proof or new candidate gate is claimed by this planning checkpoint.

| Check                   | Production path and watched fault                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Observed result                                                                                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selected case source    | Internally matching Browser reports named an absent committed case while a working file existed, then a committed symlink. Temporarily replacing the adapter's regular-blob guard with `if (false)` made the first named refusal become an `entry.blob` TypeError and the second exit 0.                                                                                                                                                                                                                 | Restored tests pass; mutation 1 pass/2 fail, exit 1.                                                                                                     |
| Duplicate case identity | Complete production Browser publications named the same config/project/file/title twice, with equal and differing outcomes in separate named tests. The upstream `decodeBrowserJson` identity excludes status and refuses both. Temporarily removing its duplicate-selection term changed both named CLI refusals to later `Browser JUnit identity is ambiguous` failures.                                                                                                                               | Restored tests pass; dependency mutation 0 pass/2 fail, exit 1. No unreachable adapter guard was added.                                                  |
| Exact candidate         | A test-only Bun preload wraps the real Browser inspector and changes only its returned candidate digest. The adapter refuses the mismatch. Temporarily replacing its comparison with `if (false)` made the production command exit 0 and the named fault test fail.                                                                                                                                                                                                                                      | Restored test passes; comparison mutation 0 pass/1 fail, exit 1. This is an internal dependency fault, not a naturally reachable same-full-SHA Git race. |
| Full revision           | The production CLI refuses symbolic `HEAD`. Temporarily replacing its full-SHA guard with `if (false)` made that command exit 0 and its refusal test fail.                                                                                                                                                                                                                                                                                                                                               | Restored test passes; mutation 0 pass/1 fail, exit 1.                                                                                                    |
| Observation identity    | Two case orders produced equal sorted cases and equal observation digests. A changed outcome preserved case IDs and changed the observation digest. A new committed case-file blob changed its source content digest and observation digest; a committed executable-bit change retained the content digest but changed source mode and observation digest; changing the external policy ID changed the policy and observation digests. A nested suite preserved the full ordered title path and case ID. | Production CLI cases passed.                                                                                                                             |
| No coverage promotion   | An all-passing publication, and one with failed/skipped cases, emitted absent authentication, `certifies:false`, and no coverage/admission fields.                                                                                                                                                                                                                                                                                                                                                       | Production CLI cases passed.                                                                                                                             |
| Browser refusals        | Corrupt external policy mode, candidate digest, normalized report parity and publication token were submitted through `inspect-test-reports`; each had exit 1, empty stdout and the inherited named diagnostic.                                                                                                                                                                                                                                                                                          | Restored production test passed.                                                                                                                         |

The first source-negative test was watched red before implementation: `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/test-reports.test.ts --test-name-pattern 'TEST-AXES-043'` failed 0 pass/2 fail because `inspect-test-reports` was still unknown, so both named source refusals were absent. After implementation it passed 2/2 and six assertions. Before the nested-title/mode additions, the complete new production test file passed 11 tests and 73 assertions. The first duplicate mutation ran against a loop and observed only the equal-status branch; it was superseded by two separate named cases. Source guard, candidate guard, full-revision guard and the superseding upstream duplicate dependency mutation logs are `/tmp/puni-08034-{source-guard,candidate-guard,revision-guard,duplicate-both}-mutation.log`.

For the exact review's additional R5 audit, the command now has one arity guard and one reachable mode guard. A production CLI test submitted omitted, unsupported and extra mode arguments. Removing the arity guard made the extra-argument call exit 0 (named assertion failed); removing the mode guard made the unsupported-mode call lose its named usage diagnostic. A test-only Bun preload wrapped the real candidate reader and changed only its returned selection to staged; the adapter's named refusal passed, and removing the selected-kind invariant made that assertion fail. These mutation logs are `/tmp/puni-08034-{cli-arity,cli-mode,selected-kind}-mutation.log`. The dependency fault does not claim a natural committed-reader race.

Removing the case sort made the reordered-publication digest assertion fail. Omitting outcome from the observation digest made the changed-status digest assertion fail; omitting selected source tuples made the exact payload-hash assertion fail. Promoting authentication to a claim and promoting `certifies` to true each failed the all-passing production CLI assertion separately. All mutations were restored; logs are `/tmp/puni-08034-{sort,outcome-digest,source-digest,auth-promotion,cert-promotion}-mutation.log`. Adjacent `Proof:` comments name these observed faults.

The existing Browser inspector owns raw publication, policy and duplicate-case validation. The new adapter captures a committed source snapshot once, passes its resolved full SHA into that inspector, compares candidate digests, reads only selected regular blobs, then hashes sorted source-bound case observations. The assumption is that an observation digest names validated diagnostic claims but is neither authenticated execution nor scenario coverage. Bounded Task 4.1a is implemented and Astra-reviewed; Task 4.1 and incomplete 2.1/2.2 remain open. No canonical gate has run on this candidate.

A combined focused run of the new file and existing Browser inspector tests without the project-declared timeout failed one existing multi-case annotation test at Bun's 5-second default while concurrent static checks ran (29 pass/1 fail, 146 assertions). This was a test timeout, not an observation mismatch. The same two files then passed with the owning target's `--timeout=60000` setting: 30 tests/166 assertions. After adding nested title-path and executable-mode cases, the combined focused command `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/test-reports.test.ts apps/twilight-structure/twilight-burokrat/cli/src/evidence/browser.test.ts --timeout=60000` passed 31 tests/175 assertions. After the exact-review proof corrections, that same command passed 34 tests/187 assertions. Forced Burokrat TypeScript build, scoped ESLint, Prettier, `git diff --check` and pinned OpenSpec 1.12.0 strict validation passed. The one test-only unnecessary-null ESLint issue was corrected with `.at(0)` before those final results.

Task 4.1, full 2.1/2.2, source reconciliation, trusted admission and Notes retirement remain incomplete. Delta sync is pending. All existing WBS/source/activation/review/message holds remain in force. Astra approved the corrected 4.1a implementation bytes after reviewing the exact diff and watched proofs, with no remaining architecture finding. The approved SHA-256 values are `cli.ts=3568b1fcd489e30889c9624ca4d95f57690ef23f9b55c9664363e9c8808e2be3`, `test-reports.ts=b3e0d3f753c5fc3708f6b35f0032c850b1edcdfc685a05877e08575f61bccdec`, `test-reports.test.ts=5732784b46217f4b69f6ea77e7030c7d651e31f573ae332c08d7ac9f97662a8d`. Only bounded 4.1a is marked implemented; the coordinator owns the candidate's canonical gate and WBS reconciliation.

At the earlier planning checkpoint, source CLI `scenario validate` returned `{"unidentified":[]}`; pinned OpenSpec 1.12.0 strict `validate test-axes --strict --json` passed 1/1; normal `validate --all --json` passed 158/158 (140 changes, 18 specs), retained at `/tmp/puni-08034-b4-planning-openspec.json`. Scoped Prettier write completed for the five planning/journal files and `git diff --check` exited 0. The runtime and watched proofs above followed in this implementation slice; a canonical gate remains pending review.

### Pointed-row lineage proof checkpoint 2.2a.1 — 2026-10-10

This is a test-only checkpoint on committed base `53b39dec908aaa93869b6e74bad646b078524967`. The source-lineage inventory covers five archived requirements and 20 scenario obligations at `/tmp/puni-pointed-row-08034-lineage.md`; its proposed composition is review-only at `/tmp/puni-pointed-row-08034-proposed-canonical-fragment.md` (SHA-256 `0d2fb730df63601223cbc6bc7c02782ac5d5ee3e863046d0bdff8324491da068`). No canonical or delta source, archive, product behavior, selector, journal or hold changed. The checkpoint remains unchecked pending source eligibility.

The scoped baseline was 284/284 Vitest seam/chart cases and 10/10 Node-config store cases. The owned Chromium hover group passed 8/8 with `CI=1 E2E_PORT_SHIFT=1900`; its first sandbox launch failed before tests on bind `EPERM`, and the same focused elevated run passed. The commands and external logs/traces are listed in `/tmp/puni-pointed-row-2.2a1-proof-ledger.md` and `/tmp/puni-pointed-row-proof-baseline-53b39d/`.

| Proof                            | Production-path assertion and watched fault                                                                                                                                                                                                                                                                                                                                     | Observed result                                                                                                                                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1 current linked mode           | Real Chromium bar hit for visible 010 paired with visible table 010; snapshot table/chart/page positions and focus after settlement; forward native `scrollIntoView` through a test-only recorder; mouse movement alone must light exact 010 band, label and row with no offset/focus change or navigation request. Temporarily call real `onPickRow` from bar `onPointerOver`. | Initial green 1/1 (`G1-linked-green.log`); fault red 0/1 because focus moved from the Gantt button to Name of 010 (`G1-linked-fault.log`, trace preserved); restored green 1/1 (`G1-linked-restored.log`). The recorder is restored in `finally`. No physical scroll is claimed for the fault. |
| G2 other role                    | Hover the first of two role bars on one row; compare the second bar's actual paint and SVG shape. Temporarily tint every same-row role bar magenta in the real pointer handler.                                                                                                                                                                                                 | Fault red at paint/shape equality (`G2-other-role-fault.log`); restored focused green 1/1 and combined green 3/3.                                                                                                                                                                              |
| G3 focused stripe                | In Chromium, focus a bar then point its matching table row on banded and plain stripes in both palettes; assert focus and computed row-light color. Temporarily remove the production CSS `:not([data-row-lit])` priority guard.                                                                                                                                                | Both palette tests red on computed color (`G3-red.log`); restored green 2/2 (`G3-restored.log`, traces preserved).                                                                                                                                                                             |
| G4 genuinely barless label/line  | Render a row with zero bars; its label and line each point that row. Temporarily remove chart-line `pointRow`.                                                                                                                                                                                                                                                                  | Fault red at the line's pointed row (`G4-line-fault.log`); restored focused green 1/1.                                                                                                                                                                                                         |
| G4 unestimated placeholder/table | Assert row 030 has an actual assumed placeholder bar, then point from its table row and assert exact 030 row/band/label light. Temporarily remove `PlanRow.pointTable` publication.                                                                                                                                                                                             | Fault red at the exact 030 row-light assertion, `[]` versus `['030']` (`G4-table-fault.log`); restored combined focused green 3/3 (`G2-G4-restored.log`).                                                                                                                                      |

The archived scenario “pointing scrolls nothing” was not executed under its historical offscreen-table/visible-chart-bar precondition. Normal linked scrolling prevented that settled geometry in the attempted 18-row and 40-row fixtures. The first attempted bar was also clipped by the chart scrollport; these were fixture precondition failures, not product failures. Their logs, screenshots and traces are retained as `G1-green`, `G1-corrected`, `G1-40rows` and `G1-scroll-diagnostic` under the external proof directory. The new visible paired-row test proves no hover-triggered navigation request, focus transfer or scrolling in current linked mode; it does not prove the historical precondition, retire the scenario, or grant a formal inapplicability disposition. Source reconciliation and archive eligibility remain open.

Final scoped checks from `apps/wbs/fe-01`: `TZ=UTC bunx vitest run src/components/wbs/plan-chart-seam.test.tsx src/components/wbs/gantt-panel.test.tsx --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000` passed 287/287 (`final-unit.log`); `TZ=UTC bunx vitest run --config vitest.node.config.ts src/components/wbs/pointed-row-store.test.ts --testTimeout=30000 --hookTimeout=30000` passed 10/10 (`final-store.log`). From the root, Chromium with `CI=1 E2E_PORT_SHIFT=1900 bunx playwright test apps/wbs/fe-01/e2e/hover-cards.spec.ts --config=apps/wbs/fe-01/playwright.config.ts --project=chromium --grep='the pointer moves a row by the same ink on both steps of the stripe|a Gantt row’s own line|a focused bar keeps one row light under the pointer on both stripes|pointing a visible paired row neither scrolls nor requests row navigation' --workers=1 --trace=on --output=/tmp/puni-pointed-row-proof-baseline-53b39d/final-browser-poststyle-results` passed 11/11 (`final-browser-poststyle.log`). After the recorder's final typed logging adjustment, the G1 case alone passed 1/1 (`G1-final-recorder.log`, external trace). The shifted 5000/5100/6100 listeners were free after browser exit. Changed-file ESLint, frontend `bunx tsc -p apps/wbs/fe-01/tsconfig.json --noEmit`, five-file Prettier check, `git diff --check`, and pinned OpenSpec 1.12.0 strict validation of test-axes passed; an earlier static attempt identified only test formatting and recorder typing, corrected before these results. At that pointed-row checkpoint, the canonical gate and full OpenSpec validation had not yet run; the later passing canonical gate for `0611ae928e2abf074221d84f3f4dc21a23877d44` is recorded in WBS.

### Tasks 2.1g and 2.1h — Phase B Performance evidence reconciliation (2026-10-10)

This documentation checkpoint starts at `0611ae928e2abf074221d84f3f4dc21a23877d44`; the two operational invocations ran earlier from clean committed source `47e11463fb612bc44ae34839b7733e01702bff7c` on h2puni. The retained [external policy bytes](evidence/performance-fullmount-fault/policy.json) and the policy file selected for Phase B each hash to SHA-256 `79d24f20bc78b417246605f04d8bef209a0aef299aef6c6cf6d3d3bf2160cb77`. The original external path had disappeared; Phase B used a byte-identical copy of the retained policy at `/tmp/puni-performance-08034-phaseb-policy.json`. It selects `PERF-THRESHOLD: observe`, Chromium, Playwright `1.63.0`, reviewed case `wbs-folded-mounted-cells`, and the unchanged `count lte 1200` declaration. This is external selection and operational evidence, not an authenticated receipt or proof of filesystem isolation from a same-user candidate.

Task 2.1g's production-path proof map is already recorded above. The **Task 2.1g Performance implementation checkpoint** watched removal of pointer invalidation on a threshold breach (failing JUnit and observation retained, no success pointer), failed GW readiness (no pointer), occupied shifted-port admission (unrelated listener survived), and forced-kill handling for immediately exiting wrappers with separate-session listener and TERM-resistant descendants. Its sequential publication test observed distinct immutable bundles and pointers. The **reviewed lifecycle corrections and full-mount fault** section records the real 1500-cell threshold failure with a retained failing JUnit, `cleanupFailures:[]`, no pointer, and free shifted listeners; its final owner and complete runner suites passed 22/22 and 47/47, including the 120-second orphan/deadline case. The **second ownership and supervisor review** records the watched reused-PID/foreign-grandchild and stderr-pipe faults; unrelated A/B/C survived while an independently owned sibling drained, and the corrected complete runner suite passed 47/47 again. The **ancestry-cycle refusal proof** records a watched bounded refusal with an independent sibling drained. These records cover verified child-subreaper/pidfd ownership, orphan reaping and foreign-process safety through the production runner with injected faults. The Phase B pair below supplies two further real-stack fresh publications and listener release.

The exact uncached Phase B command, run twice sequentially without source edits or manual cleanup, was `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-performance-08034-phaseb-nx E2E_PORT_SHIFT=6200 PUNI_PERFORMANCE_RULE_POLICY=/tmp/puni-performance-08034-phaseb-policy.json bunx nx run wbs-fe-01:test:performance:level --skip-nx-cache` from `/home/puni1/puni-00-gate-tbf`. Both runs exited 0; Nx printed target success and cache skipped, with durations 48.6 s and 48.2 s. The first current pointer, clean checkout and released 9300/9400/10400 listeners were checked before run two. **Complete decoding of the first immutable bundle occurred only after run two had started.** The second pointer names only the second invocation; a later read of that pointer and `ss -ltn` found no owned shifted listeners. At that later read the shared checkout HEAD had moved to `0611ae9`; the immutable Phase B manifests and original run record, rather than its later HEAD, identify the executed source.

| Invocation                             | Bound candidate                                                    | Discovery / run SHA-256                                                                                                                 | Observation       | JUnit                           |
| -------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------- |
| `553b295e-b3be-4f6a-aca7-452e2f72041f` | `eb1c5dc6ec8d00229966ff9edf00de105c12e2c3d977e094dd109df8091b3082` | `4285cd127c4aa0058d4179fadc91c286fd1ef2eb4d9e6d088c301ba8adc7b580` / `ab46bd0c17d5084a988ad64423a036e6986d503992ebf0b6e38dcc95ebc6d83d` | 915 cells, passed | 1 test, 0 failures/errors/skips |
| `79df1ea4-8cab-400d-b874-8115070f12db` | `eb1c5dc6ec8d00229966ff9edf00de105c12e2c3d977e094dd109df8091b3082` | `af8211e33dc95f14ae0e562af0a6c8663fa40e60aa5fbf38b89983a8b3dfffbd` / `f74d6bc2df6f0f004216aebeb1dddfbb9f5f9a7e3c16ae37de4251b148dcea10` | 915 cells, passed | 1 test, 0 failures/errors/skips |

Direct reads of both retained manifests at `/home/puni1/puni-00-gate-tbf/tmp/junit/performance/<invocationId>/manifest.json` bind the full `47e11463fb612bc44ae34839b7733e01702bff7c` revision, policy digest above, declaration digest `ac556643db201788b308ac9f8fd2da0f98572b8b0ab4f14eeac39882c92c6c55`, config digest `56cd892eba44a0b1e33199a81df18fb33c36953e2b6fe8e8bf4e5017ede5dae7`, Playwright `1.63.0`, one `[TEST-AXES-038]` case, and exact selection `{CI:'1',E2E_PORT_SHIFT:'6200'}`. Their evidence JSON binds `exitCode:0`, one passed `folded-mounted-cells` observation of 915 `count`; `915 <= 1200`. Both JUnit bytes parse as the same single declared fixture/title, with SHA-256 `455f0862bae525fb78b4ed2f5110e534f41a98f663ea91e5a38b3b5087f135cb`; both evidence JSON files hash to `81ee19081a909df369512a8b66decacb14e0e97846c39e30d986c86f64909412`. The distinct discovery/run digests and invocation IDs establish fresh collection. The retained Phase B inspection record reports production decoder and judge success for both bundles. Both manifests and the final current pointer say `certifies:false`.

Tasks 2.1g and 2.1h are complete at their bounded operational scope. Task 2.1, 2.2, 2.2a, 2.2a.1 and 4.1 remain open; every existing source and deployment hold remains in force. Trusted collector authentication/admission and the remaining level obligations are outside this evidence. The canonical h2puni gate was not run for this documentation reconciliation.

### 4.1b.1 source ownership architecture checkpoint — 2026-10-10

Planning only, from clean `500b95e3d76e2e4d04658b167aefe9f657c90bed`. Re-read repository rules and the existing test-axes artifacts. Pinned OpenSpec 1.12.0 status reports the repo-local sdd-lean artifacts complete; this is an authorized bounded amendment, not an implementation or archive completion. The new pending task adds `inspect-test-sources` for exact indexed ownership of existing Browser report cases, keeping test level explicitly unresolved. The design specifies the command, complete output shape, identity calculation, dependency boundaries and decision costs. Source owner is distinct from tested module, service kind, coverage and execution authentication.

The real source allocator command `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts scenario allocate . openspec/changes/test-axes/specs/test-axes/spec.md` exited 0 and proposed six allocation events, TEST-AXES-048 through TEST-AXES-053. Before applying the emitted spec/journal, the prior journal event sequence was checked equal to the complete prefix of the proposed journal; only those six allocate events were appended. Proposal retained at `/tmp/puni-4.1b1-allocation.json`. No identifier was hand-assigned, retired or renamed. For order-normalization proofs whose real upstream return is already sorted, a test-only preload may wrap that real dependency and reorder only its returned array; record that dependency fault explicitly instead of claiming naturally unsorted production output.

The following matrix is the REQUIRED implementation proof plan. None of these new runtime tests or watched faults has run at this architecture checkpoint. Sol must record actual outcomes and adjacent `Proof:` comments only after observation; a timeout, unrelated later refusal or unsupported fixture must not be recorded as the predicted result.

| Scenario / boundary           | Production CLI fixture and oracle                                                                                                                                                                                   | Required watched fault                                                                                                                                                                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 048 exact source owner        | Real Browser publication over committed case blobs; complete outer and nested indexes; bind exact nested module, index identity, case ID, status and source                                                         | Route lookup to the outer/first index and observe the exact owner assertion fail; restore                                                                                                                                                                                          |
| 049 missing ownership         | Valid index elsewhere, reported case outside all indexed boundaries; require named no-owner refusal and empty stdout                                                                                                | Remove the no-owner guard and observe the named assertion fail, recording whether it becomes success or a later failure                                                                                                                                                            |
| 049 ambiguity                 | Real duplicate module/invalid ownership metadata must retain the checkIndexes refusal                                                                                                                               | Break the responsible upstream dependency and observe its named refusal assertion fail; if an adapter uniqueness invariant is unreachable with valid checker output, use a labeled preload wrapping the real checker and injecting only a second owner, then remove that invariant |
| 050 same candidate            | Wrap the real inspector in a test-only preload, changing only its returned revision or candidate digest in separate cases                                                                                           | Remove the responsible comparison and observe each matching refusal test fail; this is an internal dependency fault, not a naturally reachable same-SHA race                                                                                                                       |
| 051 immutable indexes         | Committed index metadata fails while a valid working-tree replacement exists; also change only working metadata beside a valid committed index and require unchanged output                                         | Substitute working-file reads at the responsible reader and observe the committed-selection oracle fail; restore reader                                                                                                                                                            |
| 051 inherited boundaries      | Missing, malformed UTF-8/JSON/metadata, duplicate module and invalid-link index fixtures, plus Browser source/policy/publication/parity faults; distinguish absent and unreadable Git objects where the reader does | Bypass the real index/report dependency or its responsible guard and observe the specific inherited CLI assertion fail; do not add duplicate unreachable parsing guards                                                                                                            |
| 051 CLI boundary              | Omitted, extra and unsupported modes including performance/manual; require named usage refusal and no JSON                                                                                                          | Remove each reachable arity/mode check separately and observe the corresponding assertion fail                                                                                                                                                                                     |
| 052 identity                  | Reordered equivalent case/debt collections produce equal output digest; change owner, index membership/identity, source mode/content, outcome, upstream report identity and review debt one at a time               | Remove normalization and omit each newly introduced digest binding in separate watched faults; exact canonical-payload assertions must detect omissions even when another binding also changes                                                                                     |
| 053 unresolved classification | Every case keeps the exact unresolved level state; all-passing and admitted failed/skipped cases remain observations                                                                                                | Promote level to Browser and authentication/certification separately; named output assertions must fail                                                                                                                                                                            |
| 053 retained debt/outcomes    | Valid index with more than 40 direct entries carries its exact review-debt entry; valid failed/skipped Browser observations remain present with their original status                                               | Drop debt or drop/promote nonpassing cases in separate faults and observe the exact output assertions fail                                                                                                                                                                         |

Implementation acceptance is the new production CLI suite plus affected Browser/report/index suites with the owning declared timeout; scoped TypeScript, ESLint, formatting, strict OpenSpec and diff checks; then exact Astra review and the coordinator's canonical gate on the committed implementation. Full level-membership assembly, Performance publication inspection, Manual adaptation/B3, both coverage ledgers, tested-module and chain witnesses, collector authentication and admission remain outside this slice. Tasks 2.1, 2.2, 2.2a, 2.2a.1 and 4.1 remain open; 4.1b.1 is pending; accepted 2.1g/h and 4.1a are unchanged. Notes intermittent and all source/review/CI/activation holds remain unchanged. No production code, canonical spec, source archive, WBS state or gate was changed by this planning step.

Planning validation on these amended artifacts: the source `scenario validate` command exited 0 with `{"unidentified":[]}`; pinned OpenSpec 1.12.0 `validate test-axes --strict --json` exited 0 with 1/1 valid and no issues; five-file Prettier write and `git diff --check` exited 0. Runtime tests, watched mutations, full OpenSpec validation and canonical gate were not run in this architecture-only step. Final five-file Prettier check and diff readback also passed; the journal prefix and every pre-existing task row were independently checked unchanged, with only pending 4.1b.1 added.

### 4.1b.1 source ownership implementation candidate — 2026-10-10

This uncommitted candidate adds the `inspect-test-sources` production command and source-owner observation. It reads the committed candidate, calls the real `inspectTestReports` and `checkIndexes`, requires matching revision/candidate and exactly one indexed member owner per reported case, preserves index review debt and all case outcomes, sorts bindings/debt, and hashes the complete versioned payload. The output keeps every level explicitly unresolved, authentication absent and certification false. `README.md`, the installed validator command set and the evidence export expose the new command. No WBS code, canonical spec, source archive, policy, rule registration or coverage ledger changed in this implementation slice.

TDD observation: the first `[TEST-AXES-048]` production CLI test ran before implementation and failed with `unknown command: inspect-test-sources` (exit 1, 0 pass/1 fail); after the command and adapter were added, the same nested-owner fixture passed (exit 0, 1 pass/0 fail). The fixture initially failed the inherited raw Playwright JUnit parity check because it used a full path where Playwright reports a basename; correcting only the fixture's JUnit classname/suite made the real publication pass. The later staged-reader guard had its own RED: the faulted reader test received `test report selection requires a full committed SHA` instead of its required named source refusal; after the guard, it passed. The production fixture contains complete outer and nested indexes, selected Git blobs, external Browser policy and publication artifacts.

| Required proof               | Observed production CLI result                                                                                                                                                                                                                                                                                                                                                       | Watched break and observed assertion failure                                                                                                                                                                                                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 048 exact owner/source       | Nested `module.nested`, exact index identity, case ID, status, committed source digest and upstream report/index identities asserted                                                                                                                                                                                                                                                 | Routing owner to first/outer index failed with expected `module.nested`, received `module.outer`; changing owner ID or source mode also failed exact assertions                                                                                                                                                    |
| 049 missing/ambiguous        | Valid indexed modules with a case outside every boundary refused with named no-owner error and empty stdout; duplicate committed module ID retained `duplicate index module identity`; a labeled checker preload added a second owner and refused                                                                                                                                    | Removing unique-owner guard changed no-owner to `undefined is not an object` and let the two-owner case return success; bypassing checker made malformed-index CLI call succeed                                                                                                                                    |
| 050 same candidate           | Separate test-only wrappers of the real report inspector changed only revision or candidate; each refused with its named mismatch and empty stdout. A wrapped reader returning staged selection refused by name                                                                                                                                                                      | Removing each comparison let its corresponding mismatch call succeed; removing committed-selection guard changed its named refusal to the later report full-SHA error                                                                                                                                              |
| 051 immutable/upstream       | A valid staged root index was independently accepted by `checkIndexes` but could not repair the committed no-owner case; dirty working metadata did not change a valid committed observation. Missing source, invalid external policy, malformed metadata/UTF-8, broken link, absent index, unreadable Git index blob and corrupted report publication all refused with empty stdout | Substituting working candidate reads let the staged replacement repair ownership and failed the required refusal; bypassing report inspector changed the missing-source negative to an index error; bypassing index checker let malformed metadata succeed                                                         |
| 051 CLI                      | Omitted/extra operands, `performance`, `manual` and symbolic `HEAD` refused without JSON                                                                                                                                                                                                                                                                                             | Removing arity guard let extra operands succeed; removing mode guard changed Performance to a later policy error; removing full-SHA guard let `HEAD` succeed                                                                                                                                                       |
| 052 identity                 | Reversing only the real inspector's returned cases or the real checker's two debt entries through labeled preloads left normalized output/digest equal. Source, outcome and owner changes altered identity; isolated upstream report, overall index, owner index and source-content identity faults each altered digest                                                              | Removing either sort changed normalized output. Omitting each of revision, candidate, report digest, index identity, debt, bindings, authentication and certification separately from the hash failed the exact canonical-payload assertion; dropping owner binding/debt also failed their exact output assertions |
| 053 unresolved/debt/outcomes | Passing, failed and skipped observations retained unresolved levels, absent authentication and false certification; a valid 41-entry nested index returned its exact debt tuple; no tested-module, kind, coverage or admission field was emitted                                                                                                                                     | Promoting level, authentication or certification separately failed exact assertions; dropping debt or promoting failed/skipped status failed named output assertions                                                                                                                                               |

Final affected command from `apps/twilight-structure/twilight-burokrat/cli`: `bun test --preload ../../../../tools/test/scratch/preload.ts src/evidence/test-sources.test.ts src/evidence/test-reports.test.ts src/evidence/browser.test.ts src/indexes/indexes.test.ts --timeout=60000` exited 0: 111 pass, 0 fail, 769 assertions across four files in 132.96 s. `bunx tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json` and `bunx eslint apps/twilight-structure/twilight-burokrat/cli/src/evidence/test-sources.ts apps/twilight-structure/twilight-burokrat/cli/src/evidence/test-sources.test.ts apps/twilight-structure/twilight-burokrat/cli/src/cli.ts apps/twilight-structure/twilight-burokrat/cli/src/bin.ts apps/twilight-structure/twilight-burokrat/cli/src/evidence/index.ts` each exited 0 with no diagnostics. `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts scenario validate . openspec/changes/test-axes/specs/test-axes/spec.md` exited 0 with `{"unidentified":[]}`. `bun /tmp/bunx-1000-@fission-ai/openspec@1.12.0/node_modules/@fission-ai/openspec/bin/openspec.js validate test-axes --strict --json` exited 0 with one valid change and zero issues. The direct cached pinned binary was used because plain `bunx openspec --version` could not find a local binary and exited with `EROFS accessing temporary directory`.

Task 4.1b.1 remains unchecked pending exact Astra review and the coordinator's canonical gate on a committed candidate. No canonical gate, source sync/archive, full level assembly, Performance/Manual adapter, coverage ledger, authentication or admission run is claimed here. Earlier task statuses and holds remain unchanged.

Final scoped formatting command `bunx prettier --check apps/twilight-structure/twilight-burokrat/cli/src/evidence/test-sources.ts apps/twilight-structure/twilight-burokrat/cli/src/evidence/test-sources.test.ts apps/twilight-structure/twilight-burokrat/cli/src/cli.ts apps/twilight-structure/twilight-burokrat/cli/src/bin.ts apps/twilight-structure/twilight-burokrat/cli/src/evidence/index.ts apps/twilight-structure/twilight-burokrat/cli/README.md openspec/changes/test-axes/verify.md` exited 0 with all files matching Prettier. `git diff --check` exited 0 with no output. These checks cover the uncommitted implementation and verification edit; the canonical host gate remains the coordinator's next gate.

### 2.2a.1 pointed row under linked scrolling — 2026-10-10

This test-only proof starts from committed `e3819d24fda0ccf4f5debc83783c35a53983cfc8` in isolated `/tmp/puni-test-axes-pointed-row-proof`. It adds `apps/wbs/fe-01/e2e/pointed-row-offscreen.spec.ts`. Forty flat rows are seeded through the real HTTP fixture; each has a Dev estimate, and the chart also draws its assumed QA bar. Ordinary desktop Chromium uses 1280×1000. A real wheel over the chart creates nonzero linked offsets without assigning either pane's offset. The default layout has no offscreen-table/visible-bar pair. One 70px upward height-handle drag establishes the archived premise without approaching the table's 320px floor or the chart's cap. No product behavior, scenario lineage, archive, WBS state or hold changed.

The accepted final geometry is in `/tmp/puni-pointed-row-2.2a1-accepted-green.log`, with trace in `/tmp/puni-pointed-row-2.2a1-accepted-green-results/pointed-row-offscreen-poin-84dd3-ffscreen-table-row-in-place-chromium/trace.zip`. Before the drag, table bounds were y=123–571, client height 448, scrollTop 157; chart bounds were y=571–971, client height 399, scrollTop 168. After the only drag, table bounds were y=123–501, client height 378 (**58px above its 320px floor**), scrollTop 157; chart bounds were y=501–971, client height 469, scrollTop 168. The first visible logical row was 070 on both faces, with fractional cuts -0.004773 in the table and 0 in the chart. Selected row 210 lay wholly below the table content clip at y=513.75–539.9375; its bar was at y=927.04–944.96 inside the chart and page, and `elementFromPoint(260, 936)` returned that exact bar. The pointer moved by coordinates only. For three animation frames, the exact row band and label lit, table/chart/page offsets and focus stayed equal to the snapshot, the forwarded native `scrollIntoView` recorder had zero calls, no navigation request or URL change occurred, and row 210 stayed below the table clip. The final focused command was `CI=1 E2E_PORT_SHIFT=2300 BUN_TMPDIR=/tmp/puni-pointed-row-bun-tmp bunx playwright test apps/wbs/fe-01/e2e/pointed-row-offscreen.spec.ts --config=apps/wbs/fe-01/playwright.config.ts --project=chromium --workers=1 --trace=on --output=/tmp/puni-pointed-row-2.2a1-accepted-green-results`; exit 0, 1/1 passed. Its full output is the external log above.

Watched negatives on this same accepted layout, each restored before the final green:

| Fault                                                          | Named browser failure                                                                                                                                                                | External evidence                                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Substitute paired visible row 070 for selected row 210         | Offscreen geometry refusal fired before pointer movement: row top 147.125 was below the required `>= 501`; exit 1, 0/1 passed.                                                       | `/tmp/puni-pointed-row-2.2a1-final-visible-fault.log` and `/tmp/puni-pointed-row-2.2a1-final-visible-fault-results/`   |
| Substitute the first clipped bar for the exact visible hit     | Hit-point refusal fired before pointer movement: expected `barVisible && exactHit` true, received false; exit 1, 0/1 passed.                                                         | `/tmp/puni-pointed-row-2.2a1-final-clipped-fault2.log` and `/tmp/puni-pointed-row-2.2a1-final-clipped-fault-results/`  |
| Temporarily route bar `onPointerOver` through real `onPickRow` | Actual focus oracle fired: Gantt button changed to Name of 390 after row navigation; exit 1, 0/1 passed. The production file was restored with `cmp` equality to its saved original. | `/tmp/puni-pointed-row-2.2a1-final-behavior-fault.log` and `/tmp/puni-pointed-row-2.2a1-final-behavior-fault-results/` |

Earlier exploratory layouts were rejected for this acceptance: at 1280×900, a 180px drag put the table exactly on its 320px floor; at 1280×1000, a 110px drag left only 18px of floor margin, and the explicit `>360px` floor guard failed. Their geometry remains in `/tmp/puni-pointed-row-2.2a1-premise.log` and `/tmp/puni-pointed-row-2.2a1-midrange.log`. The accepted case uses only its default layout and one 70px drag. One early fixture assertion expected 40 bars but observed 80 because each row also has an assumed QA bar; the case now counts the 40 estimated Dev bars explicitly. The first sandbox run could not bind the three local servers (`EPERM`); the elevated focused runs used shifted ports 5400/5500/6500. These setup failures were not product failures.

The existing visible-pair G1 and G2/G3/G4 Chromium group was rerun on the restored product source with the documented focused grep in `/tmp/puni-pointed-row-2.2a1-existing-green.log`: exit 0, 11/11 passed. Its earlier watched negatives remain recorded in the 2026-09-01 checkpoint above; this slice did not rerun those product mutations. Scoped `bunx tsc -p apps/wbs/fe-01/tsconfig.json --noEmit`, changed-file ESLint, changed-file Prettier check, `git diff --check` and pinned OpenSpec 1.12.0 strict validation of `test-axes` each exited 0. ESLint warned that its cached Nx ProjectGraph was unavailable, so `@nx/enforce-module-boundaries` was skipped by that direct invocation. The canonical h2puni gate was not run for this uncommitted worktree; the coordinator owns that gate after integration. Tasks 2.2 and 2.2a, source eligibility, sync/archive and certification remain open.

### 2.2a pointed-row source lineage slice — 2026-10-10

The isolated `/tmp/puni-test-axes-pointed-row-lineage` worktree starts at `6e46ca0ecd7d143086fc37fde747b7d1f75c9a43`. This slice adds five canonical `wbs-domain` requirements with exactly twenty scenarios in 9/3/2/2/4 order. The active `pointed-row-one-ink` packet owns only the first requirement's nine scenarios, including `pointing scrolls nothing`; `pointed-row-render-cost` owns only the fifth requirement's four scenarios, including editor continuity. The three archived sibling requirements now have canonical predecessors and no active operation. Archived files were read as lineage evidence but were neither changed nor selected by the fixture. No product source, WBS checkbox, hold, journal or archive was changed.

TDD: the first production committed-fixture test, `bun test apps/twilight-structure/twilight-burokrat/cli/src/rules/specifications.test.ts --timeout=60000 -t 'production selector composes exactly five pointed-row'`, exited 1 before source edits (expected exit 0, received 1). After the canonical and active source edits it passed. The complete production selector suite exited 0 with 81 passed, 0 failed and 1162 assertions. The fixture asserts exact requirement titles, scenario titles and counts, source owners, the two disjoint MODIFIED operations, and exact selected inputs excluding archived copies.

The final guard-restored complete suite output is retained at `/tmp/puni-pointed-row-lineage-restored-full-suite.log` (exit 0, 81 passed, 0 failed, 1162 assertions in 91.17 seconds).

The three committed-fixture negatives each produced its named production `SPEC-SCENARIOS` refusal: absent first canonical predecessor (`overlay requirement has no predecessor`), reintroduced second active first-requirement operation (`competing overlay operation`), and render-cost overlay dropping the editor scenario (`MODIFIED requirement drops canonical scenario`). The malformed committed fixtures remained intact while each responsible production selector guard was individually disabled. With the predecessor guard disabled, its negative failed at the exact refusal assertion: it received `undefined is not an object (evaluating 'predecessor.scenarios')` instead. With the competing-operation and retained-scenario guards disabled, each negative failed at its exit assertion (exit 1; expected 1, received 0). The production selector was restored byte-for-byte after each probe; its SHA-256 was `c746955238b097a55c19cc5f75c0c718d77c26f63a6c1f5a9488639137a042fc`. Restored negatives passed. Watched logs: `/tmp/puni-pointed-row-lineage-absent-predecessor-guard-watched.log`, `/tmp/puni-pointed-row-lineage-competing-operation-guard-watched.log`, and `/tmp/puni-pointed-row-lineage-dropped-editor-guard-watched.log`. Adjacent `Proof:` comments record these outcomes.

Pinned OpenSpec 1.12.0 strict JSON validation of `pointed-row-one-ink`, `pointed-row-render-cost`, and `test-axes` each exited 0 with one valid change and zero issues. The direct cached pinned binary was copied to ignored `node_modules` with cached dependencies because `bunx` could not write its package cache and a writable-cache retry had no registry DNS; those setup attempts did not validate the changes. Scoped `bun node_modules/.bin/tsc -p apps/twilight-structure/twilight-burokrat/cli/tsconfig.lib.json --noEmit` exited 0. Direct changed-file ESLint exited 0 but warned that `@nx/enforce-module-boundaries` was skipped because its cached ProjectGraph was unavailable. The full-tree production `check working /tmp/puni-test-axes-pointed-row-lineage 53a87a60dd7a7da80ad929c44f36a9739e75e5bf /tmp/puni-spec-scenarios-08034-policy.json --rule SPEC-SCENARIOS` exited 1, `allowed:false`, `certifies:false`, still refusing the unrelated `competing overlay operation: wbs-domain: A bar explains itself and finds its row`. This slice does not resolve that conflict. Task 2.2a, Task 2.2, source eligibility, sync/archive and certification remain open. No canonical host gate was run before exact-diff review.

The revised source file SHA-256 identities are `ad09253835eacf10c89fd187bfa0321e44fc7ac1fbc82c66dcb27d4b66ab49c4` for canonical `wbs-domain`, `990cbe7b5b4f7a6e68021fb118d0ca5162e59f77659796b933a91601e39572a4` for `pointed-row-one-ink`, and `35b73d62f3329513f398e13e62fb23c1e5e577184e2f821509db2a2f0f55001a` for `pointed-row-render-cost`. The production `check committed` against exact base `6e46ca0ecd7d143086fc37fde747b7d1f75c9a43` also exited 1 with the same unrelated bar-hover conflict. That base predates this uncommitted slice; the committed scratch fixture above proves the revised pointed-row composition, while the full-tree working check records its remaining refusal.

### 2.2a.2 Gantt bar explanation source ownership — 2026-10-10

Starting at `8049edc17f5b7940f469367cf967bbb4d77148aa`, the canonical `wbs-domain` and archived `gantt-view` predecessor are unchanged (three scenarios; fragment SHA-256 `401a3cfafb8d1cefd5e9625cf143af11a298172177514ca8fe654bf18aa7e3e5`). The active `gantt-calendar-axis` packet remains the sole `MODIFIED` owner of "A bar explains itself and finds its row" (four scenarios; fragment SHA-256 `cc2a1e916fb207c02c512864c50a952b77bb9289eca1979c086f5fe8ccb8e102`). Its spec file SHA-256 remains `bcd125a2b27be5ec8c1c3fa6627e59618df9d4534af767a2ca29af642fa4d76b`. The hover packet replaces its competing `MODIFIED` operation with a distinct `ADDED` requirement, "A bar's explanation uses the shared accessible surface", retaining all five scenarios; its fragment SHA-256 is `dd8666fee174ad716a958ee89f2ac8f6b02c71abf7c148a64557570e98eb08fc`. The hover spec file SHA-256 is `b8abf245851fd2017e4cf1fd1157317afb4a63301114708757cf280467500613`. Its `design.md` records the dependent refinement; its historical `verify.md` carries the detailed proof and retains the human review and remount-negative debt. No archive, journal, product, canonical, WBS or hold changed.

The production committed-fixture selector first exited 1 at the new positive assertion while the old competing operation remained; after the source split, its exact owner/title/scenario inventory passed. Three focused tests passed: exact selection, reconstructed pre-fix competing refusal, and missing canonical predecessor refusal. The positive fixture covers all nine calendar operations including the rename, all five hover `ADDED` operations, effective scenario counts of their thirteen requirements, the four calendar and five hover scenario titles, exact source owner and alias, and selected inputs excluding archives. A whole-file fragment digest assertion catches retained prose.

Watched one-at-a-time faults all failed their named tests: disabling the production competing-operation guard with both malformed committed operations intact produced a later `MODIFIED requirement drops canonical scenario` reason; disabling the production predecessor guard with its missing canonical source intact produced `undefined is not an object (evaluating 'predecessor.scenarios')`. Removing the focused-bar scenario from the committed hover source made the effective-scenario assertion fail; removing its workday-date clause made the exact digest assertion fail, receiving `08296096296407c7866d798ce7d2923cdcf89d16e7025252f2c3998320db1b13` instead. The production selector and hover spec were restored byte-for-byte after every probe. Watched output: `/tmp/puni-gantt-hover-lineage-{overlap-guard,predecessor-guard,missing-focus-scenario,missing-calendar-date-clause}-watched.log`. Adjacent `Proof:` comments name each observed failure.

The full production selector suite exited 0, 84 passed, 0 failed, 1211 assertions (`/tmp/puni-gantt-hover-lineage-selector.log`). Pinned OpenSpec 1.12.0 strict validation of `gantt-bar-hover`, `gantt-calendar-axis` and `test-axes` each exited 0 with one valid change and zero issues. The exact source split in a scratch committed candidate `8013c9fa9ecdc44bfd52b77e2e4045cbcca6a2bd` advanced the full-tree production `SPEC-SCENARIOS` refusal to `overlay requirement has no predecessor: wbs-domain: A dragged Gantt panel stays inside the column it lives in` (exit 1, `allowed:false`, `certifies:false`). This is the next unresolved lineage dependency, not a success verdict. The canonical host gate was not run for this unreviewed slice. Calendar task 7.3, hover task 6.2, its admitted enrichment/remount negative, and test-axes tasks 2.2a/2.2 remain open.

After a test-only lint correction (`String(scenarios.length)` in the inventory assertion), the restored full selector suite was rerun and exited 0: 84 passed, 0 failed, 1211 assertions in 96.84 seconds (`/tmp/puni-gantt-hover-lineage-selector-final.log`). Scoped CLI TypeScript and changed-file ESLint exited 0; ESLint warned its cached Nx ProjectGraph was unavailable, so `@nx/enforce-module-boundaries` was skipped. Changed-file Prettier and `git diff --check` exited 0. All three strict OpenSpec validations were rerun after the documentation edits and remained valid.

## 080.34 integration audit — 2026-10-11

Batch-10 lane `test-axes-080-34` integrates the existing work without new level work. The branch `feat/test-axes-gantt-hover-lineage` (`01e1d52f2`) already contained `origin/main` `a3b1526bd`; `git merge origin/main` reported `Already up to date`. It ships as one PR. A stacked split at `a0102f0b1` (end of Manual 3.1 and the Browser execution slices) was tried and rejected: that commit fails `shared-test-levels:typecheck` (`TS2769` at `libs/shared/domain/test-levels/src/index.test.ts:37`), repaired only by the later `ec243add7`, so no earlier commit is an independently green boundary without rewriting pushed history.

### Ticked tasks and their runnable tests

Every command runs from the repository root under `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`. Results observed on this audit are in the last column; "not rerun" names a heavy run this lane did not repeat, whose earlier observation is recorded above.

| Task        | Runnable test                                                                                                                                                                              | Observed in this audit                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| 1.1         | `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                                                                                                   | exit 0; 158/158 valid (140 changes, 18 specs)                                                                |
| 2.1a        | `bunx nx run tool-devsync:test-levels:verify`; `tools/tool-devsync/src/test-levels.test.ts`, `workspace-targets.test.ts` in `tool-devsync:test`                                            | `test-levels:verify` exit 0 `Verified declared test collections`; `tool-devsync:test` 551 pass/0 fail        |
| 2.1b        | `bunx nx run wbs-fe-01:test:unit:level`, `bunx nx run wbs-fe-01:test:view:level` (four JUnit reports under `tmp/junit/`)                                                                   | both exit 0; JUnit 852 + 21 (Unit), 2,660 + 3 (View), 0 failures                                             |
| 2.1c        | `bunx nx run wbs-store-sqlite:test:api --skip-nx-cache` (JUnit `tmp/junit/wbs-store-sqlite.api.xml`)                                                                                       | exit 0; 1,174 pass/0 fail, JUnit 1,174 tests/3,598 assertions                                                |
| 2.1d        | `bunx nx run wbs-fe-01:test:browser:packaged:level` (Chromium, Docker); inspector `apps/twilight-structure/twilight-burokrat/cli/src/evidence/browser.test.ts` in `twilight-burokrat:test` | exit 0 (shift 3800); 2 cases, 0 failures; manifest `certifies:false`; external-policy inspection not rerun   |
| 2.1e        | `bunx nx run wbs-fe-01:test:browser:ordinary:level` (Chromium); parser `libs/shared/domain/test-evidence/src/index.test.ts` in `shared-test-evidence:test`                                 | exit 0 (shift 3700, 23 min 34 s); 432 cases, 0 failures, 40 skipped; `shared-test-evidence:test` 12 pass     |
| 2.1f, 2.1g  | `tools/tool-devsync/src/performance-{level,playwright,processes,supervisor-test}.test.ts` in `tool-devsync:test`; `cli/src/evidence/performance.test.ts` in `twilight-burokrat:test`       | pass in the 551-test `tool-devsync:test` run and in `twilight-burokrat:test`                                 |
| 2.1h        | `bunx nx run wbs-fe-01:test:performance:level` (real stack, Chromium)                                                                                                                      | not rerun: needs a controller-selected external `PUNI_PERFORMANCE_RULE_POLICY`, which the repo does not hold |
| 2.2a.1      | `apps/wbs/fe-01/e2e/pointed-row-offscreen.spec.ts`, collected by `wbs-fe-01:test:browser:ordinary:level`                                                                                   | passed in the ordinary run above                                                                             |
| 2.2a.2      | `cli/src/rules/specifications.test.ts` in `twilight-burokrat:test`                                                                                                                         | pass in `twilight-burokrat:test`                                                                             |
| 3.1.1–3.1.5 | `cli/src/evidence/manual.test.ts` in `twilight-burokrat:test`                                                                                                                              | 148 pass/0 fail (with `cli.test.ts`)                                                                         |
| 4.1a        | `cli/src/evidence/test-reports.test.ts` in `twilight-burokrat:test`                                                                                                                        | pass in `twilight-burokrat:test`                                                                             |

### Open tasks: what exists and what is missing

**2.1.** Exists: additive JUnit-writing level targets for the pilot projects only — `wbs-store-sqlite` (`test:api`, `test:unit`, `test:conformance:level`), `wbs-store-memory` (`test:unit:level`, `test:conformance:level`), `wbs-core` (`test:unit`, `test:browser:portable:level`), `wbs-fe-01` (`test:unit:level`, `test:view:level`, `test:browser:{ordinary,packaged}:level`, `test:performance:level`) and `twilight-burokrat:test:architecture:level`; their collection membership is verified by `tool-devsync:test-levels:verify` (2.1a), including the task's own negative (a Conformance file in an API-only target refuses naming both levels); operational, noncertifying executions are recorded in 2.1b–2.1h. Missing: trusted, candidate-bound report receipts and admission (no authenticated runner receipt exists, Browser served bytes are not independently authenticated); timeout and forced-kill cleanup proof for packaged Browser; level targets for every project outside the pilot set (for example `wbs-be-01`, `tool-devsync`, `twilight-burokrat` itself and the shared libraries keep their broad `test` targets as explicit inventory exceptions); and a Manual level runner, which by design consumes `inspect-manual` observations and never emits a passing JUnit report.

**2.2.** Exists: the B3 allocator and journal (`scenario allocate`, `openspec/scenario-allocations.json`), selector version 3 with `RENAMED Requirements` pairs (75 then 84 production specifications tests at the time), and the hand coverage table for one capability: `bun tools/tool-devsync/src/scenario-coverage-cli.ts project-assignment-reads wbs-store-sqlite:test:api wbs-store-sqlite:test:unit wbs-core:test:unit` printed `yes` for PROJECT-ASSIGNMENT-READS-001..003, and removing the `[PROJECT-ASSIGNMENT-READS-003]` citation in a disposable commit made it uncovered (Task 2.2 section above). Missing: the task is blocked on 2.2a, because the production committed `SPEC-SCENARIOS` selector still refuses the full active tree, so the capability join cannot be claimed over a whole-tree selection.

**2.2a.** Exists: the active operation inventory at `21c2cf8a0`; reviewed corrections for tool hints, Markdown work-item names, Notes preview, solver binding, deployment pipeline, DI label surface, pointed-row (five canonical requirements) and the Gantt bar hover split, each proven by committed production selector fixtures and watched guard removals. Missing: the whole-tree selector still exits 1; the last recorded refusal is `overlay requirement has no predecessor: wbs-domain: A dragged Gantt panel stays inside the column it lives in`, and the explicitly held `gantt-height-column-clamp` records and the remaining competing overlap groups are unresolved. Calendar task 7.3, hover task 6.2 and its remount negative stay open in their own changes.

**4.1.** Exists: the diagnostic prerequisites only — 4.1a `inspect-test-reports` (Browser observations, TEST-AXES-042..047), the 4.1b.1 `inspect-test-sources` candidate, the Manual inspector (3.1) and the Performance judge. Missing: both coverage ledgers, T1/T2 enforcement, the capability chain and Manual-case integration; reviewed Performance and Manual adapters; complete level classification facts. It cannot start until 2.1, 2.2 and 2.2a complete.

**4.1b.1.** Exists: commit `e3819d24f` implements `inspect-test-sources` with production CLI tests TEST-AXES-048..053 in `cli/src/evidence/test-sources.test.ts` and the watched mutations recorded in its implementation-candidate section above; its tests passed in this audit's `twilight-burokrat:test` run. Missing: the exact Astra review of the committed bytes and the coordinator's canonical gate on the committed candidate, after which the box can be ticked. No new work is required by the task text.

### Commands run in this audit (worktree `/home/df/wd/puni/b10-test-axes`)

Candidate `3b0f60f08` (the branch plus one test-only commit). All commands ran under `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT` on a host shared with other batch-10 lanes.

- `bun install --frozen-lockfile`: 1,371 packages installed.
- `nx run-many -t typecheck` for the eight touched projects: exit 0. `lint:fast` (six projects) and `lint` (`shared-test-evidence`, `shared-test-levels`): exit 0. `nx run-many -t build` for `twilight-burokrat`, `shared-test-evidence`, `shared-test-levels`, `wbs-fe-01`, `tool-devsync`: exit 0.
- `nx run-many -t test`: `shared-test-evidence` 12, `shared-test-levels` 4, `wbs-store-memory` 146, `wbs-core` 847, `wbs-store-sqlite` 1,287, `wbs-fe-01` 3,533 + 3 zoned. All passed with 0 failures.
- `twilight-burokrat:test`: 1,161 pass/2 fail. Both failures were timeouts under host load: `read-candidate production CLI > refuses malformed or failed ls-tree output` at 20 s, and `inspect-manual refuses malformed and unknown fields` at 12 s. Rerunning `src/cli.test.ts src/evidence/manual.test.ts` on their own passed 148/0.
- `tool-devsync:test`: the first run had 16 failures. Three were timeouts. The rest came from one timed-out Performance test, which left its three fixture listeners on 9100/9200/10200 orphaned. Every later Performance case then refused with `Performance shifted port 9100 is occupied`. The lane killed those orphans, which it had created itself. One failure then remained in isolation: `bounds and validates WBS descriptor producer transport before service launch`. Its eleven sequential faults took 61 s against a single 60 s budget. Commit `3b0f60f08` splits it into one `it.each` case per fault (2.6 to 12.8 s each, 83 assertions as before). Disabling the three-service array guard in `performance-level.ts` made the `descriptor-output-shape` case fail (`Expected: true, Received: false`). The file was then restored byte for byte (SHA-256 `d6ea8571…0aa6`). The full `tool-devsync:test` rerun passed 551/0.
- `twilight-burokrat check-indexes committed . 01e1d52f2…`: exit 0, 0 review-debt entries. `tool-devsync:test-levels:verify`: exit 0.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: 158/158. `bunx prettier --check --ignore-unknown` on every changed file: clean. Without `--ignore-unknown`, Prettier exits 2 only because it has no parser for the committed `evidence/*/report.xml` files.

Follow-up debt this audit found but did not fix: a Bun per-test timeout in `performance-level.test.ts` skips the fixture's cleanup, so its shifted listeners outlive the test and cascade into the next cases. The production runner's own timeout path does reap. Only the test harness leaks.

### 080.34 Fable review follow-ups — 2026-10-11

The Fable review of `c09aa1d9a` returned MERGE. It asked for three changes in this PR.

**Cancellation is a controlled exit.**

- `runLockedPerformanceLevel` now keeps `SIGTERM` and `SIGINT` listeners for the life of the run. On a signal it stops the owned processes once, using the same memoized `stop()` that ordinary cleanup awaits. It then detaches the listeners and re-raises the signal. The listeners stay attached during cleanup, so a repeated signal cannot interrupt it.
- In the test harness, `performance-level.test.ts` tracks every live fixture supervisor. Its `afterEach` sends `SIGTERM` to any supervisor that a timed-out test abandoned, then waits for it to exit (15 s deadline).
- New production test: `a cancelled supervisor stops its owned services and frees the shifted ports`. It starts the `hang` fixture, waits until 9100, 9200 and 10200 are bound, then cancels the supervisor. It expects `Performance supervisor exited 143`, all three ports free, and no current pointer. It passed (2.69 s).
- Watched fault: with both listener registrations commented out, the same test failed at the port assertion. Its exact-array diff showed three changed entries (`- Expected - 3 / + Received + 3`). `ss -ltnp` showed orphaned `bun` listeners on all three ports. The lane killed those listeners, then restored `performance-level.ts` byte for byte (SHA-256 compared).

**Only an admitted run invalidates the last success.**

- Before this change, removing `tmp/junit/wbs-fe-01.performance.current.json` happened ahead of the policy-selection refusal. A misconfigured invocation therefore erased the prior success pointer without being admitted. The removal now runs after `assertPreflight`.
- The absent-policy production test (`requires an externally selected readable policy before Playwright`) now seeds a prior pointer. It requires that pointer to be byte-equal after the refusal. It passed.
- Watched fault: with the removal moved back above the refusal, the test failed at that pointer read (`performance-level.test.ts:1439`, ENOENT). The file was restored byte for byte. The threshold-breach invalidation proof still holds, because the removal still precedes execution.

**Routing.** `LLM_README.md` now has one route line to this change's `tasks.md` and `verify.md`. The file is 136 lines. The route makes `verify.md` a current document. The repository namespacing sweep then refused it (`verify.md:legacy-root`), because it quotes an injected pre-move source path as fault evidence. It now carries a `legacy-root` exemption in `docs/findings/current-document-check-exemptions.json`, like other change verification records. `repo-namespacing-handoff.test.ts` passed 15/0.

**Deferred to WBS follow-ups by the reviewer.**

- Burokrat `inspect-manual` reads the wall clock (`cli.ts:427`). The evaluation instant should become an explicit CLI argument supplied by Dash. Done by WBS 9a25268b (see the last section).
- Level target names have drifted: `test:api`/`test:unit` versus `test:conformance:level`/`test:unit:level`, and there are three Browser level targets in fe-01. These should be normalized when non-pilot projects get level targets.

## WBS 9a25268b (batch 10) — `inspect-manual` reads no clock

Observed 2026-10-11 on branch `batch-10/080-burokrat-no-clock`, from
`origin/batch-10/integration-4` at `9a9d5677f`. `inspect-manual` now takes a required
`--now <UTC instant>`; `readEvaluationInstant` in `evidence/manual.ts` decodes it once and refuses
an absent or malformed value with `EvaluationInstantError` (`failure: 'absent' | 'malformed'`).
The test harness passes a fixed `2026-10-11T00:00:00.000Z`, after every fixture timestamp, so no
Manual case reads a clock. Twilight Dash, which owns time (`docs/twilight-structure/names.md`),
supplies the instant; no Dash caller of `inspect-manual` exists yet.

The exact on-date deadline boundary that Task 3.1.3 could not exercise is now a production CLI
case: with `reviewBy` `2026-10-09`, `--now 2026-10-09T23:59:59.999Z` is `current` (exit 0) and
`--now 2026-10-10T00:00:00.000Z` is `overdue` (exit 1).

Faults, each injected by hand, its tests run, the file restored and the tests rerun green:

| Fault | Injected                                               | Named test                                                                                                              | Observed                                             |
| ----- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `c1`  | `cli.ts` samples `new Date()` again instead of `--now` | `inspect-manual evaluated at the last instant of the deadline date`; `… without an evaluation instant`; `… malformed …` | exit 1 for the boundary case; 0 for the two refusals |
| `c2`  | the overdue comparison is `>=`                         | `inspect-manual evaluated at the last instant of the deadline date`                                                     | `Expected: 0, Received: 1`                           |
| `c3`  | `readEvaluationInstant` keeps only the finiteness test | `inspect-manual refuses a malformed evaluation instant`; `readEvaluationInstant refuses the malformed instant …`        | `2026-02-30…` and `2026-10-11` accepted              |

Scope: only `inspect-manual` stopped reading the clock. The review of this change found clock
reads remaining in `review/invoker.ts`, `policy/prepare-activation-cli.ts` and
`policy/prepare-relocation-activation-cli.ts`, recorded as a follow-up under task 2.1 in
`tasks.md`. The fourth, `admission/authority-store.ts`, left Burokrat with the authority
relocation (`dash-authority-relocation`, slice S2), which made the clock a required dependency.

## WBS 080.36 (batch 10) — the remaining Burokrat clock reads are Twilight Dash's

Observed 2026-10-11 on branch `batch-10/080-36-burokrat-clocks`. None of the remaining reads is an
evaluation instant. Each measures an event that the process itself performs, which names.md places
in Twilight Dash:

- the review harness journal and its lock wait (`review/invoker.ts`, 10 reads);
- the candidate check runs of both activation CLIs (2 reads each);
- the lease authority's default clock (`admission/authority-store.ts`, 2 reads), since moved to
  Twilight Dash with a required clock by WBS 080.19 and no longer listed.

So none takes `--now`. Some recorded instants are compared later: the provenance check refuses a
receipt that starts before `registeredAt`. That comparison is between two recorded instants, and
neither of them is a reading taken at judgment time. Each site is documented as Dash-owned and
moves with its owner. No CLI contract changed.

Update 2026-10-12: the invoker's ten reads moved to Twilight Dash, which now injects a wall
clock into `FileJournalLock`, `FileInvocationJournal` and `ProcessReviewInvoker`; see
`openspec/changes/dash-activation-relocation/verify.md` (S2). The same slice moved the AST
detector the test applies to `tools/test/clock-reads/detector.ts`; in Burokrat only the two
activation CLIs' check runs remain listed.

`src/no-ambient-clock.test.ts` parses every non-test source in the package with the TypeScript
compiler and counts clock references. A reference is any of the following:

- any value use of `Date` other than `new Date(x)` with a defined argument, `Date.parse`,
  `Date.UTC` or `instanceof Date`;
- any value use of `performance`, `Temporal` or a global object;
- any use of `process` or `Bun` other than a literal non-clock member;
- any member, key, binding or named import called `hrtime`, `uptime`, `nanoseconds` or
  `timeOrigin`, `randomUUIDv7` or `DateTimeFormat`;
- any load of `perf_hooks` or of a computed module specifier.

Each listed file may keep at most its current count, and an entry whose file no longer exists
fails. A swap inside a listed file that keeps the count unchanged is not caught. Clocks outside the
runtime, computed keys on other objects, `new Date(arg)` whose argument is undefined only at
runtime, and `eval` are not seen. The test's JSDoc says both.

Faults injected by hand, each restored and rerun green:

| Fault                                                              | Observed                                                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `const { now: sampleNow } = Date` appended to `evidence/manual.ts` | scan failed listing `evidence/manual.ts` `Date`                                                             |
| `globalThis.Date.now()` appended to `contracts/records.ts`         | scan failed listing `globalThis`                                                                            |
| `process['uptime']()` appended to `rules/check.ts`                 | scan failed listing `process['uptime']` and `process`                                                       |
| an eleventh `Date.now()` in `review/invoker.ts`                    | scan failed listing the invoker's eleven reads                                                              |
| the activation entry renamed to a missing path                     | stale-entry check failed listing the missing path                                                           |
| the glob changed to `**/*.tsx`                                     | anchor failed: `Expected to contain: "cli.ts"`                                                              |
| Date rule off                                                      | detector test lost 15 lines (`Date.now()` … `extends Date`)                                                 |
| clock-globals rule off                                             | detector test lost `globalThis`, `performance`, `Temporal` lines                                            |
| clock-holders rule off                                             | detector test lost `process[key]`, `const P = process`                                                      |
| clock-member rule off                                              | detector test lost `os.uptime()`, `Bun.randomUUIDv7()`, `Intl.DateTimeFormat`, `import { hrtime as clock }` |
| module-load rule off                                               | detector test lost the four `perf_hooks` and computed-specifier lines                                       |
| `undefined` argument test off                                      | detector test lost `new Date(undefined)`                                                                    |
| every `new Date(x)` treated as a read                              | detector flagged pure lines 2 and 3; scan flagged six pure uses                                             |
| type-position skip off                                             | detector flagged `let typed: Date`; scan flagged four type uses                                             |

## WBS 352d2d65 (batch 10, under 080) — Burokrat test suite cost — 2026-10-12

`twilight-burokrat:test` took about 35 minutes on h2puni (load about 9) in the round-5/6 gates.
Most of it was process starts: a case spawned `bun run cli.ts <command>`, which loads every CLI
module, and Manual cases also built a fresh Git fixture each. A trivial `bun run cli.ts explain
MOD-INDEX` took 2.9 to 3.8 s at load 12 on the workstation.

What changed:

- `executeCli` (`cli.ts`) is the function the process entry now calls; `invokeCli`
  (`invoke-cli.ts`) runs it in-process and captures stdout, stderr and the exit code. Its JSDoc
  says when a case must still spawn.
- These suites call the CLI in-process: `manual`, `rules`, `specifications`, `relationships`,
  `selectors`, `trusted-policy`, `indexes`, `root-migration`, `templates`, `kind-inventory`,
  `test-sources`, `performance`, `test-reports`, `browser`, `classification`, `scenarios` and
  `read-candidate` in `cli.test.ts`. Cases kept as processes: missing `--now`, wrong arity, unknown
  command, the verdict exit status (new case `inspect-manual ends its own process with the verdict
exit status`), every fake `git` on `PATH` or other child environment, the candidate-script
  sentinels, the README-cycle kill timeouts, the launcher and bundled-validator cases, and the
  preload fault in `test-sources`.
- Manual cases copy one prebuilt candidate repository per `baseLamp` variant instead of building
  one each; commit IDs survive the copy.
- The target still runs its files serially. Three Bun workers (`--parallel=3`) finished locally in
  547 s, but on the CI runner, beside Nx's typecheck and build, 128 tests timed out (2215 pass,
  128 fail, 2826 s) with Git children killed at their budgets, so the change was reverted
  (`310d79fd6`). Workers need a measurement on the gate host first.
- Child-start bounds that also measured a loaded Bun start were widened: the two FIFO service cases
  (2 s to 20 s) and the three entered-marker waits in `observation-tick.db.test.ts` (2 s to 20 s).
  The waits after the marker keep their 2-second bounds.

Not converted: `pilot-policy.test.ts`. Its cost is the lint itself, not process starts: one
`lint-local` over this repository started 16,936 `git cat-file blob` processes (strace), and
routing its lints in-process left the file at 540 s, so that change was dropped. `relationships`
spends about 5 s per extraction in-process on TypeScript program construction.
`relocation-activation` drives `prepare-relocation-activation-cli.ts`, a different entry.

### Timings

Seconds per file, serial, `bun test --preload ../../../../tools/test/scratch/preload.ts
--timeout=60000 <file>` from the project directory under `env -u CLAUDECODE -u
CLAUDE_CODE_ENTRYPOINT`. Column 1 is the base `c8285f9a3` alone (load 9 to 20 from other
sessions). Columns 2 and 3 ran at the same time, base and branch side by side, so they share their
load. Rows are files at or above 5 s in either run.

| File                                  | base alone | base, side by side | branch, side by side |
| ------------------------------------- | ---------- | ------------------ | -------------------- |
| `policy/pilot-policy.test.ts`         | 504        | 784                | 516                  |
| `relationships/relationships.test.ts` | 236        | 222                | 135                  |
| `evidence/manual.test.ts`             | 190        | 216                | 19                   |
| `rules/rules.test.ts`                 | 158        | 214                | 31                   |
| `policy/trusted-policy.test.ts`       | 108        | 191                | 64                   |
| `rules/specifications.test.ts`        | 144        | 116                | 9                    |
| `relationships/selectors.test.ts`     | 95         | 112                | 45                   |
| `rules/kind-inventory.test.ts`        | 57         | 89                 | 12                   |
| `indexes/root-migration.test.ts`      | 69         | 60                 | 31                   |
| `indexes/indexes.test.ts`             | 57         | 52                 | 5                    |
| `evidence/performance.test.ts`        | 40         | 49                 | 2                    |
| `evidence/test-sources.test.ts`       | 42         | 48                 | 18                   |
| `rules/scenarios.test.ts`             | 55         | 41                 | 2                    |
| `templates/templates.test.ts`         | 35         | 35                 | 4                    |
| `evidence/test-reports.test.ts`       | 28         | 31                 | 4                    |
| `evidence/browser.test.ts`            | 22         | 24                 | 2                    |
| `cli.test.ts`                         | 19         | 21                 | 12                   |
| `inventory/classification.test.ts`    | 18         | 18                 | 1                    |
| the 62 other files                    | 545        | 735                | 449                  |
| **total**                             | **2208**   | **2754**           | **1360**             |

Both side-by-side runs failed `observation-tick.db.test.ts` on a 2-second child-start wait (base 2
cases, branch 1); that is the bound widened above. The base-alone run passed every file.

The whole target after the change, serial, `bun test` with the target's flags from the project
directory: `Ran 2329 tests across 81 files. [976.45s]`, `2329 pass, 0 fail`, at load 2 to 4. An
earlier serial run through Nx took 1184.50 s and failed one test, `selected check closes remaining
owned descriptors after a leaf descriptor was closed` (`/proc/self/fd` count `Expected: 21,
Received: 20`): that test counts process-wide descriptors, so a descriptor another file's async
work closed mid-test fails it. It passed in the second run and in a subset run twice. On CI the
tool-wiki gate's test target went from `Ran 2325 tests across 80 files. [2364.42s]` (integration-7
run 38187173535) to `Ran 2329 tests across 81 files. [1159.81s]`, `2329 pass, 0 fail` (run
38194371198). `pilot-policy.test.ts` (about 500 s) is now nearly half the target; see the
decision in the lane record. The h2puni gate was not run by this lane.

### Proofs re-run

Every Proof comment in `evidence/manual.ts` and the `inspect-manual` Proofs in `cli.ts` and
`policy/trust.ts` were re-injected one at a time against the refactored `manual.test.ts` (a
script applied each fault to a separate worktree at `5c0b9fab5`, ran the whole file, recorded the
failing tests and restored the file). All 111 faults failed the suite; none survived. Where a Proof
names more than one branch, each branch was its own fault (`37a`/`37b`/`37c`, `67a` to `67c`,
`70a`/`70b`, `71a` to `71c`). The guard faults wrap the condition in `false && (...)`. The
column is the number of failing tests and the first one.

Not re-run: `manual.ts` Proof 61 (`checkIndexes` on malformed intermediate metadata) names no
fault; Proof 90 (bypassing B3) and Proof 95 (bypassing the committed-object read) have no
one-line fault that leaves the rest of the function valid.

| Fault                                 | Failing tests | First failing test                                                                              |
| ------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------- |
| `c1-arity-refusal`                    | 1             | inspect-manual refuses unknown Manual policy fields and wrong command arity                     |
| `c2-ambient-clock`                    | 3             | inspect-manual evaluated at the last instant of the deadline date (2026-10-09T23:59:59.999Z)    |
| `c3-exit-mapping`                     | 29            | inspect-manual maps a stale passing report to a failing CLI verdict                             |
| `c4-fail-exit`                        | 88            | inspect-manual refuses to run without an evaluation instant                                     |
| `m01-version`                         | 2             | inspect-manual refuses unsupported version in an intervening procedure                          |
| `m02a-scope-module-keys`              | 1             | inspect-manual refuses unknown fields in reviewed scope and report step records                 |
| `m02b-scope-keys`                     | 1             | inspect-manual refuses unknown fields in reviewed scope and report step records                 |
| `m03-disposition-keys`                | 1             | inspect-manual refuses unknown fields in committed disposition and procedure                    |
| `m04-procedure-keys`                  | 1             | inspect-manual refuses unknown fields in committed disposition and procedure                    |
| `m05-procedure-step-keys`             | 1             | inspect-manual refuses unknown fields on Manual pins and nested step records                    |
| `m06-report-keys`                     | 1             | inspect-manual refuses unknown schema version and fields                                        |
| `m07-report-step-keys`                | 1             | inspect-manual refuses unknown fields in reviewed scope and report step records                 |
| `m08-environment-keys`                | 1             | inspect-manual refuses malformed and unknown fields in every external record                    |
| `m09-review-keys`                     | 1             | inspect-manual refuses malformed and unknown fields in every external record                    |
| `m10-acceptance-keys`                 | 1             | inspect-manual refuses malformed and unknown fields in every external record                    |
| `m11-now-calendar`                    | 2             | inspect-manual refuses a malformed evaluation instant                                           |
| `m12-utc-instant`                     | 4             | inspect-manual refuses malformed timestamp with approved bytes                                  |
| `m13-utc-date`                        | 1             | inspect-manual refuses malformed deadline with approved bytes                                   |
| `m14-report-identity`                 | 1             | inspect-manual refuses report scenario with approved bytes                                      |
| `m15-run-id-blank`                    | 1             | inspect-manual refuses blank run ID with approved bytes                                         |
| `m16-report-disposition-digest`       | 1             | inspect-manual refuses report disposition digest with approved bytes                            |
| `m17-report-procedure-digest`         | 1             | inspect-manual refuses report procedure digest with approved bytes                              |
| `m18-review-scenario`                 | 1             | inspect-manual refuses review scenario with approved bytes                                      |
| `m19-review-disposition`              | 1             | inspect-manual refuses review disposition digest with approved bytes                            |
| `m20-review-procedure`                | 1             | inspect-manual refuses review procedure digest with approved bytes                              |
| `m21-review-scope`                    | 1             | inspect-manual refuses review scope with approved bytes                                         |
| `m22-review-identity`                 | 1             | inspect-manual refuses review identity with approved bytes                                      |
| `m23-operator-blank`                  | 1             | inspect-manual refuses blank operator with approved bytes                                       |
| `m24-environment-digest`              | 1             | inspect-manual refuses environment digest with approved bytes                                   |
| `m25-environment-attributes`          | 1             | inspect-manual refuses environment attributes with approved bytes                               |
| `m26-acceptance-report`               | 1             | inspect-manual refuses acceptance report digest with approved bytes                             |
| `m27-acceptance-environment`          | 1             | inspect-manual refuses acceptance environment digest with approved bytes                        |
| `m28-acceptance-run`                  | 1             | inspect-manual refuses acceptance run with approved bytes                                       |
| `m29-acceptance-operator`             | 1             | inspect-manual refuses acceptance operator with approved bytes                                  |
| `m30-acceptance-times`                | 1             | inspect-manual refuses acceptance times with approved bytes                                     |
| `m31-acceptance-identity`             | 1             | inspect-manual refuses acceptance identity with approved bytes                                  |
| `m32-run-chronology`                  | 1             | inspect-manual refuses run order with approved bytes                                            |
| `m33-acceptance-chronology`           | 1             | inspect-manual refuses acceptance order with approved bytes                                     |
| `m34-deadline-before-review`          | 1             | inspect-manual refuses deadline before review with approved bytes                               |
| `m35-step-comparison`                 | 3             | inspect-manual refuses missing step with approved bytes                                         |
| `m36-blank-observation`               | 1             | inspect-manual refuses blank observation with approved bytes                                    |
| `m37a-failed-precedence`              | 6             | inspect-manual maps an internally consistent failed run to failed verdict                       |
| `m37b-skipped-precedence`             | 2             | inspect-manual maps an internally consistent skipped run to failed verdict                      |
| `m37c-aggregate-join`                 | 4             | inspect-manual refuses inconsistent report outcome without a JSON verdict                       |
| `m38a-overdue-comparison`             | 3             | inspect-manual maps an overdue approved report to a named refusal verdict                       |
| `m38b-overdue-inclusive`              | 1             | inspect-manual evaluated at the last instant of the deadline date (2026-10-09T23:59:59.999Z)    |
| `m39-canonical-path`                  | 2             | inspect-manual refuses aliases of one external report pin                                       |
| `m40-suppress-lstat-error`            | 3             | inspect-manual refuses absent and unreadable external report separately                         |
| `m41-symlink`                         | 1             | inspect-manual refuses external symlinks and candidate path escape                              |
| `m42-nonfatal-utf8`                   | 2             | inspect-manual refuses malformed external UTF-8 and JSON                                        |
| `m43-directory-report`                | 1             | inspect-manual refuses absent and unreadable external report separately                         |
| `m44-open-wrapper`                    | 1             | inspect-manual refuses an unreadable regular report with EACCES                                 |
| `m45-regular-blob`                    | 2             | inspect-manual refuses absent committed disposition and procedure blobs                         |
| `m46-bom-stripping`                   | 1             | inspect-manual detects a pretested side edit under a BOM-prefixed module path                   |
| `m47-path-terminator`                 | 1             | inspect-manual refuses truncated Git path output on a side branch                               |
| `m48-shallow`                         | 1             | inspect-manual refuses incomplete shallow Git history                                           |
| `m49-grafts`                          | 1             | inspect-manual refuses a grafted history                                                        |
| `m50-nonancestor`                     | 1             | inspect-manual refuses a tested commit outside selected ancestry                                |
| `m51-first-parent-history`            | 6             | inspect-manual handles a pretested side branch with touched module change then revert           |
| `m52-object-preflight`                | 1             | inspect-manual refuses a missing blob from a reverted side branch                               |
| `m53-endpoints-only`                  | 21            | inspect-manual detects a module change followed by a byte-for-byte revert                       |
| `m54-parent-list`                     | 1             | inspect-manual refuses malformed Git parent output on a side branch                             |
| `m55-first-parent-merge`              | 2             | inspect-manual sees a relevant second-parent edge of a pretested side merge                     |
| `m56-parent-closure`                  | 1             | inspect-manual refuses a missing older blob on an excluded side-merge parent                    |
| `m57-retired-scenario`                | 1             | inspect-manual refuses a retired scenario in an intervening journal                             |
| `m58-historical-regular-spec`         | 1             | inspect-manual refuses a nonregular historical canonical spec                                   |
| `m59-historical-ambiguous`            | 1             | inspect-manual refuses duplicate containing historical scenarios                                |
| `m60-historical-title-join`           | 1             | inspect-manual refuses a historical journal title conflicting with its spec                     |
| `m62-missing-index-branch`            | 1             | inspect-manual refuses a touched module ID absent from tested indexes                           |
| `m63-index-own-tuple`                 | 86            | inspect-manual accepts an exact external approval chain as a noncertifying passing observation  |
| `m64-forced-mode`                     | 1             | inspect-manual marks an executable-mode change to a module member stale                         |
| `m65-module-set-equality`             | 3             | inspect-manual refuses omitted reviewed module scope                                            |
| `m66-intermediate-parse`              | 1             | inspect-manual refuses unsupported version in an intervening procedure                          |
| `m67a-intermediate-nonempty`          | 1             | inspect-manual refuses empty steps in an intervening procedure                                  |
| `m67b-intermediate-duplicate`         | 1             | inspect-manual refuses duplicate steps in an intervening procedure                              |
| `m67c-intermediate-blank-instruction` | 1             | inspect-manual refuses blank instruction in an intervening procedure                            |
| `m68-intermediate-title`              | 1             | inspect-manual refuses wrong title in an intervening procedure                                  |
| `m69-historical-title`                | 1             | inspect-manual refuses a historical scenario title outside the reviewed report                  |
| `m70a-tested-requirement-scope`       | 1             | inspect-manual refuses a reviewed requirement digest outside tested Git source                  |
| `m70b-tested-module-scope`            | 2             | inspect-manual refuses a reviewed module digest outside tested Git source                       |
| `m71a-descendant-requirement`         | 4             | inspect-manual marks changed requirement stale from the production command                      |
| `m71b-descendant-procedure`           | 3             | inspect-manual marks changed procedure stale from the production command                        |
| `m71c-descendant-modules`             | 13            | inspect-manual maps a stale passing report to a failing CLI verdict                             |
| `m72-touched-directory`               | 2             | inspect-manual handles a pretested side branch with touched module change then revert           |
| `m73-overdue-branch`                  | 3             | inspect-manual maps an overdue approved report to a named refusal verdict                       |
| `m74-failed-branch`                   | 4             | inspect-manual maps an internally consistent failed run to failed verdict                       |
| `m75-stale-branch`                    | 22            | inspect-manual maps a stale passing report to a failing CLI verdict                             |
| `m76-current-state`                   | 9             | inspect-manual accepts an exact external approval chain as a noncertifying passing observation  |
| `m77-policy-manual`                   | 1             | inspect-manual requires policy authority and exact report and disposition pins                  |
| `m78-canonical-pins`                  | 1             | inspect-manual refuses aliases of one external report pin                                       |
| `m79-duplicate-pin`                   | 1             | inspect-manual refuses duplicate policy pins and duplicate procedure steps                      |
| `m80-report-pin`                      | 1             | inspect-manual requires policy authority and exact report and disposition pins                  |
| `m81-disposition-reason-missing`      | 1             | inspect-manual names a missing or blank disposition reason                                      |
| `m82-disposition-reason-blank`        | 1             | inspect-manual names a missing or blank disposition reason                                      |
| `m83-disposition-pin`                 | 1             | inspect-manual requires policy authority and exact report and disposition pins                  |
| `m84-touched-modules`                 | 1             | inspect-manual refuses an empty or repeated touched-module set                                  |
| `m85-procedure-steps`                 | 1             | inspect-manual names a procedure with no ordered steps                                          |
| `m86-procedure-scenario`              | 2             | inspect-manual names a mismatched procedure scenario                                            |
| `m87-procedure-step-blank`            | 1             | inspect-manual refuses blank instructions and expected observations                             |
| `m88-duplicate-step`                  | 1             | inspect-manual refuses duplicate policy pins and duplicate procedure steps                      |
| `m89-policy-scenarios`                | 1             | inspect-manual requires external B3 scenarios authority                                         |
| `m91-scenario-active`                 | 2             | inspect-manual refuses an unknown scenario ID                                                   |
| `m92-scenario-title`                  | 1             | inspect-manual refuses a disposition title that differs from B3                                 |
| `m93-external-pin`                    | 1             | inspect-manual requires exact environment and approval pins                                     |
| `m94-environment-revision`            | 2             | inspect-manual refuses environment revision with approved bytes                                 |
| `m96-exact-commit`                    | 1             | inspect-manual refuses an annotated tag object SHA as the tested revision                       |
| `m97-tested-nonempty`                 | 1             | inspect-manual refuses an empty tested procedure even after the candidate repairs it            |
| `m98-tested-procedure-title`          | 1             | inspect-manual refuses a tested procedure title repaired only in the candidate                  |
| `m99-candidate-procedure`             | 1             | inspect-manual validates report steps against the tested procedure after candidate steps change |
| `m100-certifies`                      | 8             | inspect-manual accepts an exact external approval chain as a noncertifying passing observation  |
| `m101-tested-digest`                  | 1             | inspect-manual validates report steps against the tested procedure after candidate steps change |

New and changed checks, each watched failing with the fault in place and restored:

| Fault                                                                 | Observed                                                                                                                                                                                        |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `invokeCli` overlap guard removed                                     | `invokeCli refuses an overlapping call` failed: the promise resolved                                                                                                                            |
| `invokeCli` restores `process.exitCode` to Bun's initial `undefined`  | `Expected: 0`, `Received: 1`; with that bug every in-process refusal left the whole `bun test` run at exit 1 though all tests passed (`specifications.test.ts` at `6d1e9e803`: 84 pass, exit 1) |
| `invokeCli` restores a bound copy of `write`                          | identity assertion `Received: false`                                                                                                                                                            |
| `O_NONBLOCK` removed from the service's protected open                | both FIFO cases `Received: "timeout"` at 20 s                                                                                                                                                   |
| the bootstrap read through `readFileSync` instead of the bounded open | bootstrap FIFO case `Received: "timeout"` at 20 s                                                                                                                                               |
| the CLI fixture held before `runObservationCli`                       | SIGINT case `tick test watchdog expired` at 20,063 ms                                                                                                                                           |

Checks: `bunx nx run-many -t typecheck lint:fast -p twilight-burokrat --skip-nx-cache` passed;
`bunx prettier --check` on every changed file passed; `tools/tool-devsync/src/workspace-targets.test.ts`
passed 22/22. Not run: the `lint` target (whole-repository wiki lint) and the h2puni gate.

### Follow-up: CI silent stop and peak memory — 2026-10-12

CI run 38199478694 (`gate tool wiki`) stopped after `synchronous current work cannot commit after
whole-tick deadline` with no Bun summary. The next case, `transaction crossing monotonic deadline
rolls back every subject write`, holds a writer 600 ms past a 500 ms tick with a 200 ms cleanup
budget; a stall over 100 ms after the hold reaches the tick's `process.exit(124)` inside the test
runner. Raising the hold to 720 ms reproduced it locally: exit 124, output ending at the same line.
The case now gives cleanup 5 s; the 720 ms hold passes and a 300 ms hold (inside the deadline)
fails its rolled-back assertions.

Peak RSS of the serial target (`/usr/bin/time -v`, maximum over the process tree):

| Tree                                                                                                                                                                         | Peak RSS                                |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| base `c8285f9a3` (CLI spawned per case)                                                                                                                                      | 2,606,084 KB                            |
| branch before the fix (in-process, lazy GC)                                                                                                                                  | 5,586,416 KB                            |
| branch at `563835ec2`, the CI command `nx run-many -t test typecheck build -p twilight-burokrat --parallel=2` under `systemd-run --scope -p MemoryMax=6G -p MemorySwapMax=0` | 2,284,600 KB, exit 0, 2330 pass, 0 fail |

The growth was lazy collection, not retention: `relationships.test.ts` alone peaked at 3,894,420
KB and at 1,190,804 KB with a full collection after each command, in the same time. `invokeCli`
now forces that collection; `trusted-policy` went from 1,835,400 to 982,648 KB and `rules` from
1,733,880 to 1,003,940 KB.

## WBS 7774401a (batch 10, under 080) — Burokrat reads selected blobs in one batch — 2026-10-12

Decision A31: every Burokrat command read each selected blob with its own `git cat-file blob`
process, about three times per path (classification, index reading, relationship extraction or a
rule). `readSelectedBlob` (`inventory/read-blob.ts`) replaces that. The first read of a candidate's
entry list starts one `git cat-file --batch` for all of its non-Gitlink blobs, and every later
consumer of the same list shares that read. The JSDoc names the refusals.

- Each answer is parsed by the documented `<sha> <type> <size>\n<bytes>\n` framing, and its bytes
  are hashed as a Git blob and compared with the identity the selected tree or index named. The
  old artifacts fault ("changed bytes on a second read") is now `refuses batch bytes whose digest
differs from the selected index`, because there is no second read.
- `<sha> missing` refuses only reads of that blob, so a rule that never reads it is unaffected.
  Every other refusal applies to the whole selection: the reader failed, the output ended early,
  the answer named another object or type, the digest differs, or there were trailing bytes. A
  refused selection stays refused; the reader is not started again.
- `GIT_NO_REPLACE_OBJECTS=1` now applies to every candidate read. Before, `policy/trust.ts` and
  `relationships/index.ts` read without it.
- Converted: `cli.ts`, `policy/trust.ts`, `indexes/read-indexes.ts`, `indexes/root-migration.ts`
  (selected files), `relationships/index.ts`, `review/exhaustive-coverage.ts`, `rules/registry.ts`,
  `rules/specifications.ts`, `rules/kind-inventory.ts`, `rules/size-ratchet.ts`,
  `evidence/manual.ts`, `evidence/browser.ts`, `evidence/test-reports.ts` and `templates/verify.ts`.
  The template judge batches only the subject's entries.
- Single-object reads kept: the root migration's historical source blobs, which come from pinned
  revisions outside the selection. The activation controller's review-selection readers have
  their own object boundary and were not changed.

### Measurements

Workstation, 24 cores, `bun test --preload ../../../../tools/test/scratch/preload.ts` from the
project directory under `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`, with
`TOOL_WIKI_TRUSTED_NODE_MODULES` set as the target sets it. Base: `21a6bd537`.

| Measure                                                                                   | Base                  | Branch                                     |
| ----------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------ |
| `pilot-policy.test.ts`, whole file                                                        | 478.6 s (load 5)      | 159.6 s (load 13 to 33), 188.3 s (load 35) |
| `pins exact pre-index tuples …` under `strace -f -e execve`: wall                         | 224.9 s               | 16.6 s                                     |
| same: `git` executions                                                                    | 22,744                | 52                                         |
| same: `git cat-file` executions (one `check-indexes` and one `lint-local` over this repo) | 22,694 (1 batch)      | 2 (both `--batch`)                         |
| `nx run twilight-burokrat:test --skip-nx-cache`                                           | 976 s (lane 352d2d65) | 702.0 s; 928.7 s with `TMPDIR=/var/tmp`    |

The earlier lane's strace counted 16,936 `cat-file blob` processes for the `lint-local` alone; the
rest of the base count is `check-indexes`. The repository has 5,673 tracked files (72.6 MB), and
one batch over all of them takes 0.33 s. The CI `gate tool wiki` step runs the same target through
`nx run-many -t test typecheck build`; its time is in the PR's run.

### Proofs

Each fault was applied alone and restored. Reader faults ran against `read-blob.test.ts`.

| Fault                                                               | Failing tests                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| header newline check disabled                                       | `refuses a batch that ends inside a header or before the announced size`                                                                                                                                                     |
| answered-identity check disabled                                    | `refuses a batch answer that names another object`                                                                                                                                                                           |
| object-type check disabled                                          | `refuses a batch header that names another object type`                                                                                                                                                                      |
| announced-size check disabled                                       | `refuses a batch that ends inside a header or before the announced size`                                                                                                                                                     |
| digest binding disabled                                             | `refuses batch bytes whose digest differs from the selected object identity`; artifacts CLI `refuses batch bytes whose digest differs from the selected index` (received the allowlisted-schema refusal instead)             |
| trailing-bytes check disabled                                       | `refuses output the batch did not ask for`                                                                                                                                                                                   |
| exit-status check disabled                                          | `refuses a reader that exits early and does not start a second one`                                                                                                                                                          |
| selection not memoized                                              | `reads every selected blob … in a single cat-file batch`; the early-exit case (two readers started)                                                                                                                          |
| refused selection not rethrown                                      | six refusal cases in `read-blob.test.ts`                                                                                                                                                                                     |
| not-in-selection check disabled                                     | `refuses a blob that is not part of the selected candidate`                                                                                                                                                                  |
| missing-object check disabled                                       | `refuses a missing object for its own path and still serves the others`                                                                                                                                                      |
| the shared view returned instead of a copy                          | `hands each caller its own copy of the selected bytes`                                                                                                                                                                       |
| `GIT_NO_REPLACE_OBJECTS` removed                                    | `production check ignores local Git replacement objects for a selected journal blob`; `inspect-manual ignores Git replacement objects for module indexes` (`batch read digest differs from the index … at source/README.md`) |
| `cannot read selected index` context removed from `read-indexes.ts` | `[TEST-AXES-051] … retain distinct refusals`; both reader-fault cases in `indexes.test.ts`                                                                                                                                   |

Checks: `nx run twilight-burokrat:typecheck` and `lint:fast` (`--skip-nx-cache`) passed; the target
passed `2341 pass, 0 fail` twice, once with `TMPDIR=/var/tmp`. Not run: the whole-repository
`twilight-burokrat:lint` target (it needs an activation root and reports inactive without one)
and the h2puni gate.

### Round 13 pointed-row interaction surface reconciliation — 2026-10-13

PR #380 head `214dc6c863b0b529ce7befe78d4f700dfc6d9570` failed CI run `38312181300`, pixel shard 3/4 job `115020412527`, at the offscreen premise before hovering. The downloaded log `/tmp/round13-pixel-job.log` and artifact `/tmp/round13-pixel-artifact/` show row 210 wholly below the table (top 513.75, table bottom 501), with visible chart bar y927.04–944.96 and point (260,936). Every bar nevertheless reported `exactHit: false`: the renderer now places a sibling transparent `[data-gantt-hit]` above the painted `[data-gantt-bar]`. The former is the pointer target; it cannot have the latter as an ancestor. This is a deterministic test oracle mismatch.

Both stale exact-hit selectors were reproduced against that exact head in the isolated `.worktrees/round13-pixel-triage` checkout. `CI=1 E2E_PORT_SHIFT=3900 bunx playwright test --config apps/wbs/fe-01/playwright.config.ts pointed-row-offscreen.spec.ts` exited 1 at the absent offscreen hit premise (`/tmp/round13-pixel-red.log`). The same command selecting `hover-cards.spec.ts --grep 'pointing a visible paired row neither'` exited 1 at the covered-target assertion (`/tmp/round13-visible-red.log`). Searching every E2E `elementFromPoint`/`elementsFromPoint` use found exactly these two stale painted-bar ancestor checks.

The test-only correction pairs the hit surface with the painted bar by exact slice ID, intersects both boxes with the panel and viewport, then requires browser `elementFromPoint` to identify that exact paired surface. The existing offscreen row, minimum table height, linked scroll alignment, unchanged focus and scroll positions, no native scroll request, no navigation and exact row highlighting assertions are retained. The two focused cases passed 2/2 in 18.5s with `--grep 'pointing a visible'` across both files (`/tmp/round13-pixel-green.log`), still selecting offscreen row 210 at (260,936).

R5 production-path negative: temporarily changing the forecast hit rect from `pointerEvents="fill"` to `pointerEvents="none"` made both corrected tests fail at their exact-hit premise, 2 failed, exit 1 (`/tmp/round13-pixel-fault.log`). The production file was restored with `cmp` equality against `/tmp/round13-gantt-panel-original.tsx`; its Git diff is empty. Adjacent `Proof:` comments record the observed failures.

Pixel shard 4/4 job `115020412672` separately failed seven Steps cases because `getByLabel('New step')` matched the textbox and the new workday/minute radio labels. Its log is `/tmp/round13-pixel-job4.log`. The same broad locator also existed in the folded-budget layout scenario. The selectors now explicitly choose `getByRole('textbox', { name: 'New step', exact: true })`. The Steps opener was reproduced red (`/tmp/round13-steps-red.log`), then all seven Steps cases passed in 17.7s (`/tmp/round13-steps-green.log`). The folded-budget scenario independently reproduced the same strict-mode red (`/tmp/round13-layout-red.log`), then passed (`/tmp/round13-layout-green.log`). These checks reused only this worktree's already-owned 7000/7100/8100 stack with `E2E_PORT_SHIFT=3900`, separate output directories and the line reporter; their provenance is the same source/build as the concurrent shard 3 run. All five broad New step locators in frontend E2E were corrected; unit radio names are preserved.

Additional production DOM dependency negatives used disposable copies of the same tests, removed afterwards. Removing `[data-gantt-hit]` attributes made both paths throw their absent paired-surface errors (`/tmp/round13-missing-hit.log`, 2 failed, exit 1). Translating every production hit surface 1000 SVG units made the offscreen premise fail and the visible case refuse its empty bar/hit intersection (`/tmp/round13-disjoint-hit-owned.log`, 2 failed, exit 1). Adjacent proof comments record both checks. The translation fault ran with its own `CI=1 E2E_PORT_SHIFT=4400` stack.

The complete affected shard 3 command `CI=1 E2E_PORT_SHIFT=3900 bunx playwright test --config apps/wbs/fe-01/playwright.config.ts --shard=3/4` passed 91/91 in 4.6m (`/tmp/round13-pixel-shard3.log`). An attempted concurrent shard 4 and first displacement-negative run reused that stack; they were stopped when shard 3 finished and its owned servers exited. The interrupted shard 4 had 19 passed and 73 did not run (`/tmp/round13-pixel-shard4.log`); neither incomplete run is acceptance evidence. Both were restarted with dedicated server ownership.

After every injected fault was removed, the two original hover tests passed again, 2/2 in 13.0s (`/tmp/round13-final-focused.log`). `bunx tsc -p apps/wbs/fe-01/tsconfig.json --noEmit`, changed-file Prettier and `git diff --check` passed. Direct changed-file ESLint exited 0 but explicitly skipped `@nx/enforce-module-boundaries` because no cached ProjectGraph was available; that rule remains for the coordinator's canonical gate. No standalone `openspec` executable was available on this local PATH, so standalone OpenSpec validation was not run. The coordinator owns `bin/h2puni-gate.sh <integrated-sha>` and its OpenSpec validation after integration.

The dedicated fourth-shard command `CI=1 E2E_PORT_SHIFT=4400 bunx playwright test --config apps/wbs/fe-01/playwright.config.ts --shard=4/4 --output=/tmp/round13-shard4-owned-results --reporter=line` exited 0: 76 passed, 39 skipped in 5.0m (`/tmp/round13-pixel-shard4-owned.log`). Those 39 suite-declared skips were not executed. All seven formerly failing Steps cases passed in this complete shard. Full pixel shards 1/4 and 2/4 were not rerun locally; the changed folded-budget case and the changed visible-pair case from those shards were run separately as recorded above.

### Task 2.2a.3 bounded committed source inventory — 2026-10-13

Added `inspect-spec-sources <repository> <committed-sha>` after allocating `TEST-AXES-054`–`056`
through the production scenario allocator. It shares `rules/spec-sources.ts`'s immutable active
blob reader and `rules/spec-parser.ts`'s Markdown parser with the production selector. The new
observation includes the committed revision, complete candidate identity, sorted input path/byte
digests, canonical requirements, all operations, scenarios, explicit rename endpoints and raw
fragment identities. The digest binds the complete payload, including `certifies:false`.
Raw rename pair identity preserves indentation and line endings separately from semantic
endpoint identity. No source classification, synchronization or archive was performed. Tasks
2.2 and 2.2a, source holds and certification remain open.

Initial RED: `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/spec-sources.test.ts`
failed all eight initial cases because the command was absent (`/tmp/spec-inventory-red.log`).
GREEN plus shared selector regression: the focused inventory and specifications files passed
97 tests, zero failures, 1282 assertions (`/tmp/spec-inventory-regression.log`). Thirteen inventory
cases cover every group together, conflicting renames, selector refusal, committed versus staged
bytes, archive exclusion, raw fragments, canonical enumeration, full-payload digest and separate
missing/unreadable dependency faults, malformed source/rename/UTF-8, absent inventory,
nonregular blobs, staged-reader injection, symbolic revision and CLI arity.

Each production mutation below was applied alone, watched fail and restored. Adjacent `Proof:`
comments identify the injected fault and observed test; logs are
`/tmp/spec-inventory-fault-<fault>.log`.

| Fault                                                        | Observed failing scenario assertion                          |
| ------------------------------------------------------------ | ------------------------------------------------------------ |
| `full-sha` guard removed                                     | `TEST-AXES-056` symbolic revision lost named refusal         |
| `committed-kind` guard removed                               | `TEST-AXES-056` staged-reader fault lost named refusal       |
| `empty-inventory` guard removed                              | `TEST-AXES-056` absent inventory exited zero                 |
| `input-order` source sort removed                            | `TEST-AXES-055` reversed reader changed complete observation |
| `payload-digest` hashed revision alone                       | `TEST-AXES-055` independent full-payload digest differed     |
| `certifies` promoted to true                                 | `TEST-AXES-055` exact noncertifying marker differed          |
| `revision` and `candidate` independently replaced with zeros | `TEST-AXES-055` exact identities differed                    |
| `committed-bytes` reader replaced with staged selection      | `TEST-AXES-055` committed observation refused                |
| `regular-blob` guard removed                                 | `TEST-AXES-056` committed symlink source lost refusal        |
| `utf8` decoding made nonfatal                                | `TEST-AXES-056` invalid bytes lost named UTF-8 refusal       |
| `archive-exclusion` regex broadened to archive paths         | `TEST-AXES-055` malformed archived source was parsed         |
| `selected-reader` substituted valid fixed bytes              | Both `TEST-AXES-056` missing/unreadable faults were bypassed |
| `raw-rename-fragment` hashed semantic endpoints              | `TEST-AXES-055` CRLF/indentation raw digest differed         |
| `arity` guard removed                                        | `TEST-AXES-056` extra argument exited zero                   |

Whole-tree diagnostic on committed `54328f32a40ba86ba39c9a30e0f593e4c6fdd0f3` exited zero and
reported 274 active source inputs, 96 canonical requirements and 994 overlay operations,
`certifies:false`, candidate identity
`6b5fe91448dc7bf3fd9bf10188aebf0d966fa66cece28bbda4bfd640dd41afa7`, and observation digest
`5fd429dd90591e6e01776a0247ece720f875e629c91562c6a80d50942215dbde`
(`/tmp/spec-inventory-base-observation.json`). Running the production selector on those same
shared committed inputs exited one with `competing overlay operation: wbs-domain: A leaf's
status folds its progress, hold, readiness and predecessors`
(`/tmp/spec-inventory-base-selector.log`). Inventory visibility supplies no accepted predecessor
classification and does not weaken that refusal.

The first install attempt hit the sandbox's read-only temporary/cache directory; rerunning
`BUN_TMPDIR=/tmp bun install --frozen-lockfile --cache-dir /tmp/puni-inventory-bun-cache`
exited zero. Focused Nx typecheck passed. The initial source lint found two import order errors;
autofix corrected them before final validation. Standalone `openspec` is absent on local PATH,
so its validation was not run locally. The coordinator owns the canonical h2puni gate and
OpenSpec validation after integration; no raw full Nx gate, deployment or merge to the release
branch was performed.

After restoring every fault and correcting imports, the same focused files again passed 97/97
with 1282 assertions (`/tmp/spec-inventory-tests-final.log`).
`NX_DAEMON=false bunx nx run twilight-burokrat:lint:fast --skip-nx-cache` and
`NX_DAEMON=false bunx nx run twilight-burokrat:typecheck --skip-nx-cache` both exited zero
(`/tmp/spec-inventory-lint-final.log`, `/tmp/spec-inventory-typecheck-final.log`). Nx reported
its sandbox socket denial and ran plugins in the main process; both targets completed.
Changed-file Prettier and `git diff --check` passed. Full Burokrat test/build, whole-repository
lint, CI and the canonical h2puni gate were not run locally.

### Task 4.1b.1 review acceptance — 2026-10-13

Astra reviewed committed fallback `743e0a5` and found no P1/P2 issues in the bounded
`inspect-test-sources` diagnostic. Its adapter blob
`6eb15333aa8ae0364efd027b6c3142a6f4fa5f88` and test blob
`25174f3803c540b85ce36a28612c523831e8ad92` byte-match coordinator-gated `403a0462`;
the evidence, index, inventory and CLI paths also match. The coordinator reported that the
exact `403a0462` gate exited zero. A local `git rev-parse` comparison independently confirmed
both named adapter/test blob identities before this acceptance note was written.

This accepts Task 4.1b.1's source-owner/provenance diagnostic only. The reviewer did not rerun
tests or mutations, and historical RED evidence does not establish that every negative was
test-first. Complete level classification, broader ledgers and admission remain open. No source
hold, Task 2.2a work, selector refusal or noncertifying boundary was changed by this acceptance.

## 2026-10-13 — cancellation fixture readiness race

PR #380 workspace job `115045539439`, source `a478c109d`, failed the cancellation
fixture at `expect(ready).toBe(true)` after its 60-second readiness wait. The CI
log retained no supervisor diagnostic, so the precise cause of that invocation
cannot be recovered. The coordinator reported that the same source passed this
suite in the host gate and passed the workspace gate through stacked PR #387.

The focused unchanged cancellation test passed locally in 2.68s. Its readiness
probe actively bound each service port while production preflight independently
required those ports to be free. Injecting a 1000ms scheduling pause between the
probe's successful bind and close reproduced the CI assertion failure in 60.27s;
the retained supervisor diagnostic was `Performance shifted port 9100 is occupied`
with `EADDRINUSE` from production `assertShiftedPortsFree`. A 100ms pause passed.
This proves a scheduling-dependent self-collision, though the original CI run's
missing diagnostic prevents attributing that particular failure conclusively.

Readiness now observes HTTP 200 from each fixture service, retries only connection
refusal, and surfaces early supervisor failure. The post-cancellation bind checks
still prove the shifted ports are free. The corrected cancellation test passed in
2.92s and passed in 4.69s with the same 1000ms pause before the observer returned.
A separately injected foreign listener on 10200 produced the named production
occupied-port refusal in 241ms instead of obscuring it behind the 60-second wait.
All injected faults were removed.

Validation:

- `bun test --preload ./tools/test/scratch/preload.ts --timeout=30000 tools/tool-devsync/src/performance-level.test.ts tools/tool-devsync/src/performance-supervisor-test.test.ts --test-name-pattern 'a cancelled supervisor|occupied shifted port|failed service readiness|drains a full stderr|bounds a'`: 18 passed, 51 filtered, 0 failed, 59.54s.
- `NX_DAEMON=false bunx nx run tool-devsync:lint:fast`: passed in 9.0s, including the module-boundary rule. Earlier direct ESLint lacked a cached graph; the Nx run resolved that limitation.
- `bunx tsc --build --force tools/tool-devsync/tsconfig.json`: passed.
- Changed-file Prettier and `git diff --check`: passed.

Port-binding tests required sandbox escalation because sandboxed listeners fail
with `Failed to listen at ::`. No full Nx suite, canonical host gate, full
Performance test file, or standalone OpenSpec validation was run for this
isolated test-only patch; the coordinator owns the integrated revision's gate.

### PR #380 pixel shard 1 target reconciliation — 2026-10-13

Investigated exact head `a478c109d13233ffb61df874adf90c23fc583e75` in an isolated
worktree. CI run `38319854625`, job `115045505553`, artifact `11778373875`
(SHA256 `ecf2bda22a057912e651abc715b0ad71f7c6d0267bcb649933cb8886a242e81c`)
contains the arrow paint-probe failure and eight pointer-action timeouts. Every
timeout trace names the transparent paired `[data-gantt-hit]` as intercepting
a gesture aimed at `[data-gantt-bar]`. The arrow probe likewise found that
transparent surface. Local focused replay reproduced both failures; WebSocket
EPIPE messages also occur during successful runs and do not explain these traces.

Browser gestures now use the paired pointer surface; keyboard and rectangle
checks retain the painted bar. The synchronous arrow paint probe temporarily
ignores only transparent hit surfaces and restores their pointer attributes in
`finally`, retaining SVG clipping and every painted mark.

The corrected touch gesture exposed a production defect: full-screen capture
recognized only the painted bar, so a second tap on its hit surface dismissed
the facts before the click could navigate. The guard now recognizes either
representation's slice ID. This restores the existing deliberate-second-tap
specification without changing hit geometry, attempt marks or retry budgets.

Sequential checks from the isolated workspace (`CI=1 E2E_PORT_SHIFT=7400
BUN_TMPDIR=/tmp` for browser commands):

- `bun install --frozen-lockfile --offline`: exit 0.
- `bun run e2e -- --grep 'opens facts first in full screen'` before the guard
  fix: exit 1, expected full-screen count 0, received 1
  (`/tmp/pr380-pixel1-touch-red.log`). Reverting the guard after the clean green
  replay reproduced the same failure (`/tmp/pr380-pixel1-touch-mutation.log`);
  the fix was restored before the full shard.
- Focused arrow, navigation, phone, surface-placement and touch replay: 18 passed,
  exit 0 (`/tmp/pr380-pixel1-focused-clean.log`).
- `bun run e2e -- --shard=1/4`: 120 passed, 1 declared skip, exit 0, 9m56s
  (`/tmp/pr380-pixel1-shard1.log`). This includes all original CI failures,
  all six pointed-row cases, native-minute ticks, attempt mark paint, translated
  hits, collision choice, malformed native-minute refusal and missing-zone
  forecast retention. `dragging up moves the boundary up` remains the suite-declared skip.
- Gantt panel view tests filtered to touch/tap/two-minute/collision/pointer
  surface behavior: 22 passed, 277 excluded by the filter, exit 0
  (`/tmp/pr380-pixel1-view.log`).
- Scoped ESLint and Prettier, app and e2e TypeScript checks: exit 0.

The paint and pointer mutation proofs use disposable copies of the real browser
cases. Removing the production SVG's left viewBox padding makes the arrow probe
find the row-label button. Setting the paired production target's pointer events
to `none` makes row navigation reject the intercepted click. Adjacent `Proof:`
comments identify these faults. The sequential clean proof run exited 1 with both expected failures in 23s
(`/tmp/pr380-pixel1-mutations-clean.log`). Disposable cases were removed afterwards.

The first exploratory browser runs overlapped the default Playwright output
directory and produced artifact-close ENOENT errors; they are excluded from the
passing evidence above. The authoritative affected replay, guard reversion and
full shard are sequential. Browser shards 2–4, the full view suite and the host
release gate were not run in this repair; the coordinator owns the combined
release head and its gate.

## Task 4.1b.2 — immutable Performance publication inspection (2026-10-13)

Base: exact merged main `0ea6a1166242edf694294d1ed6e715fb7e1aed60`, independent `/tmp/puni-performance-inspector` checkout. Scenario IDs TEST-AXES-057 through TEST-AXES-060 were allocated through the existing production `scenario allocate` command and applied from its proposed journal/spec output; provenance validation returned `{"unidentified":[]}`.

The command reads the current Performance pointer and exact immutable bundle, committed declaration/config/fixture blobs and external RulePolicy. It recomputes discovery/run/evidence/report byte digests, independently decodes both raw reports through the shared collector parser, reconciles collected cases and normalized measured evidence, evaluates reviewed thresholds and checks exact normalized JUnit structure/cases/outcomes/counts. It refuses retained failure diagnostics and rereads the pointer. Every emitted claim, including authentication absent and `certifies:false`, enters the observation digest. Historical checkout spellings are used only for path normalization and are never read. The collector imports the same portable parser from shared test-evidence; its tool-local module is only a compatibility re-export for existing regressions.

### RED/GREEN and boundary coverage

Initial exact production-command fixture and negative suite were written before inspector implementation: the focused run refused module resolution because the inspector was absent (0 pass, 1 fail, 1 module error). Subsequent RED slices observed real inspector behavior: the unknown-manifest-field negative failed before strict manifest membership was added (100 pass, 1 fail), and a passing publication with retained cleanup-failure diagnostics returned an observation before the failure-diagnostic check was added (0 pass, 1 fail in its focused run). An updated-digest XML report claiming ISO-8859-1 encoding was also accepted before the UTF-8 declaration guard; its focused production test observed RED (0 pass, 1 fail). All were restored to GREEN after implementation.

Production fixtures cover committed-versus-staged config identity; exact manifest and pointer fields; all four artifact digests and paths; missing, unreadable, symlinked and nonregular pointer/bundle files; fatal UTF-8 and malformed JSON/XML; absent and symlinked committed sources; foreign raw configs/projects/versions; fixture traversal and historical-root containment; missing/duplicate/extra raw and evidence cases; measurement conflicts and attachment transport; policy/selection conflicts and changed committed thresholds; coherent failed/skipped/breached executions; JUnit identities, outcomes, structure, doctypes, text and counts; pointer changes; and independent complete-payload digest/noncertification assertions. The passing historical-root fixture points to a nonexistent checkout, proving inspection does not require historical filesystem access.

### Watched production-path guard probes

Each row records a production guard condition disabled in the real source, its focused test run with a named failing assertion and exit 1, followed by byte restoration. The suite was run GREEN again after restoration. No production bypass is shipped.

| Guard                                                                                           | Injected fault                | Observed production test                                                                           | Observation                    |
| ----------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------ |
| `throw new Error(`Performance ${label} is malformed`);`                                         | Disable responsible condition | `[TEST-AXES-058] refuses nonrecord pointer`                                                        | Exit 1; named assertion failed |
| `throw new Error(`Performance evidence contains a symlink: ${path}`);`                          | Disable responsible condition | `[TEST-AXES-058] refuses symlink manifest.json`                                                    | Exit 1; named assertion failed |
| `throw new Error(`Performance evidence is not a regular file: ${path}`);`                       | Disable responsible condition | `[TEST-AXES-058] refuses nonregular manifest.json`                                                 | Exit 1; named assertion failed |
| `throw new Error(`Performance candidate source is not a regular blob: ${path}`);`               | Disable responsible condition | `[TEST-AXES-058] refuses absent committed config even with working replacement`                    | Exit 1; named assertion failed |
| `throw new Error('Performance JUnit structure contains unexpected text');`                      | Disable responsible condition | `[TEST-AXES-059] refuses JUnit unexpected text`                                                    | Exit 1; named assertion failed |
| `throw new Error('Performance JUnit structure has foreign suite');`                             | Disable responsible condition | `[TEST-AXES-059] refuses JUnit foreign root`                                                       | Exit 1; named assertion failed |
| `throw new Error('Performance JUnit counts are malformed');`                                    | Disable responsible condition | `[TEST-AXES-059] refuses JUnit malformed counts`                                                   | Exit 1; named assertion failed |
| `throw new Error('Performance JUnit cases are malformed');`                                     | Disable responsible condition | `[TEST-AXES-059] refuses JUnit foreign classname`                                                  | Exit 1; named assertion failed |
| `throw new Error('Performance JUnit cases differ from execution');`                             | Disable responsible condition | `[TEST-AXES-059] refuses JUnit case identity despite updated digest`                               | Exit 1; named assertion failed |
| `throw new Error('Performance JUnit counts differ from execution');`                            | Disable responsible condition | `[TEST-AXES-059] refuses JUnit counts despite updated digest`                                      | Exit 1; named assertion failed |
| `throw new Error('Performance inspection requires a full committed SHA');`                      | Disable responsible condition | `[TEST-AXES-058] requires a full committed SHA`                                                    | Exit 1; named assertion failed |
| `throw new Error('Performance inspection needs policy.performance');`                           | Disable responsible condition | `[TEST-AXES-058] refuses absent external Performance authority`                                    | Exit 1; named assertion failed |
| `throw new Error('Performance pointer identity differs');`                                      | Disable responsible condition | `[TEST-AXES-058] refuses pointer path escape and symlinked bundle`                                 | Exit 1; named assertion failed |
| `throw new Error('Performance manifest identity differs from committed selection and policy');` | Disable responsible condition | `[TEST-AXES-058] refuses foreign manifest revision`                                                | Exit 1; named assertion failed |
| `throw new Error(`Performance ${field} digest or path differs`);`                               | Disable responsible condition | `[TEST-AXES-058] recomputes discovery artifact digest`                                             | Exit 1; named assertion failed |
| `throw new Error('Performance evidence identity differs');`                                     | Disable responsible condition | `[TEST-AXES-059] refuses evidence candidate conflict`                                              | Exit 1; named assertion failed |
| `throw new Error('Performance manifest selection differs from evidence');`                      | Disable responsible condition | `[TEST-AXES-059] refuses conflicting selection`                                                    | Exit 1; named assertion failed |
| `throw new Error('Performance raw config differs from declaration');`                           | Disable responsible condition | `[TEST-AXES-058] refuses foreign discovery config`                                                 | Exit 1; named assertion failed |
| `throw new Error('Performance raw checkout is malformed');`                                     | Disable responsible condition | `[TEST-AXES-058] refuses malformed historical checkout relative`                                   | Exit 1; named assertion failed |
| `throw new Error('Performance raw config changed');`                                            | Disable responsible condition | `[TEST-AXES-059] refuses raw foreign config despite updated digest`                                | Exit 1; named assertion failed |
| `throw new Error('Performance discovery and execution selection differ');`                      | Disable responsible condition | `[TEST-AXES-059] refuses raw foreign runner version despite updated digest`                        | Exit 1; named assertion failed |
| `throw new Error('Performance manifest collected cases are malformed');`                        | Disable responsible condition | `[TEST-AXES-059] refuses nonarray collected cases`                                                 | Exit 1; named assertion failed |
| `throw new Error('Performance manifest collected cases differ from raw discovery');`            | Disable responsible condition | `[TEST-AXES-059] refuses collected case mismatch`                                                  | Exit 1; named assertion failed |
| `throw new Error('Performance raw execution evidence differs');`                                | Disable responsible condition | `[TEST-AXES-059] refuses raw failed status despite updated digest`                                 | Exit 1; named assertion failed |
| `throw new Error('Performance committed selection differs from evidence');`                     | Disable responsible condition | `[TEST-AXES-059] refuses selection jointly forged in policy and evidence against committed config` | Exit 1; named assertion failed |
| `throw new Error('Performance current-success publication contains unsuccessful cases');`       | Disable responsible condition | `[TEST-AXES-059] success pointer refuses coherent failed execution`                                | Exit 1; named assertion failed |
| `throw new Error('Performance current pointer changed during inspection');`                     | Disable responsible condition | `[TEST-AXES-060] refuses current pointer race`                                                     | Exit 1; named assertion failed |

Additional probes: nonfatal UTF-8 decoding failed the malformed discovery/run/evidence/pointer/manifest/report UTF-8 assertions; raw SyntaxError rethrow failed the malformed pointer/manifest JSON assertions; removed doctype rejection failed the JUnit doctype assertion; omitted complete observation payload failed the independent payload-digest assertion; changed authentication or certifies markers failed stable-publication assertions; removed CLI arity refusal failed the extra-operand CLI assertion; removed retained-failure check failed its current-success negative; accepted EACCES as diagnostic absence failed the real unreadable-bundle CLI assertion; removed canonical base64 equality accepted an updated-digest noncanonical attachment and failed its assertion; removed historical fixture containment changed the distant-root refusal to undeclared-case and failed its boundary assertion. Each exited 1 and was restored before final validation.

The XML postcondition `counts === undefined` survived removal because strict Saxes parsing plus the root callback already guarantees it. It was removed rather than presented as a breakable safety check. The first short outside-root fixture also failed at the later normalized-path check when containment was removed; a longer outside root was added to expose the actual containment boundary, then its guard removal produced the expected failed assertion. An attempted builtin-filesystem mock was replaced with a real chmod-based unreadable-bundle CLI fixture; final tests use the real filesystem.

### Scoped validation

Commands run with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_NATIVE_COMMAND_RUNNER=false` for Nx to avoid sandbox socket denial. Initial bare Nx commands could not create plugin sockets; those outputs were not treated as successful checks. Frozen dependencies were installed into the isolated checkout with `BUN_TMPDIR=/tmp BUN_INSTALL_CACHE_DIR=/tmp/puni-performance-bun-cache bun install --frozen-lockfile`. OpenSpec 1.13.0 was fetched into the temporary Bun cache because no bare/repository OpenSpec CLI was available.

A broad Bun directory filter collected emitted `dist/out-tsc` test copies after typecheck and one emitted-copy build failed because its neighboring source `.ts` did not exist. The corrected final suite uses exact `./` source test paths, excluding emitted copies. This did not require a production change.

Final command outcomes are recorded below before the local commit. The coordinator owns the canonical host gate, exact-head architecture review, CI and WBS integration. No Performance target was rerun; no Docker, deployment, certification, lineage synchronization, archive, remote push or PR mutation was performed. Tasks 2.1, 2.2 and 4.1 and WBS 080.39 remain open/noncertifying.

| Final local check                                                                                                                                                                                                                                                                                | Fresh observation                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test ./apps/twilight-structure/twilight-burokrat/cli/src/evidence/performance-bundle.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/evidence/performance.test.ts ./tools/tool-devsync/src/performance-playwright.test.ts ./libs/shared/domain/test-evidence/src/index.test.ts` | Exit 0; 158 pass, 0 fail, 411 assertions across 4 source files.                                                                                                                                                                    |
| `bunx nx run twilight-burokrat:lint:source`                                                                                                                                                                                                                                                      | Exit 0; source lint passed.                                                                                                                                                                                                        |
| `bunx nx run-many -t lint --projects=shared-test-evidence,tool-devsync`                                                                                                                                                                                                                          | Exit 0; both projects passed (one shared lint task cache hit following its earlier successful uncached execution). Initial tool lint found import sorting in the rewired collector; autofix corrected it before the passing rerun. |
| `bunx nx run-many -t typecheck --projects=twilight-burokrat,shared-test-evidence,tool-devsync`                                                                                                                                                                                                   | Exit 0; all 3 projects passed (one shared task cache hit following its earlier successful uncached execution).                                                                                                                     |
| `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.13.0 validate --all --json`                                                                                                                                                                                                                    | Exit 0; 186 items passed, 0 failed (168 changes, 18 specifications).                                                                                                                                                               |
| `bun .../cli.ts scenario validate . openspec/changes/test-axes/specs/test-axes/spec.md`                                                                                                                                                                                                          | Exit 0; `{"unidentified":[]}`.                                                                                                                                                                                                     |
| `wc -w openspec/changes/test-axes/proposal.md`                                                                                                                                                                                                                                                   | 400 words, within the intent cap.                                                                                                                                                                                                  |
| `git diff --check`                                                                                                                                                                                                                                                                               | Exit 0; no whitespace errors.                                                                                                                                                                                                      |

The isolated clone has no installed Git hook scripts (only sample hooks); no hook bypass flag was used. Full host gate/build, CI, secrets scan and integration review are reserved for the coordinator and remain unverified here. The scoped checks establish local implementation readiness only.

### Exact-head review correction — JUnit CDATA (2026-10-13)

Astra review of `72f2476614d4655b4f3a95aa45b49b837e784d81` reproduced a semantic bypass: Saxes emits CDATA through its `cdata` event, independently of `text`. A report containing suite-level `<![CDATA[foreign]]>` with its artifact digest recomputed was accepted by production `inspect-performance`, although equivalent plain text refused. A new production CLI regression first observed RED (exit 0 where exit 1 was required; 0 pass, 1 fail). The reader now sends both character-content events through the same existing permitted-text check. GREEN: 1 pass, 0 fail. R5 proof: removed only the new `cdata` listener and reran that regression; it again failed because the production CLI exited 0. Restored the listener before final validation. The adjacent `Proof:` comment names this injected fault and observation. This restores the specified strict normalized JUnit contract without changing publication or runner behavior.

Final correction validation: the four exact source suites passed 159 tests with 414 assertions and zero failures; uncached `twilight-burokrat:lint:source` and uncached typecheck for twilight-burokrat/shared-test-evidence/tool-devsync exited 0; OpenSpec `validate --all --json` passed 186 items with zero failures; changed-file Prettier and `git diff --check` exited 0. No runner, remote mutation or host gate was performed by this worker.

### 4.1b.3 Performance source ownership diagnostic — 2026-10-13

Implemented in an isolated clone from `db78a3244fa74fdc34e0e89317bbb261457d712d`. The production `inspect-performance-sources` CLI composes the real current-success Performance publication inspector and `checkIndexes` on one committed candidate, with exact nested owner and source tuple joins. The output binds case judgment, publication and index identities, sorted review debt, absent authentication, false certification and unresolved level. It grants no tested-module, coverage or admission credit. The real allocator issued TEST-AXES-061 through TEST-AXES-066 and updated the scenario journal.

The first production CLI test failed with `unknown command: inspect-performance-sources` before implementation, then passed. Focused production CLI tests covered the nested owner and exact committed mode/digest; missing committed ownership despite a working repair; unsuccessful, missing, malformed and unreadable publication state; invalid policy and duplicate committed module identity; symbolic SHA and extra operands; injected mismatched revision/candidate, absent source tuple, ambiguous owners and noncommitted reader selection; full-payload digest sensitivity and case/debt order invariance. A faulted upstream source tuple was used only to prove the internal join invariant. An upstream current-success failure remained a refusal with no partial JSON.

Watched mutations and their observed production CLI failures: disabling full-SHA refusal failed the symbolic-revision assertion; disabling selected-kind refusal failed the staged-reader assertion; disabling either publication identity comparison failed its named mismatch assertion; disabling source-tuple refusal failed its named assertion; disabling unique-owner refusal failed the two-owner assertion; disabling CLI arity refusal failed the extra-operand assertion. Replacing selected source digest or the complete observation hash failed the exact binding/digest assertion. Reversing case or review-debt normalization failed the canonical-order assertion. Each mutation was restored before final checks.

Final scoped checks: `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/performance-sources.test.ts --timeout=60000` passed 16/16 with 72 assertions. `bunx nx run twilight-burokrat:typecheck`, focused ESLint, pinned `@fission-ai/openspec@1.12.0 validate test-axes --strict`, Prettier check and `git diff --check` all exited 0. Production scenario provenance validation returned `{"unidentified":[]}`. The canonical h2puni gate, full Burokrat suite, trusted receipt and WBS certification were not run by this worker; coordinator owns integration and the host gate. Tasks 2.1, 2.2 and 4.1 stay open.

#### Astra P2 proof corrections — 2026-10-13

The original unowned fixture omitted a committed index target, so `checkIndexes` refused before the source-owner guard. The corrected production CLI fixture commits a regular Performance source at the candidate root, outside two valid nested indexes, and commits a separate declared nested member. `checkIndexes` returns two indexes; the diagnostic then refuses with `Performance source has no unique validated index owner: case.perf.spec.ts` and no JSON. Disabling the owner-count guard made the same named test fail: it received `undefined is not an object (evaluating 'owner.moduleId')` instead of the required refusal. The restored guard passed.

The debt-order test now asserts the exact ascending paths `['a','z']`, in addition to equality under reversed input. Reversing the production comparator made that assertion fail; restoring it passed. These corrections close the two R5 proof gaps identified in review. The final focused production CLI suite passed 17/17 with 77 assertions. Focused Nx typecheck, ESLint, Prettier, strict OpenSpec validation and `git diff --check` exited 0. No host gate, publication or certification is claimed by this worker.

#### Installed command dispatch correction — 2026-10-13

Astra's release-path review found that `bin.ts` did not register `inspect-performance-sources`, although source `cli.ts` did. The package executable therefore rejected the advertised command before its bundled validator ran. The already documented `inspect-spec-sources` had the same dispatch omission and was registered in this correction. The package help now lists both commands; the README documents the Performance source diagnostic's noncertifying scope.

RED: a test built the actual package executable and toolkit with `buildPackage`, invoked `inspect-performance-sources` through `dist/bin.mjs`, and expected the bundled validator's named usage refusal. It instead received `unknown command: inspect-performance-sources` from `bin.ts`. GREEN: after registration, the built executable reached the validator's named usage refusals for both source diagnostics and displayed both in `--help`. Removing either `validatorCommands` registration independently made the packaged dispatch test fail its named assertion; both mutations were restored. The previous source-CLI tests alone did not exercise this installed entrypoint. Final focused packaged and source CLI tests passed 18/18 with 86 assertions. Focused Nx typecheck, ESLint, Prettier, strict OpenSpec validation and `git diff --check` exited 0. The stale `35f7a7e` gate waiter was cancelled before checkout; no certification or WBS completion follows from this dispatch fix.

#### Exact requested SHA correction — 2026-10-13

Astra's Manual-adapter review exposed an analogous Performance source defect: a real annotated tag-object SHA passed the full-hex syntax check, and `readCandidate` peeled it to a commit. The new production CLI regression first failed because `inspect-performance-sources` emitted success JSON and exited zero. The command now requires the selected revision to equal the requested SHA before publication inspection. GREEN: the annotated-tag test refuses with the named mismatch and no JSON. Disabling only this equality guard made the named production test fail again; it was restored. This correction is scoped to the new Performance source command. Similar exact-SHA questions in preexisting diagnostics require separate review rather than an unbounded shared-reader contract change.

Final focused Performance source and installed dispatch suites passed 19/19 with 90 assertions using the established 60-second timeout. An initial run under Bun's default five-second timeout expired during the existing multi-fault digest test; the rerun passed. Uncached Burokrat typecheck, focused ESLint, strict OpenSpec validation and scenario provenance validation passed. Changed-file Prettier and `git diff --check` passed after formatting this note. No canonical host gate is claimed for the corrected SHA.

### 4.1b.4 Manual observation adapter — 2026-10-13

Initially implemented on an isolated branch stacked at PR #406 exact `699c2571053b49ea21efb4191e94ad7455313464`, then rebased onto its exact-SHA correction `b8006559572846bf4fe81280f24624c630c00e29` for separate review. The real allocator issued TEST-AXES-067 through TEST-AXES-072 and updated the journal. The production `inspect-manual-observation` command wraps the complete real `inspectManual` result, exact committed candidate identity and canonical caller instant with absent authentication, false certification and a full-envelope digest. It preserves current, stale, failed and overdue JSON judgments; only current exits zero. External evidence and B3 refusals remain refusals with no JSON. Installed package dispatch and help include the command.

RED: the first focused production CLI run failed all seven initial adapter assertions at `unknown command: inspect-manual-observation`. GREEN: the completed focused adapter suite passed 11/11. The full existing Manual plus installed dispatch source suites passed 153/153, 435 assertions, zero failures.

R5 watched faults, each restored after the named production test failed: accepted symbolic SHA; disabled staged-selection refusal; disabled inspector-revision join; shifted the inspector instant one millisecond across the deadline; bypassed the inspector (missing report/B3 cases failed); dropped a nested `selectedProcedureDigest`; hashed only schema version; disabled noncurrent exit mapping; disabled extra-operand refusal; removed installed `bin.ts` registration; changed authentication to present; and changed certification to true. The production tests also independently compare selected candidate identity, complete nested Manual result and complete-payload digest, and show staged source changes do not affect the selected commit.

Scoped checks: exact Manual and installed dispatch source tests passed 153/153; uncached `twilight-burokrat:typecheck` passed; strict OpenSpec validation passed; scenario provenance validation returned `{"unidentified":[]}`. Focused ESLint initially found only import order in the new Manual test import; `eslint --fix` corrected it. Final ESLint, Prettier, diff check and test rerun are recorded with the local commit. The canonical h2puni gate, full level classification, trusted receipts, coverage and admission remain outside this worker slice. Tasks 2.1, 2.2 and 4.1 stay open.

#### Exact requested SHA review correction — 2026-10-13

Astra found that an annotated tag object's 40-hex SHA passed syntax validation; `readCandidate` peeled it to a different commit, and the adapter emitted current JSON with exit zero. A production CLI regression using a real annotated tag object first failed because the command exited zero. The adapter now requires the selected commit revision to equal the supplied SHA before inspecting Manual evidence. GREEN: the targeted test passed and emitted a named refusal with no JSON. R5: replacing this equality guard with `if (false)` made the named test fail again at the exit-status assertion; the guard was restored. The new check prevents the tag object from masquerading as the requested commit while preserving the existing symbolic, staged and inspector revision refusals.

#### Rebased branch verification — 2026-10-13

The Manual branch was rebased onto the reviewed Performance source correction `b8006559572846bf4fe81280f24624c630c00e29`; both exact-SHA refusal records were retained. The combined exact source suites for Manual, Performance sources and installed dispatch passed 172/172 with 520 assertions under the established 60-second timeout. Uncached `twilight-burokrat:typecheck`, focused ESLint, changed-file Prettier, strict OpenSpec validation, scenario provenance validation (`{"unidentified":[]}`) and `git diff --check` passed. This rebased branch has not been pushed or run through the canonical host gate; it awaits a separate exact-head architecture review. Tasks 2.1, 2.2 and 4.1 remain open.

#### Canonical gate correction — exiting `/proc` stat ESRCH (2026-10-14)

The canonical h2puni gate on PR #410 exact `7971ea562f0b7a660f633d3699b2a6edfad8e4ff` exposed an exit race: a numeric `/proc` entry remained in the inventory while its process vanished during `readFileSync(stat)`, which raised ESRCH. The identity reader modeled ENOENT alone and consequently refused otherwise converged cleanup. This correction restores TEST-AXES-039: only ENOENT and ESRCH at the identity read boundary mean disappearance. Other read errors and malformed identities still refuse; ownership, pidfd signaling, ancestry and cleanup bounds are unchanged.

The deterministic preload arms after the real owner-spawned wrapper has exited and its stat is absent. One enumeration retains that known exited PID, and one matching stat read throws ESRCH. The production `createPerformanceProcessOwner` → `spawn` → `stop` regression asserts the injection fired, cleanup completed within eight seconds, the TERM-resistant separate-session adopted child was reaped, the exited wrapper stayed absent, the unrelated baseline child stayed alive, and pidfd count returned to baseline.

RED against the exact old production source: the focused regression exited 1, with 0 pass / 1 fail and `Performance cannot read /proc identity` caused by the injected ESRCH (`/tmp/puni-esrch-red.log`). GREEN after the minimal disjunct: exit 0, 1 pass / 0 fail (`/tmp/puni-esrch-green.log`). R5 watched mutation: removed only the ESRCH disjunct; the same regression again exited 1 with 0 pass / 1 fail (`/tmp/puni-esrch-mutation-red.log`). Restored it before final checks; the adjacent `Proof:` comment names the injected fault and observed refusal. Added production constructor-path EIO and malformed-stat refusal tests. Removing the existing absent/invalid start-time parser terms made the malformed-stat test fail (exit 1, 0 pass / 1 fail, `/tmp/puni-esrch-malformed-mutation-red.log`); restored them without changing that parser contract.

Scoped verification ran in isolated `/tmp/puni-esrch-410`, based exactly on the gate SHA. Frozen Bun installation passed after explicitly selecting writable `BUN_TMPDIR=/tmp`; the first install attempt failed EROFS. The initial sandbox process suite passed 25 tests and failed two existing listener tests because local `Bun.serve` listen returned EPERM (confirmed directly); this was not treated as a product failure or success. With approved local listener access the complete process suite passed 27/27, including existing EACCES, pidfd capability/open/signal failures, direct/owned PID reuse, signal identity, ancestry and bounded reaping tests. Uncached `tool-devsync:lint` and `tool-devsync:typecheck` passed. The first lint run identified unsafe array typing in the new test preload; precise `unknown[]` typing corrected it before the passing rerun.

OpenSpec 1.13.0 download failed DNS resolution. The already installed pinned OpenSpec 1.12.0 executable ran `validate --all --json` successfully: 187 items passed, 0 failed (169 changes, 18 specifications), recorded in `/tmp/puni-esrch-openspec-cached.log`. Final restored-state `bun test ./tools/tool-devsync/src/performance-processes.test.ts --timeout=30000` passed 27/27, 137 assertions, zero failures (`/tmp/puni-esrch-process-suite-final.log`). Uncached Nx logs are `/tmp/puni-esrch-lint-final.log` and `/tmp/puni-esrch-typecheck-final.log`. Changed-file Prettier and `git diff --check` exited 0 before committing this candidate (`/tmp/puni-esrch-format-final.log`). The coordinator owns exact-head architecture review, restacking, push and the canonical h2puni gate; no full host gate, full workspace build, CI, WBS certification, deployment or publication is claimed by this worker. Tasks 2.1, 2.2 and 4.1 remain open.

### 4.1b.5 Adjacent exact requested SHA boundaries — 2026-10-13

Implemented on a new isolated branch from reviewed Manual PR #410 exact `7971ea562f0b7a660f633d3699b2a6edfad8e4ff`. The production allocator issued TEST-AXES-073 through TEST-AXES-076. `readCandidate` intentionally peels `${revision}^{commit}`, so full-hex annotated tag objects can select a different commit. Four existing diagnostics now compare the requested SHA to the selected commit immediately after the committed read. Performance inspection also requires a committed selection before comparing identities. The generic candidate reader, Browser and legacy Manual inspectors were not changed.

RED production CLI tests used four real, valid committed fixtures with annotated tag objects. `inspect-spec-sources`, `inspect-test-reports` and `inspect-test-sources` each emitted success JSON with exit zero for a tag-object SHA; their new refusal assertions failed. `inspect-performance` refused later at its manifest-identity check rather than naming the requested/selected mismatch, so its named-refusal assertion failed. A test-only staged-reader fault likewise reached that later manifest check without the required committed-kind refusal. GREEN: all five targeted tests emitted the responsible named refusal with exit one and no JSON.

R5 watched faults: replacing each of the four requested/selected comparisons with `if (false)` separately failed its named annotated-tag production test (one failed test in each targeted run). Replacing the Performance committed-kind check with `if (false)` failed its named staged-reader production test. Every guard was restored before final checks. This preserves upstream failures while preventing a tag object from masquerading as a commit.

The four exact owning source suites passed 172/172 tests with 464 assertions; the dependent Performance source, Manual and installed-dispatch suites passed 172/172 with 520 assertions, both with a 60-second per-test timeout. Uncached `twilight-burokrat:typecheck`, focused ESLint, strict OpenSpec validation and scenario provenance validation (`{"unidentified":[]}`) passed. Changed-file Prettier and `git diff --check` are recorded with the local commit. The canonical host gate, CI, push and certification remain outside this worker slice. Tasks 2.1, 2.2 and 4.1 stay open.

# Proposed 4.1b.6 authority/facts boundary — 2026-10-13

Design-only checkpoint on a new isolated branch from reviewed #412 SHA
`9d2f7e3c61cf78c903a6f65841c1fdd08d886d92`. No production code, scenario IDs,
classification or public facts CLI has been added. The pure classifier's bare empty sets and
devsync's working-tree runner checks cannot establish reviewed absence or immutable authority.
The proposed first scope is one Performance publication's committed fixture set with explicit
external authority pins and reviewed-empty semantics. Four authority/completeness questions in
`design.md` require Astra review before a precise delta spec and production TDD fixtures can be
written. Task 4.1b.6 remains open; Tasks 2.1/2.2/4.1 and existing noncertifying status remain
unchanged. `bunx @fission-ai/openspec@1.12.0 validate test-axes --strict` passed, and changed-file
Prettier completed. No production or R5 checks apply to this design-only checkpoint.

## 4.1b.6a external facts authority — 2026-10-13

After Astra reviewed the design checkpoint, the scope was split: 4.1b.6a implements one
Performance declaration's strict external authority and committed facts; 4.1b.6b retains the
Conformance command and Architecture policy adapters. The production allocator proposed and
issued TEST-AXES-077 through TEST-AXES-080; its proposed journal preserved every prior event
as an exact prefix. The CLI's unknown-command RED failed all three initial production tests.
The committed Conformance-target contradiction test and array-valued manifest test each failed
on a success observation before its guard fix. Other boundary tests were added after the minimal
implementation and watched fail under the injected guard-off faults below. The installed package
test failed on missing help/dispatch before
registration and passed afterward. The diagnostic emits no level, coverage or certification.

R5 guard-off probes were run against the production CLI test file with one fault at a time, then
restored. Each targeted test exited 1 for a changed named refusal or an unexpected success;
logs are `/tmp/puni-level-facts-r5-{symbolic-sha,tag-object,candidate-pin,manifest-path,unique-fixtures,outside-scope,conflicting-source,regular-blob,pin-digest,conformance-empty,declaration-config,complete-fixtures,unsupported-conformance,unsupported-architecture,digest-completeness,authentication,certification,manual-only,unknown-key,arity,installed-registration}.log`. The installed-registration fault was run against the packaged executable test. These logs were inspected for assertion failures rather than parse/compiler errors. The selected-blob deletion and working-tree replacement case remained a named refusal; the sentinel config and fixture source would throw if candidate JavaScript executed.

Fresh scoped checks after restoring every fault: owning facts and installed-dispatch suites
14/14 tests, 85 assertions; uncached `twilight-burokrat:typecheck` and `lint:fast` passed.
`scenario validate` returned `{"unidentified":[]}` and strict OpenSpec validation passed.
Changed-file Prettier, `git diff --check` and normal Lefthook hooks are recorded with the
commit. No host gate, push, publication authenticity or coverage certification is claimed.

Dependent Performance-source/judge suites initially hit Bun's default five-second timeout in
one existing digest test during the combined run (38 passed, 1 timed out). Re-running the same
two suites with `--timeout 60000` passed 39/39 tests and 251 assertions. The timeout was a
harness deadline, not an assertion failure; the longer run is the scoped regression evidence.

## 4.1b.6a UTF-8 and JSON R5 review repair — 2026-10-13

An otherwise valid pinned committed project manifest had one `0xff` byte inside its `name`
JSON string. The fixture recomputed the manifest digest, committed revision and candidate pin.
The real `inspect-level-facts` CLI exited 1 with empty stdout and named `project manifest is
not UTF-8`. Removing only `fatal:true` from `TextDecoder` made that same test fail because the
CLI emitted success JSON with exit zero; raw fault log:
`/tmp/puni-level-facts-r5-utf8-fatal.log`. Replacing the neighboring `JSON.parse` with an empty
record made the malformed external authority test fail its named JSON-refusal assertion on a
later schema error; raw fault log: `/tmp/puni-level-facts-r5-json-malformed.log`. Both faults
were restored. Adjacent `Proof:` comments now name the injected faults and observed failures.
After restoration, the owning facts suite passed 14/14 tests with 71 assertions. Uncached
typecheck, focused ESLint, changed-file Prettier, `git diff --check` and strict OpenSpec
validation passed. Normal Lefthook hooks run on the repair commit.

## 4.1b.6b.1 committed Conformance membership — 2026-10-14

Worker source is isolated `/tmp/puni-conformance-facts-sol`, based on exact draft #414 commit
`ba9b90e9b8221aacee6759cee7fb38767524b34d`. This increment implements committed Conformance
membership only. The external version-1 authority pins the same manifest path and digest as
scope; only `test:conformance` is parsed. Exact command-selected regular Git blobs form the
complete source set, including files outside the Performance scope; only the sorted fixture
intersection appears in the committed membership's `files`. Shared fixtures appear once in
source tuples, and an empty committed intersection remains explicit. Manual stays reviewed-empty,
committed Architecture still refuses, authentication stays absent and certification stays false.

The production allocator command
`bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts scenario allocate . openspec/changes/test-axes/specs/test-axes/spec.md`
issued TEST-AXES-081 through TEST-AXES-083. Before applying its proposed spec and journal,
the entire old journal event sequence was checked equal to the new journal prefix. Proposal:
`/tmp/puni-conformance-allocation.json`. No IDs were assigned by hand.

Initial production CLI tests failed against the unsupported adapter: 13 passed and seven
failed with the old unsupported-Conformance refusal or changed named pin expectation, recorded
in `/tmp/puni-conformance-red.log`. After implementation the facts suite passed 20/20 with
201 assertions. Adding the SQLite acceptance test first produced a separate RED at its
success assertion, `/tmp/puni-conformance-sqlite-red.log`; the exact reviewed tuple amendment
then passed. Tests load the actual store-memory and store-sqlite `test:conformance` manifests,
copy their exact target envelopes into committed fixture candidates, and inspect them through
the production CLI. Candidate config/test sentinels throw if executed. Working replacements
cannot repair selected sources. Packaged accepted-path coverage builds the package to scratch
and invokes `dist/bin.mjs inspect-level-facts` with a committed overlap candidate.

Architecture review found SQLite's real third input
`{workspaceRoot}/apps/wbs/be-01/drizzle`, used by its migration fixtures. The exact three-entry
tuple is allowed only at project root/cwd `libs/wbs/adapters/store-sqlite`; the generic exact
two-entry tuple remains allowed. Inputs are dependency metadata and add no test sources.
Wrong paths, order, extra entries, object inputs and the third tuple at other roots refuse.
No task dependency, configuration or environment override is accepted.

R5 watched faults each caused a named production assertion failure, then source was restored:
removing pin path/digest comparisons; widening executor/cache/inputs/forwarding schemas;
removing target/options closed-key constraints, required target shape, cwd comparison or
SQLite root restriction; disabling command grammar, removing its true end constraint or
allowing duplicate selectors; omitting complete selected-source reads; removing overlap
deduplication, returning the entire selection instead of its intersection, or removing
membership sorting. Logs are `/tmp/puni-conformance-r5-{pin-path,pin-digest,target-executor,target-cache,target-inputs,target-forward,target-options-keys,target-keys,target-cwd,target-required,command,command-end,sqlite-root,duplicates,complete-sources,source-dedup,intersection,order}.log`.
The dedicated `/tmp/puni-conformance-r5-newline.log` watched removal of the true end constraint
make a newline-suffixed command exit zero, failing its required-refusal assertion. Selected
outside-intersection missing and symlinked files and deletion of their committed blob each
refused despite working repairs. Existing regular-blob and selected-reader guards are reused.

An initial redundant match-length guard was removed after its guard-off fault escaped: Bun
1.4.2's `new RegExp('^a$').exec('a\\n')` returned null. The final grammar uses a true end
constraint with the separate watched newline proof above. This escaped preliminary mutation
is not counted as a proof. Mutation logs were inspected for assertion failures rather than
compiler or parse failures.

Focused final validation: source facts plus installed-dispatch suites passed 26/26 with
269 assertions (`/tmp/puni-conformance-final-tests.log`); uncached
`NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-conformance-nx bunx nx run twilight-burokrat:typecheck --skip-nx-cache`
exited zero, as did changed-source ESLint, changed-file Prettier,
`openspec@1.12.0 validate test-axes --strict --json` (one valid change, zero issues),
scenario provenance validation and `git diff --check`. Initial lint/typecheck reported test-helper typing/import issues, fixed
before the final runs; one scenario validation invocation omitted the required spec operand
and printed usage, then the full invocation returned `{"unidentified":[]}`. The coordinator owns the
canonical host gate, CI and publishing; none is claimed by this worker. Parent 4.1b.6,
Architecture extraction and Tasks 2.1/2.2/4.1 remain open. No classification, source sync,
archive, authentication or coverage credit is produced.

### Astra correction: Bun filters are not explicit file operands

Astra rejected local candidate `16a94b863508cb50cb97abfd1dd74566bd6113af` before publication:
its bare `src/...test.ts` operands are Bun path filters, so treating them as complete literal
selection can omit nested matching files. The prior scoped success and mutation receipts
above prove the earlier checks only; they did not establish Bun's selector semantics.

A bounded disposable runtime probe on Bun 1.4.2 created `src/foo.test.ts` and
`nested/src/foo.test.ts`, each with a distinct passing title. Running
`bun test src/foo.test.ts --timeout=1000` executed both files (two tests), while
`bun test ./src/foo.test.ts --timeout=1000` executed only the literal file (one test).
Receipt: `/tmp/puni-conformance-bun-selector-probe.log`. The [Bun test runner documentation](https://bun.com/docs/test)
also distinguishes positional filters from explicit `./` or absolute file operands.

Before production changes, new production CLI tests committed a literal file and a nested
matching decoy: the bare-filter refusal assertion failed on exit zero, and the explicit-file
acceptance assertion failed on exit one (`/tmp/puni-conformance-filter-red.log`). The devsync
canonical identity test first failed because it returned `./src/...` rather than `src/...`
(`/tmp/puni-conformance-devsync-red.log`). The final grammar requires exactly one leading
`./` on every file operand and strips only that prefix when binding regular selected Git
blobs. Bare filters, repeated prefixes and unsafe paths refuse. Both real Memory and SQLite
`test:conformance` commands now use explicit `./src/testing/...` operands. Devsync's existing
command-membership reader normalizes the same syntactic prefix, and its manifest discovery
oracle pins the changed commands. No other target was changed.

Watched correction faults were restored after observation:

- Restoring bare-filter parsing together with its old literal binding made the nested-decoy
  production CLI refusal fail on successful incomplete facts:
  `/tmp/puni-conformance-r5-bare-filter.log`.
- Removing adapter prefix normalization made explicit-file inspection fail at selected-source
  lookup: `/tmp/puni-conformance-r5-explicit-prefix.log`.
- Removing devsync prefix normalization made the real
  `bun tools/tool-devsync/src/verify-test-levels-cli.ts` exit one naming
  `wbs-store-sqlite:test aggregate members differ from declaration`:
  `/tmp/puni-conformance-r5-devsync-prefix.log`. Restored production verification printed
  `Verified declared test collections` and exited zero.

The corrected source facts, installed executable dispatch, devsync level and workspace-target
suites passed 142/142 with 675 assertions across four files
(`/tmp/puni-conformance-explicit-final-tests.log`). Uncached Nx `typecheck` passed for
`twilight-burokrat` and `tool-devsync`; changed-source ESLint passed; strict pinned OpenSpec
1.12.0 validation returned one valid change and zero issues; scenario validation returned
`{"unidentified":[]}`. The actual updated uncached Nx `wbs-store-memory:test:conformance`
and `wbs-store-sqlite:test:conformance` targets each ran 73 tests with zero failures, in
4.0 and 35.5 seconds respectively (`/tmp/puni-conformance-explicit-{memory,sqlite}.log`).
These focused target runs remain operational and noncertifying. Final changed-file format
and diff checks precede the correction commit. The coordinator owns final parent restacking,
exact-head review, host gate and publishing; no push or host gate was performed here.

### WBS 080.39 — 4.1b.6b.2 committed Architecture facts (2026-10-14)

Base: `d4bbcd051173ff758c8b314ac1d82164b2c6507e`, isolated `/tmp/puni-architecture-facts` clone. Production `scenario allocate . openspec/changes/test-axes/specs/test-axes/spec.md` issued TEST-AXES-084..086; the proposed journal's prior event prefix was compared equal before applying its spec and journal. The existing fourteen-rule policy remains unchanged.

Initial production CLI RED: five new cases failed, zero passed, ten assertions. Committed Architecture lost the expected successful observation, pin/policy/source/discovery refusals received the old unsupported-source refusal, and reviewed-empty with a committed policy incorrectly exited zero. Initial implementation GREEN: five passed, zero failed, 76 assertions. Additional regressions cover three-way Performance/Conformance/Architecture overlap, canonical unique complete source tuples, explicit disjoint membership, all fourteen actual policy mappings, selected policy and mapped-source failures despite working repairs, source and packaged CLI dispatch, and runner validation/error order. Candidate fixture/config bodies throw if executed.

The adapter binds exactly `<projectRoot>/src/architecture-fixtures.json`, its digest and every mapped selected regular readable blob, then intersects with the complete Performance fixture scope. Git leaf paths are reduced to immediate child names before the shared unmapped check; a suffix-looking directory with descendants refuses, ordinary nested decoys are ignored. Reviewed-empty refuses a selected fixed policy (including descendants at that path) or a present `test:architecture:level`. Membership is policy-declared. The existing runner still passes bare Bun filters; this slice makes no complete execution-collection claim.

Watched faults were restored after each independent production test run; every listed mutation exited 1 with failed assertions:

| Injected fault                                                                             | Observed production test failure                                                                     |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Remove fixed policy-path comparison or digest comparison                                   | TEST-AXES-085 loses the named pin refusal or emits success for changed digest                        |
| Disable fatal UTF-8 decoding                                                               | TEST-AXES-085 loses the named UTF-8 refusal                                                          |
| Replace closed policy parse with trust cast; remove nonempty guard                         | TEST-AXES-085 loses schema refusal or the named no-cases refusal                                     |
| Remove architecture suffix, exact relation, registry or duplicate checks separately        | TEST-AXES-085 loses the specific mapping refusal or accepts duplicate mapping                        |
| Read mapped sources only inside Performance intersection                                   | TEST-AXES-085 accepts incomplete disjoint source selection; TEST-AXES-084 loses complete tuples      |
| Discover whole remaining Git paths instead of immediate child names; remove unmapped guard | TEST-AXES-086 accepts an unmapped suffix directory or fixture                                        |
| Remove policy-presence or target-presence contradiction checks separately                  | TEST-AXES-086 accepts the corresponding reviewed-empty contradiction                                 |
| Remove Architecture intersection, sort or source deduplication separately                  | TEST-AXES-084 changes disjoint membership, reverses overlap order or duplicates shared source tuples |
| Change authentication marker or certification marker                                       | TEST-AXES-084 source/package assertions reject the promoted observation                              |
| Execute candidate config bytes with Function                                               | TEST-AXES-084 source/package commands refuse instead of producing facts                              |
| Replace JSON decoding with an empty record                                                 | TEST-AXES-084..086 lose expected facts or named refusals                                             |
| Remove runner stale-report clearing                                                        | TEST-AXES-086 retains stale report after refusal                                                     |
| Validate all mappings before their IO                                                      | TEST-AXES-086 reports later unknown rule instead of earlier missing fixture                          |
| Discover architecture directory before policy decoding                                     | TEST-AXES-086 reports directory error instead of malformed policy                                    |
| Read policy before report directory creation                                               | TEST-AXES-086 reports missing policy instead of report-path EEXIST                                   |

Commands on restored code:

- `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/level-facts.test.ts apps/twilight-structure/twilight-burokrat/cli/src/architecture-level.test.ts`: final result recorded below; includes two real package builds and CLI invocations.
- `bunx tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json`: exit 0, no diagnostics.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx show project twilight-burokrat --json`: exit 0, generated current graph. Changed-file ESLint rerun then exited 0 without diagnostics. The earlier direct ESLint run had skipped `@nx/enforce-module-boundaries` because no ProjectGraph existed; that earlier run did not verify boundaries.
- Production `scenario validate`: exit 0, `{"unidentified":[]}`.
- Pinned OpenSpec 1.12.0 `validate test-axes --strict --json`: exit 0, one valid change, zero issues.
- Scoped Prettier and `git diff --check`: exit 0.

No host-wide gate, real Architecture target execution, publication collection, full source classification, coverage credit, authenticated receipt, admission, sync or archive is claimed. The coordinator owns exact-SHA host gate after independent review; Tasks 2.1/2.2/4.1 remain open.

Final restored-code suite: exit 0, **49 pass, 0 fail, 433 assertions across two files**, 22.69 s. Packaged Conformance and Architecture dispatch both passed. Evidence logs: `/tmp/architecture-final-tests.log`, `/tmp/architecture-mutations.log`, `/tmp/architecture-order-mutations.log`, and the individual `/tmp/architecture-mutation-<fault>.log` files. The first runner precedence assertion expected ENOTDIR; actual Bun mkdir returned EEXIST, so the test was corrected against baseline before rerunning the watched order faults. All final order faults failed their intended assertions on that corrected baseline.

Astra review follow-up (2026-10-14): added the missing production-path negative for the reviewed-empty policy-directory subcondition. TEST-AXES-086 commits `apps/example/src/architecture-fixtures.json/child.json` with no policy file and no Architecture target. Baseline CLI exits 1, emits no JSON and names the Architecture reviewed-empty contradiction. Removing only `entry.path.startsWith(`${policyPath}/`)` then makes that case fail at `expect(exitCode).toBe(1)` with actual exit 0; the mutation log is `/tmp/architecture-mutation-empty-policy-directory.log`. The subcondition was restored and its adjacent Proof comment records the observed failure. No runtime behavior changed.

Follow-up restored-code validation: affected level-facts/runner suites exit 0, **50 pass, 0 fail, 436 assertions**; scoped TypeScript build, changed-file ESLint with current ProjectGraph, strict OpenSpec validation (one valid change, zero issues), scoped Prettier check and `git diff --check` each exit 0. Host gate remains pending coordinator review.

### WBS 080.39 — 4.1b.7 Performance level joins (2026-10-14)

Base: exact `40538f3132d2d941fc0633a8a5021504a36d88b3`, isolated `/tmp/puni-performance-levels` worktree on `performance-levels`. Production `scenario allocate . openspec/changes/test-axes/specs/test-axes/spec.md` issued TEST-AXES-087..090; the proposed journal's existing event prefix was compared equal before applying the proposed spec and journal. Intent, delta specification, design and the ordered task were recorded before implementation.

Initial production CLI RED: 18 tests failed, zero passed, 51 assertions, because the command did not exist. Initial GREEN: 18 passed, zero failed, 93 assertions. Expanded TDD exposed missing comparisons for publication selection config digest, complete authority fixture scope and coherent config/project substitutions in both inspector outputs; those cases exited zero before their joins were added. Packaged wrong-level dispatch preserves the existing launcher summary `Twilight Burokrat validator exited 1`; the test was corrected to that existing contract. A five-subprocess fault test exceeded Bun's default five-second test timeout, so its explicit test budget is 20 seconds; no production timeout changed.

`inspect-performance-levels` consumes the real `inspectLevelFacts` and `inspectPerformanceBundle`; caller JSON is not accepted. It rereads the selected declaration, joins its raw pin, decodes it through the shared decoder and separately compares semantic declaration identity. The pretty-printed committed declaration in the fixture proves raw and semantic digests differ. It joins requested revision, complete candidate, declaration/config/project, both publication config digests, exact declared and recorded cases and fixture scope, and selected fixture path/mode/byte tuples. Only Manual/Conformance/Architecture/Performance rows are supplied to the extracted shared classifier; the Manual set is backed by the real facts contract's explicit reviewed-empty authority. No later-row facts are invented. Source-owner v1 output remains unchanged.

Conformance and Architecture overlaps remain valid facts. The resulting first-match levels yield typed `wrong-level` isolation JSON and exit 1; isolated Performance yields typed `isolated` JSON and exit 0. Both bind both upstream digests, absent authentication, false certification and a complete own payload digest. Throwing candidate fixture/config bodies prove inspection does not execute candidate source. Source and packaged success/wrong-level paths are exercised.

R5 audit: initial independent removal of the local third-snapshot kind or revision comparison did not fail a test, because the complete candidate hash already binds the entire selection. Those duplicate subconditions were removed, with coordinator agreement. The retained full-snapshot identity comparison alone rejects staged, changed-revision and changed-untracked snapshots; it was watched failing when removed. Upstream inspectors retain their exact requested-SHA refusals. After this simplification, all 37 retained primary mutations failed their intended production assertions. Seven additional boundary mutations failed separately, including both selected-entry branches and both case-sort operations. Every mutation was restored before final validation.

| Injected fault                                                                                                    | Observed production assertion failure                                                                                               |
| ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Remove revision or candidate joins                                                                                | TEST-AXES-088 accepts a changed real inspector observation                                                                          |
| Remove declaration/config path or project joins                                                                   | TEST-AXES-088 emits JSON for the corresponding foreign selection                                                                    |
| Remove either publication config digest comparison independently                                                  | TEST-AXES-088 accepts the changed public or selection digest                                                                        |
| Remove complete third-snapshot identity comparison                                                                | TEST-AXES-088 accepts a staged, changed-revision or changed-untracked reader snapshot                                               |
| Remove declaration entry absence or nonregular mode subconditions separately                                      | TEST-AXES-088 loses its named refusal to TypeError, or accepts the injected nonregular entry                                        |
| Remove raw declaration pin comparison                                                                             | TEST-AXES-088 accepts a changed raw byte digest                                                                                     |
| Remove selected declaration config or project comparisons                                                         | TEST-AXES-088 accepts coherent substitutions in both real inspector dependencies                                                    |
| Remove semantic declaration digest comparison                                                                     | TEST-AXES-088 accepts a changed normalized declaration identity                                                                     |
| Disable fatal UTF-8, bypass JSON parsing while retaining fatal decoding, or bypass the shared declaration decoder | TEST-AXES-088's third-reader fault with matching raw pin loses each respective encoding/JSON/schema refusal                         |
| Remove exact recorded-case, Performance membership or authority fixture-scope comparisons separately              | TEST-AXES-088 accepts missing, extra, duplicate or substituted collection/scope or loses the named collection refusal               |
| Remove source tuple comparison                                                                                    | TEST-AXES-088 accepts missing/duplicate tuples, changed modes or changed content identities                                         |
| Remove either case sort, recorded source sort, fixture sort or fixture deduplication                              | TEST-AXES-087 refuses equivalent enumerations, changes canonical bindings or duplicates a shared fixture                            |
| Remove Conformance or Architecture rows; put Architecture before Conformance                                      | TEST-AXES-089 changes classified levels or falsely exits zero for higher-row collection                                             |
| Remove Performance row or its recorded Playwright membership check                                                | TEST-AXES-087 loses complete classification; TEST-AXES-088 accepts the broken classifier dependency's missing Playwright membership |
| Remove undefined-classification refusal                                                                           | TEST-AXES-088 emits JSON with an unresolved fixture                                                                                 |
| Force isolated status or remove CLI wrong-level exit mapping                                                      | TEST-AXES-089 exits zero for typed wrong-level collection                                                                           |
| Remove CLI arity check or installed registration                                                                  | TEST-AXES-090 accepts extra operands or rejects valid packaged dispatch                                                             |
| Replace either upstream digest, hash an empty own payload, promote authentication or certification                | TEST-AXES-087 fails its real upstream identity, independent complete-payload digest or nonpromotion assertions                      |
| Execute selected candidate config bytes with Function                                                             | TEST-AXES-087 refuses instead of emitting facts because the candidate sentinel throws                                               |

Mutation evidence: `/tmp/performance-levels-final-mutations.log` (37 failed variants), `/tmp/performance-levels-boundary-mutations.log` (7 failed variants), and individual `/tmp/performance-levels-mutation-<fault>.log` files. The discarded duplicate-check audit is retained in `/tmp/performance-levels-mutations.log` and is not claimed as successful proof.

Scoped restored-code validation commands:

- `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/performance-levels.test.ts apps/twilight-structure/twilight-burokrat/cli/src/evidence/level-facts.test.ts apps/twilight-structure/twilight-burokrat/cli/src/evidence/performance-bundle.test.ts apps/twilight-structure/twilight-burokrat/cli/src/evidence/performance-sources.test.ts libs/shared/domain/test-levels/src/index.test.ts --timeout=60000`: final result below; includes dependent v1 source-owner regressions and packaged dispatch.
- `bunx tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json libs/shared/domain/test-levels/tsconfig.json`: exit 0, no diagnostics.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx show project twilight-burokrat --json`: exit 0, current graph generated. Changed-file ESLint validates module boundaries with this graph; final result below. An earlier lint run found unused copied fixture imports, import ordering and a numeric template expression; those were corrected before final checks.
- Production `scenario validate`: exit 0, `{"unidentified":[]}`.
- Pinned OpenSpec 1.12.0 `validate test-axes --strict --json`: exit 0, one valid change, zero issues.
- Scoped Prettier and `git diff --check`: final result below.

No host-wide gate or real target execution is claimed. These are synthetic publications inspected through real production readers, with no independently authenticated receipt, coverage, admission, sync or archive. The coordinator owns exact-SHA host gate after independent Astra review. Tasks 2.1/2.2a/2.2/4.1 remain open.

Final restored-code result: **215 pass, 0 fail, 819 assertions across five files**, exit 0 in 83.49 s (`/tmp/performance-levels-final-tests.log`). Both source and packaged isolation results passed; source-owner v1 regressions passed. Scoped typecheck and changed-file ESLint exited 0 without diagnostics, including module-boundary checks using the current graph. Strict OpenSpec and scenario provenance validation passed as above; final scoped format and staged whitespace checks exited 0. No host gate or push was performed by the implementation worker.

Astra metadata follow-up (2026-10-14): declared the exact consumer `apps/twilight-structure/twilight-burokrat/cli/src/evidence/performance-levels.ts` in both shared test-evidence and test-levels README externalConsumers. Production `check-indexes working . HEAD` exited 0 with zero review debt, and its returned consumer sets include the new path for both modules. Targeted `pilot-policy.test.ts --test-name-pattern 'on-disk bootstrap policy' --timeout=60000` exited 0: five pass, zero fail, 25 assertions. Both README Prettier checks and strict OpenSpec validation passed. No safety check or runtime behavior changed, so no new R5 mutation is required. Host gate remains coordinator-owned.

### Task 2.1i — exact Architecture runner selection (2026-10-14)

Base: exact merged #421 `f638342c78553eb0ef3717c4b95e3b6f4be05b54`, isolated `/tmp/puni-architecture-selection` worktree. Production `scenario allocate . openspec/changes/test-axes/specs/test-axes/spec.md` issued TEST-AXES-091; the existing journal event prefix was compared equal before applying the proposed journal/spec. `src/architecture-fixtures.json` remains the sole policy authority. After all existing validation, sorted selected canonical paths receive exactly one literal `./` prefix at Bun invocation; canonical policy/JUnit identities, signature, report clearing, refusal order and errors are preserved.

Baseline runner tests: 13 pass, 0 fail, 53 assertions. Initial production subprocess RED: the one-mapping and two-mapping TEST-AXES-091 cases both failed because bare Bun filters executed `nested/src/architecture/...` decoys and left marker files. Each decoy writes synchronously and throws. GREEN: both cases passed with 17 assertions, absent markers and fresh JUnit containing exactly the mapped canonical cases after starting with stale XML. Watched R5 mutation: removing only `.map((file) => `./${file}`)` again failed both marker-absence assertions (0 pass, 2 fail). The prefix was restored, and its adjacent Proof comment records the injected fault and observation. Logs: `/tmp/architecture-selection-red.log`, `/tmp/architecture-selection-mutation.log`.

| Check                                                                                                                                                                                                                                                                                                                                                                      | Fresh outcome                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test ./apps/twilight-structure/twilight-burokrat/cli/src/architecture-level.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/architecture/*.architecture.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/evidence/level-facts.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/evidence/performance-levels.test.ts --timeout=60000` | Exit 0; 100 pass, 0 fail, 693 assertions across 17 files; includes source and packaged CLI checks. Log `/tmp/architecture-selection-tests.log`.                                                                     |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_SOCKET_DIR=/tmp/puni-architecture-selection-nx bunx nx run twilight-burokrat:test:architecture:level --skip-nx-cache`                                                                                                                                                                                                         | Exit 0; fresh JUnit has 14 cases in 14 canonical files, zero failures/errors/skips. Log `/tmp/architecture-selection-target.log`.                                                                                   |
| `bunx eslint apps/twilight-structure/twilight-burokrat/cli/src/architecture-level.ts apps/twilight-structure/twilight-burokrat/cli/src/architecture-level.test.ts`                                                                                                                                                                                                         | Exit 0 after generating the Nx project graph; module boundary rule ran. Initial run found numeric test-title interpolation and skipped module boundaries without a graph; both were corrected before the final run. |
| `bunx tsc --noEmit -p apps/twilight-structure/twilight-burokrat/cli/tsconfig.spec.json`                                                                                                                                                                                                                                                                                    | Exit 0.                                                                                                                                                                                                             |
| Changed-file `bunx prettier --check`, `git diff --check`, pinned `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate test-axes --strict`                                                                                                                                                                                                                       | Exit 0 for all three; OpenSpec reported `Change 'test-axes' is valid`.                                                                                                                                              |

No full raw Nx gate, h2puni exact-SHA gate, push, publication, authenticated receipt, admission, sync or archive was performed. The coordinator owns the exact-SHA host gate after independent review. Tasks 2.1/2.2/4.1 remain open; operational execution grants no certification.

## Task 2.1j — literal find-based Bun operands (2026-10-14)

Base: exact #422 `c474100c5158f213e805db095025e7c94906bac3`; isolated worktree `/tmp/puni-test-axes-21j`. Scenario TEST-AXES-092 is allocated in the existing journal. Scope: the six existing Memory Unit/Conformance, SQLite API/Unit/Conformance and core Unit commands; existing shell-compatible paths only, with no whitespace/glob safety claim. Task 2.1, trusted receipts, coverage and admission remain open.

The production manifest commands now start find at `./src` or `./src/testing`. Memory Unit's exact path exclusion includes the prefix. `collectedFiles` removes exactly one leading `./` for canonical project-relative comparison. Report clearing, no-cases guard, selector-error propagation, command scopes, timeouts and flags are preserved. Literal command replacement fixtures were updated with the changed selectors.

TDD RED: `bun test tools/tool-devsync/src/test-levels.test.ts --test-name-pattern 'executes exact find operands|canonicalizes exactly'` exited 1: zero pass, seven fail. All six real `sh -c` manifest commands executed nested marker/throw decoys outside their selector root; bare Bun operands acted as substring filters. The canonicalization assertion retained unwanted prefixes. GREEN after the bounded changes: exit 0, seven pass, zero fail, 25 assertions. Each Unit/API scratch project selects two files; each Conformance project uses its source filename. Every successful run overwrites stale JUnit with exactly the canonical selected passing cases and leaves decoy markers absent. Memory Unit also excludes a marker/throw Conformance fixture.

Watched production mutations (restored afterward):

- Remove each of the six find prefixes independently, retaining its original matching exclusion: each real command executed its nested decoys and failed the command assertion.
- Revert only Memory Unit's exclusion to the bare path: the excluded Conformance fixture executed and failed the command assertion.
- Remove `collectedFiles` canonicalization: the one-prefix assertion and real level collection comparison failed. The assertion also proves a second leading prefix is preserved.

Focused validation:

- `bun test tools/tool-devsync/src/test-levels.test.ts --timeout=60000`: exit 0, 99 pass, zero fail, 342 assertions. Existing selector-error, empty-selection and stale-report cases remain green.
- `bun test libs/wbs/adapters/store-memory/src/testing/source-conformance.test.ts libs/wbs/adapters/store-sqlite/src/testing/source-conformance.db.test.ts --timeout=30000`: exit 0, 146 pass, zero fail, 11,624 assertions.
- `bun tools/tool-devsync/src/verify-test-levels-cli.ts`: exit 0, `Verified declared test collections`. An initial overlapping execution observed a temporary uncollected fixture created by the collection tests; sequential execution passed after those tests completed.
- `bunx tsc --build --force tools/tool-devsync/tsconfig.json`: exit 0 after fixing the test's readonly-array sort with a copied array; initial check caught that test-only type error.
- `NX_DAEMON=false bunx nx graph --file=/tmp/test-axes-21j-graph.json` then changed-source `bunx eslint`: both exit 0. Nx used its documented in-process fallback when plugin worker sockets were denied; final ESLint had no skipped ProjectGraph boundary warning. Initial ESLint before graph creation skipped module boundaries and is not the final lint evidence.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate test-axes --strict --json`: exit 0, one valid change, zero issues.

Changed-file format and whitespace checks are recorded after this entry. The canonical h2puni host gate remains coordinator-owned and has not been run by this isolated implementation agent; no whole-tree gate success is claimed.

Final restored-code validation: the 99-test collection/command suite again exited 0 with 342 assertions; changed-file `bunx prettier --check` and `git diff --check` exited 0. Host gate remains pending coordinator review.

## Task 2.2a.4 — Name ownership exact-source review packet (2026-10-14)

Evidence base: exact merged #423 `6043639bc832fa7e68ad8fddbcf724c033d30cc8`, initially clean
`/tmp/puni-test-axes-21j` worktree, branch `docs/test-axes-name-lineage-packet`. This packet
records the existing owners' intent and eligibility for later source reconciliation. Its
classification is **active dependency with approved semantic supersession; source eligibility
pending human acceptance**. Tasks 2.2a and 2.2 remain open.

Fresh production command on that exact commit:

```sh
bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts inspect-spec-sources . 6043639bc832fa7e68ad8fddbcf724c033d30cc8 > /tmp/test-axes-name-spec-sources.json
```

Exit 0: 277 active source inputs, 96 canonical requirements and 1,018 operations;
`certifies:false`. Candidate identity:
`ff923deb521d4086a1eeb8400f5fb7bbb9640269b61876ee0f4988a2ce6abe08`.
Complete observation digest:
`b533a9a276fc9cca9b6e2fe05f0ce81a813d18cfc732895df92d674f53177555`.
These identities describe the pinned evidence base, not the later documentation commit.
The diagnostic reads committed Git blobs and inventories operations; its exit zero does not
establish selector eligibility, accepted lineage or coverage.

### Exact active sources and ownership

Both files belong to capability `wbs-domain`. File digests below bind the complete selected
source bytes; fragment digests bind the production parser's raw requirement fragments. Each
listed operation contains six scenarios.

| Owner/source                                                              | Complete source SHA-256                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [column-widths-drag spec](../column-widths-drag/specs/wbs-domain/spec.md) | `7b4a90c5e4230eda225a9fee879d1bc6ebdabf70b68350e3899a7595172cf779` |
| [name-column-drag spec](../name-column-drag/specs/wbs-domain/spec.md)     | `7370ec14fb34363206522bc1408ba88869fc7d55b94ce4290d9457669b0c85bf` |

| Exact source path                                              | Operation | Exact requirement title                                                 | Fragment SHA-256                                                   |
| -------------------------------------------------------------- | --------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `openspec/changes/column-widths-drag/specs/wbs-domain/spec.md` | ADDED     | A column with a declared width can be dragged to another width          | `3d10305d27221b2730616437f36df82ae37fd0bd6d0eec132fc1cb2a85f9877c` |
| `openspec/changes/name-column-drag/specs/wbs-domain/spec.md`   | MODIFIED  | A column with a declared width can be dragged to another width          | `a5c33929d2bd60447711769c176606087115bec9099a7c65b0f593f287b78c27` |
| `openspec/changes/name-column-drag/specs/wbs-domain/spec.md`   | ADDED     | The Name column takes a dragged width, and the viewport keeps the slack | `246f9d1349f2f1c381542ad871c2fc8e364ba88534ef5450752aab2a853750bb` |

The predecessor owns declared-width dragging and its shared layout, persistence and reset
rules. The successor's [proposal](../name-column-drag/proposal.md) and
[delta specification](../name-column-drag/specs/wbs-domain/spec.md) explicitly supersede
its no-Name-handle clause. The same-title MODIFIED block states full-text replacement of the
still-active predecessor and names its acceptance hold. It is an intentional dependency,
with no evidence here for changing either operation label.

### Recorded semantic decision and scenario mapping

The [roadmap U1](../../../docs/plans/2026-08-10-ux-batch-and-roadmap.md#u1-name-column-drag-15d)
and [Dany's 2026-08-10 Answers](../../../docs/plans/2026-08-10-ux-batch-and-roadmap.md#answers--dany-2026-08-10-whatsapp)
already approve the direction: Name owns its dragged width; Number retains its envelope.
Name gains a handle, uses its measured header width at gesture start, clamps to 200–600px,
and shares the existing persistence, sanitizer and reset. With an override the table uses its
resolved sum and the viewport keeps the slack. Without an override Name retains flexible
remainder behavior and `widthFor` still refuses a declared width. The owner
[verification record](../name-column-drag/verify.md#the-task-5-branch-decision) records the
browser-selected sum-width design. Those historical test observations are owner evidence;
this documentation slice does not rerun or certify them.

The exact same-title scenario mapping is:

| Predecessor scenario                                            | Successor scenario                                              | Disposition                                                              |
| --------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| dragging a fixed column wider                                   | dragging a fixed column wider                                   | Preserved title and behavior                                             |
| the Name column offers no handle                                | every column offers a handle, the Name column included          | Explicit approved semantic supersession; Name starts from measured width |
| the floor is the narrower of 36 and the default                 | the floor is the narrower of 36 and the default                 | Preserved title and behavior for the narrow fixed column                 |
| a resized folded role moves the figure the Phases dialog quotes | a resized folded role moves the figure the Phases dialog quotes | Preserved title and behavior                                             |
| the ceiling is the same number in both directions               | the ceiling is the same number in both directions               | Preserved title and behavior                                             |
| a drag does not disturb what is being typed                     | a drag does not disturb what is being typed                     | Preserved title and behavior                                             |

The successor's separate ADDED requirement owns these six additional scenarios:

| Exact scenario title                                  | Additional obligation                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| dragging the Name column below the table minimum      | Name widens from its floor; minimum follows; earlier pins remain fixed                      |
| the viewport keeps the slack                          | Name uses its override; other column envelopes hold; no sideways scroll within the viewport |
| Name's floor and ceiling                              | Name clamps to 200px and 600px                                                              |
| a stored Name entry is a claim with Name's own bounds | 300 applies; 150 and 1e9 drop independently                                                 |
| an undragged Name is still the flexible column        | No declared width; remainder behavior and width lookup refusal survive                      |
| one reset returns the whole layout, Name included     | Forget shared storage; restore flexible Name and resolved Number default                    |

The retired negative `refuses the flexible column a width and a floor alike, override or not`
is named in [column-widths-drag verify row 4](../column-widths-drag/verify.md) and explicitly
superseded in the successor spec/proposal: its injected flexible-floor arm becomes intended
behavior. This semantic retirement does not authorize dropping the five surviving predecessor
scenarios, changing identifier history or weakening selector predecessor checks.

### Acceptance holds and proposed later lifecycle

[Column-widths task 7.2](../column-widths-drag/tasks.md#7-gate) and
[Name task 6.2](../name-column-drag/tasks.md#6-gate) remain unchecked: both require deployment
to dev and Dany's judgment of the table's feel. The
[roadmap Lane B](../../../docs/plans/2026-08-10-ux-batch-and-roadmap.md#lane-b--bookkeeping-first-05d)
requires driving predecessor acceptance to a decision before the archive sweep. Semantic
approval from August does not establish that either attended acceptance occurred.

Proposed later lifecycle, subject to exact-source review and those acceptance decisions:

1. Record both attended acceptance outcomes in their owning change records, or record an
   explicit owner decision about a hold; retain them until that evidence exists.
2. Review and sync the accepted column-widths predecessor into canonical lineage while
   preserving all its requirements and scenario history, then archive that accepted owner.
   Archive content remains historical evidence and never becomes selector runtime input.
3. Reconcile the successor against that canonical predecessor with an explicit representation
   of the approved no-handle supersession and all five retained scenarios. Resolve any
   scenario retirement through the identifier/predecessor workflow before selecting it;
   merely dropping a predecessor scenario would violate the selector's retention check.
   After successor acceptance, review its Name-specific addition and replacement, sync and
   archive through the normal workflow, retaining shared persistence/reset obligations.
4. Run the committed whole-tree `SPEC-SCENARIOS` selector and record every remaining refusal.
   Neither this proposed sequence nor a successful inventory authorizes a path-order winner.

This packet applies none of that lifecycle: no sync, archive, relabel, source edit, journal
edit, selector relaxation or human acceptance request. Grouping the fresh diagnostic by exact
capability/title leaves seven competing groups: leaf status; declared-width dragging; caller
solver durations; flat trio; folded estimate reading; notes Done/Escape; and marking done's
fact end. The calendar-axis same-source rename/MODIFIED pair is its declared rename lineage,
not an eighth competing owner group. All seven groups remain unresolved by this packet; the
Name classification supplies review evidence only.

### Packet validation and limits

No tests or production-path fault injections are required for these two documentation edits:
no behavior or safety check changes. The source diagnostic above is a fresh read-only
observation. Fresh scoped checks:

- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate test-axes --strict --json`:
  exit 0; one valid change, zero issues.
- `bunx prettier --check openspec/changes/test-axes/tasks.md openspec/changes/test-axes/verify.md`:
  exit 0; both changed files match Prettier style.
- `git diff --check`: exit 0; no whitespace errors.

The full Nx suite, canonical h2puni gate, deployment, attended UI checks, coverage,
certification and admission are unperformed by this slice. No push was performed.

## WBS 080.39 — current-main source inventory checkpoint (2026-10-15)

Fresh isolated checkout and tool revision: `b773e5f64d9b8eeb1bffcd9ceda099425f14297a` (remote main fetched on 2026-10-15). Production command:

`bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts inspect-spec-sources . b773e5f64d9b8eeb1bffcd9ceda099425f14297a`

Exit 0; 289 active source inputs, 96 canonical requirements and 1089 operations; `certifies:false`. Exact candidate: `2db40542285713e41c42296c8a20afbd033ca42b3e1ab5298268bbb6f4e63267`. Complete observation digest: `43f35f8fe5136ac1913f16d9c0169e8f44692810fd095bb24bf66f78c6a5a7e7`. The tool and candidate use the same exact SHA. These identities describe the evidence base, not this later documentation commit.

The current inventory contains **nine** competing groups with distinct active source paths. The seven groups recorded at historical `6043639b` remain; two later Gantt overlaps are now present. Same-source rename/MODIFIED operations are excluded from this competing-owner count. Each row below binds capability, exact title, operation, complete source digest and raw fragment digest from the production diagnostic.

| Capability             | Exact requirement title                                                          | Operation | Source                                                                                          | Source SHA-256                                                     | Raw fragment SHA-256                                               |
| ---------------------- | -------------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| wbs-domain             | A leaf's status folds its progress, hold, readiness and predecessors             | ADDED     | `openspec/changes/add-work-item-statuses/specs/wbs-domain/spec.md`                              | `eff67505bfa7c2ac3067d0ba22e4c43a8d110ebff517f8b13eccc96760cb798b` | `f3260fdd996a29fdc86c427dbedcf74fe360d701a26f0bb272f4d6ca2e40b154` |
| wbs-domain             | A leaf's status folds its progress, hold, readiness and predecessors             | MODIFIED  | `openspec/changes/fold-over-included-nodes/specs/wbs-domain/spec.md`                            | `e80eb7e6fe1c9df7089506ee14f09a07b43f394136ffb087e73e98be9164e115` | `c793a755afc5dc02796916d7df51cfe9f62be280f43747f81ee701c495336b91` |
| wbs-domain             | A column with a declared width can be dragged to another width                   | ADDED     | `openspec/changes/column-widths-drag/specs/wbs-domain/spec.md`                                  | `7b4a90c5e4230eda225a9fee879d1bc6ebdabf70b68350e3899a7595172cf779` | `3d10305d27221b2730616437f36df82ae37fd0bd6d0eec132fc1cb2a85f9877c` |
| wbs-domain             | A column with a declared width can be dragged to another width                   | MODIFIED  | `openspec/changes/name-column-drag/specs/wbs-domain/spec.md`                                    | `7370ec14fb34363206522bc1408ba88869fc7d55b94ce4290d9457669b0c85bf` | `a5c33929d2bd60447711769c176606087115bec9099a7c65b0f593f287b78c27` |
| scheduler-optimization | Every duration crossing the solver boundary is computed by the caller            | ADDED     | `openspec/changes/dual-optimized-scheduler/specs/scheduler-optimization/spec.md`                | `a164a50e724d3dc6ff46d493192ccc01f5f3713ecb9993907b3ffd8f132ca64d` | `bb70df76b22fa6d2a0893d9bf7712ca5a194e5fbae2874777eaf1693fb9054b5` |
| scheduler-optimization | Every duration crossing the solver boundary is computed by the caller            | MODIFIED  | `openspec/changes/unestimated-steps-take-no-schedule-time/specs/scheduler-optimization/spec.md` | `96dc5500f2beb04fb70149c4c4e4da95b4793d2bf7da0d543dd501abebf698c2` | `992cb9f629f483e991ded8733d272f6df8986d5e6e75f86cb6e3145cb8d0a642` |
| wbs-estimate-cell      | A flat trio is not said twice                                                    | ADDED     | `openspec/changes/estimate-cell-at-rest/specs/wbs-estimate-cell/spec.md`                        | `18fdf594c3f7db462032d1fb1e761a111dc1dc6d33dea9ce9a78e3cb7ec351be` | `a336f80824d43704832c240cf656b1398d13948198bf0bb9eb044b9bd0f7eb83` |
| wbs-estimate-cell      | A flat trio is not said twice                                                    | MODIFIED  | `openspec/changes/keep-single-estimate-visible/specs/wbs-estimate-cell/spec.md`                 | `312608bd511a143d7cf800d33a281d7520b83d96dd13e0f8c7fca7cad9d42a15` | `f1102040c794e14fab385c12b50dcef4e19bbe9b5842ccb0348aebf6bff142f9` |
| wbs-estimate-cell      | The result is the folded step cell's main reading                                | ADDED     | `openspec/changes/estimate-cell-at-rest/specs/wbs-estimate-cell/spec.md`                        | `18fdf594c3f7db462032d1fb1e761a111dc1dc6d33dea9ce9a78e3cb7ec351be` | `6f4f06f3ff242c4419d7043b63207487c1bb6a80b488eb1937275d7085b3877d` |
| wbs-estimate-cell      | The result is the folded step cell's main reading                                | MODIFIED  | `openspec/changes/keep-single-estimate-visible/specs/wbs-estimate-cell/spec.md`                 | `312608bd511a143d7cf800d33a281d7520b83d96dd13e0f8c7fca7cad9d42a15` | `7b291b57d9c7b95c5077e1dfa908a66b8683bebb3d25e76ae97b90fdb994e360` |
| wbs-domain             | Leaves draw bars for the work somebody costed, and the rest is behind the switch | MODIFIED  | `openspec/changes/gantt-calendar-axis/specs/wbs-domain/spec.md`                                 | `bcd125a2b27be5ec8c1c3fa6627e59618df9d4534af767a2ca29af642fa4d76b` | `3c9a15268ff2d68b5e0d59cb4bd25d0948f4be5d1e27d66a9c4c5a775918f87a` |
| wbs-domain             | Leaves draw bars for the work somebody costed, and the rest is behind the switch | MODIFIED  | `openspec/changes/gantt-legibility/specs/wbs-domain/spec.md`                                    | `043d1da4473eb696a04e08402435c7d541164fb85e9d596643855d523fe3a52f` | `45ffed412635830d898651d0cf299f3005bbb6975d36a1c428150651229c18ab` |
| wbs-domain             | An assumed duration is not an estimate                                           | MODIFIED  | `openspec/changes/gantt-legibility/specs/wbs-domain/spec.md`                                    | `043d1da4473eb696a04e08402435c7d541164fb85e9d596643855d523fe3a52f` | `f73387975eb8ad844306332b24ad311d7e5f1c079d6c78604b2a9467d6c8ce01` |
| wbs-domain             | An assumed duration is not an estimate                                           | MODIFIED  | `openspec/changes/unestimated-steps-take-no-schedule-time/specs/wbs-domain/spec.md`             | `d6b6ea5052add9d5344eb420fc61b6ba28d9e69c67ca0b51f27ea826f991bfea` | `5d9ddbf557eb7324090d21e724ce9a39951f9f7c6f2ef16d6dcac8ffcb5e207e` |
| wbs-domain             | The notes editor closes on Escape and on Done, and both save                     | MODIFIED  | `openspec/changes/notes-done-by-the-marker/specs/wbs-domain/spec.md`                            | `e094b842d1d005dabe9a912130e4bee6ac0cfc2d33dadc2019ccf86e13d615a1` | `92d3eb02498aa83a9a53f83513675fd1f336421b75dda8abf720b36faf133172` |
| wbs-domain             | The notes editor closes on Escape and on Done, and both save                     | ADDED     | `openspec/changes/notes-editor-done/specs/wbs-domain/spec.md`                                   | `3da087c89f24f5029348fce84b7b8e0b0f1f936cbf6213c1d630844fff13645e` | `7906d3f9cc0a7b83f9338fe5f9da05b6793cad2ef2cb5e391f8ec73e6f18d784` |
| wbs-domain             | Marking done fills an empty fact end with the day of the act                     | MODIFIED  | `openspec/changes/status-at-a-glance/specs/wbs-domain/spec.md`                                  | `9e68eefe58c3421c9e619a587562c4af1189f3aec35df8aacceb5fef360a6867` | `bfe271b70ce4181b248c25b2e1a461068dd72efa1570d2f1af3f8f5559a3c960` |
| wbs-domain             | Marking done fills an empty fact end with the day of the act                     | MODIFIED  | `openspec/changes/step-node-attempts/specs/wbs-domain/spec.md`                                  | `667bc41e7cb9cc8712dff02340e4244938c7dc9138671f74ff6986f5d0c6213a` | `fe345529f993cc3fc2b2b44729da0920f772200d0f019a0f53db82c0bbc42f9a` |

No independently decidable source correction is justified by this inventory. The leaf successor still records its participation/readings dependency as blocked. The declared-width pair retains both Dany feel acceptance holds from task 2.2a.4. Caller solver durations depend on an active predecessor whose final verification remains open. Both estimate presentation groups retain an unfinished predecessor and explicit semantic supersession; they require reviewed canonical lineage rather than an operation relabel. Notes retains its attended acceptance hold. Marking done depends on active step-node-attempts work whose final verification remains open. The two additional Gantt overlaps retain the calendar/legibility/unestimated owners; no new ownership decision or acceptance is inferred.

This checkpoint performs no sync, archive, relabel, selector relaxation or acceptance. Inventory exit zero establishes neither effective selection nor coverage. Tasks 2.2a and 2.2 remain open. The bounded next prerequisite is Browser earlier-row membership evidence under tasks 2.1/4.1, preserving unknown versus reviewed-empty evidence and real publication/collection bindings. Host gate, full suite, deployment, attended UI acceptance, certification and admission are unperformed by this checkpoint.

## Task 4.1b.8 — Browser membership review facts (WBS 080.39, 2026-10-15)

Base/tool checkout: `b773e5f64d9b8eeb1bffcd9ceda099425f14297a`; isolated clone `/tmp/puni-08039-lineage`, branch `feat/08039-source-lineage`. The diagnostic checkpoint above was committed with normal lefthook checks as `f247a0dca` and pushed before implementation. `bun install --frozen-lockfile` completed with Bun 1.4.2 (1,573 installs checked across 1,447 packages, no changes), using writable `BUN_TMPDIR` and cache paths after the default temporary directory refused with EROFS.

The production allocator reserved TEST-AXES-093..095. The new `inspect-browser-memberships` calls the real `inspectTestReports`, preserving its complete source-bound case/provenance/outcome observation. Strict external authority pins the exact revision, candidate, Browser mode and report observation digest. Exactly four unique earlier-row review assertions are required. `unknown` remains unknown; `reviewed-empty` is an explicit external review assertion over the complete recorded Browser fixture collection. Neither is discovered or authenticated membership. The sorted unique collection, canonical review rows, raw authority identity, complete nested report and full own payload digest are bound. The adapter emits no level, isolation, T1/T2, coverage, receipt or admission claim. Authentication stays absent and certification false, including failed/skipped reports. The existing report case interface is exported so the nested observation's declaration type can be named; its runtime behavior is unchanged.

Production TDD RED: `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/test-reports.test.ts --test-name-pattern 'Browser membership'` exited 1: zero pass, three fail, ten assertions. The positive, authority refusal and dispatch assertions all reached the missing production command. After implementation and correcting two inherited-diagnostic expectations to the actual `EISDIR` and `Browser normalized report digest or path differs` messages, GREEN exited 0: four pass, zero fail, 87 assertions, including the real built executable. The positive authority is pinned to an actual fixture publication; two failed/skipped cases sharing one selected regular source prove complete source/outcome retention and unique collection.

Watched production faults (each restored from retained passing bytes before the next fault):

| Injected fault                                                                                      | Observed production assertion                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Disable fatal UTF-8; replace JSON decoding with an empty record; bypass the closed authority schema | Each independently failed TEST-AXES-094's responsible refusal. Schema negatives include version, unknown keys/level/state and fields on review rows. Missing and directory authority separately report ENOENT and EISDIR through the existing external reader. |
| Remove revision, candidate, mode or report digest equality, one comparison at a time                | Each independently made TEST-AXES-094 accept a changed pin and fail its refusal assertion.                                                                                                                                                                     |
| Remove complete unique row validation                                                               | TEST-AXES-094 accepted an omitted or duplicated row and failed. Unknown membership levels remain schema refusals; the supported `unknown` review state remains distinct.                                                                                       |
| Remove row sorting or collection deduplication                                                      | Each independently failed TEST-AXES-093's canonical rows or exact one-source collection assertion.                                                                                                                                                             |
| Zero authority digest; discard nested report; convert unknown review states to reviewed-empty       | Each independently failed TEST-AXES-093's exact authority, real report or review-state assertion.                                                                                                                                                              |
| Promote authentication; promote certification; hash an empty payload                                | Each independently failed TEST-AXES-093's absent authentication, false certification or independently recomputed full-envelope digest assertion.                                                                                                               |
| Remove CLI arity or mode validation                                                                 | Each independently failed TEST-AXES-095's named usage refusal.                                                                                                                                                                                                 |
| Remove installed command registration                                                               | TEST-AXES-095's built executable positive failed with unknown command.                                                                                                                                                                                         |

Proof: all 19 independent faults exited 1 at their named production tests. Final passing bytes were restored, and adjacent production `Proof:` comments record the observed faults. Logs for this run are `/tmp/puni-08039-red.log`, `/tmp/puni-08039-green.log`, `/tmp/puni-08039-mutations.log` and `/tmp/puni-08039-faults/`; these local diagnostic files are not durable authority artifacts.

Scoped validation on the restored code:

- `bun node_modules/.bin/tsc -p apps/twilight-structure/twilight-burokrat/cli/tsconfig.lib.json --noEmit`: exit 0. Initial declaration generation exposed the nonexported nested case interface, corrected by the type export described above.
- The same command with `tsconfig.spec.json`: exit 0.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx graph --file=/tmp/puni-08039-graph.json`: exit 0. Subsequent changed-source `bunx eslint` exited 0 without a skipped ProjectGraph boundary warning. Initial lint caught import sorting and three unsafe parsed-JSON test accesses; all were corrected before the final pass.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate test-axes --strict --json`: exit 0, one valid change, zero issues.
- Production `scenario validate . openspec/changes/test-axes/specs/test-axes/spec.md`: exit 0, `unidentified:[]`.
- Five-file regression (`test-reports`, `test-sources`, `performance-levels`, `spec-sources`, installed dispatch): 83 pass, seven timeouts, 551 assertions across 90 tests in 215.46s. Three source-owner tests reached their 5s harness limits; three Performance tests reached 5s limits and the five-fault selected-declaration test reached its explicit 20s limit at 20.2s. No unrelated timeout is presented as a passing check. Serial retry outcomes are recorded below.

The local heavy lock cannot be acquired: `bin/with-heavy-lock.sh -- ...` exits 70 because its canonical Linux parent `/home/puni1/.cache` does not exist on this host, including after sandbox escalation. Its read-only status command reported holder none; that did not prove acquisition. No alternate mutex or timeout code change was introduced.

The production committed `SPEC-SCENARIOS` check at the pinned base, using external policy `source-lineage-08039` and predecessor `5b65fd5ae6a80e0ecab24baa2341808004ad6a4f`, exited 1 with `allowed:false`, `certifies:false` and `competing overlay operation: wbs-domain: A leaf's status folds its progress, hold, readiness and predecessors`. Initial diagnostic policy attempts were setup refusals (invalid policy ID, missing scenario authority and then a nonpreceding base); only the corrected predecessor-policy run reached this source-lineage refusal. All nine competing groups in the checkpoint remain unresolved; no source ownership, hold, acceptance, sync, archive or journal retirement was changed.

The canonical h2puni gate, full Nx suite, deployment, attended UI acceptance, authenticated receipts, classification and T1/T2 coverage are unperformed by this worker. The coordinator owns final review and the exact-commit host gate. Tasks 2.1, 2.2a, 2.2 and 4.1 remain open.

Serial Performance-only retry: `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/performance-levels.test.ts --timeout=30000` exited 0, 34 pass, zero fail, 171 assertions in 134.63s. The test's explicit 20-second selected-declaration bound was not edited. The coordinator subsequently approved the library's explicit lock-path seam for this local host: after `report_heavy_lock_status /tmp/wbs-heavy-work.lock` reported holder none, source `bin/heavy-lock-lib.sh` and use `with_heavy_lock /tmp/wbs-heavy-work.lock -- ...`. This local serialized diagnostic lock is separate from the canonical h2puni gate. No production lock resolver or timeout was changed.

Locked focused retry: `with_heavy_lock /tmp/wbs-heavy-work.lock -- bun test .../evidence/test-sources.test.ts .../evidence/performance-levels.test.ts --test-name-pattern 'omitted, extra and unsupported|reordered real report|isolated upstream provenance|selected declaration snapshot|broken classifier cannot|both upstream digest|coherently changed inspector' --timeout=30000` exited 0: seven pass, zero fail, 66 assertions in 49.25s, with 48 unrelated tests filtered out. The lock reported zero seconds behind zero tickets; the explicit 20-second selected-declaration loop passed unchanged. Thus all seven initially timed-out cases have passing serial retry evidence; the original combined run remains recorded as failed. The complete Performance-only retry and these targeted retries do not claim a passing full suite. Final source and test TypeScript checks again exited 0 after the test assertion typing edits. Changed-file formatting, strict OpenSpec and whitespace checks are recorded by the normal-hooked implementation checkpoint. Task 4.1b.8 is complete within its diagnostic scope; Tasks 2.1, 2.2a, 2.2 and 4.1 remain open.

## Task 4.1b.9 — bounded Performance-to-B3 observations (WBS 080.39, 2026-10-15)

Base: exact second-wave aggregate `7e160ba6911504d8bf46bb8674774d1006fb51d5`; isolated checkout `/tmp/puni-performance-scenarios-20261015`. Production allocator `scenario allocate . openspec/changes/test-axes/specs/test-axes/spec.md` allocated TEST-AXES-096..099. Synthetic Git repositories have an empty committed predecessor journal and production-allocated successor identities; committed source files throw if executed. No denied survey evidence was retained.

RED: the first six production CLI tests failed on unknown `inspect-performance-scenarios` before implementation (`/tmp/performance-scenarios-red.log`). A preliminary fixture error used three-hash scenario headings and was corrected before this RED; it is not implementation evidence. GREEN: final focused scenario suite includes complete selected rows and independent payload digest, multiple passing cases, nested-suite terminal-only citations, missing/malformed/unknown/retired diagnostics, requested unidentified/absent capability refusal, unrelated B3 debt preservation, unrelated competing overlays, missing external scenarios authority, selected-source/policy/declaration/publication failures, broken context joins, upstream digest sensitivity and real built installed dispatch.

Watched production mutations (each exited 1 because its named assertion failed, restored immediately):

| Injected fault                                 | Observed assertion                                            |
| ---------------------------------------------- | ------------------------------------------------------------- |
| Remove isolated-Performance guard              | Architecture fixture emitted success instead of refusal (099) |
| Remove external-policy/publication digest join | Foreign policy digest emitted JSON (099)                      |
| Remove external scenarios-authority guard      | Named policy.scenarios refusal was lost (099)                 |
| Remove absent-capability guard                 | Empty success replaced refusal (098)                          |
| Remove requested unidentified-ID guard         | Unidentified row emitted instead of refusal (098)             |
| Filter unrelated selected entries before B3    | Competing unrelated overlays were accepted (098)              |
| Accept one-digit citation ordinals             | Malformed citation became inactive (097)                      |
| Read the first title instead of terminal title | Nested suite citation replaced terminal citation (097)        |
| Change missing citation finding to inactive    | Missing finding differed (097)                                |
| Remove active-ID guard                         | Unknown/retired citations exited zero (097)                   |
| Remove empty-terminal context guard            | Named terminal refusal was lost (099)                         |
| Hash an empty envelope                         | Independent full-payload digest differed (096)                |
| Remove CLI arity guard                         | Extra operand accepted (099)                                  |
| Remove citation failure exit mapping           | Invalid citation diagnostic exited zero (097)                 |
| Remove installed command registration          | Real built executable rejected the command (099)              |

Mutation logs are `/tmp/scenarios-mutant-*.log`; full-tree fault was a changed `evaluateSpecifications` operand, not a mocked selector response. Existing levels regression remains unchanged in output and preserved all 34 previous tests; initial combined run was 40 passing tests with zero failures (`/tmp/performance-scenarios-green.log`).

Scoped validation: `bun test .../evidence/performance-scenarios.test.ts`; `bun node_modules/.bin/tsc --noEmit -p apps/twilight-structure/twilight-burokrat/cli/tsconfig.lib.json`; ESLint on all five changed TypeScript files; Prettier on changed code/artifacts; pinned OpenSpec 1.12.0 `validate test-axes --type change --strict --json`. Final scenario suite: 17 passed, zero failed. Library and spec TypeScript compilation exited zero; scoped ESLint exited zero; strict OpenSpec validation reported one valid change and zero issues. Prettier and `git diff --check` exited zero. ESLint exits zero but reports its Nx module-boundary rule skipped because this isolated checkout has no cached project graph; that check remains unverified here. Dependencies use the aggregate checkout's existing node_modules via an untracked symlink. No full Nx gate was run; the coordinator owns the exact-commit host gate, required frozen install, broader CI checks and merge decision.

This diagnostic grants no global coverage, authenticated evidence, certification, receipt or admission. Existing Tasks 2.1/2.2a/2.2/4.1 remain open; this task closes only the bounded Performance-to-B3 table slice.

## 4.1b.10 design preparation — 2026-10-15

Artifacts only, prepared in an isolated clone of exact #488 integration head
`f7f982cae8c633779f10f4f786da389dc1138be8`. The coordinator requested a concrete packet for
independent review before Sol implementation. No new human interview or implementation approval
is claimed. Existing test-axes terms are preserved; no glossary or ADR change is needed.

The production scenario allocator was run before applying its proposed spec/journal output:

```sh
bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts scenario allocate . openspec/changes/test-axes/specs/test-axes/spec.md
bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts scenario validate . openspec/changes/test-axes/specs/test-axes/spec.md
```

Allocation exited 0 and proposed exactly TEST-AXES-100..103. Provenance validation exited 0 with
`{"unidentified":[]}`. Existing events were retained; no identifiers were handwritten or reused.

Pinned `OPENSPEC_TELEMETRY=0 bunx --bun @fission-ai/openspec@1.12.0 status --change test-axes --json`
identified the existing `sdd-lean` repo-local change and its artifact paths. Targeted
`validate test-axes --strict --json` passed 1/1 with zero issues; `validate --all --json` passed
210/210 (192 changes, 18 specs). Changed-artifact Prettier and `git diff --check` passed.
The initial direct invocation of the cached CLI failed first with sandbox EROFS and then missing
`chalk` resolution; using the pinned Bun package runner resolved the CLI dependencies and produced
the successful outputs above. Those initial failures are not validation passes.

Validation used the existing workspace dependency tree through a local ignored `node_modules`
symlink; a new frozen dependency installation was not performed. No production implementation,
new runtime tests, R5 mutation proof, affected build/lint/typecheck, browser run, installed-command
execution, host gate, CI, push, merge or deployment was performed for this design-only packet.
All 4.1b.10 implementation/review/release boxes and parent 2.1/2.2a/2.2/4.1 remain unchecked.
The proposed R5 pairs in tasks.md are obligations, not observed proofs. Independent artifact
review and the coordinator's implementation handoff remain pending.

## 4.1b.10 implementation — Browser committed Conformance facts (2026-10-15)

Base: committed design `1238c36fce57d856a633d3db94b1ffa23cb07349`, directly above
accepted #488 `f7f982cae8c633779f10f4f786da389dc1138be8`. Implementation lives in isolated
clone `/tmp/puni-browser-conformance-implementation`; the coordinator and design checkouts were
not edited. Frozen `bun install --frozen-lockfile` passed with Bun 1.4.2 (1,573 installs checked,
1,447 packages, no changes), using task-specific writable `BUN_TMPDIR` and cache paths after the
default temporary directory refused with EROFS. This clone has its own dependency directory.
Pinned OpenSpec 1.12.0 `status`/`instructions apply` selected repo-local `test-axes` (`sdd-lean`).
The existing TEST-AXES-100..103 allocations are preserved; no further allocation was needed.

The adapter independently captures exact committed identity, compares the real report's revision,
candidate and requested mode, then checks the closed external authority and selected manifest.
The mode comparison was clarified directly with the independent Astra design reviewer: coherent
changes to both report and authority must not replace the requested mode. Only the existing strict
Conformance envelope/command decoder moved out of `level-facts.ts`; its refusal text and validation
order are preserved. Every selected regular blob is read before intersection. Output retains all
real report cases/outcomes, complete selected files, sorted intersection and source union, other
memberships unknown, absent authentication and false certification.

RED: `/tmp/browser-conformance-red.log` records seven production CLI failures for unknown
`inspect-browser-conformance`. An earlier fixture preparation failure used full workspace paths
in raw Playwright JUnit; its basename requirement was fixed before observing that RED and is not
implementation evidence. The 37-test existing `level-facts.test.ts` baseline/regression run passed (`/tmp/browser-conformance-performance-baseline.log`). The first extended Browser run
passed 15 tests/307 assertions after correcting the inherited external-artifact diagnostic in one
expectation. Subsequent real multi-file and SQLite-only publication cases also passed individually.
The final acceptance run and counts are recorded below.

Watched production faults (each named mutation log contains a failing production-path assertion;
all source restored immediately, and `Proof:` comments added only after observation):

| Injected fault                                                                                                                                | Observed assertion                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove full-SHA, committed-kind or exact requested-revision guard                                                                             | Symbolic, broken-reader staged and annotated tag-object selections lose the adapter's named refusal (101/103)                                         |
| Independently remove report revision, candidate or requested-mode join                                                                        | Coherently changed report plus authority is accepted instead of refusing the independently captured identity (101)                                    |
| Independently remove authority revision, candidate, mode, report digest or manifest/root join                                                 | A substituted pin loses its named refusal or emits JSON (101)                                                                                         |
| Disable fatal UTF-8, replace JSON parsing with an empty record or bypass authority schema                                                     | Invalid bytes, malformed JSON or unsupported version/keys lose the responsible refusal (101)                                                          |
| Remove nonempty collection or project-root containment                                                                                        | Broken report dependency's empty collection or coherent foreign-root authority is accepted (101)                                                      |
| Remove selected-regular check or complete Conformance-source loop                                                                             | Missing/nonregular/disjoint selected sources, including working repairs, lose their named refusal (102)                                               |
| Break selected-blob reads for manifest and disjoint selected test                                                                             | Explicit unreadable-object dependency faults refuse on the production path (102); these are dependency faults, not filesystem-permission observations |
| Independently omit source mode or digest equality                                                                                             | A broken report inspector's source tuples are accepted (101)                                                                                          |
| Remove same-path tuple agreement                                                                                                              | A later selected-byte read substitutes different content for a shared path (103)                                                                      |
| Remove manifest digest or targets-array check                                                                                                 | Substituted byte pin or malformed selected manifest loses its named refusal (101/102)                                                                 |
| Disable target schema, exact cwd, SQLite-only input root, command grammar, duplicate guard, literal-prefix normalization or selector ordering | Unsupported envelopes/commands are accepted or lose their named refusal; canonical complete selection differs (100/102)                               |
| Remove the command's true end constraint                                                                                                      | Trailing newline/suffix command is accepted (102)                                                                                                     |
| Reverse, duplicate or truncate collection                                                                                                     | Multi-file collection order/completeness or duplicate-source case deduplication differs (103)                                                         |
| Reverse, duplicate or omit manifest from source union; omit complete selectedFiles or nested report                                           | Exact complete output assertions fail (100/103)                                                                                                       |
| Return all selected files as the intersection                                                                                                 | Disjoint membership is falsely populated (100)                                                                                                        |
| Change any unknown membership to reviewed-empty                                                                                               | Exact earlier-row facts differ (100)                                                                                                                  |
| Independently promote authentication/certification; zero raw-authority digest; hash an empty envelope                                         | Explicit noncertifying invariants, independent byte digest or full-envelope digest differ (100)                                                       |
| Remove CLI arity/mode check or installed registration                                                                                         | Named source usage refusal or real built executable success fails (103)                                                                               |

Logs: `/tmp/browser-conformance-mutations.log` has 39 caught faults;
`/tmp/browser-conformance-mutations-envelope.log` has seven additional caught output faults before
a mutation-script matching error; `/tmp/browser-conformance-mutations-final.log` has the final four
caught faults (50 total). The script matching error made no production change. A preliminary `$`
replacement retained refusal in Bun and is not claimed as a caught fault; removing the end
constraint entirely produced the watched failing assertion. The requested-revision mutation first
survived because a broad substring also matched the inherited inspector's refusal; the assertion
was tightened to the Browser Conformance adapter's complete named refusal and then failed under
that mutation. Logs are external scratch evidence, not committed receipt or authentication.

The initial Nx invocation was denied daemon/plugin sockets and printed no target execution;
that output is not a typecheck pass. Scoped Nx commands use `NX_DAEMON=false
NX_ISOLATE_PLUGINS=false` and `--skip-nx-cache`. Initial lint/compiler attempts exposed fixture
imports, basename template types, redundant test guards and an overly narrow assertion type;
these were fixed before the final checks. No production behavior was relaxed for those failures.

No target/dependency/test-input manifest or relationship fact changed. No candidate code, Browser
runner, B3 join, classification, isolation, coverage, receipt or admission was introduced.
Synthetic publications prove only the bounded adapter. Full repository acceptance, host gate,
exact-head CI, push, PR, integration and deployment belong to the coordinator; none was run here.
Tasks 2.1/2.2a/2.2/4.1 and coordinator-only 4.1b.10e remain open.

Scoped checks (actual successful output):

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:lint:source --skip-nx-cache --output-style=static`: exit 0, target successfully ran, uncached (`/tmp/browser-conformance-lint-final2.log`).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:typecheck --skip-nx-cache --output-style=static`: exit 0, target successfully ran, uncached (`/tmp/browser-conformance-typecheck-final2.log`).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:build --skip-nx-cache`: exit 0, Burokrat and its three dependent tasks successfully ran, uncached (`/tmp/browser-conformance-build-final.log`).
- Changed-file `bunx prettier --check` and `git diff --check`: exit 0.
- Production `scenario validate . openspec/changes/test-axes/specs/test-axes/spec.md`: exit 0, `{"unidentified":[]}` (`/tmp/browser-conformance-provenance.json`).
- `OPENSPEC_TELEMETRY=0 BUN_TMPDIR=/tmp/puni-browser-bun-tmp bunx --bun @fission-ai/openspec@1.12.0 validate test-axes --strict --json`: exit 0, 1/1 valid with zero issues (`/tmp/browser-conformance-openspec-strict-final.json`).
- The same pinned runner's `validate --all --json`: exit 0, 210/210 valid (192 changes, 18 specs), zero failures (`/tmp/browser-conformance-openspec-all-final.json`).

Final requested acceptance, from `apps/twilight-structure/twilight-burokrat/cli`:

```sh
bun test --preload ../../../../tools/test/scratch/preload.ts ./src/evidence/browser-conformance.test.ts ./src/evidence/test-reports.test.ts ./src/evidence/level-facts.test.ts ./src/evidence/performance-levels.test.ts ./src/evidence/performance-scenarios.test.ts --timeout=120000
```

Exit 0: **125 passed, zero failed, 1,140 assertions across five files** (198.56 seconds;
`/tmp/browser-conformance-scoped-tests-final.log`). This includes all 17 new Browser cases,
source and actual built installed executable dispatch, existing Browser report/membership
identities, shared Performance Conformance envelope/SQLite grammar and both Performance
level/scenario regressions. Per-case 120-second package deadlines were retained. The preceding
combined run had 124 passing tests and one missing-import failure in the new SQLite fixture;
that fixture was corrected and the entire command above rerun, not waived.

Implementation tasks 4.1b.10a/b/c are complete. Task 4.1b.10d remains open solely for independent
Astra implementation review: the design reviewer clarified the requested-mode join, but worker
messages to that earlier idle agent did not constitute a triggered implementation review.
The coordinator has the concrete checkout and is responsible for routing the exact commit for
review. Task 4.1b.10e and all parent ledgers stay open. No host gate, full repository test gate,
CI, secret scan, migration lint, push, PR, integration or deployment was run by this worker.

## Browser Conformance restack onto repaired #488 (2026-10-15)

The reviewed design `1238c36fce57d856a633d3db94b1ffa23cb07349` and implementation
`c1de962e3bc04e55222f1ee236d2388281ebdeb0` were cherry-picked without conflicts onto
repaired #488 `fca16386e8c993c35f169ebf57d07b04da0170a9` in isolated clone
`/tmp/puni-490-browser-restack-sol`. The resulting design is
`e81e354375b594d07881a7777aec3d9b4748f771`, followed by implementation
`477afc7cee0aa4674a8840586ae78f6dcd6d720d`. Exact ancestry and Git blob comparisons
confirmed all 13 packet paths identical to the reviewed source and both repaired-parent
paths identical to #488, with no overlapping paths. This subsequent record changes only
verification evidence; reviewed production and test blobs remain identical.

Fresh checks on the restacked implementation:

- Frozen Bun 1.4.2 install: exit 0; 1,573 installs checked across 1,447 packages, no changes.
- The five-file acceptance command recorded above: exit 0; 125 passed, zero failed,
  1,140 assertions, 190.96 seconds (`/tmp/browser-restack-scoped-tests.log`).
- Uncached scoped Nx `twilight-burokrat:lint:source`, `:typecheck`, and `:build`:
  exit 0; each target reported success (`/tmp/browser-restack-{lint,typecheck,build}.log`).
- Changed-file Prettier and `git diff --check`: exit 0.
- Built `dist/bin.mjs scenario validate . openspec/changes/test-axes/specs/test-axes/spec.md`:
  exit 0; `{"unidentified":[]}` (`/tmp/browser-restack-provenance.json`).
- Pinned OpenSpec 1.12.0 strict validation: exit 0, 1/1 valid, zero issues;
  all validation: exit 0, 210/210 valid, zero failures
  (`/tmp/browser-restack-openspec-{strict,all}.json`).

An initial install used an empty task cache and failed DNS resolution; another temporary
path attempt failed EROFS. The successful frozen installation used the existing default
Bun cache and a fresh writable task temporary directory. Direct execution of source
`bin.ts` refused its missing installed package manifest; provenance was then checked
successfully through the built executable. None of those refused attempts is a pass.

No production guard changed, and the source packet's documented mutation proofs were not
rerun. This worker ran no full host gate, full repository gate, exact-head CI, push, PR,
merge, or deploy. Coordinator release acceptance and parent ledgers remain open.

## 4.1c Capability scenario diagnostic ledger (2026-10-15)

Implemented in isolated `/tmp/wbs-scenario-ledger-sol-20261015` from exact wave-4 candidate
`ae12f88718c04523773a8f84405d410f0c5522e4`. The production allocator issued
TEST-AXES-104..107, with spec and journal applied together from its JSON proposal.
The new command consumes the real complete Performance/B3 observation, enumerates its adopted
capability scenarios and joins closed external obligations. Manual fixtures share the same real
committed candidate, publication and external policy; current, stale, failed, skipped and overdue
are actual inspector verdicts. Stale uses an intervening committed module edit. No output grants
coverage, admission, authentication or certification; WBS080.39 and parent 4.1 remain open.

The initial production CLI RED was the named omitted-obligation test: zero passed, one failed
because `inspect-scenario-ledger` was unknown (`/tmp/scenario-ledger-red.log`). Restored GREEN
and regression results are recorded below. Performance fixture construction was moved into a
shared test utility; each test file registers explicit cleanup, so cached imports do not leave
later fixtures uncollected. The existing Performance scenario result contract is unchanged;
its citation finding interface is exported so TypeScript can name the composed result.

### Watched R5 proofs

Each fault below was injected into the production implementation or its production CLI branch,
then the named production CLI test was run and observed failing (Bun exit 1). The implementation
was restored in `finally` before the next fault. All 46 faults were observed. Reports are
`/tmp/scenario-ledger-{proofs,boundary-proofs,schema-proofs,preservation-proofs}.json`; individual command output is
`/tmp/scenario-ledger-mutation-<fault>.log`. Manual/Performance substitution tests call the real
inspector first, then inject one changed field and repin the outer observation digest, so a
nested identity check cannot pass merely because the outer digest was not recomputed.

| Injected production fault   | Failing CLI test selection                                          |
| --------------------------- | ------------------------------------------------------------------- |
| `canonical`                 | `noncanonical ledger`                                               |
| `symlink`                   | `refuses symlink ledger`                                            |
| `regular`                   | `refuses directory ledger`                                          |
| `utf8`                      | `refuses invalid UTF8 ledger`                                       |
| `version`                   | `authority schemaVersion`                                           |
| `closed`                    | `authority extra / nested unknown`                                  |
| `pins`                      | `authority (revision / candidate / capability) substitution`        |
| `performance-pin`           | `authority performanceObservationDigest`                            |
| `foreign`                   | `refuses foreign / retired obligation`                              |
| `duplicate`                 | `refuses duplicate`                                                 |
| `blank`                     | `refuses blank reason`                                              |
| `unassigned`                | `enumerates adopted`                                                |
| `level`                     | `mismatched lowest`                                                 |
| `manual-debt`               | `joins real Manual`                                                 |
| `citation-debt`             | `lost citation`                                                     |
| `unidentified-debt`         | `lost citation`                                                     |
| `digest-guard`              | `substituted (Manual / Performance) digest`                         |
| `authentication`            | `complete report diagnostic`                                        |
| `certifies`                 | `complete report diagnostic`                                        |
| `payload-digest`            | `complete report diagnostic`                                        |
| `manual-revision`           | `substituted Manual revision`                                       |
| `manual-nested-revision`    | `substituted Manual nested revision`                                |
| `manual-candidate`          | `substituted Manual candidate`                                      |
| `manual-instant`            | `substituted Manual evaluation`                                     |
| `manual-policy`             | `substituted Manual policy`                                         |
| `manual-scenario`           | `substituted Manual scenario`                                       |
| `manual-nested-scenario`    | `substituted Manual nested scenario`                                |
| `manual-title`              | `substituted Manual title`                                          |
| `manual-pin`                | `foreign observation pin`                                           |
| `manual-auth`               | `substituted Manual authentication`                                 |
| `manual-certifies`          | `substituted Manual certifies`                                      |
| `manual-nested-certifies`   | `substituted Manual nested certifies`                               |
| `performance-revision`      | `substituted Performance revision`                                  |
| `performance-capability`    | `substituted Performance capability`                                |
| `performance-auth`          | `substituted Performance authentication`                            |
| `performance-certifies`     | `substituted Performance certifies`                                 |
| `arity`                     | `unsupported operands`                                              |
| `debt-exit`                 | `enumerates adopted`                                                |
| `diagnostic-authentication` | `substituted (Manual / Performance) authentication`                 |
| `diagnostic-certifies`      | `substituted (Manual / Performance) (nested certifies / certifies)` |
| `scenario-shape`            | `malformed scenario ID refuses`                                     |
| `disposition-kind`          | `unknown disposition refuses at`                                    |
| `upstream-preservation`     | `complete report diagnostic`                                        |
| `b3-preservation`           | `complete report diagnostic`                                        |
| `obligation-order`          | `complete report diagnostic`                                        |
| `installed-route`           | `installed dispatch retains`                                        |

The installed-route proof is recorded separately in `/tmp/scenario-ledger-installed-proof.json`
and `/tmp/scenario-ledger-mutation-installed-route.log`.

The first symlink guard removal still refused through the stable external reader. The test was
strengthened to require the responsible named `contains a symlink` refusal, then the same local
guard removal failed that assertion. The UTF-8 fault replaces a byte inside an otherwise valid
JSON reason; nonfatal decoding therefore admits a replacement character and loses the refusal.
Directory evidence similarly requires the named nonregular-file refusal. Missing and unreadable
authority/report paths are separate actual filesystem cases; unreadability uses mode 000 and
restores permissions during cleanup. Existing strict Manual readers retain their original
production proofs for the report/environment/review/acceptance chain.

### Scoped acceptance

From `apps/twilight-structure/twilight-burokrat/cli`:

```sh
bun test --preload ../../../../tools/test/scratch/preload.ts ./src/evidence/scenario-ledger.test.ts ./src/evidence/performance-scenarios.test.ts ./src/evidence/performance-levels.test.ts ./src/evidence/manual.test.ts --timeout=120000
```

Exit 0: **263 passed, zero failed, 879 assertions**, 188.36 seconds
(`/tmp/scenario-ledger-acceptance.log`). This includes source and built installed dispatch;
the installed wrapper preserves debt JSON/nonzero status and adds its standard
`Twilight Burokrat validator exited 1` stderr line. The real Manual stale fixture initially
staged runtime publication artifacts with a broad add; it was corrected to stage only
`source/module.ts`, and the complete four-file command above then passed freshly.

After all omission/order/installed-route faults were restored, the complete-report/reorder and
built installed-dispatch tests were rerun: exit 0, two passed, zero failed, 11 assertions,
9.48 seconds (`/tmp/scenario-ledger-restored-final.log`).

Changed-file Prettier check: exit 0, all 15 changed/new paths matched; `git diff --check`:
exit 0 (`/tmp/scenario-ledger-format-final.log`).

Dependency directory: reused the aggregate checkout's installed `node_modules` through a local
symlink; this worker did not run an installation. Bun 1.4.2 and the actual source/package commands
below executed successfully against it. Initial bare `openspec` was absent from nonlogin PATH;
validation used the repository-pinned cached `@fission-ai/openspec@1.12.0` command. Nx socket
creation was refused by the sandbox, so scoped Nx commands ran with `NX_DAEMON=false` and
`NX_ISOLATE_PLUGINS=false`, without daemon/plugin worker sockets.

- Uncached `bunx nx run twilight-burokrat:lint:source`: exit 0, success, 29.8 seconds
  (`/tmp/scenario-ledger-lint-final.log`).
- `bunx nx run twilight-burokrat:typecheck`: exit 0, success, 2.3 seconds
  (`/tmp/scenario-ledger-typecheck-final2.log`). Initial failures for exported private return
  types and test-only union/index syntax were corrected before this fresh successful run.
- Uncached `bunx nx run twilight-burokrat:build`: exit 0, target and three dependencies
  successful, 4.0 seconds (`/tmp/scenario-ledger-build-final.log`).
- Built `dist/bin.mjs scenario validate . openspec/changes/test-axes/specs/test-axes/spec.md`:
  exit 0, `{"unidentified":[]}` (`/tmp/scenario-ledger-provenance.json`).
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate test-axes --strict --json`:
  exit 0, 1/1 valid. `validate --all --json`: exit 0, 213/213 valid
  (`/tmp/scenario-ledger-openspec-{strict,all}.json`).

No host gate, full repository gate, exact-head CI, secrets scan, migration lint, push, PR,
integration or deployment was performed by this worker. Independent implementation review and
coordinator release acceptance remain pending. This diagnostic does not close the global ledgers,
source reconciliation, T2 or certification.

## Fourth-wave CI test repairs (2026-10-15)

Hosted PR #493 run 38796593695 exposed three test defects on aggregate parent
`ae12f88718c04523773a8f84405d410f0c5522e4`. The Compose migration fixture now supplies
Docker's outgoing container image metadata and pinned image inspection. Its existing
boot-exposure test first failed with `outgoing backend image inspection is malformed`,
then reached the intended health failure and passed all seven retention assertions.
The Dash boundary assertion retains full options equality, with record narrowing for
its peer configuration and an explicit record type for the comparison value.

The cancellation test's HTTP observer now treats `ECONNRESET` as not ready, alongside
connection refusal, within its existing bounded readiness loop. A real TCP listener
that disconnects immediately reproduced `socket hang up` / `ECONNRESET` before this
change; the same regression passed afterward. Other request errors still reject.
Production deployment and Performance guards are unchanged; no behavior-spec delta or
new production safety check was introduced.

Fresh verification from `/tmp/wbs-wave4-aggregate-sol-20261015`:

- `bun test src/swap-migration.db.test.ts --preload ../test/scratch/preload.ts --timeout=60000`
  from `tools/tool-remote-scripts`: exit 0, 10 passed, 71 assertions.
- `bun test src/eslint-boundaries.test.ts --preload ../test/scratch/preload.ts --timeout=30000`
  from `tools/tool-devsync`: exit 0, 26 passed, 153 assertions. After final peer narrowing,
  the focused `-t 'Dash progress'` rerun passed, 14 assertions.
- `bun test src/performance-level.test.ts --preload ../test/scratch/preload.ts --timeout=90000 -t 'readiness observation|cancelled supervisor'`
  from `tools/tool-devsync`: exit 0, 2 passed, 10 assertions. Local sockets required
  execution outside sandbox network restrictions; the sandbox attempt failed its
  production shifted-port preflight and is not a pass.
- Scoped uncached Nx `tool-devsync:typecheck`, `tool-remote-scripts:typecheck`,
  `tool-devsync:lint`, and `tool-remote-scripts:lint`: exit 0. Commands used
  `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`; the initial socket-denied Nx invocation
  exited 0 without running targets and is not counted as verification.
- Changed-file Prettier and `git diff --check`: exit 0.
- `OPENSPEC_TELEMETRY=0 bunx --bun @fission-ai/openspec@1.12.0 validate --all --json`:
  exit 0, 213 valid (195 changes, 18 specs), zero failures.

The initial scoped typecheck still rejected an unknown peer before record narrowing;
initial lint rejected the reset test's void-expression shorthand before braces were
added. Those failed attempts are superseded by the scoped final checks above. This
worker did not run the complete Performance file, full repository tests, host gate,
CI, secret scan, migration lint, merge, or deployment; coordinator acceptance remains
open.

## Wave-five hosted clock repair and wave-four restack (2026-10-15)

The isolated aggregate `/tmp/wbs-wave5-aggregate-sol-20261015` started clean at
`141876e9424b6ddaa79df128e4eb9c52217888e9`. The public wave-five tip was freshly
verified at that exact SHA; repaired wave four was independently verified at
`eede130ae6854b0c60cd1b29881fa2eea0dfc6c3` before fetching and normal-merging it.
Both source packet commits remain ancestors. The merge preserves both appended verification
records, and all three repaired wave-four test blobs match the exact wave-four commit.

Hosted CI's Burokrat clock failure reproduced locally before editing: `bun test
apps/twilight-structure/twilight-burokrat/cli/src/no-ambient-clock.test.ts` exited 1,
zero passed/one failed, with 97 received diagnostic lines (`/tmp/wave5-clock-red.log`).
The only source edit renames the local `performance` binding to `scenarioReport` in
`scenario-ledger.ts` and `scenario-ledger-manual.fixture.ts`; returned `performance` properties,
schema values, detector behavior and every adjacent R5 proof remain intact. The identical clock
command then exited 0, one passed/zero failed (`/tmp/wave5-clock-green.log`). No safety check
changed and no additional mutation proof is claimed.

Fresh checks on the combined tree:

- Scenario Ledger, Performance scenarios/levels, Manual and Burokrat clock focused suite:
  exit 0, 264 passed, zero failed, 881 assertions across five files, 201.30 seconds
  (`/tmp/wave5-restack-tests.log`); command matches the four-file acceptance above plus
  `./src/no-ambient-clock.test.ts`.
- Scoped Prettier check and `git diff --check`: exit 0. An initial format command named
  the migration test under the wrong directory and exited 2; the corrected six-path check
  and final hook formatting passed (`/tmp/wave5-restack-format-final.log`).

- Clock detector plus Dash and Burokrat clock suites: exit 0, four passed, zero failed,
  eight assertions (`/tmp/wave5-restack-no-clock.log`).
- Scoped Burokrat Nx typecheck: exit 0, 2.3 seconds (`/tmp/wave5-restack-typecheck.log`).
- Uncached scoped Burokrat Nx source lint: exit 0, 29.0 seconds
  (`/tmp/wave5-restack-lint-isolated.log`). Two initial attempts refused stale Nx task invocation
  registrations from the clone metadata; retry used its own `NX_WORKSPACE_DATA_DIRECTORY`
  with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`. Direct full-source ESLint also exited 0
  (`/tmp/wave5-restack-eslint.log`). No refused attempt counts as a pass.
- Repository-pinned `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all
--json`: exit 0, 214 passed/zero failed (`/tmp/wave5-restack-openspec.json`).

The old aggregate Astra approval, exact-candidate K6 snapshot and hosted CI belong to
`141876e9424b6ddaa79df128e4eb9c52217888e9`; they do not approve or bind the repaired head.
The installed K6 binding for the committed repaired SHA is recorded separately in the PR
and `/tmp/wave5-restack-evidence/` after commit. No canonical h2puni gate, full repository
gate, browser/pixels, merge to main or deployment ran in this repair worker. Fresh exact-head review and hosted
acceptance remain coordinator work.

## 4.1b.11 Browser Architecture membership — 2026-10-15

Implementation starts from exact `c000efb37750cb3095f3c2d6f88a684d058b149b` in isolated
worktree `/tmp/wbs-browser-architecture-sol-20261015`, owned by clone
`/tmp/wbs-scenario-ledger-sol-20261015`. No root checkout or parallel Step Nodes path changed.
The existing dependency installation is linked from that clone; no dependency/target/test-input
or relationship fact changed.

The real production allocator proposed TEST-AXES-108..111
(`/tmp/browser-architecture-allocation.json`); its emitted Markdown and journal were applied only
after checking exact equality of the entire prior event prefix. Production provenance returned
`{"unidentified":[]}` (`/tmp/browser-architecture-provenance.json`). The first positive actual
`invokeCli` assertion failed for `unknown command: inspect-browser-architecture`
(`/tmp/browser-architecture-red.log`). An earlier test invocation matched zero tests because its
append used an incorrect relative path; that invocation is not RED evidence. The first adapter
run had 10 passing tests and one installed unknown-command failure, which exposed the separate
`src/bin.ts` allowlist and was fixed before the expanded 18-test run passed. A later multi-file
fixture expected insertion order instead of lexical path order; the assertion was corrected to
require canonical sorting, then both additional tests passed. Initial lint found only import
sorting, fixed with the existing lint rule. Initial scoped typecheck passed.

The command independently captures exact committed identity before invoking the real report
inspector, validates strict external authority and all report/source/pin joins, reuses the existing
Architecture policy/mapping/discovery validators, checks complete mapped selected regular blobs
before intersection, and retains complete sorted membership and source union. The output includes
the complete report, authority and byte digest, unknown Manual/Conformance/Performance, absent
authentication, false certification and a digest of the entire payload. Explicit reviewed-empty
refuses fixed policy, descendants and declared `test:architecture:level`. Immediate suffix-directory
children refuse; ordinary nested files are ignored. Candidate code and Browser execution are never
invoked by this adapter.

Watched faults: `/tmp/browser-architecture-mutations.log` records 51 caught mutations;
`/tmp/browser-architecture-mutations-extra.log` records five additional caught mutations. Every
entry has nonzero test status and a real failed production-path assertion, with its complete
output in `/tmp/browser-architecture-fault-<name>.log`. Sources were restored after each mutation;
adjacent `Proof:` comments were added only after observing the failures.

| Injected guard, output or dependency fault                                                       | Observed production assertion                                                                                                     |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Remove full-SHA, committed-kind or exact requested revision guard                                | TEST-AXES-109/111 loses the local symbolic, staged-reader or annotated-tag refusal                                                |
| Independently remove report revision, candidate or mode joins                                    | TEST-AXES-109 accepts coherent changed report/authority identity                                                                  |
| Independently remove authority revision, candidate, mode or report digest joins                  | TEST-AXES-109 accepts changed authority pin                                                                                       |
| Drop manifest/root agreement or collection containment                                           | TEST-AXES-109 loses the exact foreign-scope refusal                                                                               |
| Disable fatal decoding, substitute empty JSON record, bypass closed authority schema             | TEST-AXES-109 loses invalid-UTF-8, malformed-JSON or unsupported-version/key refusal                                              |
| Remove nonempty collection guard                                                                 | TEST-AXES-109 accepts empty report dependency                                                                                     |
| Remove selected-regular guard or complete mapped-source reads                                    | TEST-AXES-110 loses missing/nonregular disjoint-source refusal despite working repairs                                            |
| Inject unreadable selected manifest, policy or disjoint mapped blob reader                       | TEST-AXES-110 emits named cannot-read-selected-blob refusal; these are reader dependency faults, not filesystem permission claims |
| Independently omit report source mode or digest equality                                         | TEST-AXES-109 accepts substituted upstream source tuple                                                                           |
| Remove same-path digest or mode agreement                                                        | TEST-AXES-111 accepts later selected-byte or mode substitution on a shared path                                                   |
| Remove manifest digest pin or complete structure/targets-array validation                        | TEST-AXES-109/110 accepts wrong byte pin or loses named malformed-manifest refusal                                                |
| Independently drop reviewed-empty policy, descendant or target detection                         | TEST-AXES-110 accepts the corresponding contradictory committed state                                                             |
| Remove fixed policy path or digest pin                                                           | TEST-AXES-110 accepts foreign policy path or changed policy digest                                                                |
| Bypass shared policy decoding or omit shared mapping validation                                  | TEST-AXES-110 accepts unsupported policy schema or loses exact mapping diagnosis                                                  |
| Omit shared discovery, remove immediate-child projection or widen suffix discovery               | TEST-AXES-110 accepts unmapped suffix file/directory child or rejects ordinary nested source                                      |
| Remove selected-file ordering/completeness or intersection                                       | TEST-AXES-108 emits incomplete/unsorted selection or populated disjoint intersection                                              |
| Reverse, duplicate or truncate collection; reverse, duplicate or omit manifest from source union | TEST-AXES-108/111 fails exact complete canonical collection/source assertions                                                     |
| Replace complete report/authority, zero authority digest, promote any unknown membership         | TEST-AXES-108 fails exact complete envelope assertions                                                                            |
| Promote authentication or certification, hash empty payload                                      | TEST-AXES-108 fails explicit noncertifying invariant or independently computed full-payload digest                                |
| Independently remove CLI arity/mode guard or installed registration                              | TEST-AXES-111 loses named usage refusal or real built executable dispatch                                                         |

No global classification, scenario join, coverage/admission, source reconciliation, StepBlockage,
receipt, push, integration, deployment, host gate or full repository acceptance is claimed. Parent
Tasks 2.1/2.2a/2.2/4.1 remain open. Independent Astra review and coordinator release checks remain
separate from these synthetic bounded adapter fixtures.

Final scoped acceptance (Bun 1.4.2):

```sh
cd apps/twilight-structure/twilight-burokrat/cli
bun test --preload ../../../../tools/test/scratch/preload.ts ./src/evidence/browser-architecture.test.ts ./src/evidence/browser-conformance.test.ts ./src/evidence/test-reports.test.ts ./src/evidence/level-facts.test.ts ./src/architecture-level.test.ts --timeout=120000
```

Exit 0: **109 pass, 0 fail, 1,319 assertions across five files**, 149.89 seconds
(`/tmp/browser-architecture-focused-final.log`). This includes all 20 new Browser Architecture
cases and real built installed dispatch. After this run the nested discovery fixture was strengthened
from `nested/ordinary.test.ts` to `nested/ordinary.architecture.test.ts`: the affected production
case passed again (1 pass, 0 fail, 14 assertions;
`/tmp/browser-architecture-nested-suffix-final.log`), explicitly proving that a nested suffix file
is outside immediate-child discovery. Production behavior did not change after acceptance.

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:lint:source --skip-nx-cache --output-style=static`: exit 0, target successfully ran uncached (`/tmp/browser-architecture-lint-final.log`).
- The corresponding scoped `twilight-burokrat:typecheck` target: exit 0, successfully ran uncached (`/tmp/browser-architecture-typecheck-final.log`).
- The corresponding scoped `twilight-burokrat:build` target: exit 0, Burokrat and its three dependencies successfully ran uncached (`/tmp/browser-architecture-build-final.log`).
- Changed-file `bunx prettier --check` and `git diff --check`: exit 0 (`/tmp/browser-architecture-format-check-final.log`).
- Final production `scenario validate . openspec/changes/test-axes/specs/test-axes/spec.md`: exit 0, `{"unidentified":[]}` (`/tmp/browser-architecture-provenance-final.json`). A fresh committed-base comparison confirms all 155 previous journal events unchanged and only TEST-AXES-108..111 appended.
- `OPENSPEC_TELEMETRY=0 BUN_TMPDIR=/tmp/browser-architecture-bun-tmp bunx --bun @fission-ai/openspec@1.12.0 validate test-axes --strict --json`: exit 0, 1/1 valid, zero issues (`/tmp/browser-architecture-openspec-strict-final.json`).
- The same pinned runner's `validate --all --json`: exit 0, 213/213 valid (195 changes, 18 specs), zero failures (`/tmp/browser-architecture-openspec-all-final.json`).

Task 4.1b.11b is implemented. Task 4.1b.11c remains unchecked pending independent Astra review;
all coordinator-only integration, exact-head CI and host-gate checks in 4.1b.11d are unperformed.
No release or repository-wide acceptance follows from this bounded synthetic test evidence.

## 4.1b.12 Browser Performance membership — 2026-10-15

Base: exact Browser Architecture APPROVED commit
`742b8aeb32d7fc2bb07ab68a5aac8481e01c5c28`, isolated worktree
`/tmp/wbs-browser-performance-sol-20261015` created from the existing isolated clone.
No root checkout edits, push, release restack, host gate or integration were performed.
Dependencies are linked from the approved Browser Architecture worktree.

The real production allocator command
`bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts scenario allocate . openspec/changes/test-axes/specs/test-axes/spec.md`
issued TEST-AXES-112..115 (`/tmp/browser-performance-allocation.json`). All 159 prior
journal events were compared equal to the emitted prefix before applying its journal/spec;
only the four new allocation events were appended. Production provenance returned
`{"unidentified":[]}` (`/tmp/browser-performance-provenance.json`).

The first positive actual `invokeCli` assertion failed with
`unknown command: inspect-browser-performance` (`/tmp/browser-performance-red.log`).
The first adapter run had 10 passing tests and two incorrect expected diagnostic strings:
config disagreement is reported before an independently changed authority config path can
reach containment, and the shared decoder says `duplicate Performance case ID`.
Those expectations were corrected and a coherent outside-root config negative was added.
The complete new suite then passed 14 tests, 386 assertions
(`/tmp/browser-performance-green3.log`). A subsequent Prettier invocation used a root-relative
path from the CLI directory and matched no file; rerunning it from the repository root passed.
No acceptance is attributed to that failed format invocation.

The command captures exact immutable Git identity before joining the complete real Browser
report and closed v1 external authority. It reads the pinned project manifest, Performance
declaration/config and every declared fixture from selected regular blobs within projectRoot.
All manifest/declaration/config pins are distinct; manifest is exactly projectRoot/project.json.
It uses `decodePerformanceCases` and `digestPerformanceDeclaration`, requires matching
Performance config/project and nonempty fixtures, and validates disjoint sources before
intersection. Browser config/project remain independent. It retains complete report outcomes,
parsed authority/raw digest, complete decoded declaration/semantic digest, sorted unique
Browser collection, full fixture set, intersection and agreeing deduplicated source tuples.
Manual/Conformance/Architecture remain unknown; authentication is absent and certification false.
The full canonical payload is digested. No runner, reviewed-empty shortcut, classification,
isolation, coverage, admission or scenario-join credit is introduced.

Watched faults: `/tmp/browser-performance-mutations.json` and
`/tmp/browser-performance-mutations-extra.json` record **55 caught mutations**, each with
nonzero test status and a real failed production assertion. Full outputs are
`/tmp/browser-performance-fault-<name>.log`; summary logs are
`/tmp/browser-performance-mutations.log` and `/tmp/browser-performance-mutations-extra.log`.
Sources were restored after every fault; adjacent `Proof:` comments were added afterward.

| Injected fault                                                                                                                                            | Observed production assertion                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove each of the 25 SHA, selection, report/authority, scope, pin, selected-source, agreement, manifest, config/project and nonempty guards individually | TEST-AXES-113/114/115 loses its named refusal, including coherent upstream identity substitution, annotated tags and disjoint fixtures despite working-tree repairs |
| Nonfatal UTF-8, empty JSON substitution or bypassed closed authority decoder                                                                              | TEST-AXES-113 loses the exact malformed authority refusal                                                                                                           |
| Bypass shared declaration decoder                                                                                                                         | TEST-AXES-114 loses malformed declaration refusal                                                                                                                   |
| Omit all declared fixture reads                                                                                                                           | TEST-AXES-114 accepts a missing disjoint committed fixture despite working repair                                                                                   |
| Inject unreadable selected manifest, declaration, config or fixture dependency                                                                            | TEST-AXES-114 observes named cannot-read-selected-blob refusals separately from absence; these are reader faults, not filesystem permission claims                  |
| Delete authority or replace it with directory                                                                                                             | TEST-AXES-113 observes distinct ENOENT and EISDIR refusals                                                                                                          |
| Omit same-path mode/digest agreement or upstream source mode/digest equality independently                                                                | TEST-AXES-113/115 accepts the substituted tuple or later shared-path bytes/mode                                                                                     |
| Replace semantic digest, reverse or duplicate fixture selection, omit complete declaration, return all fixtures as intersection                           | TEST-AXES-112 fails exact complete membership or disjoint-intersection assertions                                                                                   |
| Reverse/truncate Browser collection, duplicate source tuples or reverse source union                                                                      | TEST-AXES-112/115 fails complete sorted unique collection/source assertions                                                                                         |
| Replace complete report/authority or raw authority digest                                                                                                 | TEST-AXES-112 fails exact upstream and authority identity assertions                                                                                                |
| Promote any unknown membership, authentication or certification; digest an empty payload                                                                  | TEST-AXES-112 fails explicit noncertifying or independently recomputed full-envelope assertions                                                                     |
| Omit CLI arity/mode guards independently or remove installed registration                                                                                 | TEST-AXES-115 loses named usage refusal or built executable dispatch                                                                                                |

Parent Tasks 2.1/2.2a/2.2/4.1 remain open. Independent Astra review of the exact candidate
and coordinator restack onto #496 lineage, release/CI and host acceptance remain unperformed.

Final scoped acceptance (Bun 1.4.2):

```sh
cd apps/twilight-structure/twilight-burokrat/cli
bun test --preload ../../../../tools/test/scratch/preload.ts ./src/evidence/browser-performance.test.ts ./src/evidence/browser-architecture.test.ts ./src/evidence/browser-conformance.test.ts ./src/evidence/test-reports.test.ts ./src/evidence/level-facts.test.ts ./src/architecture-level.test.ts --timeout=120000
```

Exit 0: **123 pass, 0 fail, 1,705 assertions across six files**, 205.88 seconds
(`/tmp/browser-performance-focused-final.log`), including source and built installed dispatch.
Only proof/JSDoc comments and verification/task prose were adjusted during/after that run;
no production behavior changed after the restored-source acceptance began.

- `bun test libs/shared/domain/test-evidence/src --timeout=120000`: exit 0, 12 pass, 0 fail, 49 assertions (`/tmp/browser-performance-domain.log`).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:lint:source --skip-nx-cache --output-style=static`: exit 0, successful uncached target output (`/tmp/browser-performance-lint-final.log`). The initial parallel invocation temporarily yielded no target output; lint was rerun independently until fresh successful execution output was captured, with no acceptance based on an empty log.
- Corresponding scoped `twilight-burokrat:typecheck`: exit 0, successful uncached target output (`/tmp/browser-performance-typecheck-final.log`).
- Corresponding scoped `twilight-burokrat:build`: exit 0, successful uncached Burokrat build and three dependency tasks (`/tmp/browser-performance-build-final.log`).
- Pinned OpenSpec strict/all, final provenance, changed-file format, whitespace and journal-prefix confirmation are recorded below after the final prose update.

Task 4.1b.12b is implemented; 4.1b.12c/d remain open. No independent review, release,
exact-head CI, full repository gate or host acceptance is claimed.

- Final pinned `@fission-ai/openspec@1.12.0 validate test-axes --strict --json`: exit 0, 1/1 valid, zero issues (`/tmp/browser-performance-openspec-strict-final.json`).
- The same pinned runner's `validate --all --json`: exit 0, 213/213 valid (195 changes, 18 specs), zero failures (`/tmp/browser-performance-openspec-all-final.json`).
- Final production `scenario validate . openspec/changes/test-axes/specs/test-axes/spec.md`: exit 0, `{"unidentified":[]}` (`/tmp/browser-performance-provenance-final.json`). Fresh comparison to the exact approved base preserved all 159 prior journal events and appended only TEST-AXES-112..115.
- Final changed-file Prettier and `git diff --check`: exit 0 (`/tmp/browser-performance-format-final.log`).

### Browser Performance clock-name review repair — 2026-10-15

Candidate `dc5ac746b690dafc0fe2500a20c869dc8be6c826` on parent
`742b8aeb32d7fc2bb07ab68a5aac8481e01c5c28` introduced a local `performance`
binding. The required package clock detector treats that identifier as a clock
reference. Renamed the binding to `performanceMembership` and retained the explicit
`memberships.performance` output key. This is a mechanical naming correction;
no safety guard, schema or serialized value changed.

- File-local production `findClockReads` comparison of the original committed file
  and corrected working file: original references at lines 214 and 243; corrected
  references `[]`, exit 0 (`/tmp/browser-performance-rename-clock-proof.json`).
  This before/after observation supplies the relevant breakability evidence for
  the naming correction; existing safety guards retain their prior mutation proofs.
- Required `no-ambient-clock.test.ts`: exit 1, 0 pass / 1 fail. Exactly 19 inherited
  references remain in `evidence/scenario-ledger.ts` and
  `evidence/scenario-ledger-manual.fixture.ts`; none remain in Browser Performance
  (`/tmp/browser-performance-rename-clock.log`). This suite is not green.
- Scoped uncached `twilight-burokrat:lint:source` and `twilight-burokrat:typecheck`:
  exit 0 with successful Nx target output (34.1s and 2.2s respectively).
- Shared test-evidence plus tool-devsync workspace-projects and ESLint-boundaries:
  exit 0, 55 pass / 0 fail, 222 assertions across three files (26.19s), including
  the effective production/test package boundary assertions
  (`/tmp/browser-performance-rename-separation.log`).
- Pinned OpenSpec 1.12.0 strict `test-axes`: 1/1 valid, zero issues; all validation:
  213/213 valid, zero failures (`/tmp/browser-performance-rename-openspec-{strict,all}.json`).
- Focused six-file Browser Performance/Architecture/Conformance, report, level-facts
  and architecture-level regression command recorded above: exit 0, 123 pass /
  0 fail, 1,705 assertions (203.45s), including built installed executables
  (`/tmp/browser-performance-rename-focused.log`).
- Scoped uncached `twilight-burokrat:build`: exit 0, successful target and three
  dependency tasks (4.4s; `/tmp/browser-performance-rename-build.log`).
- Final source and verification Markdown Prettier plus `git diff --check`: exit 0.

Exact-SHA Astra rereview, inherited Scenario Ledger repair/restack, release, CI,
host gate and deployment remain coordinator work. No push or host gate ran here.

## Sixth-wave aggregate verification — 2026-10-16

Isolated clone `/tmp/puni-wave6-aggregate-20261016`, stacked on exact fifth-wave
`a3ee6e19c7931eb844dd273f607de5eee3640b8e` (#496). Applied reviewed source packets
Browser Architecture `742b8aeb32d7fc2bb07ab68a5aac8481e01c5c28` (#497), Browser
Performance `dc5ac746b690dafc0fe2500a20c869dc8be6c826` plus corrected tip
`d710677f4eb14a0a090067ab75518cd2426078e7` (#498), and F9 restart state
`173c68ec10d9ef672426c6287280160b2245d3c7` (#499). The only conflict was this
append-only verification log; both inherited and source sections were preserved.
No production behavior was added during aggregation.

Evidence lives in `/tmp/puni-wave6-evidence/`:

- Frozen Bun 1.4.2 install passed: 1,573 installs across 1,447 packages, no changes.
  The initial invocation failed because its default temporary directory was read-only;
  `BUN_TMPDIR=/tmp/puni-wave6-bun-tmp` succeeded.
- The complete `src/no-ambient-clock.test.ts` detector passed: 1 test, 0 failures,
  2 assertions (`no-ambient-clock.log`). The inherited fifth-wave Scenario Ledger
  rename and reviewed Browser Performance correction coexist without clock findings.
- Focused F9 `dev-environment.test.ts` passed: 33 tests, 0 failures, 81 assertions,
  including installed Nx shared-ownership blocking, independent private-state launch,
  and preservation of original database bytes and ownership (`f9-focused.log`).
- Shared test-evidence, workspace-projects and ESLint-boundaries passed: 55 tests,
  0 failures, 222 assertions (`separation.log`).
- Uncached scoped Nx `lint:source`, `lint`, `typecheck` and `build` for
  `twilight-burokrat,tool-devsync` passed in 35 seconds (`scoped-static.log`).
  Burokrat's additional `lint` invocation explicitly reported inactive external
  activation; that invocation grants no installed K6 or certification credit.
- Pinned OpenSpec 1.12.0 strict validation passed for `test-axes` and
  `forge-restart-state`; all validation passed 215/215 (197 changes, 18 specs),
  zero failures (`openspec-{test-axes,forge,all}.json`). Production scenario
  provenance returned `{"unidentified":[]}` (`provenance.json`).
- The exact source union contains 21 paths. Every non-log blob equals its last
  reviewed source packet; the log preserves the base and complete source append.
  The entire prior scenario-allocation journal prefix is unchanged
  (`path-blob-union.json`). Scoped Prettier and whitespace checks passed.

F9 full `tool-devsync:test`, disposable runtime acceptance, cold OOM resolution and
F9 acceptance remain unverified. No full repository gate, h2puni gate, merge or
deployment ran in this aggregate worker. Source mutation proofs remain attached to
the original packet verification sections; no new safety guard was introduced.

- Focused Browser Performance/Architecture/Conformance, test-report, level-facts,
  architecture-level and package clock suites passed: 124 tests, 0 failures,
  1,707 assertions across seven files, 201.04 seconds (`browser-focused.log`),
  including built installed command dispatch. Command: `bun test --preload
../../../../tools/test/scratch/preload.ts ./src/evidence/browser-performance.test.ts
./src/evidence/browser-architecture.test.ts ./src/evidence/browser-conformance.test.ts
./src/evidence/test-reports.test.ts ./src/evidence/level-facts.test.ts
./src/architecture-level.test.ts ./src/no-ambient-clock.test.ts --timeout=120000`
  from the Burokrat CLI directory.

## Browser Conformance explicit reviewed-empty 4.1b.13 (2026-10-16)

Bounded local candidate based exactly on reviewed aggregate
`a628558e3ca17e13bbc05e70cfef791805de78aa`, cloned from
`/tmp/puni-wbs-final-integration-20261016` into
`/tmp/puni-browser-empty-20261016`. The root workspace was not edited.
The existing command now accepts closed authority v2 with explicit committed or
reviewed-empty disposition. Observation schemaVersion stays 1; v1 bytes and all
identity/report/source joins remain intact. Empty means an external review assertion,
with valid selected manifest targets and no own Conformance property. Every present
value contradicts it. Other memberships stay unknown, authentication absent and
certification false. Parent WBS080.39 and Tasks 2.1/2.2a/2.2/4.1 remain open.

### Preparation and production RED/GREEN

- `BUN_TMPDIR=/tmp/puni-browser-empty-install bun install --frozen-lockfile`:
  exit 0; Bun 1.4.2 checked 1,573 installs across 1,447 packages without changes.
  The first attempt lacked a writable Bun temporary directory and refused EROFS.
- Global `openspec` was absent. The cached pinned package alone could not resolve
  commander/diff. Installed required OpenSpec 1.12.0 in an isolated tool directory
  with `BUN_TMPDIR=/tmp/puni-browser-empty-install BUN_INSTALL=/tmp/puni-browser-empty-install bun add --cwd /tmp/puni-browser-empty-tools --exact @fission-ai/openspec@1.12.0`:
  exit 0, 71 packages installed. Restricted DNS initially refused; the authorized
  network escalation completed the pinned install. All OpenSpec commands below use
  `bun /tmp/puni-browser-empty-tools/node_modules/.bin/openspec`.
- Ran `status --change test-axes --json` and `instructions apply --change test-axes --json`;
  read the returned local sdd-lean artifacts. Existing progress was 43/54 tasks.
- `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts scenario allocate . openspec/changes/test-axes/specs/test-axes/spec.md`:
  exit 0, allocated TEST-AXES-116..119. Persisted returned specMarkdown and journal.
  Fresh comparison with the exact base preserved every prior 163 journal events and
  appended only those four (167 total; `/tmp/browser-empty-journal-proof.json`).
- Before implementation, `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/browser-conformance.test.ts --test-name-pattern 'TEST-AXES-11[6-9]' --timeout 120000`:
  1 passed, 5 failed, 17 filtered; production stderr rejected v2 because version 1
  was required and conformance undeclared (`/tmp/browser-empty-red.log`).
- After implementation, the same focused command passed 6 tests with 133 assertions
  (`/tmp/browser-empty-green.log`). Subsequent added absence/nonregular/authority
  checks and built installed v2 success/contradiction also passed in the complete
  Browser Conformance suite: 24 tests, 481 assertions, 0 failures in 71.56 seconds
  (`/tmp/browser-empty-full.log`). Final regressions below include the final tests.
- A separate temporary compatibility test loaded the original production module from
  exact base Git bytes, dispatched it and the changed CLI against the same committed
  fixture and authority, and compared stdout bytes: 1 passed, 4 assertions, 0 failures
  (`/tmp/browser-empty-compatibility.log`). Temporary source and test copies were
  removed. The committed TEST-AXES-118 independently constructs the exact legacy
  envelope and checks serialized stdout, including field order and digest.

### Watched production faults

Each fault was injected into the real inspector, its targeted test invoked the real
CLI, the named assertion failed with exit 1, and original source was restored before
the next fault. `/tmp/browser-empty-mutations.log` and individual
`/tmp/browser-empty-fault-<name>.log` contain fresh observations. Adjacent Proof
comments name these tests.

| Fault                                              | Observed production assertion failure                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| Treat every v2 disposition as reviewed-empty       | TEST-AXES-118 lost committed disjoint success                               |
| Remove own Conformance property contradiction      | TEST-AXES-117 accepted a committed null target and emitted success JSON     |
| Widen authority version 2 to 2 or 3                | TEST-AXES-117 lost the named closed-authority schema refusal                |
| Widen disposition to permit unknown                | TEST-AXES-117 lost the named closed-authority schema refusal                |
| Remove authority candidate equality                | TEST-AXES-119 accepted a substituted candidate pin and emitted success JSON |
| Remove targets array rejection                     | TEST-AXES-117 accepted array-valued targets under reviewed-empty authority  |
| Remove version dispatch before reading disposition | TEST-AXES-118 lost legacy version-1 byte-preservation success               |
| Remove v2 disposition closed-key validation        | TEST-AXES-117 accepted extra disposition fields                             |
| Remove v2 authority closed-key validation          | TEST-AXES-117 accepted extra authority fields                               |
| Make v2 disposition optional                       | TEST-AXES-117 lost the named missing-disposition schema refusal             |

The final four faults ran after the full regression suite with source restoration
in `finally` (`/tmp/browser-empty-closure-faults.log`).
After all restorations, `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/browser-conformance.test.ts --test-name-pattern 'TEST-AXES-11[6-8]|TEST-AXES-119.*identity' --timeout 120000`
passed 7 tests, 165 assertions, 0 failures, 17 filtered in 12.53 seconds
(`/tmp/browser-empty-final-restored.log`).

The tests separately model selected manifest unreadability by breaking the real
selected-blob reader, and absence/nonregular manifest paths by committed Git state,
then repair working files to prove those repairs confer no authority. External
authority absence and directory unreadability produce distinct ENOENT/EISDIR.
These are bounded reader faults and explicit directory reads, not filesystem mode
claims. Null, false, empty object, array, string and supported Conformance target
values all contradict reviewed-empty. No candidate source is executed.

### Scoped validation

- Final focused regression command from repository root was `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/{browser-conformance,browser-architecture,browser-performance,browser-memberships,test-reports,level-facts,performance-levels,performance-scenarios}.test.ts --timeout 120000`:
  exit 0, **166 tests, 2,060 assertions, 0 failures across seven files**, 323.26 seconds
  (`/tmp/browser-empty-regressions.log`). The listed standalone browser-memberships
  test file does not exist and Bun ignored it; actual Browser Memberships tests
  TEST-AXES-093..095 live in test-reports.test.ts and were collected and passed.
  This count is the observed seven-file collection, not an eight-file claim.
  It includes final built installed legacy/v2 success and contradictory v2 refusal.
- `NX_DAEMON=false bunx nx run twilight-burokrat:lint:source`: exit 0, uncached
  (`/tmp/browser-empty-lint.log`).
- `NX_DAEMON=false bunx nx run twilight-burokrat:typecheck`: final exit 0, uncached
  (`/tmp/browser-empty-typecheck.log`). Initial typecheck found widened mode inference
  in extracted shared schema fields; `as const` preserves the literal definition.
- `NX_DAEMON=false bunx nx run twilight-burokrat:build`: exit 0; CLI and three
  dependencies built, cache 0/4 (`/tmp/browser-empty-build.log`). Nx reported denied
  worker sockets and explicitly ran plugins in its main process.
- `bunx eslint apps/twilight-structure/twilight-burokrat/cli/src/evidence/browser-conformance.ts apps/twilight-structure/twilight-burokrat/cli/src/evidence/browser-conformance.test.ts`:
  exit 0 after final source/test edits (`/tmp/browser-empty-final-eslint.log`).
- Pinned `openspec validate test-axes --strict --json`: 1/1 valid, no issues.
  Pinned `openspec validate --all --json`: 215/215 valid, 0 failures
  (`/tmp/browser-empty-openspec-strict.json`, `/tmp/browser-empty-openspec-all.json`).
- Production `scenario validate . openspec/changes/test-axes/specs/test-axes/spec.md`:
  exit 0, `{"unidentified":[]}` (`/tmp/browser-empty-provenance.json`).
- Changed-file `bunx prettier --check` passed for both Browser Conformance files,
  README, proposal/design/tasks/verify/spec and scenario allocation journal
  (`/tmp/browser-empty-final-format.log`). `git diff --check` passed.

Independent Astra review of the exact local commit remains required. No push, PR,
merge, host gate, full Nx gate, release, live activation, Browser execution,
source reconciliation or WBS completion was performed in this worker. Source and
built installed executable fixture observations remain diagnostic and noncertifying.

## Browser level composer 4.1b.14 (2026-10-16)

This bounded packet starts exactly on reviewed Conformance candidate
`f29ca96ee3f45cf8e4bac5bff9e043662df329d0`, tree
`396869ffdbf8d205fec1d16325bea22b9c0bd6bd`, in the same isolated
`/tmp/puni-browser-empty-20261016` clone. Root reported independent Astra approval
of that exact candidate with no P0–P3 findings and an independent 24-test,
493-assertion run. That review completes 4.1b.13d's review obligation; coordinator
integration, release and host acceptance remain separate.

The composer calls the real Browser Memberships, Conformance, Architecture and
Performance readers in order, captures an exact selected snapshot, verifies full
report/envelope digests and complete collection/scope/manifest/source joins, and
finally rereads the actual Browser report. Manual must be explicitly reviewed-empty;
generic other rows and each adapter's unrelated rows remain unknown. Shared
first-match classification resolves Conformance before Architecture before
Performance, then only an admitted unmatched collection member becomes Browser.
Complete upstream observations, failed/skipped outcomes and source unions remain
in the full noncertifying output. No external observation JSON is accepted.

### Planning and production RED/GREEN

- Re-read LLM_README, the test-axes artifacts and adjacent real readers, callers,
  tests and shared classifier. The root confirmed the concrete join shape and final
  publication re-read matched Astra's approved contract. Recorded bounded intent,
  design and ordered TDD tasks before implementation.
- Pinned OpenSpec 1.12.0 `status --change test-axes --json` and
  `instructions apply --change test-axes --json` selected local sdd-lean;
  returned progress was 46/62 complete. The same isolated pinned executable from
  4.1b.13 is used below: `bun /tmp/puni-browser-empty-tools/node_modules/.bin/openspec`.
- Production `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts scenario allocate . openspec/changes/test-axes/specs/test-axes/spec.md`
  allocated TEST-AXES-120..124; persisted returned specMarkdown and journal
  (`/tmp/browser-levels-allocation.json`).
- Real committed fixture and four valid external authorities reached the new
  production command: `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/browser-levels.test.ts --test-name-pattern TEST-AXES-120 --timeout 120000`
  failed exactly with unknown command (`/tmp/browser-levels-red.log`). The
  separate initial negative run also failed all four tests on missing dispatch
  (`/tmp/browser-levels-negatives-red.log`).
- After implementation the isolated/precedence production tests passed 2 tests,
  38 assertions (`/tmp/browser-levels-green.log`). Initial complete composer run
  passed 12 tests, 222 assertions, 0 failures in 105.18 seconds including source
  and built installed isolated/wrong-level dispatch (`/tmp/browser-levels-full.log`).
- Added actual multi-file immutable discovery/execution/JUnit/manifest publication
  and complete sorted cross-row bindings: 1 test, 14 assertions, 0 failures
  (`/tmp/browser-levels-multiple.log`). Final combined checks are recorded below.

### Watched composer joins

Each targeted guard assertion first passed on the unchanged production source,
then failed after that guard was removed, and source was restored before the next
case. These use the committed fixture and the same production CLI fault helper as
the permanent scenario tests; temporary named WATCH tests select one assertion at
a time. No supplied observation JSON is a production operand. Faulting a reader
changes its real return only after the original inspector has read and validated
the real fixture, then recomputes the full envelope (and nested report where
appropriate) to prove semantic joins independently of stale digest detection.

First pass: all 19 baseline tests exited zero and all 19 guard removals failed
their named WATCH assertion with exit one (`/tmp/browser-levels-mutations.log`;
individual `/tmp/browser-levels-watch-<name>{,-baseline}.log`).

| Removed guard                             | Injected production dependency fault / observed failure                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Full observation digest                   | Conformance reader returned an invalid envelope digest; WATCH_observation-digest accepted it                  |
| Complete membership canonical uniqueness  | Duplicate committed selectors with canonical intersection; WATCH_complete-membership accepted them            |
| Complete intersection                     | Conformance files omitted a selected Browser overlap; WATCH_intersection accepted it                          |
| Nonempty collection                       | Review reader returned empty real-report projection; WATCH_empty lost its named refusal                       |
| Requested report revision                 | Coherent changed report revision and recomputed digests; WATCH_revision lost named requested-revision refusal |
| Requested candidate                       | Coherent changed report candidate and digests; WATCH_candidate lost selected-snapshot refusal                 |
| Requested Browser mode                    | Coherent changed report mode and digests; WATCH_mode lost requested-mode refusal                              |
| Common full report identity               | Changed invocation identity with valid digests; WATCH_report-join accepted mixed report observations          |
| Complete collection equality              | Duplicate collection paths; WATCH_collection accepted them                                                    |
| Explicit complete generic review          | Manual became unknown; WATCH_review accepted classification without reviewed Manual absence                   |
| Unrelated adapter unknown rows            | Conformance reader promoted Manual to reviewed-empty; WATCH_unknown accepted it                               |
| Overlapping source agreement              | Substituted source digest; WATCH_source accepted disagreement                                                 |
| Common project root                       | Foreign Conformance project root; WATCH_root accepted it                                                      |
| Common project manifest pins              | Changed manifest digest; WATCH_manifest-pin lost its named common-pin refusal                                 |
| Unique adapter source paths               | Duplicate source tuple; WATCH_duplicate accepted it                                                           |
| Every Browser source in every adapter     | Omitted reported file tuple; WATCH_missing-browser accepted omission                                          |
| Every pinned manifest source              | Omitted manifest tuple; WATCH_missing-manifest lost its named missing-manifest refusal                        |
| Manifest tuple equals its pin             | Changed manifest source bytes; WATCH_manifest-source lost its named source/pin refusal                        |
| Final publication identity and collection | Fifth real report read changed invocation identity; WATCH_drift accepted the changed publication              |

Second pass: 23 further original baseline assertions passed and all 23 injected
faults failed (`/tmp/browser-levels-more-mutations.log`), for 42 watched fault variants.
This includes named SHA, committed-kind and annotated tag-object identity refusals;
separate source-mode and nested report-digest faults; independently disconnected
Conformance/Architecture/Performance classifier sets and disabled shared classifier;
forced isolation; unsorted or duplicate source output; substituted upstream digest;
omitted nested outcomes; promoted authentication or certification; empty-payload
digest; deleted Browser eligibility in a broken classifier; skipped final real
report read after physical report corruption; independently removed CLI arity,
mode and wrong-level status mappings; and deleted built installed registration.
The physical corruption proof passed with the real final read, then failed when
that read was replaced by the earlier observation. Installed registration removal
produced the actual executable's unknown-command refusal instead of success.

All temporary WATCH files were removed and source restored in `finally` before
final validation. Adjacent production Proof comments identify the observed
scenario assertions. These bounded reader faults are not independent authentication
or whole-repository evidence.

Final review found a valid-input issue in JSON.stringify comparison of generic
review row objects: reversed object key order was incorrectly refused. Added a
production test, observed RED with the named review refusal, then compared rows
canonically. The new valid-order test plus explicit invalid-review regression
passed 2 tests, 28 assertions, 0 failures (`/tmp/browser-levels-review-order-red.log`,
`/tmp/browser-levels-review-order-green.log`). Raw authority bytes remain digest-bound.

After that correction, replayed the removed canonical review guard in an isolated
copy of the actual inspector through the real CLI route. Its explicit-review test
failed because unknown Manual was accepted with CLI exit zero
(`/tmp/browser-levels-review-guard-replay.log`). The actual source file was not
mutated during the concurrent regression run; the temporary inspector copy and
preload were removed. This rechecks the same review-guard fault variant after
the canonical-comparison fix.

### Scoped validation and limits

- Final restored six-file regression command from repository root:
  `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/{browser-levels,browser-conformance,browser-architecture,browser-performance,test-reports,performance-levels}.test.ts --timeout 120000`.
  Exit 0, **126 tests, 1,838 assertions, 0 failures across all six files**, 437.20
  seconds (`/tmp/browser-levels-regressions.log`). This includes the final canonical
  review fix and real installed isolated/wrong-level dispatch. Browser Memberships
  tests are in test-reports.test.ts; all six listed files exist and were collected.
- `NX_DAEMON=false bunx nx run twilight-burokrat:lint:source`: final exit 0,
  uncached (`/tmp/browser-levels-lint.log`). Initial lint found four style issues
  (interface spelling, redundant optional chain, manifest optional chain and
  modeled Browser fallthrough spelling), which were corrected; no suppressions.
- `NX_DAEMON=false bunx nx run twilight-burokrat:typecheck`: final exit 0,
  uncached (`/tmp/browser-levels-typecheck.log`).
- `NX_DAEMON=false bunx nx run twilight-burokrat:build`: final exit 0; CLI rebuilt,
  three unchanged dependencies came from cache (`/tmp/browser-levels-build.log`).
  Nx reported denied plugin-worker sockets and explicitly ran plugins in its main
  process; these outcomes are scoped task evidence, not plugin isolation evidence.
- Pinned `openspec validate test-axes --strict --json`: 1/1 valid, no issues;
  pinned `openspec validate --all --json`: 215/215 valid, no failures
  (`/tmp/browser-levels-openspec-strict.json`, `/tmp/browser-levels-openspec-all.json`).
- Production `scenario validate . openspec/changes/test-axes/specs/test-axes/spec.md`:
  exit 0, `{"unidentified":[]}` (`/tmp/browser-levels-provenance.json`).
- Fresh exact-base journal comparison preserved all 167 prior f29 events and
  appended only TEST-AXES-120..124, 172 total (`/tmp/browser-levels-journal-proof.json`).
- Changed-file Prettier checks passed on the complete eleven-file packet
  (`/tmp/browser-levels-final-format.log`); `git diff --check` passed.

No upstream adapter source changed. These are committed scratch publications and
built executable observations; no Browser runner or candidate code executed.
No push, PR, host gate, full Nx gate, exact-head CI, release, deployment, live
activation, receipt, source reconciliation, T2, coverage, admission or WBS closure
ran in this worker. The exact local candidate requires independent Astra review;
the coordinator owns integration and release/host acceptance. Parent tasks and
WBS080.39 remain open.

### Browser composer clock-name CI repair — 2026-10-16

Hosted PR #507 head `f4b89c05ae8162f4da3d13518b11aab3620e5c35` failed job
`116727021767`: `twilight-burokrat:test` was the sole failed task, with 1,608
passing tests and one failure across 82 files. The sole failure was the existing
`the Burokrat package reads no clock` production policy test, which rejects value
identifiers named `performance` even when the binding contains recorded facts.
The downloaded job log showed no unrelated failure.

Renamed the local Browser composer binding to `performanceObservation`, retaining
the serialized `performance` property explicitly. The scanner and policy test are
unchanged. This mechanical repair requires no new behavior spec or safety check.

Proof: before the rename, the exact production command
`bun test apps/twilight-structure/twilight-burokrat/cli/src/no-ambient-clock.test.ts --test-name-pattern 'the Burokrat package reads no clock'`
exited 1 with zero pass, one fail and all ten reported `performance` identifiers
in `evidence/browser-levels.ts`. After the rename, the same command exited 0 with
one pass, zero fail and two assertions.

Scoped uncached `twilight-burokrat:lint:source` and `twilight-burokrat:typecheck`
passed. Pinned `bunx @fission-ai/openspec@1.12.0 validate test-axes --strict --json`
passed 1/1; `validate --all --json` passed 219/219. Nx reported denied plugin
worker sockets and used its documented main-process fallback during lint.

Focused composer command:
`TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/browser-levels.test.ts --preload ./tools/test/scratch/preload.ts --timeout=120000`
passed 14 tests, 242 assertions, zero failures in 101.30 seconds, including actual
built installed isolated and wrong-level executable observations
(`/tmp/pr507-browser-levels-fix-tests.log`).

No push, merge, host gate, full Nx gate, hosted rerun, release or deployment was
performed. Coordinator review and exact-head release checks remain required.

## Browser Performance explicit reviewed-empty 4.1b.15 — 2026-10-16

Base: published Browser PR #507 head `d6e601c19ec3a9e117ee26df08686e43869f4493`, isolated shared clone `/tmp/wbs-browser-performance-membership`. Scope: explicit v2 Performance reviewed-empty membership only; v1 stays committed, the output stays schemaVersion 1, unrelated memberships stay unknown, authentication absent and certifies false. No FE declaration, measured result, coverage or release claim was produced. Parent WBS080.39 and Tasks 2.1/2.2a/2.2/4.1 remain open.

The production `scenario allocate` proposed TEST-AXES-125..127. Its exact proposed spec and journal were persisted. Fresh comparison to the base preserves all 172 prior journal events and appends only those three allocations. Production `scenario validate . openspec/changes/test-axes/specs/test-axes/spec.md` returned `{"unidentified":[]}` (`/tmp/browser-performance-empty-provenance.json`).

TDD: the initial attempted test run could not resolve `@noble/hashes/sha2.js` through an inherited dependency symlink; that is not a RED. Installing this clone's frozen lockfile with `BUN_TMPDIR=/tmp BUN_INSTALL_CACHE_DIR=/tmp/browser-membership-bun-cache bun install --frozen-lockfile` succeeded (1573 installs checked). The four new production tests then failed at the actual v2 authority boundary: 0 pass, 4 fail, 47 assertions (`/tmp/browser-performance-empty-red.log`). After implementation they passed 4/4, 104 assertions (`/tmp/browser-performance-empty-green.log`).

### Watched production faults

Each fault was applied separately, its real source CLI assertion was observed failing, and source restored in a finally block. `/tmp/browser-performance-empty-mutations.json`, `/tmp/browser-performance-empty-extra-mutations.json` and `/tmp/browser-performance-empty-required-mutations.json` record 13 caught faults; the final committed-only distinct-pin fault below brings the total to 14. Per-fault logs use `/tmp/browser-performance-empty-{fault,extra-fault,required-fault}-<name>.log`.

| Injected fault                                   | Observed production assertion failure                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Remove `test:performance` own-target check       | TEST-AXES-126 accepted the selected contradictory target despite working manifest repair                    |
| Remove `test:performance:level` own-target check | TEST-AXES-126 accepted the level target despite working manifest repair                                     |
| Remove exact declaration-path comparison         | TEST-AXES-126 accepted malformed or symlink selected declaration despite working deletion                   |
| Remove declaration descendant comparison         | TEST-AXES-126 accepted a tracked directory at the fixed declaration path                                    |
| Widen v2 version to 3                            | TEST-AXES-126 lost the named authority-schema refusal                                                       |
| Widen empty kind to unknown                      | TEST-AXES-126 lost the named authority-schema refusal                                                       |
| Remove empty-object closure                      | TEST-AXES-126 accepted extra empty fields                                                                   |
| Remove v2 outer closure                          | TEST-AXES-126 accepted extra authority fields                                                               |
| Remove committed-object closure                  | TEST-AXES-127 accepted extra committed fields                                                               |
| Make disposition optional                        | TEST-AXES-126 lost the named boundary refusal for absent disposition                                        |
| Make empty kind optional                         | TEST-AXES-126 lost the named boundary refusal for absent kind                                               |
| Treat every v2 authority as empty                | TEST-AXES-127 lost committed parity                                                                         |
| Return unknown for empty membership              | TEST-AXES-125 lost the exact membership assertion                                                           |
| Disable committed-only distinct-pin guard        | TEST-AXES-113 lost the exact duplicate pinned-path refusal (`/tmp/browser-performance-empty-pin-fault.log`) |

Selected target values include null, empty object and malformed strings. Selected declaration shapes include malformed JSON, symlink and a tracked directory child. They are contradictions before declaration decoding, never absence. Existing source, pin and report checks still run before the empty branch. Adjacent production Proof comments name the observed faults.

### Acceptance

- Final restored `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/browser-performance.test.ts --timeout 120000`: exit 0, **21 pass, 0 fail, 528 assertions** (`/tmp/browser-performance-empty-performance-final.log`). Includes source and built installed empty dispatch, bounded usage, complete passed/failed/skipped reports, exact source union, full digest, closed v2 fields, legacy committed regression, committed v2 parity, and absent versus unreadable empty authority.
- `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/{browser-performance,browser-levels}.test.ts --test-name-pattern 'TEST-AXES-12[567]' --timeout 120000`: exit 0, **7 pass, 0 fail, 141 assertions** before the final committed-pin negatives were added (`/tmp/browser-performance-empty-final-new-tests.log`). Includes a real composer empty-success case with no synthetic Performance observation.
- Broad seven-file Browser/Performance-level/level-facts/test-report run: **169 pass, 0 fail, 2345 assertions** (`/tmp/browser-performance-empty-focused.log`). Source/helper edits and watched injections overlapped that run; it is diagnostic regression evidence, not acceptance of a frozen candidate. Final restored owning suites provide acceptance for changed paths.
- An additional isolated composer run returned **15 pass, 0 fail, 254 assertions** (`/tmp/browser-performance-empty-composer-final.log`); required-field schema mutations overlapped that copy, so the restored composer run below supersedes it for acceptance.
- Final restored composer `bun test apps/twilight-structure/twilight-burokrat/cli/src/evidence/browser-levels.test.ts --timeout 120000`: exit 0, **15 pass, 0 fail, 254 assertions**, including complete real empty composition and built installed dispatch (`/tmp/browser-performance-empty-composer-restored.log`).
- The original v1 distinct-pin check remains before selected-source reads, preserving its previous refusal order. After restoring that placement, the affected TEST-AXES-113 and new TEST-AXES-125..127 production cases passed: **11 pass, 0 fail, 260 assertions** (`/tmp/browser-performance-empty-order-final.log`).
- Final uncached scoped Nx `twilight-burokrat:typecheck`: exit 0, successful target output (`/tmp/browser-performance-empty-typecheck-last.log`). The first run caught union narrowing errors; these were corrected without casts.
- Final uncached scoped Nx `twilight-burokrat:lint:source`: exit 0, successful target output (`/tmp/browser-performance-empty-lint-acceptance.log`). Earlier attempts returned exit 1 without ESLint diagnostics; a standalone changed-file run identified four useless void expressions in test helpers, which were removed.
- Scoped uncached Nx `twilight-burokrat:build`: exit 0, successful build plus three dependencies (`/tmp/browser-performance-empty-build-restored.log`).
- Pinned `bunx --bun @fission-ai/openspec@1.12.0 validate test-axes --strict --json`: exit 0, 1/1 valid; `validate --all --json`: exit 0, **219/219 valid**, 201 changes and 18 specs (`/tmp/browser-performance-empty-openspec-{strict,all}.json`).

No full host gate, exact-head hosted CI, push, merge, release or independent Astra review was performed by this worker. Those remain coordinator acceptance. Synthetic fixture successes establish only the bounded adapter/composer contracts.

## Browser scenario diagnostic slice 4.1b.16 — local worker evidence (2026-10-16)

Base: exact reviewed #517 head `08a252fc087155f031bc99ae7fc99c1543c9758b`, isolated shared-object clone `/tmp/wbs-browser-scenarios-sol`. Source `/tmp/wbs-browser-performance-membership` remains clean. Only Browser scenario source/tests, thin dispatch/help, owning README and test-axes artifacts/journal are changed; F9/FE/#514 paths remain untouched.

### Allocation and RED

Production `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts scenario allocate . openspec/changes/test-axes/specs/test-axes/spec.md` allocated TEST-AXES-128..131. Before applying the proposed spec/journal, comparison proved the exact 175-event predecessor prefix preserved; precisely four allocations were appended. Fixture repositories also use the production allocator, with committed predecessor journal and selected successor specs. Candidate Browser and disjoint fixtures throw if executed.

The first actual `invokeCli` owning test failed with `unknown command: inspect-browser-scenarios`, 0 pass/1 fail (`/tmp/browser-scenarios-red.log`); implementing dispatch and composition made the initial real-publication test pass, 1 pass/0 fail (`/tmp/browser-scenarios-first-green.log`). The complete pipeline uses real Browser levels and whole-tree B3 readers; supplied observation JSON is never accepted.

### R5 watched production negatives

Each row below changed only production source temporarily, ran its named production CLI test, observed the test runner exit 1 with a failed assertion, and restored the exact source before continuing. Coherent dependency faults wrap the real Browser levels reader and reseal changed return values; selected-reader faults and selected Git tag objects exercise their named boundaries. This table claims bounded guard detection, not authenticated observations or whole-repository acceptance.

| Injected production fault | Observed failing test                               | Evidence                                                                   |
| ------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| `sha`                     | `symbolic and annotated`                            | `/tmp/browser-scenarios-watch-sha.log`; test runner exit 1                 |
| `committed`               | `WATCH_committed`                                   | `/tmp/browser-scenarios-watch-committed.log`; test runner exit 1           |
| `selected-revision`       | `symbolic and annotated`                            | `/tmp/browser-scenarios-watch-selected-revision.log`; test runner exit 1   |
| `revision`                | `WATCH_.*revision`                                  | `/tmp/browser-scenarios-watch-revision.log`; test runner exit 1            |
| `candidate`               | `WATCH_.*candidate`                                 | `/tmp/browser-scenarios-watch-candidate.log`; test runner exit 1           |
| `mode`                    | `WATCH_.*mode`                                      | `/tmp/browser-scenarios-watch-mode.log`; test runner exit 1                |
| `digest`                  | `WATCH_.*digest`                                    | `/tmp/browser-scenarios-watch-digest.log`; test runner exit 1              |
| `isolation`               | `real wrong level`                                  | `/tmp/browser-scenarios-watch-isolation.log`; test runner exit 1           |
| `policy`                  | `WATCH_policy`                                      | `/tmp/browser-scenarios-watch-policy.log`; test runner exit 1              |
| `scenarios-authority`     | `real wrong level`                                  | `/tmp/browser-scenarios-watch-scenarios-authority.log`; test runner exit 1 |
| `capability`              | `source usage`                                      | `/tmp/browser-scenarios-watch-capability.log`; test runner exit 1          |
| `terminal`                | `WATCH_terminal`                                    | `/tmp/browser-scenarios-watch-terminal.log`; test runner exit 1            |
| `citation-grammar`        | `terminal malformed citation`                       | `/tmp/browser-scenarios-watch-citation-grammar.log`; test runner exit 1    |
| `inactive`                | `terminal inactive citation` and `retired citation` | `/tmp/browser-scenarios-watch-inactive.log`; test runner exit 1            |
| `unidentified`            | `refuses unidentified`                              | `/tmp/browser-scenarios-watch-unidentified.log`; test runner exit 1        |
| `whole-tree`              | `unrelated competing`                               | `/tmp/browser-scenarios-watch-whole-tree.log`; test runner exit 1          |
| `nested`                  | `real nested suite`                                 | `/tmp/browser-scenarios-watch-nested.log`; test runner exit 1              |
| `digest-payload`          | `real isolated Browser`                             | `/tmp/browser-scenarios-watch-digest-payload.log`; test runner exit 1      |
| `certification`           | `real isolated Browser`                             | `/tmp/browser-scenarios-watch-certification.log`; test runner exit 1       |
| `authentication`          | `real isolated Browser`                             | `/tmp/browser-scenarios-watch-authentication.log`; test runner exit 1      |
| `exit`                    | `terminal missing citation`                         | `/tmp/browser-scenarios-watch-exit.log`; test runner exit 1                |
| `arity`                   | `source usage`                                      | `/tmp/browser-scenarios-watch-arity.log`; test runner exit 1               |
| `cli-mode`                | `source usage`                                      | `/tmp/browser-scenarios-watch-cli-mode.log`; test runner exit 1            |
| `missing-kind`            | `terminal missing citation`                         | `/tmp/browser-scenarios-watch-missing-kind.log`; test runner exit 1        |
| `case-order`              | `canonical cases`                                   | `/tmp/browser-scenarios-watch-case-order.log`; test runner exit 1          |
| `other-capability`        | `keeps passed failed skipped`                       | `/tmp/browser-scenarios-watch-other-capability.log`; test runner exit 1    |
| `scenario-inventory`      | `real isolated Browser`                             | `/tmp/browser-scenarios-watch-scenario-inventory.log`; test runner exit 1  |

Installed-registration removal also failed TEST-AXES-131 through the real built executable (`/tmp/browser-scenarios-watch-installed-registration.log`, test runner exit 1); the original Browser levels registration Proof remains adjacent to its original entry.

Adjacent `Proof:` comments name the corresponding injected faults and observed assertions. Restored runs cover complete nested levels/report/specifications, original passed/failed/skipped outcomes, active other-capability citations, retired/unknown/malformed/missing citations, real nested suites, requested unidentified refusal, unrelated B3 debt and competing overlays, exact candidate/revision/mode/policy/digests/isolation, authority absence versus unreadability, source/publication refusals, canonical ordering and full-envelope digest. Installed dispatch compares exact source JSON and exercises findings and usage exit statuses.

### Check limitations and corrected attempts

- `openspec` was absent on PATH and in the local `.bin`; the pinned `bunx --bun @fission-ai/openspec@1.12.0` executable provided required checks.
- Initial Nx without explicit isolation settings exited zero after socket-denial diagnostics without running a target (`/tmp/browser-scenarios-typecheck.log`). This is not accepted as typecheck evidence. Scoped Nx was rerun with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false` and actual target success output is required below.
- Initial real typecheck caught an unnameable inferred nested `Source` type and test assertions; an explicit named envelope using `ReturnType` and precise test report types fixed the errors without production casts. Initial ESLint identified import ordering, dot notation and an unnecessary test assertion; its autofix changed those mechanical test expressions. Initial all-skipped diagnostic fixtures were rejected by the existing upstream Browser contract; they now contain an unrelated passing active citation so the desired skipped citation reaches the scenario inspector. Removing `policy.scenarios` also changes the report policy identity, so that test repins the real report before checking the intended named scenario-authority refusal.
- Two edit/format attempts used repository-relative paths from the CLI subdirectory and failed before changing files; subsequent root-scoped commands applied the intended edits. Their test commands still ran and do not establish acceptance of later test additions.

No full h2puni host gate, exact-head hosted CI, push, merge, release or independent Astra review was performed by this worker. Coordinator acceptance and parent WBS080.39, T2, source reconciliation, coverage, certification and Tasks 2.1/2.2a/2.2/4.1 remain open. Synthetic fixture success proves only the bounded diagnostic contracts.

### Scoped acceptance

- Final restored owning source suite: `bun test --preload ../../../../tools/test/scratch/preload.ts ./src/evidence/browser-scenarios.test.ts --timeout=120000` from the CLI directory, exit 0, **28 pass, 0 fail, 202 assertions** (`/tmp/browser-scenarios-owning-final.log`). This run includes source/installed parity, outcomes, all coherent guard faults, nested citations and canonical identity after the mechanical test fixes.
- The final additional test `--test-name-pattern 'validly unobserved'` passed separately: exit 0, **1 pass, 0 fail, 6 assertions**, 28 intentionally filtered (`/tmp/browser-scenarios-unobserved-final.log`). It proves active other-capability observations leave every requested row unobserved without findings and exit zero. The final file has 29 tests in total.
- Restored installed executable after its registration-removal proof: exit 0, **1 pass, 0 fail, 9 assertions**, 28 intentionally filtered (`/tmp/browser-scenarios-installed-restored.log`). This compares complete source/installed JSON and checks findings exit 1 and refusal stderr without JSON.
- Scoped uncached Nx `twilight-burokrat:typecheck`, with `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`: exit 0 with `Successfully ran target typecheck` (`/tmp/browser-scenarios-typecheck-last.log`). The final added test was included.
- Scoped uncached Nx `twilight-burokrat:build` with the same environment: exit 0 with `Successfully ran target build ... and 3 tasks it depends on` (`/tmp/browser-scenarios-build-last.log`).
- Production `scenario validate . openspec/changes/test-axes/specs/test-axes/spec.md`: exit 0, `{"unidentified":[]}` (`/tmp/browser-scenarios-provenance.json`). Fresh predecessor comparison confirmed 175 prior journal events preserved plus exactly four allocations.
- Pinned OpenSpec `validate test-axes --strict --json`: exit 0, **1/1 valid**; `validate --all --json`: exit 0, **219/219 valid** (`/tmp/browser-scenarios-openspec-{strict,all}-last.json`).
- Changed-file Prettier check passed with `All matched files use Prettier code style!` (`/tmp/browser-scenarios-format-check.log`), and `git diff --check` exited 0. Final documentation changes are checked again before commit.
- Final uncached scoped Nx `twilight-burokrat:lint:source`, with daemon/plugin isolation disabled: exit 0 with `Successfully ran target lint:source` (`/tmp/browser-scenarios-lint-last.log`). Includes the final test addition and dispatch registration Proof placement.
- Broad regression from the CLI directory: `bun test --preload ../../../../tools/test/scratch/preload.ts ./src/evidence/browser-scenarios.test.ts ./src/evidence/browser-levels.test.ts ./src/evidence/browser-performance.test.ts ./src/evidence/browser-architecture.test.ts ./src/evidence/browser-conformance.test.ts ./src/evidence/browser-memberships.test.ts ./src/evidence/test-reports.test.ts ./src/evidence/performance-levels.test.ts ./src/evidence/performance-scenarios.test.ts ./src/rules/specifications.test.ts --timeout=120000`: exit 0, **263 pass, 0 fail, 3486 assertions across 9 actual files**, 562.80 seconds (`/tmp/browser-scenarios-focused-final.log`). The listed `browser-memberships.test.ts` does not exist at this head and Bun silently did not collect it; Browser membership TEST-AXES-093..095 cases live in `test-reports.test.ts` and did run. This broad run started with the 28-test Browser scenario file; the final additional unobserved case is covered separately and in the final owning run below. Mechanical test lint fixes and adjacent Proof comments overlapped the broad run. A separate installed-registration fault probe also ran after this run had finished its Browser scenario file; that probe was restored and its owning installed case was rerun successfully. This broad run is adjacent regression evidence, not frozen whole-repository acceptance. The final owning run below uses the fully restored final files.
- Final complete restored owning file: `bun test --preload ../../../../tools/test/scratch/preload.ts ./src/evidence/browser-scenarios.test.ts --timeout=120000` from the CLI directory: exit 0, **29 pass, 0 fail, 208 assertions**, 66.17 seconds (`/tmp/browser-scenarios-owning-29-final.log`). This supersedes the earlier 28-plus-one split for final owning-file acceptance and includes source and built installed dispatch after every production fault was restored.

## Browser scenario ledger slice 4.1c.4 — local draft evidence

Base: published #521 `4c5a35a211c6331aa9a75994b6066cf5feb6eef2`, isolated
`/tmp/wbs-browser-scenarios-sol`. This packet implements only version-two Browser
composition in the diagnostic capability ledger. It does not close 4.1c.3, parent
4.1, T2, source reconciliation, WBS080.39, coverage or certification. Publication,
host gate and independent Astra acceptance belong to the coordinator.

The production allocator emitted TEST-AXES-132..135. Fresh predecessor comparison
preserved all 179 prior journal events and appended exactly four allocations.
Production `scenario validate . openspec/changes/test-axes/specs/test-axes/spec.md`
returned `{"unidentified":[]}` (`/tmp/browser-ledger-provenance.json`). Fixture
repositories use the production allocator over a committed predecessor and successor;
the Browser and disjoint Performance source/config fixtures throw if executed.

Production RED: `bun test .../scenario-ledger-browser.test.ts --test-name-pattern
'v2 preserves' --timeout=60000` failed 0 pass/1 fail because version one rejected
schemaVersion 2 and the Browser member (`/tmp/browser-ledger-red.log`). Later
`WATCH_scope`/`WATCH_isolation` tests failed 0 pass/3 fail with accepted JSON before
the scope/isolation guard (`/tmp/browser-ledger-scope-red.log`); restoration produced
named refusals. The first owning pass reported 81 pass/0 fail across one actual
collected file (`/tmp/browser-ledger-owning-final.log`); subsequent mandatory-member
and unconditional-inspection tests are included in the final regression below.

The paired fixture emits immutable real Performance and Browser discovery/execution,
normalized/raw JUnit and manifests over one exact committed candidate and external
policy. Complete Browser/Performance B3 reports must match before obligations. A
full-tree conflict test commits unrelated competing overlays and repins the
Performance publication candidate/revision/evidence before requiring the named B3
conflict refusal. Each of four Browser authority paths has separate missing,
chmod-unreadable, directory, symlink, relative, noncanonical, internal, malformed
JSON and invalid-UTF8 cases. Closed mandatory-member, supplied-body, mode, authority
pin and inherited failure tests refuse without partial JSON.

The broken-dependency harness first calls the real Browser inspector, mutates and
reseals its output, coherently updates unchanged nested report/digest pins, repins
the external ledger authority, then enters the real production CLI. It retains
intentionally broken digest/pin faults. Thus candidate/revision/mode/policy,
authentication/certification, nested report, complete B3 and requested ID/title
faults cannot rely on a stale outer pin for their refusal. Installed dispatch uses
a fresh real package and matches source JSON/digest/exit for zero-debt and skipped
debt, plus no JSON on refusal. The existing installed launcher writes its generic
`Twilight Burokrat validator exited 1` stderr for valid debt; source stderr is empty.

Intermediate checks: scoped uncached Nx typecheck succeeded with explicit successful
target output. Initial default Nx attempted denied sockets without target output;
acceptance uses `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`. An early full source lint
returned exit one without diagnostics; changed-file ESLint found and corrected
import sorting, typed test JSON, and a void-expression helper. The initial installed
fixture attempted an all-skipped publication, which the inherited real Browser
inspector correctly refused; the corrected test includes a passing companion case.
No acceptance was claimed from these failed attempts.

Watched R5 proofs: 36 unique production guard/schema/outcome/output/exit mutations
all caused their named assertions to fail, then were restored
(`/tmp/browser-ledger-mutations.json`, `/tmp/browser-ledger-mutations-extra.json`,
`/tmp/browser-ledger-mutations-level.json`, individual `/tmp/browser-ledger-mutation-*.log`). They cover complete Browser/levels/
report digests; revision/candidate/mode and diagnostic boundaries; capability and
policy ID/digests; scope/mode/invocation/isolation; authority and nested pins;
complete report identity, B3 and requested inventories; failed/skipped verdict and
debt mapping; required/closed Browser and outer authority; strict paths; exact v1
refusal/version; both citation source labels; embedded Browser/full digest; and
production CLI debt exit. The final two probes widen Browser credit to every automated level and turn unobserved rows into passing rows; each failed the existing TEST-AXES-134 absence/cross-level assertion, then restored the exact source bytes. Two harness setup passes stopped before injection on a
nonunique source needle; matches were narrowed, source restored in `finally`, and
all remaining named mutations completed. No failed setup was counted as proof.

The final boundary extraction separates canonical path/lstat checks from JSON
reading: Browser authorities are decoded only by their real owning inspectors.
A restored targeted run passed 37 tests, 114 assertions across one file (51
intentionally filtered); removing the final strict-path call again made the
noncanonical-path production assertion fail
(`/tmp/browser-ledger-boundary-green.log`,
`/tmp/browser-ledger-mutation-strict-paths-final.log`). The preliminary broad run
was interrupted and restarted after that extraction, with no acceptance from the
interrupted run. ESLint then found one unused local left by the extraction; it was
removed during the restarted regression before the owning ledger file loaded.
No other executable changes overlapped that final run.

Scoped uncached checks use `NX_DAEMON=false NX_ISOLATE_PLUGINS=false`:

- `bunx nx run twilight-burokrat:lint:source --skip-nx-cache --output-style=static`:
  exit 0 with `Successfully ran target lint:source`, 37.6 seconds
  (`/tmp/browser-ledger-lint-final.log`).
- `bunx nx run twilight-burokrat:typecheck --skip-nx-cache --output-style=static`:
  exit 0 with successful target output (`/tmp/browser-ledger-typecheck-final.log`).
- `bunx nx run twilight-burokrat:build --skip-nx-cache --output-style=static`:
  exit 0 with successful build and its three dependencies, 4.3 seconds
  (`/tmp/browser-ledger-build-final.log`).
- `bunx nx run twilight-burokrat:lint --skip-nx-cache --output-style=static`:
  exit 0, explicitly `status:inactive`, `certified:false`, external activation root
  not provisioned (`/tmp/browser-ledger-policy-lint-final.log`). This proves its
  optional inactive route only, not policy admission or semantic certification.

Final completed owning/adjacent regression: from the isolated checkout root,
`TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-burokrat/cli/src/rules/specifications.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/evidence/{test-sources,performance-sources,browser-scenarios,browser,browser-architecture,level-facts,scenario-ledger,browser-performance,manual,performance-scenarios,scenario-ledger-browser,test-reports,performance,performance-levels,performance-bundle,browser-conformance,browser-levels}.test.ts --timeout=120000`
returned exit 0: **802 pass, 0 fail, 5503 assertions across 18 actual collected
files**, 922.89 seconds (`/tmp/browser-ledger-regression-final.log`, exact argv in
`/tmp/browser-ledger-regression-command.json`). All listed files existed before
launch; the Bun summary and 18 observed file headers agree. This includes **all
88 tests in scenario-ledger-browser.test.ts**, plus complete legacy ledger, Manual,
Browser, Performance and specifications regression. No nonexistent membership
filename was counted.

After that completed regression the two additional level/absence mutation probes
ran sequentially. SHA-256 comparison proved production ledger bytes restored to
`db1dcf62d2da8be803a37600a72b48fa3a4a28fa82a5698c446d62c59c1a1c64` after both
probes. An extra full owning rerun then terminated with exit 143 without a Bun
summary or assertion failure; its termination cause is unverified and that rerun
is not counted as acceptance (`/tmp/browser-ledger-owning-restored-final.log`).
The completed 802-test regression remains the broad acceptance evidence; final
restored targeted confirmation is recorded below. Subsequent production edits are
Proof comments only. A final fresh scoped uncached typecheck passed in 2.8 seconds.

Final restored targeted confirmation: `bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-burokrat/cli/src/evidence/scenario-ledger-browser.test.ts --test-name-pattern 'absence remains unobserved|v2 preserves|installed dispatch' --timeout=120000` exited 0: **3 pass, 0 fail, 43 assertions across one file**, 85 intentionally filtered, 30.11 seconds (`/tmp/browser-ledger-restored-targeted-final.log`). This rechecks the last two probes' restored level/absence behavior, complete v2/v1 envelope/digest/refusal behavior, and real source/installed zero-debt, skipped-debt and refusal dispatch.

All local draft evidence above remains noncertifying. Independent Astra high review, exact-commit coordinator gate/CI and publication have not run in this child. No push, live/browser deployment, source reconciliation, F9/capacity/frontend change, global T2/coverage or certification claim was made. Task 4.1c.3 remains unchecked.

Final metadata checks: changed-file Prettier reported `All matched files use Prettier code style!`; `git diff --check` exited 0. Fresh production scenario provenance returned `{"unidentified":[]}`. Pinned `OPENSPEC_TELEMETRY=0 bunx --bun @fission-ai/openspec@1.12.0 validate test-axes --strict --json` passed 1/1 with zero failures; `validate --all --json` passed 219/219 (201 changes, 18 specs), zero failures (`/tmp/browser-ledger-{final-format-check.log,provenance.json,openspec-strict.json,openspec-all.json}`). A fresh comparison to exact base #521 again preserved 179 journal events plus exactly four new allocations. The isolated clone initially had no installed Git hook; `bunx lefthook install` installed its standard pre-commit and agent-trailer hooks before the normal commit, with no bypass.

## 4.1c.5 Browser-only capability scenario ledger — local diagnostic candidate

Work began in isolated `/tmp/wbs-browser-ledger-sol` at exact approved #526 head
`9494a96c023d61de430ca427f69b78d288374a83`, tree
`7248a83763674b4cebe4794ca979b398aa3ef922`. The local clone fetched that exact
object from the existing Browser scenario checkout without changing either that
checkout or the coordinator tree. No push, host gate, live Browser execution or
certification is part of this packet. WBS080.39 and the parent ledgers remain open.

The production CLI RED was observed before adding the new command:
`TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-burokrat/cli/src/evidence/browser-scenario-ledger.test.ts --timeout=120000`
failed **0 pass, 1 fail** with `unknown command: inspect-browser-scenario-ledger`
(`/tmp/browser-only-ledger-red.log`). The same initial positive then passed **1
pass, 0 fail, 15 assertions** after implementation
(`/tmp/browser-only-ledger-green.log`). Its fixture removes the separate
Performance publication directory, pointer and level authority before inspection;
all four real Browser membership authorities, including Performance membership,
remain present. Candidate Browser config/test source throws if executed.

The bounded new intent, design and four delta scenarios were added to the existing
change. The real production `scenario allocate` command proposed the allocation;
its returned `specMarkdown` and `journal` were applied. Fresh comparison against
the exact base preserved all **183 existing journal events**, followed only by
`TEST-AXES-136..139`. Production provenance returned `{"unidentified":[]}`
(`/tmp/browser-only-provenance.json`). Initial strict pinned OpenSpec validation
passed 1/1; all validation passed **219/219** (201 changes and 18 specs), zero
failures (`/tmp/browser-only-openspec-{strict,all}.json`). Final checks follow below.

Early targeted validation exposed fixture issues: a root Browser config was
outside the Manual fixture's declared module index, so the new fixture config was
placed under its indexed `apps/example/` scope; the requested-unidentified case
initially deleted allocated rows and reached provenance refusal first, so it now
appends an unidentified row while preserving adopted rows. An internal-path test
was corrected to assert the actual named `inside selected candidate` refusal.
The corrected three cases passed **3 pass, 0 fail, 9 assertions**
(`/tmp/browser-only-ledger-targeted.log`). These failed intermediate runs are not
counted as acceptance. The initial 88-case Browser authority/outcome/fault/installed
suite passed **88 pass, 0 fail, 293 assertions** before the added Manual/schema
cases (`/tmp/browser-only-ledger-owning-1.log`).

The coordinator's fresh #526 hosted check exposed an inherited failure in the
shared clock scanner. A fresh read with
`gh run view 38842532527 --repo Prosperous-Unification/puni-00 --job 116785778489 --log-failed`
confirmed **1733 pass, 1 fail** in `the Burokrat package reads no clock`
(`/tmp/browser-ledger-parent-ci-failure.log`,
[hosted job](https://github.com/Prosperous-Unification/puni-00/actions/runs/38842532527/job/116785778489)).
The reported identifiers were local `performance` observations in the existing v2
ledger and fixture, rather than runtime clock reads. The AST detector classified
every value identifier with that spelling as the global, although member keys
were already excluded. The new focused detector test and actual package scan
reproduced RED (`/tmp/browser-ledger-clock-red.log`).

The fix resolves only `performance` identifier bindings through a single-file
TypeScript Program with `noLib` and `noResolve`. Real local runtime bindings are
permitted; unresolved/ambient/declaration-file/import-alias bindings retain clock
classification. Shorthand properties resolve their value symbol. Initializers and
defaults are still visited; all other clock identifiers and the member/import/module
rules remain unchanged. No domain axis was renamed. The detector JSDoc records
this exact boundary and its existing limits. This restores the existing runtime
clock contract, without adding an exemption list.

The detector plus Burokrat and Dash package scans passed **5 pass, 0 fail**
(`/tmp/browser-ledger-clock-green.log`). Seven watched probes removed local scope
resolution, admitted ambient performance, removed declaration-file/declare
boundaries, used the shorthand property symbol, widened the exemption to other
globals, or appended actual `performance.now()` to the real legacy ledger. Every
probe caused the expected test assertion failure
(`/tmp/browser-ledger-clock-mutations{.json,.log}` and
`/tmp/browser-ledger-clock-mutation-performance-name.log`). The legacy file was
restored exactly, SHA-256
`3b7aa7105805e48295c64a1a6a2249c6f7d5fe2a3a8bd985e5d8bb534fc61113`.
Final owning/adjacent and tool-scoped validation below uses the restored sources.

For the new Browser ledger, **79 watched mutations** all produced production-path
assertion failures: 67 main probes, nine schema/upstream/path/full-tree/installed
probes and three snapshot/inventory/case completeness probes
(`/tmp/browser-only-mutations{.json,.log}`,
`/tmp/browser-only-mutations-extra{.json,.log}`,
`/tmp/browser-only-mutations-completeness.json`). Each temporary edit was restored
before the next probe. The new production module returned exactly to SHA-256
`baeaf5dda2f72c9d4c88561e3068356d5a00fc37824a5c61b6bbf72444bbca87`
after each batch; subsequent production edits add adjacent Proof comments only.
Probes cover closed/required/version/mode/ID/digest authority schema, canonical
paths/symlinks/nonregular files/fatal UTF8, exact SHA and broken committed readers,
missing scenarios and absent/unidentified requested capability, all outer and
nested Browser identities/policies/digests/diagnostic boundaries/pins/isolation/B3
and inventory joins, normalized obligations, foreign/duplicate/blank dispositions,
Browser-only level credit, absence and complete mixed outcomes, every Manual join
and pin, each scenario/Manual/citation/unidentified debt path, once-labelled
Browser debt, complete observations/digests, CLI arity/debt exits and installed
registration. Direct missing/unreadable/malformed/UTF8 authority and real Manual
report negatives run through the production command; no fallback is introduced.

Final owning validation ran from the isolated checkout root with
`TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-burokrat/cli/src/evidence/browser-scenario-ledger.test.ts --timeout=120000`:
**160 pass, 0 fail, 536 assertions**, 220.67 seconds
(`/tmp/browser-only-ledger-owning-final.log`). This includes real installed dispatch
with success, skipped debt and schema refusal. The initial source lint found only
import order, dot notation and an unnecessary test `async`; those were corrected,
without changing assertions or production behavior. Final detector assertions were
strengthened to name the exact ambient value-use line. A fresh detector/Burokrat/Dash
three-file run then passed **5 pass, 0 fail, 26 assertions**, 1.73 seconds
(`/tmp/browser-ledger-clock-final.log`).

Scoped uncached Nx checks all returned exit zero with successful target output,
using `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run <project>:<target> --skip-nx-cache --output-style=static`:

- `twilight-burokrat:lint:source`: 34.6 seconds
  (`/tmp/browser-only-lint-final-restored.log`).
- `twilight-burokrat:typecheck`
  (`/tmp/browser-only-typecheck-final.log`).
- `twilight-burokrat:build`: 3.9 seconds, including three dependencies
  (`/tmp/browser-only-build-final.log`).
- `tool-test-clock-reads:lint`, `:typecheck` and `:build`
  (`/tmp/browser-only-clock-{lint,typecheck,build}-final.log`).
- `twilight-burokrat:lint`: exit zero with explicit `status:inactive`,
  `certified:false`, external activation root not provisioned
  (`/tmp/browser-only-policy-lint-final.log`). This proves only the optional inactive
  route, rather than semantic policy admission or certification.

The standard Git pre-commit and agent-trailer hooks were installed with
`bunx lefthook install` (`/tmp/browser-only-hooks-install.log`); no hook bypass is
used. Final adjacent regression and metadata evidence follow below.

Final adjacent regression ran from the isolated checkout root:

```sh
TOOL_WIKI_TRUSTED_NODE_MODULES=$PWD/node_modules bun test --preload ./tools/test/scratch/preload.ts ./apps/twilight-structure/twilight-burokrat/cli/src/evidence/{scenario-ledger,scenario-ledger-browser,browser-scenarios,browser-levels,performance-scenarios,performance-levels,manual,test-reports}.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/rules/specifications.test.ts ./apps/twilight-structure/twilight-burokrat/cli/src/no-ambient-clock.test.ts ./apps/twilight-structure/twilight-dash/cli/src/no-ambient-clock.test.ts ./tools/test/clock-reads/detector.test.ts --timeout=120000
```

It returned exit zero: **504 pass, 0 fail, 3067 assertions across 12 actual
collected files**, 555.09 seconds (`/tmp/browser-only-ledger-adjacent-final.log`).
Together with the independent owning run, this is **160 new + 504 adjacent tests**,
with no failed acceptance tests. It includes complete old ledger v1/v2 and real
Manual/Browser/Performance/B3 regressions, installed dispatch, and both package
clock scans. No nonexistent file is counted. After strengthening the detector's
exact runtime value-use assertions, its scoped uncached lint and typecheck were
repeated and both returned exit zero
(`/tmp/browser-only-clock-{lint,typecheck}-assertions-final.log`).

Final changed-file Prettier reported `All matched files use Prettier code style!`
(`/tmp/browser-only-format-final-check.log`); `git diff --check` returned zero.
Fresh production scenario provenance returned `{"unidentified":[]}`. Pinned strict
OpenSpec validation passed **1/1**, all validation passed **219/219**, zero failures
(`/tmp/browser-only-{provenance-final.json,openspec-strict-final.json,openspec-all-final.json}`).
Fresh byte comparison again proved the existing production ledger and original
v2 Browser fixture/test unchanged against exact #526; the Manual fixture only adds
an optional committed-files input, preserving the original call shape and defaults.
Fresh allocator comparison preserved the exact 183-event prefix plus four events.

Independent Astra review and coordinator exact-commit CI/host gate/release acceptance
have not run in this child. No push, host gate, live Browser execution, deployment,
source reconciliation, coverage/global T2 or certification claim was made. The local
packet remains an unauthenticated, noncertifying diagnostic and does not close
WBS080.39 or parent Tasks 2.1/2.2a/2.2/4.1/4.1c.3.

## Browser T2 diagnostic consumer — 4.1c.6 (2026-10-16)

This bounded WBS080.39 slice consumes the real Browser-only ledger directly; it does not register T2, alter RulePolicy, certify coverage or close WBS080.39. Work is isolated at `.worktrees/wbs08039-t2-diagnostic-sol`, branch `feat/browser-t2-diagnostic`, stacked on wave-8 `f6f867ecf059e79fcaa2083e2439a33795910c58` with the #531 Browser ledger ancestor intact. External policy validation remains the real ledger's responsibility; the consumer independently checks the complete returned digests, cross-record identities/policy pins and complete citation partition.

### Planning and initial RED

- Pinned `OPENSPEC_TELEMETRY=0 bunx --bun @fission-ai/openspec@1.12.0 status --change test-axes --json`: exit 0, schema `sdd-lean`; `instructions apply`: state ready, 61/80 overall tasks complete before this slice. The executable was absent from PATH and raw cached invocation lacked its dependency closure; pinned bunx supplied the required tool.
- Production `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts scenario allocate . openspec/changes/test-axes/specs/test-axes/spec.md` proposed TEST-AXES-140..143. Before persisting its proposed spec/journal, an exact prefix comparison preserved all **187** predecessor events and appended exactly four allocations (`/tmp/browser-t2-allocate.json`).
- First focused attempt could not load `@noble/hashes/sha2.js` from the parent checkout's stale dependencies; this was a module-resolution error, not behavior RED. Isolated `bun install --frozen-lockfile --ignore-scripts`: exit 0, 1292 packages, locked dependencies installed. Git hooks were already installed in the shared Git directory; no hook bypass was used.
- Meaningful RED after install: production `invokeCli` TEST-AXES-140 expected diagnostic exit 0, observed exit 1 with `unknown command: inspect-browser-t2`; 1 fail, 75 filtered, 2.00 seconds (`/tmp/browser-t2-red.log`). No implementation code existed before that observed RED.

### Focused development and watched proofs

All laptop test commands ran sequentially in the coordinator's exclusive focused-check lane. No full Nx, Browser execution or survey gate ran locally. `MemAvailable` was checked before and during runs, remaining approximately 18–20 GB; swap stayed available.

Initial new-file suite: **74 pass, 2 fail**, 108.50 seconds, peak RSS **730336 KB** (`/tmp/browser-t2-green.log`). Both failures were fixture construction: an all-skipped Browser execution is correctly refused by the existing inspector. Passing companions were added while retaining skipped-case assertions. The built installed parity test already passed in that run. Corrected positives plus disjoint duplicate-group/inactive-moved-case negatives then passed **4/4**, 7.16 seconds (`/tmp/browser-t2-corrected.log`).

The mutation audit exposed and repaired a negative-harness weakness: report-mutating faults initially retained a stale report digest, so they stopped before reaching partition checks. The harness now coherently reseals report, nested report, levels, Browser and ledger digests/pins except the specific fault under test. Every temporary production source edit was restored in a `finally` block.

| Production check                                                        | Injected fault and observed proof                                                                                                                                            |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Complete ledger digest                                                  | Disabled full-payload digest comparison; TEST-AXES-142 ledger-digest negative failed.                                                                                        |
| Revision, candidate, authentication, certification                      | Removed each shared predicate; its coherently resealed production dependency negative failed.                                                                                |
| Ledger/Browser capability and explicit instant                          | Removed each independent predicate; TEST-AXES-142 corresponding negative failed.                                                                                             |
| Browser authority/report/levels modes, publication scope, report policy | Removed each predicate independently; matching mode/scope/policy negative failed. Coherent mode fault moved every Browser mode together to isolate the authority comparison. |
| Browser/levels/report observation pins and nested report equality       | Removed each comparison; its TEST-AXES-142 pinned dependency negative failed.                                                                                                |
| Terminal presence and full-tree active membership                       | Removed terminal refusal or forced membership true; named missing-terminal or inactive-moved-case assertion failed.                                                          |
| Unique complete report and disjoint case partition                      | Removed report/citation uniqueness; duplicated report or cited-case negative failed.                                                                                         |
| Unique nonempty citation groups                                         | Removed each predicate; disjoint duplicate groups or an extra empty active group was accepted and its negative failed.                                                       |
| Complete cited record and scenario agreement                            | Bypassed record equality or terminal/group agreement; altered outcome or mismatched active scenario negative failed.                                                         |
| Original finding membership, kind, terminal title and status            | Removed each guard/predicate; foreign/kind/title/status production negative failed.                                                                                          |
| Complete report enumeration and canonical ordering                      | Removed omitted-case refusal or reversed sorting; omitted-case negative or independent positive order assertion failed.                                                      |
| CLI arity and flag                                                      | Removed each independently; TEST-AXES-143 extra/flag negative failed.                                                                                                        |
| Debt-independent diagnostic exit                                        | Added erroneous ledger-debt-to-exit-one mapping; TEST-AXES-141 valid debt diagnostic assertion failed.                                                                       |
| Installed registration                                                  | Removed `inspect-browser-t2` registration, rebuilt real package; TEST-AXES-143 installed parity assertion failed.                                                            |

All **36** watched mutations were caught: indices 0–17 in `/tmp/browser-t2-mutations.log`; corrected harness indices 18–35 in `/tmp/browser-t2-mutations-rest.log` and `/tmp/browser-t2-mutations.json`. Individual test logs are `/tmp/browser-t2-mutant-00.log` through `-35.log`. Adjacent production `Proof:` comments name these observed tests. A fresh post-mutation `git diff --check` exited 0.

### Final focused and scoped acceptance

- Restored new-file suite before the final marker-typing refinement: **80 pass, 0 fail**, 279 assertions, 117.22 seconds, peak RSS **763868 KB** (approximately 746 MB); includes real built installed dispatch (`/tmp/browser-t2-final-tests.log`).
- Scoped lint initially rejected comparisons on literal upstream marker types. A typed diagnostic helper avoids that lint conflict. A subsequent exact-false audit found boolean negation would accept a coherently resealed null marker: actual production RED observed exit 0 versus expected 1 (`/tmp/browser-t2-null-red.log`). The helper now accepts unknown certification only at this validation boundary and requires literal `false`. Production null/zero/empty marker cases were added. The final affected full-envelope/authentication/certification subset passed **12/12**, 61 assertions, 22.07 seconds (`/tmp/browser-t2-final-diagnostic-tests.log`). The test file now contains 83 cases; the three added marker cases and every changed boundary were exercised in that final subset. Hosted CI owns the whole exact-head rerun.
- Both factored helper predicate removal reproofs failed their intended production assertions (`/tmp/browser-t2-helper-mutations.json`); an additional final mutation substituting boolean coercion for exact false failed the null-marker assertion (`/tmp/browser-t2-exact-false-mutant.log`). This adds three successful reproof runs to the 36 original watched mutations.
- Scoped `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run twilight-burokrat:typecheck --skip-nx-cache --output-style=static`: final exit 0, 1.5 seconds target duration (`/tmp/browser-t2-typecheck-final.log`). Initial TS4058 declaration emission exposed an inferred return leaking the upstream private interface; an explicit local `BrowserT2Observation` return interface using `ReturnType`/indexed types resolves it. The measured successful pre-marker-refinement run peaked at **1259916 KB**, 1.91 seconds.
- Changed-file `bunx eslint` over the new consumer/test and `cli.ts`/`bin.ts`: final exit 0, no warnings or errors (`/tmp/browser-t2-eslint-final.log`). The first direct lint lacked an Nx graph and skipped module-boundary checks; scoped Nx typecheck generated that graph before this final clean run.
- Production scenario provenance: exit 0, `{"unidentified":[]}` (`/tmp/browser-t2-provenance.json`).
- Pinned OpenSpec strict validation: **1/1 valid**, zero failures (`/tmp/browser-t2-openspec-strict.json`); all validation: **229/229 valid**, 211 changes plus 18 specs, zero failures (`/tmp/browser-t2-openspec-all.json`).
- Post-proof memory remained approximately **20.9 GB available**, swap approximately **20.9 GB free**; no parallel local test sessions were used.

Full Nx gates, actual Browser execution, survey workloads, host gate, independent Astra review and hosted exact-head CI were not run locally. The coordinator owns integration, restack if wave 8 merges, review and release/host acceptance. The requested draft PR remains noncertifying and does not close the parent ledgers.

Final packaged smoke on the exact-false helper: **1 pass, 0 fail**, 7 assertions, 8.71 seconds; source and built installed JSON/exit behavior match for a real debt-bearing diagnostic, and malformed trusted input emits no partial JSON (`/tmp/browser-t2-installed-final.log`). Final changed-file Prettier check passed for all eleven changed/new files; changed-file ESLint and `git diff --check` exited 0 (`/tmp/browser-t2-format-final.log`, `/tmp/browser-t2-eslint-final.log`). A fresh journal comparison again preserved all 187 prior events and exactly the four allocated suffix events. Normal commit hooks follow; hosted exact-head CI and independent review remain pending.

The normal commit completed with format, lint, plaintext-secret and private-nesting hooks passing. Tool Wiki returned its modeled inactive diagnostic, `certified:false`, because the external activation root is not provisioned; this provides no trusted-admission evidence. Migration hooks and index-cap checks had no matching staged files and were explicitly skipped. Agent message hooks completed. No hook was bypassed (`/tmp/browser-t2-commit.log`).

## Browser case source and level composition — 4.1b.17 (2026-10-16)

This bounded diagnostic joins real Browser source ownership and complete level observations.
The source owner identifies the test file's module; it makes no tested-module coverage claim.
The candidate starts at `a4caaeea41e53334c7deabc62ad00575b8aae649` in the isolated
`feat/browser-source-levels` checkout. WBS080.39, Tasks 2.1/2.2a/2.2/4.1, T2, source
reconciliation, admission and certification remain open. Gantt, C-class and solver holds remain.

### Allocation and TDD

Production `scenario allocate . openspec/changes/test-axes/specs/test-axes/spec.md` allocated
TEST-AXES-144..147 from four initially unidentified headings; the existing journal prefix was
preserved. Exact allocator output is `/tmp/browser-source-allocation.json`. The first new-command
production test failed on `unknown command: inspect-browser-source-levels` before implementation
(`/tmp/browser-source-red.log`). The real complete-envelope case then passed
(`/tmp/browser-source-green.log`). A later duplicate-report/classification assertion RED
observed the earlier report-pin diagnostic; validation order and the independent classification
join were refined to retain named complete-case and missing-classification refusals
(`/tmp/browser-source-classification-red.log`).

### Watched production proofs

The final mutation summary records **37** independent production guard/output mutations.
Every corresponding baseline exited zero and every mutation made the intended production-path
assertion fail with exit one. Temporary WATCH tests reused the committed real publication/index
fixture and production CLI fault wrapper; each mutation restored the exact production bytes in a
`finally` block. The temporary test was removed. Full logs and summary are under
`/tmp/browser-source-watch/`; the serial driver is `/tmp/browser-source-mutations.py`.

| WATCH faults                                                                                                                                 | Observed assertion                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sha`, `committed-kind`, `selected-revision`                                                                                                 | Named symbolic/staged/exact annotated-tag-object selection refusal lost when its guard was removed.                                                                                                 |
| `digest`, `snapshot-revision`, `snapshot-candidate`, `authentication`, `certification`                                                       | Resealed source envelope identity/marker substitutions or an invalid upstream digest accepted without their comparison.                                                                             |
| `certification-coercion`                                                                                                                     | Replacing literal false with boolean coercion accepted a resealed null certification marker.                                                                                                        |
| `mode-levels`, `mode-report`, `report-pin`                                                                                                   | Changed upstream mode or source report digest no longer refused by the expected boundary.                                                                                                           |
| `report-duplicate`, `report-empty`, `collection`                                                                                             | Duplicate/empty reported case identities or missing recorded file collection lost their complete-scope refusal.                                                                                     |
| `classification-duplicate`, `classification-size`, `isolation`                                                                               | Duplicate/missing level bindings or substituted classification with unchanged isolation were accepted or lost the named boundary.                                                                   |
| `case-duplicate`, `case-substitution`, `case-file`, `case-outcome`, `case-source`, `case-classification`, `case-completeness`                | Repeated/foreign/omitted cases, changed file/status/source digest or absent file classification lost their exact case join refusal. Permanent tests also change source mode and inject extra cases. |
| `publication-drift`, `final-real-read`                                                                                                       | Resealed seventh-read invocation drift or physical report corruption after the level inspector was accepted without the final equality or actual reader.                                            |
| `output-authentication`, `output-certification`, `output-digest`, `output-upstreams`, `output-classification`, `output-debt`, `output-order` | Exact full-envelope/marker/digest/precedence/debt/case-order assertions failed after promoting, omitting or substituting the corresponding output.                                                  |
| `cli-arity`, `cli-mode`, `cli-exit`                                                                                                          | Extra operands or unsupported mode lost the usage boundary; valid wrong-level JSON exited zero without status mapping.                                                                              |

Separate real trusted-state cases exercise malformed committed index metadata, an absent only
index, and an unreadable selected Git index blob despite its readable working copy. The production
checkers refuse each. Failed/skipped report cases remain complete; isolation alone controls this
command's status. A real 45-entry module index retains its 40-entry review limit as explicit debt.
Both upstream v1 observations remain complete and retain their original levels/identities.
Source and built executable JSON/exit behavior are compared for isolated, wrong-level and malformed
operand cases. The real publication is read again after both inspectors, without accepting supplied
observation JSON or executing candidate code.

### Narrow declaration check

An explicit local observation interface uses `ReturnType` and indexed types for the private
upstream shapes, without casts. A temporary config extends this checkout's `tsconfig.base.json`,
selects only `browser-source-levels.ts` as a root, and emits declarations for its import graph
outside the checkout. The actual installed compiler is the pinned `@typescript/native` alias:

`GOMEMLIMIT=384MiB GOGC=50 GOMAXPROCS=2 BUN_JSC_forceRAMSize=536870912 NODE_OPTIONS=--max-old-space-size=512 bun --smol node_modules/@typescript/native/bin/tsc --project /tmp/browser-source-tsconfig.json`

Observed exit **0**, 1.96 seconds, peak RSS **392792 KiB**; the emitted new-module declaration
contains its precise `BrowserSourceLevelsObservation` and exported function. A deliberate returned
`mode:'fault'` made this same check exit nonzero with **TS2322 in browser-source-levels.ts**
(`/tmp/browser-source-tsc-fault.log`), proving the root file is checked. The fault was restored.
This is a narrow import-graph declaration check, not the whole project's typecheck receipt.

### Corrected attempts and limits

The initial absent-index expectation named unique ownership, while the real checker correctly
reported `selected candidate contains no module indexes`; the assertion was corrected. The
first WATCH driver classified a custom-message Bun assertion as unrecognized even though it failed
on expected exit one versus actual zero; assertion recognition was corrected, and the mutation
was rerun. A generated debt WATCH baseline initially lacked the fixture's `commitCandidate`
helper; that helper was included and the baseline/mutation pair rerun successfully. Neither failed
harness attempt counts toward the 37 proofs.

Direct ESLint initially found unknown JSON typing, import ordering and literal-type marker
comparisons. Typed test parses and an unknown-certification boundary requiring literal false
resolve those errors. Direct lint warns that `@nx/enforce-module-boundaries` is skipped because
this isolated checkout has no cached Nx project graph; that check remains for hosted CI. The
standard `node_modules/typescript/bin/tsc` executable is absent; the installed compiler alias was
used. The first temporary config could not resolve `bun-types` from `/tmp`; explicit checkout
type roots fixed the config before the successful declaration run.

No full Nx gate, whole Burokrat suite/typecheck/build target, actual Browser run, host gate,
independent Astra review, hosted exact-head CI, deployment or admission was performed locally.
The sole built-command parity test uses the existing package builder in a disposable directory.
All local tests and mutations run serially with the stated RAM settings; the first expanded
10-case pass used peak RSS **682228 KiB**, 68.38 seconds, with 203 assertions. Final restored
acceptance is recorded below. Coordinator owns review, hosted CI and integration.

### Final restored focused acceptance

- New command suite: **11 pass, 0 fail**, **229 assertions**, **77.92 seconds**, peak RSS **669140 KiB** (`/tmp/browser-source-final-tests.log`). This includes the exact-false marker cases, nested report identity/marker faults, real reordered-publication digest stability and built executable parity.
- The staged-reader permanent case was then strengthened to retain the requested revision in its faulted staged selection, matching the independent `WATCH_committed-kind` witness. Its affected exact-selection/operands subset passed **1/1** (`/tmp/browser-source-selection-final.log`); no implementation changed.
- Adjacent unchanged Browser levels suite: **15 pass, 0 fail**, **254 assertions**, **58.65 seconds**, peak RSS **653796 KiB** (`/tmp/browser-source-levels-regression.log`).
- Adjacent unchanged test-source suite: **21 pass, 0 fail**, **132 assertions**, **18.39 seconds**, peak RSS **356644 KiB** (`/tmp/browser-source-sources-regression.log`). Combined with the new suite, these are **47 passing tests / 615 assertions**, run serially.
- Final changed-file ESLint exited **0**; its absent Nx graph/module-boundary skip remains explicit (`/tmp/browser-source-eslint-final.log`). No full lint receipt is claimed.
- Production scenario provenance returned `{"unidentified":[]}` (`/tmp/browser-source-provenance.json`). The complete **191-event** prior allocation prefix is unchanged, followed by exactly the four allocator-issued events (**195 total**).
- Pinned OpenSpec 1.12.0 strict validation reported **1/1 valid**, zero failures; all validation reported **237/237 valid** (219 changes plus 18 specs), zero failures (`/tmp/browser-source-openspec-{strict,all}.json`).
- Local checks reused the integration checkout's existing `node_modules` through an ignored symlink; no package or lockfile changed. A fresh frozen installation and the full project/gate receipts remain hosted acceptance work.

Final changed-file Prettier check passed for all eleven changed/new files, and `git diff --check`
exited zero (`/tmp/browser-source-format-final.log`). The local candidate is ready for independent
Astra review; no push, hosted CI, host gate or WBS closure is implied.

## WBS080.39 — shared-validation isolated Unit target (in progress)

Base: `b0a0f50a82f3ecdf479565e743d4c065b8c73661`, tree `c9e72f4050b036769f526ba49fadd187e4de3458`.
Isolated clone: `/tmp/puni-shared-validation-level-sol-oct17`. Dependency donor is that exact
base with matching `bun.lock` SHA-256 `e8d77926f9dac4ba4824486143872bdfb123cafd8bed45cca50c44b2e23298a4`;
only a local `node_modules` symlink was added, without installation or network access.

All executions below ran serially under a 900 MiB process-tree monitor. Logs and adjacent
JSON receipts use the listed `/tmp/` names; peaks are sampled observations.

| Check                                                                                                                                               | Observation                                                                                                                                 |                                                        Peak KiB | Log                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------: | -------------------------------------------- |
| Focused RED, `bun test tools/tool-devsync/src/shared-validation-level.test.ts --timeout=30000`                                                      | Exit 1; 0 pass, 10 fail. Missing level registration and unclassified legacy runner named.                                                   | 596 (41ms run; sampling does not establish representative peak) | `shared-validation-level-red-oct17.log`      |
| First focused implementation run                                                                                                                    | Exit 1; 9 pass, 1 fail. Actual JUnit used leaf titles, while test expected describe prefixes; corrected expectations after reading raw XML. |                                                          102312 | `shared-validation-level-green-oct17.log`    |
| Corrected focused run, same command                                                                                                                 | Exit 0; 10 pass, 0 fail, 30 assertions.                                                                                                     |                                                          106808 | `shared-validation-level-green2-oct17.log`   |
| `bun test tools/tool-devsync/src/test-levels.test.ts --timeout=30000 -t 'refuses empty or failed selection before Bun runs and clears stale JUnit'` | Exit 0; 1 pass, 100 filtered, 64 assertions. Exact seven-target inventory and real production shell commands checked.                       |                                                           35252 | `shared-validation-existing-stale-oct17.log` |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run shared-validation:test:unit:level --skip-nx-cache`                                            | Exit 0; 3 pass, 0 fail, 5 assertions. Cache skipped.                                                                                        |                                                          341216 | `shared-validation-nx-unit-oct17.log`        |

The Nx run wrote a fresh 1052-byte `tmp/junit/shared-validation.unit.xml`. Every testcase
and testsuite file identity is exactly `src/core.test.ts`; all three cases passed:
`re-exports ArkType type function that validates objects`, `parseOrThrow returns parsed value on success`,
and `parseOrThrow throws ValidationError on failure, embedding the offending value`.
The focused suite also joins the production selector's canonical collection to that file and
uses the production report parser to check exact case names, outcomes and files.

The extracted `verifyBunProjectCollection` body compares exactly to the former production
`verifyDeclaredCollections` inventory/Bun block after removing two spaces of indentation
(`/tmp/shared-validation-extraction-oct17.json`). The full verifier calls it at the same point;
frontend and Browser branches retain their prior flow. Focused child fixtures invoke this same
production boundary for complete source inventory and API/View isolation.

Production allocator `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts scenario allocate . openspec/changes/test-axes/specs/test-axes/spec.md`
issued TEST-AXES-148/149. Before persisting the exact proposed spec and journal, comparison
preserved all 211 prior events, appended exactly two allocations and matched the returned
proposed event delta (`/tmp/shared-validation-allocation-prefix-oct17.json`). Prior journal
SHA-256: `84740f3c11f25227477f8d23f235adad7b79a32e9a41752a51bd78a936f402dc`;
updated journal SHA-256: `8415d2112c0bc0a0475e812aba339a9ef360c33289ff2c92d13612abacd8300b`.
Allocator exit 0, sampled peak 340632 KiB (`/tmp/shared-validation-allocate-oct17.log`).
Production `scenario validate . openspec/changes/test-axes/specs/test-axes/spec.md` returned
`{"unidentified":[]}`, exit 0, sampled peak 328840 KiB
(`/tmp/shared-validation-provenance-oct17.log`). These allocations establish scenario
identity only; they do not complete Task 2.2 or prove test citation coverage.

### R5 faults — nine qualified independent faults

Each injected fault ran one named focused test in a fresh serial monitored Bun process,
then restored the exact original verifier/manifest hashes. Raw logs and JSON receipts are
`/tmp/shared-validation-r5-<fault>-oct17.log`; combined observations are
`/tmp/shared-validation-r5-oct17.json`, and exact before/after restoration hashes are
`/tmp/shared-validation-r5-restoration-oct17.json`.

| Fault                 | Named production-path observation                                                                                   | Sampled peak KiB |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | ---------------: |
| `registration`        | Removing shared-validation's registration made canonical Unit lookup refuse the missing declaration.                |             1288 |
| `required-target`     | Removing required-target inventory guard made missing-target promise resolve and its rejection assertion fail.      |              668 |
| `literal-operands`    | Changing `find ./src` to `find src` admitted nested matching decoy execution; actual command no longer exited zero. |              652 |
| `empty-selection`     | Checking `never` instead of `$files` lost the named no-cases refusal.                                               |              676 |
| `stale-report`        | Removing report deletion left stale XML after empty-selection refusal.                                              |              664 |
| `complete-collection` | Removing complete-source guard let the narrowed selector omit `src/added.test.ts` and audit exit zero.              |            32632 |
| `wrong-level`         | Removing classifier equality let an API file through the production Unit audit with exit zero.                      |            32208 |
| `report-identity`     | Removing report equality let a command clearing/writing `wrong.xml` pass without throwing.                          |              596 |

All qualified mutations exited one in the named tests. Several processes finished faster
than the monitor's 50ms interval; tiny sampled peaks are not representative maxima.
No cap breach occurred. The attempted ninth `selector-failure` fault is **disqualified**:
changing `&& if` to `; if` was rejected by the test's `parseLevelCommand` precheck before
actual shell execution. Its original receipt is retained. The test now injects the failing
selector by exact known substitution so the intact command and isolated short-circuit fault
can be rerun against actual shell execution. The repaired intact control passed (1 pass, 0 fail) and the isolated `&&` to `;`
fault then failed at the actual `execution.exitCode` assertion: the partial selection ran
and exited zero. The parser-mask diagnostic was absent. Logs:
`/tmp/shared-validation-selector-control-oct17.log` and
`/tmp/shared-validation-selector-fault-repaired-oct17.log` (adjacent JSON receipts).
Both processes completed below the 50ms sampling interval (observed 668/584 KiB, not
representative maxima). The manifest was restored byte-for-byte, SHA-256
`d2c421e46f54a52e2458cc2e4ba41075e63e3e856d6885bebfeb3246ff7bef7c`, as recorded in
`/tmp/shared-validation-selector-restoration-oct17.json`. All nine independent faults
now qualify; the earlier masked attempt remains disqualified.

### Restored checks and scoped validation

| Check                                                                              | Observation                                                                                                                                                                                 | Sampled peak KiB | Raw log in `/tmp/`                                 |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------: | -------------------------------------------------- |
| Restored focused suite                                                             | Exit 0; 10 pass, 0 fail, 31 assertions.                                                                                                                                                     |           110212 | `shared-validation-restored-focused-oct17.log`     |
| Bounded existing collection/inventory/report/parser/stale/find-operand regressions | Exit 0; 25 pass, 76 filtered, 0 fail, 119 assertions; all seven real operand commands included.                                                                                             |            84016 | `shared-validation-restored-regressions-oct17.log` |
| Prettier write, nine changed files                                                 | Exit 0.                                                                                                                                                                                     |           370376 | `shared-validation-format-oct17.log`               |
| Fresh Nx graph                                                                     | Exit 0; generated `tmp/shared-validation-graph.json`.                                                                                                                                       |           198820 | `shared-validation-graph-oct17.log`                |
| ESLint, three changed TS files with fresh graph                                    | Exit 1; five test-only errors: Bun rejected-promise assertions typed void and a callback returning void. Static repair uses existing rejection capture and a block callback; rerun pending. |           802372 | `shared-validation-lint-oct17.log`                 |
| Scoped TypeScript verifier and both changed/new test files                         | Exit 0; `bunx tsc --noEmit --project tmp/tsconfig.shared-validation-level.json`.                                                                                                            |            94068 | `shared-validation-typecheck-oct17.log`            |
| Pinned cached OpenSpec 1.12.0 `validate test-axes --strict`                        | Exit 0; `Change 'test-axes' is valid`. No package installation or network.                                                                                                                  |            72472 | `shared-validation-openspec-oct17.log`             |

All checks remained serial under the 900 MiB tree cap. No frontend/Vitest execution,
full Burokrat suite, whole workspace typecheck or full gate ran.

After the test-only lint repair, Prettier passed (peak 351260 KiB), a fresh Nx graph
passed (185756 KiB), and graph-backed ESLint passed over all three changed TS files
(799068 KiB). The restored focused suite passed 10/10 with 31 assertions (112816 KiB);
the bounded existing regressions passed 25/25 with 119 assertions, 76 filtered (74192 KiB).
Raw `/tmp/` logs are `shared-validation-format2-oct17.log`, `shared-validation-graph2-oct17.log`,
`shared-validation-lint2-oct17.log`, `shared-validation-restored-focused2-oct17.log` and
`shared-validation-restored-regressions2-oct17.log`, each with adjacent monitor JSON.

Boundary negative attempts retained for audit: `@wbs/domain` is explicitly allowlisted,
so its import-sort-only failure is **disqualified** as boundary proof
(`/tmp/shared-validation-boundary-negative-oct17.log`). The corrected `@wbs/domain/workday`
import emitted `@nx/enforce-module-boundaries` with the buildable-library diagnostic,
but the harness incorrectly demanded `scope:infra`; that attempt is also **disqualified**
(`/tmp/shared-validation-boundary-negative-repaired-oct17.log`). Source bytes were restored
after both attempts. The final harness requires the exact observed buildability diagnostic. Its fresh
`@wbs/domain/workday` fault emitted `@nx/enforce-module-boundaries` with
`Buildable libraries cannot import or export from non-buildable libraries`, negative lint
exit 1, proof harness exit 0, peak 689028 KiB
(`/tmp/shared-validation-boundary-negative-qualified-oct17.log`). Exact source SHA-256
`b76e13745be7f40633cabb858a5203049778db57fd487afd689cca07acaf7a2e` was restored;
clean graph-backed lint over all three changed TS files then exited 0, peak 805428 KiB
(`/tmp/shared-validation-lint-restored-final-oct17.log`).

Raw receipts, including disqualified attempts, allocator proposals, independent fault
observations, restoration hashes and the restored focused run's real JUnit report, are
preserved in [scoped evidence](evidence/shared-validation-unit-2026-10-17/manifest.json).
The manifest names each original source, stored file, byte length and SHA-256. JSON monitor
receipts use `.receipt`; raw logs use deterministic `.log.gz` with both stored and decoded
digests, preserving whitespace and original bytes. Every stored and decoded digest was
compared with its file before staging. These artifacts retain local diagnostic paths and
are noncertifying operational evidence.

Final formatting over all ten formattable changed paths exited 0, sampled peak 344900 KiB;
scoped TypeScript after the test-only repair exited 0, peak 82660 KiB; final focused execution
passed 10/10 with 31 assertions, peak 105612 KiB. Receipts are preserved as
`format-final-oct17`, `typecheck-final-oct17` and `focused-final-oct17` in the scoped evidence.
The exact scoped TypeScript config and final focused JUnit report are preserved there too.

Astra exact review of staged tree `29606bcd69df959edd8300822d27826e1c1fac1d` found no
P0–P3 issues and verified all 86 staged paths, evidence hashes, report and nine R5 faults.
The later staged tree adds only these final-check observations and receipts.

### Normal hooks

Astra-high's final review of staged tree `36fad1d696e26c4fc8d0806afcd9ce73407866e5`
found no P0–P3 issues, independently checked all 84 stored evidence hashes and qualified
nine R5 fault logs. Root reviewed the unchanged `lefthook.yml` and approved a 1280 MiB
tree cap for normal parallel hook execution, without overrides or skipped checks.
Canonical `bun run tools/tool-git-hooks/src/install.ts` installed pre-commit,
prepare-commit-msg and commit-msg (exit 0, peak 86848 KiB). `bunx lefthook dump`
confirmed `parallel: true`, original commands and no bypass (exit 0, peak 70372 KiB).

Actual `.git/hooks/pre-commit` rejected a staged `unusedHookProof` binding with
`@typescript-eslint/no-unused-vars` (exit 1, peak 844592 KiB). The proof restored the
exact verifier source SHA and complete index tree `36fad1d696e26c4fc8d0806afcd9ce73407866e5`.
Actual restored `.git/hooks/pre-commit` then exited 0 (peak 845924 KiB). Lint, format,
plaintext-secrets, private-nesting and tool-wiki all ran. Migration, website-migration and
doc-caps hooks had no matching staged files. Tool-wiki explicitly returned inactive,
`certified: false`, because no external activation root was provisioned; this does not
establish certified admission. No cap termination occurred. Raw hook install/dump,
negative/positive and restoration receipts are preserved in the scoped evidence.

Task 2.1k is complete for this isolated target. Task 2.1 and WBS080.39 remain open;
lineage holds, allocator rollout, scenario citations, trusted runner receipts and
every-project level-target adoption are not completed by this packet. No full gate ran.
The subsequent normal commit will rerun all applicable hooks on the final evidence tree. No full gate has run. Task 2.1, task 2.1k and WBS080.39 remain
open; operational reports establish no trusted runner, scenario coverage, lineage hold,
allocation completion or every-project adoption claim.

## Bun report observation — 2026-10-17 (WBS080.39, 4.1b.18)

The isolated clone `/tmp/puni-bun-report-inspector-sol-oct17` starts at exact unpublished
`f83139f2cf065c9ea119f3a91395a092076ebd19`. The bounded change adds
`inspect-bun-test-reports <repository> <full-committed-sha> <external-report-authority>`.
It reads closed schema-1 external pins, selected regular project manifest and case blobs,
and strict Bun JUnit; target names establish provenance only. Outcomes remain passed,
failed or skipped, with unresolved level/isolation, absent authentication and `certifies:false`.
The canonical digest includes the complete payload, including raw authority/report provenance.
Reordering a raw report preserves sorted case identities but changes its raw digest and thus
the full observation digest. No candidate code executes; no supplied observation JSON is read.

The single pure parser moved from `tool-devsync/src/test-levels.ts` to
`@shared/test-evidence/src/bun-junit.ts`. The old devsync exports retain exact
`{name,file,outcome}` case shape. `readBunJUnitReport` additionally preserves ordered nested
`testsuite` names, excluding the outer source-file suite; it never splits `classname`.
Repeated same-kind and conflicting outcome elements now deliberately refuse instead of
allowing the old last-outcome overwrite. Existing parser/caller regressions exercise this
shared behavior change. A real Bun nested same-leaf report proves distinct describe paths,
a suite move changes case identity, and a committed execution sentinel stays absent.

### Dependencies and allocation

The initial donor lock matched `e8d77926f9dac4ba4824486143872bdfb123cafd8bed45cca50c44b2e23298a4`,
but its packages linked into a root with a different lock; this was not accepted as frozen
installation evidence. A dereferencing copy hit the donor's cyclic `node_modules` alias.
The partial copy was confined to this clone's ignored dependencies, the alias was removed,
and the physically copied closure was repaired using the authorized offline command:

```sh
RUNTIME_CLOSURE_RSS_MIB=900 python3 /tmp/runtime-rss-guard.py bun install --frozen-lockfile --offline
```

Exit 0, sampled peak 17,100,800 bytes; one cached `@types/dns-packet` package was installed.
The lock digest above remained unchanged and `node_modules/typescript` became a physical
clone-local directory. The later built installed executable independently exercised the
trusted runtime dependency closure. No network install was used.

The production allocator appended TEST-AXES-150..152, preserving all **213** prior events
and adding exactly three. The evidence packager compared the complete predecessor prefix
again against the base commit. Production provenance returned `{"unidentified":[]}`.
This allocates identities only; B3 reconciliation and parent Tasks 2.1/2.2a/2.2/4.1 remain open.

### Qualified checks and limits

Every command ran serially through `/tmp/runtime-rss-guard.py`; the default ceiling was
900 MiB. Measured retries used fresh available RAM and explicit bounded ceilings. Peaks
below are sampled process-tree bytes, not guaranteed maxima. Full exact commands and
raw logs are retained in [the proof manifest](evidence/bun-reports-2026-10-17/proof-manifest.json).
Log names in the following table resolve to that directory with `.gz` appended.

| Check                                                                                                                                                                               | Observed result                                                                                                                                                        | Sampled peak bytes | Receipt                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----------------: | -------------------------------------------- |
| Initial new-command RED                                                                                                                                                             | Exit 1, 0 pass/14 fail; command assertions reached unknown dispatch; installed setup separately refused donor symlink dependency                                       |          612130816 | `bun-report-red-oct17.log`                   |
| Initial implementation                                                                                                                                                              | Exit 1, 13 pass/1 fail; installed smoke exposed missing bin allowlist registration, then registration was added                                                        |          744714240 | `bun-report-green-oct17.log`                 |
| Restored ordinary source cases, `bun --smol test .../bun-test-reports.test.ts --timeout=30000 --test-name-pattern '^(?!.*(?:installed executable\|reader selection disagreement))'` | Exit 0, 16 pass, 2 filtered, 239 assertions                                                                                                                            |          621133824 | `bun-report-focused-final-oct17.log`         |
| Restored spawned reader-selection faults, same file with `--test-name-pattern 'reader selection disagreement'`                                                                      | Exit 0, 1 pass, 17 filtered, 6 assertions                                                                                                                              |          683278336 | `bun-report-reader-final-oct17.log`          |
| Restored built installed executable, `bun --smol test ... --test-name-pattern 'installed executable'`, measured 1400 MiB ceiling                                                    | Exit 0, 1 pass, 17 filtered, 9 assertions; source/output parity, failed observation exit 0, arity/refusal exit 1, selected-source sentinel absent                      |         1243893760 | `bun-report-installed-final-oct17.log`       |
| Full devsync caller suite, `bun test tools/tool-devsync/src/test-levels.test.ts --timeout=30000`                                                                                    | Exit 0, 102 pass, 360 assertions, including repeated/conflicting outcomes                                                                                              |          345329664 | `bun-report-devsync-final-oct17.log`         |
| Shared evidence source test, `bun test ./libs/shared/domain/test-evidence/src/index.test.ts --timeout=30000`                                                                        | Exit 0, 12 pass, 49 assertions                                                                                                                                         |          202514432 | `bun-report-shared-final-oct17.log`          |
| Browser report regression, `bun test .../test-reports.test.ts --timeout=30000 --test-name-pattern '^(?!.*installed Browser)'`                                                       | Exit 0, 19 pass, 1 existing installed test filtered, 180 assertions                                                                                                    |          715374592 | `bun-report-browser-regression-oct17.log`    |
| Nx graph, `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx --no-install nx graph --file=/tmp/bun-report-graph-oct17.json`                                                             | Exit 0; cached graph available for boundary rules                                                                                                                      |          281808896 | `bun-report-graph-oct17.log`                 |
| Graph-backed CLI changed-path ESLint with `NODE_OPTIONS=--max-old-space-size=1024`, measured 1100 MiB                                                                               | Exit 0; no skipped module-boundary warning                                                                                                                             |          952770560 | `bun-report-lint-cli-restored-oct17.log`     |
| Graph-backed shared changed-path ESLint, same V8 option, 900 MiB                                                                                                                    | Exit 0                                                                                                                                                                 |          620400640 | `bun-report-lint-shared-restored-oct17.log`  |
| Graph-backed devsync changed-path ESLint, same V8 option, 900 MiB                                                                                                                   | Exit 0                                                                                                                                                                 |          815468544 | `bun-report-lint-devsync-restored-oct17.log` |
| `bunx --no-install tsc --build --force libs/shared/domain/test-evidence/tsconfig.json`                                                                                              | Exit 0, full shared production/test project                                                                                                                            |          173834240 | `bun-report-type-shared-oct17.log`           |
| `GOMAXPROCS=2 bunx --no-install tsc --project /tmp/bun-report-narrow-tsconfig-oct17.json`                                                                                           | Exit 0; changed inspector/tests/parser and devsync caller/tests plus transitive imports, inherited strict base options, `allowJs` for unchanged devsync `.mjs` imports |          545800192 | `bun-report-type-narrow2-oct17.log`          |
| Production scenario provenance                                                                                                                                                      | Exit 0, `{"unidentified":[]}`                                                                                                                                          |          337850368 | `bun-report-provenance-oct17.log`            |
| Pinned OpenSpec 1.12.0, `validate test-axes --strict --json`                                                                                                                        | Exit 0                                                                                                                                                                 |           71458816 | `bun-report-openspec-strict-oct17.log`       |
| Pinned OpenSpec 1.12.0, `validate --all --json`                                                                                                                                     | Exit 0                                                                                                                                                                 |          139231232 | `bun-report-openspec-all-oct17.log`          |

The 18 new tests are accounted for by 16 ordinary + 1 reader + 1 installed tests in fresh
serial processes. The existing Browser installed smoke was skipped; this slice's actual
built installed smoke ran. Full CLI project typecheck was interrupted at the 1100 MiB
ceiling (1,155,010,560 sampled bytes), so it is **not verified**. The narrower semantic check
and full shared check above passed. No full repository gate, h2puni gate, hosted CI, push,
merge, deploy or release acceptance was run or claimed.

Superseded/interrupted receipts remain in the manifest: combined/default and Bun `--smol`
ESLint attempts exceeded 900/1400 MiB; installed-only 900/1100 MiB attempts were killed;
a combined source run was killed at the spawned reader test. Per-project normal `bunx`
ESLint and isolated source/reader tests resolved those limits. `bun-report-lint-cli-final-oct17.log`
is the superseded import-sort **failure**, not the green receipt. Initial narrow typecheck
found test index-signature accesses and missing `.mjs` configuration; corrected typed test
reads and `allowJs` passed. A bare shared-directory Bun filter accidentally collected emitted
`dist` tests; the explicit `./.../index.test.ts` command above corrected that selection.

### R5 watched production negatives

All **40** independent mutations ran in fresh serial monitored processes, produced their
expected assertion failures, and restored the original source in `finally`. Their raw logs,
exact injections, named test commands and combined receipts are in the proof manifest and
compressed `bun-report-{faults,extra-faults}-oct17.py` scripts. These are failed production
assertions under injected faults, not forty claims of exit-zero acceptance: some removed
boundaries still refused later with degraded diagnostics. In particular, absent manifest
name and unnamed nested suite faults lost their named refusal and reached
`canonical JSON cannot serialize undefined`; adjacent Proof comments say so.

The watched boundaries cover full SHA and exact committed reader selection, authority
revision/candidate, manifest/root/regular/blob/raw digest, own target presence and target
shape, report digest, lexical/physical external path canonicality, required absent/unreadable
artifact reads, fatal UTF-8 and malformed JSON, version/outer/nested closed schemas,
revision/digest/empty-target schema constraints, project root and record shape, canonical
regular case source, equal/conflicting duplicate identity, repeated/conflicting XML outcomes
through both production inspector and old devsync surface, outcome loss, nested ancestry
and suite moves, unnamed suites, stable sorting, diagnostic markers, complete digest and
CLI arity. Existing strict XML/parser boundary tests regressed through the shared extraction.

### Fresh real SQLite target — failed target, successful diagnostic inspection

```sh
NX_DAEMON=false NX_ISOLATE_PLUGINS=false RUNTIME_CLOSURE_RSS_MIB=1400 \
  python3 /tmp/runtime-rss-guard.py bunx --no-install nx run wbs-store-sqlite:test:api --skip-nx-cache
```

This fresh run **failed**: 1427 pass, 4 fail, 5841 assertions, 1431 tests across 104 files,
167.57 seconds, sampled peak 1,309,556,736 bytes. It published the 368,651-byte
`tmp/junit/wbs-store-sqlite.api.xml`. All four JUnit failure messages are
`EPERM: operation not permitted, write`, at child-process stdin writes. The failed cases are:

- `browser-auth-lifecycle.db.test.ts`: `two Bun processes capturing one generation publish exactly one successor`.
- `saved-plan-concurrency.db.test.ts`: `refuses at once while the other process is still writing, and only that process commits`.
- `saved-plan-concurrency.db.test.ts`: `writes normally once the other process has committed, on a fresh attempt`.
- `saved-plan-busy.db.test.ts`: `refuses at once and lets a live edit issued in the same window complete`.

These files and `src/testing/write-lock-holder.ts` are unchanged by this slice; none is a
changed implementation path. No baseline failure fix or test skip was added. The first
900 MiB target attempt was killed without a report. Its stale Nx task-invocation row then
refused the next invocation; after confirming the previous invocation had ended, normal
clone-local `nx reset --onlyWorkspaceData` cleared that metadata. The bounded 1400 MiB
retry above completed. This target is not green and does not establish API isolation.

The fresh report was copied to canonical external
`/tmp/puni-bun-report-real-sqlite-oct17/report.xml` and pinned by external schema-1
`authority.json`, against exact selected revision `f83139f2cf065c9ea119f3a91395a092076ebd19`,
candidate `53149f516650193cd2589310efd1a304dca2616fe8cc0189c2a3e12a0c09d9f0`, and selected
manifest digest `7009d190125477c48039122c815861338bd4070c09d3c35639d9826b30ca54ee`.

```sh
RUNTIME_CLOSURE_RSS_MIB=900 python3 /tmp/runtime-rss-guard.py \
  bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts inspect-bun-test-reports \
  /tmp/puni-bun-report-inspector-sol-oct17 f83139f2cf065c9ea119f3a91395a092076ebd19 \
  /tmp/puni-bun-report-real-sqlite-oct17/authority.json
```

The qualified **serial** inspector rerun exited 0, sampled peak 627,871,744 bytes. It
preserved all 1431 cases (1427 passed, 4 failed), all 104 exact selected source tuples,
complete nested titles, unresolved axes, absent authentication and false certification.
Raw report digest is `14ea1b1985c04a6779e817a92098670faeede2de13c4da01ce1cedacc108182b`;
observation digest is `ce1759a9c4c3edcb196bc0d367c78ab951945a8eed63267137c00f09c3c03e92`.
An independent Python XML/Git/SHA-256 check compared every outcome/title/source tuple,
all source bytes and the complete canonical payload (including its terminal newline), exit 0,
32,223,232 sampled bytes. Raw authority, report, full observation and parity receipt are archived.
Its first harness attempt omitted the canonical terminal newline and was corrected; the
production digest was already correct. Authority preparation and the first inspector call
accidentally overlapped; that inspector receipt is explicitly disqualified lane evidence.
Only `bun-report-real-sqlite-inspect-final-oct17.log` is the qualified serial receipt.

### Independent review and normal hook proof

Independent Astra-high durable worktree review reported no P0–P3 findings after verifying
all initial 109 archived artifacts, all 40 fault receipts, the exact allocation prefix and
independent real XML/observation/Git parity. Its earlier nested-title and proof-wording findings
were corrected before approval. Exact-commit review and coordinator release acceptance remain open.

Normal hooks were installed with `bun run tools/tool-git-hooks/src/install.ts`, exit 0,
85,929,984 sampled bytes. The clone-local ignored `lefthook-local.yml` contains only:

```yaml
pre-commit:
  parallel: false
```

The merged `lefthook dump` retained every registered command and glob. The tracked
`lefthook.yml` stayed at SHA-256 `f31bd0e09fa76829b9348f97ad958b66b13d77c557e058096f9052f51f5e6b09`.
The override serializes jobs and is removed after the normal local commit; no job is bypassed.

A temporary staged `libs/shared/domain/test-evidence/src/bun-report-hook-negative.ts` imported
`@twilight-burokrat/judge` and exported that namespace. Normal `bunx --no-install lefthook run
pre-commit` exited 1 at `@nx/enforce-module-boundaries` (a forbidden project cycle), sampled
peak 1,222,045,696 bytes under a measured 1400 MiB ceiling with 17,756 MiB freshly available.
This proves the real graph-backed boundary rule evaluated and propagated failure through
the serialized hook. The temporary source was removed and unstaged. The restored same hook
command exited 0, sampled peak 1,216,794,624 bytes, with format/lint/plaintext-secrets/
private-nesting/tool-wiki jobs executed; SQL migration and LLM-only jobs legitimately had
no matching staged files. Both commands used `NODE_OPTIONS=--max-old-space-size=1024`.

The tool-wiki job visibly returned `status:inactive`, `certified:false`, reason `external
activation root is not provisioned`; hook exit zero therefore proves no activated wiki
admission. Negative/positive/install/merged-config receipts are archived in the proof manifest.
The normal hooked Git commit is the next operation; its external receipt and exact candidate
identity are provided in the coordinator handoff, without claiming hosted or full-gate acceptance.

## WBS080.39 — shared-failures isolated Unit target (2.1l, 2026-10-17)

Isolated worktree `/tmp/puni-shared-failures-unit-oct17` starts at
`796e279014ee94627627cb769fef20a5aac855e5`. Dependencies are supplied by a symlink
to the shared-validation prerequisite's existing node_modules. No install or lockfile change.
The new target follows the shared-validation contract; existing legacy commands remain
unchanged and explicitly unreported. `verifyBunProjectCollection` audits all `src` test files.

Production allocation issued **TEST-AXES-153/154**, preserving every prior event
and appending exactly two events matching the allocator's proposed delta. Production scenario
validation returned `{"unidentified":[]}`. These are allocated identities only; no scenario
citation or coverage credit is claimed.

| Check                                                                                                               | Observed result                                       | Peak process-tree KiB |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | --------------------: |
| New focused test RED                                                                                                | 0 pass, 10 fail; missing canonical level registration |                 78248 |
| Initial focused GREEN                                                                                               | 10 pass, 0 fail, 31 assertions                        |                160488 |
| Full `test-levels.test.ts`, shared-validation and shared-failures focused regression                                | 123 pass, 0 fail, 435 assertions, 30.96s              |                344716 |
| `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx --no-install nx run shared-failures:test:unit:level --skip-nx-cache` | Exit 0; 20 pass, 0 fail, 57 assertions; cache skipped |                359356 |
| Changed-file Prettier write                                                                                         | Exit 0                                                |                274740 |
| Fresh Nx graph                                                                                                      | Exit 0                                                |                234016 |
| ESLint for changed verifier and two test files                                                                      | Exit 0                                                |                784244 |
| Scoped TypeScript, strict base plus allowJs/checkJs                                                                 | Exit 0                                                |                127024 |
| Cached OpenSpec 1.12.0 `validate test-axes --strict`                                                                | Exit 0; change valid                                  |                 73816 |

Each monitored command ran serially with a 900 MiB process-tree ceiling; sampled peaks
are observations rather than representative workload measurements. The first direct cached
OpenSpec binary attempt lacked commander, and a NODE_PATH attempt lacked diff; both refused.
The complete pinned cached Bunx installation above supplied the required tool successfully.

Nine independent production-path faults each exited 1 and failed the named assertion:

| Fault                                     | Observed failed assertion                             |
| ----------------------------------------- | ----------------------------------------------------- |
| Remove shared-failures level registration | Canonical Unit lookup refuses missing declaration     |
| Remove required-target guard              | Missing target inventory refusal no longer occurs     |
| Remove literal selector `./` prefix       | Nested matching throwing decoy executes               |
| Bypass empty selection guard              | Named no-cases refusal is absent                      |
| Remove stale report deletion              | Old XML remains after empty selection                 |
| Replace selector short circuit with `;`   | Partial failed-find selection executes and exits zero |
| Remove complete-source guard              | Omitted new Unit file is accepted                     |
| Remove level-isolation guard              | Database test is admitted to Unit                     |
| Remove report-identity guard              | Same-clear/write wrong report path is accepted        |

Source/manifest SHA-256 values before and after all injections match exactly. The selector
fault reached the actual production shell command and failed its nonzero-exit assertion;
no parser precheck masked it. Focused tests also cover TSX exclusion, unknown targets and
all twenty exact real JUnit testcase names/outcomes/file identities replacing stale XML.

Raw command logs, monitor receipts, allocator prefix proof, fault script and restoration
proof are preserved in `evidence/shared-failures-unit-2026-10-17/manifest.json`.

Committed-revision report inspection and final restored checks follow below. Parent Task 2.1
and WBS080.39 remain open; trusted execution receipts, scenario citation adoption, remaining
projects/levels, coverage and admission are outside this bounded target slice. No full host gate,
hosted CI, release acceptance, push or merge has run here; the coordinator owns those checks.

### Committed execution and report inspection

Normal implementation commit is `4b318f48125b99ce13fd6e10c60ece66b49487dd`. The first normal commit attempt
was killed by the 900 MiB guard at 956812 KiB; it created no commit. Normal unchanged parallel
hooks then passed at **952188 KiB** under the approved 1280 MiB cap. No hook was bypassed.
Lint, format, secrets, private nesting and tool-wiki ran; migration/doc-cap hooks had no matching
files. Tool-wiki reported inactive and certified false because external activation is absent.
Before the final evidence-only hooks, `/proc/meminfo` reported MemAvailable 13877420 KiB.

The exact committed revision's target ran uncached again: **20 pass, 0 fail, 57 assertions**,
exit 0, sampled peak 262352 KiB. Its fresh external report SHA-256 is
`8938e13480430117dfcff37acfc13ee42ed7180ffc2cd0230db9df193f4e84ba`; selected manifest SHA-256 is
`7df8eb0f7e07fd405a1a921e8323e19242a062313ff59841d17d345a44dec09d`. The authority binds candidate
`0aa4824c805e2ad0314c7d79910a2f39e308c11f58a75c880226cfcb810f19ae` and the exact target name.

Production `inspect-bun-test-reports` exited 0 at **698004 KiB**, preserving all twenty
passed outcomes, exact selected Git source tuples and complete case identities. Every case
retains unresolved level/isolation; authentication is absent and certification false.
Complete observation digest: `91fdd924db042f439e8aa1bfccb0c4775f18b8bdfd75ed8200dcaaa8ec5400ba`.

Independent Python XML/Git/SHA-256 verification compared all twenty raw report cases, every
selected source's mode/blob/content digest, the selected manifest bytes, outcome-independent
case IDs and the complete canonical payload with terminal newline. Corrected verifier exited 0
at 21672 KiB. The first parity harness incorrectly hashed a keyed object for case identity;
the production contract hashes an array. That harness-only error is retained as a failed receipt;
the corrected independent verifier agrees with the production output.

Task **2.1l** is complete. Task 2.1 and WBS080.39 remain open. Reports are operational and
noncertifying; no trusted execution receipt, scenario citation coverage, remaining-project
adoption, release acceptance or full gate is established by this slice. The coordinator owns
independent review, exact-head CI, the canonical host gate, publication and integration.

## WBS080.39 — shared-test-levels isolated Unit target (2.1m, 2026-10-17)

Isolated worktree `.worktrees/shared-test-levels-unit-oct17`, branch
`feat/shared-test-levels-unit-oct17`, starts at reviewed predecessor
`bec08dedb78c69d268b5d84fc7b4583b265113ae`. This bounded slice adds the
`shared-test-levels:test:unit:level` target; the original five tests and legacy
`test`/`test:unit` commands remain unchanged. The allocator appended
`TEST-AXES-155` and `TEST-AXES-156`, preserving all prior journal events.

Commands ran serially under a sampled 900 MiB process-tree guard; hook commands use
the existing 1280 MiB guard. Formatting briefly overlapped the first focused run;
its peak was 260116 KiB and that run's peak was 339840 KiB. No guard terminated
either process. All other verification commands below ran serially.

| Check                                                  | Observed output                                                                         | Peak process-tree KiB |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- | --------------------- |
| Missing-registration RED                               | Expected exit 1; canonical lookup: not a declared level target                          | 71820                 |
| Focused GREEN                                          | 10 pass, 0 fail, 31 assertions                                                          | 160056                |
| First full focused regression                          | 133 pass, 1 fail; expected sorted list placed shared-test-levels before shared-failures | 339840                |
| Corrected full focused regression                      | 134 pass, 0 fail, 479 assertions                                                        | 339436                |
| Scoped TypeScript                                      | Exit 0                                                                                  | 146260                |
| Changed source ESLint                                  | Exit 0                                                                                  | 827560                |
| Shared library Nx typecheck and build, serial uncached | Exit 0; both targets succeeded                                                          | 365280                |
| Pinned strict OpenSpec                                 | Exit 0; test-axes valid                                                                 | 65056                 |

### Independent failure proofs

Each fault was applied separately to production source or the actual manifest
command. Every named assertion failed, then the original production bytes were
restored; before/after SHA-256 values match.

| Fault                                   | Observed failed assertion                          |
| --------------------------------------- | -------------------------------------------------- |
| Remove level registration               | Canonical Unit lookup refuses missing declaration  |
| Remove required-target guard            | Missing target inventory refusal no longer occurs  |
| Remove literal `./` selector prefix     | Nested matching throwing decoy executes            |
| Bypass empty selection guard            | Named no-cases refusal is absent                   |
| Remove stale report deletion            | Old XML survives empty selection                   |
| Replace selector short circuit with `;` | Partial failed-find output executes and exits zero |
| Remove complete-source guard            | New Unit file omitted by selector is accepted      |
| Remove level-isolation guard            | Database test is admitted to Unit                  |
| Remove report-identity guard            | Same-clear/write wrong report path is accepted     |

Focused tests also check unknown targets, TSX exclusion, and the exact five real
JUnit testcase names, outcomes and file identities replacing stale XML.
Raw command logs, sampled process receipts, allocator prefix proof, mutation
script and restoration proof live in `evidence/shared-test-levels-unit-2026-10-17/`.
Committed target execution and noncertifying report reconciliation follow in the
evidence commit. Task 2.1 and WBS080.39 remain open. Full h2puni gate, hosted CI,
release acceptance, push and merge have not run; the coordinator owns integration
and independent exact-commit review. No trusted execution, scenario citation,
coverage, admission or certification claim follows from these checks.

### Committed execution and report inspection

Normal implementation commit is `1a3fa48c0b3042290c10da61db5d8c44f40f0dd9`. All normal hooks passed,
including lint, format, secrets, private nesting and tool-wiki, with a sampled
process-tree peak of **896700 KiB** under the 1280 MiB cap. Migration and doc-cap
hooks had no matching files. Tool-wiki reported inactive and certified false
because external activation is absent. No hook was bypassed.

The exact committed target ran uncached with seeded stale XML and produced
**5 pass, 0 fail, 25 assertions**, exit 0, peak **172956 KiB**.
Report SHA-256: `13941642ed132942af89c55da1945e60fbe089b9ad47467640b662697369a7fc`.
Selected manifest SHA-256: `46acb8d29987db82a33476bb69f7c989b926764b1505b33b04608667a0c33447`.
Candidate digest: `1724428c30c2ab52872f5ee2195a041dd4e8feb58c4eaf042441f6affa78f4d3`.

Production `inspect-bun-test-reports` exited 0, peak **625028 KiB**, retaining
all five passing cases and exact selected source tuples. All case levels and
isolation remain unresolved; authentication is absent and certification false.
Complete observation digest: `0a8decd8c42302cb7fada052ab6f1f9adbaa40cb140f54052a6a1353be77aa62`.

Independent Python XML/Git/SHA-256 reconciliation exited 0 at **21000 KiB**.
It compared all five cases including nested describe ancestry, selected source
mode/blob/content hashes, selected manifest bytes, outcome-independent case
identities and the full canonical observation payload with terminal newline.
The external report and authority are copied byte-for-byte into the evidence
directory; raw operational output and the parity script are included.

Task **2.1m** is complete. Task 2.1 and WBS080.39 remain open. Independent
review, exact-head CI, canonical h2puni gate, publication and integration remain
coordinator work. The existing target shell-path contract is unchanged; no
whitespace/glob safety expansion, trusted execution receipts, scenario citation
credit, coverage, admission or certification is claimed.

## Shared Unit integration recovery (2026-10-19)

WBS080.39 was claimed before work under the two-fleet coordination contract.
Claire's TASK-566 reconciliation was read on h1claw without builds or tests.
Remote `task-*` heads and the latest 40 PRs were checked. Final integration
`717576f9` is absent locally, but original source tips `bec08dedb` and `1ae0fa6ae`
exist locally and remotely; fresh main still lacked their isolated Unit targets.

Merge `b869d77e182449fce143086b02620de37ff22429` combines main
`3e8d0742154e90a606b23d305dd6e424bb9c7d06` with the four original commits ending
at `1ae0fa6ae855c6860009ed4e32f0486939fe8af6`, without conflicts. Tree:
`7d52cb5a59ccf5afe7688dd256f42f64f2cd7d91`. Independent review verified all 157
recovered paths are byte-identical to the original tip, all 29 upstream-only
paths match main, and all 144 historical artifacts match recorded hashes and
lengths. No findings or credential material were identified. The branch is
`integration/wbs08039-unit-recovery-20261019`; original branches were preserved.

### Fresh local verification

Bun 1.4.2 installed frozen dependencies in a physical worktree-local directory.
The unchanged lock SHA-256 is
`e8d77926f9dac4ba4824486143872bdfb123cafd8bed45cca50c44b2e23298a4`.

| Check                                                                                                                        | Observed outcome                                |
| ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Baseline `bun test` of `test-levels.test.ts` and `shared-validation-level.test.ts`                                           | 112 passed, 0 failed                            |
| Same command plus both recovered level suites                                                                                | 134 passed, 0 failed, 479 assertions            |
| Restored two recovered suites after mutations                                                                                | 20 passed, 0 failed, 62 assertions              |
| `nx run-many --projects=shared-failures,shared-test-levels --targets=test:unit:level,typecheck --parallel=1 --skip-nx-cache` | All four tasks passed                           |
| `nx run tool-devsync:test-levels:verify --skip-nx-cache`                                                                     | Production collection verification passed       |
| ESLint on verifier and three changed test files                                                                              | Exit 0                                          |
| OpenSpec 1.12.0 `validate test-axes --strict --json`                                                                         | One valid change, no issues                     |
| Normal merge hooks using locked local Lefthook                                                                               | Passed; trusted activation inactive/uncertified |

Both targets ran uncached again with static Nx output at committed `b869d77e`:
20 shared-failures cases and 5 shared-test-levels cases passed. Fresh external
authorities pinned that revision, candidate, manifest and report bytes.
Production `inspect-bun-test-reports` accepted both. Independent Python XML/Git/
SHA-256 reconciliation confirmed every outcome, title, selected source, case ID
and complete observation digest. Digests respectively:
`83920c925669b592f2ae1c40c32538263f793eab8ff4c70e35d39341242c2ae4` and
`b88e4437d3a6431a887d3a4f1744afaa5b62d8f9e50e6f800acca2a88b0e76c3`.
Authentication remains absent, certification false, case level/isolation unresolved.

### Watched production negatives

Each fault ran separately for each project: 18 exits of 1 at the named assertions.
Before/after hashes proved restoration of the verifier and project manifests.

| Fault                                   | Observed assertion failure          |
| --------------------------------------- | ----------------------------------- |
| Remove registration                     | Canonical Unit collection lookup    |
| Remove required-target guard            | Missing target declaration refusal  |
| Remove literal selector `./`            | Nested throwing decoy executes      |
| Bypass empty-selection guard            | Expected no-cases diagnostic absent |
| Remove stale-report deletion            | Stale report remains                |
| Replace selector short circuit with `;` | Failed selector runs partial output |
| Remove complete-source guard            | Omitted Unit source accepted        |
| Remove level-isolation guard            | API source admitted to Unit         |
| Remove report-identity guard            | Different report path accepted      |

Local replay copies used current paths and the archived 900 MiB process-tree
guard. The first replay failed before injection at an obsolete temporary root;
that attempt is not a qualifying negative. Corrected replay and restored tests
passed. Original scripts and evidence bytes remain intact. Historical raw logs
retain trailing whitespace/CRLF: whole import `git diff --check` reports those
logs; the check excluding historical evidence passed.

The 68 fresh logs, scripts, authorities, reports, independent parity results and
fault/restoration receipts are in
`evidence/shared-unit-recovery-2026-10-19/receipts.json.gz`, SHA-256
`5fb19a6b3e9388acd9580649a9e5285574ac47975985269963fd1e6bc817d795`.
The initial sandboxed install failed on a read-only temporary directory; the
authorized frozen install succeeded. No full local gate was run.

Canonical exact-SHA h2puni gate, hosted CI and release acceptance remain pending
at this documentation checkpoint. Tasks 2.1l/2.1m retain bounded implementation
completion; parent 2.1, wider test axes, trusted activation and WBS080.39 stay open.

### Canonical gate diagnosis and denial oracle repair

The canonical h2puni gate printed the exact head `0458166ba60fbbdd9142101bdc2537b4816a84aa`.
Frozen install, OpenSpec and full formatting passed. Its devsync test target
reported 880 pass / 1 fail: `permanent denial converges to bounded refusal`
rejected a non-`response` observation. The full gate had not terminated at this
checkpoint; it is not a passing receipt. Both original HTTP observation source
and test were byte-identical to the main base.

A real loopback reproduction made later denial responses arrive after the request
deadline. The report retained an initial 403 and subsequent `deadline` failures;
the original response-only assertion failed. The host log did not print the
classification, so this reproduction establishes the oracle defect without
claiming the exact host observation was captured. Remaining-window deadlines are
already required by the convergence spec and slow-final test.

The repaired test covers immediate and delayed denials. It requires an initial
403, nonempty retries, only 403-response or deadline failures, and explicit deadline
coverage in the delayed case. The original production implementation is unchanged.
The complete HTTP suite passed: 19 tests, 99 assertions. ESLint passed. Injecting
a successful retry into production `observeConvergence` made both cases fail at
the refusal assertion (exit 1). After restoring production source, both passed;
restored SHA-256 is `a29e800009925e9b71b3656dd785c1255650a1f5dbd859e6d0ecc511ce659d55`.
Independent read-only review found no issues. The initial sandboxed test could not
open a listening socket (EPERM) and is not counted as a qualifying reproduction.

Four raw reproduction, passing-suite, injected-fault and restored-suite receipts
are in `evidence/shared-unit-recovery-2026-10-19/denial-oracle-receipts.json.gz`,
SHA-256 `d4480c7f36a1bbd8336881553b7745644925e4cbb915a1ba0a58d50728ba7c2a`. The updated commit requires fresh canonical gate and hosted CI;
no full-gate success, certification or parent-item completion is claimed here.

### Descriptor cleanup oracle repair during parallel reconciliation

The exact-head h2 gate for `8d680232712b02fff570009f5d50861e69d0acd9`
reached Twilight Dash with 2109 passing tests and one failing test:
`selected check closes remaining owned descriptors after a leaf descriptor was closed`.
Its process-wide descriptor count expected 23 but observed 22. A controlled
unrelated-descriptor close reproduced the same invalid assumption (12 versus 11).
This proves the count can fail without an owned-descriptor leak; the original host
run did not capture which unrelated descriptor disappeared.

The repaired test reuses the neighboring successful-stage test's descriptor-target
snapshot helper. It requires a nonvacuous capture of every expected source ancestor
and leaf, then checks each owned descriptor/target pair is gone after refusal. An
unrelated descriptor is intentionally closed during the fixture. Removing owned
ancestor-directory closes from production made the repaired test fail at the leaked
`/` target. Production was restored byte-for-byte, SHA-256
`070a8cca938255208ec6d6a5311a8974254c97dbbfe650a61709e4dda99cc1e6`.
Both focused tests passed, followed by all 141 selected-check tests (628 assertions).
Independent read-only review found no blockers. No production cleanup change was
needed; remaining stage contents and unchanged database rows are still asserted.
Raw reproduction, positive, negative and restored receipts are in
`evidence/shared-unit-recovery-2026-10-19/descriptor-oracle-receipts.json`.

Hosted CI at `8d6802327` passed workspace and all four browser shards, but Burokrat
pilot tests refused the two newly added undeclared gzip archives. That separate
classification repair is being prepared in an isolated parallel branch. Neither
host nor hosted full-gate acceptance is claimed for this head.

### Parallel repair integration

Commit `8b02974b6` carries the independently reviewed descriptor-test repair;
`951575309` integrates the parallel binary-declaration repair from `ccfebf1ba`.
Both shipped wiki policies now name exactly the two recovery gzip receipts as
historical evidence consumed by this verification record. No wildcard or fallback
classification was added. The full pilot suite passed 24 tests / 430 assertions.
Production `classify-candidate` replay on the combined tree accepted each exact
archive under each policy; removing its declaration or renaming it to an unlisted
gzip failed with exit 1 naming the undeclared path (12 invocations, four cases).
Raw script and receipts are in
`evidence/shared-unit-recovery-2026-10-19/classification-receipts.json`.
Normal hooks, scoped lint/format and whitespace checks passed. The parallel lane's
standalone lint lacked an Nx graph and visibly skipped module-boundary enforcement;
canonical and hosted gates must supply full enforcement. External trusted activation
remains inactive/uncertified. The superseded h2 run already has a failed Dash target;
a new exact-head gate and hosted CI remain required after this combined repair.

## WBS080.39 — shared-test-evidence isolated Unit target (2.1n, 2026-10-19)

Prepared worktree `/home/df/.codex/worktrees/e21c/puni-00`, branch
`integration/wbs08039-evidence-unit-20261019`, starts at main
`a82d6fa9b0d87105cdafcaef474ab51a73abebd8`. Fresh remote task heads showed only
Claire's scroll branch. The latest forty PRs and all open PR paths were checked;
no open PR adds this target. Historical verifier overlaps #419 and #423 have
exact heads already ancestral to main. The WBS claim was recorded and read back
by the coordinator before implementation.

The original dependency symlink pointed to the user's checkout, whose lock
hash differs. Only that symlink was removed; Bun 1.4.2 installed 1296 packages
frozen into a physical worktree-local directory. The candidate lock SHA-256
remained `e8d77926f9dac4ba4824486143872bdfb123cafd8bed45cca50c44b2e23298a4`.
No donor contents, parser behavior, existing twelve cases or legacy runners changed.

OpenSpec apply reported `sdd-lean`, 73/91 completed tasks, ready to implement.
The bounded addition follows 2.1k/l/m. Production allocation appended only
TEST-AXES-157 and TEST-AXES-158; every earlier journal event remained equal and
scenario provenance validation passed. Parent 2.1 and WBS080.39 remain open.

### Checks and resource observations

Commands, output and sampled process-tree measurements are retained in
[evidence receipts](evidence/shared-test-evidence-unit-2026-10-19/receipts.json).
Each guarded invocation required at least 12 GiB MemAvailable and had a 2 GiB
sampled RSS ceiling and 360-second deadline. No resource stop fired. Sampling
at 50ms does not establish a hard upper bound between samples. The first Nx
Unit run accidentally overlapped the final seconds of the focused regression;
it is not claimed as serial acceptance. The committed run below was performed alone.

| Check                                                            | Observed outcome                                                                                   |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| New onboarding suite before registration                         | Exit 1; 0 passed, 10 failed on missing declaration/unclassified legacy runner                      |
| Restored onboarding suite                                        | Exit 0; 10 passed, 31 assertions; all twelve real report outcomes matched hand-listed expectations |
| Verifier and four shared onboarding suites                       | Exit 0; 145 passed, 523 assertions                                                                 |
| Real uncached `shared-test-evidence:test:unit:level`             | Exit 0; twelve passing cases                                                                       |
| Production `tool-devsync:test-levels:verify`                     | Exit 0; declared collections verified                                                              |
| ESLint on changed verifier and test files with Nx graph present  | Exit 0; no graph-absence warning                                                                   |
| Narrow TypeScript config over changed verifier and tests         | Exit 0                                                                                             |
| Uncached shared-test-evidence Nx typecheck and build, parallel=1 | Both passed                                                                                        |
| Changed-file formatting                                          | Passed                                                                                             |
| Pinned OpenSpec 1.12.0 strict test-axes and all validation       | Both exited 0                                                                                      |

### Independent production failure proofs

Each fault ran independently against the new production-boundary suite, produced
exit 1 at the named assertion, and was restored before the next fault.
The retained [mutation receipts](evidence/shared-test-evidence-unit-2026-10-19/r5.json)
and [restoration hashes](evidence/shared-test-evidence-unit-2026-10-19/r5-restoration.json)
record all nine observations. Adjacent Proof comments identify the new registration
and production-command failures; existing verifier guards retain their prior proofs.

| Injected fault                          | Named failing assertion                              |
| --------------------------------------- | ---------------------------------------------------- |
| Remove new level registration           | Canonical Unit collection lookup                     |
| Remove required-target guard            | Missing target declaration refusal                   |
| Remove literal selector `./`            | Nested throwing decoy executes                       |
| Bypass empty-selection guard            | Expected no-cases diagnostic absent                  |
| Remove stale-report deletion            | Stale XML remains                                    |
| Replace selector short circuit with `;` | Partial selector output executes despite failed find |
| Remove complete-source guard            | Omitted Unit source accepted                         |
| Remove level-isolation guard            | API source admitted to Unit                          |
| Remove report-identity guard            | Different clear/write report identity accepted       |

The new suite also checks TSX contamination and unknown target refusal. It uses
real shell commands, file inventories and reports; the expected twelve case names
are literal values read from the unchanged source tests. The Node ESM subprocess
case executes normally. No trusted receipt, certified coverage, admission, target
name normalization or broader shell whitespace/glob safety is claimed.

### Committed report observation

Normal source-commit hooks passed for
`6a1853485d4129e4e2ee87b312f8ce747a2c460c`, including lint, formatting, secrets
and private-nesting. Tool Wiki reported `inactive`, `certified:false`, because
its external activation root is not provisioned. Migration and doc-cap hooks
visibly skipped their unmatched file classes.

At that clean committed candidate, the uncached Unit Nx target ran alone and
passed all twelve cases. The exact external report and authority are preserved
byte-for-byte as `report.xml` and `authority.json`. Production
`inspect-bun-test-reports` passed with sampled peak 633500 KiB. Independent
Python XML/Git/SHA-256 reconciliation checked all twelve outcomes, nested suite
titles, source mode/blob/content pins, outcome-independent case IDs, selected
manifest bytes and the complete observation digest. It passed at 16948 KiB.
The observation digest is
`1372dc64a4f9963da2b2677706dca165d5b1480653779296c11bf0c23400a6be`.
The retained observation leaves every case's level/isolation unresolved,
authentication absent and certification false. Later evidence-only commits do
not claim the source report was executed at their own SHA.

### Remaining acceptance

Coordinator canonical h2puni/hosted CI acceptance remains pending.
No full local gate, host gate or full tool-devsync test/typecheck/build was run;
scoped checks above are the local evidence. Task 2.1n is complete within its
bounded implementation, committed observation and independent-review scope.
Parent 2.1 and WBS080.39 remain open; reports remain noncertifying.

### Independent review receipt

The independent `coverage_review` agent reviewed exact head
`c0ab86142e0f19a6cc57344214017ea5119d080d` and reported no findings.
Its read-only checks verified all fourteen evidence manifest hashes, selected
source pins, XML outcomes and observation digests, and confirmed the existing
library source stayed unchanged. This records review of those committed bytes;
it does not claim a host gate, hosted CI, authenticated execution or certification.
The coordinator will obtain review of this documentation-only completion delta
before publication. No code tests are repeated for this receipt and checkbox edit.

### Coordinator terminal acceptance — PR #580 (reconciled 2026-10-21)

This receipt supersedes the pending coordinator acceptance above for bounded task
2.1n. [PR #580](https://github.com/Prosperous-Unification/puni-00/pull/580)
merged reviewed source `8c52394bff2d8dc03b9f1e5d7289a4120619f5b1` as
`5851eee0c49f03722c77e59d5c4661cf18b20b39` at 2026-10-19 21:45:41 UTC.
The source gate and merged-revision receipts below retain their distinct identities;
neither is attributed to this documentation follow-up.

The canonical `bin/h2puni-gate.sh 8c52394bff2d8dc03b9f1e5d7289a4120619f5b1`
completed with exit 0, observed at 2026-10-19 23:53:50 UTC. Its actual marker is
`h2puni gate: running on 8c52394bff2d8dc03b9f1e5d7289a4120619f5b1`.
The full gate log is retained on h2puni at
`/home/puni1/wbs08039-evidence-unit-gate-8c52394b-20261019.log` and locally at
`/tmp/puni-pr580-h2-final-20261020.log`: 66,183 bytes, SHA256
`0b1dd059a3d99c75e8f6569edd8c1de26d2a7bf0deb2e30bec5f794ce5e08d73`.
Metadata is `/tmp/puni-pr580-h2-final-20261020.json`. This terminal receipt
supersedes the earlier running-gate snapshot; the source SHA is not the merge SHA.

[Full postmerge CI 39330011791](https://github.com/Prosperous-Unification/puni-00/actions/runs/39330011791)
completed successfully on exact merge `5851eee0c49f03722c77e59d5c4661cf18b20b39`,
with all ten jobs successful, including workspace, Twilight and four browser shards.
[CodeQL 39330011938](https://github.com/Prosperous-Unification/puni-00/actions/runs/39330011938)
also completed successfully on that exact merge. Both terminal workflow states and
the PR merge identity were rechecked during this reconciliation.

The dev observation at 2026-10-19 22:37:15 UTC records backend HTTP 200 with
`status:ok` and the exact merge commit, frontend HTTP 200, and matching checkout
HEAD, origin/main, last-synced and last-proven identities, all
`5851eee0c49f03722c77e59d5c4661cf18b20b39`. Its retained receipt is
`/tmp/puni-pr580-dev-gate-20261019T2237.json`, SHA256
`19c90e35d37b0abcfcf06547629dd284a03d7cda7bcfddf5d8b9c2507c0da6ad`.
The dev receipt's simultaneous gate observation was still running and supplies no
terminal gate verdict; the separate final receipt above supplies that verdict.
The dev receipt and final gate log were rehashed against the recorded identities.
These raw files remain external receipts, not files embedded in this repository.

This closes the coordinator acceptance recorded as pending for the bounded PR580
slice. Parent task 2.1 and WBS080.39 remain open. The committed reports remain
noncertifying, with authentication absent and level/isolation unresolved as recorded
above; release checks do not promote those report facts. No production deployment,
trusted activation or parent completion is inferred. This append changes only the
verification record; it does not rerun code tests, CI, the host gate or live dev checks.

## WBS080.39 4.1c.3 fresh closure evidence (2026-10-21)

Fresh verification of the existing capability scenario diagnostic ledger on base
`69a8b38f4f63ef4242ca1ed12926909fa2b5b127`, in managed isolated worktree
`/home/df/.codex/worktrees/4a91/puni-00`, branch
`feat/wbs08039-scenario-ledger-proof`. No production code, scenario ID or allocation
journal changed. Existing adjacent `Proof:` comments remain unchanged. Task 4.1c.3
remains unchecked pending independent exact-candidate review; parent 4.1, T2, source
reconciliation, certification and WBS080.39 remain open.

The durable [command receipts](evidence/wbs08039-4.1c.3-20261021/commands.json)
record exact repository-root commands, exit statuses, runtime/dependency provenance
and captured output links. Bun is 1.4.2; repository-pinned OpenSpec is 1.14.3. The ignored
worktree-local node_modules symlink reuses the existing root dependencies; no install
was performed.

| Fresh check                                                            | Observed output                                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Owning scenario-ledger suite, before faults                            | Exit 0; 59 pass, 0 fail, 201 assertions, 43.13s                                       |
| Restored ledger/Performance-scenarios/Performance-levels/Manual suites | Exit 0; 263 pass, 0 fail, 879 assertions, 117.33s                                     |
| Existing v2 Browser ledger regression                                  | Exit 0; 88 pass, 0 fail, 304 assertions, 92.67s                                       |
| Uncached Nx twilight-burokrat:lint:source                              | Exit 0; 20.0s                                                                         |
| Uncached Nx twilight-burokrat:typecheck                                | Exit 0; 1.3s; target uses `tsc --build --force`                                       |
| Uncached Nx twilight-burokrat:build                                    | Exit 0; target/dependencies successful, 2.3s                                          |
| Freshly built installed scenario provenance                            | Exit 0; `{"unidentified":[]}`                                                         |
| Pinned OpenSpec 1.14.3 `validate --all --json`                         | Exit 0; 264/264 valid (246 changes, 18 specs)                                         |
| Changed Markdown/JSON Prettier and `git diff --check`                  | Exit 0; all matched files formatted; no whitespace errors                             |
| Pinned OpenSpec 1.14.3 selected `--strict --json`                      | **Exit 1**; 35 preexisting requirement-length WARNINGs (>500 characters), zero ERRORs |

The [base comparison](evidence/wbs08039-4.1c.3-20261021/strict-baseline.json)
proves the complete referenced spec and each of the 35 warning-named requirement
sections are byte-identical between base `69a8b38f` and candidate `7a63b3082`.
The coordinator explicitly kept strict warning cleanup outside this bounded slice;
strict validation is not claimed passing. The ordinary all-artifact validation passed.
Both restored suites include source/built installed dispatch, complete canonical digest
and preservation assertions. Missing and mode-000 unreadable ledger authority and Manual
report cases passed separately. The v1 suite retains actual current, stale, failed,
skipped and overdue Manual observations. The v2 extension remains unchanged.

All **46** production guard/dependency faults in the historical ledger matrix were
freshly injected and watched fail selected owning assertions with Bun exit 1. The
[matrix](evidence/wbs08039-4.1c.3-20261021/mutations.json) records the exact production
path, literal search/replacement, selected test pattern, named failing tests, captured
assertion log, pre-fault/restored SHA-256 and byte-equality restoration. Each source was
restored in `finally` before the next fault. The complete restored four-file suite then
passed all 263 tests. This exercises closed authority/path/schema checks, exact
Performance and repinned nested Manual joins, debt/output preservation, canonical
ordering/digest, CLI arity/debt status and built installed dispatch.

Two initial experiments changed an earlier shared occurrence (Browser diagnostic
helper and another CLI branch's arity guard). Their tests correctly stayed green;
they prove nothing about the intended guard and are **excluded** from the 46. The
[inconclusive receipts](evidence/wbs08039-4.1c.3-20261021/mutation-attempts.json) and
separate `*-wrong-seam.log` files preserve them. Correcting each mutation to the
specific ledger seam produced its watched assertion failure. No product defect was
found or repaired.

Only docs/evidence are committed. No full repository gate, host gate, exact-head CI,
integration, deployment, source reconciliation or WBS write was performed by this
worker. The diagnostic fixtures grant no coverage, admission, authentication or
certification. Independent review and coordinator release acceptance remain pending.

The final full base-to-candidate whitespace check initially exited 2 on CRLF or
trailing whitespace in `build.log`, `lint-source.log`, `typecheck.log` and
`mutation-arity.log`; the earlier working-diff-only check had missed committed log
content. Those four captured logs are normalized by stripping only trailing space,
tab and CR on each LF-delimited line. Command receipts preserve their original and
normalized SHA-256 and changed line numbers; assertion text, outcomes and line order
are preserved. The complete base-to-prospective-candidate `git diff --check` then
exited 0, and the regenerated artifact inventory matches all normalized bytes.
