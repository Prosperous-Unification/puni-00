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
cell), weekends greyed as today, so before the instant axis nothing changes for a workday-unit plan but
the width. Sub-day cells are labelled by project-zone clock time from the
anchor `STAGE_ONE_DAY_START_MINUTE` (09:00; `gantt-attempt-marks` D-constant, retired by
`agent-calendar-instant-axis`): `09:00`, `13:00` at `4 h`; every hour `09:00`–`16:00` at `1 h`;
every quarter at `15 min` with the hour printed once per hour; the day header keeps the date.
The remembered rung in `remembered-layout.ts` stores the rung `id`; a stored day-rung pixel value
from before this change reads as its rung by value, and an unknown stored value is a rendered
reset to `Days`, not a guess. A bar whose width is under 4 px is painted 4 px wide with `data-tick`; the hover
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

The 020.07 harness is rerun against the shipped renderer at the 15-min rung. The 500×5
fixture has no attempts and exercises the production panel at its 2,500-mark limit. The
2000×5 fixture has 10,000 marks, so the production control must refuse that rung; measure
its rendering cost through a dedicated benchmark entry into the same renderer. Do not add
a production prop, URL switch or alternate limit that bypasses the offer rule. Record the
benchmark entry and fixture in `verify.md`, label its p95 mount/interaction figures as
renderer-only, and record the production refusal separately. Compare both fixtures with
the experiment's figures. Once attempt marks exist, also measure an attempt-inclusive
fixture within 2,500 total marks. Raising the limit later needs a new recorded measurement;
nothing pins wall-clock in CI.
