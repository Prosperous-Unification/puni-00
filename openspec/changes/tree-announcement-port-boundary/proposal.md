## Why

Plan import depends on the concrete work-item resource only to announce the imported tree. This introduces a resource-to-resource K6 edge and ties the import contract to a concrete implementation.

## What Changes

Introduce a neutral `TreeAnnouncement` application port with `announceTreeNow(projectId): Promise<void>`. ImportServices accepts this port structurally. Composition keeps passing the complete scoped work-item instance and its import collector.

## Non-Goals

Changing import behavior, scope, authority, transaction ownership, collectors, fan-out, rollback, other K6 findings, enforcement or deployment.

## Constraints

Preserve the method receiver and existing composition without an unbound wrapper. Use the exact reviewed project's external K6 policy and trusted TypeScript. Prove the committed boundary with direct and transitive barrel faults; run existing import, memory, SQLite and mounted organization suites.

## Capabilities

### New Capabilities

- `tree-announcement-boundary`: Import announces trees through a neutral application port.

### Modified Capabilities

None.

## Domain Terms

None. Existing Plan import and Work item terms apply.

## Decisions Recorded

None. This is a reversible interface extraction with no new technical shape.

## Impact

`libs/wbs/application/core`: one port and one dependency type. Composition supplies the existing scoped resource. No runtime dependency, API or storage change.
