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
    optimized plan.
  - Check whether the `buildSolverRequest` refusal's `throw` is caught around
    `optimization.feature.ts` (~369); prefer a preflight `{ ok: false }`.
  - Lift the two slice-4 refusals once wire 3 carries bookings.
- [x] 5.1 Wire, model, and Bun re-validation.
- [x] 5.2 Negatives: fixed interval dropped in `model.py` → Bun refuses publication; 0.1.4 fed
      v3 → a typed refusal; non-disruptive ADR 0025 preparation/binding tests pass.
      Live image publication and binding installation are deferred until merged integration
      by coordinator instruction, because installation restarts the shared prod/dev supervisor.

## 6. Chain, mode, guard, fan-out

- [x] 6.0 Obligation from Fable's review of #250: thread `elsewhere` into
      `scheduleInputOfCaptured` / `schedulePlanInput` (`saved-plan-schedule.ts`).
      `SCHEDULE_ALGORITHM_ID` stays `slice-leveling-v4` through this slice (Fable's decision).
- [ ] 6.1 Influencers, the chain read, `shared_people`, the guarded `down.sql`, the rollback CLI,
      `capacityModes`, and `elsewhere_changed`.
      Chain-reader portion implemented in slice 6: directed influencers, coherent read-only snapshot,
      displayed booking projection, whole-schedule calendar preflight and shared saved capture/current
      comparison. Mode storage,
      guarded rollback, capacity vocabulary and fan-out remain pending.
- [ ] 6.2 Negatives: closure made non-transitive → C behind B behind A takes A's slot; mode
      check removed → an isolated organization moves dates; hash compare removed → a rename
      fans out; vocabulary entry removed → the swap accepts a pre-feature image over a shared
      organization; `engine_unavailable` swallowed → unmarked Fast dates below.

Chain-only negatives proved in slice 6: transitive closure, typed influencer refusal,
coherent snapshot, non-admitting reads, scoped captures and lifecycle cleanup. Remaining
mode/hash-fan-out/swap vocabulary obligations keep this umbrella unchecked.

## 7. fe

- [ ] 7.1 The `elsewhere` sentence, `waitingElsewhere`, refetch, and the settings switch.
- [ ] 7.2 Negative: floor kind unmapped → Error Boundary, not a blank card.

## 8. Mode route

- [ ] 8.1 `PATCH /api/organization {sharedPeople}`, super-admin only, after 6 and 7 are on main.
- [ ] 8.2 Negative: policy removed → an admin gets 200, not 403.
