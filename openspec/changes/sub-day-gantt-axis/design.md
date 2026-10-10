# design — `sub-day-gantt-axis`

Interview: `puni-plan/batch-10/interviews/020.09-answers.md` Q4; measurements: the 020.07
report on `origin/experiment/r6b-timeline` (final run: 2000×5 zoom/pan p95 166–202 ms, mount
p95 308–340 ms; 500×5 interaction p95 ≤ 67 ms; 31-attempt fixture, min 112 s, median 587 s).
No ADR: every choice here is reversible presentation.

## D1 — The ladder

`DAY_SCALES` becomes `AXIS_RUNGS`, one record per rung: `{ id, pxPerWorkday, cellsPerWorkday,
label }`. Day rungs keep their pixel values and labels (`28`/`12`/`4` px per day; `Days`,
`Weeks`, `Months`), so `DayPx` callers and every pixel assertion stand. Sub-day rungs are
`{ '4h', 56, 2, '4 h' }`, `{ '1h', 224, 8, '1 h' }`, `{ '15m', 896, 32, '15 min' }` — 28 px
per cell, as the day rung has, so the cell grid reads the same at every rung. The control
is the existing rung control with six positions; the title carries the exact width.

## D2 — Geometry

`layOutGantt` takes the rung. A slice's drawn width is `effort workdays × pxPerWorkday`; at a
sub-day rung a calendar day is drawn as its 480 working minutes (one day cell = one workday
cell), weekends greyed as today, so nothing changes at stage 1 for a workday-unit plan but
the width. A bar whose width is under 4 px is painted 4 px wide with `data-tick`; the hover
card carries the exact span. Every mark has a pointer surface of at least 18 CSS px, centred
on the mark, drawn as an invisible hit rect above the row line (the row line keeps pointing
the row). When two or more pointer surfaces contain the pointer, hover opens a **collision
list** — one line per mark, `number · step · span` — and the card opens for the line chosen;
with one surface the card opens directly as today.

## D3 — Offer rule

`markCount(plan, rung)` = visible leaves × project steps (+ attempts when
`gantt-attempt-marks` lands). A sub-day rung is offered only when `markCount ≤ 2_500`
(`SUB_DAY_MARK_LIMIT`). Above it the control renders the rung disabled with
`data-not-offered` and the words `not offered at <N> marks`; the panel never falls back
silently and never picks a rung for the reader. If the reader is on a sub-day rung and a
filter change raises the count past the limit, the panel moves to the finest day rung and
says so in the control's title.

## D4 — Measurement, not a gate

The 020.07 harness is rerun on the shipped component at the 15-min rung for the 500×5 and
2000×5 fixtures and the p95 figures are recorded in `verify.md` beside the experiment's.
Raising the limit later needs a new recorded measurement; nothing pins wall-clock in CI.
