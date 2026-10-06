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
      comparison. Storage/downgrade portion merged in PR #265: constrained encoding, strict reads,
      coherent exclusive combined backup, atomic remove/restore, guarded down migration and truthful
      swap capability checks. Intermediate runtime support remains exactly isolated; runtime/cache
      integration, fan-out and activation remain pending.
- [ ] 6.2 Negatives: closure made non-transitive → C behind B behind A takes A's slot; mode
      check removed → an isolated organization moves dates; hash compare removed → a rename
      fans out; vocabulary entry removed → the swap accepts a pre-feature image over a shared
      organization; `engine_unavailable` swallowed → unmarked Fast dates below.

Chain-only negatives proved in slice 6: transitive closure, typed influencer refusal,
coherent snapshot, non-admitting reads, scoped captures and lifecycle cleanup. Remaining
mode runtime/hash-fan-out obligations keep this umbrella unchecked. Storage/swap negatives are
recorded separately in verify.md; they do not establish runtime mode activation.

### Ordered runtime/cache work within 6.1 and its 6.2 proofs

Planning baseline: merged main `8bccd93bc537cffac85b53ea056a79f786558eda`. Implementation
progress remains **17/23**. The steps below refine the existing two unchecked umbrella tasks;
they are not additional completion checkboxes. Steps 6.1a/6.2a are implemented and proved below;
6.1b/6.2b and 6.1c/6.2c are implemented and proved below; 6.1d–f and their paired proofs remain pending. Evidence is recorded by step id in verify.md.

1. **6.1a — Mode-aware coherent read.** Test, then implement strict snapshot mode selection,
   human scope and project-owned background reads around the existing chain capability.
   Test `shared runtime selects mode within its authorized snapshot`: mounted shared A→B
   displacement, byte-identical isolated/legacy input, malformed mode refusal, foreign rows
   excluded and concurrent mode/rank/assignment/date changes seen coherently. **6.2a:** remove
   mode dispatch, scope validation or snapshot ownership independently and watch those production
   cases fail; preserve lifecycle cleanup and read-only connection proofs.
   **6.1a/6.2a complete:** strict target-first mode dispatch, project-owned and borrowed readers;
   observed proof commands and outcomes are recorded in verify.md.
2. **6.1b — Live projection and transactional consumers.** Test, then thread detached rows,
   live revision/sequence, selected schedule, slice holders and optional `waitingElsewhere`
   through tree/export. Extract only the pure projection seam needed; preserve actual/progress/
   measures/local-name behavior and the narrow isolated directory read. Bind arrange and calendar
   preflight to the command transaction. Tests `shared tree and export agree` and
   `shared command preflight sees staged writes`. **6.2b:** replace the borrowed transaction
   with a fresh connection, or omit elsewhere from the live projection, and watch the staged
   refusal/arrangement or displaced-date assertions fail. No solver admission during the read.
   **6.1b/6.2b complete:** coherent live tree and JSON/Markdown export values, snapshot human
   revalidation with typed whole-request refusal, and borrowed staged arrangement/calendar reads;
   independent displacement, borrower, authorization, export-reread and lifecycle proofs in verify.md.
3. **6.1c — Incoming-calendar cache identity.** Test, then derive current shared basis and
   availability before load and space hits. Preserve existing key dimensions and reuse one
   coherent observation for an aggregate response. Tests:
   `warm shared load and space follow an upstream-only edit`,
   `selected upstream publication refreshes a warm cache` and
   `unavailable influencer defeats a warm hit`; target revision/sequence stay fixed. **6.2c:** omit basis
   comparison or availability refusal and observe stale dates. Verify rename/unrelated rank
   edits with unchanged incoming bookings retain basis/input identity and empty calendars retain
   existing canonical bytes.
   **6.1c/6.2c complete:** one authorized aggregate observation supplies current shared basis,
   availability and detached projections before load/space cache hits; mounted warm-read,
   publication, coherence, identity and independent fault evidence is in verify.md.
