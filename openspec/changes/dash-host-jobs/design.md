## Context

Dany's `/goal` of 2026-11-01: standardise the heavy-job locking as part of the system, know the
list of job types, give every job type a known CPU and memory envelope so one host can run two
jobs, measure that envelope by a diagnostic run and keep measuring to know when it must change;
make it part of Twilight Dash, perhaps on an `ops` side apart from `dev`. Dany's second
instruction the same day: weigh integration with the existing system and the existing
refactoring plans above all. Codex Astra's review (`puni-plan/reviews/codex-802-2026-11-01.md`,
F1 to F14) found the first draft a sibling reservation system; this revision folds it into the
existing one. Each decision below names the finding that amended it.

What exists, read on 2026-11-01:

| Need                               | Exists today                                                                                                                                                                                                                                                                                                                                                       | Missing                                                                                 |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Serialising heavy runs on one host | `bin/heavy-lock-lib.sh`: `flock(2)` through perl, arrival-order tickets with deadlines, dead-ticket reclaim, `status`, exit codes 75/70/64/130/143, lane labels (`fifo-heavy-lock`, `exclusive-heavy-lock`); every case of `bin/heavy-lock.test.sh` watched                                                                                                        | any notion of what a run needs; two runs that would fit                                 |
| Who launches heavy runs            | `bin/h2puni-gate.sh` (`gate:<sha8>`), `bin/publish-release.sh`, `test:queued`, `tool-devsync/src/solver-binding-runtime.ts` (solver image publish), `puni-pr-00/deploy/website/dev/build-release.sh` (`puni-main-build:…`)                                                                                                                                         | a list; an envelope per launcher                                                        |
| A runtime reservation ledger       | `dash-resource-cleanup`: owner-only root, one SQLite ledger (`binding`, `uses`, `events`, `cursor`), vector admission over `diskBudgetUnits`, `workspaceSlots` and measured free space minus `headroomBytes` (`runtime.ts` ~776), FD-gated launch with persisted boot/PID/start identity (~1317), pidfd cancellation, `/proc` cleanup inspection, outbox to WBS    | cores and memory as dimensions; exclusive units; a use kind that needs no WBS admission |
| The runtime's target model         | `wbs-resource-release` §1 (Dash authoritative, WBS a projection), §2 (one Resource use charges several reservation entries), §6 (one canonical host authority); `twilight-control-plane` design: `admitActivity`/`settleAttempt` own reservation and release, admission reserves a vector before launch, an aging window outranks unaged work                      | a concrete CPU/memory host-admission slice of that model                                |
| What fulfils a resource            | `compute-providers`: provider instance, `ssh_host`/`docker` adapters, `report-capacity`, declared wins and adopt by command (P7); `Measurement` is capacity and usage in the resource's unit                                                                                                                                                                       | a way to show reserved units beside measured usage                                      |
| What a plan consumes               | WBS resource, capacity, demand, occupancy, claim leases; the heavy lock is deliberately not a WBS demand (`wbs-resources` task 6.1)                                                                                                                                                                                                                                | nothing: planning stays as it is                                                        |
| The WBS resource-use contract      | `resource-runtime-shapes.ts`: a use names project, resource, work item, person, kind `temporary_directory \| git_worktree`, disk and workspace charges; events `registered … release_verified` with evidence `{ digest, locator, disposition, reclaimedBytes: null }`                                                                                              | a versioned variant for a host job with optional planning links                         |
| Where code lands                   | code-organization design (four kinds, modules); `twilight-control-plane` invariant ownership (Effect execution, Worker provisioning as deep modules); `docs/refactoring/tasks.md` queue and integration policy; `docs/platform-map.md` reconciliation list                                                                                                         | a placement decision for this change                                                    |
| Host facts (2026-11-01 10:30 UTC)  | h2puni: 8 cores, 15.6 GiB, disk 91 %; one gate running, user slice `memory.current` 2.0 GiB, `MemAvailable` 11.7 GiB, load 8.6; 2 gates + 2 website builds waited 1.7 to 2.4 h. h4claw: one gate running, 2 gates waited 3.6 h. `systemd-run --user --scope` works as `puni1` on both; cgroup v2 delegates `cpu memory pids`; linger on for h2puni, off for h4claw | dated evidence, not a measurement of a gate                                             |

## Goals / Non-Goals

**Goals:** the list of job types is one file per repository a reviewer reads; each type carries
an envelope with its provenance; a host admits as many jobs as fit and no more; every run is
measured; a calibration run proposes an envelope and an audit says when the declared one has
drifted; WBS shows what each host is doing; the shell lock retires host by host without a window
where two mechanisms both proceed; all of it as the first concrete slice of the runtime
reservation model the control-plane design already owns.

