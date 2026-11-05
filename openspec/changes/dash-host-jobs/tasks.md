## 0. Dany reads J1 to J18 and the placement

- [x] 0.1 Dany, 2026-11-01: "go with your assumptions for now". J1 to J18, J2' and the placement
      stand as decided until he overturns one by id; slices proceed in order 1, 2, 3, 4, 5, 6,
      one PR each into `plan/dash-host-jobs`, Fable review per slice, an h2puni gate before the
      plan reaches main. Gate done 2026-11-02: `h2puni gate: running on 5061911cf…` (the content
      of plan head 27f3205fa), `GATE-EXIT 0`, every step green including `wbs-be-01:solver-image-smoke`;
      record in verify.md "Plan-head gate on h2puni".

## 1. Catalogue and rule (static; no host change)

- [ ] 1.1 `infra/jobs/catalogue.json` with the four types of this repository (J2, J14) and
      `infra/jobs/README.md` naming the fields, the provisional heuristics of J9 and the
      `propose` → PR loop; each entrypoint script gains one comment naming its catalogue id;
      `puni-pr-00` gets its own catalogue with `website-dev-build` in a companion PR — test: the
      catalogue parses with the shared ArkType shape; an argv outside the argument profile is
      refused.
- [x] 1.2 Burokrat rule `JOB-CATALOGUE` in observe mode through the existing rule framework:
      malformed entry, duplicate id, absent entrypoint, expired estimate against the supplied
      instant, envelope below calibrated p95, unbounded containers — test: one fixture per
      failure; negative: drop the `until` comparison and the 2026-12-02 fixture passes.
- [x] 1.3 Twilight glossary terms (J1), the names page note that a host pool is a capacity
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

- [ ] 2.4 Follow-up (seen in slice 6c's full `twilight-dash:test`): `host-jobs.test.ts`'s
      `a replaced tmp directory or symlink stays charged and untouched` failed once under
      full-suite load (expected `blocked`, received `released`), then passed alone three times.
      `rmdir` then `mkdir` can reuse the inode, so a tmp directory's device and inode identity
      does not prove it is the original. The identity should include ctime or birth time, or a
      content marker — test: replace the directory with one that reuses the inode; negative:
      compare dev and inode only and watch the replacement be released.

## 3. Measured runs (needs 2)

- [x] 3.1 `ops job run`: scope through the runtime's FD-gated launch, counters read and identity
      persisted before the gate opens, `MemoryHigh`/`MemoryMax`, private `TMPDIR`, the
      environment of J7, ten-second samples, observation boundary alive through the final
      sample and durable record, telemetry and ledger-write failures recorded apart, exit code
      pass-through, 128 + signal — test: a real scope on the Linux runner reading its own
      `memory.peak`; a one-second payload; negative: stub `systemd-run` answering "Failed to
      connect to bus" and watch exit 70 before the payload (J8); make `memory.peak` unreadable
      at the gate and watch 70; tear the scope down early and watch the recording failure.
      Proven on the workstation and, through the fake scope seam, on any Linux runner; host-proven
      only once slice 6 runs it on h2puni (the gate hosts run systemd 259 and the `(sd-pam)` and
      `sshd-session` processes review F1 found). Follow-up: settlement still runs `git status`
      and a synchronous `docker ps` inside the ledger's write lock; move those reads before the
      transaction and re-check identities inside it (review F6; the launcher now polls once a
      second). Follow-up: `cli.ts` loads every command module before dispatch, so a delegated
      command's usage refusal and `ops job run` itself pay about 3 to 5 s of imports (the
      resource runtime and `@wbs/contracts` about 3 s, the activation store about 2 s,
      measured 2026-11-02); import each handler's module lazily, keeping the dispatcher
      canaries (review R6).
