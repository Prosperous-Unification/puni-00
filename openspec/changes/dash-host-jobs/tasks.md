## 0. Dany reads J1 to J18

- [ ] 0.1 Dany confirms or amends design.md J1 to J18, in particular J4 (a third authority with
      its own ledger, no WBS on the admission path), J6 (oldest-fitting-first with a barrier of
      three), J12 (the legacy lock held while `legacyLockPath` is set, the shim deciding by one
      fixed path) and J17 (one tool, `dev` and `ops` namespaces; a fourth tool is his later ADR).
      Slices 1 and 2 may proceed on J1 to J6; slice 3 waits for J7 and J8; slice 6 for J12 to J15.

## 1. Catalogue and rule (static; no host change)

- [ ] 1.1 `infra/jobs/catalogue.json` with the five types (J2, J14) and `infra/jobs/README.md`
      naming the fields and the `propose` → PR loop; each entrypoint script gains one comment
      naming its catalogue id — test: the catalogue parses with the shared ArkType shape.
- [ ] 1.2 Burokrat rule `JOB-CATALOGUE` in observe mode: malformed entry, duplicate id, absent
      entrypoint, expired estimate against `--now`, envelope below calibrated p95 — test: one
      fixture per failure; negative: drop the `until` comparison and the 2026-12-02 fixture
      passes.
- [ ] 1.3 Twilight glossary terms (J1) and the names/boundaries note that a host pool is a
      capacity pool of one host.

## 2. Host pool ledger and admission (needs 1.1)

- [ ] 2.1 `src/ops/host-pool/`: owner-only config (fixed path, `budget`, `headroomGib`,
      exclusive units, `legacyLockPath`, WBS binding), SQLite ledger (`pool`, `ticket`, `job`,
      `sample`, `calibration`, `outbox`), `ops pool init|inspect` — test: init refuses an
      existing ledger, a config another user can read, a budget above the machine's `MemTotal`.
- [ ] 2.2 Admission: vector fit, exclusive units, exit 73, oldest-fitting-first, barrier of
      three, deadlines, dead-ticket reclaim (J5, J6) — test: the four spec scenarios;
      `fc.asyncModelRun` over admissions and exits from several processes with sabotage proofs
      (drop the `BEGIN IMMEDIATE`, drop the unit check, drop the barrier) each watched red
      before the slice lands (J18).

## 3. Measured runs (needs 2)

- [ ] 3.1 `ops job run`: `systemd-run --user --scope` with `MemoryHigh`/`MemoryMax`, private
      `TMPDIR`, the environment of J7, ten-second cgroup samples, run record before exit, exit
      code pass-through, 128 + signal — test: a real scope on the Linux runner reading its own
      `memory.peak`; negative: replace `systemd-run` with a stub answering "Failed to connect to
      bus" and watch exit 70 before the argv (J8); negative: make `memory.peak` unreadable and
      watch 70.
- [ ] 3.2 Labelled containers (J16): `containers: labelled` samples `docker stats` of
      `puni.job=<id>` through the docker adapter's reading; `docker events` during the window
      records unlabelled starts on the run — test: fixture docker CLI.
- [ ] 3.3 `ops job status` (J13) — test: the one-running-one-waiting scenario, exact lines.

## 4. Calibration, proposal, audit (needs 3)

- [ ] 4.1 `ops job calibrate` (drain, whole budget, no `MemoryHigh`, calibration record) and
      `ops job propose` (p95 × 1.25, three-record minimum, record ids) — test: the two spec
      scenarios; negative: lower the minimum to one and watch the refusal test fail.
- [ ] 4.2 `ops job audit` with the four drift kinds and the weekly timer units rendered beside
      the observation units — test: one fixture per kind, `no drift` on a clean ledger;
      negative: drop the overrun window and the 7-against-6 fixture passes.

## 5. WBS projection (needs 2; be-01, fe-01, Dash compute)

- [ ] 5.1 `host_pool` as a fifth `Measure` in `src/compute` and the contracts' binding shape;
      `report-capacity` reads the ledger's reserved sum, re-observes on admission and exit —
      test: reporter test with a fixture ledger; the reported chip reads `reserved`.
- [ ] 5.2 Host jobs as `host_job` resource uses through the authority events with an outbox
      that survives WBS being down (J10) — test: the WBS-down scenario against a refusing
      fixture server; negative: make the publish synchronous on the admission path and watch the
      gate wait on WBS.
- [ ] 5.3 fe-01: the `reserved by N jobs` state and the job names beside the capacity chip —
      test: rendering states; eye review per the UI acceptance rule.

## 6. Transition on the gate hosts (operator and code)

- [ ] 6.1 Shim in `bin/heavy-lock-lib.sh` (J12): enrolled branch execs `ops job run`, type
      required, fixed path, no variable; the five callers export `HEAVY_LOCK_JOB_TYPE`;
      `puni-pr-00`'s `build-release.sh` the same — test: new `bin/heavy-lock.test.sh` cases for
      the enrolled branch; the existing 23 pass unchanged; negative: let an environment variable
      choose the mechanism and watch the opt-out case fail.
- [ ] 6.2 Audit the gate for shared mutable state beyond the tree (docker image tag, fixed
      ports, `/var/tmp` names, Bun and Nx caches); the smoke tag becomes
      `wbs-be-01:solver-smoke-<job id>`; `bin/h2puni-gate.sh` takes its root from
      `DASH_JOB_UNIT_GATE_TREE` and refuses 64 on an enrolled host without it (J15) — test: two
      gates driven concurrently in the model test with distinct trees; negative: share the tag
      and watch the smoke race.
- [ ] 6.3 `gate_host` role: linger on, pool config, ledger directory, second gate tree,
      `validate` runs `ops job audit`; h2puni disk cleaned first per the recorded order — proof:
      two converging applies, `changed=0` on the second.
- [ ] 6.4 Enroll h2puni and h4claw with `legacyLockPath` set (observe phase); run the gate,
      the release build, the solver publish, `test:queued` and the website build through the
      shim for a week; calibrate the five types; open the catalogue PR from `propose`.
- [ ] 6.5 Flip `legacyLockPath` to null on each host after the five-caller checklist; record
      the first two concurrent gates and their peaks in `verify.md`; update
      `docs/runbook-h2-heavy-lock-owner.md`, `docs/infra/gate-hosts.md`, `AGENTS.md` Gate and
      `LLM_README.md`.

## 7. Dash namespaces (J17; mechanical, any time after 2)

- [ ] 7.1 `twilight-dash dev …` and `twilight-dash ops …` dispatcher tables with the old names
      as aliases for one release; README, `docs/platform-map.md` and the Twilight names page —
      test: every alias dispatches to the same handler; the alias removal date is in the README.
