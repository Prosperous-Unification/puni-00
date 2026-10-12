# design — `estimate-units`

Rationale for the unit on the step, the per-unit rounding and the placement constant lives in
[ADR 0042](../../../docs/adr/0042-an-estimate-unit-belongs-to-the-step-and-rounding-follows-it.md).
This file is the shape. Interview: `puni-plan/batch-10/interviews/020.09-answers.md` Q1–Q3a.

## Allocated numbers — implementation allocation

The implementation used base `origin/main` `99f588257a0a7014ec9271224f7900ed588e6053`.
Document and canonical versions below replace stale packet-time values. The migration stamp
was checked against that base and the integration queue; it must be rechecked against the
current integration/main before integration.

| What                                  | Base at `99f588257`                            | Pinning test                                            | This change                                                                                                            |
| ------------------------------------- | ---------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `PLAN_DOCUMENT_VERSION`               | 7 (`plan-document-shapes.ts`)                  | `plan-document.resource.test.ts` current export         | 8; earlier documents through 7 import as workdays                                                                      |
| `CANONICAL_PLAN_INPUT_SCHEMA_VERSION` | 5 (`canonical-plan-input.ts`)                  | `canonical-plan-input.test.ts`; saved-plan reader tests | 6; upgrade 5 adds explicit workday units                                                                               |
| `SCHEDULER_CONTRACT_VERSION`          | 15 (`contract-version.ts`)                     | corpus-version lint and `wire-contract-version.test.ts` | 16; minute corpus cases change the tag/cache identity, preserving old workday schedules and solver wire schema/quantum |
| Migration stamp                       | newest `20261012120000_add_step_node_attempts` | migration apply/down suites                             | `20261012130000_add_step_estimate_unit`; final integration collision check remains open                                |
| ADR                                   | ADR 0042 already accepted (highest ADR 0051)   | `adr-index.test.ts`                                     | Retain ADR 0042; no renumbering                                                                                        |

## D1 — Vocabulary in `@wbs/domain`

`ESTIMATE_UNITS = ['workdays', 'minutes']` and `isEstimateUnit` join `stored-vocabularies.ts`
(the migration's `CHECK` enumerates the same list). `estimate.ts` gains `WORKDAY_MINUTES = 480`
(a constant, not a setting) and `MAX_ESTIMATE_MINUTES = MAX_ESTIMATE_DAYS * WORKDAY_MINUTES`
(`21_474_836_160`; a 48th of a workday is 10 minutes, so the solver axis in quantum units is
`minutes / 10`, the same `MAX_ESTIMATE_DAYS × 48` bound; the `horizon-overflow` preflight
stays the guard for plans whose legal slices overflow in aggregate).
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

`rollUpCharged` folds native charged figures per step, preserving integral minute totals.
`rollUpFinals` converts each folded charge onto the 480-minute workday axis, so `finalDays` and `finalTotal` stay
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
`STORED_VOCABULARIES` in `swap.ts` (`StoredVocabulary.key` widens with `'unit'`) with the stored
command `SELECT estimate_unit AS unit,
count(*) FROM step GROUP BY estimate_unit`. An image without the CLI reads as supporting
`workdays` alone: that is the arithmetic every earlier image has, a fact and not a default,
and it is what lets a rollback deploy over a store holding only workday steps pass.

## D6 — Command and route boundary

The refusals and shapes are in `specs/plan-command-registry/spec.md`. The pure
`setEstimate` normalizer checks finite, nonnegative, ordered points without a unit cap.
`WorkItemService.setEstimate` reads the step inside the command unit of work, then checks
workday bounds or whole-minute bounds before writing. This preserves the pure normalizer
boundary and makes the unit and write observe the same transaction. A later refusal rolls
back earlier writes, journal entries and history, and publishes no captured events.
The `409 estimates_present` count comes from the `estimate_by_step` index in the same
transaction as the unit write. `estimateUnit?` lives in `step-shapes.ts` for create and patch
and `estimateUnit` on reads; the MCP tools derive from the descriptors.

### Journal unit bindings

`Preconditions.estimateUnits` records immutable step/unit bindings for both command directions,
including nested batches, `set_estimate`/`clear_estimate`, `delete_subtree.setEstimates`, and
`restore_subtree.estimates`/`removedEstimates`. Every new entry writes a map, even empty.
Capture occurs before append inside the write UoW; replay validates coverage and compares
all bindings before `apply`. Missing or changed steps use existing `stale_undo`/entry discard
settlement. Flip and rebase preserve bindings. Legacy absence explicitly binds required steps
to workdays; present malformed/incomplete maps throw. Equality is sufficient: away-and-back
unit edits may replay if other guards still hold. No row-unit or unit-revision column is added.

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
export. Workday figures print exactly as today's faces print them (`trioFinal` with `showDay`
on the table and cards, `daysNumber` on the chart), so no workday-unit pixel or text assertion
moves. Minute figures: under 60 `N min`; under 480 `H h` or `H h M min`; from 480 `D d` with
one decimal and a trailing `.0` dropped (`480` → `1 d`, `720` → `1.5 d`, `1200` → `2.5 d`). The Gantt bar card of a
minute slice adds the line "placed on the working calendar".

During a rolling swap the read contracts permit absent `estimateUnit` and `charged` from a pre-unit backend. Only absent wire units map to historical workdays; present units remain validated. New backend responses always emit both fields.

## Review correction — rollback history and saved trios

Old images ignore journal unit bindings. Live-unit probes therefore also count retained
minute bindings from command_journal, including undo/redo and bindings for removed steps.
The down migration and recovery remove refuse such history unchanged. Whole-entry quarantine
is deferred; operators must keep a compatible release while minute history is retained.
Recovery saved figures pass EstimateTrio and minuteTrioProblem before any transaction writes.

Slice 6 allocation correction (2026-10-12): base 99f588257 already contains document 7 and
canonical input 5 from attempts. This change allocates document 8 and canonical input 6;
normalization from 5 explicitly adds workday units.
