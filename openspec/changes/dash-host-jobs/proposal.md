## Why

Every heavy run on a gate host (gate, release build, solver image publish, website dev build,
`test:queued`) serialises behind one shell `flock`, a mutex that knows nothing about what a run
needs. On 2026-11-01 at 10:30 UTC h2puni ran one gate with 11.7 of 15.6 GiB free while four runs
had waited up to 2.4 hours. WBS models resources, occupancy, leases and compute providers, but
none sees a heavy run. Nobody knows what a gate costs, so nobody can say whether two fit.

## What Changes

**A job catalogue** in the repository names every job type: entrypoint, envelope (cores, memory,
tmp disk, exclusive units such as a gate tree) and where it was measured. Twilight Burokrat
validates it; an uncatalogued type is refused.

**A host pool in Twilight Dash** replaces the lock on an enrolled host: `twilight-dash ops job run`
admits a host job when its envelope fits, oldest first with a starvation barrier, and runs it in
its own cgroup scope so peak memory, CPU, tmp disk and duration are kept per run. A calibration run
measures a type alone and proposes an envelope; an audit names drift. The catalogue changes only
through git.

**WBS shows it:** the pool as a compute provider measure, each host job as a resource use. WBS
never admits a host job.

**Dash gains two namespaces**, `dev` and `ops`, the reversible first step of the split Dany weighs.

## Non-Goals

Cross-host scheduling; host jobs taking WBS claims; macOS and unenrolled hosts (they keep the
shell lock); CPU quotas; unlabelled container memory; billing.

## Constraints

- Admission is local: a gate must run while WBS is down.
- One mechanism per host: while any launcher still uses the shell lock, Dash holds it for every job.
- The declared envelope decides admission; a measurement only proposes.
- Every refusal ships a watched negative; the queue gets a model-based race test.

## Capabilities

### New Capabilities

- `host-jobs`: catalogue, pool, measured runs, calibration, audit, status, transition, projection.

### Modified Capabilities

- `compute-provider`: a `host_pool` measure whose usage is reserved units.
- `heavy-lock-queue`: `bin/with-heavy-lock.sh` defers to the pool on an enrolled host.

## Domain Terms

Job type, Job envelope, Host job, Host pool, Calibration run, Envelope drift.

## Decisions Recorded

No ADR yet. J1 to J18 in design.md are assumed, overrulable by id; J17 (one tool, two namespaces)
is Dany's call.

## Impact

`infra/jobs/`, `twilight-dash` (`src/ops`), one Burokrat rule, `bin/heavy-lock-lib.sh` and its
five callers, the `gate_host` role, one WBS measure and chip state, two runbooks.
