<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

A slice is a coherent unit of behavior with a test that proves it, not a
two-minute keystroke. "Add a failing test for X, then make it pass" is ONE
slice.

Any slice that adds a safety check must also name the negative test proving the
check fails when the guarded thing is broken. See AGENTS.md, "Non-vacuous
checks". A check with no negative test is not done.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

Every fixture below starts **Monday 2026-08-10** — the date `gantt-panel.test.tsx`
already seeds — and every coordinate assertion is taken at an offset **past the
first weekend**, where the calendar number differs from the workday number. An
assertion at workday 3 passes unchanged on the axis this change is replacing and
so proves nothing: the same shape as the sixteenth check that could not fail, one
step earlier.

## 1. The scale

- [ ] 1.1 `calendarDaysBetween(from, to)` in `libs/domain/src/workday.ts` —
      whole calendar days, midnight-UTC arithmetic like its neighbours, throwing
      on a non-`IsoDate` as `toUtc` already does — test:
      `libs/domain/src/workday.test.ts`, a weekend crossing (Fri→Mon is 3), a
      same-day zero, a month boundary, a year boundary and a **DST-crossing**
      pair, `2026-03-07` → `2026-03-09`, asserted to be exactly 2; negative: the
      arithmetic done on local-midnight `Date`s instead of `toUtc`, with the
      case pinning `process.env.TZ` to `America/New_York` around itself (it is
      one process for the file, so it is restored after), watched failing on
      1.9583333333333333 for that pair. **Not** "rounded instead of exact on a
      month boundary": both operands are midnight UTC, so the difference is
      already whole days and `Math.round` changes no answer this function can
      be asked for — that negative passes with the fault in, which is the shape
      R5 exists to stop. Measured 2026-08-09: the local-midnight fault gives
      1.958 under `TZ=America/New_York` and 2 under `TZ=UTC`, and rounding it
      gives 2 either way; `Proof:` comment naming the zone and the pair
- [ ] 1.2 `calendarScale(startDate)` in `gantt-geometry.ts` — `startOf(w)` and
      `endOf(w)`, origin `addWorkdays(startDate, 0)`, fractions preserved,
      offsets below zero returned as themselves — test: `gantt-geometry.test.ts`,
      the six scenarios of the scale requirement: 3.5 and 4.75 flat; 5, 5.25 and
      10 jumping to 7, 7.25 and 14; `endOf(5)` = 5 against `startOf(5)` = 7;
      `endOf(6)` = 8; a Saturday start date landing on the Monday origin; −0.25
      answered rather than thrown
- [ ] 1.3 The end reading is the scale's left limit, not `startOf` — negative:
      `endOf` aliased to `startOf`, watched failing the "span that finished on
      the Friday" case (7 for 5) while every pre-weekend case stayed green, which
      is the whole reason that case exists; `Proof:` comment naming it
- [ ] 1.4 The origin is the scale's own, not a caller's — negative: the origin
      taken as `startDate` instead of `addWorkdays(startDate, 0)`, watched
      failing the Saturday-start case with an origin two days early; `Proof:`
      comment

## 2. One resolved calendar geometry

- [ ] 2.1 `placeOnCalendar(chart, startDate)` in `gantt-geometry.ts` — takes
      `layOutGantt`'s engine-true geometry and resolves **every** x-bearing mark
      into calendar coordinates: bars, brackets, arrow routes and heads, person
      links, not-before carets, zero-day ticks, row bands, horizon and pad.
      Starts read `startOf`, finishes read `endOf`. `layOutGantt` is untouched
      and stays engine-true — test: `gantt-geometry.test.ts` — a bar at workday 5
      resolves to 7; a bracket over children 0→3 and 2→6 spans 0→8; a predecessor
      finishing 5 and a successor starting 5 resolve to 5 and 7 with the weekend
      between them
