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
