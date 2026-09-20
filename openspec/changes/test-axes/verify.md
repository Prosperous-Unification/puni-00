# Verification Report

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