- [ ] 2.2 `GanttPanel` reads the resolved object and nothing else — no
      `bar.start`, `flag.offset`, `bracket.finish` or `link.fromFinish` survives
      as a coordinate in the JSX — test: `gantt-panel.test.tsx`, one assertion
      putting the bar's `x`, the caret's `d`, the tick's `x1`, the axis cell and
      the label overlay's `left` together on calendar day 7; negative, **one mark
      at a time, eight runs**: bar, bracket, arrow route, arrow head, person
      link, caret, tick and label overlay each reverted to its raw workday number
      in turn, each watched failing that assertion alone, each with its own
      `Proof:` comment naming the mark and the run
- [ ] 2.3 Non-zero area before relations — the helper every geometry assertion
      goes through refuses a mark of no width or no height before it compares one
      mark with another — test: the helper's own case; negative: it is fed the
      zero-width unestimated bar of the sixteenth check, watched throwing rather
      than passing an overlap comparison against nothing; `Proof:` comment naming
      the sixteenth check

## 3. Bar width is the drawn span

- [ ] 3.1 Width is `endOf(start + drawnSpan) − startOf(start)`, engine `finish`
      demoted to `data-finish` metadata, `data-start`/`data-finish` still the
      engine's workday numbers — test: `gantt-panel.test.tsx` — a 3.5→6 slice at
      `x` 3.5 of width 4.5 reading "3.5"/"6"; a 3→5 slice of width 2 with no
      weekend tail; an unestimated slice at workday 3 of width 2 reading "3"/"3"
- [ ] 3.2 The unestimated bar cannot collapse — negative: the width taken as
      `endOf(finish) − startOf(start)`, which for `finish === start` is zero,
      watched failing the unestimated case on a `width` of 0 while every
      estimated case stayed green; `Proof:` comment naming it as codex 14's fault
- [ ] 3.3 A zero-**day estimate** keeps its zero width and its tick and is not
      confused with an unestimated slice — test: the existing zero-day-estimate
      tick test, re-derived through the scale
- [ ] 3.4 The **words** stay date arithmetic while the marks move: `spanWords`
      and `notBeforeWords` keep reading `addWorkdays(startDate, ⌊start⌋)` and
      `addWorkdays(startDate, lastWorkdayOf(start, finish))`, and neither is
      handed a coordinate — test: `gantt-panel.test.tsx`, a 3→5 slice on the
      Monday 2026-08-10 plan whose hover text reads `2026-08-13 → 2026-08-14`,
      asserted against the row's own Start and End cells rather than against a
      literal; negative, **two faults, two runs**: the sentence fed `endOf(5)`
      as a workday offset, watched naming Monday 2026-08-17, and fed the
      coordinate as calendar days from the origin, watched naming Saturday
      2026-08-15 — a bar that stops at the Friday and says Saturday is what
      makes this its own slice; `Proof:` comment naming both

## 4. The calendar axis

- [ ] 4.1 `calendarAxis(startDate, calendarHorizon)` replaces `workdayAxis` — one
      cell per calendar day from the origin, each carrying its calendar offset,
      its date and the workday number when it is one; weekend cells marked and
      greyed; the heavy gridline on Mondays, `WEEK_DAYS` left to the
      no-start-date axis alone — test: `gantt-panel.test.tsx`, cells 5 and 6
      carrying Saturday 2026-08-15 and Sunday 2026-08-16 marked weekend and cell
      7 carrying Monday 2026-08-17 with the heavy gridline
- [ ] 4.2 Cell count matches the viewBox one to one — `ceil(calendarHorizon)`
      cells, cell `k` at user-space `x = k`, the SVG's CSS width and the axis
      row's width the same count of `DAY_PX` — test: the rewritten user-space
      test, asserting the cell count against the viewBox's schedule band rather
      than against a constant; negative: the axis built from `chart.horizon` in
      workdays while the viewBox uses the calendar horizon, watched failing with
      the axis two cells short of the canvas on a fixture crossing one weekend
- [ ] 4.3 The month caption and the scroll arithmetic follow the calendar axis —
      test: the existing month-on-screen caption test, re-derived; its fixture now
      crosses a weekend, so the cell it scrolls to is a calendar cell

