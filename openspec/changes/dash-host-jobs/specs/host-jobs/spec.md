## ADDED Requirements

### Requirement: The job catalogue names every job type

Each repository SHALL list its own job types in `infra/jobs/catalogue.json` with `id`,
`entrypoint`, `argumentProfile`, `envelope` (`cpuCores`, `memoryGib`, `tmpDiskGib` as whole
units, `exclusive` as resource ids), `containers` (`none` or a bound `{ memoryGib, cpuCores }`),
`enforcement` (`observe` or `cap`) and `provenance` (`estimated` with an `until` date, or
`calibrated` with host class, instant, record count, p95 figures and record ids). The Burokrat
rule `JOB-CATALOGUE` SHALL judge one repository's catalogue from its revision and the supplied
instant alone and SHALL fail on a malformed entry, a duplicate id, an entrypoint absent at the
revision, an estimated provenance past `until`, an envelope below its own calibrated p95, or a
`containers` value that is neither `none` nor a bound. `ops job run` SHALL load the catalogue of
the enrolled checkout at the payload's revision, pin the descriptor digest, payload SHA,
argument profile and host class in the run record, and SHALL refuse exit 64 a `--type` that
catalogue does not name or whose argument profile the argv does not match.

#### Scenario: The five launchers are catalogued

- **WHEN** the rule judges a puni-00 revision whose catalogue names `gate`, `release-build`,
  `test-queued` and `solver-image-publish`, each estimated until 2026-12-01, at an instant before
  that date
- **THEN** the rule passes with no finding and no unevaluated rule; `website-dev-build` is judged from
  `puni-pr-00`'s own catalogue and revision

#### Scenario: An estimate outlives its date

- **WHEN** the rule judges the same catalogue at an instant on 2026-12-02
- **THEN** it fails naming `gate` and the other estimated types as past `until`

#### Scenario: An uncatalogued type

- **WHEN** `ops job run --type nightly -- true` is invoked and the catalogue has no `nightly`
- **THEN** it exits 64 naming the type and the catalogue path, and nothing is admitted

### Requirement: A host pool admits a host job when its envelope fits

The host pool SHALL be the managed-resource ledger of `dash-resource-cleanup` extended with
the dimensions `cpuCores` and `memoryGib` and with named exclusive units; a host job SHALL be a
use of kind `host_job` admitted from that ledger alone, in one `BEGIN IMMEDIATE`, with no WBS
call on the admission path. With `allocatable[d] = budget[d] − headroom[d]` per dimension and
the existing free-space check for disk, a host job SHALL be admitted when, for every dimension,
`allocatable[d]` minus the reservations of every non-released use covers its envelope and every
exclusive id it names has a free unit, reserving the declared envelope and one unit per id. A job
whose envelope exceeds `allocatable` in any dimension, or names an exclusive id the pool has no
units for, SHALL be refused exit 73 at once, naming the dimension and both figures, without a
ticket. Waiters SHALL be served oldest-fitting-first with overtakes counted in the admitting
transaction; a waiter overtaken three times SHALL be a barrier no younger waiter passes until
it runs, the oldest barrier applying. A waiter past its wait budget SHALL be refused exit 75
naming who is ahead and leave scheduling at once; a wait-zero caller SHALL be refused 75 while
any live ticket is ahead; a ticket whose process is gone or whose budget expired over a minute
ago SHALL be removed by whoever sees it, named on stderr. Reservations SHALL never exceed
`allocatable` in any dimension, and a unit SHALL be held by at most one use, under any
interleaving of admissions, exits, crashes and reclaims.

#### Scenario: Two gates and a build fit

- **WHEN** the pool has budget 8 cores and 15 GiB with headroom 0 cores and 2 GiB and two
  `gate_tree` units, and a gate (4 cores, 6 GiB, one tree), a second gate and a website build
  (2 cores, 2 GiB) arrive in that order
- **THEN** the two gates run on different trees (8 cores cover 4 + 4) and the build waits, since
  13 GiB minus 12 leaves 1 GiB, and runs the moment either gate settles its memory

#### Scenario: A third gate is overtaken, then barred

- **WHEN** the pool has budget 16 cores and 34 GiB with headroom 0 cores and 2 GiB and two
  `gate_tree` units, two gates run, a third gate waits for a tree and three builds that fit
  arrive after it
- **THEN** the three builds run ahead of it and a fourth build waits behind the gate until the
  gate has run

#### Scenario: Larger than the host

- **WHEN** a type whose envelope states 14 GiB is run on a pool whose memory budget is 15 GiB
  with headroom 2
- **THEN** it exits 73 naming `memoryGib`, 14 and 13, without a ticket

#### Scenario: An exclusive id the pool lacks

- **WHEN** a type naming `gate_tree` is run on a pool configured with no `gate_tree` units
- **THEN** it exits 73 naming `gate_tree` and 0 units, without a ticket

