## Context

Read on 2026-10-22. `estimate` holds one trio per step node in the step's unit, folded by the
project's PERT weights; the solver schedules on it and `actual.days` is its fact.
`step_measure` holds `(metric, value, recordedAt)` with `metric` from a closed enum of three.
`rollUpMeasures` folds one metric per call, refusing by construction to add unlike units, and
keeps absence distinct from a recorded zero. fe-01 remembers table layout per user, and the
measure columns are named in its preference keys. Twilight's control-plane spec requires hard
caps in tokens, money and additive agent time; nothing in WBS can hold them. The Dash ledger
(PR #656) prices usage per merge and has nowhere to write it.

## Goals / Non-Goals

**Goals:**

- A measure is data: adding one is a command, and every measure has the same shape of
  estimate, fact, variance, budget and column.
- The schedule is untouched by any measure but time, provably.

**Non-Goals:**

- Conversions, pricing inside WBS, cross-project budgets, renewable budgets per period.

## Decisions

Assumptions a careful colleague would take today, recorded so Dany can overturn them by id:

- **D1 Measure definition is a directory entity**, organization-scoped like a work item type:
  `key` (slug, immutable), `name`, `unit` (label), `kind` (`duration | count | money`),
  `scale` (`integer | real`), `threePoint`, `showByDefault`, `schedulesWork`, `order`, and for
  money a `currency`. Seeded per organization: `time` (duration, schedulesWork, showByDefault),
  `tokens` (count, integer), `hours` (duration, real, threePoint false), `cost` (money, integer
  micro-units), `agent_minutes` (duration, integer, derived, threePoint false). Deleting a
  definition that estimates, facts or budgets reference refuses unless cascade is explicit.
- **D2 Exactly one scheduling measure.** `schedulesWork` is unique per organization and is
  `time`. The solver, allowances, rounding and the Gantt read the existing `estimate` and
  `actual` tables unchanged. A property test over random plans proves that adding, changing
  or deleting any other measure's estimate, fact or budget leaves the schedule digest
  byte-identical.
- **D3 Three points per measure.** `measure_estimate (work_item_id, step_id, measure_id,
optimistic, realistic, pessimistic)` in the measure's unit and scale, with the time trio's
  ordering rule; refused on a definition with `threePoint = false`. Expected value is the
  project's PERT weights applied to the trio and rounded by the scale; variance is fact minus
  expected; both roll up per subtree with the one-measure fold.
- **D4 Facts keyed by definition.** `step_measure` gains `measure_id`, back-filled from the
  enum: `token_actual` to `tokens`, `hours_actual` to `hours`; `token_estimate` rows become
  single-point trios in `measure_estimate` flagged `singlePoint` until re-estimated. The enum
  column stays one release for blue and green; `down.sql` refuses while a row carries a measure
  the enum cannot express. `agent_minutes` is derived on read from ended attempt spans and
  refuses `setMeasure`.
- **D5 Budget is an entity.** `work_item_budget (work_item_id, measure_id, cap, policy, source)`
  with `policy ∈ {strict, advisory}` and `source ∈ {stated, derived}`; a derived cap is the
  pessimistic point times a project factor and is computed, never stored as stated. A parent's
  budget bounds the subtree's summed facts. Facts are recorded even past a strict cap; the
  read reports `exceeded`; refusing the next attempt is the coordinator's job, through a
  project-scoped read of remaining budget per measure with holds for unknown spend.
- **D6 Money carries its basis.** A `cost` fact and estimate record the currency and the rate
  card digest they were priced with; a roll-up that would add figures under different
  digests refuses `mixed_rate_cards` without a stated conversion.
- **D7 Columns follow the definition.** The plan table offers estimate, fact and variance per
  definition, visible by default only where `showByDefault`; toggles persist per user and
  project through the existing remembered layout; a measure panel per work item lists every
  definition with expected, fact, variance and budget.
- **D8 Export version bump.** Definitions, estimates, facts and budgets travel in the export;
  an older version imports by seeding the defaults and mapping legacy metrics; saved plan
  compare shows measure changes.

Assumptions added while implementing slice 1 (tasks 1.1, 1.2), each the reading closest to D1–D8:

- **D9 Owned by a column, read through the legacy organization.** `measure.organization_id`
  is a column, not an ownership side table: keys are unique per organization, so a global root
  with a legacy bridge would make the second organization's `time` collide. Legacy access reads
  and writes the legacy organization's definitions; with none marked legacy, reads and writes
  answer `409 organization_required`, the spaces' answer.
- **D10 Seeding is SQL.** The migration seeds existing organizations, and the trigger
  `organization_seed_measures` seeds every later one inside the inserting statement, whichever
  release inserts it mid-swap; the memory source seeds in `addOrganization`. Definitions
  cascade with their organization.
- **D11 No undo.** The brief's "undoable, exactly like `createResource`" contradicts the code:
  directory batches journal nothing (`runDirectory`), so measure commands are all-or-none and
  not undoable, exactly like `createResource`.
- **D12 The scheduling measure stays `time`.** D2's "is `time`" read strictly: a patch clearing
  `schedulesWork` on it is refused `409 scheduling_measure_fixed`; setting it elsewhere is
  `second_scheduling_measure`.
- **D13 Shape is fixed.** `kind` and `scale` never change (`409 measure_shape_immutable`), as
  `key` never does (`measure_key_immutable`); no command sets `derived`.
- **D14 Seeded means the five keys.** A seeded definition is never removed (`measure_in_use`)
  but may be renamed; `down.sql` refuses only for other keys and drops renamed seeds.
  `usageOfMeasure` answers zero until the first referencing table; `deleteMeasure` gains
  `cascade` with it.
- **D15 Seed values and bounds.** Units `days`, `tokens`, `hours`, `micro-USD`, `minutes`;
  orders 1–5; a new definition's order defaults to one past the highest; lists sort by order
  then key. Keys match `^[a-z][a-z0-9_]{0,39}$`, units are at most 40 characters, orders 0 to
  1,000,000, currencies three capital letters.
- **D16 Directory write rule.** Any role but viewer under scoped access, as for every directory
  command; the open question on admins only stays open.
- **D17 One read.** `GET /api/measures` (MCP `getApiMeasures`); writes go through
  `POST /api/directory/commands`.

Assumptions added while implementing slice 2 (tasks 1.3, 1.4), each the reading closest to D1–D8:

- **D18 Legacy names stay the address for one release.** A tokens or hours fact keeps
  `token_actual`/`hours_actual` on every surface blue and green share — the row read's
  `measures`, the command journal, the export, saved plans — because the outgoing release
  reads only those names; `tokens` and `hours` are accepted on input and normalized to them.
  Every other definition is addressed by its key. `token_estimate` rows stay unkeyed (NULL
  `measure_id`): keying them to `tokens` would collide with the tokens fact in the unique
  index, and slice 3 replaces them. The three legacy names are refused as new keys
  (`measure_key_taken`). `unknown_metric` is retired for `unknown_measure` (404, the work-item
  command refusal convention); the contracts keep the old arm for the swap, like `frozen`.
- **D19 A project no organization owns has no definitions.** Its facts are decided against the
  seeded `tokens` and `hours` (and `agent_minutes` and `time`, refused as below) and
  stored with a NULL `measure_id`;
  `project_organization_keys_measure_facts` keys them in the statement that maps the project.
- **D20 Agent minutes.** Per step node, the sum of end minus start over its ended attempts
  (overlaps count twice), rounded half up to whole minutes once on the node's total;
  `recordedAt` is the latest end. Read in the row's `measures` as `agent_minutes`, folded
  like any measure, absent until an attempt ends. Saved-plan comparisons will show
  `agent_minutes` churn whenever an attempt ends between two captures.
- **D21 No cascade yet.** `deleteMeasure` refuses `measure_in_use` while facts reference the
  definition; a cascade would discard facts with no undo (D11). The `measure_id` foreign key,
  without `ON DELETE`, is the backstop.
- **D22 The export keeps its version's shape.** Until slice 7 bumps it, the document carries
  legacy metrics only: facts in defined measures and the derived `agent_minutes` are left out,
  so an export still imports. Saved plans capture the row read and do carry them. Until then
  an export silently omits facts in defined measures: a round trip through a file loses them.
- **D23 No shared window; recovery is the exposure.** Backend swaps stop and prove the old
  writer before migrating (`docs/runbook-prod-deploy.md`), so blue and green never serve this
  schema together. The consequence is for recovery: once a fact exists in a defined measure, an
  attended restart of the older image answers 500 on every work item holding one, and
  `down.sql` refuses; both exits stay closed until those facts are cleared by hand (runbook,
  _Measure fact rollback_).
- **D24 Undo across a deleted definition refuses.** Putting back a fact (or a deleted subtree's
  facts, or a replayed hand-up) in a measure deleted since answers 409 with "that measure is no longer defined".
- **D25 Integrity by construction.** `measure_id` is only ever resolved through the project's
  own organization (store and triggers), so no ownership-conflict kind is added; conflict ids
  use `coalesce(metric, measure_id)`.
- **D26 Navigator unchanged.** `receipt-to-commands.ts` sends the legacy names, which stay
  accepted for the release.
- **D27 The scheduling measure takes no fact here.** `setMeasure` on the `schedulesWork`
  definition (`time`) is refused `409 scheduling_measure_fact`: its fact is the actual days,
  recorded with `setActual`, and a second figure beside `actual.days` would be a second truth.

Assumptions added while implementing slice 3 (tasks 2.1–2.4), each the reading closest to D1–D8:

- **D28 The single-point tokens trio is the legacy token estimate.** Migration
  `20261023120000_add_measure_estimate` copies every `token_estimate` row into
  `measure_estimate` as a `tokens` trio with o = r = p and `single_point = 1`, and keeps the
  legacy row for the outgoing release. The two are one figure: triggers on `step_measure`
  write, rewrite, move and delete the single-point trio with every legacy row any release
  writes; a legacy write over a three-point trio replaces it (the inverse puts the trio back);
  a three-point write (any `setMeasureEstimate`, which always clears the flag) deletes the
  legacy row, so no single figure is shown for a range. The memory fixture derives the
  single-point trios from its measure rows instead of storing them. `setMeasure
token_estimate` keeps working and journals as before. The row read's `measures` still
  carries `token_estimate`, so existing bytes are unchanged; `down.sql` refuses while any trio
  is not a single-point tokens trio with its legacy row. The export reads the legacy rows, so
  a three-point tokens trio, like every defined measure (D22), is left out until slice 7.
- **D29 Expected and variance on the row read.** A new optional row field
  `measureEstimates`, by definition key then step: the summed trio, `singlePoint` (true only
  when every trio summed is), `expected` and, where a fact in that measure sits beside it,
  `variance`. Integer measures round half up once per step node (a weighted figure within
  1e-9 of a half snaps to it first); a parent sums its nodes' rounded figures (ADR 0011's
  order); real measures are unrounded. Variance is the subtree's summed facts minus its
  summed expected measures, absent when either side is. The field is absent on a row with no
  trio, so plans without measure estimates answer the same bytes. In a shared-people read the
  trios are read just after the coherent capture, outside it; nothing the schedule reads
  comes from them.
