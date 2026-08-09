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

## 1. Reconcile with what actually merged

- [x] 1.1 Re-read the **merged** `HoverPreview` contract — `name-title-body`
      renamed `notes-preview.tsx` to `hover-preview.tsx` and added a name
      heading while this change was written, from another checkout — and
      reconcile every later slice against it before writing a line: the props
      it actually takes, what it renders the heading from, whether it
      positions itself or is positioned, and which of its tests own that. Write
      the differences from this change's assumptions into `verify.md` as they
      are found. Nothing below is believed until this is done — test: the
      existing `hover-preview` tests run green on the merge base, named in
      `verify.md` with their file and count
- [x] 1.2 Generalize `HoverPreview` into a surface that takes an anchor and a
      body: the Name cell keeps rendering its notes markdown through it, the
      bar will render facts through it, and nothing about the Name cell's
      behaviour changes — test: the Name cell's existing preview tests, still
      green and unedited; plus one asserting the surface renders a non-notes
      body

## 2. The facts a bar can state

- [x] 2.1 `barFacts(bar, …)` in `gantt-geometry.ts` beside `barWords`: dates
      from the bar's own start/finish by **workday arithmetic** —
      `addWorkdays(origin, ⌊start⌋)` and
      `addWorkdays(origin, lastWorkdayOf(start, finish))`, the End cell's own
      rule, printed with `compact-columns`' `shortIsoDate` — duration and the
      assumed-span sentence as `barWords` already derives them, person from the
      chart payload — test: `gantt-geometry.test.ts` on a two-role leaf, each
      bar carrying its own dates and never the work item's span; negative,
      **three faults, three runs**: the derivation swapped to the row's `dates`,
      watched turning the QA bar's dates into the Dev bar's; G1's `endOf(5)`
      passed to `addWorkdays` as a workday offset, watched naming Monday 17 Aug
      for a slice that finished on the Friday; the same coordinate added to the
      origin as calendar days, watched naming Saturday 15 Aug — the two ways a
      coordinate can be mistaken for a date, each with its own `Proof:` comment
- [x] 2.1a The formatter is `shortIsoDate` and nothing else — test: the same
      file, a date in another year rendering `1 Jun 2027` as `shortIsoDate`
      alone does; negative: `new Date(iso).toLocaleDateString()` in its place,
      run under `TZ=America/Los_Angeles`, watched naming 12 Aug for 2026-08-13 —
      the zone has to be **behind** UTC for the parse to move the day, measured
      2026-08-09: Los Angeles gives 12/08, Auckland and UTC both give 13/08, so
      a negative run in a zone ahead of UTC is one that cannot fail; `Proof:`
      comment naming the zone. If `compact-columns` has not landed when this
      slice is reached, the task is blocked on it rather than growing a second
      formatter (AGENTS.md: a missing required tool blocks the task)
- [x] 2.2 Enrichment fed in from `wbs-table.tsx`, built **outside** the
      `columns` memo beside `ganttPlan` (LLM_README landmine 1): team name for
      each row, the estimate trio per work item and role, and dependency labels
      resolved from `flat` — the whole tree — not `shownRows` — test:
      `wbs-table.test.tsx` with a predecessor hidden by a collapsed branch and
      again by a search, its number and name still on the dependent bar;
      negative: the resolution pointed at `shownRows`, watched failing on both
      hidden-predecessor cases, and a second negative asserting no cell
      remounts (the focus survives a hover) with the enrichment moved inside
      the `columns` memo
- [x] 2.3 Named states for every absence: no role, unassigned, no estimate for
      this role, no team, and a team id the directory read does not hold —
      test: `gantt-panel.test.tsx` asserting the words for each, including a
      zero-role project; negative: the unresolved-team branch deleted, watched
      failing on the blank label — write the negative before believing the
      branch (the `unfoldedRoles` lesson)

## 3. The surface on a bar

- [x] 3.1 The bar renders `barFacts` through the generalized surface, in the
      spec's order, notes absent, and in words the plan already owns: the
      heading is `rowWords(number, name)` — `3.2 - API`, hyphen, `(unnamed)`
      for an empty name — and the float line is `barWords`' own,
      `Float 2 days` or `On the critical path — no float` — test:
      `gantt-panel.test.tsx` reading the whole surface for a bar with a team, a
      trio, float and a predecessor, and one for a critical bar; the heading
      asserted **against `rowWords`' output**, not against a literal, so the
      surface and the row label cannot drift apart
- [x] 3.2 `gantt-panel.test.tsx`'s eight `querySelector('title')` assertions
      are **rewritten** against the surface and the `aria-label`, not appended
      to — the not-before caret's `<title>` is untouched and its test stays as
      it is — test: the rewritten assertions, each named in `verify.md` beside
      the assertion it replaced

## 4. Keyboard, label, and the tooltip's removal

- [x] 4.1 Bars take `tabIndex` and an `aria-label` carrying the same facts;
      focus shows the surface and blur dismisses it; Enter and Space pick the
      row and call `preventDefault` — test: `gantt-panel.test.tsx` for the
      label and the focus/blur pair; negative: the `aria-label` removed,
      watched failing, so the label cannot be silently lost with the `<title>`