#### Scenario: Concurrent admissions never overcommit

- **WHEN** a model-based run interleaves admissions, exits, deadline crossings, cancellations,
  simultaneous contenders, several barriers, a calibration and crashes at each boundary against
  the ledger from several processes
- **THEN** reservations never exceed `allocatable` in any dimension, every exclusive unit is
  held by at most one use at any instant, and no use is released without its terminal evidence

### Requirement: A host job runs measured in its own scope

`ops job run` SHALL launch the argv through the runtime's FD-gated owned process group in a
transient user scope with `MemoryHigh` at the envelope (and `MemoryMax` for `cap`), reading the
scope's `memory.peak`, `memory.current`, `cpu.stat` and `pids.current` once and persisting the
boot, PID and start identity before releasing the gate, with a job-private `TMPDIR` and
`DASH_JOB_ID`, `DASH_JOB_TYPE`, `DASH_JOB_UNIT_<ID>` per exclusive id and `HEAVY_LOCK_LABEL` in
its environment. It SHALL sample the counters and the tmp directory's size every ten seconds and
at payload exit, keep the observation boundary alive until the final sample and the run record
are durable, record a telemetry failure and a ledger-write failure apart from the payload's
outcome, and return the payload's exit code unchanged (128 + signal when signalled). When
`systemd-run` is absent, the user manager is unavailable, or the scope's counters cannot be read
at the gate, it SHALL exit 70 before the payload starts, naming the fix.

#### Scenario: A gate is measured

- **WHEN** a gate runs to exit 0 through `ops job run --type gate`
- **THEN** the caller sees exit 0 and the ledger holds one run record with the type, label,
  envelope, descriptor digest, payload SHA, the `gate_tree` unit, at least one sample, a peak
  memory figure, the peak tmp sample and the wall time

#### Scenario: A one-second job is still measured

- **WHEN** `ops job run --type <id> -- true` runs for a type whose argument profile is `""`
- **THEN** the record holds the gate sample and the exit sample, and the scope was not torn down
  before the exit sample was read

#### Scenario: No user manager

- **WHEN** `systemd-run --user` answers that the user manager is not running
- **THEN** `ops job run` exits 70 naming `loginctl enable-linger`, starts nothing and reserves
  nothing

#### Scenario: A job's failure passes through

- **WHEN** the argv exits 65
- **THEN** the caller sees exit 65 and the run record states `exitCode: 65`

### Requirement: Calibration proposes and the audit names drift; neither writes the catalogue

`ops job calibrate --type <id> -- <argv>` SHALL wait for the pool to drain, hold the whole
`allocatable` vector while it runs with no `MemoryHigh`, and record a calibration record.
`ops job propose --type <id>` SHALL print a catalogue patch from the nearest-rank p95 of complete,
comparable records partitioned by argument profile, host class and toolchain (memory from every
uncapped and unthrottled run, CPU as the peak ten-second interval and duration from calibration
runs alone) times 1.25, rounded up, citing the record ids, and SHALL refuse naming the count with
fewer than three complete calibration records in any dimension. `ops job audit` SHALL exit 1
naming each envelope drift: `overrun` (a peak above the envelope, kept until an accepted envelope
supersedes it), `waste` (p95 below half the envelope over ten or more complete runs),
`estimate_expired`, or `attribution_incomplete`; it SHALL exit 0 and print `no drift` otherwise.
No command SHALL modify any `infra/jobs/catalogue.json`.

#### Scenario: A calibration proposes

- **WHEN** three calibration runs of `gate` on the same profile, host class and toolchain peaked
  at 4.1, 4.4 and 4.3 GiB
- **THEN** `propose --type gate` prints `memoryGib: 6` with the three record ids and the catalogue
  file is unchanged

#### Scenario: A throttled run does not lower the proposal

- **WHEN** an ordinary `gate` run under `MemoryHigh` recorded `memory.events high` above zero
  and peaked at 3 GiB
- **THEN** `propose` excludes it from the memory p95 and names it excluded

#### Scenario: An overrun is drift

- **WHEN** a `gate` run peaked at 7 GiB against an envelope of 6 and eight runs have passed since
- **THEN** `audit` still exits 1 naming `gate`, `overrun`, 7 and 6, until the catalogue carries an
  accepted envelope of at least 7

#### Scenario: Too few records

- **WHEN** `propose --type release-build` runs with two calibration records and five ordinary runs
- **THEN** it is refused naming two calibration records for CPU and duration and prints no patch

### Requirement: Status names what the host is doing

`ops job status` SHALL print the running jobs (type, label, pid, age, envelope, peak so far,
units held, settlement state) and then the waiters oldest first with age, budget left and
overtake count. While the pool is in observe mode or the singleton guard holds the canonical
flock, `bin/with-heavy-lock.sh status` SHALL keep printing
`heavy lock: holder pid <pid> label <label>` as its first line.

