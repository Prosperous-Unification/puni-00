## Context

Dany's `/goal` of 2026-11-01: standardise the heavy-job locking as part of the system, know the
list of job types, give every job type a known CPU and memory envelope so one host can run two
jobs, measure that envelope by a diagnostic run and keep measuring to know when it must change;
make it part of Twilight Dash, perhaps on an `ops` side apart from `dev`.

What exists, read on 2026-11-01:

| Need                               | Exists today                                                                                                                                                                                                                                                                   | Missing                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Serialising heavy runs on one host | `bin/heavy-lock-lib.sh`: `flock(2)` through perl, arrival-order tickets with deadlines, dead-ticket reclaim, `status`, exit codes 75/70/64/130/143, lane labels (`fifo-heavy-lock`, `exclusive-heavy-lock`)                                                                    | any notion of what a run needs; two runs that would fit                                                                                  |
| Who launches heavy runs            | `bin/h2puni-gate.sh` (`gate:<sha8>`), `bin/publish-release.sh`, `test:queued`, `tool-devsync/src/solver-binding-runtime.ts` (solver image publish), `puni-pr-00/deploy/website/dev/build-release.sh` (`puni-main-build:…`)                                                     | a list; an envelope per launcher                                                                                                         |
| What a plan consumes               | WBS resource, capacity, demand, occupancy (`wbs-resources`), claim leases, shared occupancy; `h2puni ram`, `h2puni tmp disk`, `h2puni agent slots` declared on dev (task 6.1); the heavy lock is deliberately not a WBS demand                                                 | nothing: planning stays as it is                                                                                                         |
| What fulfils a resource            | `compute-providers`: provider instance per organization, `ssh_host`/`docker` adapters measuring `memory_gib`, `disk_gib`, `cpu_cores`, `agent_slots`; `report-capacity` reporter; declared wins, adopt by explicit command (P7)                                                | a measure whose usage is "reserved by jobs"                                                                                              |
| Runtime reservations with a clock  | `dash-resource-cleanup`: owner-only root, SQLite ledger, disk units and workspace slots, admission before creation, tracked commands under pidfds, outbox to WBS as resource-use events; `wbs-resource-release`: Dash authoritative, WBS a projection                          | cores and memory as dimensions; exclusive units; admission that needs no WBS                                                             |
| Measuring a process tree           | `tool-devsync/src/k3s/forge-process-observation.ts` reads cgroup v2 counters locally; `solver-supervisor-peer-cgroup.ts`                                                                                                                                                       | a run placed in its own cgroup so the counters are its own                                                                               |
| Dash's authorities                 | lease authority, activation controller (ADR 0051: own process, store, account), `resources` runtime, `compute`, `ledger` (account-outcomes), `runs`                                                                                                                            | a host authority; a `dev`/`ops` split of the CLI                                                                                         |
| Host facts (2026-11-01 10:30 UTC)  | h2puni: 8 cores, 15.6 GiB, disk 91 %; one gate running, user slice `memory.current` 2.0 GiB, `MemAvailable` 11.7 GiB, load 8.6; queue: 2 gates + 2 website builds, waited 1.7 to 2.4 h, budgets 8 to 9.6 h. h4claw: one gate running, 2 gates waited 3.6 h, 11.7 GiB available | `systemd-run --user --scope` works as `puni1` on both; cgroup v2 delegates `cpu memory pids`; linger is on for h2puni and off for h4claw |

