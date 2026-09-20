# Verification Report

**Change**: `service-taxonomy`
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
286 openspec/changes/service-taxonomy/proposal.md
```

## 3. Task Completion

- [ ] Implementation tasks remain open by design. This packet records a proposed architectural change and does not implement its rollout slices.

## 4. Delta Spec Sync

| Capability         | Sync status | Note                                                           |
| ------------------ | ----------- | -------------------------------------------------------------- |
| `service-taxonomy` | N/A         | Proposed change; nothing is archived or synced by this packet. |

## 5. Failure Proofs

| Check (file)                     | Fault injected                                                                             | Test that observed the failure                                                | Result                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `specs/service-taxonomy/spec.md` | Removed the sole `#### Scenario:` heading from `SERVICE-TAXONOMY-041`, leaving its bullets | `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json` | Exit 1; `ADDED "Enforce mode refuses every taxonomy violation" must include at least one scenario`; totals 97 passed, 1 failed. Patch: `/tmp/puni-batch1/010-3-record-the-decision.whole.20260919T221212Z/evidence/proof-1-fault.patch`. Failing report: `/tmp/puni-batch1/010-3-record-the-decision.whole.20260919T221212Z/evidence/proof-1-failing.json`. |

Proof: on 2026-09-20, restoring the saved bytes passed `cmp`, and validation returned 98 passed, 0 failed.

The validator does not check GIVEN, WHEN or THEN content; removing those bullets remained valid in the planning probe, so this proof makes no claim that scenario bodies are checked.

## 6. Executor Checks

All commands below ran against the restored, formatted working tree on 2026-09-20.

```text
$ OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 status --change service-taxonomy --json
intent done; specs done; design done; tasks done; verify done
isPlanningComplete true; isComplete true

$ OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate --all --json
{ "items": 98, "passed": 98, "failed": 0 }
strict single-report predicate: passed
baseline + 2 predicate: passed (96 + 2 = 98)

$ bun test tools/tool-devsync/src/adr-index.test.ts -t '^ADR numbers are unique and contiguous from 0001$'
1 pass
0 fail
Ran 1 test across 1 file.

$ NX_DAEMON=false bunx nx format:check --all
exit 0; no output
```

The whole `tool-devsync:test` target and the host gate remain pending planner verification because this executor may not write Git objects or use the host gate.

## Decision

- [ ] Archive readiness is outside this packet. The change remains proposed until its implementation tasks and evidence are complete.

## 7. Backend service classification integration

**Verified at**: `2026-09-20`

**Verifier**: Codex executor, attempt
`020-8-classify-backend-services.slice-F.20260920T015607Z`

The attempt started at `8d2e9985f01708a007805a6a152cf0f50a098889` with a clean
`git status --short`. The three `git cat-file -e HEAD:<path>` prerequisite checks for the
service-taxonomy delta spec, proposal and this verification record each exited 0 without output.
The delta spec distinguishes inventory integrity, which fails in every mode, from taxonomy debt,
which remains report-only in observe mode.

### Inventory and checks

| Command                                                                                                                                                                             | Exit | Decisive output                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---: | --------------------------------------------------------------------------------------------------------------------------------- |
| `bun "$TMPDIR/queue.ts"`                                                                                                                                                            |    0 | `candidates 95, classified 95, left 0, stale 0, suffix-declared 1`                                                                |
| `(cd tools/tool-devsync && bun test --preload ../test/scratch/preload.ts src/service-kinds.test.ts)`                                                                                |    0 | `17 pass`, `0 fail`, 17 tests across one file                                                                                     |
| `NX_DAEMON=false bunx nx run tool-devsync:typecheck`                                                                                                                                |    0 | `Successfully ran target typecheck for project tool-devsync`                                                                      |
| `NX_DAEMON=false bunx nx run tool-devsync:lint`                                                                                                                                     |    0 | `Successfully ran target lint for project tool-devsync`                                                                           |
| `NX_DAEMON=false bunx nx run tool-devsync:build`                                                                                                                                    |    0 | `Successfully ran target build for project tool-devsync and 4 tasks it depends on`; all five tasks were read from the local cache |
| `bunx prettier --write tools/tool-devsync/src/service-kinds.test.ts docs/code-organization/kinds.json docs/code-organization/README.md openspec/changes/service-taxonomy/verify.md` |    0 | all four owned paths formatted                                                                                                    |
| `NX_DAEMON=false bunx nx format:check --all`                                                                                                                                        |    0 | no output                                                                                                                         |
| strict OpenSpec validation block from the batch README                                                                                                                              |    0 | one report; `99` passed, `0` failed; strict single-report predicate passed                                                        |