#### Scenario: One running, one waiting

- **WHEN** a gate runs and a build waits
- **THEN** `status` prints the gate's line with its tree and peak, then the build's line with its
  age and budget, and `with-heavy-lock.sh status` names the gate's pid and label first

### Requirement: The transition is a fenced mode change and never lets two mechanisms proceed

In observe mode every host job SHALL run under the complete legacy queue protocol (ticket,
deadline, holder record, label) with one total wait deadline. `ops pool switch-mode concurrent`
SHALL stop intake, drain legacy holders and waiters, verify that every enrolled launcher's
checkout contains the shim, and flip the mode atomically in the ledger; in concurrent mode a
Dash singleton SHALL hold the canonical flock for as long as any host job runs, until the
operator records that no stale checkout can execute; `switch-mode observe` SHALL drain before
switching back. The production entry `run_heavy_job` in `bin/heavy-lock-lib.sh` SHALL run
`ops job run --type $HEAVY_LOCK_JOB_TYPE`, forwarding the wait and poll budgets as flags, when
`/home/puni1/.config/dash/host-pool.json` exists on Linux; SHALL exit 70 when that config is
missing or unreadable beside an existing ledger; SHALL exit 64 for a caller that exports no
type; and SHALL take the `flock` as before on an unenrolled host. It SHALL be an outer shell
that returns Dash's status so the caller's `EXIT` trap runs exactly once. `with_heavy_lock`
with its explicit path argument SHALL stay the fixture primitive and take no enrollment
decision. No variable SHALL select the mechanism.

#### Scenario: Observe mode shares one order

- **WHEN** the pool is in observe mode, a host job holds a ticket, and a legacy
  `with-heavy-lock.sh` caller on an older checkout arrives
- **THEN** the legacy caller queues behind the job's ticket in arrival order and runs only after
  the job's settlement releases the lock

#### Scenario: A stale launcher after the flip

- **WHEN** the pool is concurrent, two host jobs run, and a launcher from an older checkout takes
  the `flock` path
- **THEN** it queues behind the Dash singleton's hold and runs only when no host job is running

#### Scenario: Config vanishes beside a ledger

- **WHEN** the pool config is removed while the ledger exists and `run_heavy_job` is invoked
- **THEN** it exits 70 naming the config and the ledger and takes neither mechanism

#### Scenario: A caller without a type on an enrolled host

- **WHEN** `run_heavy_job -- true` runs where the pool config exists and no
  `HEAVY_LOCK_JOB_TYPE` is exported
- **THEN** it exits 64 naming the variable and takes neither mechanism

#### Scenario: The gate's cleanup runs once

- **WHEN** the gate's outer launcher runs its payload through `run_heavy_job` on an enrolled host
  and the payload exits 65
- **THEN** the launcher's trusted-launcher directory is removed exactly once and the caller sees 65

#### Scenario: An unenrolled host is unchanged

- **WHEN** `run_heavy_job` runs where the pool config does not exist
- **THEN** it takes the `flock` and every case of `bin/heavy-lock.test.sh` passes unchanged

### Requirement: WBS shows the pool and its jobs and never admits

The capacity report SHALL carry an optional `reservedUnits` beside `usageUnits`; a binding
whose source is the host pool SHALL report the ledger's reserved sum for the resource's
dimension in `reservedUnits` and keep the adapter's measured usage in `usageUnits`, re-observed
through the ledger's change notification after every admission and settlement. Each host job
SHALL be published through the resource authority events as a versioned use variant
(`kind: 'host_job'`, optional planning links, immutable organization and authority ownership,
reservation entries per dimension, type, label, host, payload SHA): `registered` from the outbox
after admission, `release_verified` only with the settlement evidence naming the job's run
record: the locator `dash-host-job-run://<host>/<jobId>` and the SHA-256 of the record's gate
entry, disposition `returned`; a job with no run record (its launcher never wrote the gate entry)
SHALL return `not_created` with the SHA-256 of `<locator> absent`. WBS SHALL refuse any other
host-job locator or disposition `400 invalid_body`; a `returned` digest is checked for shape only. The project resources read SHALL show reserved units and the
job names beside the measured figure, keeping `stale`, `unreachable` and adopt-by-command
unchanged. A deleted planning link SHALL NOT strand the use. No WBS write SHALL admit, refuse or
end a host job. The outbox SHALL keep each host-job event's last WBS refusal (status, message,
first and last refusal time, count, the SHA-256 of the refused bytes) durably. An operator SHALL
be able to drop the host-job event at the head of the outbox that WBS refused `400` for its
current bytes, when no later outbox event belongs to the same use. Before dropping, the command
SHALL re-send the event's stored bytes once through the outbox's own WBS client and authority and
SHALL drop it only on a fresh `400`; a `2xx` SHALL mark it published and drop nothing. The drop
SHALL journal the operator, account, time, reason, the event's bytes and their SHA-256 and the
fresh refusal's time, and SHALL give every later event one sequence less in the same
transaction, so the next event publishes. Every other drop SHALL be refused, changing nothing.