**Non-Goals:** choosing a host; a host job taking a WBS claim or being levelled by an engine;
CPU quotas; a job whose containers or build engines run outside every declared bound (such a
type is serialised, J16); macOS and any host not enrolled; pricing; the wholesale `dev`
namespace migration (J17).

## Placement (F6)

| Responsibility                     | Placement                                                                                                                                                                                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host-pool admission and settlement | The control-plane design's Effect execution seam, `admitActivity`/`settleAttempt`, implemented in the existing `resources` runtime (`src/resources/runtime.ts`), which is the canonical runtime authority of a host; a feature-service over Host pool and Reservation resource-services |
| Process and container execution    | Worker provisioning, behind the existing `ComputeProvider` seam; systemd scopes, Docker and SQLite are adapters behind ports                                                                                                                                                            |
| Job catalogue                      | Repository-owned declarations (one per repository); pure Job type and Job envelope contracts; loaded through a repository port at a pinned revision                                                                                                                                     |
| `JOB-CATALOGUE`                    | Burokrat's existing rule framework: a Git revision, recorded evidence and the supplied instant, nothing else                                                                                                                                                                            |
| `ops job …` commands               | A delivery module calling the feature interfaces; it owns no reservation                                                                                                                                                                                                                |
| Host provisioning                  | The existing `gate_host` role                                                                                                                                                                                                                                                           |

Refactoring queue: the queued heavy-lock item in `docs/refactoring/tasks.md` (atomic reclaim,
holderless lock-dir, pid reuse) is closed for an enrolled host by this change and stays open for
unenrolled hosts; it is reconciled, not duplicated. The solver-host tooling relocation item is
not touched: nothing here imports `tool-remote-scripts`. Platform-map reconciliation items 4, 8,
14 and 16 gain a line each when slice 1 lands. File ownership follows the integration policy:
one branch and PR per slice, disjoint files per worker.

## Decisions

All drafted under Dany's `/goal` of 2026-11-01, amended after Codex Astra's review, and
**assumed** until Dany reads them. Each is overrulable by id.

**J1. Terms.** **Job type**, **Job envelope**, **Host job**, **Host pool**, **Calibration run**,
**Envelope drift**, in the Twilight glossary beside Capacity pool. A host job's hold is a
**Reservation** in the glossary's sense (`held | draining | released`), not a Lease: no fencing
token or deadline is defined for it (F2).

**J2. Each repository owns the catalogue of its own jobs; the host names which catalogues it
serves (F10).** `infra/jobs/catalogue.json` in this repository lists `gate`, `release-build`,
`test-queued` and `solver-image-publish`; `puni-pr-00` lists `website-dev-build` in its own
`infra/jobs/catalogue.json`. The host-pool config names the enrolled checkouts whose catalogues
Dash loads, each at the revision the job will run, and the run record pins the descriptor digest,
the payload SHA, the argument profile and the host class, so "envelope at a revision" names one
thing. Burokrat judges each repository's catalogue from that repository's revision alone. Entry:

```json
{
  "id": "gate",
  "entrypoint": "bin/h2puni-gate.sh",
  "argumentProfile": "<sha>",
  "envelope": { "cpuCores": 4, "memoryGib": 6, "tmpDiskGib": 8, "exclusive": ["gate_tree"] },
  "containers": { "memoryGib": 1, "cpuCores": 1 },
  "enforcement": "observe",
  "provenance": {
    "kind": "estimated",
    "basis": "user slice memory.current 2.0 GiB during gate:0a518a42 on h2puni, 2026-11-01",
    "until": "2026-12-01"
  }
}
```

The rule `JOB-CATALOGUE` fails on a malformed entry, a duplicate id, an entrypoint absent at the
revision, an estimated entry past its `until` against the supplied instant, an envelope below
its own calibrated p95, and a type whose `containers` is neither `none` nor a declared bound. It
runs in observe mode first; task 6.5 decides when a failing catalogue blocks `ops job run`.

**J3. Exclusive units are named in the pool, counted in the catalogue (F13 corrected).** The
pool config names the units each exclusive id has (`"gate_tree": [".../puni-00-gate-tbf",
".../puni-00-gate-tbf2"]`), validated at enrollment as distinct canonical paths. Admission hands
the job one unit per id as `DASH_JOB_UNIT_<ID>`. The gate's solver smoke already isolates its
image tag and registry port per attempt token, so nothing there changes; the first draft's claim
that the tag was shared was wrong. What two jobs would share is found by the five-launcher
conflict inventory of task 6.2 (paths, ports, release artifacts, caches, build engines, cross-type
pairs), and every conflict found is either isolated or made an exclusive unit.

