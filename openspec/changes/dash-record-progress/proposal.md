## Why

Navigator prepares plan references and consumes progress receipts, and Burokrat checks their consistency, but Dash cannot produce the receipt. Operators must construct and digest the record themselves. A local producer completes this file workflow while keeping the operator's progress assertions visible as supplied input.

## What Changes

Add `twilight-dash record-progress --entries <entries.json> --plan-reference <reference.json> --tasks <tasks.json> --output <new-receipt.json>`. Dash validates supplied entries against the existing version 1 receipt contract and reference/tasks, writes the digest-identified receipt exclusively, and prints its digest. Existing Burokrat validation and Navigator command conversion consume it unchanged.

## Non-Goals

Task execution, measured usage collection, CheckRun-to-completion inference, receipt authentication, evidence-content verification, certification, current WBS authority, WBS writes, blockage eligibility, a clock reading, an authority store, a new record schema, or package publication. This does not complete WBS 080.25.

## Constraints

Preserve supplied entry order, repetitions, timestamps, evidence and optional measures. Retain all supported reference/task pairs: v6/v7 with schema 1 and v8/v9 with schema 2. Reuse Burokrat contracts and consistency checks; preserve all existing commands. Refuse malformed or inconsistent inputs before output creation. Missing and unreadable files remain distinct failures. Output is deterministic, owner-only, and never replaces a file. Bun/Nx, focused TDD and watched R5 negatives apply.

## Capabilities

### New Capabilities

- `dash-progress-receipts`: emit an existing progress receipt from explicit operator entries and consistent planning documents.

### Modified Capabilities

None.

## Domain Terms

None added. Existing Progress receipt, Plan reference, Task export and Completion receipt remain distinct in the [Twilight glossary](../../../docs/twilight-structure/CONTEXT.md).

## Decisions Recorded

None. This local additive command creates no new trust or planning authority; [ADR 0052](../../../docs/adr/0052-dash-runs-activation-checks-and-burokrat-judges-their-receipts.md) remains applicable to the limits of operator-supplied evidence.

## Impact

Dash command, focused tests, CLI documentation and exact import-policy allowance; Navigator documentation; test-input declarations and their corresponding wiki relationships if required by the cross-command tests. No production dependency from Dash to Navigator or WBS.
