# design — `measures-vocabulary-and-size-templates`

Rationale for keeping every measure reporting-only lives in
[ADR 0044](../../../docs/adr/0044-measures-do-not-drive-the-schedule-yet.md). Interview:
`puni-plan/batch-10/interviews/020.09-answers.md` Q5–Q8. This file is the shape.

## Allocated numbers — allocated at packet time

Same procedure as `estimate-units/design.md`: slice 2 allocates the stamp, slice 5 the
document and schema versions, each rechecked against `origin/main` and the integration queue
and recorded in `verify.md`. Pins on `a3b1526b`: `PLAN_DOCUMENT_VERSION` 6,
`CANONICAL_PLAN_INPUT_SCHEMA_VERSION` 4, `SCHEDULER_CONTRACT_VERSION` 15 (unchanged by this
change: no schedule input moves), newest stamp `20261005110000_add_shared_people`. If
`estimate-units` has taken a version first, this change takes the next.

## D1 — Vocabulary

`MEASURE_METRICS` gains `points_estimate` and `MeasureMetric` widens with it;
`isMeasureMetric` admits four. `step_measure.metric`'s `CHECK` keeps three: the adapter, not the
vocabulary, knows which table holds a metric. `token_estimate` and `token_actual` get the
definition as JSDoc: total tokens processed, input including cached plus output including
reasoning; `hours_actual` says an agent's time is its attempts' span.

## D2 — Storage

Three additive tables, one migration:

- `step_points (work_item_id → work_item ON DELETE CASCADE, step_id → step, points INTEGER
NOT NULL CHECK (points >= 0), recorded_at INTEGER NOT NULL, audit columns; PRIMARY KEY
(work_item_id, step_id); INDEX step_points_by_step)`.
- `size_template (id TEXT PRIMARY KEY, project_id → project, name TEXT NOT NULL, position
INTEGER NOT NULL, audit columns; UNIQUE (project_id, name))`.
- `size_template_step (template_id → size_template ON DELETE CASCADE, step_id → step,
estimate_unit TEXT NOT NULL CHECK (…), optimistic REAL NOT NULL, realistic REAL NOT NULL,
pessimistic REAL NOT NULL, token_estimate REAL, audit columns; PRIMARY KEY (template_id,
step_id))`. The unit is stored with the row because a step holding no estimate may change
  unit after the template was written; the mismatch is then detected at apply time.

`down.sql` drops the three tables with no guard and a comment naming what is lost (points
and templates): an older image never reads them, so rollback is safe and the loss is a
planner's typing, as readiness is. `MeasureRepository` routes `points_estimate` to
`step_points` and the other three to `step_measure`; `MeasureStore`'s port keeps its shape.
`StoredMeasure.value` for points is the integer.

## D3 — Commands

- `setMeasure` with `metric: 'points_estimate'` refuses a non-integer or negative value `422
points_not_integer` at its command index; the other metrics are unchanged. `clearMeasure`
  routes the same way. Journal inverses restore the prior row verbatim.
- `applySizeTemplate { kind, …step address, templateId }` is a new plan command kind (the
  registry count moves by one). Its normalizer runs inside the write transaction: it reads
  the template's row for the node's step, refuses `404 unknown_template`, `409
template_step_unset` (no row for that step) or `409 template_unit_mismatch` (row unit ≠
  step unit), then writes the estimate and, when the row has one, the `token_estimate`
  measure through the existing `setEstimate`/`setMeasure` services. The journal entry holds
  the expanded forward commands and their inverses, so one undo restores both prior rows
  verbatim and the history sentence reads "applied size M to 010.dev". Nothing names the
  template afterwards.

## D4 — Template routes and seeding

`GET /api/projects/:id/size-templates`, `POST …/size-templates`, `PATCH …/size-templates/:templateId`,
`DELETE …/size-templates/:templateId`, bodies carrying `name`, `position` and `steps: {
[stepId]: { estimateUnit, optimistic, realistic, pessimistic, tokenEstimate: number | null } }`.
Not plan commands, like calendar markers: a template edit changes nothing already written and
is not undone with plan edits. Project create seeds `S`, `M`, `L`, `XL` with no step rows;
existing projects hold none until a planner adds one (no backfill: a default recipe nobody
typed is not a fact). Deleting a step cascades its template rows. The MCP tools derive from
the descriptors.

## D5 — Coverage

`measureCoverage(rows, measures, metric)` in `roll-up.ts` returns per work item `{ recorded,
leaves }` over the leaves beneath it; a leaf is `{ 1 or 0, 1 }`. The work-item read adds
`measureCoverage: { [metric]: { recorded, leaves } }` for every row holding at least one
recorded leaf; the hover card prints `tokens 3 of 5 leaves` per metric and omits the count
when `recorded === leaves`. The Days column is unchanged.

## D6 — Documents

Plan document: `measures` carry `points_estimate` beside the other metrics; the document
gains `sizeTemplates` (name, position, per-step rows keyed by step code). Import from earlier
versions reads no points and no templates; from the new version it refuses `invalid_body` a
non-integer point, a template naming an unknown step code, or a template row whose unit is
not the step's. Saved plans: `CanonicalMeasure.metric` widens; templates are not captured (a
saved plan copies values, not recipes). `diffPlans` reports points under `measures` as it
reports tokens.

## D7 — Data task: batch-1 token facts

`puni-plan/wbs-agentic/batch-1-token-actuals.json` holds, per step node, the total tokens
processed read from the session files. The task runs one `postApiProjectsByIdCommands` batch
of `setMeasure token_actual` against wbs-dev through MCP, records the eight prior values and
the eight new ones in `verify.md`, and is reversible by one undo of that batch.
