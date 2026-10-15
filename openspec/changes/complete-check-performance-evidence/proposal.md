## Why

A complete Twilight Burokrat check cannot receive Performance evidence through its CLI, even though the evaluator supports it. This prevents a complete diagnostic evaluation from judging PERF-THRESHOLD with observations bound to the selected candidate and external policy.

## What Changes

Allow `check ... --performance-evidence <json>` without selecting one rule. Preserve complete checks without evidence and selected-rule checks, including selected PERF-THRESHOLD with evidence. Reject duplicate or unknown flags and evidence supplied with an unrelated selected rule. Document the evidence option in help.

## Non-Goals

No certification, trusted activation, new rule semantics, or WBS completion claim.

## Constraints

Keep `certifies: false`; preserve candidate, policy, declaration and runner selection binding. Exercise source and freshly built executable paths, with observed negative proofs.

## Capabilities

### New Capabilities

- `complete-check-performance-evidence`: External Performance evidence is available to complete CLI checks.

### Modified Capabilities

None.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

Twilight Burokrat CLI parsing, help and production-path tests. No new dependency.