#### Scenario: Reserved by two jobs

- **WHEN** two gates run on h2puni, the host measures 8 GiB in use, and the reporter ticks
- **THEN** `h2puni ram` reads capacity 15, usage 8, reserved 12, and the resources section reads
  `8 in use, 12 reserved by 2 jobs` naming both gate labels

#### Scenario: WBS down

- **WHEN** WBS answers nothing while a gate is admitted and runs
- **THEN** the gate is admitted from the ledger alone, runs to its exit, its `registered` and
  `release_verified` events wait in the outbox, and are published in order on the next tick that
  WBS answers

#### Scenario: A returned job's evidence names its run record

- **WHEN** a gate on the pool enrolled as, e.g., `h2puni-host-pool` runs to its exit and every entry is returned
- **THEN** its `release_verified` evidence carries the locator `dash-host-job-run://h2puni-host-pool/<jobId>`,
  the SHA-256 of that run record's stored gate entry and disposition `returned`, and WBS stores it

#### Scenario: The ledger-row digest is refused

- **WHEN** a `release_verified` host-job event carries the slice-5 evidence, the ledger row's
  digest under `dash-host-job://<authorityId>/<jobId>/<revision>`
- **THEN** WBS answers `400 invalid_body`, stores nothing and advances no sequence

#### Scenario: An operator drops an event WBS refuses for good

- **WHEN** an old Dash moved a host job's `release_verified` with `dash-host-job://…` evidence,
  a newer be-01 refuses it `400 invalid_body` on every retry, and the operator runs
  `ops outbox drop --event <its id> --operator <name> --reason <text>`
- **THEN** the command re-sends the event, WBS refuses it `400` again, the event leaves the
  outbox, the drop record names the operator, the account, the reason, the refusal with the
  re-send's time and the event's SHA-256, the command prints the dropped event and the next in
  line, and the next synchronize publishes that next event under the dropped one's sequence

#### Scenario: An event WBS accepted before a crash is published, not dropped

- **WHEN** WBS had accepted the head event but `watch` died before marking it published, so its
  stored refusal is a stale `400`, or WBS accepts it now, and the operator runs
  `ops outbox drop` for it
- **THEN** WBS answers the re-send `2xx`, the event is marked published, nothing is dropped or
  renumbered, the command exits 0 saying nothing was dropped, and the next synchronize publishes
  the following event under its own sequence

#### Scenario: A re-send WBS does not refuse 400 is not dropped

- **WHEN** WBS answers the drop's re-send `409 conflict`, does not answer, or refuses it with any
  status but `400`
- **THEN** `ops outbox drop` exits 64 for the `409`, naming the sequence state and the hand
  repair, and 70 `could not confirm` otherwise, and the outbox and the journal are unchanged

#### Scenario: An event WBS has not refused is not dropped

- **WHEN** the operator names an event that is not in the outbox, was published, is not the
  head, carries no recorded `400` of its current bytes, or is followed by an event of its own use,
  or the pool is concurrent with the guard on and the guard's holder is live
- **THEN** `ops outbox drop` exits 64 naming why without calling WBS, and the outbox and the
  journal are unchanged

### Requirement: Each reservation entry settles with its own terminal evidence

A host job's reservation entries SHALL settle separately: CPU and memory after the owned
process group is terminal (every identity-verified member gone and every declared container
gone), tmp disk after the runtime's verified cleanup of the job directory, and a `gate_tree`
after writers are excluded and the tree is verified at its resting commit and clean. Release,
reservation changes and the outbox event SHALL commit in one transaction. A crash between
reservation and launch, a dead launcher with surviving children, and a failed cleanup SHALL
leave the use charged (`blocked` or `unknown`) for the watch loop; nothing SHALL release on
launcher death alone.

#### Scenario: Surviving children keep the charge

- **WHEN** the launcher of a gate is killed while an identity-verified Bun child still runs
- **THEN** the use stays `unknown` with its memory reserved, `status` names the child's pid, and
  the next admission computes against it

#### Scenario: A dirty tree is not returned

- **WHEN** a gate's payload exits 0 but leaves the tree with an untracked file
- **THEN** CPU and memory settle, the `gate_tree` unit stays `blocked` naming the file, and no
  gate is admitted on that tree until an operator resolves it

### Requirement: The audit names a throttled run first

