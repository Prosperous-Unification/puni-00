# design — `estimate-units`

Rationale for the unit on the step, the per-unit rounding and the placement constant lives in
[ADR 0041](../../../docs/adr/0041-an-estimate-unit-belongs-to-the-step-and-rounding-follows-it.md).
This file is the shape. Interview: `puni-plan/batch-10/interviews/020.09-answers.md` Q1–Q3a.

## Allocated numbers — allocated at packet time

Nothing here allocates a number. The packet that opens slice 3 (storage) and slice 6
(documents) rechecks every row against `origin/main` and every branch in
`puni-plan/batch-10/integration-queue.txt`, writes the values into this table and records the
check in `verify.md`.

| What                                  | Pinned on `origin/main` `a3b1526b` (2026-10-11)                                  | Pinning test                                                                                | This change                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `PLAN_DOCUMENT_VERSION`               | 6 (`plan-document-shapes.ts`)                                                    | `plan-document.resource.test.ts` "JSON export is a versioned plan document…" (`version: 6`) | next free, allocated at packet time                                                              |
| `CANONICAL_PLAN_INPUT_SCHEMA_VERSION` | 4 (`canonical-plan-input.ts`)                                                    | `canonical-plan-input.test.ts`; `saved-plans/module.test.ts` (`schemaVersion` 4)            | next free, allocated at packet time                                                              |
| `SCHEDULER_CONTRACT_VERSION`          | 15 (`contract-version.ts`; 14 in the interview was stale: `432eff1ab` bumped it) | `contract-version.test.ts` (`'15+'`), `wire-contract-version.test.ts`                       | unchanged unless the corpus lint says a new minute-step golden case moves it; decided at slice 5 |
| Migration stamp                       | newest `20261005110000_add_shared_people`                                        | every migration-enumerating `*.db.test.ts` in `store-sqlite`                                | `<stamp>_add_step_estimate_unit`, allocated at packet time, sorting after the queue              |
| ADR                                   | 0040 highest; 0041 also on `batch-10/070-12-restore-applied-migration-set`       | `adr-index.test.ts` (contiguous)                                                            | 0041; whichever of the two lands second renumbers                                                |

## D1 — Vocabulary in `@wbs/domain`

`ESTIMATE_UNITS = ['workdays', 'minutes']` and `isEstimateUnit` join `stored-vocabularies.ts`
(the migration's `CHECK` enumerates the same list). `estimate.ts` gains `WORKDAY_MINUTES = 480`
(a constant, not a setting) and `MAX_ESTIMATE_MINUTES = MAX_ESTIMATE_DAYS * WORKDAY_MINUTES`
(`21_474_836_160`; the solver axis is `minutes / 480 / 30` quantum units, under `2^31`).
`ThreePointEstimate` keeps its shape; `minuteTrioProblem(trio)` is the boundary guard that
names a non-integer point or a point above the maximum. The three `real` columns hold the
integers exactly; nothing is stored in a new column.

## D2 — Charge by unit

`combinedDays` and `beforeRoundingDays` are unit-free arithmetic and are renamed
`combinedFigure` and `beforeRoundingFigure` (R2: a name must not say days about minutes).
`chargedDays(estimate, rule, allowance)` keeps its name and its behaviour for workday-unit
steps. `chargedMinutes(estimate, rule, allowance)` is `Math.ceil` of the figure after the
allowance, with `rule.rounding` never read (the test passes `floor` and `exact` and expects
the same minute). `chargedWorkdaysOf(unit, estimate, rule, allowance)` is what the schedule
input and the roll-up read: `chargedDays` for workdays, `chargedMinutes / WORKDAY_MINUTES`
for minutes — a fraction, never snapped to the quantum here (R6 A.3).

## D3 — Read shape and roll-up

`rollUpFinals` folds `chargedWorkdaysOf` per step, so `finalDays` and `finalTotal` stay
workday figures (fractional for minute-unit steps) and every reader of them is unchanged.
The work-item read adds `charged: { [stepId]: { unit: 'workdays'; days } | { unit:
'minutes'; minutes } }` so a face never reconstructs minutes from a fraction
(`40 / 480 × 480` is not reliably `40`). The step read adds `estimateUnit`.

## D4 — Storage and rollback

`ALTER TABLE step ADD COLUMN estimate_unit TEXT NOT NULL DEFAULT 'workdays' CHECK
(estimate_unit IN ('workdays', 'minutes'))`. An outgoing colour's insert that omits the column
gets `workdays`, which is the arithmetic it uses. `down.sql` refuses while any step holds
`minutes`, naming `estimate-unit-rollback-cli.ts save|remove|restore`: `save` writes every
minute-unit step's id and unit with its estimate rows; `remove` deletes those estimate rows
and sets the unit to `workdays` (an older image would read a minute trio as days); `restore`
puts both back after a later forward run. Same shape as `work-item-status-facts-rollback-cli.ts`.

## D5 — Swap vocabulary

`estimate-units-cli.ts` prints `ESTIMATE_UNITS`; `ESTIMATE_UNITS_VOCABULARY` joins
`STORED_VOCABULARIES` in `swap.ts` with the stored command `SELECT estimate_unit AS unit,
count(*) FROM step GROUP BY estimate_unit`. An image without the CLI reads as supporting
`workdays` alone: that is the arithmetic every earlier image has, a fact and not a default,
and it is what lets a rollback deploy over a store holding only workday steps pass.

## D6 — Command and route boundary

`setEstimate`'s normalizer reads the step's unit inside the write transaction (the step row is
already read for the allowance). On `minutes`, `minuteTrioProblem` refuses `422
minutes_not_integer` or `422 minutes_above_max` at the command index; the registry's kind
count does not move. `POST /api/projects/:id/steps` takes `estimateUnit?` (absent is
`workdays`, said in the shape's JSDoc; the form always sends one). `PATCH
…/steps/:stepId` takes `estimateUnit?`; a value outside the vocabulary is `422
invalid_estimate_unit`; a change while the step holds estimate rows is `409
estimates_present` carrying `{ count }`, counted through the `estimate_by_step` index in the
same transaction as the write. The MCP tools derive from the descriptors; their descriptions
say what the unit means.

## D7 — Documents

Plan document: each step carries `estimateUnit`; import reads every earlier version with
`workdays`; from the new version a missing or unknown unit, or a fractional trio on a
minute-unit step, is `invalid_body` at the field. Saved plans: `CanonicalStep` gains
`estimateUnit`; the upgrade from the current schema sets `workdays` and schedules
identically; `diffPlans` reports a unit change under `steps`. The spreadsheet export's step
columns carry the figure through `showDuration` and a unit header.

## D8 — `showDuration`

One function, `showDuration(charged)` in fe-01 `components/wbs/duration-words.ts`, read by
the step cell's final figure, the folded step card, the Gantt bar card and the spreadsheet
export. Workday figures print exactly as today (`daysNumber`), so no workday-unit pixel or
text assertion moves. Minute figures: under 60 `N min`; under 480 `H h` or `H h M min`;
from 480 `D d` with one decimal (`480` → `1 d`, `720` → `1.5 d`). The Gantt bar card of a
minute slice adds the line "placed on the working calendar".
