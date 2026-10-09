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

### Task 2.1g ancestry-cycle refusal proof — 2026-10-09

A test-only preload rewrote one adopted child's `/proc/<pid>/stat` parent PID to itself after the ordinary owner inventory was active. The owner also held an independent direct sibling. With the production ancestry-cycle guard temporarily removed, elevated `bun test tools/tool-devsync/src/performance-processes.test.ts --test-name-pattern 'cyclic process-inventory ancestry'` exited **1**, 0 pass/1 fail: the isolated supervisor timed out after 8.04 seconds inside the unbounded ancestor walk. Restoring the guard and its adjacent `Proof:` comment made the same command exit **0**, 1 pass/0 fail/5 assertions in 109 ms; cleanup reported `PID ancestry cycle`, did not signal the cyclic adopted child, and drained the independent sibling. The test's teardown terminated the ambiguous child within its isolated supervisor. The final owner/helper suites together exited **0**, 27 pass/0 fail/129 assertions in 23.82 seconds. A real `/proc` cycle is not expected from Linux; the injected malformed inventory proves that this refusal remains bounded and breakable. No 2.1g or 2.1h completion is claimed by this proof.
