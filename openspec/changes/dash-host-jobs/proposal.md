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

**A host pool in Twilight Dash** replaces the lock on an enrolled host: Dash's managed-resource
ledger gains cores, memory and exclusive units; `twilight-dash ops job run` admits a host job
from it when its envelope fits, oldest first with a starvation barrier, runs it in its own cgroup
scope, keeps its peaks per run, and settles each reservation on terminal evidence. A calibration
run proposes an envelope; an audit names drift. The catalogue changes only through git.

**WBS shows it:** reserved units on the capacity report, each host job as a resource use. WBS
never admits one.

**Dash gains `ops job …`**, the first `ops` namespace; the wider split is its own change.

## Non-Goals

Cross-host scheduling; host jobs taking WBS claims; macOS and unenrolled hosts (they keep the
shell lock); CPU quotas; types whose containers run unbounded (serialised); billing.

## Constraints

- Admission is local: a gate must run while WBS is down.
- One mechanism per host: while any launcher still uses the shell lock, Dash holds it for every job.
- The declared envelope decides admission; a measurement only proposes.
- Every refusal ships a watched negative; the queue gets a model-based race test.

## Capabilities

### New Capabilities

- `host-jobs`: catalogue, pool, measured runs, calibration, audit, status, transition, projection.

### Modified Capabilities

- `compute-provider`: reserved units beside measured usage on the capacity report.
- `heavy-lock-queue`: one production entry that defers to the pool on an enrolled host.

## Domain Terms

Job type, Job envelope, Host job, Host pool, Calibration run, Envelope drift.

## Decisions Recorded

No ADR yet. J1 to J18 in design.md are assumed, overrulable by id, amended after Codex Astra's
review of 2026-11-01; J17 is Dany's call.

## Impact

`infra/jobs/`, `twilight-dash` (`src/ops`), one Burokrat rule, `bin/heavy-lock-lib.sh` and its
five callers, the `gate_host` role, one WBS measure and chip state, two runbooks.
