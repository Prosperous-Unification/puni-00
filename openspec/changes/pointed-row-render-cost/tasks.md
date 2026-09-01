## 1. Row render probe, then the store and the PlanRow shell

- [x] 1.1 Write the row probe in `wbs-table.test.tsx`: spy a function every
      `<td>`/`<th>` render calls (`flexibleCellStyle`, call-through `vi.mock` of
      `./table-frame`), point a row from the chart, point another, and assert the
      between-pointings delta covers only the heading row plus the two rows whose
      light changed (≤ 4 row-equivalents). Watched failing against today's table
      on `expected 7 to be less than or equal to 4`.
- [x] 1.2 `pointed-row-store.ts`: a `PointedRows` store holding the table
      pointer, the chart pointer and the chart focus, resolving them with the
      shown-row guard (`tablePointedShown`'s rule) and pointer-over-focus, and
      notifying only when the resolution changes. Unit tests for: each writer, the
      guard, the resolution order, and no notification on an irrelevant
      `setShownRows`. The guard's negative (bare fallthrough without the shown
      check) watched failing, proof recorded on the store.
- [x] 1.3 `PlanRow` shell in `wbs-table.tsx`: owns the `<tr>`, subscribes via
      `useSyncExternalStore` for `data-row-lit`, writes the store from its pointer
      enter/leave (touch guard kept); the `<td>`s stay parent-rendered `children`.
      `WbsTable` drops the three `useState`s, passes the store, pushes shown ids,
      and hands the chart `onPointRow` → `store.pointChart`. Prove: 1.1 goes
      green, and the whole `wbs-table.test.tsx` suite stays green (run whole,
      never filtered).
- [x] 1.4 Negative for the boundary (R5): the store change routed back through
      a `WbsTable` state (or the shell handed cloned children) must fail 1.1;
      watch it fail, restore, watch pass. `Proof:` comment from observed output.

## 2. Gantt layout memo, mark fragments, and the subscription

- [x] 2.1 `GanttChart`: the layout pipeline — `chart`, `placed`, `drawnBars`,
      `drawnLinks`, `drawnPoolWaits`, `drawnFlags`, `axis`, `today` — into
      `useMemo`, and `rowIdAt`/`pointRow` into `useCallback`, so a shell render
      recomputes no geometry. (`WbsTable`-side `shownRows`/`ganttPlan` memos turned
      out unnecessary: the store keeps a pointed change from rendering `WbsTable`
      at all, so `plan`'s identity is already stable in the window the probe
      measures.) Prove: `gantt-panel.test.tsx` whole suite green.
- [x] 2.2 Write the mark probe in `gantt-panel.test.tsx`: spy a per-bar render
      call (`initialsOf`, call-through `vi.mock` of `./initials`), change the
      pointed row through the store without re-rendering the panel, assert zero
      per-bar renders between. Watch it fail against today's chart.
- [x] 2.3 `GanttPanel`: `pointedRow: string | null` becomes `pointed:
PointedRows` read via `useSyncExternalStore`; the SVG children that do not
      read it move into `useMemo` fragments in the same child order; callbacks
      into the fragments get `useCallback` identities (including `WbsTable`'s
      inline `onPointRow`/`onPickDayPx`/`onPickLabelsShown`). Update the test
      call sites mechanically (a `stillPointed(id)` helper). Prove: 2.2 green,
      whole `gantt-panel.test.tsx` and `wbs-table.test.tsx` green.
- [x] 2.4 Negative for the boundary (R5): with a fragment's memo removed (its
      content inlined back), watch 2.2 fail; restore, watch pass. `Proof:` comment
      from observed output.

## 3. The seam, end to end

- [x] 3.1 Browser check in `e2e/hover-cards.spec.ts`: cross from a table row to
      a different row's Gantt line and assert the band, label and table row light
      land (the spec's seam scenario) — on shifted ports, never the shared dev
      server. Run the WHOLE browser gate, not the new tests.
- [x] 3.2 Re-measure in Chromium dev what was measured before the change
      (synthetic pointerover sweep, time-to-lit): record before/after figures in
      verify.md.

## 4. Gate

- [x] 4.1 `bunx nx run-many -t test lint typecheck` green, plus
      `openspec validate --all --json`. Record commands and output in verify.md
      with the R5 failure-proof table (each boundary: fault injected, failure
      observed, test).