- [x] 3.2 Declared container bounds (J16): labelled and bounded containers sampled through the
      docker adapter's reading as advisory evidence; unlabelled or unbounded starts during the
      window recorded `attribution_incomplete` — test: a real short-lived bounded container and
      an unbounded one against a local daemon; negative: drop the bound check and the unbounded
      run counts as complete. The reading is `src/ops/containers.ts` over the compute module's
      exported client helpers: the docker adapter's parsers are module-private and
      `src/compute` belonged to slice 5's worker (verify.md Slice 3, S3-A9). `watch` still
      settles a declared-bound job with `declaredContainersOnly` (S3-A10).
- [x] 3.3 `ops job status` (J13) — test: the one-running-one-waiting scenario, exact lines,
      settlement state shown. The scenario's `with-heavy-lock.sh status` half landed with
      slice 6b's observe mode: `ops job status` prints the shell lock's own lines, holder
      `dash-job-<id> <label>` first (verify.md Slice 6b; S3-A12 resolved).

## 4. Calibration, proposal, audit (needs 3)

- [x] 4.1 `ops job calibrate` (drain, whole `allocatable`, no `MemoryHigh`, calibration record)
      and `ops job propose` (nearest-rank p95 per dimension over complete comparable records,
      throttled runs excluded from memory, three-calibration minimum, 1.25, record ids) — test:
      the spec scenarios; negative: lower the minimum to one and watch the refusal test fail;
      include a throttled run and watch the proposal drop. Calibration admission is a
      `calibration` flag on the runtime's host-job request and use (`runtime.ts`: drain fit,
      whole-vector reservation, every unit), not a second path; records gain `calibration` and
      a `toolchain` (`bun <version>+<revision>`). `propose` prints the replacement entry, not a
      JSON patch; duration is reported but has no catalogue field (verify.md Slice 4, S4-A1 to
      S4-A7). Review fixes (#814): each host job persists its `reserved` vector, a
      calibration holds every unit of its type's ids only (S4-A14), and the model generates
      calibrations (J18). Follow-up after #811: slice 5's `hostJobDeclaration` reads
      `job.reserved` and groups `job.units` by exclusive id.
- [x] 4.2 `ops job audit` with the four drift kinds, overruns kept until superseded, and the
      weekly timer units rendered beside the observation units — test: one fixture per kind,
      `no drift` on a clean ledger; negative: age overruns out after five runs and the
      eight-runs-later fixture passes. Units: `ops job render-audit-units` writes the systemd
      user service and weekly timer; installing them is the operator step in
      `docs/resources.md`. Nothing was installed on a host (S4-A8 to S4-A11).

## 5. WBS projection (needs 2; contracts, be-01, fe-01, Dash compute)

- [x] 5.1 `reservedUnits` on the capacity report (additive migration with `down.sql`), the
      `host_pool` binding source in `report-capacity` reading the ledger, re-observed on the
      ledger's change notification — test: reporter test with a fixture ledger; a pre-change body
      still stored; negative: let reservations overwrite `usageUnits` and watch the
      reserved-beside-measured scenario fail.
- [x] 5.2 `resourceRuntimeUse` v2 with `kind: 'host_job'`, optional planning links, authority
      ownership and reservation entries; `registered` from the outbox after admission,
      `release_verified` only with settlement evidence; deletion of a planning link keeps the use
      (J10) — test: the WBS-down scenario against a refusing fixture server; a v1 use still
      accepted; negative: require a planning link and watch a gate without one fail to register.
- [ ] 5.3 fe-01: reserved units and job names beside the measured figure, states unchanged —
      test: rendering states; eye review per the UI acceptance rule. Code and rendering tests
      landed in slice 5 (verify.md Slice 5, S5-A16); open only for Dany's eye review.

## 6. Transition on the gate hosts (operator and code)

- [x] 6.1 `run_heavy_job` in `bin/heavy-lock-lib.sh` (J12, J13): enrolled branch, type required,
      fixed path, config-missing-beside-ledger is 70, budgets forwarded as flags, outer shell
      returning status; the four launchers here and `puni-pr-00`'s `build-release.sh` call it —
      test: new `bin/heavy-lock.test.sh` cases for the enrolled branch; every existing case
      passes unchanged against `with_heavy_lock`; the gate's trap-runs-once scenario; negative:
      let a variable choose the mechanism and watch the opt-out case fail. Done for the four
      launchers here (cases 40 to 45; verify.md Slice 6a); `puni-pr-00`'s `build-release.sh` is
      owed by that repository. Observe mode itself (a Dash job under the complete shell-lock
      protocol, one wait budget) and the concurrent-mode singleton guard are Dash's side and
      landed in slice 6b: `ops job run` queues through the library's own `with_heavy_lock`
      (verify.md Slice 6b, S6B-A1). The fixed pool root `/home/puni1/.local/share/dash/host-pool`
      is what 6.3's role must write (S6-A1).
- [x] 6.2 Five-launcher conflict inventory (J3): canonical paths, ports, release artifacts,
      caches, build engines, cross-type pairs; each conflict isolated or an exclusive unit; the
      gate split into outer launcher and admitted payload reading `DASH_JOB_UNIT_GATE_TREE`
      (J15); the solver smoke's containers bounded and labelled (J16) — test: two gates and a
      gate beside a release build driven concurrently against real launchers with distinct
      trees; negative: remove the tree variable and watch the enrolled payload refuse 64. The
      inventory is `docs/infra/heavy-job-launchers.md`; the concurrency test is
      `src/ops/launchers.test.ts` (namespace, fake scope). Still serialised by J16 until bounded
      and labelled: the supervisor's managed solver containers, the orphan proc tests, Caddy in
      `mcp-body-limit.test.ts`; `dagger_engine` needs a token Git tree unit until Dash has a
      non-tree unit kind (S6-A7).
- [x] 6.3 `gate_host` role: linger on, pool config, ledger directory, second gate tree,
      `validate` runs `ops job audit`; h2puni disk cleaned first per the recorded order — proof:
      two converging applies, `changed=0` on the second, on both hosts, 2026-11-05; verify.md
      "2026-11-05 token-unit apply converged on both hosts".
- [x] 6.3a Code (slice 6c): the role turns linger on, creates the empty fixed pool root and
      `~/.config/dash`, the `dagger_engine` token unit and two more full clones with one frozen
      install each, `~/puni-00-gate-tbf2` (the second `gate_tree`) and the launcher-only
      `~/puni-00-gate-launcher`. It refuses to clone below 5 GiB free per missing checkout plus
      10 GiB. It writes `host-pool.json` only where `puni_gate_host_pool_enroll` is true, since
      the file enrolls the host. `validate` reads linger, the checkouts, the token unit, the
      configuration's mode, owner and shape, and the units, then runs `ops pool inspect` and
      `ops job audit` once a ledger exists. No host was touched; the apply, the h2puni cleanup
      and the converging proof stay in 6.3 (verify.md Slice 6c, S6C-A1 to S6C-A25).
  - [x] 6.3b h2puni sudo exception (2026-11-04, H2-A1): `puni1` on h2puni has passwordless
        sudo, which the dev poller and monitoring scripts use, so validate's no-sudo assertion
        would fail every apply. `puni_gate_account_may_sudo` (default false, set only on h2puni
        in the inventory) swaps it for an assertion requiring the state the strict check would refuse (the `sudo` group or
        `sudo -n` succeeding), so a stale
        exception fails. Debt: the gate-host isolation property does not hold on h2puni until
        those callers leave `puni1` and the flag is removed (verify.md, "2026-11-04 h2puni
        apply, blocked"). The delta MODIFIES the `gate-host` requirement that only the
        unarchived `gate-host-role` change defines, so archive `gate-host-role` before this
        change or the archive refuses the delta.
  - [x] 6.3c Authorized keys one per line (2026-11-04, H2-A7): apply 1 on h2puni wrote the
        five keys as one line and locked out all callers but the first; the role now renders
        `authorized_keys.j2` to a staged file, counts its `ssh-keygen -lf` fingerprints against
        the list before installing it, validate repeats the count on the live file, and
        `~/.cache` stays 0700 (verify.md, "2026-11-04 h2puni apply 1 — authorized_keys
        incident (H2-A7)").
  - [x] 6.3d Operator half on `main` `149e6e85b` (2026-11-05): h2puni converged (apply 1
        `changed=1`, apply 2 `changed=0`, validate `failed=0`), and h4claw was re-applied with the
        same numbers. Both stay unenrolled (verify.md, "2026-11-05 role converged on both hosts").
  - [x] 6.3e `docker_build` token unit and h2puni's launcher checkouts (PR #869): the role creates and validates a second token unit
        `~/.local/share/dash/units/docker_build` and lists it in `exclusiveUnits`, because
        puni-pr-00's `website-dev-build` declares it; h2puni's inventory sets
        `puni_gate_pool_launcher_checkouts` to the launcher checkout and `~/wbs-dev/src`. Applied
        at `main` `5150237fc` on h2puni and then h4claw (2026-11-05): apply 1 `changed=1` for the
        new unit only, apply 2 `changed=0`, validate `failed=0`; both still unenrolled, so
        `ops pool init`, which pins the unit list, comes after (verify.md, "2026-11-05 token-unit
        apply converged on both hosts").
- [ ] 6.7 A user-level systemd unit for `twilight-dash resources watch` on each gate host with
      `Restart=on-failure` and `KillMode=process` (beside the observation units of 4.2). It
      lands before 6.4, because observe mode needs a running `watch` (review H1 of #818). A host
      job whose compute outlives its launcher keeps the shell lock until `watch`, or an
      operator's `resources sweep`, removes its hold file. The concurrent-mode guard's holder
      must outlive a restarted `watch`, which the default `KillMode=control-group` would kill
      (S6B-A8). A `watch` stopped by a refusal past the host-job retry bound (S5-A20), or by any
      other modelled stop, must come back, so the outbox and cleanup-request pulls do not
      stall. The deploy order (WBS before Dash) is in
      `apps/twilight-structure/twilight-dash/cli/docs/resources.md`. Proof: kill the process and
      watch systemd restart it with the guard holder surviving; a converging `gate_host` apply
      reports `changed=0` the second time.
- [x] 6.7a Code (slice 6c): the role installs `dash-resources-watch.service`
      (`Restart=on-failure`, `RestartSec=30`, `KillMode=process`, skipped until the ledger
      exists) and the audit pair `ops job render-audit-units` renders. It enables them on an
      enrolled host and never starts them. The restart proof on a host stays in 6.7
      (verify.md Slice 6c).
- [ ] 6.4 Enroll h2puni and h4claw in observe mode, **only once 6.7's `watch` unit is installed
      and running on that host** (an observe-mode hold left by a dead launcher is released by
      `watch` or `resources sweep`, nothing else); run every launcher through `run_heavy_job`
      for a week; calibrate the five types cold and warm; open the catalogue PRs from `propose`.
      During the first observe-mode gates, measure the peak memory and CPU of the solver smoke's
      four bounded containers (`wbs-solver`, `registry:2`, the two clients; `docker stats` through
      the run record's container samples) before any type runs with `enforcement: cap`: their
      `--memory 1g --cpus 1` is the declared `gate` bound, applied only inside a Dash job and not
      yet measured (slice 6a review F4).
- [x] 6.5a Code (slice 6b): `ops pool switch-mode concurrent|observe`, with `--release-guard`
      and `--allow-empty`: the intake fence on new tickets (queued ones keep their place,
      S6B-A16), the pool and shell-lock drain, launcher shim verification (library, `bin/`
      clean, every `bin/*.sh` entrypoint calling `run_heavy_job`), the atomic flip with its
      operator record; the `resources watch` singleton guard, with the guard re-checked before
      launch and a lost guard marking the running jobs `attribution_incomplete`. In concurrent
      mode a job is admitted beside unreleased **compute** only when its type and every
      running type are in `concurrencyEligible`. Tree and tmp entries still charged do not
      count, since a job whose compute has settled is no longer running. An id that no
      launcher catalogue names is refused **64 at init and at every open**. Mode, guard,
      eligibility and the shell lock appear in `status` and `inspect` (verify.md Slice 6b).
- [ ] 6.5 Operator: `ops pool switch-mode concurrent` on each host after the five-launcher checklist,
      with the singleton guard held; two-job concurrent validation recorded in `verify.md`
      (planned proofs apart from observed evidence); decide when a failing `JOB-CATALOGUE`
      blocks `ops job run`; update `docs/runbook-h2-heavy-lock-owner.md`,
      `docs/infra/gate-hosts.md`, `AGENTS.md` Gate and `LLM_README.md`. The per-type
      concurrency flag the switch relies on (slice 6a review F3) is implemented in slice 6b
      (6.5a): `host-pool.json`'s `concurrencyEligible`, default `[]`, refused **64 at init and
      at every open** for an id no launcher catalogue names (S6B-A17, S6B-A22). `gate` and
      `test-queued` stay unlisted until their J16 gaps and their shared checkout `.nx` cache
      are covered (`docs/infra/heavy-job-launchers.md`).
- [x] 6.6 Uninspectable same-user processes outside host jobs (review F1): hold inspection
      refuses any same-user process whose `/proc/<pid>/fd` is access-denied. Host-job settlement
      now records such a process outside the job's scope as `uninspectable_outside_scope`, but
      worktree cleanup and `ops pool init`'s unit check still throw `cannot inspect process PID`
      on every host where `(sd-pam)` or `sshd-session` runs as the account, which is every host
      with a user manager. Decide their rule (a worktree use has no scope to compare against),
      then prove it outside a namespace before slice 6 enrolls h2puni: `ops pool init` there
      refuses until this is done. Done by J19 (design.md): `resource-holds.test.ts` outside any
      namespace; `ops pool init` now succeeds beside this workstation's own `systemd --user`
      (PID 2327) and `(sd-pam)` (verify.md Slice 6a).
- [x] 6.9 A user timer that keeps `~/puni-00-gate-launcher` fresh (`git fetch` and
      `checkout --detach origin/main` while no job runs from it, then a watch restart); until it
      lands that is a manual operator step (`docs/infra/gate-hosts.md`, S6C-A20) — test: the
      timer refuses while a job launched from the checkout runs. Done (S6D-A4 to S6D-A7):
      `gate-launcher-refresh.timer` runs `bin/gate-launcher-refresh.sh`; proof: with its refusal
      removed, `gate-launcher-refresh.test.sh` case 1 moved the checkout under a working process
      (`want exit 75, got 0`). Owed: one converging role apply per host installs the refresh units;
      the timer is enabled at enrollment (step 5).
- [x] 6.10 A nested `run_heavy_job` inherits the outer job's `HEAVY_LOCK_LABEL`: a `test:queued`
      or solver publish started inside an admitted gate payload is labelled as the gate, on the
      legacy lock and in Dash alike (found by slice 6c's h2puni gate on 37ca6254a, where
      `launchers.test.ts` saw `--label gate:37ca6254`). `run_heavy_job` should refuse a nested
      call, or re-label it `<outer label>/<own type>` when `DASH_JOB_ID` is already set — test:
      a launcher run inside a fake admitted job records the derived label; negative: drop the
      check and watch it record the outer label. Done (S6D-A1): `run_nested_heavy_job` re-labels a
      type without exclusive units and refuses 70 one with units or outside its job's scope; proof:
      with the branch removed, case 49a got `gate:abc` and Dash's `--label gate:abc`.
  - [ ] 6.10a Check admission, not only placement: the scope check passes a same-account
        `systemd-run --user --scope --unit dash-job-<id>` (review of #873). Ask the ledger for a
        running job with that id before running nested — test: a fake scope of that name with no
        such job is refused.
- [ ] 6.8 Replace S5-A11's ledger-row settlement digest with the run record's: the run record
      (slice 3, #809) carries `descriptorDigest` and no durable locator, so this needs a locator
      for the run record and a decision on which digest WBS keeps — test: a returned host job's
      evidence names the run record; negative: send the ledger-row digest and watch WBS refuse it.
