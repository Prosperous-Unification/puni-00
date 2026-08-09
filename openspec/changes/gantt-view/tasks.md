# Tasks

Seven slices, in order. Each names the test that proves it and the fault its
negative is watched failing under; the full table lands in `verify.md`.

## 1. Slices on the wire

- [ ] `work-item.service.ts`: `tree()` keeps `planned.slices` and serialises
      the array from design §3; empty on `scheduleError`. Payload type gains
      `slices`.
- [ ] **Test** — be-01 service tests: the two-items-one-person fixture's
      payload holds both slices, engine numbers verbatim (fractional starts
      included), `boundBy: 'person'` and `resourcePredecessorId` naming the
      first slice's id; a cycle yields `slices: []`; every pre-existing field
      untouched.
- [ ] **Negative** — the serialisation mapped through `Math.round`; the
      `resourcePredecessorId` field dropped.

## 2. The payload reaches the renderer

- [ ] `wbs-api.ts`: `SliceView`, `slices` on the tree result, through
      `httpProjectApi`; `WbsTable` holds them beside the rows it already
      holds.
- [ ] **Test** — a tree refetch replaces the slices exactly as it replaces
      rows; the in-memory fakes carry `slices` so every other test compiles
      unedited.
- [ ] **Negative** — `slices` left off the refetch path, watched as stale
      bars after an edit.

## 3. The geometry, with no DOM

- [ ] `components/wbs/gantt-geometry.ts`: rows+slices+edges → labels, bars,
      brackets, arrows, person links, flags, horizon (design §2).
      `GanttDataError` on a dangling `resourcePredecessorId`.
- [ ] **Test** — `gantt-geometry.test.ts`: two-role leaf bars in role order;
      staggered-children bracket 0→6 (span, not sum); hand-off makes a person
      link and no arrow; hidden end skips the mark; dangling id throws;
      horizon = latest finish.
- [ ] **Negative** — the throw replaced by skipping the link; the bracket
      summed instead of spanned.

## 4. The panel draws it

- [ ] `components/wbs/gantt-panel.tsx`: the SVG from design §1 (geometry
      only, `preserveAspectRatio="none"`, workday user space), sticky-left
      HTML labels, HTML axis row, `<title>` floor words, critical tint,
      unestimated bars distinct, not-before flags, cycle → the unscheduled
      state, no bars.
- [ ] **Test** — `gantt-panel.test.tsx` (jsdom): a 3.5→6 slice renders
      `x="3.5" width="2.5" data-start="3.5" data-finish="6"` and viewBox
      width = horizon — strict equality against the fixture's engine numbers;
      critical tint present and absent; a cycle draws no rect.
- [ ] **Negative** — `x` computed as `start * DAY_PX`, watched failing the
      strict-equality test.

## 5. The toggle, the mirror, and click-to-row

- [ ] Toolbar control mounts the panel under either renderer; panel reads
      `shownRows`; bar/label click → `cellIn(grid, {rowId, 'name'})`, focus,
      guarded `scrollIntoView`.
- [ ] **Test** — `gantt-panel.test.tsx`: collapsed branch's children absent;
      search-narrowed panel draws exactly the shown three; click focuses the
      name cell on the table face and on the cards face.
- [ ] **Negative** — the panel fed the full row list instead of `shownRows`;
      the click handler's cell lookup pointed at a column the cards don't
      render.

## 6. The axis agrees with the columns

- [ ] Calendar labels from the workday module (direct import, not the
      barrel), ceil−1 finish; offsets when no start date.
- [ ] **Test** — Monday-2026-08-10 fixture: the axis dates under a 3→5 bar
      equal the row's Start/End cells, compared string-to-string; no-date
      project prints offsets.
- [ ] **Negative** — the ceil−1 nudge removed, watched as the axis and the
      End cell disagreeing by a day.

## 7. What only a browser can see

- [ ] `e2e/gantt.spec.ts`: after CSS scaling, a bar's on-screen rect aligns
      with its axis dates' label positions (±1px); labels hold the left edge
      with the chart scrolled fully right at 1400 and at 390×844; the page
      never scrolls sideways; a click on a bar scrolls the plan and lands
      focus in the row's name box — the R5 #14/#15 fault class, so the
      negative for the click is run here, not in jsdom.
- [ ] **Negative** — the sticky left column's `position: sticky` dropped;
      the click's `scrollIntoView` guard inverted.