- [x] 4.2 The `<title>` children are removed from the bars **after** 4.1 is
      green — test: `gantt-panel.test.tsx` asserting no bar holds a `<title>`
      and every bar has an accessible name; negative: a `<title>` restored on
      one bar, watched failing, so "two tooltips" is a check and not a claim.
      The requirement that mandates the `<title>` — `gantt-view`'s "A bar
      explains itself and finds its row", as `gantt-calendar-axis` leaves it —
      is amended by this change's own MODIFIED block, so the archived spec does
      not keep asking for the element this slice deletes. Archive order is
      `gantt-view` → `gantt-calendar-axis` → `gantt-bar-hover`; out of that
      order the MODIFIED block's header does not exist yet and the apply fails
- [x] 4.3 **Browser**, `e2e/gantt.spec.ts`: Space on a focused bar picks the
      row and leaves the panel's `scrollLeft`/`scrollTop` where they were —
      jsdom performs no default action and cannot see this fault at all (the
      fourteenth check) — test: that spec; negative: `preventDefault` removed
      from the Space branch, watched failing in Chrome on a panel scrolled
      partway

## 5. Lifecycle

- [x] 5.1 The surface is rendered in a fixed/portal layer positioned from the
      anchor's `getBoundingClientRect()`, flipping above and clamping
      horizontally; open delay cancellable; one open at a time; closed when the
      anchor unmounts, the chart refetches, or the panel hides — test:
      `gantt-panel.test.tsx` for the delay's cancellation, the one-at-a-time
      rule and the unmount close (fake timers, no geometry claims — jsdom
      measures nothing); negative: the cleanup on unmount deleted, watched
      failing with the chart replaced under an open surface
- [x] 5.2 Closure is keyed on the **chart read**, not on the anchor's lifetime:
      the panel carries a generation for the read it drew, and a surface opened
      over one generation is closed when the panel draws another — test:
      `gantt-panel.test.tsx` rerendering with the **same slice ids** and
      different numbers, so React keeps every `<rect>` and nothing unmounts,
      asserting the DOM node the surface was anchored to is the same element
      before and after (an identity check, or the test proves nothing) and the
      surface is gone; negative: the generation dependency removed so only the
      unmount cleanup remains, watched failing that case while 5.1's
      anchor-unmount case stays green — which is the whole reason both exist;
      `Proof:` comment naming the reused node
- [x] 5.3 Panel scroll dismisses — test: `gantt-panel.test.tsx` firing scroll
      on the panel and asserting the surface is gone; negative: the scroll
      listener removed, watched failing
- [x] 5.4 **Browser**, `e2e/gantt.spec.ts`, the three facts jsdom cannot hold:
      hover a bar with the panel scrolled partway and read the surface's
      content against that bar's own dates; hover a bar near the viewport's
      bottom and assert the surface's rect is above the bar and fully inside
      the viewport, with the bar's rect asserted non-zero first (the sixteenth
      check); scroll the panel with a surface open and assert it is gone — test:
      that spec; negatives: the flip forced off and the scroll-dismiss removed,
      each watched failing in Chrome one at a time
- [x] 5.5 **Browser**, `e2e/gantt.spec.ts`, the horizontal clamp, measured on
      the surface itself: hover the **right-most** bar with the chart scrolled
      so it sits within a surface's width of the viewport's right edge; assert
      the surface's rect has non-zero width and height, `left >= 0` and
      `right <= innerWidth`; and first assert the unclamped placement would
      overflow — the bar's own `left` plus the surface's width is greater than
      `innerWidth` — so the check is about a clamp that had something to do.
      **Not** `document.scrollWidth`: the layer is `position: fixed`, so a
      surface hanging off the right edge grows no scroll width at all and that
      assertion passes with the clamp deleted (measured in Chrome before the
      check is believed) — test: that spec; negative: the horizontal clamp
      removed, watched failing on `right <= innerWidth` in Chrome; `Proof:`
      comment naming both the fault and the scrollWidth check it replaced
- [x] 5.6 **Browser**, `e2e/gantt.spec.ts` at 390×844 with
      `test.use({ hasTouch: true, isMobile: true })`, the real tap path: a bar
      `tap()`ped — the touch sequence Chromium synthesizes its own mouse events
      from, which is exactly the seam a `pointerType` guard has to survive —
      takes the plan to that row's card, and after the open delay has elapsed
      **no** surface is on the page — test: that spec; negative: the
      pointer-type guard removed so `mouseover` opens on the synthesized event,
      watched failing on a surface being present in Chrome; `Proof:` comment.
      A jsdom test cannot stand in: it dispatches whatever events it is told to
      and synthesizes none

## 6. Gate

- [x] 6.1 `bunx nx format:check --all`,
      `bunx nx run-many -t test lint typecheck build --parallel=2`,
      `bun run e2e`, and `openspec validate --all --json` green; `verify.md`
      records every command, its result, and the failure-proof table naming the
      fault injected for each negative above and the run that observed it
- [ ] 6.2 Deploy to dev and Dany looks — the hover on a real chart, with a
      keyboard, and at 390×844
