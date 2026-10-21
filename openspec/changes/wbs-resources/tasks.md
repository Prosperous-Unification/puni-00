## 0. Dany reads R1 to R8

- [ ] 0.1 Dany confirms or amends design.md R1 to R8, in particular R3 (occupancy in WBS,
      per project) and R4 (claim may ask for more). Until then slices 1 and 4 may proceed;
      slice 2 waits for R3 and R4.

## 1. Declaration surface (Claire's item 1; no engine effect)

- [x] 1.1 Migration `add_resources`: `resource`, `project_resource_capacity`,
      `work_item_resource_demand` with checks (`kind`, `units >= 1`), indexes, guarded
      `down.sql` refusing while rows exist — test: forward, back, refusal; negative watched.
- [x] 1.2 Directory: `createResource`, `patchResource`, `deleteResource` with `in_use`
      counts and cascade; directory usage lists resources — test: the directory command tests
      mirrored from teams; negative: drop the usage check and a demanded resource deletes.
- [x] 1.3 `setResourceCapacity` mirroring `setCapacity` (unstated, remembered); `setDemand`
      with `exclusive_demand_is_one`; revision bump, journal, undo — test: command tests on
      both stores through the conformance suite; property: units ≥ 1 always.
- [x] 1.4 Export and plan document carry resources, capacities, demands (additive, version
      bump); import round trip — test: golden plus a resources fixture. Done as plan
      document v10 on `feat/wbs-resources-declaration`; `verify.md` "Slice 1" has the
      commands, counts and proofs, and what this slice leaves open (undo of a delete and a
      duplicate do not carry demands yet; fe-01 is 1.5).
- [ ] 1.5 fe-01: Resources cell on the row, Resources section in project settings — test:
      rendering tests; eye review per the UI acceptance rule.

## 2. Occupancy on claims (needs slice 1 and the claims change slice 1)

- [x] 2.1 Domain: extend the claim decision with the demand vector, free units and holders;
      `resources_exhausted`, `below_declared_demand`; one occupancy per leaf; subtree claims
      acquire nothing — test: one case per refusal and scenario; property: free units never
      negative after any sequence of claims and releases (fast-check model run). Done in
      `occupancy.ts` (`refuseOccupancy` is the one check) and `decideClaim`; "first claim on
      a leaf" is recorded by copying the leaf's vector onto every claim row (see verify.md).
- [x] 2.2 Store: `claim_occupancy (claim_id, resource_id, units)` (decided in 2.1: one row per
      claim and resource, every claim of a leaf carrying the leaf's vector, a leaf holding the
      largest copy), reads per project and resource; SQLite and memory; conformance —
      negative: bypass the in-transaction free-units check and two concurrent claims
      overcommit; watched through the write coordinator race test
      (`claim-occupancy-race.db.test.ts`).
- [x] 2.3 Commands: `claimWorkItem.resources`, release frees on the last claim, undo/redo —
      test: journal round trips (`resource-occupancy.db.test.ts`, both stores).

## 3. Engines (Claire's items 2 and 3)

- [x] 3.1 `slicesOf` emits demand vectors; `ScheduleInput`, canonicaliser, hash, contract
      bump; golden corpus no-op proof — test: corpus byte-identical; negative: omit demands
      from the canonical string and an edit serves a stale cached schedule. Done on
      `feat/wbs-resource-levelling`: scheduler contract 17, cache DTO 4; both corpora moved
      their version line only; `verify.md` "Slice 3".
- [x] 3.2 Fast: per-resource pools through `jointWindowFor`/`reserve`; `boundBy` names the
      resource — test: the staging scenario; exclusive serialises. The binding resource is
      `capacityResource { resourceId, units }` beside `boundBy: 'capacity'`.
- [x] 3.3 CP-SAT: wire bump, one `AddCumulative` per resource, re-validator, fixtures in both
      suites, materialiser proof — test: parity with Fast on the fixtures. Solver wire 4,
      `wbs-solver` 0.3.0.
- [ ] 3.4 fe-01: hover sentence and facet. The sentence half is done on
      `feat/wbs-resource-levelling` (the chart and the table's start reason name the resource
      and its units from the tree read's `resourceLabels`); the per-resource facet is open:
      the tree read carries no demands to filter rows by.

## 4. Assignee management

- [x] 4.1 `assignSubtree` with undo — test: the five-leaf scenario; negative: drop the
      previous-assignee capture and undo loses them.
- [x] 4.2 By-person read, descriptor, route, viewer policy, MCP by derivation — test: route
      tests; tool count moves by one.
- [x] 4.3 `claimWorkItem.assign` — test: claim-and-assign and its undo.

## 5. Startable fit

- [x] 5.1 Free units and fit in the startable read; steps apart with shortfall — test: the
      one-fits-one-does-not scenario. Done in `findStartableWork` (`doesNotFit`, `resources`,
      `occupancyScope`), reusing `refuseOccupancy`; unstated capacities are not listed (see
      verify.md, slice 5).

## 6. Operator (not code)

- [x] 6.1 Declare the dev hosts' resources and the PUNI plan's capacities; set demands on
      the leaves the fleets will claim; recorded as applied batches in puni-plan.
