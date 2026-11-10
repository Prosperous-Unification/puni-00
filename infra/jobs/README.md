# Job catalogue

[`catalogue.json`](catalogue.json) lists every heavy job type this repository runs on a gate
host: `gate`, `release-build`, `test-queued` and `solver-image-publish`. Twilight Dash admits a
host job from a type's envelope; Twilight Burokrat's rule `JOB-CATALOGUE` judges the file. The
design is [`dash-host-jobs`](../../openspec/changes/dash-host-jobs/design.md) (J2, J9, J14, J16);
the terms are in the [Twilight glossary](../../docs/twilight-structure/CONTEXT.md).

Each repository owns the catalogue of its own jobs, at this same path. `website-dev-build` is
not here: it belongs to `puni-pr-00`, which declares it in its own `infra/jobs/catalogue.json`
and is judged from its own revision. A host names which repositories' catalogues it serves.

## Fields

The file is `{ "schemaVersion": 1, "jobs": [ … ] }`; the shape is `JobType` in
[`job-catalogue.ts`](../../apps/twilight-structure/twilight-burokrat/cli/src/contracts/job-catalogue.ts),
exported through `@twilight-burokrat/contracts`.

| Field             | Meaning                                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | The job type, lower-case words joined by `-`; what `ops job run --type` names.                                                                                                                       |
| `entrypoint`      | The file the job starts from, or a JSON file and the dotted key of a package script (`package.json#scripts.test:queued`). Each script entrypoint carries one comment naming its id; JSON holds none. |
| `argumentProfile` | The arguments the job takes, token for token (below).                                                                                                                                                |
| `envelope`        | What admission reserves: whole `cpuCores`, `memoryGib` and `tmpDiskGib`, and `exclusive` unit ids such as `gate_tree`. The host pool names the units; the catalogue only counts them.                |
| `containers`      | `"none"`, or the bound `{ memoryGib, cpuCores }` every container the job starts must run under. A type whose containers run unbounded is serialised.                                                 |
| `enforcement`     | `observe` throttles at the envelope and kills nothing; `cap` also kills at it. `cap` bounds the job's scope and its declared containers, nothing more.                                               |
| `provenance`      | Where the envelope came from (below).                                                                                                                                                                |

### Argument profile

Space-separated tokens matched one to one against the job's arguments: a literal token, or
`<sha>` for one full 40- or 64-character commit id. `""` takes no arguments. There is no
optional token, because a different argument shape is measured as a different partition, so it
is a different profile. Dash refuses arguments that do not match (`parseJobArguments`).

### Provenance

- `estimated`: a reading or a guess, with a `basis` sentence saying which, and an `until` date.
  `JOB-CATALOGUE` fails the entry from the day after `until`, judged at the instant its caller
  supplies; Burokrat reads no clock. Every envelope here is estimated until 2026-12-01.
- `calibrated`: proposed from measured runs, with `hostClass`, `calibratedAt`, `recordCount`,
  the `p95` per dimension and the `recordIds` it came from. `JOB-CATALOGUE` fails an envelope
  below its own p95 in any dimension.

## Heuristics (provisional)

These figures are **provisional** and will change after the first calibrations. Dash keeps them
in one place, `HEURISTICS` in
[`measures.ts`](../../apps/twilight-structure/twilight-dash/cli/src/ops/measures.ts):

- The proposal takes the **p95, nearest rank**, of complete, comparable records per dimension,
  partitioned by argument profile, host class and toolchain. Memory comes from runs that were
  neither capped nor throttled. CPU is the peak rate over a **ten-second** window, and duration
  is reported, from calibration runs alone. Tmp disk comes from every complete run.
- It multiplies by **1.25** (provisional) and rounds up to whole units.
- It needs at least **three** (provisional) complete records per dimension, calibration records
  for CPU and duration, or it refuses and names the count.
- `waste` drift is a p95 below half the envelope over **ten** (provisional) or more complete
  runs. An `overrun` stays visible until the entry at HEAD carries an envelope of at least the
  peak; a new provenance alone does not clear it, and overruns never age out.
- The proposal's window is, for now, the partition's entire run history (provisional).

## Changing an envelope

Nothing writes this file but a reviewed commit. The loop is:

1. `twilight-dash ops job calibrate --type <id> -- <argv>` runs the job alone and records it.
2. `twilight-dash ops job propose --type <id>` prints the replacement catalogue entry with the record ids.
3. The patch lands as a pull request; `JOB-CATALOGUE` judges it like any other change.
4. `twilight-dash ops job audit` names drift on later runs, and the loop starts again.

The commands are described in the Dash
[host jobs guide](../../apps/twilight-structure/twilight-dash/cli/docs/resources.md#calibration-proposal-and-audit-slice-4).
Cold, warm and two-job concurrent validation precede enabling concurrency on a host (task 6.5).

## Gate memory estimate (2026-11-10)

The gate now estimates 10 GiB, retaining `observe` enforcement and every other bound. H4 has
10 GiB allocatable memory, so this reservation prevents another positive-memory native
admission while the gate runs; it also waits for existing memory reservations to return.
It changes only a separate caller's catalogue: the canonical launcher still gates the explicit
frozen target in an assigned unit distinct from that caller.

This is provisional, not calibrated or a whole-process guarantee. An existing H4 gate at 6 GiB
MemoryHigh reached 7.55 GiB current/7.62 GiB peak, 2946 additional high events in 10 seconds and
roughly 98% scope full memory pressure. Two local forced WBS typechecks passed but recorded
single-child RSS 8,046,416 KiB and 9,676,704 KiB; neither experiment proves a full-gate bound or a
remote tuning fix. No Go/CPU tuning is proposed. The catalogue memory rationale records these provisional observations; receipt hashes,
scoped proof and limitations are in
[verification](../../openspec/changes/gate-memory-estimate/verify.md). The actual full gate
and its measured peak remain required before acceptance; no current job or host changes here.

Proof: the receipt-derived profile check failed four named cases with 6 GiB and passed with
10 GiB; 6 / 9 / 11 GiB and cap faults were observed and restored as recorded in that verification.
