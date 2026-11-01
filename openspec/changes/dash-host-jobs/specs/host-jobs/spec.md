## ADDED Requirements

### Requirement: The job catalogue names every job type

`infra/jobs/catalogue.json` SHALL list every job type with `id`, `entrypoint`, `envelope`
(`cpuCores`, `memoryGib`, `tmpDiskGib` as whole units, `exclusive` as resource ids),
`enforcement` (`observe` or `cap`), `containers` (`none` or `labelled`) and `provenance`
(`estimated` with an `until` date, or `calibrated` with host, instant, run count, p95 figures and
record ids). The Burokrat rule `JOB-CATALOGUE` SHALL fail on a malformed entry, a duplicate id, an
entrypoint absent at the revision, an estimated provenance whose `until` is before the instant
the rule is given, or an envelope below its own calibrated p95. `ops job run` SHALL refuse exit 64
a `--type` the catalogue does not name.

#### Scenario: The five launchers are catalogued

- **WHEN** the rule judges a revision whose catalogue names `gate`, `release-build`,
  `test-queued`, `solver-image-publish` and `website-dev-build`, each estimated until 2026-12-01,
  at an instant before that date
- **THEN** the rule passes and names the five types

#### Scenario: An estimate outlives its date

- **WHEN** the rule judges the same catalogue at an instant on 2026-12-02
- **THEN** it fails naming `gate` and the other estimated types as past `until`

#### Scenario: An uncatalogued type

- **WHEN** `ops job run --type nightly -- true` is invoked and the catalogue has no `nightly`
- **THEN** it exits 64 naming the type and the catalogue path, and nothing is admitted

### Requirement: A host pool admits a host job when its envelope fits

A host pool SHALL admit a host job when, for every dimension, the budget minus `headroomGib`
minus the envelopes of the running jobs covers the job's envelope and every exclusive id it names
has a free unit, reserving the declared envelope and one unit per id. A job whose envelope exceeds
the whole budget SHALL be refused exit 73 at once, naming the dimension and both figures. Waiters
SHALL be served oldest-fitting-first; a waiter overtaken three times SHALL become a barrier that
no younger waiter passes until it runs. A waiter past its wait budget SHALL be refused exit 75
naming who is ahead; a ticket whose process is gone or whose budget expired over a minute ago
SHALL be removed by whoever sees it, named on stderr. The reserved sum SHALL never exceed the
budget minus headroom under any interleaving of admissions and exits.

#### Scenario: Two gates and a build fit

- **WHEN** the pool has 8 cores, 15 GiB, headroom 2 GiB and two `gate_tree` units, and a gate
  (4 cores, 6 GiB, one tree), a second gate and a website build (2 cores, 2 GiB) arrive in that
  order
- **THEN** the two gates run on different trees and the build waits, since 13 GiB minus 12 leaves
  1 GiB, and runs the moment either gate exits

#### Scenario: A third gate is overtaken, then barred

- **WHEN** two gates run, a third gate waits for a tree and three builds that fit arrive after it
- **THEN** the three builds run ahead of it and a fourth build waits behind the gate until the
  gate has run

#### Scenario: Larger than the host

- **WHEN** a type whose envelope states 32 GiB is run on a 15 GiB pool
- **THEN** it exits 73 naming `memoryGib`, 32 and 13, without a ticket

#### Scenario: Concurrent admissions never overcommit

- **WHEN** a model-based run interleaves admissions and exits of random envelopes against the
  ledger from several processes
- **THEN** the reserved sum never exceeds the budget minus headroom and every exclusive unit is
  held by at most one job at any instant

### Requirement: A host job runs measured in its own scope

`ops job run` SHALL start the argv in a transient user scope with `MemoryHigh` at the envelope
(and `MemoryMax` for `cap`), a job-private `TMPDIR`, and `DASH_JOB_ID`, `DASH_JOB_TYPE`,
`DASH_JOB_UNIT_<ID>` per exclusive id and `HEAVY_LOCK_LABEL` in its environment. It SHALL sample
the scope's `memory.peak`, `memory.current`, `cpu.stat` and `pids.current` every ten seconds and
at exit, measure the tmp directory and the wall time at exit, and write the run record before
returning the argv's exit code unchanged. When `systemd-run` is absent, the user manager is
unavailable, or the scope's cgroup files cannot be read, it SHALL exit 70 before the argv starts,
naming the fix.

#### Scenario: A gate is measured

- **WHEN** a gate runs to exit 0 through `ops job run --type gate`
- **THEN** the caller sees exit 0 and the ledger holds one run record with the type, label,
  envelope, the `gate_tree` unit, at least one sample, a peak memory figure and the wall time

#### Scenario: No user manager

