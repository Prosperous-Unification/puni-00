# A step node is a pair, not a work item

**Status:** accepted, 2026-09-27 (WBS 010.4.11). Design memo:
`puni-plan/wbs-feedback-2026-09-26/step-nodes/design.md`.

Dany asked whether each step of a work item should become a separate work item
with a dependency on the previous step, addressable as `010.s1-dev`. We make each
leaf's step an addressable **step node**, identified by the pair
`(workItemId, stepId)`, and keep work items as the only tree rows. Estimates,
actuals, measures, progress and assignments are already keyed by that pair and
slices are already scheduled per pair, so the pair is the identity; no
`step_node` row is stored until a node carries a fact that no existing table holds.

## Considered Options

- **Steps as child work items.** Rejected: a step would take a tree position,
  number, type, team inheritance and roll-up of its own, every leaf would become a
  parent, and `010.dev` would renumber with its siblings. Undoing that after
  imports and saved plans exist would need a destructive migration.
- **A mandatory `step_node` table.** Rejected for now: every step insert, step
  delete and tree edit would have to create or delete rows in step, with no new
  information. Sparse pair-keyed records remain open for later node overrides.

## Consequences

- The readable spelling `010.dev` is not an identity: it follows renumbering.
  Stored references and wire mutations use the step node ID; the spelling is
  resolved against one project revision.
- A leaf that gains its first child loses its step nodes. Structural edits must
  move their facts and concrete dependency endpoints together or refuse.
- A project with no steps keeps a zero-time work-item boundary, which is never a
  step node.