**J4. The host pool extends the canonical managed-resource ledger; no second ledger (F1).**
The `resources` runtime's one ledger gains two dimensions, `cpuCores` and `memoryGib`, beside
`diskBudgetUnits` and `workspaceSlots`, plus the exclusive units; its vector admission (one
`BEGIN IMMEDIATE`, reserve before any effect) admits host jobs as it admits worktrees. A host
job is a use of a new kind `host_job`. The protocol constraint that every use needs a durable
WBS admission before creation is amended for this kind: a host job is **host-local**, admitted
from the ledger alone, registered to WBS through the existing outbox afterwards (J10). Why: the
gate must run while dev WBS is down, because the gate is how WBS gets fixed; that is a reason to
make attribution asynchronous for this kind, not to copy the capacity accounting. The dev
runtime's worktrees and host jobs therefore reserve from one pool, which is what
`wbs-resource-release` §6 requires.

**J5. Admission is a typed vector fit (F7).** Budget and headroom are per dimension:
`allocatable[d] = budget[d] − headroom[d]`, with `headroom.memoryGib` 2 by default and the
existing measured free-space-minus-`headroomBytes` check for disk. A job is admitted when, for
every dimension, `allocatable[d]` minus the reservations of every non-released use (starting,
held, draining, blocked, unknown) covers its envelope, every exclusive id it names has a free unit
and the id is known to the pool. A job whose envelope exceeds `allocatable` in any dimension, or
names an exclusive id the pool has no units for, is refused at once, exit 73, naming the
dimension and both figures, never queued. The declared envelope is what is reserved; a running
job's measured peak changes nothing about admission (`compute-providers` P7).

**J6. Waiters are served oldest-fitting-first; three younger admissions make a waiter the
barrier (F8).** This is the host-admission policy inside Effect execution; the barrier is the
control-plane design's aging window applied to one host: an aged waiter outranks unaged work,
oldest first. A waiter is admitted when it fits and no older waiter fits. Overtakes are counted
in the admitting transaction; a waiter overtaken three times is a barrier that no younger waiter
passes until it runs; with several barriers the oldest applies. The bound is "at most three
younger admissions", not a time. A waiter past its deadline is refused 75 in its own process and
removed from scheduling at once; its ticket's reclaim by others a minute later is record
hygiene, not admission. Wait-zero callers keep today's contract: refused 75 while any live ticket
is ahead, even with room. Tickets, deadlines and dead-ticket reclaim keep the lock library's
semantics.

**J7. A host job runs in its own transient scope behind the runtime's launch gate (F9).**
`twilight-dash ops job run --type <id> [--label <lane>] [--wait-seconds <n>] -- <argv>` reserves,
then launches through the runtime's existing FD-gated owned process group: the scope is created
(`systemd-run --user --scope --unit dash-job-<use id> -p MemoryHigh=<memoryGib>G`, `MemoryMax`
too for `cap`), its `memory.peak`, `memory.current`, `cpu.stat` and `pids.current` are read once
and the boot/PID/start identity persisted, and only then is the gate released and the payload
exec'd. `TMPDIR` is a job-private directory under the managed root; `DASH_JOB_ID`,
`DASH_JOB_TYPE`, the unit variables and `HEAVY_LOCK_LABEL` are in the environment. Every ten
seconds and at payload exit the counters and the tmp directory's size are sampled; the
observation boundary outlives the payload until the final sample and the run record are
durable. Peak tmp disk is the largest sample, stated as a lower bound; disk outside `TMPDIR` and
the managed worktree is not covered and the record says so. The payload's exit code passes
through; a signalled payload returns 128 + signal. A telemetry failure mid-run and a ledger
write failure are recorded apart from the payload's outcome.

**J8. What cannot be measured is refused before the payload, never run unmeasured.** No
`systemd-run`, no user manager, scope counters unreadable at the gate: exit 70 before the
payload starts, naming the fix (`loginctl enable-linger puni1`; h4claw today). The gate host role
turns linger on as a prerequisite; a manager that dies mid-run is a telemetry failure the record
carries, not a silent gap.

