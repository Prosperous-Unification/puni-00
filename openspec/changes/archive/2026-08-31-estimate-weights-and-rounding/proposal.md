<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Two things a project cannot say about its own arithmetic, both asked for by
Dany on 2026-08-30.

**The PERT weights are hardcoded.** `expectedDays` is
`(o + 4r + p) / 6` and the `6` is written into the expression: _"When PERT is
selected i want you to add the config for PERT weights; By default it is 1 4 1
… I want to be able to configure the specific coeficients for the formula"_. A
team that trusts its optimistic figure less, or one that wants the plain
average, has no way to say so.

**Final days are fractional, and nobody chose that.** A `2/3/10` step is 4
days, a `1/2/4` step is `13/6` days, and the table prints the sixth. Dany wants
the figure a step contributes to be a whole number of days and wants to choose
which way it goes: _"options - floor, round, ceil; ceil by default"_. The
**order** is the request, and today's code does not have one to change: the
per-step figure is what gets rounded, and only then are several steps summed —
never the other way round.

## What Changes

- A project holds three **PERT weights** (1/4/1 unless it says otherwise). The
  divisor is their sum, so 1/4/1 is `/6` and 1/1/1 is a plain average.
- A project holds an **estimate rounding** — `floor`, `round` or `ceil`, `ceil`
  unless it says otherwise — applied to one step's combined figure, whichever
  method combined it.
- A work item's total days is the sum of its steps' **rounded** figures, and a
  parent's is the sum of its descendants' rounded figures. Both change today's
  answers, which is the point: `docs/adr/0011-…`.
- Float drift is snapped to the whole day before the rounding runs, so `ceil`
  cannot mint a day out of `1.0000000000000002`.
- Weights that cannot average — negative, non-finite, or summing to zero — are
  refused as 422; unreadable stored values throw.

## Non-goals

- No new estimate method. `Plan with` still offers the same four.
- Weights are read only under `pert`; the other three methods pick a point.
- The schedule's arithmetic is untouched — it is handed the same per-slice
  number the table shows, as it always was.

## Constraints

- Additive migration with a `down.sql`; blue and green share one file.
- Every existing project's numbers move on the release that carries this.
