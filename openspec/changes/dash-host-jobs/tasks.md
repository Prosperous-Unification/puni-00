## 0. Dany reads J1 to J18 and the placement

- [x] 0.1 Dany, 2026-11-01: "go with your assumptions for now". J1 to J18, J2' and the placement
      stand as decided until he overturns one by id; slices proceed in order 1, 2, 3, 4, 5, 6,
      one PR each into `plan/dash-host-jobs`, Fable review per slice, an h2puni gate before the
      plan reaches main.

## 1. Catalogue and rule (static; no host change)

- [ ] 1.1 `infra/jobs/catalogue.json` with the four types of this repository (J2, J14) and
      `infra/jobs/README.md` naming the fields, the provisional heuristics of J9 and the
      `propose` → PR loop; each entrypoint script gains one comment naming its catalogue id;
      `puni-pr-00` gets its own catalogue with `website-dev-build` in a companion PR — test: the
      catalogue parses with the shared ArkType shape; an argv outside the argument profile is
      refused.
- [ ] 1.2 Burokrat rule `JOB-CATALOGUE` in observe mode through the existing rule framework:
      malformed entry, duplicate id, absent entrypoint, expired estimate against the supplied
      instant, envelope below calibrated p95, unbounded containers — test: one fixture per
      failure; negative: drop the `until` comparison and the 2026-12-02 fixture passes.
- [ ] 1.3 Twilight glossary terms (J1), the names page note that a host pool is a capacity
      pool of one host, platform-map lines for reconciliation items 4, 8, 14 and 16, and the
      refactoring queue's heavy-lock item marked closed-for-enrolled-hosts.

## 2. Ledger extension and admission (needs 1.1; `src/resources/runtime.ts`)

- [x] 2.1 Extend the managed-resource ledger and configuration with `cpuCores` and `memoryGib`
      budgets and typed headroom, named exclusive units (distinct canonical paths), the pool
      mode and enrollment identity, and the use kind `host_job` admitted host-locally (J4, J5)
      — test: `ops pool init` refuses an existing ledger, a readable-by-others config, a budget
      above `MemTotal`, duplicate unit paths; an existing worktree use and a host job reserve
      from one vector; negative: drop the host-local path and watch the gate wait on a refusing
      WBS fixture. Done on `ResourceRuntime.initialize`, which `resources init` calls; the
      `ops pool init|inspect` spelling arrives with slice 3's `ops` namespace (verify.md
      Slice 2, A13).
- [x] 2.2 Admission: vector fit, exclusive units, exit 73, oldest-fitting-first with atomic
      overtake counting and the oldest barrier, deadlines, wait-zero refusal, dead-ticket
      reclaim (J5, J6) — test: the spec scenarios; `fc.asyncModelRun` over admissions, exits,
      deadline crossings, cancellations, simultaneous contenders, several barriers, calibration
      and crashes from several processes, with sabotage proofs (drop `BEGIN IMMEDIATE`, drop the
      unit check, drop the barrier, release on launcher death) each watched red before the slice
      lands (J18).