- **D30 Identity by key, reference by id.** `measure_estimate`'s key is (work item, step,
  `measure_key`); `measure_id` references the definition and is NULL on a project no
  organization owns (whose one estimable key is `tokens`, D19) until
  `project_organization_keys_measure_estimates` keys it. `usageOfMeasure` counts trios, so
  `deleteMeasure` answers `measure_in_use` while one exists (D21's backstop is the foreign key).
- **D31 Trios follow their work item as facts do.** A first child takes them (`moveAll`), a
  deleted last child hands them up summed per key, a delete's undo puts them back, and a
  duplicate copies them (they describe work, like the time estimate). The journal fields
  (`measureEstimates`, `removedMeasureEstimates`, `setMeasureEstimates`) are optional and
  present only when non-empty; `set_measure_estimate`/`clear_measure_estimate` are new
  compensating kinds no older image reads (D23). SQLite step removal counts three-point trios
  under `measures` and deletes them with a confirmed cascade.
- **D32 Undo across a changed definition refuses.** Putting a trio back in a measure deleted
  since, or one that no longer allows three points, answers 409 "a measure it estimated is no
  longer defined" (D24 for trios).
- **D33 Commands.** `setMeasureEstimate {measure, estimate}` and `clearMeasureEstimate
{measure}` address the definition key (legacy names are `unknown_measure`); the trio is
  parsed by the time trio's `EstimateTrio` (unordered or negative: 400 `invalid_estimate`);
  refusals in the order `unknown_measure` (404), `scheduling_measure_estimate`,
  `three_point_forbidden`, `scale_mismatch` (409), then `rolled_up` for a row with children.
  Neither command is calendar- or graph-affecting: the schedule never reads them (D2, proved
  by the slice's property test).
- **D34 Known lags.** `findCrossReferences` does not follow `measure_estimate` (the schedule
  read never reads it; slice 5 owns reads); the memory step fixture neither counts nor deletes
  trios on a step removal, as it does not for facts; the Dash replay inventory
  (`tools/tool-deploy`) is unchanged and names no measure-estimate kind.

## Risks / Trade-offs

- The schedule must not move: D2's property test is the guard, and the time trio stays in its
  own table rather than migrating into the generic one, which costs a second code path and buys
  zero solver change.
- Money arithmetic across cards: refusing is correct and will surprise a reader who expects a
  total; the panel names the digests involved.
- Column sprawl: defaults hide everything but time; the cost is one more preference per user.
- `token_estimate` semantics change from one number to a trio: the single-point flag keeps the
  old figure honest until someone estimates properly.

## Migration Plan

1. Directory table `measure` and seeding of the five definitions for every organization.
2. `measure_estimate`, `work_item_budget`, `step_measure.measure_id` with back-fill; enum kept.
3. Reads and commands behind the new shapes; export version bump; fe-01 columns and panel.
4. Next release: drop the enum column once every row carries `measure_id`.

## Open Questions

- The project factor for derived budgets (proposed 1.0 of the pessimistic point).
- Whether `hours` merges with `time` as the human fact of the scheduling measure, or stays a
  separate measure (proposed: separate, since days are scheduled and hours are typed).
- Who may define measures: organization admins (proposed) or any editor.
