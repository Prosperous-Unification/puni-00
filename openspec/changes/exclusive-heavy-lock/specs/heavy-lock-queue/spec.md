## ADDED Requirements

### Requirement: The heavy lock is exclusive whatever mkdir reports

The heavy lock SHALL be held through `flock(2)` on the lock file, and no claimant SHALL decide
that it holds the lock from the exit status of `mkdir`. The holder record under `<lock>.d` SHALL
be examined, reclaimed and written only while the flock is held, and SHALL be removed before the
flock is released. The wrapped command SHALL run without the lock's file descriptor.

#### Scenario: Two claimants race under a mkdir that always succeeds

- **WHEN** two claimants start together and `mkdir` reports success for both
- **THEN** exactly one holds the lock and the other is refused 75

#### Scenario: Two claimants race to reclaim a dead holder

- **WHEN** the record names a dead pid and two claimants start together
- **THEN** exactly one reclaims it and the other is refused 75

#### Scenario: A live holder on the older code

- **WHEN** the record names a live pid and no flock is held
- **THEN** the claim is refused 75 and the record is left untouched

#### Scenario: No perl

- **WHEN** `perl` cannot be found
- **THEN** the run is refused 70 naming perl, and its command does not run
