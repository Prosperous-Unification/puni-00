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
