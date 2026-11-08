## Why

Static workflow-binding validation is implemented and reviewed on the parked agentic
branch, but its pull request also contains durable runtime and WBS changes. Those
commitments are not required to inspect a binding document. The user has authorized
merging reversible components while leaving hard-to-change architecture unmerged.

## What Changes

Extract the existing optional Burokrat binding validator and CLI onto current main.
It checks strict activity-class shapes and project-step coverage, reads referenced
prompt bytes, and prints a deterministic static acceptance digest. Existing commands
and validation behavior remain compatible. No package release is part of this change.

## Non-Goals

No runtime, database, migration, RunStore/ArtifactStore, WBS API, executor invocation,
credential, provider, scheduler or coordinator change. No repository default binding,
gate activation, live call, paid call or production deployment. The broader agentic
plan remains open; this command makes no execution-authority or recovery claim.

## Constraints

Bun/Nx, repository R1–R5, exact reviewed binding semantics, current-main callers, and
fresh focused checks, independent review, canonical exact-SHA gate and applicable CI.
The command is optional and has no persisted runtime consumers. Reverting its source,
tests and documentation requires no data migration. Existing glossary terms suffice.

## Capabilities

### New Capabilities

- Optional static command within `twilight/workflow-binding`.

### Modified Capabilities

None.