The policy contains 11 feature, 3 repository, 9 resource and 72 support entries. One feature,
`libs/wbs/application/core/src/service/import.service.ts`, names capability `unspecified`; its
rationale records that no accepted capability specifies import.

### Slice F failure proofs

Every mutation was saved as a patch under this attempt's `evidence` directory, the named focused
test matched exactly one test, the mutation failed it, and copying the saved passing bytes back
passed `cmp` before the same focused test returned `1 pass`, `16 filtered out`, `0 fail`.

| Fault                                                                                  | Named failure observed                                                                                                                                               |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deleted `apps/wbs/be-01/src/service/assumed-assignee.ts` from the policy               | Completeness failed with that path on a `-` line and `1 fail`.                                                                                                       |
| Added `apps/wbs/be-01/src/service/does-not-exist.ts`                                   | Completeness failed with that path on a `+` line and `1 fail`.                                                                                                       |
| Removed `term` from `libs/wbs/application/core/src/service/calendar-marker.service.ts` | The required-field test failed with `+ "libs/wbs/application/core/src/service/calendar-marker.service.ts: term"`.                                                    |
| Removed `rationale` from `apps/wbs/be-01/src/service/optimization-coordinator.ts`      | The rationale test failed with `+ "apps/wbs/be-01/src/service/optimization-coordinator.ts"`.                                                                         |
| Changed `assumed-assignee.ts` to `assumed-assignee.resource.ts`                        | The suffix-versus-entry test failed with the suffixed path on a `+` line; completeness separately failed with the original path on `-` and the suffixed path on `+`. |

### Planner evidence, 2026-09-20

Transcribed from the retained slice A attempt `020-8-classify-backend-services.slice-A.20260920T005048Z` (report, sixteen patches and their failing and restored logs, kept outside the repository), not reconstructed from source comments. Each fault failed the named test of `service-kinds.test.ts` and was restored byte for byte before the next.

| Fault in `service-kinds.ts` (slice A)                              | Test that failed                                                                                                      |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `.ts`, `.d.ts`, `.test.` and `.spec.` predicates, each made `true` | `candidates are the non-test TypeScript files under the roots and nothing else` (four runs)                           |
| Suffix exclusion disabled; `.repository.ts` removed from the list  | `a file that declares its kind by suffix owes no policy entry, wherever it lives` (two runs)                          |
| Empty-root refusal disabled                                        | `a service root that tracks nothing is refused, not read as an empty inventory`                                       |
| Git failure no longer thrown                                       | `a workspace Git cannot read is refused, not read as an empty inventory`                                              |
| `[]` returned when the policy cannot be read                       | `an absent policy is refused, naming the file` and `an unreadable policy is refused, naming the file`                 |
| `[]` returned for invalid JSON                                     | `a policy that is not JSON is refused, naming the file`                                                               |
| `kind` widened to `string`                                         | `a policy that fails the schema is refused with the failing field`                                                    |
| Duplicate detection disabled                                       | `a policy that classifies one path twice is refused, naming the path` (also replayed by the planner: 12 pass, 1 fail) |
| Capability, term and disposition requirements, each removed        | `a kind asserted without the field that makes it checkable is named` (three runs)                                     |
| Rationale-presence conjunct removed                                | `every entry but a re-export shim owes a written rationale`                                                           |

Planner runs outside the executor sandbox, on the staged slice F tree:

- `NX_DAEMON=false bunx nx run tool-devsync:test --skip-nx-cache`: exit 0, 284 pass, 0 fail (267 before this task).
- Warm-cache experiment. With the target answered from cache, deleting one entry from `docs/code-organization/kinds.json` alone forced a fresh run that failed, 283 pass and 1 fail; restored, the target was answered from cache again. Then a new staged file under `libs/wbs/application/core/src/service/` with no entry forced a fresh failing run, 283 pass and 1 fail; removed, cache again. The existing workspace-wide test input already covers both files, so no explicit `kinds.json` input is added to `tools/tool-devsync/project.json`.
- Planner review of the classification: every rationale read; two entries changed after checking importers (`solver-child-lifecycle.ts` and `prepare-import.ts` are private members of their single production importer); the 36 shim entries checked by script against their files; every resource term checked against `CONTEXT.md`.

Still pending: `bin/h2puni-gate.sh <sha>` on the shared build host. This machine is not that host.
