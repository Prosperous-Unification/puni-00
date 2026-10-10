## Why

A step node says only `in_progress` or `done`, and the field evidence (WBS 020.10) asked for
"planned, now implementing" at a glance, for a failed run that is being redone, and for QA
that is waiting on a finished Dev. With attempts stored (`step-node-attempts`) every one of
those is derivable; nothing shows it yet.

## What Changes

- A **node reading** is derived on every read, never stored, first match winning: `skipped`
  (participation, once it exists) → `done` (statement) → `on_hold` / `blocked` (the row's
  hold) → `in_progress` (statement or a running attempt) → `blocked_by_proxy` (the row's) →
  `waiting` → `unknown`. **Waiting** is a node with no statement and no running attempt, at
  least one predecessor node in the step graph, every predecessor reading `done`.
- The progress fold counts a node holding any attempt as holding work, and a running attempt
  reads `in_progress` in it. The fold's step set is otherwise unchanged
  (`fold-over-included-nodes` changes it later).
- The step cell carries the reading as a corner glyph reusing the row's glyph and palette
  where the word is shared, plus `◇` waiting and `∅` skipped; the cell card names the reading
  with the attempt count, last outcome and latest executor and reference. The Status column
  keeps the row fold. A component test asserts every reading has its own glyph.
- The work-item read carries `readings` per step node.

## Non-Goals

Participation and node holds (010.4.13.3, `configure-project-step-workflows`); the fold over every project step
(`fold-over-included-nodes`); attempt marks (`gantt-attempt-marks`); engines reading
progress or attempts; an actor kind on statements; the board's step-node columns (010.3.08).

## Constraints

`step_progress`'s `CHECK` and the stored statements stay `in_progress | done`; no migration.
The reading `skipped` is in the type and produced only once participation exists; a test
proves it is never produced without that input. The skipped glyph is `∅` (`design.md` D4 says
why). Depends on `step-node-attempts`.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `wbs-domain`: node readings, the fold's attempt extension, the corner glyph and card.

## Domain Terms

Node reading, Waiting — applied to `CONTEXT.md` by task 0.2 from the glossary delta.

## Decisions Recorded

none: vocabulary and presentation (`020.10-answers.md` Q1, Q10); ADR 0045 records that
`failed` and `waiting` are not stored states.

## Impact

`@wbs/domain` (`node-reading.ts`), `@wbs/core` (`roll-up.ts`, work-item read), contracts,
fe-01 (step cell, folded step card, status glyph table).
