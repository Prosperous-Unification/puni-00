## Why

Navigator persists a plan reference and its task export separately. Burokrat can decode the reference, but has no command to check whether those two supplied documents are consistent.

## What Changes

- Move the unchanged PlanTasks and PlanTask contracts into Burokrat and consume them through Navigator's existing contract alias.
- Add `twib validate-plan-tasks <plan-reference.json> <tasks.json>` with strict positional arguments and strict JSON input decoding.
- Check canonical task digest, plan identity, task count, schema pairing and unique task IDs and step IDs/codes.
- Emit a deterministic report scoped to `plan-task-consistency`.

## Impact

This bounded WBS080.25 slice grants no approval, admission, certification, requirements validation or dependency closure claim. It adds no Dash facade and does not change Navigator's output formats.
