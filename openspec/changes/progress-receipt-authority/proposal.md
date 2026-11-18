## Why

Navigator compares a bound progress receipt with a caller-selected export. WBS can apply ordinary commands, but no existing operation ties that assertion to a currently accepted reference or prevents a second application. The owner selected WBS and SQLite as the single planning authority.

## What Changes

Specify explicit WBS acceptance of a complete reference for one project/repository/change, attribution of a bounded operator assertion and a separate application command. WBS checks current issuer policy, caller permission, target state, accepted basis and prior consumption under its writer transaction. Conflicts require explicit resolution.

## Capabilities

### New Capabilities

- `progress-receipt-authority` governs WBS reference acceptance, operator attribution and once-per-assertion progress application.

### Modified Capabilities

None.

## Non-Goals

This change retires the unimplemented Backlog.md storage spike and migration. Live enrollment, key custody, automatic execution-derived claims, installation qualification and release remain separate work. Existing Navigator proposals and ordinary WBS edits retain their meanings.

## Constraints

Use the existing WBS command and SQLite boundaries. Preserve schema-1/2 records and the original export bytes. Start with ordinary v11 plans. A file, Git object ID or submitted command batch cannot authorize a WBS write.

## Impact

WBS HTTP contracts, command execution, SQLite persistence and mounted tests will change during implementation. Navigator and Burokrat supply planning artifacts and consistency semantics. [ADR 0086](../../../docs/adr/0086-wbs-accepts-planning-references-and-progress.md) records the authority decision.
