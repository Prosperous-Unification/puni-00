# Tasks

Seven slices, in order. Each names the test that proves it and the fault its
negative is watched failing under; the full table lands in `verify.md`.

## 1. Slices on the wire

- [x] `work-item.service.ts`: `tree()` keeps `planned.slices` and serialises
      the array from design §3; empty on `scheduleError`. Payload type gains
      `slices`.
- [x] **Test** — be-01 service tests: the two-items-one-person fixture's
      payload holds both slices, engine numbers verbatim (fractional starts
      included), `boundBy: 'person'` and `resourcePredecessorId` naming the
      first slice's id; a cycle yields `slices: []`; every pre-existing field
      untouched.
- [x] **Negative** — the serialisation mapped through `Math.round`; the
      `resourcePredecessorId` field dropped.

## 2. The payload reaches the renderer

- [x] `wbs-api.ts`: `SliceView`, `slices` on the tree result, through
      `httpProjectApi`; `WbsTable` holds them beside the rows it already
      holds.
- [x] **Test** — a tree refetch replaces the slices exactly as it replaces
      rows; the in-memory fakes carry `slices` so every other test compiles
      unedited.
- [x] **Negative** — `slices` left off the refetch path, watched as stale
      bars after an edit.

## 3. The geometry, with no DOM

- [x] `components/wbs/gantt-geometry.ts`: rows+slices+edges → labels, bars,
      brackets, arrows, person links, flags, horizon (design §2).
      `GanttDataError` on a dangling `resourcePredecessorId`.
- [x] **Test** — `gantt-geometry.test.ts`: two-role leaf bars in role order;
      staggered-children bracket 0→6 (span, not sum); hand-off makes a person
      link and no arrow; hidden end skips the mark; dangling id throws;
      horizon = latest finish.
- [x] **Negative** — the throw replaced by skipping the link; the bracket
      summed instead of spanned — plus three more the implementor added
      (unknown person, missing resource predecessor, unlisted role), each
      with its `Proof:` comment. The role-place check moved out of the sort
      comparator because `sort` never calls it for a one-slice leaf — caught
      red by its own negative on first run.

## 4. The panel draws it

- [x] `components/wbs/gantt-panel.tsx`: the SVG from design §1 (geometry
      only, `preserveAspectRatio="none"`, workday user space), sticky-left
      HTML labels, HTML axis row, `<title>` floor words, critical tint,
      unestimated bars distinct, not-before flags, cycle → the unscheduled
      state, no bars.
- [x] **Test** — `gantt-panel.test.tsx` (jsdom): a 3.5→6 slice renders
      `x="3.5" width="2.5" data-start="3.5" data-finish="6"` and viewBox
      width = horizon — strict equality against the fixture's engine numbers;
      critical tint present and absent; a cycle draws no rect.
- [x] **Negative** — `x` computed as `start * DAY_PX`, watched failing the
      strict-equality test.

## 5. The toggle, the mirror, and click-to-row

- [x] Toolbar control mounts the panel under either renderer; panel reads
      `shownRows`; bar/label click → `cellIn(grid, {rowId, 'name'})`, focus,
      guarded `scrollIntoView`.
- [x] **Test** — `gantt-panel.test.tsx`: collapsed branch's children absent;
      search-narrowed panel draws exactly the shown three; click focuses the
      name cell on the table face and on the cards face.
- [x] **Negative** — the panel fed the full row list instead of `shownRows`;
      the click handler's cell lookup pointed at a column the cards don't
      render.

## 6. The axis agrees with the columns

- [x] Calendar labels from the workday module (direct import, not the
      barrel), ceil−1 finish; offsets when no start date.
- [x] **Test** — Monday-2026-08-10 fixture: the axis dates under a 3→5 bar
      equal the row's Start/End cells, compared string-to-string; no-date
      project prints offsets.
- [x] **Negative** — the ceil−1 nudge removed, watched as the axis and the
      End cell disagreeing by a day.

## 7. What only a browser can see

- [x] `e2e/gantt.spec.ts`: after CSS scaling, a bar's on-screen rect aligns
      with its axis dates' label positions (±1px); labels hold the left edge
      with the chart scrolled fully right at 1400 and at 390×844; the page
      never scrolls sideways; a click on a bar scrolls the plan and lands
      focus in the row's name box — the R5 #14/#15 fault class, so the
      negative for the click is run here, not in jsdom. Six tests, and with
      them the three marks a live Chrome found invisible: the arrow's head,
      the not-before caret's clearance from its bar, and the bracket's
      computed stroke width.
- [x] **Negative** — the sticky left column's `position: sticky` dropped
      (both label tests, `expected 1048 to be <= 1`). **The click's
      `scrollIntoView` guard inverted was watched and does not fail**:
      Chromium scrolls a focused element into view of its own accord, so the
      guard is load-bearing only in jsdom. The negative that holds the
      behaviour is the scroll suppressed — `cell.focus({ preventScroll:
true })` — and it fails both click tests while all 31 jsdom tests pass
      through it. Five more in `verify.md`.

## 8. The three marks the browser found (added 2026-08-09)

- [x] Dependency arrows: a filled head at the successor's entry, 1.5px
      non-scaling, and a jog when `toStart === fromFinish` so the line never
      runs under the successor's own left edge.
- [x] The not-before flag: a caret in the clear band **above** the bar rather
      than on it, with a `<title>` naming the date.
- [x] The summary bracket: legs that drop from the line rather than rise to
      it, at 2px non-scaling foreground.
- [x] **Test** — `the marks that had to be seen`, five tests in
      `gantt-panel.test.tsx` asserting the relations between the paths'
      points, plus three browser assertions in `e2e/gantt.spec.ts` about
      rectangles and a computed stroke width.
- [x] **Negative** — seven, one per claim, in `verify.md`.
