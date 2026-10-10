---
status: proposed
---

# A leaf's status folds over its included step nodes, every project step included

Assumed by Fable 5.1 on 2026-10-11 under Dany's 2026-10-10 `/goal`; veto sheet
`puni-plan/batch-10/interviews/VETO-SHEET.md` (line `10-Q7`). Change:
`openspec/changes/fold-over-included-nodes`, blocked on participation (WBS 010.4.13.3,
`configure-project-step-workflows`).

Today a leaf folds over "the steps it holds work for", so a blank, silent QA node does not
keep a leaf from reading done — which is how human steps hid as whole work items. Once
**participation** exists (a node is `included` unless explicitly `skipped`), a leaf's
progress fold runs over every included node of every project step: done is unanimous over
them, a silent included node keeps the leaf in progress, skipped nodes are absent, and the
last included node cannot be skipped. This change ships only after participation is stored
and lists every leaf on the dev store whose reading moves; rows marked done from the row
menu do not move because the menu writes every node.

## Considered Options

- **Keep the worked-steps fold.** Rejected: a step nobody estimated never blocks done, the
  very fault the field evidence named.
- **Drop skipped nodes from "steps with work" without stored participation.** Rejected:
  conflates "nobody spoke" with "explicitly skipped".
- **Ship the fold change before participation exists.** Rejected: a project with an
  optional step could never read done in the gap.
- **An all-skipped leaf reading done.** Rejected: nothing was done.

## Consequences

- Readings on existing plans move; `verify.md` carries the list and the row menu's `done`
  is what holds the rest still.
- Until this lands, the readings packet (`step-node-readings`) extends the fold only
  additively: a node holding an attempt "holds work", and a running attempt reads in
  progress.
