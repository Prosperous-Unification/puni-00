## ADDED Requirements

### Requirement: be-01 reports the commit it booted with

be-01's `/health` SHALL report `bootCommit`, the checkout commit read once when the process booted through the same resolver as `commit`, on its 200 answer and on every 503 `dependency_unavailable` refusal. `commit` SHALL keep following the checkout on every request.

#### Scenario: the checkout moves under a running process

- **WHEN** be-01 boots with its checkout at commit A and the checkout then moves to commit B without a restart
- **THEN** `/health` answers `commit` B and `bootCommit` A

#### Scenario: no repository at boot

- **WHEN** be-01 boots where no `.git` can be read
- **THEN** `/health` answers `bootCommit: null`

### Requirement: A dev deploy is done only when be-01 booted the new commit

After a reset, `tools/tool-devsync` SHALL observe be-01's `bootCommit` until it equals the new HEAD or a bounded window closes. If it does not converge, it SHALL restart the container once and observe for a second bounded window. If be-01 still has not booted the new HEAD, the deploy SHALL fail naming the tier and what it reported. An unreadable `/health`, a body without `bootCommit` or a `null` value SHALL count as not yet booted, never as converged.

#### Scenario: the watcher reloads in time

- **WHEN** be-01's `bootCommit` equals the new HEAD within the first window
- **THEN** the deploy continues without a restart

#### Scenario: a stale watcher repaired by the restart

- **WHEN** be-01's `bootCommit` stays at the previous commit through the first window and equals the new HEAD after the restart
- **THEN** the container is restarted exactly once and the deploy continues

#### Scenario: a boot commit that never moves

- **WHEN** be-01's `bootCommit` stays at the previous commit through both windows
- **THEN** the container is restarted once and the deploy fails naming be-01 and the previous commit, after a bounded number of observations

#### Scenario: health unreadable throughout

- **WHEN** be-01's `/health` cannot be read in either window
- **THEN** the deploy fails naming why the read failed

#### Scenario: a deploy that restarted for a restart path

- **WHEN** the reset changes a `RESTART_PATHS` entry, so the deploy restarts the container itself, and be-01 boots the new HEAD after the watch window but within the restart window
- **THEN** the container is restarted exactly once

#### Scenario: a reset no watcher reloads

- **WHEN** be-01 booted a commit whose difference from the new HEAD touches nothing under `apps/`, `libs/` or `tools/`
- **THEN** the container is restarted after the first observation instead of after the watch window

### Requirement: A stale boot is synced but unproven

When the deploy fails because be-01 never booted the new HEAD, `tools/tool-devsync` SHALL exit 76, and the poller SHALL then record that commit as synced but not proven, so later ticks retry only the `/health` proof and never reset the checkout back or restart the container again.

#### Scenario: be-01 never boots across several ticks

- **WHEN** the deployer exits 76 with the checkout at the target, and later ticks find `bootCommit` still at the previous commit
- **THEN** across those ticks the deployer and its restart run once, no backward reset happens, `last-synced` names the target and `last-proven` is not written

## MODIFIED Requirements

### Requirement: A dev deploy is done only when its checkout commit is proven

The poller SHALL treat a deploy as proven only when be-01's `/health` answers HTTP 200 with `status:"ok"` and a `bootCommit` equal to the fetched 40-hex SHA; an absent, `null` or abbreviated `bootCommit` SHALL NOT prove it, whatever `commit` says. It SHALL persist the last proven SHA, and on every tick where that value differs from `HEAD` it SHALL re-attempt the proof even when `HEAD` already equals `origin/main`.

#### Scenario: proof unreadable, then recovered

- **WHEN** one tick resets to a new commit but `/health` is unreadable, and a later tick reads the matching boot commit
- **THEN** the first tick exits non-zero without advancing `last-proven`, and the later tick proves it and records it

#### Scenario: health degraded

- **WHEN** `/health` answers 503 with a body containing the fetched commit
- **THEN** the proof fails

#### Scenario: a stale process

- **WHEN** `/health` answers 200 with `commit` equal to the fetched SHA and `bootCommit` equal to the previous one
- **THEN** the proof fails

#### Scenario: nothing new and already proven

- **WHEN** `HEAD`, `origin/main` and `last-proven` are equal
- **THEN** the tick exits zero without calling `/health`