`ops job audit` SHALL name a `throttled` drift for every ordinary run record of a catalogued
type, ended or still running, whose scope sampled `memory.events high` above zero. Each drift
SHALL be one line naming the type, the job id, the largest event count, the envelope `memoryGib`
the run ran under and its peak `memoryGib`. The line SHALL give the remedy: calibrate the type
(`ops job calibrate --type <id>`) and `ops job propose --type <id>`. `throttled` drifts SHALL print
before every other kind. A calibration record SHALL never be `throttled`. A run still in
progress SHALL stay drift until it ends. An ended run SHALL stay drift until the HEAD entry's
`memoryGib` is above the envelope the run was throttled under.

#### Scenario: A throttled gate is the first drift

- **WHEN** a `gate` run under an envelope of 6 GiB sampled `memory.events high` 3360000 and
  another run overran its CPU
- **THEN** `audit` exits 1, printing the `throttled` line naming 3360000, 6 and the peak first
  and the `overrun` line after it

#### Scenario: A raised envelope clears it once the run has ended

- **WHEN** the catalogue at HEAD raises `gate`'s `memoryGib` from 6 to 8
- **THEN** an ended run throttled under 6 GiB is no longer drift, and a run still in progress
  under 6 GiB still is

### Requirement: Status marks a throttled job

`ops job status` SHALL print `throttled (memory.events high <n>)` after the peak on the line of a
running job whose run record has sampled `memory.events high` above zero. `<n>` SHALL be the
largest count sampled. A job with no such sample SHALL print no marker.

#### Scenario: The throttled gate is visible while it runs

- **WHEN** a running gate's run record has an interval sample with `memory.events high` 3360000
- **THEN** its `status` line reads `peak 6.0 GiB throttled (memory.events high 3360000)`

### Requirement: A job type may bound its runtime

A catalogue entry MAY declare `maxRuntimeMinutes`, a positive whole number. An entry without it
SHALL have no runtime bound. When a payload of a bounded type has run longer than the bound at a
sample, `ops job run` SHALL send SIGTERM to the payload's session. If the payload has not ended
within the settle budget, it SHALL send SIGKILL. `ops job run` SHALL then exit 124 and record 124
in the ledger and the run record. The run record SHALL keep the signal the payload ended with and
the reason `exceeded maxRuntimeMinutes <n>: ended by the launcher`. The job SHALL settle and
release its reservation and its shell lock hold as after any exit. A run record written without
the field SHALL still be read.

#### Scenario: A gate past its bound is ended

- **WHEN** a `bounded` job with `maxRuntimeMinutes: 1` is still running at a sample two minutes
  after its gate opened
- **THEN** the launcher ends it with SIGTERM, exits 124, records exit 124, signal `SIGTERM` and
  the reason, and the job is released

#### Scenario: A payload that ignores SIGTERM

- **WHEN** the payload ignores SIGTERM and the settle budget passes
- **THEN** the launcher sends SIGKILL, exits 124 and the run record names `SIGKILL`

#### Scenario: An unbounded type runs on

- **WHEN** a type without `maxRuntimeMinutes` runs under the same clock
- **THEN** its payload's own exit 0 is returned and no reason is recorded

### Requirement: A test-queued job runs pinned in a gate tree

`bin/test-queued.sh` SHALL take exactly one argument, resolve it to a commit in its own checkout
and refuse exit 64, before any lock or admission, when it is absent, accompanied by another, or
names no commit. It SHALL run `bin/test-queued-payload.sh <sha>` through `run_heavy_job` as type
`test-queued`, labelled `test-queued:<sha8>`. The catalogue's `test-queued` SHALL name the
argument profile `<sha>` and the exclusive unit `gate_tree`, so it shares the gate's trees. The
payload SHALL choose its tree as the gate payload does: on an enrolled host only the
`DASH_JOB_UNIT_GATE_TREE` its admission handed it, refusing 64 without one; on an unenrolled host
the launcher's checkout, refusing 64 an inherited `DASH_JOB_UNIT_GATE_TREE`. It SHALL check the
commit out there, refuse a tree whose bytes are not that commit's, run the frozen install and
`nx run-many -t test`, and, when enrolled, return the tree to its resting commit pass or fail.
Started inside an admitted job, `test-queued` SHALL be refused 70 as a type with a unit.

#### Scenario: Tests run in an admitted gate tree

- **WHEN** `bin/test-queued.sh HEAD` runs on an enrolled host with two `gate_tree` units
- **THEN** Dash runs `--type test-queued --label test-queued:<sha8>` with the payload and the
  full sha, the install and the tests run in one unit at that sha, and the unit is back at its
  resting commit with `gate_tree` released

#### Scenario: An enrolled payload without an admission is refused

- **WHEN** `bin/test-queued-payload.sh <sha>` runs on an enrolled host without
  `DASH_JOB_UNIT_GATE_TREE`
- **THEN** it exits 64 naming the variable and `bin/test-queued.sh <sha>`, and no test runs

#### Scenario: An inherited unit on an unenrolled host is refused

- **WHEN** `bin/test-queued-payload.sh <sha>` runs on an unenrolled host with
  `DASH_JOB_UNIT_GATE_TREE` set
