<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

`dep-waits-on-first-role` (2026-08-11) made a dependency wait on the
predecessor's **anchor slice** — its first estimated slice in step order — so
that nothing waits on QA. That was Dany's call then, from his pre-wbs
scheduler's rule.

Seeing it drawn, his call on 2026-08-29 is the opposite: a dependency should
wait for the predecessor's work to be **finished**, all steps, not its first.
The anchor rule is not wrong — it is one project's hand-off convention, and it
was made the whole system's.

## What Changes

**A project says what its dependencies reach.** A new per-project setting,
**dependency reach**, with two values: `whole-item` — the successor waits for
the predecessor's last slice — and `anchor-slice`, the rule shipped in August.
It is edited in the project settings modal beside the ladder and the steps.

**The default is `whole-item`, for every project including existing ones.** A
column default on `project` applies to every row, so every plan changes shape on
the release that carries this. That is the intent: Dany's reading of a chart is
that the August rule is the surprising one.

**The engine takes the reach as an argument.** `anchorSliceOf` is not deleted —
it becomes the `anchor-slice` arm of one function that answers "which of the
predecessor's slices must finish". Parent expansion, successor-side attachment,
floors, cycle detection and the item-anchored arithmetic are untouched.

**Gantt arrows leave whichever slice the reach names.** Under `whole-item` an
arrow leaves the projection's finish, which is where it left before August;
under `anchor-slice` it leaves the anchor. Selected from slices already on the
wire, no payload change beyond the setting itself.

## Non-Goals

- The per-edge model — "030 needs 020·dev". Still wanted, still later. This
  change makes the project-wide default a choice rather than a constant, which
  is what that model would fall back to.
- Lag, lead, start-to-start. No new edge kinds.
- Any change to the dependency picker, the chips, the hover card, or the cycle
  rule.

## Capabilities

### Modified Capabilities

- `wbs-domain`: what a dependency waits for, and where that is decided.

## Domain Terms

Dependency reach (new); Dependency; Anchor slice; Slice; Projection.

## Decisions Recorded

- ADR — a dependency's reach is a project's choice, not the system's

## Impact

`project` gains one column (additive, with `down.sql`); `schedule.ts`'s edge
expansion; the project settings modal; the plan payload gains the setting;
`gantt-geometry.ts`'s arrow origin; the identity fixtures re-derived.