**J9. Calibration proposes; the audit names drift; both are provisional heuristics (F11).**
`ops job calibrate --type <id> -- <argv>` waits for the pool to drain, holds the whole
`allocatable` vector, runs with no `MemoryHigh` and records a calibration record. `ops job
propose --type <id>` prints a catalogue patch from the p95 (nearest-rank over the window) of
complete, comparable records: memory from every uncapped and unthrottled run in the window
(`memory.events high` zero), CPU as the peak ten-second interval of `usage_usec` over cores and
duration from calibration runs alone, each dimension partitioned by argument profile, host class
and toolchain; at least three complete calibration records per dimension, else refused naming
the count; headroom 1.25, rounded up. `ops job audit` exits 1 naming each envelope drift:
`overrun` (a peak above the envelope, kept visible until an accepted envelope supersedes it,
never ageing out), `waste` (p95 below half the envelope over ten or more complete runs),
`estimate_expired`, `attribution_incomplete` (J16). The 1.25, three and ten are provisional and
labelled so in the catalogue README; cold, warm and two-job concurrent validation precede
enabling concurrency on a host (task 6.5). Nothing writes the catalogue.

**J10. WBS shows the host, never admits for it (F12).** Two projections, both through
existing transports: (a) a `host_job` use is published through the resource authority events
as a versioned use variant (`resourceRuntimeUse` v2: `kind: 'host_job'`, optional project, work
item and person links, immutable organization and authority ownership, reservation entries per
dimension, type, label, host, payload SHA), `registered` after admission from the outbox,
`release_verified` only with the settlement evidence of J2' below (digest and durable locator of
the run record, disposition `returned`); (b) the capacity report gains an optional
`reservedUnits` beside `usageUnits`, so measured usage is preserved and reservations are shown
apart; the `host_pool` of the first draft is not a `Measure`, it is a source the reporter reads
from the ledger for the bound resource's dimension, re-observed through the ledger's change
notification. The chip reads `measured 15, 8 in use, 12 reserved by 2 jobs`; `stale`,
`unreachable` and adopt-by-command are unchanged. Deletion of a planning link does not strand
the use: its ownership is the authority's. No WBS write admits, refuses or ends a host job.

**J2'. Settlement releases each dimension with its own terminal evidence (F2).** Reservation
entries of one use settle separately: CPU and memory after the owned process group is terminal
(every identity-verified member gone, through the runtime's pidfd and `/proc` inspection, and
every declared container gone); tmp disk after the runtime's verified cleanup of the job
directory; a `gate_tree` after writers are excluded and the tree is verified reset to its
resting commit and clean (the gate's own restore, verified by the runtime, not trusted from
the exit code). Release, reservation changes and the outbox event commit in one transaction. A
crash between reservation and launch, a dead launcher with surviving children, and a failed
cleanup leave the use charged (`blocked` or `unknown`), reconciled by the runtime's existing
watch loop; nothing reclaims on launcher death alone.

**J11. Each host is one pool, as each host is one lock today.** No `--host`; cross-host
choice is the fleet's later work and reads the capacity reports of J10.

**J12. The transition is a fenced mode change; Dash holds the canonical flock as a singleton
throughout (F3).** Enrollment writes a persistent identity into the ledger. In the observe
phase every host job runs under the complete legacy queue protocol (ticket, deadline, holder
record, label) with one total wait deadline, so legacy callers and Dash jobs share one order.
The switch to concurrent mode is an operator command that: stops intake, drains legacy holders
and waiters, verifies every enrolled launcher's checkout contains the shim, then flips the mode
atomically in the ledger. In concurrent mode a Dash singleton (the watch process) holds the
canonical flock for as long as any host job runs, so a stale launcher on an older checkout
queues behind Dash instead of overlapping it; the guard stays until the operator records that
no such checkout can execute. Rollback is drain-before-switch. The shim in
`bin/heavy-lock-lib.sh` is a new production entry, `run_heavy_job`, used by the five launchers:
when `/home/puni1/.config/dash/host-pool.json` exists on Linux it runs `ops job run --type
$HEAVY_LOCK_JOB_TYPE`, forwarding the wait and poll budgets explicitly as flags (the gate
unexports `HEAVY_LOCK_WAIT_SECONDS` on purpose); a missing or unreadable config beside an
existing ledger is exit 70, never legacy mode; a caller with no type is 64. `with_heavy_lock`
with its explicit path argument stays as the test and fixture primitive and takes no enrollment
decision. No variable selects the mechanism.

**J13. Exit codes and `status` keep their contracts (F4).** The shim is an outer shell that
runs the payload through Dash and returns its status, so a caller's `EXIT` trap runs once (the
gate's trusted-launcher cleanup); 64/65/66/70/73/74/75/78, payload status pass-through and
signal behaviour are pinned by enrolled-host entrypoint tests. `ops job status` prints running
jobs (type, label, pid, age, envelope, peak so far, units held, settlement state) then waiters
oldest first with age, budget left and overtake count; `bin/with-heavy-lock.sh status` keeps
its first line while the legacy mode or the singleton guard is on.

