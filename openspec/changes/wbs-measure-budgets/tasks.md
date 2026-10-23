## 1. Measure definitions and facts

- [x] 1.1 Migration `add_measure`: directory table, seed of five definitions per organization,
      `down.sql` refuses while any non-seeded definition or referencing row exists — test:
      migration forward and back; negative: drop the guard and the rollback deletes a
      definition with facts; watched.
- [x] 1.2 Domain decision and commands `createMeasure`, `patchMeasure`, `deleteMeasure` with
      typed refusals — test: conformance suite over memory and SQLite; negative: remove the
      `schedulesWork` uniqueness check and two scheduling measures store.
- [x] 1.3 `step_measure.measure_id` with back-fill; `setMeasure` by key; `unknown_measure`,
      `scale_mismatch`, `derived_measure` — test: existing facts read back unchanged over a copy
      of the dev store; negative: skip the back-fill and the legacy facts vanish from reads.
- [x] 1.4 `agent_minutes` derived from ended attempt spans — test: hand sum; negative: include
      running attempts and the running-attempt case overcounts.

## 2. Estimates per measure

- [x] 2.1 `measure_estimate` table and `setMeasureEstimate`/`clearMeasureEstimate` with the
      ordering rule and `three_point_forbidden` — test: conformance suite; negative: drop the
      ordering narrow and the unordered trio stores.
- [x] 2.2 Expected value and variance per measure, rolled up — test: textbook and custom
      weights; negative: swap the fold to add expected and fact and the variance case fails.
- [x] 2.3 Legacy token estimate as single-point trio with the flag cleared on a three-point
      write — test: migration fixture; negative: drop the clearing and the re-estimate keeps it.
- [x] 2.4 Property: non-scheduling measures never move the schedule — test: 200 random plans,
      schedule digest identical; negative: feed a tokens trio to the solver input and the
      property names a seed.

## 3. Budgets

- [x] 3.1 `work_item_budget` and `setBudget`/`clearBudget`, derived default, subtree bound,
      `exceeded` — test: conformance suite with the three-leaf case; negative: remove the
      subtree fold and the parent reads within budget.
- [x] 3.2 Project-scoped remaining-budget read with holds for unknown spend — test: hold
      reduces remaining and releases on end; negative: drop the hold and two unknown-usage
      attempts both admit.
- [x] 3.3 `cost` basis: currency and rate card digest on estimate and fact; `mixed_rate_cards`
      — test: two digests under one parent refuse naming both; negative: drop the check and
      they sum.

## 4. Surface

- [x] 4.1 Contracts, be-01 routes and MCP tools for the new commands and reads — test: registry
      shape and route tests; negative: remove a refusal mapping and the HTTP test gets 500.
- [ ] 4.2 fe-01 columns per definition with default visibility and per-user toggles — test:
      browser test fresh user versus toggled user; negative: drop the default filter and every
      measure shows.
- [ ] 4.3 fe-01 measure panel per work item — test: fixture with strict and advisory budgets;
      negative: swap the renderings and the test fails.
- [ ] 4.4 Export version, import of older versions, saved plan compare — test: byte round-trip
      and legacy import; negative: drop the version bump and compare misses a measure change.
- [ ] 4.5 CONTEXT.md terms and the WBS docs; `check-indexes` green — test: docs check.
