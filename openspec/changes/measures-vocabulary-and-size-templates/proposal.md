## Why

Dany asked (2026-09-20) for estimation in alternative measures — tokens, story points, sizes.
Today `step_measure` knows three metrics behind a `CHECK` that cannot widen, the batch-1
token facts hold one tool's "tokens used" (2.8 % of the tokens processed), and sizes live in
planners' notes, mapped to figures by hand.

## What Changes

- **Points estimate** joins the metric set: a non-negative integer per step node, written and
  cleared through `setMeasure`/`clearMeasure`, summed on roll-up, read by no engine. Stored
  in its own additive `step_points` table because `step_measure.metric`'s `CHECK` cannot widen.
- A token figure means **total tokens processed** — input including cached, plus output
  including reasoning. The batch-1 `token_actual` rows are re-recorded from the session
  files as a data task.
- A project holds **size templates** (`S`, `M`, `L`, `XL` seeded on project create, editable)
  giving, per step, a trio in the step's unit and an optional token estimate.
  `applySizeTemplate` writes them to one node as ordinary estimate and measure writes in one
  journal entry; the size itself is not stored, rolled up or a metric. A row whose unit
  disagrees with the step's is refused.
- A parent's hover card lists each metric its leaves recorded with a **measure coverage**
  count (`tokens 3 of 5 leaves`); the table column shows days only.
- No measure drives the schedule.

## Non-Goals

A money metric or rate card; velocity or any conversion between measures and time; points as
an estimate unit; storing the chosen size or re-applying a template; widening `step_measure`'s
`CHECK`; a second token metric.

## Constraints

Three additive tables with `down.sql` dropping them, the loss named; an older image never
reads them, so no swap guard. The `step_measure` table is untouched. Versions and the migration
stamp are allocated at packet time (`design.md`). Golden corpora, request hashes and identity
oracles stay byte-identical. Requires `estimate-units` (a template row carries the unit).

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `wbs-domain`: points estimate, token definition, size templates, measure coverage.
- `plan-command-registry`: `setMeasure` takes `points_estimate`; new `applySizeTemplate`.
- `plan-import`: the plan document carries points and size templates.
- `saved-plans`: the canonical input carries points measures.
- `deployment-pipeline`: additive migration and its `down.sql`.

## Domain Terms

Metric, Token estimate, Token fact, Hours fact (rewritten); Points estimate, Size template,
Measure coverage — applied to `CONTEXT.md` by task 0.2 from the glossary delta.

## Decisions Recorded

[ADR 0044](../../../docs/adr/0044-measures-do-not-drive-the-schedule-yet.md); the
`step_points` shape is in `design.md` (ADR 0032 holds the CHECK-widening posture).

## Impact

`@wbs/domain`, `@wbs/core`, contracts and MCP, be-01 (migration, template routes, seeding),
fe-01 (step cell card, hover card, settings section), one wbs-dev data task.
