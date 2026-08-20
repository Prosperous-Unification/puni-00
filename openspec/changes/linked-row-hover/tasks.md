<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The pointed row exists and the table lights

- [x] 1.1 `pointedRow: string | null` in `wbs-table.tsx`, beside `depHover` and
      `depFocus` and documented as their sibling. Writers bail out when the value
      is already there, so a pointer resting on one row costs one render rather
      than one per `pointermove`. Not read inside `columns` at all — the
      attribute is written on the `<tr>` and the panel is a separate component —
      so this slice adds no `live` reader.
- [x] 1.2 The `<tr>`'s `data-row-lit`, written from `pointedRow`, beside the
      shipped `data-dep-lit` at `wbs-table.tsx:7540`. A **second attribute** and
      not a reuse: the tint is shared, the name is not, and a gantt hover writing
      `data-dep-lit` would be a false statement in a DOM whose `data-dep-lit`
      tests read it as "some Depends on cell waits for this row".
- [x] 1.3 `onPointerEnter` / `onPointerLeave` on the `<tr>`, **not** in a column
      definition — `flexRender` renders each `cell` as a component _type_, so a
      definition that changed on hover would remount every cell in the table
      (the `data-drop` handlers' own reason, `wbs-table.tsx:7549`). Guarded on
      `pointerType === 'mouse'`, for the reason the bar's `onPointerOver` is:
      Chromium synthesizes a mouse sequence from a tap, and a tap that lit a row
      on the way to opening it is a light nothing clears.
      Tests in `wbs-table.test.tsx`: entering a row writes the attribute;
      leaving clears it; entering a second row leaves exactly one row lit; a
      synthesized non-mouse pointer writes nothing.
- [x] 1.4 **The memo negative.** `pointedRow` added to the `columns` dependency
      list, watched taking the focus out of an open editor — the existing proof
      of this shape is `wbs-table.test.tsx:7403`, written for `depHover`.
      `Proof:` beside the memo naming the injected dep and the test that saw it.

## 2. The panel reports and lights

- [x] 2.1 Two new props on `GanttProps` — `onPointRow`, taking a row id or null,
      and `pointedRow` — threaded `GanttPanel` → `GanttChart` beside `onPickRow`.
      The cycle panel takes neither: it draws no rows, so it has nothing to point.
- [x] 2.2 The bar reports through its **existing** `onPointerOver` /
      `onPointerOut` / `onFocus` / `onBlur`, resolving its row with the
      `rowIdAt(bar.rowIndex)` already there. No `workItemId` is added to
      `GanttBar`: the helper is the join and it is one line
      (`gantt-panel.tsx:1347`). The 220ms `HOVER_OPEN_MS` timer is **not** in the
      path — the light is immediate and the surface still waits.
      Tests in `gantt-panel.test.tsx`: a pointer over a bar reports that bar's
      work item; out reports null; focus reports it with no timer advanced.
- [x] 2.3 `data-gantt-label-lit` on the row label button and the band `<rect>`
      for the pointed row — one extra rect, drawn after the zebra bands and the
      weekend columns and before the bars, so the marks stay on top of it. Its
      `data-gantt-row-lit={rowIndex}` is what the browser gate selects on.
      Tests: a pointed row label carries the attribute and its siblings do not; a
      band rect appears at that `rowIndex`; nothing is drawn when nothing is
      pointed.
- [x] 2.4 A row label reports on its own hover and focus, so the reverse
      direction lights the chart from the chart's own column too, and a work item
      with **no bar** is pointable. Test: a pointer on the row label of a work
      item no role has been estimated for lights its band and its `<tr>`.

## 3. The paint

- [x] 3.1 `styles.css`: `[data-grid] tbody tr[data-row-lit]` re-points
      `--cell-bg` to `--grid-dep-lit`, beside the `data-dep-lit` rule and for its
      reason — a pinned cell paints its own opaque background and follows the row
      only through that join. The row label's and the band's tint from the same
      token, so there is one colour and one place to change it.
- [x] 3.2 **`data-row-lit` joins the banded-hover rule's `:not()` chain**
      (`styles.css:671`). That rule is `(0, 5, 2)` against the lit rules'
      `(0, 2, 2)`: it outranks them and holds them up **by predicate**, which its
      own comment says of anything added there. Without this a pointed **even**
      row is overpainted by `--grid-band-hover` — a highlight that behaves
      differently on alternate stripes, which is the defect
      `dep-hover-highlights` existed to remove.

## 4. Proving the paint, in a browser

- [x] 4.1 `apps/fe-01/e2e/gantt.spec.ts`: a pointer on a bar, and the row label,
      the band rect and the `<tr>`'s cells each read for the row light's computed
      colour. **Negative:** 3.1's rules withheld with the attributes still
      written — jsdom green throughout, the browser watched failing on the unmoved
      colour. This is the fault class `dep-hover-highlights` shipped and the
      `pixels` job caught (`AGENTS.md` R5); jsdom cannot see a colour.
- [x] 4.2 The reverse direction in the same file: a pointer on a table row, the
      band and the row label read for the tint.
- [x] 4.3 **The specificity negative.** A pointed **even** row asserted to carry
      the row light and not `--grid-band-hover`, watched failing with
      `data-row-lit` removed from 3.2's `:not()` chain. Both an odd and an even
      row asserted to the **same** colour, so the test cannot pass on a build
      where only one stripe works.
- [x] 4.4 A cell edited to a half-typed value, the pointer then crossed over
      several bars, and the cell asserted to still hold the focus and the typed
      value. In a browser rather than jsdom: 1.4's jsdom negative sees the memo
      dep, and this sees what a real pointer sequence does to a real focus.
- [x] 4.5 Nothing scrolls: both faces' `scrollTop` read before and after pointing
      a row that is out of view in the table, and asserted unmoved.

## 5. Close it out

- [x] 5.1 `verify.md`: the failure-proof table for 1.4, 3.2, 4.1 and 4.3, each
      with the injected fault, the test that observed it and the output. Plus the
      gate: `bunx nx format:check --all` and
      `bunx nx run-many -t test lint typecheck build --parallel=2`.
- [x] 5.2 `LLM_README.md`'s landmine list: the banded-hover `:not()` chain, if
      4.3 shows it is a trap a reader would fall into twice. Not added
      speculatively — added if the negative was needed.
