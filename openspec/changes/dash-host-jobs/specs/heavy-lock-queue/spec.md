## ADDED Requirements

Written as ADDED because the `heavy-lock-queue` main spec has not been synced from
`fifo-heavy-lock` yet; it adds the production entry beside that change's requirements.

### Requirement: Production callers enter through one entry that defers to the host pool

`bin/heavy-lock-lib.sh` SHALL expose `run_heavy_job`, the only entry the production launchers
call, which on Linux defers to `ops job run` when `/home/puni1/.config/dash/host-pool.json`
exists and otherwise takes the `flock` with the arrival-order queue as before; `with_heavy_lock`
with its explicit path argument SHALL remain unchanged for fixtures. `run_heavy_job` SHALL
forward `HEAVY_LOCK_WAIT_SECONDS` and `HEAVY_LOCK_POLL_SECONDS` as explicit flags and SHALL NOT
export them into the payload. Exit codes 64, 70, 75, 130 and 143 SHALL keep their meanings, and
73 SHALL mean an envelope that cannot fit the empty pool.

#### Scenario: Budgets reach Dash without reaching the payload

- **WHEN** the gate calls `run_heavy_job` with `HEAVY_LOCK_WAIT_SECONDS=1800` unexported
- **THEN** `ops job run` receives `--wait-seconds 1800` and the payload's environment has no
  `HEAVY_LOCK_WAIT_SECONDS`

#### Scenario: Fixtures keep the primitive

- **WHEN** `bin/heavy-lock.test.sh` calls `with_heavy_lock` with a private lock path on an
  enrolled host
- **THEN** it takes that path's `flock` and never consults the pool config

### Requirement: A nested call runs on its enclosing job's admission only when that job runs

When `DASH_JOB_ID` is set, `run_heavy_job` SHALL take no lock and ask for no admission of its
own. It SHALL run the payload with `HEAVY_LOCK_LABEL=<outer label>/<type>` only if all of these
hold: the id has a job id's shape; this process runs in, or under, a cgroup scope named
`dash-job-<id>.scope`; the type declares no exclusive unit; the host is enrolled; and `ops job
admission` of the caller's own checkout answers, within its timeout, that the host pool ledger
has that job running. Otherwise it SHALL exit 70 without running the payload, or 64 for a type
the catalogue does not name. `ops job admission` SHALL open the ledger read-only and SHALL
refuse 70, migrating nothing, a ledger whose schema version it does not read.

#### Scenario: A nested test run inside a running gate is re-labelled

- **WHEN** a gate job's payload, in its `dash-job-<id>.scope`, runs `bun run test:queued` and
  the ledger has job `<id>` running
- **THEN** the payload runs as `<gate label>/test-queued`, with no lock taken and no second
  admission

#### Scenario: A scope named for a job the ledger has not running is refused 70

- **WHEN** a same-account process makes `systemd-run --user --scope --unit dash-job-<id>` and
  calls `run_heavy_job` with that `DASH_JOB_ID`, and the ledger has no running job `<id>`
- **THEN** it exits 70 naming the job, and the payload does not run

#### Scenario: Outside the named scope, with an exclusive unit, or unenrolled, it is refused 70

- **WHEN** `DASH_JOB_ID` is set but the process runs outside `dash-job-<id>.scope`, or the type
  declares an exclusive unit, or the host has no host pool configuration
- **THEN** it exits 70 and nothing runs, locked or admitted

#### Scenario: A Dash that cannot answer is not an admission

- **WHEN** `ops job admission` exits non-zero, does not answer within its timeout, refuses a
  ledger of another schema version, or answers about another job
- **THEN** the nested call exits 70 and the payload does not run
