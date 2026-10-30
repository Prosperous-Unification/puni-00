# Measures and budgets in WBS

What a planner or an operator needs to know about measures, their estimates and facts, and
budgets. The rules themselves are in the
[measure-budgets spec](../../openspec/changes/wbs-measure-budgets/specs/measure-budgets/spec.md)
and the decisions (D1–D72) in its
[design](../../openspec/changes/wbs-measure-budgets/design.md); the terms are in
[CONTEXT.md](../../CONTEXT.md) under **Measure definition** through **Token estimate**.

## The model

- **Definitions belong to the organization.** Every organization holds `time`, `tokens`,
  `hours`, `cost` and `agent_minutes`; more are `createMeasure` directory commands
  (`POST /api/directory/commands`, read with `GET /api/measures`). Only an organization admin
  or super-admin may create, patch or delete a definition, or import a plan that would create
  one; anyone else is refused `403 forbidden` (design D70). Every member reads them. A key,
  kind and scale never change, and a definition anything references cannot be deleted
  (`409 measure_in_use`; there is no cascade). Only `time` schedules work.
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
  the project's budget factor (`PATCH /api/projects/:id`, `budgetFactor`). Only three-point
  trios derive one: a legacy single-point token estimate does not (design D68), and a step node
  that spends without a trio of its own leaves the subtree with no derived budget.
- **The start is admitted in the write.** `startAttempt` refuses `409 budget_exhausted`
  (naming `workItemId`, `measure`, `remaining`, `hold` and `blocked`) when a strict budget of the
  work item or an ancestor has nothing left, when the attempt's hold would take it below zero, or
  when a mix of rate cards keeps it from being read (`blocked: true`, `remaining: null`). It is
  decided inside the start's own write, so two coordinators racing for the last room cannot
  both start (design D69). Advisory and derived budgets never refuse, a claim is never refused
  for a budget (it starts no attempt), and WBS never refuses a fact past a budget.
- **Headroom is for display and ranking.** `GET /api/projects/:id/budget-headroom` answers, per
  startable or claimed step and measure, the tightest strict and advisory budgets with what is
  spent, held and remaining; the write decides.

## Export, import and saved plans

- Ordinary plans export as plan document **version 11**; connected plans use **version 12**,
  retaining the same measure content beside their captured dependency history: the budget factor, the definitions its
  figures name, the facts and trios with their basis, and the budgets, each list empty when there
  are none (design D71, superseding D63's version-10 fallback).
- Importing version 11 matches each definition by key and never remaps: a held definition of
  another shape refuses the import, writing nothing, and a missing one is defined, which only an
  admin's import may do (design D70); an unpriced money fact or trio is refused
  `400 invalid_body` with the commands' refusal code `rate_card_required` as its detail; older
  versions import onto the seeded definitions. The rule and its refusal are
  [design D65](../../openspec/changes/wbs-measure-budgets/design.md).
- Under legacy access (before activation) the organization an import matches and defines in
  is the legacy organization, which owns the imported project, so a plan's own export
  re-imports; only with no legacy organization does the import match the seeded four and
  refuse any other definition `unknown_measure` (design D65).
- Twilight Navigator, Burokrat and Dash read ordinary version 11 (design D71);
  Navigator refuses connected version 12.
- Saved plans capture trios, budgets, bases and the factor (ordinary plan input schema 9;
  dependency-aware input schema 10 also captures history), so compare names a change in any
  of them (design D66).

## Operating it

Rollback of measure facts, trios, budgets, version-11 exports and schema-9 saved plans, and
the rule to ship slices 2–4 in one deploy, are in
[the prod runbook](../runbook-prod-deploy.md#measure-fact-rollback). Once a fact in a defined
measure, a three-point trio, a priced figure or a stated budget exists, `down.sql` refuses and
the older image answers 500 on those work items: the pre-deploy database backup is the
rollback (design D72).
