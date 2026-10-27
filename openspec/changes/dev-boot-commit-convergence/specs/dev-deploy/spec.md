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