- **THEN** it exits 64 saying no admission handed it out, and no test runs

#### Scenario: A launcher without its sha is refused

- **WHEN** `bin/test-queued.sh` runs with no argument, with two, or with one naming no commit
- **THEN** it exits 64 before any lock or admission

### Requirement: A declared, bounded host-service container beside a job is attributed

During a host job's container watch, a container created without `puni.job` that carries
`puni.host-service=<name>` with a non-empty name SHALL be recorded as verdict `host-service`
with its name, `--memory` bytes and `--cpus` cores when both bounds were given, and SHALL NOT
make the run's attribution incomplete. Without either bound, or with an empty name, it SHALL be
recorded `unlabelled` with a reason naming what is missing. A container carrying `puni.job`
SHALL be judged by the job-container rules whatever its `puni.host-service` label.
`ops job propose` SHALL count such a run as complete, and `ops job audit` SHALL print a note
listing the run's host services with their declared bounds and counts, adding nothing to the
job's envelope. A run that saw only host-service containers SHALL NOT clear an earlier
`attribution_incomplete`.

#### Scenario: A bounded host service beside a gate

- **WHEN** a gate is running and a cron starts a container three times with
  `--label puni.host-service=goaccess-reports --memory 512m --cpus 1`
- **THEN** the run record holds three `host-service` verdicts naming goaccess-reports with
  536870912 bytes and 1 core, the run's attribution is complete, `ops job propose` uses it, and
  `ops job audit` prints `note: host services beside run` followed by the job id and
  `goaccess-reports (512 MiB, 1 cpu) ×3`

#### Scenario: An unbounded host service

- **WHEN** a container labelled `puni.host-service=goaccess-reports` starts during a job without
  `--cpus`
- **THEN** it is recorded `unlabelled` with a reason naming `--cpus`, and the run's attribution
  is incomplete

#### Scenario: Both labels

- **WHEN** a container labelled `puni.job` with the running job's id and
  `puni.host-service=goaccess-reports` starts with memory above the type's declared bound
- **THEN** it is recorded `unbounded` by the job-container rules

### Requirement: A labelled container removed before its bounds were read is lifetime-bounded

