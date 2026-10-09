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