**J14. The first envelopes are estimates with a short `until`.** Four types here and one in
`puni-pr-00`, estimated from 2026-11-01's readings, `until: 2026-12-01`; task 6.4 calibrates
them before any host flips to concurrent mode.

**J15. Two gate trees per gate host; the gate takes its tree from the admission (F4).**
`bin/h2puni-gate.sh` splits into an outer launcher (resolves the sha, labels, calls
`run_heavy_job`) and the admitted payload, which reads `DASH_JOB_UNIT_GATE_TREE` and then runs
the pinned-head checks against that tree; on an enrolled host the payload refuses 64 without the
variable. The role clones `~/puni-00-gate-tbf2` frozen-installed; h2puni's disk is cleaned
first per the recorded order.

**J16. Containers a job starts run under declared bounds or the type is serialised (F5).** A
type declares `containers: none` or a declared bound `{ memoryGib, cpuCores }`; its containers
must be started with that bound (`docker run --memory --cpus`, labelled `puni.job=<use id>`),
so the bound is enforced by Docker's own cgroup and counted into the envelope as declared. The
run samples labelled containers through the docker adapter's reading as evidence, knowing that
reading omits containers that vanish between samples and that Docker's figure excludes file
cache; the evidence is advisory, the bound is what admission trusts. A run during which an
unlabelled or unbounded container, build engine or Dagger session started is recorded
`attribution_incomplete` and the type becomes ineligible for concurrency until covered; the
gate's solver smoke must therefore run its containers bounded and labelled before two gates may
overlap. `cap` bounds the scope and the declared containers, nothing more, and the README says
so.

**J17. One tool; `ops job …` now; the `dev` migration is its own change (Codex's
recommendation).** The job commands land as `twilight-dash ops job run|calibrate|propose|
audit|status` and `ops pool init|inspect|switch-mode`. Moving today's commands under `dev` and
`ops`, with aliases and their removal, is a separate compatibility change. State stays as it is:
the host pool is the `resources` runtime's ledger; ADR 0051's separation is of trust domains, not
of two consumers reserving one host. A fourth tool is Dany's ADR, later, if the `ops` records
diverge.

**J18. Everything the lock proved stays proved.** Every case of `bin/heavy-lock.test.sh`
passes unchanged against the explicit-path primitive; the shim's enrolled branch gets its own
cases; the admission queue gets an `fc.asyncModelRun` model with admissions, exits, deadline
crossings, cancellation, simultaneous contenders, several barriers, calibration and crash
recovery at each boundary, with sabotage proofs watched red before the slice lands.

## Risks / Trade-offs

- **An envelope lies and two jobs OOM.** `observe` throttles but does not kill. Mitigations:
  per-dimension headroom, the overrun kept visible until superseded, `cap` for the types that
  must not take the host down, the first month's `until`. The alternative, admission on measured
  numbers, is the silent adoption P7 refused.
- **Shared mutable state the envelope cannot see.** Found by inventory, not measurement; the
  inventory covers all five launchers and cross-type pairs, and real launcher negatives drive two
  of them concurrently before a host flips.
- **The singleton guard serialises more than needed.** While it holds the flock, legacy callers
  wait for all Dash jobs; that is the price of no overlap, lifted when no stale checkout can run.
- **`systemd --user` dies with the last session.** Linger is a prerequisite; a later manager
  failure is a telemetry failure on the record, not a hole.
- **The protocol amendment of `dash-resource-cleanup`.** A `host_job` registered after the fact
  is a use WBS learns about late; it carries its authority ownership so a lost planning link
  cannot strand it. Stated in the delta spec.
- **Burokrat judges dates.** `JOB-CATALOGUE` compares `until` to the supplied instant; Dash
  supplies it, as for every dated rule.

## Review disposition

Codex Astra (gpt-6-astra, high), 2026-11-01, verdict NEEDS AMENDMENTS. F1 → J4, J17; F2 →
J1, J2', J5; F3 → J12; F4 → J12, J13, J15; F5 → J16; F6 → Placement; F7 → J5; F8 → J6; F9 →
J7, J8; F10 → J2; F11 → J9; F12 → J10; F13 → J3, task 6.2; F14 → the two delta specs, J18,
tasks. Nothing was declined; F5 is met by declared and enforced container bounds rather than a
full attribution manifest, with incomplete attribution serialising the type.
