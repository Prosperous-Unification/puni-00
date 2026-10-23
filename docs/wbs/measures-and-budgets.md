# Measures and budgets in WBS

What a planner or an operator needs to know about measures, their estimates and facts, and
budgets. The rules themselves are in the
[measure-budgets spec](../../openspec/changes/wbs-measure-budgets/specs/measure-budgets/spec.md)
and the decisions (D1–D67) in its
[design](../../openspec/changes/wbs-measure-budgets/design.md); the terms are in
[CONTEXT.md](../../CONTEXT.md) under **Measure definition** through **Token estimate**.

## The model

- **Definitions belong to the organization.** Every organization holds `time`, `tokens`,
  `hours`, `cost` and `agent_minutes`; more are `createMeasure` directory commands
  (`POST /api/directory/commands`, read with `GET /api/measures`). A key, kind and scale never
  change. Only `time` schedules work.
- **Time stays where it was.** Its trio is the step estimate and its fact the recorded days;
  no other measure moves a date.
- **Every other measure has a trio, a fact and a variance per step node.**
  `setMeasureEstimate` writes a trio where the definition allows three points, `setMeasure` a
  fact; the row read shows the expected measure and the variance per subtree. Tokens and hours
  facts keep their legacy names `token_actual` and `hours_actual` for one release, and a legacy
  `token_estimate` reads as a single-point tokens trio.
- **Money carries its basis.** A `cost` fact or trio needs a `rateCardDigest`; figures under
  two bases are never added, and a sum that would add them names both instead.
- **Budgets are rows.** `setBudget` caps one measure on one work item, strict or advisory, with
  an optional spend hold per running attempt; a parent's budget bounds its subtree. Where none is
  stated and the subtree is estimated, a derived advisory budget is the pessimistic points times
  the project's budget factor (`PATCH /api/projects/:id`, `budgetFactor`).
- **The coordinator reads headroom.** `GET /api/projects/:id/budget-headroom` answers, per
  startable or claimed step and measure, the tightest strict and advisory budgets with what is
  spent, held and remaining; WBS never refuses a fact past a budget.

## Export, import and saved plans

- A plan holding a fact in a defined measure, a three-point trio, a stated budget or a factor
  other than 1 exports as plan document **version 11**, which carries the definitions those
  name, the facts and trios with their basis, the budgets and the factor. Any other plan
  exports version 10, byte for byte as before (design D63).
- Importing version 11 matches each definition by key: one the organization holds must agree on
  kind, scale, unit, currency, three points, derived and scheduling, or the import answers
  `409 source_refused` with `detail: measure_shape_mismatch` at the first differing field and
  writes nothing; one it lacks is defined. Older versions import as before onto the seeded
  definitions (design D65).
- Twilight Navigator reads versions 7 to 10 and refuses a version-11 file until it admits it.
- Saved plans capture trios, budgets, bases and the factor (plan input schema 9), so compare
  names a change in any of them (design D66).

## Operating it

Rollback of measure facts, trios, budgets, version-11 exports and schema-9 saved plans, and
the rule to ship slices 2–4 in one deploy, are in
[the prod runbook](../runbook-prod-deploy.md#measure-fact-rollback).
