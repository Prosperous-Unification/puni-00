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
  definition that estimates, facts or budgets reference refuses `409 measure_in_use`; there is
  no cascade (D21).
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
  bases refuses `mixed_rate_cards`; WBS converts nothing.
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
  `usageOfMeasure` counts facts, trios and budgets; `deleteMeasure` has no `cascade` (D21).
- **D15 Seed values and bounds.** Units `days`, `tokens`, `hours`, `micro-USD`, `minutes`;
  orders 1–5; a new definition's order defaults to one past the highest; lists sort by order
  then key. Keys match `^[a-z][a-z0-9_]{0,39}$`, units are at most 40 characters, orders 0 to
  1,000,000, currencies three capital letters.
- **D16 Directory write rule.** _Superseded by D70._ Any role but viewer under scoped access, as
  for every directory command; the open question on admins only stays open.
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
  `20261023160000_add_measure_estimate` copies every `token_estimate` row into
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
  The protection is asymmetric: a legacy write over a three-point trio replaces it, but a
  legacy `clearMeasure token_estimate` finds no legacy row beside a three-point trio and leaves
  it in place (the trio is cleared with `clearMeasureEstimate`). Restores, hand-ups and
  duplicates write single-point trios only through their legacy rows, so `recordedAt` comes
  back verbatim. An attended restart of the older image without `down.sql` loses three-point
  trios: its undo of a legacy write over one runs `clear_measure` and takes the trio, its
  delete, undo and hand-down carry legacy rows only, and its step removal fails on the
  `measure_estimate.step_id` foreign key (runbook-prod-deploy.md, _Measure estimate rollback_).
- **D29 Expected and variance on the row read.** A new optional row field
  `measureEstimates`, by definition key then step: the summed trio, `singlePoint` (true only
  when every trio summed is), `expected` and, where a fact in that measure sits beside it,
  `variance`. Integer measures round half up once per step node, exactly for integer points and decimal
  weights (BigInt over the weights scaled to integers; a fractional legacy point falls back to
  doubles with a relative snap); a parent sums its nodes' rounded figures (ADR 0011's
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
- **D32 Undo across a deleted definition refuses.** Putting a trio back in a measure deleted
  since answers 409 "a measure it estimated is no longer defined" (D24 for trios). A definition
  patched to `threePoint: false` since is no reason: the replay puts back what was there, and
  refusing it would strand every undo carrying a legacy token estimate. `clearMeasureEstimate`
  passes `three_point_forbidden`, so trios stored before such a patch can be cleared.