- **WHEN** `systemd-run --user` answers that the user manager is not running
- **THEN** `ops job run` exits 70 naming `loginctl enable-linger`, starts nothing and reserves
  nothing

#### Scenario: A job's failure passes through

- **WHEN** the argv exits 65
- **THEN** the caller sees exit 65 and the run record states `exitCode: 65`

### Requirement: Calibration proposes and the audit names drift; neither writes the catalogue

`ops job calibrate --type <id> -- <argv>` SHALL wait for the pool to drain, hold the whole budget
while it runs with no `MemoryHigh`, and record a calibration record. `ops job propose --type <id>`
SHALL print a catalogue patch from the p95 of the last three or more records (memory from every
run, CPU and duration from calibration runs) times 1.25, rounded up, citing the record ids, and
SHALL refuse with fewer than three. `ops job audit` SHALL exit 1 naming each envelope drift:
`overrun` (a peak above the envelope in the last five runs), `waste` (p95 below half the envelope
over ten or more runs), `estimate_expired`, or `unlabelled_container`; it SHALL exit 0 and print
`no drift` otherwise. No command SHALL modify `infra/jobs/catalogue.json`.

#### Scenario: A calibration proposes

- **WHEN** three calibration runs of `gate` peaked at 4.1, 4.4 and 4.3 GiB
- **THEN** `propose --type gate` prints `memoryGib: 6` with the three record ids and the catalogue
  file is unchanged

#### Scenario: An overrun is drift

- **WHEN** the latest `gate` run peaked at 7 GiB against an envelope of 6
- **THEN** `audit` exits 1 naming `gate`, `overrun`, 7 and 6

#### Scenario: Too few records

- **WHEN** `propose --type release-build` runs with two records
- **THEN** it is refused naming the count and prints no patch

### Requirement: Status names what the host is doing

`ops job status` SHALL print the running jobs (type, label, pid, age, envelope, peak so far,
units held) and then the waiters oldest first with age, budget left and overtake count. While
`legacyLockPath` is set, `bin/with-heavy-lock.sh status` SHALL keep printing
`heavy lock: holder pid <pid> label <label>` as its first line.

#### Scenario: One running, one waiting

- **WHEN** a gate runs and a build waits
- **THEN** `status` prints the gate's line with its tree and peak, then the build's line with its
  age and budget, and `with-heavy-lock.sh status` names the gate's pid and label first

### Requirement: The legacy lock is held until the host's last launcher moves

While the pool config sets `legacyLockPath`, every host job SHALL hold that lock from admission
to exit under its lane label, so no legacy caller and no second host job overlaps it. On Linux,
`with_heavy_lock` SHALL exec `ops job run --type $HEAVY_LOCK_JOB_TYPE` when
`/home/puni1/.config/dash/host-pool.json` exists and SHALL refuse exit 64 a caller that exports no
type; on any other host or platform it SHALL take the `flock` as before. No variable SHALL select
the mechanism.

#### Scenario: Observe phase excludes

- **WHEN** `legacyLockPath` is set, a host job runs, and a legacy `with-heavy-lock.sh` caller on
  the older code arrives
- **THEN** the legacy caller queues behind the job's pid and label and runs only after it exits

#### Scenario: A caller without a type on an enrolled host

- **WHEN** `bin/with-heavy-lock.sh -- true` runs where the pool config exists and no
  `HEAVY_LOCK_JOB_TYPE` is exported
- **THEN** it exits 64 naming the variable and takes neither mechanism

#### Scenario: An unenrolled host is unchanged

- **WHEN** the same command runs where the pool config does not exist
- **THEN** it takes the `flock` and the 23 cases of `bin/heavy-lock.test.sh` pass unchanged

### Requirement: WBS shows the pool and its jobs and never admits

`report-capacity` SHALL accept a `host_pool` measure whose binding names a dimension or an
exclusive id, reporting the budget as capacity and the reserved sum as usage, re-observed after
every admission and exit. Each host job SHALL be published as a resource use of kind `host_job`
through the resource authority events (`registered` at admission, `release_verified` at exit with
the run record's digest, `reclaimedBytes: null`), attributed to type, label and host. The project
resources read SHALL carry the report with its `reserved` state and the job names. No WBS write
SHALL admit, refuse or end a host job.

#### Scenario: Reserved by two jobs

- **WHEN** two gates run on h2puni and the reporter ticks
- **THEN** `h2puni ram` reads capacity 15, usage 12, and the resources section reads
  `12 reserved by 2 jobs` naming both gate labels

#### Scenario: WBS down

- **WHEN** WBS answers nothing while a gate is admitted and runs
- **THEN** the gate runs to its exit, the events wait in the outbox, and are published on the next
  tick that WBS answers