## 5. No start date is a state, not a fallthrough

- [ ] 5.1 With `startDate === null` no scale is built and no mark asks for one:
      coordinates, axis and the every-fifth gridline are exactly today's — test:
      `gantt-panel.test.tsx`, a slice at workday 5 drawn at `x` 5, eight axis
      cells for a horizon of 8, no cell marked weekend, heavy gridlines on 0 and
      5; negative: the scale built unconditionally, so `addWorkdays` is handed a
      null start date, watched throwing rather than quietly drawing an offset
      chart; `Proof:` comment

## 6. The existing tests, inventoried and rewritten

- [ ] 6.1 Rewrite, not append — these `gantt-panel.test.tsx` assertions go
      legitimately red and are re-derived through the scale, none of them
      hard-coding a number twice — test: the file green, and every number in it
      taken from the scale the panel uses:
  - "puts a 3.5→6 slice at x=3.5 with a width of 2.5, and says so twice"
  - "gives the SVG a user space of the horizon by the rows"
  - "draws an unestimated slice as a translucent, dashed bar of the assumed span"
  - "keeps the assumed span out of the engine's own numbers"
  - "says a fraction in prose to two places, and draws it whole"
  - "draws every other mark the geometry placed, in the same workdays" — renamed
    for the calendar
  - "puts the not-before caret clear of the bar that starts on it"
  - "points a filled head at the successor's start"
  - "leaves the successor's left edge alone when the two bars touch"
  - "drops the summary bracket's legs from its line, in a stroke that is seen"
  - "declares a canvas wide enough for a route that leaves the schedule"
  - "leaves the bars on the engine's numbers while the canvas grows"
  - "puts the person's name where the bar is, in pixels the chart's own math
    gives"
  - "draws every fifth gridline heavier, and the rest light" — now the
    no-start-date case only
  - "bands every other row so a wide chart can be read across"
  - "holds a not-before flag at the workday its date is, not its calendar day" —
    its title is now the opposite of the contract; re-derived and renamed
- [ ] 6.2 `apps/fe-01/e2e/gantt.spec.ts`, the alignment check "draws a bar at the
      pixel its workday says, under its own axis cell" — re-derived: the pixel is
      the scale's answer for `data-start` times `DAY_PX`, not `data-start` times
      `DAY_PX`, and the axis cell is looked up by calendar offset. The seeded plan
      is widened first so it reaches past its own first weekend — test: h2puni,
      against the real stack; negative: the alignment left multiplying the raw
      workday, watched failing on the first bar past the weekend, and watched
      **passing** on a horizon inside week one, which is why the fixture is
      widened before the check is believed
- [ ] 6.3 The rest of the browser checks re-derived and green on h2puni, with the
      weekend columns in the screenshot — test: "draws the arrow head, the caret
      and the bracket where they can be seen" (the sixteenth check's own test —
      the bar is still found through the caret's row and its area still asserted
      non-zero first), "paints an arrow that routes off either end of the
      schedule", "holds the labels at the left edge with the chart scrolled fully
      right", "scrolls the plan back to the row whose bar was clicked, and lands
      the caret", and both phone tests

## 7. Gate and proof

- [ ] 7.1 `bunx nx format:check --all`,
      `bunx nx run-many -t test lint typecheck build --parallel=2` and
      `openspec validate --all --json` green — test: the recorded output in
      `verify.md`
- [ ] 7.2 `verify.md` carries the failure-proof table — every negative above by
      name, the fault injected, the test that observed it failing, the result;
      the eight one-at-a-time mark reversions of 2.2 and the widened-fixture note
      of 6.2 included. A check with no observed failure is not done
- [ ] 7.3 Deploy to dev and drive real Chrome at a laptop width and at 390×844,
      then Dany looks — the weekend columns, a Friday-ending bar stopping at the
      Saturday, and a Monday-starting successor with the weekend visible between
      them