4. **6.1d — Optimizer admission and Retry.** Test, then route initial live admission, debounce,
   queued restart and Retry through coherent input/settings. Admit only after snapshot close;
   preserve the response's captured display. Test `all optimizer admissions use the shared input`,
   upstream-only `stale-input-hash`, and typed refusal/exception after queue reservation.
   **6.2d:** omit elsewhere, release or snapshot-close ordering independently and observe wrong
   request/hash, a leaked unlaunched slot or admission inside the read. Unexpected exceptions
   throw after cleanup; retain terminal-evidence rules for already launched children.
   **Remaining Retry TDD order (6.1d, then paired 6.2d):**
   1. Add mounted RED cases for upstream-only edits (target revision unchanged) returning the
      current shared hash, and a matching-hash Retry launching the holder-bearing input.
      Implement human-scoped coherent input/settings capture and preserve admission authority.
   2. Add endpoint-schema/client and mounted REDs for 409 `schedule-input-unavailable` with
      `reason` and readable failing `projectId`: required engine-unavailable influencer,
      target cycle and target calendar_range. Assert complete optimizer-state snapshots and
      launcher calls unchanged; no fabricated hash or local-only fallback. Add upstream
      cycle/range cases proving existing skip-bookings behavior still yields target input.
   3. Prove snapshot close precedes Retry admission; revoke human access before capture and
      before the admission write separately. Preserve missing/foreign and unexpected-failure
      distinctions. Do not use the background project-owned capture for the human route.
   4. Independently remove shared-input selection, unavailable refusal, failing-project identity,
      scoped capture recheck and close-before-admission ordering; inject a write on refusal;
      replace upstream skip-bookings with refusal; remove the response-contract variant.
      Watch mounted/typed-client assertions fail for wrong hash/request, wrong refusal or
      leaked identity, changed durable state, admission during read, or invalid response.
      Restore each fault, add adjacent Proof comments and exact command/log evidence. Keep
      this slice pending until all four admission paths and the paired proofs are reviewed.
5. **6.1e — Installed saved/current capture.** Test, then pass scoped shared capture through
   the saved-plan installer and composition root. Test
   `mounted shared save and current retain their own chain`,
   including an upstream edit/delete, immutable saved bytes and target S4
   pending/infeasible/unavailable states. **6.2e:** drop the module binding or use live admission
   during capture and watch missing displacement or changed generation/slot/queue state.
   Preserve the isolated outside-snapshot capture test.
6. **6.1f — Exact cache addresses and release boundary.** Test
   `old-address publication never serves a new shared basis`
   while retaining existing generation/token/cancel/enablement fences
   and outcome/event atomicity. Do not add a detached latest-chain publication guard or change
   blue/green multi-input cache semantics. **6.2f:** omit the current full-key lookup and watch
   the stale optimized schedule return. Rerun cycle/calendar-range/unavailable/transitive and
   undated-bridge regressions, the isolated-only capability CLI and shared-restore refusal.
   Advertising shared must fail the release capability negative. Record all newly introduced
   safety checks' observed failures before the exact-head gate.
   **6.1f/6.2f complete:** captured H1/H2 lookups, old-address outcome/event storage,
   full-key hash-omission RED, physical isolated-only capability and pre-write shared-restore
   refusal with independent watched faults, and retained fence/chain regressions are in verify.md.

### Remaining work after runtime/cache

6.1/6.2 stay open after 6.1a–f: durable `elsewhere_changed` fan-out is a separate implementation
slice. It must cover every booking-changing commit and displayed optimized transition, topology
removals, cold processes, durable replay and crash recovery. It owns atomic displayed-booking
comparison and downstream event evidence around publication; merely storing an old-address
result is not evidence that the current display changed. Prove rename/no-booking-change does
not fan out and affected lower projects do, including removal of a formerly connecting edge.
No booking ledger is introduced. UI 7 and mode route 8 remain required in their stated order.
Trusted activation and live solver image publication/binding installation remain deferred;
this runtime slice provides no setter, activation route or environment override and continues
advertising `['isolated']` and refusing shared restore.

### Ordered durable fan-out slices (6g–6l)

Dependencies: reviewed local 6.1d/e/f checkpoints through
`73264fce66deff231c71b8a14f73da856e5fa811`, then 6g → 6h → 6i → 6j → 6k → 6l.
Each slice starts with its named RED tests, implements the minimum production path, restores
and reruns each watched fault, records exact evidence in verify.md, and receives independent
review before the next slice. Remaining unchecked tasks do not authorize activation/publication.

- [x] 6g. **Projection and recipients only.** Add a core value service/test beside
      `service/shared-people.ts` as `shared-people-fanout.ts` / `shared-people-fanout.test.ts`;
      reuse/extract its pure display selector if needed. Consume
      captured scheduling outcomes, old/new rank-directed graphs and direct causes; return
      canonical bookings/availability comparisons and sorted recipient/cause pairs. RED tests:
      `selected displayed bookings determine fan-out`, `equal hashes retain availability
transitions`, `removed bridge retains old recipients`, `mixed edges invent no path`,
      `multiple causes produce distinct deterministic pairs`, `rename and rank respacing are
silent`, and `isolated and foreign projects receive no shared fan-out`. Include absolute
      fractional intervals, undated bridge, cycle/range skip semantics and required unavailable
      outcomes. R5: substitute Fast, suppress equal-hash availability, omit old graph, traverse
      mixed edges, remove pair deduplication and remove organization/mode guards independently.
      No adapter/event/route binding, DB writes, generation admission or persistent hash state.
