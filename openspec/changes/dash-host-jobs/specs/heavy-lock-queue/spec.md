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
