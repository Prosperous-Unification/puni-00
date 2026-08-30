<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Type `2/2/3` into a folded role's cell, blur, and the box says `2.2`. The three
numbers a person chose leave the screen the moment they land, and the only ways
back to them are a hover card or unfolding the role — and unfolding one role
folds another, so a plan cannot be read with every trio open.

Dany, 2026-08-29: _"i want to keep seeing the values i've put in; if it was
2/2/3 and it aggregated into 2.3 under the PERT, i want to still see the 2/2/3
and let 2.3 estimate be added to total days for this work item"_.

There is a second fault under the first. `2.2` is not a legal way to have typed
that estimate: retyping it stores `2.2/2.2/2.2`. It is the one box in the grid
whose at-rest value is not what typing it back would store.

## What Changes

**The folded role cell holds the trio shorthand it was given.** `2/2/3`, and
`5` where all three points agree — the form `parseTrioShorthand` already reads,
so the box round-trips: what it shows is what typing it back would store.

**The derived figure rides beside it, muted**, and only where it says something
the box does not: `2/2/3 · 2.2`, but `5` alone. It is read off the row rather
than off the half-typed draft, exactly as the hover card's `Final` is.

**Both faces, one rule.** The table's cell and the phone card's figure box read
the same `showTrio`, and the card grows the same muted figure beside its box.

**Nothing about the estimate itself moves.** `libs/domain` and `apps/be-01` are
untouched: the roll-up, the estimate method and the schedule are the same
numbers, read differently.

## Non-Goals

- Any change to what is stored, sent, or computed. No engine, wire or schema change.
- Growing the role column past its 96px budget, or a row past its height budget.
- Changing the three unfolded point boxes, the hover card, or the `@` mention.
- Remembering the literal characters somebody typed. be-01 stores three numbers;
  `5/5/5` and `5` are one estimate and print as one.

## Capabilities

### Modified Capabilities

- `wbs-domain`: what a folded role's cell reads at rest.

## Domain Terms

Trio shorthand; Estimate; Roll-up.

## Impact

`estimate-draft.ts` (new `showTrio`), `wbs-table.tsx`'s folded cell and
`combinedValue`, `plan-cards.tsx`'s phase row, their tests,
`e2e/layout.spec.ts`, `CONTEXT.md`.
