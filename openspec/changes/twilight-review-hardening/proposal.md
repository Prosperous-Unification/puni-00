## Why

The branch review found contradictory workflow instructions and missing runtime
contracts for upgrades, revocation and expired workers. Future agents need one
reproducible workflow and precise acceptance criteria before implementing Twilight.

## What Changes

Fix design applicability during fast-forward and archive context failure handling.
Make the repository's OpenSpec workflow variants reproducible and check their
consistency through Nx. Tighten the existing proposed runtime and planning
contracts, including approval retries, parallel plans and receipt lineage.

## Non-Goals

Implementing the Twilight runtime, changing WBS storage, activating the Twilight
default schema, or deploying, archiving, merging or publishing anything.

## Constraints

The user approved the review's fixes. Preserve the current branch and existing
authority split. Use Bun/Nx, observed negative tests and attributed evidence.
Keep future runtime experiments explicitly unrun. The existing product tasks
remain unchecked. Historical review receipts are not rewritten.

## Capabilities

### New Capabilities

- `twilight/workflow-maintenance`: Reproducible workflow variants and explicit
  applicability/failure handling.

### Modified Capabilities

None. Runtime clarifications amend the unsynchronized `twilight-control-plane`
proposal; they do not claim its implementation or create duplicate requirements.

## Domain Terms

Use the owning [Twilight glossary](../../../docs/twilight-structure/CONTEXT.md).

## Impact

OpenSpec schema, generated skills/commands, repository workflow tooling and CI;
the existing architecture/specification/plan documents and their navigation.