- **D33 Commands.** `setMeasureEstimate {measure, estimate}` and `clearMeasureEstimate
{measure}` address the definition key (legacy names are `unknown_measure`); the trio is
  parsed by the time trio's `EstimateTrio` (unordered or negative: 400 `invalid_estimate`);
  refusals in the order `unknown_measure` (404), `scheduling_measure_estimate`,
  `three_point_forbidden`, `scale_mismatch` (409), then `rolled_up` for a row with children.
  Neither command is calendar- or graph-affecting: the schedule never reads them (D2, proved
  by the slice's property test).
- **D34 Known lags.** `findCrossReferences` does not follow `measure_estimate`: the scheduling
  input never reads it, but the row read (`tree()`, `treeIsolated`, `withMeasureEstimates`)
  does, so a trio naming another project's step would be shown rather than refused; slice 5
  owns reads; the memory step fixture neither counts nor deletes
  trios on a step removal, as it does not for facts; the Dash replay inventory
  (`tools/tool-deploy`) is unchanged and names no measure-estimate kind.

Assumptions added while implementing slice 4 (tasks 3.1–3.3), each the reading closest to D1–D8:

- **D35 No budget in the scheduling measure.** `setBudget` and `clearBudget` on the
  `schedulesWork` definition (`time`) answer `409 scheduling_measure_budget`, and no budget
  is derived for it. Its fact is the actual days (D27) and its trio lives in `estimate` (D2),
  so a time budget would be a second deadline the solver never reads; additive agent time is
  budgeted in `agent_minutes`, which may hold a budget although nobody types its facts.
- **D36 One row per work item and key, stated only.** `work_item_budget (work_item_id,
measure_key, measure_id, cap, policy, hold_per_attempt, audit)` keys by `measure_key` and
  references by `measure_id` (D30), keyed for an unowned project by
  `project_organization_keys_work_item_budgets`. D5's `source` is not a column: a stored row
  is `stated`, and a derived budget is computed on every read and never stored. Cap and hold
  are in the measure's unit and scale: a fraction on an integer measure is `409
scale_mismatch`; a negative or non-finite figure is refused at the command boundary,
  `400 invalid_budget` (review S3-3: the domain no longer decides it, and a replay is checked
  by `isBudgetRecord`); an undefined key or a legacy name is `404 unknown_measure`. Refusals
  in the order unknown, scheduling, scale.
- **D37 Commands.** `setBudget {measure, cap, policy, holdPerAttempt?}` and `clearBudget
{measure}` address a work item (id or ref) and take no step: a budget bounds the whole
  subtree on every step. Parents and leaves alike; undoable (`set_budget`, `clear_budget`),
  one journal entry each; clearing an absent budget writes and journals nothing. Neither is
  calendar- or graph-affecting. Undo putting a budget back in a measure deleted since answers
  409 "a measure it budgeted is no longer defined" (D24 for budgets).
- **D38 Derived budget.** A row and key with no stated budget, whose subtree holds a trio in
  that key, reads a derived budget: the subtree's pessimistic points summed over every step,
  times the project's `budgetFactor`, rounded half up once on an integer measure; policy
  `advisory`, no holds. It exists only where every leaf of the subtree that holds facts in the
  key also holds a trio in it (review S3-4): otherwise the cap would be some leaves' estimates
  against every leaf's spend, and the budget is absent. `budgetFactor` is a project column
  (default 1, additive), patched like the other settings, refused `422 bad_budget_factor`
  unless finite, above 0 and at most 1000. It moves no date, so saved plan captures and the
  export leave it out (D22) until slice 7 carries it (D63, D66).
- **D39 Reading.** `spent` is the subtree's facts in the key summed over every step
  (`agent_minutes` derived, D20; nothing recorded reads 0). `held` is the budget's
  `holdPerAttempt` times the RUNNING attempts in the subtree whose usage is unknown. In a typed
  measure that means no fact in that key on the attempt's step node recorded at or after its
  start; in a derived measure (`agent_minutes`) every running attempt holds, since its facts
  come from ended spans only (review S3-2). `remaining` is the cap less `spent` and `held`,
  negative past the cap; `exceeded` is `spent > cap`, facts alone, so a spend hold never makes
  a budget exceeded. Known limits of the typed rule, accepted: two attempts running at once on
  one node are both released by one fact; an attempt whose start is backdated before a fact
  reads as known; a partial report releases the hold although spend continues. The row read
  adds `budgets: {key: {cap, policy, source, remaining, exceeded, held?}}`, `held` only where
  the budget states a hold; absent when the row has no budget, so plans without trios or
  budgets answer the same bytes.
- **D40 The hold is a budget field.** `holdPerAttempt` belongs with the cap it reduces, in the
  same unit; a project setting would need one figure per measure. Each budget holds its own
  allowance for every unknown attempt in its subtree, so a leaf's and its parent's budgets
  both shrink; derived budgets hold nothing.
- **D41 Headroom read in core.** `WorkItemService.budgetHeadroomWithin(projectId, access)`
  answers, for every startable step (fitting or not, `findStartableWork`) and every claimed
  step, per key the tightest budgets among its work item and its ancestors (D46), naming the
  bounding work item. It is never refused as a whole: a budget a rate-card mix keeps from
  being read is named on that step and key (D44). A plan-command batch writes and cannot carry
  a read, and dedicated read routes and MCP tools are slice 5's, so no route is added here.
- **D42 Budgets stay on their work item.** A first child takes none (the parent's budget
  bounds the child now), a deleted last child's budget is not handed up (the parent keeps its
  own) and comes back on undo with every budget of a deleted branch, a duplicate copies the
  branch's budgets with its trios (D31), and step removal touches none. `deleteMeasure`
  answers `measure_in_use` while a budget references the definition. The restore's journal
  field `budgets` is optional, present only when non-empty; nothing is ever taken off a
  surviving parent, so there is no removed list.
- **D43 Money basis.** `step_measure` and `measure_estimate` gain nullable `currency` and
  `rate_card_digest`, set together on money definitions only. A basis is the pair currency
  and digest: one digest in two currencies is two bases (review S3-1). `setMeasure` and
  `setMeasureEstimate` take `rateCardDigest` (non-empty, at most 128 characters): required
  on a write in a money measure (`409 rate_card_required`), refused on any other
  (`409 rate_card_forbidden`), not needed by a clear; the currency is the definition's at the
  write. Journals and hand-ups carry the `basis`; a money `set_measure` or
  `set_measure_estimate` replay without one refuses (`rate_card_required`) instead of writing
  an unpriced figure (review S2-2b). Figures written before carry none, which counts as one
  more basis (null).
- **D44 One basis per money key per subtree, per kind.** Facts and trios fold apart (review
  S2-2): a row whose subtree holds money facts in a key under two or more bases loses that key
  from `measures` (and its budgets), one whose trios do loses it from `measureEstimates` (and a
  derived budget), and each reads `mixedRateCards: {key: {facts?, estimates?}}` naming the
  first two bases (null first, then currency, then digest). A leaf whose trio is on one card
  and fact on another is not mixed. The headroom read names a blocked budget on its step and
  key only, so a mix in `cost` never touches `tokens` or `agent_minutes`; a last-child delete
  refuses `409 mixed_rate_cards` with `bases` only when the hand-up would add two bases within
  facts or within trios. WBS converts nothing (design non-goals), so these refusals have no
  override, and a card rotation splits a key's sums across every ancestor spanning both cards:
  by design. Operations should ship slices 2–4 in one deploy (runbook _Budget rollback_).
- **D45 Known lags.** The headroom read has no route or MCP tool (slice 5); the row read shows
  a basis only when mixed (slice 5 reads, slice 6 panel); the export carries neither budgets
  nor bases (D22, slice 7); `findCrossReferences` does not follow `work_item_budget` (D34).
  Slice 5 closed the route, the read's basis and the cross references (D48–D50); slice 7 closed
  the export (D63); the panel remains.
- **D46 Strict and advisory headroom apart (review S2-1).** Per key the headroom read answers
  `{strict?, advisory?, mixedRateCards?, mixedAt?}` (the two mixed fields superseded by D52): the tightest strict budget of the chain,
  which the coordinator refuses on, and apart the tightest advisory or derived one, which it
  only reports. An advisory budget with less remaining never hides an exhausted strict one.
- **D47 Refusal schemas compile once per status, not once per code.** mcp-01 compiles every HTTP
  shape at boot inside a 512 Mi pod; `commandParserRefusal`'s 132 arms and the batch's 78 plain
  arms each carried the whole command-kind enumeration, and slice 4's two kinds and codes pushed
  the boot from about 521 MB (slice 3, already at the limit) past it (OOMKilled in the k3s
  rehearsal). Each is now one object over the enumerated codes, typed as the per-code union it
  validates; the wire shape and the validation are unchanged, the OpenAPI document lists the
  codes as one enum. `contracts-boot-memory.test.ts` bounds the cost of loading every shape.

Assumptions added while implementing slice 5 (task 4.1), each the reading closest to D1–D8:

- **D48 Trios cross like facts; budgets cannot.** `findCrossReferences` gains
  `measure_estimate_step` (a trio of this project on another project's step) and follows
  `measure_estimate` into the project under `incoming_step_row`; activation reconciliation gains
  the same `measure_estimate_step` conflict. The row read shows trios and step removal cascades
  them by step, so a trio naming a foreign step now fails the read, a batch and a step removal
  closed exactly as a crossing fact does (D34's lag closed). `work_item_budget` needs no kind: it
  names no step, its work item is the row it belongs to, and its `measure_id` is resolved only
  through the project's organization (D25), so no budget can reach outside the project.
- **D49 The row read names a priced basis; its budgets keep their bytes.** A row and money key
  whose subtree's facts, or trios, all carry one basis reads `moneyBases: {key: {facts?,
estimates?}}` with that `{currency, rateCardDigest}` (D45's lag closed for reads; the panel is
  slice 6). Facts and trios are named apart as `mixedRateCards` is (D44); a mixing kind is named
  there instead, and a kind whose figures are all unpriced names nothing (its absence is the
  answer, and a project with no priced figure skips the attachment entirely). `BudgetReading`
  gains `spent` (the subtree's facts) for the headroom read; the row read strips it, so a row's
  `budgets` answer the bytes they did in slice 4.
- **D50 Headroom route.** `GET /api/projects/:id/budget-headroom` (MCP
  `getApiProjectsByIdBudget-headroom`, derived from the shape like every tool) serves
  `budgetHeadroomWithin` with an optional `team` query, admitted exactly as the startable read:
  any role of the organization reads it (viewers included), a foreign or absent project is 404
  `not_found`, a team the organization does not hold 404 `unknown_team`, a repeated or
  undeclared query key 400 `invalid_query`. Each bounding budget carries `spent` beside `cap`,
  `held`, `remaining`, `exceeded` and the bounding `workItemId`, and `holdPerAttempt` where the
  budget states one; the read is never refused for a mix (D44, D46). It is not a snapshot: the
  startable steps and the budgets are read apart (no shared capture), so a write landing between
  the two can pair a step with budgets a moment newer. Advisory-consistent by design: a
  coordinator rereads before acting on a value at the edge.
- **D51 Refusal audit.** Every code slices 1–4 added is driven through HTTP on each route that
  answers it (`measure-refusal.controller.db.test.ts`): directory codes on both batches, plan
  codes on the project batch (the directory batch answers `project_required` first), parser codes
  as 400, `bad_budget_factor` as 422 on the project patch. The table holds a hand list of every
  code the change added to the parser's and the batch's enumerations (D47) and asserts it drives
  each and that the batch declares each row. Two readings recorded: an empty
  `measureId` is an id and answers 404 `not_found`, only a non-string reaches
  `measureId_must_be_an_id`; a non-number `budgetFactor` is the patch's structural 422
  `invalid_body`, as for every setting. Slice 4's review removed the batch 422 `invalid_budget`
  arm, so this slice leaves it alone. The command descriptions now state units, scales and the
  refusals of clears.
- **D52 A blocked budget keeps its policy (review of PR #679, S2-1); supersedes D46's mixed
  fields.** `readBudgets`' `blocked` carries each blocked budget's bases, policy and source; the
  headroom read answers per key `{strict?, advisory?, blocked?: {strict?, advisory?}}`, each
  `blocked` entry `{workItemId, bases, source}`, the nearest blocked budget of that policy in
  the chain. `mixedRateCards`/`mixedAt` are gone from the read. Without the policy, a derived
  (advisory) cap blocked by trios on two cards read byte-identical to a stated strict budget
  blocked by a mix, and the coordinator could not decide. Its rule, now in the field
  descriptions: refuse when `strict.remaining <= 0` or `blocked.strict` is present; advisory
  budgets, read or blocked, never refuse. A readable and a blocked budget of one policy are
  both reported; the coordinator needs both (the blocked one's remainder is unknown).

Assumptions added while implementing slice 6 (tasks 4.2, 4.3), each the reading closest to D1–D8:

- **D53 Columns are display sums; the panel edits.** A measure column shows a row's figure summed
  over its steps: the expected figures, the facts, and the variances the read states per step
  (D29), never fact minus expected worked out in fe-01, so a step with a fact and no trio adds no
  variance. A definition without three points (`hours`, `agent_minutes`) offers its fact column
  only, since its estimate and variance could never fill. The scheduling measure has no columns of
  its own: its Columns choice drives the step columns and Days through the existing hide-list.
  Cells are read-only; trios, facts and budgets name a step or a budget and are typed in the
  Measures panel. The phone's cards draw no measure figures; the panel is on the card menu.
- **D54 Toggles are answers, not a hide-list** (amended by the review of PR #680: Reset layout
  now forgets them, and the spec scenario says "per browser and project"). `wbs.measureColumns.<project>` holds
  `{key: boolean}` per browser and project, beside the existing remembered layout: an unanswered
  key follows `showByDefault`, so a definition created later starts hidden and a definition that
  turns `showByDefault` on shows for readers who never answered. Saved views do not carry it;
  Reset layout forgets it with the hide-list; "per user" is per browser, as every remembered
  layout is, and the delta spec now says so.
- **D55 Definitions are read once per opened project.** `GET /api/measures` through the plan
  commands (`listMeasures`), with loading, `organization_required` (review S3-6) and any other
  refusal rendered as states in the Columns control and the panel. A definition created while the
  plan is open shows on the next open; the directory stream does not re-read it.
- **D56 Money reads as its currency.** A money definition whose unit is `micro-<currency>` (the
  seeded `cost`) is shown and typed in that currency (`1500000` → `$1.50`), a change of scale and
  no conversion; any other money unit is shown raw with its unit. A single basis is named on the
  figure's hover and in the panel; a mixed kind is a "mixed cards" marker naming both bases, and a
  budget whose facts mix reads "Budget unknown", never a sum. The panel prefills the rate card
  digest from the row's one basis and sends what is typed; be-01 decides `rate_card_required`.
- **D57 The panel is a modal from the row menu.** The plan has no work item page: attempts and
  dependencies live in hover cards over one cell. "Measures…" sits after Duplicate in the table's
  and the cards' row menus. A parent offers only its budget (its figures are sums, `rolled_up`);
  a derived measure offers only its budget; time is read-only (planned days, actual days, no
  budget, D35).
- **D58 Read-only roles are refused like every edit.** The plan table has no role reading; a
  viewer's write is refused by be-01 `forbidden` and worded by `plan-refusal.ts` as every other
  edit is, beside the control in the panel and as a toast. Hiding the forms for viewers needs a
  role on the plan read, which no slice provides (no backend change here).
- **D59 Panel writes go through `run`.** Each is one plan command in the existing write path, so
  a refusal is toasted and the plan reread as for any edit, and its sentence is also kept beside
  the control that asked (toasts sit above the modal, but the reader is looking at the form).

Assumptions added while fixing the review of PR #680 (slice 6):

- **D60 The row read names a stated hold.** A row's budget entry gains `holdPerAttempt`, present
  exactly where the budget states a hold (beside `held`), so a row without holds answers the bytes
  it did; D49's strip now drops `spent` alone. `setBudget` restates the whole budget (an omitted
  hold clears it), so the panel prefills the hold box from it and sends what the box holds: an
  emptied box is the reader's explicit "no hold" (`null`). An older be-01 that sends no
  `holdPerAttempt` leaves the box empty, and a Save there clears the hold; that window closes with
  this release. Saved plans capture the row read, so a captured row with a hold carries one more
  field.
- **D61 The panel warns where the coordinator refuses.** A strict budget reads `refusing` when its
  `remaining <= 0` (the headroom read's rule, `budget-headroom-shapes.ts`), not when `exceeded`:
  spent exactly to the cap, or holds taking the rest, refuse the next attempt. The bar's colour and
  the sentence follow `refusing`; the "exceeded" badge stays for facts past the cap; holds are said
  as "nothing left · N held", never "over".
- **D62 Figures never round to zero, and typed commas only group thousands.** A non-zero figure the
  usual digits would show as zero takes two significant digits, up to a millionth (`$0.0015`,
  `¥0.40`). A typed figure accepts a comma only between thousands; currency is converted to
  micro-units on its digits, never through a float product, and finer than a micro-unit is refused
  in the field.

Assumptions added while implementing slice 7 (tasks 4.4, 4.5), each the reading closest to D1–D8:

- **D63 Version 11, written only when it carries something.** The plan document gains version
  11: `settings.budgetFactor`, `measureDefinitions` (every field but the id, for the keys its
  figures name, in list order), `measureFacts` (facts in defined measures with their `basis`),
  `measureEstimates` (every trio but the single-point tokens trios, with `basis`) and `budgets`
  (stated only: `cap`, `policy`, `holdPerAttempt`). Legacy facts and the legacy token estimate
  stay in the row's `measures` under their legacy names (D18, D28), so the single-point flag
  travels as the legacy figure itself; `agent_minutes` comes back from the attempts. Entries
  follow the tree's row order, then step order, then key, so a re-import's fresh ids keep the
  order. The export writes version 11 only when a plan holds a fact in a defined measure, a
  trio that is not single-point, a stated budget or a factor other than 1; any other plan
  exports version 10 byte for byte as before (`LEGACY_PLAN_DOCUMENT_VERSION`), so the outgoing
  release, Twilight Navigator (which reads 7–10) and saved files keep reading it and the v9/v10
  golden hashes stand. Known lag: Navigator, Burokrat's `planDocumentVersion` and Dash refuse a
  version-11 file loudly until they admit it; nothing silently drops measures any more (D22
  closed). Admitting version 11 there is a tracked follow-up (task 4.6), deliberately outside
  slice 7: Navigator's `NAVIGATOR_PLAN_DOCUMENT_VERSIONS` (`plan-reference.ts`, `[7, 8, 9, 10]`),
  Burokrat's `planDocumentVersion` (`navigator-records.ts`, `6 | 7 | 8 | 9 | 10`) and Dash's
  plan reads each gain 11 with their own tests.
- **D64 Row readings never enter the document.** The row read's `measureEstimates`, `budgets`,
  `mixedRateCards` and `moneyBases` are readings (summed, expected, remaining) and are stripped
  from every exported row, as spans are; slices 3–5 had let them ride along on the plan branch
  (never on `main`), which also leaked derived budgets computed from the factor into version 10.
- **D65 Import matches definitions by key and never remaps.** A file definition the importing
  organization holds must agree on `kind`, `scale`, `unit`, `currency`, `threePoint`, `derived`
  and `schedulesWork`; the first field that differs refuses the import `409 source_refused`
  with `path: measureDefinitions[i].<field>` and `detail: measure_shape_mismatch`, writing
  nothing. Name, order and default visibility stay the organization's. A definition it lacks is
  created there (decided by `decideMeasureCreate`; projects are told the directory changed).
  Under legacy access the organization is the legacy one when it exists: before activation the
  `project_organization_bridge` trigger gives it every created project, the imported one
  included, and legacy-access directory commands already define measures there, so matching and
  creating happen there as for scoped access (PR #681 review S2-1: refusing there made a plan's
  own export unimportable). Only with no legacy organization is the created project owned by
  none, so only the four it answers match and any other definition refuses `source_refused` /
  `unknown_measure` (D19).
  `prepareImport` checks every fact, trio and budget against the file's own definitions as the
  commands would (keys, scale, three-point, scheduling, derived, money basis, leaves, one per
  place); a matched definition has the same shape, so nothing is decided twice. Files older than
  version 11 that name any of the four lists, or a factor other than 1, are refused
  `400 invalid_body`; a factor of 1 is what they read as and passes. No refusal code is new, so
  D47's enumerations are untouched. Found while round-tripping: SQLite's `insertSubtree` wrote
  facts without their basis, so an import and an undo of a delete put priced facts back
  unpriced; it now writes the basis columns.
- **D66 Saved plans capture measures (plan input schema 9).** `CanonicalPlanInput` gains
  `measureEstimates` (single-point tokens trios excluded, as in D63), `budgets` and
  `project.budgetFactor`, and each measure its `currency` and `rateCardDigest`; a schema-8 body
  upgrades with none of them, a factor of 1 and unpriced facts, and stored bytes are never
  rewritten. Compare reports trios and budgets under `measures` and the factor under
  `settings`. Definitions are not captured: the key is the name a capture shows. A schema-9 body
  is new bytes, so new captures hash differently from schema-8 ones by design. Had slices 2–4
  reached production before slice 7, plans saved in between would hold trios, budgets and a
  factor the schema-8 capture left out, so compare against a later capture would show a
  spurious factor change and "added" trios and budgets; the plan branch lands on `main` as one
  merge, so no such capture exists.
- **D67 Golden fixtures state the default factor.** The core export fixture's project had
  `budgetFactor: 1.5` to prove slice 4's strip; under D63 that factor is version-11 data, so the
  legacy-shape fixtures state 1 and the version-11 cases state 1.5. The v9 and v10 golden
  hashes (`016181aa…`, `f2308a55…`) are unchanged; version 11 adds its own (`62708699…`).

Decisions from the review fixes (PR A, 2026-10-24):

- **D68 A single-point trio seeds no derived budget** (Dany, 2026-10-24). Only a three-point
  trio seeds a derived budget (D38) or covers a step node's spend. The single-point tokens trio
  is the legacy token estimate (D28): every plan Twilight Navigator writes holds one, so
  counting it would give every such plan derived tokens budgets and exceeded badges nobody set.
  A stated budget beside it reads as before. Coverage is per step node (review A-1): a derived
  budget exists only where every leaf step node holding a fact in the key also holds a
  three-point trio in it, since spend and pessimistic points fold per step.
- **D69 Admission moves into the WBS claim write** (placeholder). The strict-budget hold
  becomes part of the claim and attempt-start write in WBS rather than a read the coordinator
  refuses on; designed and built in PR B, which records it here.
- **D70 Measure definitions are admin-only** (Dany: "tighten permissions"; supersedes D16).
  `createMeasure`, `patchMeasure` and `deleteMeasure` require the organization admin or
  super-admin role under scoped access, refused `403 forbidden` per command (`{at, kind, error}`,
  the shape `patchPerson`'s account binding uses), checked before anything is read. An import
  that would create a definition (D65) requires the same role and is refused `403 forbidden`
  whole, writing nothing; matching held definitions needs no more than the import itself.
  Legacy access carries no role, and every legacy caller already writes the whole directory, so
  it keeps writing definitions. Machine principals resolve to the member role (A23), so a
  machine credential can define nothing: `403 forbidden` on all three commands and on a
  defining import. A definition changes what every project's figures mean, an
  organization act like ranking projects.
- **D71 Always version 11** (placeholder). Whether the export writes version 11 for every plan,
  retiring D63's conditional, follows once Navigator, Burokrat and Dash admit it (task 4.6).
- **D72 Rollback is the pre-deploy backup** (Dany, 2026-10-24: no users yet). Once a fact in a
  defined measure (D23), a three-point trio (D28), a priced figure or a stated budget (D44)
  exists, `down.sql` refuses, and the older image answers 500 on work items holding a fact in a
  defined measure and loses or ignores the rest. The runbook names the backup taken before the
  deploy as the rollback; the hand-clearing paths stay for a rollback that must keep other
  writes.
- **Import basis, as the commands decide it** (review B-1). `prepareImport` refuses a `cost` fact
  or trio whose `basis` is null with `400 invalid_body`, detail `rate_card_required`, at its
  `basis` path, so D65's "as the commands would" holds for money; no refusal code is new.

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
- ~~Who may define measures~~: organization admins and super-admins (D70, Dany 2026-10-24).
