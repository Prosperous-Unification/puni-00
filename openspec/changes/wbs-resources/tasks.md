## 0. Dany reads R1 to R8

- [ ] 0.1 Dany confirms or amends design.md R1 to R8, in particular R3 (occupancy in WBS,
      per project) and R4 (claim may ask for more). Until then slices 1 and 4 may proceed;
      slice 2 waits for R3 and R4.

## 1. Declaration surface (Claire's item 1; no engine effect)

- [ ] 1.1 Migration `add_resources`: `resource`, `project_resource_capacity`,
      `work_item_resource_demand` with checks (`kind`, `units >= 1`), indexes, guarded
      `down.sql` refusing while rows exist — test: forward, back, refusal; negative watched.
- [ ] 1.2 Directory: `createResource`, `patchResource`, `deleteResource` with `in_use`
      counts and cascade; directory usage lists resources — test: the directory command tests
      mirrored from teams; negative: drop the usage check and a demanded resource deletes.
- [ ] 1.3 `setResourceCapacity` mirroring `setCapacity` (unstated, remembered); `setDemand`
      with `exclusive_demand_is_one`; revision bump, journal, undo — test: command tests on
      both stores through the conformance suite; property: units ≥ 1 always.
- [ ] 1.4 Export and plan document carry resources, capacities, demands (additive, version
      bump); import round trip — test: golden plus a resources fixture.
- [ ] 1.5 fe-01: Resources cell on the row, Resources section in project settings — test:
      rendering tests; eye review per the UI acceptance rule.

## 2. Occupancy on claims (needs slice 1 and the claims change slice 1)

- [ ] 2.1 Domain: extend the claim decision with the demand vector, free units and holders;
      `resources_exhausted`, `below_declared_demand`; one occupancy per leaf; subtree claims
      acquire nothing — test: one case per refusal and scenario; property: free units never
      negative after any sequence of claims and releases (fast-check model run).
- [ ] 2.2 Store: `claim_occupancy (claim_id, resource_id, units)` or units on the claim row
      (decide in 2.1 by the one-occupancy-per-leaf rule), reads per project and resource;
      SQLite and memory; conformance — negative: bypass the in-transaction free-units check
      and two concurrent claims overcommit; watched through the write coordinator race test.
- [ ] 2.3 Commands: `claimWorkItem.resources`, release frees on the last claim, undo/redo —
      test: journal round trips.

## 3. Engines (Claire's items 2 and 3)

- [ ] 3.1 `slicesOf` emits demand vectors; `ScheduleInput`, canonicaliser, hash, contract
      bump; golden corpus no-op proof — test: corpus byte-identical; negative: omit demands
      from the canonical string and an edit serves a stale cached schedule.
- [ ] 3.2 Fast: per-resource pools through `jointWindowFor`/`reserve`; `boundBy` names the
      resource — test: the staging scenario; exclusive serialises.
- [ ] 3.3 CP-SAT: wire bump, one `AddCumulative` per resource, re-validator, fixtures in both
      suites, materialiser proof — test: parity with Fast on the fixtures.
- [ ] 3.4 fe-01: hover sentence and facet.

## 4. Assignee management

- [x] 4.1 `assignSubtree` with undo — test: the five-leaf scenario; negative: drop the
      previous-assignee capture and undo loses them.
- [x] 4.2 By-person read, descriptor, route, viewer policy, MCP by derivation — test: route
      tests; tool count moves by one.
- [x] 4.3 `claimWorkItem.assign` — test: claim-and-assign and its undo.

## 5. Startable fit

- [ ] 5.1 Free units and fit in the startable read; steps apart with shortfall — test: the
      one-fits-one-does-not scenario.

## 6. Operator (not code)

- [ ] 6.1 Declare the dev hosts' resources and the PUNI plan's capacities; set demands on
      the leaves the fleets will claim; recorded as applied batches in puni-plan.
