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
  runs. An `overrun` stays visible until an accepted envelope supersedes it. Accepted means the
  entry at HEAD covers the peak, or the entry changed after the run to `calibrated` provenance.
  Overruns never age out.

## Changing an envelope

Nothing writes this file but a reviewed commit. The loop is:

1. `twilight-dash ops job calibrate --type <id> -- <argv>` runs the job alone and records it.
2. `twilight-dash ops job propose --type <id>` prints a catalogue patch with the record ids.
3. The patch lands as a pull request; `JOB-CATALOGUE` judges it like any other change.
4. `twilight-dash ops job audit` names drift on later runs, and the loop starts again.

The commands are described in the Dash
[host jobs guide](../../apps/twilight-structure/twilight-dash/cli/docs/resources.md#calibration-proposal-and-audit-slice-4).
Cold, warm and two-job concurrent validation precede enabling concurrency on a host (task 6.5).
