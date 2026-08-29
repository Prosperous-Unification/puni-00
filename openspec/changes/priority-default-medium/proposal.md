<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

A priority is absent until somebody types one, and an absent priority is drawn
as nothing at all. So a plan's Prio column is empty until it is curated, and a
reader cannot tell "nobody has decided" from "this is ordinary work". Dany's
call (2026-08-29): ordinary is the default, and the plan should say so.

Making every item carry a middle priority immediately breaks the colours. Today
the ramp runs hot-to-cool by rank — `Medium` is a yellow at rank 2 — and a plan
where every row is Medium becomes a column of yellow chips shouting about
nothing. `Lowest`'s grey, meanwhile, is the quietest thing on the ramp and is
worn by the rung nobody looks at.

## What Changes

**A created work item carries the middle rung's number.** `createWorkItem`
writes the project's own **rank 2** band's `defaultValue` — 50 in the default
ladder, whatever the project cut it to otherwise. By rank and never by the label
`Medium`, because a project may rename it, exactly as the colours are keyed.

**Existing work items are not touched.** No backfill, no migration. A plan
written before this change keeps its blank priorities and keeps rendering them
blank; `priority` stays nullable and null still draws as nothing.

**The ramp becomes diverging around the default.** Rank 2 takes the neutral grey
`Lowest` wears today. Ranks 3 and 4 become two steps of one cool blue, 4 the
more saturated. Ranks 0 and 1 are unchanged. Colour then reads as _distance from
ordinary_: hot above, quiet at, cool below — instead of a heat ramp where the
commonest value is the third-hottest thing on screen.

## Non-Goals

- Backfilling existing null priorities. Considered and rejected: it would move
  every plan on screen for a default nobody typed.
- Changing the ladder's cuts, labels, count, or the `defaultValue` a rung writes
  when chosen by hand.
- Any scheduling change. A priority decides which of two eligible slices is
  placed first, and giving every new item the same one changes no order.

## Capabilities

### Modified Capabilities

- `wbs-domain`: what a created work item's priority is, and how a priority band
  is coloured.

## Domain Terms

Priority; Priority band; Priority ladder; Rank.

## Impact

`plan-commands.ts`'s `createWorkItem`, `work-item` repository create,
`priority-band-style.ts`'s `BAND_INKS`, and the four faces that read it — the
Prio cell, the chart, the plan cards, the export. No migration.
