## Context

The three pointed-row states (`tablePointedRow`, `chartPointedRow`,
`chartFocusedRow`, wbs-table.tsx) live at the top of `WbsTable`, and nothing
below them is memoized: a pointed-row change re-renders every row's every cell
and, through `pointedRow`, every Gantt mark. `GanttChart` also recomputes its
whole layout per render — `layOutGantt`, `placeOnWorkdays`/`placeOnCalendar`
and the axis are plain calls, not memos. Measured in Chromium dev (28-row
plan): 75–120ms JS per pointed-row change with the chart open, 40–60ms with it
closed; the table→chart seam pays a leave and an enter back to back.

Landmine #1 already forced every per-pointer value out of the `columns` memo:
cells close over `steps`/`unfoldedSteps` only, and everything per-render a row
reads is applied at the `<tr>`/`<td>` level (wbs-table.tsx around 11850–12015).
That is what makes row-level memoization possible at all.

## Goals / Non-Goals

**Goals:**

- A pointed-row change re-renders only the rows whose light changed and the
  chart's light layer (pointed band + label rail).
- Identical DOM: every attribute handle, tint and SVG paint order unchanged.

**Non-Goals:**

- Virtualization; imperative DOM writes; changes to what lights or when.
- Perf work on typing, drag, or refetch renders.

## Decisions

**D1 — the pointed state leaves React state for a per-table external store.**
`tablePointedRow`, `chartPointedRow` and `chartFocusedRow` become fields of a
`PointedRows` store (`pointed-row-store.ts`), created once per `WbsTable`
mount, written by the same gestures that wrote the `useState`s, and read
through `useSyncExternalStore`. The resolution — the shown-row guard on the
table's remembered hover, then pointer over focus — moves into the store with
its documentation and proofs; `WbsTable` pushes the shown row ids after each
commit so the guard stays live. A pointed-row change then re-renders **no part
of `WbsTable`** — only the subscribers below.

**D2 — the `<tr>` becomes an unmemoized `PlanRow` shell that subscribes.**
`PlanRow` owns the `<tr>`, its pointer enter/leave (which now write the store)
and `data-row-lit` from its own subscription (`pointedAt() === rowId`); the
`<td>`s stay rendered by `WbsTable` and arrive as `children`. When only the
subscription fires, React re-renders the shell and bails on the unchanged
child elements — so the two rows whose light moved re-render one `<tr>` each,
and no cell renders at all. This deliberately does NOT memoize rows: the cells
read ~80 live values through the `live.current` ref at render time
(wbs-table.tsx `live`), an architecture that requires every parent render to
reach every cell. A `memo(PlanRow)` would have to enumerate all of it per row
and would go silently stale on the first missed channel; the shell-and-children
split keeps that contract untouched.

**D3 — `GanttChart` subscribes, memoizes its layout, and splits marks from
light.** The `pointedRow: string | null` prop becomes `pointed: PointedRows`;
the chart reads it via `useSyncExternalStore`, so a pointed change re-renders
the chart shell only. `chart`, `placed` and `axis` move into `useMemo` keyed on
`plan`/`startDate`/`dayPx`, `ganttPlan` and `shownRows` become `useMemo` in
`WbsTable` so those keys hold, and the SVG children that do not read the
pointed row (zebra bands, today, gridlines, row lines, links, carets, bars,
figures) move into `useMemo` fragments in the same child order — paint order
untouched. The pointed band and the label rail stay live in the shell.
Callbacks flowing into the fragments (`onPointRow`, `onPickRow`, surface
open/close) get stable identities via `useCallback`, reaching back to
`WbsTable`'s inline arrows.

**D4 — the boundaries are proved by render-count probes on the production call
path.** A fragment whose deps churn, or a store change that still re-renders
`WbsTable`, is a check that cannot fail (R5): everything stays green and every
render still happens. Each boundary ships a jsdom probe spying a function
called once per render inside it (`flexibleCellStyle` per `<td>`/`<th>`, a
per-bar call for marks), asserting the delta from a pointed change, watched
failing with the boundary removed.

## Assumptions (documented per Dany's instruction, verified during build)

- Cells reach all live state through the `live.current` ref plus parent
  renders; nothing but the `<tr>` attributes and the Gantt band/labels reads
  the pointed row (verified by enumeration: wbs-table.tsx held exactly five
  reader/writer sites). If a future cell reads it, that cell must subscribe.
- React bails on unchanged `children` elements when only `PlanRow`'s
  subscription fires; the D4 row probe measures exactly this and cannot pass
  vacuously — with the store change re-rendering `WbsTable`, it was watched
  failing on 7 row-equivalents against a bound of 4.
- StrictMode double-renders make probe assertions relative (deltas), never
  absolute counts; the jsdom suite renders without StrictMode.
- The store notifies only when the resolved pointed row changes, so per-render
  `setShownRows` pushes are silent while the shown set is irrelevant to the
  resolution.

## Risks / Trade-offs

- **A reader of the pointed row that stays outside the subscription goes
  dark.** Bounded by the five-site enumeration above and the whole jsdom +
  browser suites, run whole (steps-schema-rename's lesson).
- **Fragment dep churn silently voids a memo.** Mitigated by D4's probes.
- The store is a second state mechanism beside `useState` — accepted: it is
  the only way a per-pointer signal can move without re-rendering a component
  whose cells must re-render from their parent.

## Migration Plan

None — `apps/fe-01` render path only.

## Open Questions

None blocking.
