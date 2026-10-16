## Why

Plan import depends on the concrete directory resource for four directory reconciliation operations. This retains the final selected core resource-to-resource K6 edge and couples import to unrelated directory behavior.

## What Changes

Introduce a neutral `ImportDirectory` port with exactly `listWithin`, `addWithin`, `patchTeamWithin` and `addPersonWithin`. Move the existing `DirectoryRefusal` and `DirectoryOutcome<T>` declarations into a neutral outcome port, re-exporting them from the directory resource for existing callers. ImportServices accepts ImportDirectory structurally.

## Non-Goals

Runtime behavior, composition, transactions, authority, collectors, fan-out, rollback, other findings, policy activation, WBS090 certification or release.

## Constraints

Preserve generic catalog inference, optional PersonKind, receiver, borrowed scope and collector. Use the exact tree-announcement external K6 policy and tool identity. Observe a committed baseline and candidate, then separately committed direct and port re-export faults. Run focused Bun tests serially; release gates remain with the coordinator.

## Capabilities

### New Capabilities

- `import-directory-boundary`: Plan import reconciles the directory through a neutral application port.

### Modified Capabilities

None.

## Domain Terms

None. Existing Plan import and Directory terms apply.

## Decisions Recorded

None. This is a reversible interface extraction.

## Impact

`libs/wbs/application/core`: two neutral ports, moved outcome declarations and one dependency type. No API, storage or runtime change.
