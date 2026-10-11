## Why

A step node's readable reference ends in its immutable code, such as `010.plan` and `010.impl`. Ordinary alphanumeric sorting orders those by code instead of project step order. People who keep references in lists need the step position first, including projects with ten or more steps.

## What Changes

Canonical step references include the step's one-based displayed ordinal before its code: `010.s1-plan`, `010.s2-impl`, `010.s3-review`. Ordinals are zero-padded to the decimal width of the project's step count, so a twelve-step project emits `s01` through `s12` and ordinary string sorting preserves step order within one work item. The work-item read, resolve response, open step-cell detail, copy-reference action and plan-document export use the same canonical spelling. Code-only references such as `010.impl` and unpadded ordinal aliases remain accepted on input at the current address revision.

## Non-Goals

Step-node IDs, step codes, step order, work-item numbering, copied node-ID links, scheduling and storage do not change. This does not promise that a readable reference stays fixed after step insertion, deletion or reorder.

## Constraints

The `accept-padded-step-reference-aliases` parser release must be deployed to production and all older be-01 instances drained before this change merges. Blue and green share the public API during deployment. The address-revision refusal continues to protect callers from a reference that could now mean another node. No arbitrary step-count maximum is introduced.

## Capabilities

### Modified Capabilities

- `wbs-domain`: canonical step references place a zero-padded ordinal before the immutable code while legacy input remains accepted.
- `plan-import`: plan-document exports spell their derived step-node references in the same canonical form.

## Domain Terms

Step reference and Step node ID; update the established glossary definitions in `CONTEXT.md`.

## Decisions Recorded

None.

## Impact

Domain formatter and resolver, be-01 work-item read and resolve endpoint, FE step-cell detail through returned data, and plan-document export. No migration or new response field.
