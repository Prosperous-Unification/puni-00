## Why

Dany (2026-09-27, WBS 010.4.11) wants each step of a work item addressable — `010.dev`, `020.2.review` — so work can depend on one step and later workflows can order steps as a graph. Estimates, facts, assignments and slices are already keyed by (leaf, step), but the pair has no identity, readable name or lifecycle rule.

## What Changes

- Every leaf work item has one **step node** per project step, identified by a **step node ID**; parents have none. A project with no steps keeps a zero-time **work-item boundary** that is never a step node.
- Steps gain an immutable, project-unique **step code**. A **step reference** (`010.dev`) spells a node readably; the ordinal alias `010.s1-dev` is accepted on input only.
- Reads expose each leaf's step node IDs and references. Commands addressing a leaf's step accept a step node ID; a step reference is accepted only with the project revision it was read at.
- One shared seam resolves the step-node graph with edge provenance (workflow, legacy); Fast and the solver request builder read it. Schedules are unchanged.
- Structural edits carry step nodes with leafhood: hand-down and hand-up keep facts and journal the node mapping.
- A step cell names its node, `010.dev · Dev`, with copy actions. Export carries step codes.

## Non-Goals

No typed dependencies, configurable workflows, step kinds, optional participation, node resource overrides or execution attempts. No change to schedules or step columns. Steps are not work items (`docs/adr/0031-a-step-node-is-a-pair-not-a-work-item.md`).

## Constraints

Archive `unestimated-steps-take-no-schedule-time` first, so unknown nodes are already zero-time. `add-step-finish-start-dependencies` builds on this change. Storage stays additive: a nullable code column and its partial unique index, with `down.sql`. Blue and green share SQLite during a swap, so an older writer can create an uncoded step; that state is modeled and visible until the post-swap backfill codes it. A step node ID is never an access path; authority comes from the project. Coordinate the plan-document version with the dependency and allowance changes.

## Capabilities

### Modified Capabilities

- wbs-domain: step nodes, codes, references, graph and lifecycle.
- plan-command-registry: node-addressed commands.
- plan-import: step codes in plan documents.

## Domain Terms

Step node, Step node ID, Step code, Step reference, Step graph and Work-item boundary are defined in `CONTEXT.md`.

## Decisions Recorded

`docs/adr/0031-a-step-node-is-a-pair-not-a-work-item.md`. Technical shape in `design.md`.

## Impact

Contracts, slice-edge seam, step table, command normalizers, import/export, MCP schemas, step cell. One additive migration pair.