During a host job's container watch, a container that `docker inspect` answers `No such
container` for SHALL be judged from its create and die events once the stream and the replay
have ended. A container labelled `puni.job` with the running job's id, or without `puni.job`
and labelled `puni.host-service` with a non-empty name, whose create and die events both carry
a time and date a lifetime of at most one sampling interval, SHALL be recorded as verdict
`lifetime-bounded` with the label, the name, the lifetime and the interval. It SHALL NOT make
the run's attribution incomplete, `ops job run` SHALL print one `attributed` line for it, and
`ops job audit` SHALL list a host service so recorded as `ended before inspection`. Without
either event time, or after a longer lifetime, it SHALL be recorded `unverified`. An inspect
failure other than `No such container` SHALL stay `unverified`, and an unlabelled container
SHALL stay `unlabelled`.

#### Scenario: An hourly one-second backup snapshot beside a gate

- **WHEN** a gate is running and a backup starts
  `docker run --rm --label puni.host-service=sqlite3-backup --memory 256m --cpus 1` and the
  container is removed 1.2 s after its create event, before `docker inspect` reads it
- **THEN** the run record holds a `lifetime-bounded` verdict naming `puni.host-service`,
  sqlite3-backup and 1200 ms, `ops job run` prints `attributed` followed by the container id and
  `host-service=sqlite3-backup from its create event (ended before inspection, lifetime 1.2 s)`,
  and the run's attribution is complete

#### Scenario: No die event

- **WHEN** a labelled container is removed before inspection and neither the stream nor the
  replay delivered its die event
- **THEN** it is recorded `unverified`, the reason saying no die event dates its lifetime, and
  the run's attribution is incomplete

### Requirement: An unreadable subtree under a job's tmp directory is a listed tmp lower bound

Each sample of a host job SHALL walk the job's tmp directory past any subtree its user may not
read (EACCES or EPERM) and past entries that vanish mid-walk, recording the readable bytes as a
lower bound and the unreadable paths, relative to the tmp directory, deduplicated and at most
32 with a count of the rest. Such a sample SHALL NOT be a telemetry failure; the tmp directory
itself absent or unreadable SHALL be. A record whose only defect is unreadable tmp subtrees
SHALL be complete for memory, CPU and duration, and a lower bound for tmp disk: `ops job
propose` SHALL name it `tmp lower bound only` and leave it out of tmp disk, taking tmp disk from
lower bounds only when fewer than three records measured it, then never below the entry's
current `tmpDiskGib`, naming those records `used as a lower bound` and not `excluded`, saying
how many tmp records were measured, and marking the proposed provenance
`tmpDiskGibLowerBound: true`. `ops job audit` SHALL print one note per such run listing the
paths, SHALL NOT count its tmp figure toward `waste`, and SHALL NOT judge tmp waste for an entry
whose provenance carries that marker, printing a note that says so.

#### Scenario: A mode-0 test fixture under TMPDIR

- **WHEN** a gate's payload creates `wbs-shared-process-XYrBbJ/inaccessible` under `TMPDIR`
  with mode 0 and reopens it later
- **THEN** the samples taken meanwhile list `wbs-shared-process-XYrBbJ/inaccessible`, their
  tmp bytes count the rest of the directory, and the run records no telemetry failure

#### Scenario: Three calibrations whose only defect is unreadable tmp subtrees

- **WHEN** `ops job propose --type gate` reads three such calibration records
- **THEN** it proposes memory, CPU and duration from them, prints `tmp lower bound only` for
  each, and proposes tmp disk as a lower bound only, at least the entry's current figure, with
  `tmpDiskGibLowerBound: true` in the provenance

#### Scenario: An accepted lower-bound tmp entry

- **WHEN** the catalogue's entry carries `tmpDiskGibLowerBound: true` and ten complete runs
  measured tmp disk below half its `tmpDiskGib`
- **THEN** `ops job audit` names no tmp waste and prints a note that the tmp entry is a lower
  bound and waste cannot fire for tmpDiskGib

#### Scenario: The tmp directory itself unreadable

- **WHEN** a sample finds the job's tmp directory unreadable or absent
- **THEN** the sample's failure names the tmp directory, and the run records a telemetry
  failure that leaves it out of every dimension

### Requirement: A proposal never exceeds the pool's allocatable, and says when it is clamped

`ops job propose` SHALL clamp each of `cpuCores`, `memoryGib` and `tmpDiskGib` whose heuristic
figure exceeds the largest envelope its pool admits (allocatable cores and memory, and the
whole GiB its disk units hold) to that figure, SHALL print `clamped to allocatable` with the
heuristic on that dimension's line, and SHALL record the clamped dimensions in
`clampedToAllocatable` and their unclamped figures in `heuristic`. A figure equal to
allocatable SHALL NOT be clamped. `JOB-CATALOGUE` SHALL refuse `clampedToAllocatable` naming an
unknown or repeated dimension, either field without the other, and an envelope above its
heuristic, and SHALL judge a clamped dimension's heuristic against the p95 in place of its
envelope. `ops job audit` SHALL keep an overrun in a clamped dimension as drift, marked
expected when its peak is at most that dimension's heuristic, SHALL print a note for each
clamped dimension, and SHALL NOT judge it for waste. When its only drift is such an expected
overrun it SHALL exit 0; an overrun above the heuristic and any other drift SHALL exit 1. An
ordinary run of a type with a clamped dimension SHALL reserve the pool's whole allocatable in
that dimension, and Dash SHALL refuse such a type in `concurrencyEligible`. A clamped `memoryGib`
SHALL run its scope with `MemoryHigh` at the lower of `heuristic.memoryGib` and the pool's
memory budget less `memoryBoundHeadroomGib` (2 when absent), never below the envelope, reporting
the figure that set it and recording `memoryBoundGib` in the descriptor and the run record.
`JOB-CATALOGUE` and `ops job run` SHALL refuse `cap` enforcement on a clamped `memoryGib`,
naming the clamp and the p95.

#### Scenario: A heuristic above allocatable

- **WHEN** `ops job propose --type gate` on a pool of 7 cores and 10 GiB reads calibrations with
  p95 10.01 GiB and 6.88 cores
- **THEN** it proposes `memoryGib` 10 and `cpuCores` 7, prints
  `memoryGib: 10 (clamped to allocatable 10 GiB; heuristic 13 from p95 10.01 GiB …`, and the
  provenance carries `clampedToAllocatable: ["cpuCores", "memoryGib"]` and
  `heuristic: { cpuCores: 9, memoryGib: 13 }`

#### Scenario: An overrun of a clamped envelope

- **WHEN** a gate run peaks at 10 GiB under the clamped 9 GiB entry
- **THEN** `ops job audit` names the overrun, its line ending
  `expected: the HEAD entry is clamped to the pool`, exits 0 when nothing else drifted, and
  prints the note
  `gate memoryGib overruns a clamped envelope: p95 10.01 GiB measured, entry 9 clamped to the pool`

#### Scenario: Only an expected overrun

- **WHEN** the only drift `ops job audit` finds is an overrun of a clamped dimension, up to its
  heuristic
- **THEN** it prints the overrun and its note and exits 0; with an overrun in an unclamped
  dimension beside it, or a 14 GiB peak on a heuristic of 13, it exits 1

#### Scenario: A clamped gate runs under its heuristic

- **WHEN** `ops job run --type gate` launches the entry clamped to 6 cores and 9 GiB with
  heuristic 13 GiB on h4claw's pool (budget 15 GiB, allocatable 7 cores and 10 GiB)
- **THEN** admission reserves 7 cores and 10 GiB, the scope gets `-p MemoryHigh=13G`, the
  launcher names the heuristic as the figure that set it, and the descriptor and the run record
  carry `memoryBoundGib: 13`; on h2puni's 14 GiB budget the pool's 12 GiB sets it

#### Scenario: Nothing runs beside a clamped gate

- **WHEN** a 1-core, 1-GiB job arrives while a clamped gate is held, or the gate arrives while
  that job is held
- **THEN** the newcomer does not fit and waits, though the gate's envelope would leave room

#### Scenario: Cap on a clamped memory

- **WHEN** an entry with `memoryGib` in `clampedToAllocatable` declares `enforcement: cap`
- **THEN** `JOB-CATALOGUE` names it, and `ops job run` refuses 64 before admission, naming the
  clamp and the p95

#### Scenario: A bad clamp marker

- **WHEN** an entry's `clampedToAllocatable` names `swapGib`, or its `memoryGib` is 14 under a
  heuristic of 13
- **THEN** `JOB-CATALOGUE` names the entry malformed

### Requirement: Processes left in a job's scope are ended before tmp settlement

Once a host job's leader has exited and its launched session has no live member, `ops job
run` and `ops job calibrate` SHALL end every process still in the job's own scope
`dash-job-<id>.scope` before settling the job. They SHALL first record the payload's end:
the run record's `endedAt` (so its wall time) and the ledger's exit SHALL be taken at the
leader's exit, never after the leftover ending. They SHALL read only the job's own scope and the
cgroups nested below it, never the parent slice or another job's scope (a `j19-holder-*` scope
the gate's tests start is a sibling under the slice, not below the job's scope); they SHALL
count the subtree's processes, describe up to eight of the scope's own (pid, comm, command line
truncated to 120 characters), send SIGTERM to the whole scope through `systemctl --user kill`,
SIGKILL after a bounded grace, and SHALL then wait, bounded, until the subtree has no member.
The run record SHALL keep `leftoverProcesses` with `count`, `examples` and `endedWith`:
`none`, `SIGTERM`, `SIGKILL`, `timeout`, or, with the `failure` text, `signal-failed` when a
`systemctl --user kill` call failed (no wait follows, and a leftover that exits on its own
afterwards SHALL NOT be labelled with the signal) or `unverified` when the members became
unreadable during a wait. A record written before this requirement SHALL load without it.
`ops job status` and `ops job audit` SHALL print a note naming how many leftovers were ended,
with which signal, or that no signal was delivered, and their command lines by count. Every
outcome other than `none`, `SIGTERM` and `SIGKILL` SHALL leave the tmp directory charged and be
reported; none SHALL be reported as released. While a member of the payload's own session
lives, the launcher SHALL NOT signal anything in the scope.

#### Scenario: A leftover is ended before tmp settlement

- **WHEN** a gate's payload exits 0 and leaves a `setsid`'d `node serve.cjs` with its working
  directory under `TMPDIR` in the job's scope
- **THEN** the launcher sends SIGTERM to the scope, the server exits, the run record keeps
  `leftoverProcesses` `{ count: 1, endedWith: SIGTERM }` with its command line, the tmp entry is
  released, and `ops job audit` notes `run <id> ended 1 leftover processes with SIGTERM (node
serve.cjs ×1)`

#### Scenario: The leftover ending is not the job's wall time

- **WHEN** a leftover ignores SIGTERM and is SIGKILLed after the grace
- **THEN** the run record's wall time ends at the leader's exit, below the grace, and the
  ledger's exit precedes the leftover ending's first report line

#### Scenario: A leftover survives the SIGKILL wait

- **WHEN** a process in the job's scope is still a member after the SIGKILL wait
- **THEN** the run record keeps `endedWith: timeout`, the launcher reports that the scope still
  has members, the tmp entry stays `blocked`, and `ops job status` prints the note under the
  job's line

#### Scenario: The scope kill fails

- **WHEN** `systemctl --user kill --signal=SIGTERM` fails for the job's scope
- **THEN** the run record keeps `endedWith: signal-failed` with the diagnostic, nothing is waited
  for, the tmp entry stays `blocked`, and the note says no signal was delivered

#### Scenario: A nested cgroup is counted and awaited, never described

- **WHEN** a cgroup below the job's scope holds a process
- **THEN** the leftover count and the wait include it, the record's examples come from the job
  scope's own `cgroup.procs` only, and a cgroup that is not the job's own scope (its parent
  slice, another job's scope) is refused

#### Scenario: A member of the payload's session is the job's own work

- **WHEN** the payload exits leaving a plain background child in its session
- **THEN** nothing in the scope is signalled, the run record has no `leftoverProcesses`, and the
  job settles once the child ends