- [ ] 6h. **Command/UoW atomicity.** Integrate borrowed before/after capture and transactional
      event recording through `module/plan-commands/composition.ts`, `PlanCommandRunner` and
      `admitted-write.ts`; retain command history and scoped authority. Resolve committed-record
      delivery with composition and `optimizer-trigger-broadcaster.ts` without duplicate record
      or missing post-commit scheduling. RED real SQLite command/undo/redo and mounted command
      tests: `command and downstream events commit together`, `late refusal emits nothing`,
      `cold command fan-out needs no previous read`, `one batch coalesces each cause pair` and
      `capture does not admit optimization`. R5: move recording after commit, move push before
      commit, omit composition binding, call live admission and omit post-commit trigger.
- [ ] 6i. **Rank/settings/directory transactions.** Bind `ProjectRankRepository.moveAfter`,
      admitted project settings/start edits and standalone directory transactions; cover
      working-plan directory writes without duplicate events. RED mounted rank/settings and
      directory service/DB tests: `removed assignment invalidates old closure`, `rank reorder
compares both directions`, `directory edit has causes without project-row edits`,
      `unchanged rename is silent` and `refused resource edit preserves event sequence`.
      R5: omit each binding independently, use only post-write usages, and use a preflight
      topology read instead of the owning transaction's observation.
- [ ] 6j. **Import and final deletion.** Before drain integration, resolve and test synchronous
      transaction ownership for borrowed projection reads (design.md); do not pass async
      callbacks to Drizzle transactions. Bind `module/plan-import/composition.ts` and final
      `optimization-drain.ts::finishDrainIn`, including release/reconcile callers and contract
      retirement. RED import service/mounted and optimization-drain SQLite tests:
      `import and fan-out roll back on event failure`, `final deletion preserves old cause`,
      `release and reconcile complete deletion fan-out`, `retirement changes selected display`
      and `repeated finish records nothing`. R5: omit import binding, record at delete request
      only, drop old closure after delete, omit one release/reconcile path and record outside
      the final transaction. Space membership removal must not masquerade as project deletion.
- [ ] 6k. **Optimized display atomicity.** Resolve the synchronous transaction/projection seam
      before modifying `optimized-outcome.ts`, repository/coordinator or display-changing
      admission/Retry/retirement paths. RED real outcome/event and mounted tests:
      `current selected outcome and fan-out commit together`, `old H1 publication under H2
emits no fan-out`, `nonselected outcome is silent`, `availability changes despite equal
input hash`, `event failure rolls back cache and fan-out`, and `already-recorded outcome
does not fan out twice`. R5: fan out on any insertion, compare only input hash, substitute
      Fast, detach the comparison snapshot and omit the transactional event binding. Retain
      all generation/token/cancellation/enablement and blue/green multi-input proofs.
- [ ] 6l. **Replay and release closure.** RED real event-log/realtime and mounted tests:
      `crash after commit before push replays from a cold process`, `pushRecorded preserves
sequence`, `push failure retains durable event`, `expired replay requires snapshot` and
      `unauthorized subscription cannot replay cause`. R5: skip durable insert, allocate another
      sequence during push, depend on memory-only replay and bypass replay authority separately.
      Rerun full booking-mutation inventory and 6a–f regressions, including physical capability
      CLI and pre-write shared-restore refusal; independently advertise shared and bypass the
      restore guard to observe RED. Record bounds for external engine loss. Exact-SHA canonical
      gate and CI remain required before an integration claim; keep 6.1/6.2 open until their
      full obligations, including remaining UI/activation sequencing, are reconciled.

## 7. fe

- [ ] 7.1 The `elsewhere` sentence, `waitingElsewhere`, refetch, and the settings switch.
- [ ] 7.2 Negative: floor kind unmapped → Error Boundary, not a blank card.

## 8. Mode route

- [ ] 8.1 `PATCH /api/organization {sharedPeople}`, super-admin only, after 6 and 7 are on main.
- [ ] 8.2 Negative: policy removed → an admin gets 200, not 403.