- [x] 2.3 Settlement per reservation entry with terminal evidence (J2'): process group terminal
      through the runtime's pidfd and `/proc` inspection, declared containers gone, tmp
      directory verified removed, `gate_tree` verified at its resting commit and clean; one
      transaction with the outbox event — test: the surviving-child and dirty-tree scenarios;
      negative: settle memory on exit code alone and watch the surviving-child test admit over it.

## 3. Measured runs (needs 2)

- [ ] 3.1 `ops job run`: scope through the runtime's FD-gated launch, counters read and identity
      persisted before the gate opens, `MemoryHigh`/`MemoryMax`, private `TMPDIR`, the
      environment of J7, ten-second samples, observation boundary alive through the final
      sample and durable record, telemetry and ledger-write failures recorded apart, exit code
      pass-through, 128 + signal — test: a real scope on the Linux runner reading its own
      `memory.peak`; a one-second payload; negative: stub `systemd-run` answering "Failed to
      connect to bus" and watch exit 70 before the payload (J8); make `memory.peak` unreadable
      at the gate and watch 70; tear the scope down early and watch the recording failure.
- [ ] 3.2 Declared container bounds (J16): labelled and bounded containers sampled through the
      docker adapter's reading as advisory evidence; unlabelled or unbounded starts during the
      window recorded `attribution_incomplete` — test: a real short-lived bounded container and
      an unbounded one against a local daemon; negative: drop the bound check and the unbounded
      run counts as complete.
- [ ] 3.3 `ops job status` (J13) — test: the one-running-one-waiting scenario, exact lines,
      settlement state shown.

## 4. Calibration, proposal, audit (needs 3)

- [ ] 4.1 `ops job calibrate` (drain, whole `allocatable`, no `MemoryHigh`, calibration record)
      and `ops job propose` (nearest-rank p95 per dimension over complete comparable records,
      throttled runs excluded from memory, three-calibration minimum, 1.25, record ids) — test:
      the spec scenarios; negative: lower the minimum to one and watch the refusal test fail;
      include a throttled run and watch the proposal drop.
- [ ] 4.2 `ops job audit` with the four drift kinds, overruns kept until superseded, and the
      weekly timer units rendered beside the observation units — test: one fixture per kind,
      `no drift` on a clean ledger; negative: age overruns out after five runs and the
      eight-runs-later fixture passes.

## 5. WBS projection (needs 2; contracts, be-01, fe-01, Dash compute)

- [ ] 5.1 `reservedUnits` on the capacity report (additive migration with `down.sql`), the
      `host_pool` binding source in `report-capacity` reading the ledger, re-observed on the
      ledger's change notification — test: reporter test with a fixture ledger; a pre-change body
      still stored; negative: let reservations overwrite `usageUnits` and watch the
      reserved-beside-measured scenario fail.
- [ ] 5.2 `resourceRuntimeUse` v2 with `kind: 'host_job'`, optional planning links, authority
      ownership and reservation entries; `registered` from the outbox after admission,
      `release_verified` only with settlement evidence; deletion of a planning link keeps the use
      (J10) — test: the WBS-down scenario against a refusing fixture server; a v1 use still
      accepted; negative: require a planning link and watch a gate without one fail to register.
- [ ] 5.3 fe-01: reserved units and job names beside the measured figure, states unchanged —
      test: rendering states; eye review per the UI acceptance rule.

## 6. Transition on the gate hosts (operator and code)

- [ ] 6.1 `run_heavy_job` in `bin/heavy-lock-lib.sh` (J12, J13): enrolled branch, type required,
      fixed path, config-missing-beside-ledger is 70, budgets forwarded as flags, outer shell
      returning status; the four launchers here and `puni-pr-00`'s `build-release.sh` call it —
      test: new `bin/heavy-lock.test.sh` cases for the enrolled branch; every existing case
      passes unchanged against `with_heavy_lock`; the gate's trap-runs-once scenario; negative:
      let a variable choose the mechanism and watch the opt-out case fail.
- [ ] 6.2 Five-launcher conflict inventory (J3): canonical paths, ports, release artifacts,
      caches, build engines, cross-type pairs; each conflict isolated or an exclusive unit; the
      gate split into outer launcher and admitted payload reading `DASH_JOB_UNIT_GATE_TREE`
      (J15); the solver smoke's containers bounded and labelled (J16) — test: two gates and a
      gate beside a release build driven concurrently against real launchers with distinct
      trees; negative: remove the tree variable and watch the enrolled payload refuse 64.
- [ ] 6.3 `gate_host` role: linger on, pool config, ledger directory, second gate tree,
      `validate` runs `ops job audit`; h2puni disk cleaned first per the recorded order — proof:
      two converging applies, `changed=0` on the second.
- [ ] 6.4 Enroll h2puni and h4claw in observe mode; run every launcher through `run_heavy_job`
      for a week; calibrate the five types cold and warm; open the catalogue PRs from `propose`.
- [ ] 6.5 `ops pool switch-mode concurrent` on each host after the five-launcher checklist,
      with the singleton guard held; two-job concurrent validation recorded in `verify.md`
      (planned proofs apart from observed evidence); decide when a failing `JOB-CATALOGUE`
      blocks `ops job run`; update `docs/runbook-h2-heavy-lock-owner.md`,
      `docs/infra/gate-hosts.md`, `AGENTS.md` Gate and `LLM_README.md`.
