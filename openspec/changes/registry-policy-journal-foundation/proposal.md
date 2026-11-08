## Why

The registry rollout in PR #843 contains independently reviewed planning and durable-journal work alongside unfinished installed lifecycle authority. Keeping these foundations trapped in the complete rollout prevents independent integration and verification.

## What Changes

Add dormant pure admission/retention planners and an owner-only journal command with durable protection, publication reservation and maintenance phase records. Preserve crash obligations and reject malformed or missing trusted state. Compare canonical receipt timestamps chronologically, including expanded and negative years.

## Non-Goals

No caller integration, provisioning, enrollment, physical maintenance verification, publication, deletion, backup, deployment or activation. A caller's reconciliation assertion and phase record do not prove an external action occurred. The complete registry rollout remains separate and unfinished.

## Constraints

Use existing Bun, Nx, ArkType and scratch support. Add only the five standalone source/test files and scoped documentation; retain existing entrypoints and targets. Preserve the original rollout. Validate owned temporary files and ordinary processes without privileged isolation fixtures. Independent review, remote CI and the exact-revision host gate remain merge requirements.

## Capabilities

### New Capabilities

- `registry-policy-journal-foundation`: Pure registry planning and explicitly invoked durable ownership records.

### Modified Capabilities

None.

## Domain Terms

Registry release bundle, registry publication reservation, registry image protection, registry maintenance record; defined in [the factory glossary](../../../docs/twilight-structure/CONTEXT.md#registry-foundation).

## Decisions Recorded

None; this extracts existing reviewed boundaries without a new irreversible architectural choice.

## Impact

Five additions under `tools/tool-fleet/src` are picked up by existing tests and TypeScript globs. Existing runtime callers and deployment remain unchanged. Source provenance: [PR #843](https://github.com/Prosperous-Unification/puni-00/pull/843).
