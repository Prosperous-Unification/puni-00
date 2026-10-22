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