Two facts shape the design. First, the lock's queue semantics are already right (arrival order,
deadlines, reclaim, observable) and its code carries nineteen watched proofs; the design keeps
every one of those contracts and changes only what decides admission. Second,
`names.md` places anything that takes time or changes something in Dash, and the glossary
already holds **Capacity pool** ("a bounded supply of an execution resource shared by competing
activities") and **Lease**; a host pool is a capacity pool of one host, and a host job holds a
lease on part of it.

## Goals / Non-Goals

**Goals:** the list of job types is one file a reviewer reads; each type carries an envelope with
its provenance; a host admits as many jobs as fit and no more; every run is measured; a
calibration run proposes an envelope and an audit says when the declared one has drifted; WBS
shows what each host is doing; the shell lock retires host by host without a window where two
mechanisms both proceed.

**Non-Goals:** choosing a host (cross-host dispatch is the fleet's later work); a host job
taking a WBS claim or being levelled by an engine; CPU quotas or memory kills by default;
measuring containers a job starts unless it labels them; macOS and any host not enrolled;
pricing.

## Decisions

All drafted under Dany's `/goal` of 2026-11-01 and **assumed** until he reads them. Each is
overrulable by id without moving another unless noted.

**J1. Terms.** **Job type** (a catalogued kind of heavy run), **Job envelope** (the resource
vector a job type reserves), **Host job** (one admitted run of a job type on one host), **Host
pool** (the capacity pool of one host Dash admits host jobs against), **Calibration run** (a host
job admitted with the whole pool, to measure), **Envelope drift** (the audit's finding that an
envelope and the measured history disagree). They enter the Twilight glossary under Execution,
beside Capacity pool. "Heavy lock", "lane" and "ticket" keep their meanings in the WBS glossary
as the shell mechanism's words until it retires.

**J2. The catalogue is a file in the repository that defines the jobs,
`infra/jobs/catalogue.json`, validated by a Burokrat rule.** Its entries are the job types; the
five launchers above are the first five: `gate`, `release-build`, `test-queued`,
`solver-image-publish`, `website-dev-build` (the last declared here because the host pool is this
repository's, though its entrypoint lives in `puni-pr-00`). Why a file under `infra/` and not
Dash's config: the envelope is a fact about the repository's own jobs at a revision, a reviewer
changes it by PR, and Burokrat can judge it from the revision alone; Dash's host config is a fact
about one machine. Each entry:

```json
{
  "id": "gate",
  "entrypoint": "bin/h2puni-gate.sh",
  "envelope": { "cpuCores": 4, "memoryGib": 6, "tmpDiskGib": 8, "exclusive": ["gate_tree"] },
  "enforcement": "observe",
  "containers": "none",
  "provenance": {
    "kind": "estimated",
    "basis": "user slice memory.current 2.0 GiB during gate:0a518a42 on h2puni, 2026-11-01",
    "until": "2026-12-01"
  }
}
```

`provenance.kind` is `estimated` (allowed only with an `until` date) or `calibrated` (with
`host`, `measuredAt`, `runs`, the p95 of peak memory, CPU cores and tmp disk, and the
calibration record ids). The rule `JOB-CATALOGUE` fails on a malformed entry, a duplicate id, an
entrypoint that does not exist at the revision, an estimated entry past its `until` (judged
against the `--now` Burokrat is given, as every rule with a date), and an envelope smaller than
its own calibrated p95 (the headroom is the catalogue author's, not the rule's). The rule runs
in observe mode first, as every Burokrat rule has.

**J3. Exclusive units are named in the pool, counted in the catalogue.** An envelope's
`exclusive` lists resource ids; the host pool's config names the units each id has on that host
(`"gate_tree": ["/home/puni1/puni-00-gate-tbf", "/home/puni1/puni-00-gate-tbf2"]`). Admission
hands the job one unit per id as `DASH_JOB_UNIT_<ID>` in its environment; the gate uses it as
the tree it checks out under the lock, so two gates need two trees and never share one. Why
units and not a count: the gate must know which tree it got, and the tree's path is a fact about
the host. The `wbs-be-01:solver-smoke` image tag the gate's smoke builds is a second shared
mutable thing two gates would race on; it becomes `wbs-be-01:solver-smoke-<job id>` (task 6.2
audits the gate for every such hazard; the envelope says nothing about them).

**J4. The host pool is Dash's third authority, local, with no WBS dependency on the admission
path.** Config at `/home/puni1/.config/dash/host-pool.json` on Linux (owner-only, fixed path like
`resolve_heavy_lock_path`, no environment override, for the reason that file gives at length),
ledger at `/home/puni1/.local/share/dash/host-pool.sqlite`: budget `{ cpuCores, memoryGib,
tmpDiskGib, headroomGib }`, the exclusive units, `legacyLockPath` (J12), the WBS binding (J10).
Admission reads the ledger alone; the gate must run while dev WBS is down, because the gate is
how WBS gets fixed, and `dash-resource-cleanup`'s ledger, which requires WBS admission before any
creation, is therefore not reused. The dev runtime's worktrees and the host pool share one
machine and, in v1, not one ledger: the host pool's budget is set below the machine so the dev
runtime's `diskBudgetUnits` and the OS keep theirs. Folding the dev ledger's reservations into the
host pool is the first follow-up once both run on one host.

**J5. Admission is a vector fit.** A host job is admitted when, for every dimension, the
budget minus `headroomGib` minus the sum of the envelopes of running jobs covers its envelope,
and every exclusive id it names has a free unit. A job whose envelope exceeds the whole budget is
refused at once, exit 73, naming the dimension and both numbers, never queued. The declared
envelope is what is reserved; a running job's measured peak changes nothing about admission
(J8). Why declared and not measured: the same reason as `compute-providers` P7; a number that
admits jobs must be one a human typed and a reviewer saw.

**J6. Waiters are served oldest-fitting-first with a starvation barrier.** A waiter is admitted
when it fits and no older waiter fits. A waiter overtaken three times becomes the barrier: no
younger waiter is admitted until it runs. Why not strict arrival order: with two gate trees and
room for a website build beside them, strict order would hold a 2 GiB build behind a third gate
waiting for a tree. Why a barrier and not a reservation of freed capacity: it is one counter and
one rule, and three overtakes bounds the wait at three shorter jobs. Tickets keep their
deadlines and reclaim: a waiter whose process is gone or whose budget expired over a minute ago
is removed by whoever sees it, named on stderr, as today.

**J7. A host job runs in its own transient cgroup scope and is measured from it.**
`twilight-dash ops job run --type <id> [--label <lane>] [--wait-seconds <n>] -- <argv>` starts
the argv through `systemd-run --user --scope --unit dash-job-<id>-<n> -p MemoryHigh=<memoryGib>G
-p TasksMax=…` (proven working as `puni1` on h2puni and h4claw on 2026-11-01), with `TMPDIR` set
to a job-private directory under the pool's root so tmp disk is the job's own, and
`DASH_JOB_ID`, `DASH_JOB_TYPE`, the unit variables of J3 and the legacy `HEAVY_LOCK_LABEL` in its
environment. Every ten seconds and at exit it reads the scope's `memory.peak`, `memory.current`,
`cpu.stat usage_usec` and `pids.current`, and at exit the tmp directory's size and the wall
time; the run record (type, label, envelope, host, start, end, exit code, peaks, samples, units)
is written to the ledger before the exit code is returned. `enforcement: observe` sets
`MemoryHigh` (the kernel throttles and reclaims, never kills); `cap` sets `MemoryMax` too, for a
type whose overrun must not take the host down. `--parallel=2` and the rest of a job's own
knobs stay in its script. The job's stdin, stdout and stderr are the caller's, as under
`with_heavy_lock`.

**J8. What cannot be measured is refused, not run unmeasured.** No `systemd-run`, no user
manager, a scope whose cgroup files cannot be read, or `memory.peak` absent: exit 70 before the
argv starts, naming the fix (`loginctl enable-linger puni1` for a host whose user manager stops
with the last session; h4claw today). Why: a run the ledger did not measure is a hole in the
history every later envelope is computed from, and R5 forbids the default. The gate host role
turns linger on (task 6.3). A job's own exit code passes through unchanged; a job killed by
signal returns 128 + signal as the shell does.

**J9. A calibration run measures a type alone and proposes; the audit names drift; neither
writes the catalogue.** `ops job calibrate --type <id> -- <argv>` is admitted with the whole
budget (it waits for the pool to drain and nothing is admitted beside it), runs with
`enforcement: observe` and no `MemoryHigh`, and records a calibration record. `ops job propose
--type <id>` prints a catalogue patch: p95 over the last three or more records (calibration and
ordinary runs alike for memory, calibration runs alone for CPU and duration, because contention
inflates those) times 1.25, rounded up to whole units, with the record ids as provenance. `ops
job audit [--catalogue <path>]` compares every type's envelope with its history and exits 1
naming each **envelope drift**: an overrun (a run's peak above the envelope in the last five
runs), waste (p95 below half the envelope over ten or more runs), or an estimated provenance
past `until`. The gate host role runs the audit under its `validate` tag and a weekly user timer
rendered like the observation units writes the report. Why nothing adopts: `compute-providers`
P7 and `wbs-resources` R1 keep every admitting number a typed fact; the patch is a PR.

**J10. WBS shows the host, never admits for it.** The host pool is a compute provider instance's
measure: `report-capacity` gains `host_pool` as a fifth `Measure` whose binding names a dimension
(`memoryGib`, `cpuCores`, `tmpDiskGib` or an exclusive id) and whose capacity is the budget and
usage the reserved sum, read from the ledger, reported at the existing cadence and right after
an admission or a release (the reporter already re-observes on a run change). Each host job is
a **resource use** of kind `host_job` published through the resource authority events the
`resources` runtime already sends (`registered` at admission, `release_verified` at exit with
the run record's digest as evidence, `reclaimedBytes: null`), attributed to the type, the label,
the host and, when the label is `gate:<sha8>`, the sha. The resources section reads "15 GiB, 9
reserved by 2 jobs" with the job names, from the `compute-provider` chip's states (measured,
stale, unreachable, none) plus one: `reserved`. Why not a claim: the heavy lock was deliberately
not a WBS demand (task 6.1 of `wbs-resources`), a job is not plan data, and `wbs-resource-release`
§1 already makes Dash authoritative for runtime reservations and WBS a projection.

**J11. Each host is one pool, as each host is one lock today.** `ops job run` runs on the host
it admits for; there is no `--host`. Cross-host choice is the fleet's later work and reads the
capacity reports of J10, which is why they carry the reserved sum.

**J12. The transition holds the legacy lock until the host's last launcher moves.** With
`legacyLockPath` set in the pool config, every host job holds the `flock` of
`bin/heavy-lock-lib.sh` from admission to exit, taken through the same perl call, under the
job's lane label, so a legacy caller and a Dash job exclude each other and the lock's `status`
still names the holder. In that phase two Dash jobs never overlap either; what the host gains
is measurement. When every launcher on the host goes through Dash, the operator sets
`legacyLockPath` to null and concurrency begins. `with_heavy_lock` becomes a shim: when
`/home/puni1/.config/dash/host-pool.json` exists on Linux it execs `ops job run --type
<HEAVY_LOCK_JOB_TYPE>` (each caller exports its type beside its label; a caller with no type is
refused 64), otherwise it takes the flock as today, so macOS and unenrolled hosts change nothing.
Why the shim decides by one fixed path and no variable: the lock's history (its own test caught
`$WBS_HEAVY_LOCK`) says a caller that can choose its mechanism can opt out of it.

**J13. Exit codes and `status` keep their contracts.** 75 refused for contention or an expired
budget, 70 unknown state, 64 usage, 73 new (does not fit an empty pool), 130/143 signalled. `ops
job status` prints the running jobs (type, label, pid, age, envelope, peak so far, units held)
then the waiters oldest first with age, budget left and overtake count; while `legacyLockPath`
is set, `bin/with-heavy-lock.sh status` keeps its first line (`heavy lock: holder pid N label
L`) because `docs/runbook-h2-heavy-lock-owner.md` parses it; that runbook gains the `ops job
status` form and keeps the old one until the last host flips.

**J14. The first envelopes are estimates with a short `until`.** The catalogue ships with the
five types estimated from 2026-11-01's readings (a gate: 4 cores, 6 GiB, 8 GiB tmp, one gate
tree; the others from their scripts) and `until: 2026-12-01`, so the rule forces calibration
within a month. Task 6.4 calibrates all five on h2puni before the host flips to concurrency.

**J15. Two gate trees on each gate host.** `infra/ansible/roles/gate_host` clones
`~/puni-00-gate-tbf2` beside the first, frozen-installed, and the pool config names both as
`gate_tree` units. `bin/h2puni-gate.sh` takes its repo root from `DASH_JOB_UNIT_GATE_TREE` when
set and refuses 64 when the pool is enrolled and the variable is absent (a gate launched past
the pool). Disk: a tree is 1 to 4 GiB and h2puni's disk is at 91 %; task 6.3 cleans first per
the recorded order (`h2puni-disk-cleanup`).

**J16. Containers a job starts are counted only when labelled.** The scope sees the job's own
processes; `dockerd` runs containers outside it. A type declares `containers: none` or
`labelled`; for `labelled`, the run samples `docker stats` of containers labelled
`puni.job=<job id>` through the existing docker adapter's reading and adds them to the peak.
The audit flags a run during whose window `docker events` shows an unlabelled container start
(the gate's solver smoke today), as drift of kind `unlabelled_container`.

**J17. One tool, two namespaces; the split into two tools is Dany's call later.** The CLI gains
`twilight-dash dev …` (today's `resources`, `record-progress*`, `submit-admission`, `mcp token`,
`pool import`: what one task's worker does) and `twilight-dash ops …` (the job commands here,
`report-capacity`, `plan-enrollment`, `render-observation-units`, `account-outcomes`, the
authority bootstrap commands: what an operator does for hosts and the fleet). The old top-level
names stay as aliases for one release and are then removed. State stays as it is: the host pool is
a third authority with its own store and no shared table, the shape ADR 0051 set. Why not a new
tool now: `names.md` is Dany's decided naming tree, three tools exchange records, and a fourth
name is an ADR-sized decision; namespaces cost one dispatcher table and are reversible. If the
`ops` records come to differ from `dev`'s (own release cadence, own credentials, own hosts),
that is the moment for the ADR, and the namespaces are its first draft.

**J18. Everything the lock proved stays proved.** `bin/heavy-lock.test.sh`'s 23 cases keep
passing unchanged on an unenrolled host; the shim's enrolled branch gets its own cases; the
admission queue gets a `fc.asyncModelRun` model with sabotage proofs before any lifecycle slice
lands (the rule recorded after the claims' three review rounds).

## Risks / Trade-offs

- **An envelope lies and two jobs OOM.** `observe` throttles but does not kill, so an overrun
  job can push the host into reclaim. Mitigations: `headroomGib` (2 GiB by default), the audit
  naming the overrun on the next run, `cap` for the types that must not take the host down, and
  the first month's `until` forcing calibration. Accepted for v1; the alternative, admission on
  measured numbers, is the silent adoption P7 refused.
- **Shared mutable state the envelope cannot see.** Two gates sharing a docker image tag, a fixed
  port, a `/var/tmp` name or the Bun cache corrupt each other without exceeding any number. Task
  6.2 audits the gate for such state and the model test drives two gates concurrently; the
  envelope's `exclusive` list is the result of review, not measurement, and the design says so.
- **The transition window.** While `legacyLockPath` is set nothing overlaps; flipping it with one
  launcher still on the flock reopens the two-mechanisms hole. The flip is a documented operator
  step with a checklist of the five callers, and `ops job status` shows legacy holders until then.
- **`systemd --user` dies with the last session.** Proven on h4claw (linger off). The role turns
  linger on; J8 refuses rather than runs unmeasured, so a gate launched from a dying session is
  refused 70 with the fix named instead of being killed mid-run.
- **Two authorities on one machine.** The dev runtime's worktrees and the host pool reserve from
  the same RAM through two ledgers; a worker running many worktrees can starve the pool. The
  budgets are set apart by the operator in v1 and the follow-up folds them.
- **Burokrat judges dates.** `JOB-CATALOGUE` compares `until` to `--now`; a stale `--now` from a
  caller makes a stale catalogue pass. Same trade-off as every dated rule; Dash supplies the
  instant.
