## Why

Navigator currently accepts a task export whose digest matches its plan reference even when the documents disagree semantically. Re-digesting an inconsistent pair can therefore produce a WBS command batch, and duplicate step codes can silently redirect progress through a lookup map.

## What Changes

Require Burokrat plan and task consistency before converting a progress receipt to commands. Refuse mismatched plan identity, task count, unsupported document/task version pairs, and duplicate task IDs, step IDs or step codes before creating output.

## Non-Goals

No certification, approval, admission, requirements validation, dependency closure, Dash receipt producer, or WBS mutation.

## Constraints

Reuse the existing typed contracts and Burokrat checks in process. Preserve historical v6/schema1 and v7/schema1, current v8/schema2, native estimates, receipt binding and membership, deterministic batch bytes and owner-only exclusive output. Retain the unknown-input Burokrat CLI wrapper. No dependencies or subprocess validation.

## Capabilities

### New Capabilities

- `navigator-receipt-plan-consistency`: require consistent plan/task documents before receipt conversion.

### Modified Capabilities

None.

## Domain Terms

None; existing plan reference, task export and progress receipt terms apply.

## Decisions Recorded

None; the approved architecture reuses existing contracts and semantic checks.

## Impact

Twilight Navigator receipt conversion, Twilight Burokrat contracts export, production dispatcher tests and Navigator README. This is the next bounded WBS080.25 slice after `validate-navigator-plan-tasks`.
