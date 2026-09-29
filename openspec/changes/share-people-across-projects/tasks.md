## 0. Spec

- [x] 0.1 Intent, four delta specs, design, ADR 0034 and the CONTEXT terms (Booking, Load,
      Overlap, Project rank, Elsewhere, Shared people). `openspec validate --all --json` is
      green.

## 1. Load backend

- [x] 1.1 Red: `workdayOrdinalOf` and `dateOfWorkdayOrdinal` round-trip, and agree with
      `addWorkdays`.
- [x] 1.2 Red: `overlapsOf` (touching, chain, three at once) and `weeklyLoadOf` (union,
      clipping, fractions).
- [x] 1.3 Red: `PersonLoad` over stubbed trees (the displayed engine, `engine_unavailable`,
      a cycle, memo reuse) and mounted over real SQLite (two projects and one overlap, touching
      bookings, undated, restricted, a foreign project omitted, a foreign person 404, the memo
      refreshed after a command).
- [x] 1.4 Red: contracts for both endpoints; window validation (a year, an inverted window,
      malformed dates); mounted routes with organization refusals; route and MCP pins.
- [x] 1.5 Green: domain helpers, `PersonLoad`, shapes, routes, app wiring, MCP pin.
- [x] 1.6 Negatives: `seq` dropped from the memo key → a command then a read serves old
      bookings; revision dropped from the memo key → a start-date or estimate-rule PATCH
      after a warm read serves old bookings; overlap strictness removed → touching bookings reported; readable filter
      removed → a foreign project listed; window cap removed → a year answered.

## 2. Load fe

- [x] 2.1 `/people/:id/load`: one lane per project, overlaps hatched, loading, empty,
      query-failure, undated and unavailable states; a booked/overlapping column in the
      directory.
- [x] 2.2 Negatives: unknown `reason` → query-failure state, not a blank lane; overlap filter
      removed → a touching pair hatched.

## 3. Rank

- [x] 3.1 Table, routes and order; `rank` added to the load reads.
- [x] 3.2 Negatives: composite FK dropped → a foreign project ranks; admin policy removed →
      a member gets 200, not 403; tie rule removed → two reads order equal positions
      differently.

## 4. Domain

- [x] 4.1 `elsewhere` in `schedule()`, the floor, the hash, contract 15 and DTO 3.
- [x] 4.2 Negatives: interval search bypassed on the FS path → a slice overlaps a foreign
      interval; `elsewhere` left out of the hash → a moved booking serves the cached optimized
      result; empty-map corpora stay byte-identical.

## 5. Wire v3, solver-py 0.2.0

- [x] 5.0 Obligations from Fable's review of #250:
  - Thread `elsewhere` (unit-axis scaled) through `materialise-optimized.ts`'s `schedule()` call
    and through `quantisedFastBaseline` (called in `solver-request-pair.ts`), so that the
    publication guard never compares a bookings-aware Fast baseline against a bookings-blind
    optimized plan. Done: both take the plan's bookings; `solver-exit-outcome.ts` and
    `solver-request-pair.ts` pass them.
  - Check whether the `buildSolverRequest` refusal's `throw` is caught around
    `optimization.feature.ts` (~369); prefer a preflight `{ ok: false }`. Moot: wire 3 carries
    bookings, so the refusal is gone; the builder's remaining throws are invariant violations,
    and a booking that pushes the horizon is a preflight input, not a throw.
  - Lift the two slice-4 refusals once wire 3 carries bookings. Done: the wire 2 refusal and the
    pinned-start refusal; a pinned start on a booking now throws
    `ScheduleInvalidOptimizedStartError`.
- [x] 5.1 Wire, model, and Bun re-validation.
- [x] 5.2 Negatives: fixed interval dropped in `model.py` → Bun refuses publication; 0.1.x fed
      v3 → a typed refusal. The ADR 0025 binding is rebuilt by the dev deploy after merge and
      observed there, not in this PR.

## 6. Chain, mode, guard, fan-out

- [x] 6.0 Obligation from Fable's review of #250: thread `elsewhere` into
      `scheduleInputOfCaptured` / `schedulePlanInput` (`saved-plan-schedule.ts`).
      `SCHEDULE_ALGORITHM_ID` stays `slice-leveling-v4` through this slice (Fable's decision).
      Done: both take the bookings, and the saved-plan service asks the plan read's source.
- [x] 6.1 Influencers, the chain read, `shared_people`, the guarded `down.sql`, the rollback CLI,
      `capacityModes`, and `elsewhere_changed`.
- [x] 6.2 Negatives: closure made non-transitive → C behind B behind A takes A's slot; mode
      check removed → an isolated organization moves dates; hash compare removed → a rename
      fans out; vocabulary entry removed → the swap accepts a pre-feature image over a shared
      organization; `engine_unavailable` swallowed → unmarked Fast dates below.

## 7. fe

- [x] 7.1 The `elsewhere` sentence, `waitingElsewhere`, refetch, and the settings switch. Done: the
      plan read carries `waitingElsewhere` and one label per holding work item (`elsewhereHolders`);
      the chart's floor sentence reads "Waits for Ana to finish 010.3 Rewire in Platform";
      `elsewhere_changed` refetches the tree only. Deferred: the settings switch ships with its
      route in slice 8 (a switch with no route is a dead control); fe-01 shows no header count for
      any floor today, so `waitingElsewhere` stays on the wire beside `waitingForPerson` and
      `waitingForCapacity`, which fe-01 omits alike; the sentence is hover text, so it is not a
      link.
- [x] 7.2 Negative: floor kind unmapped → Error Boundary, not a blank card. Done as a holder the
      read does not label: `GanttDataError`, not a sentence blaming nobody.

## 8. Mode route

- [ ] 8.0 Preconditions from Fable's review of slice 6: measure the chain's cost budget (30
      projects sharing ten people, cold ≤ 2 s, warm ≤ 150 ms) before the route ships; and give the
      first project-deletion path (none exists today) an `elsewhere_changed` to the organization's
      other projects.
- [ ] 8.1 `PATCH /api/organization {sharedPeople}`, super-admin only, after 6 and 7 are on main.
- [ ] 8.2 Negative: policy removed → an admin gets 200, not 403.
