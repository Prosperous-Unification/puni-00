## Why

The phase-one attempt journal records lifecycle but cannot establish which objects Docker directly created. Lost command outcomes and name reuse must remain unresolved before any future recovery authority can be considered.

## What Changes

Network and registry creation reserve separate durable pending operations before Docker executes. Each successful command's full returned ID becomes a durable direct creation receipt before the next creation. A read-only assessment checks both receipts against the current daemon and exact inspected identities, refusing foreign attachments and unresolved evidence.

## Non-Goals

Deletion execution, automatic recovery, name or label adoption, k3d resource receipts, volume ownership, recovery CLI activation, and changes to ordinary down.

## Constraints

Preserve phase-one journal semantics, unconditional deletion refusal, attempt history, and k3d `--no-rollback`. Owner-only trusted files reject malformed, missing, unreadable, symlink and nonregular evidence. Use offline fixtures, Bun and scoped Nx checks. No push, deploy or host gate in this implementation task.

## Capabilities

### New Capabilities

- `fleet-direct-creation-receipts`: Durable direct Docker creation identities and read-only assessment without deletion authority.

### Modified Capabilities

None.

## Domain Terms

Direct creation receipt; pending creation operation.

## Decisions Recorded

None.

## Impact

`tools/tool-fleet` direct network/registry creation, separate owner-only attempt operation files, offline fixtures, and the fleet glossary.
