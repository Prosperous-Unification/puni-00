## ADDED Requirements

### Requirement: Terminal parking follows renewal shutdown

The release coordinator SHALL stop its heartbeat and finish all pending renewals before parking a held Lease for rollback-failed, recovery-required, or flux-revert-required. It SHALL leave the terminal journal record, closed writes, and suspended Flux intact.

#### Scenario: Heartbeat remains in flight when rollback fails

- **WHEN** rollback records rollback-failed while a successful heartbeat renewal is delayed
- **THEN** parking waits for that renewal and the Lease retains parked=rollback-failed after executeRelease rejects with ReleaseFailedError

#### Scenario: Parking takes several heartbeat periods

- **WHEN** terminal parking takes longer than the configured heartbeat period
- **THEN** no heartbeat renewal runs during parking

### Requirement: Pending renewal failure prevents parking

The coordinator SHALL propagate a failed pending heartbeat renewal as LeaseLostError before attempting terminal parking. Waiting SHALL inherit the adapter's bounded subprocess deadlines rather than retry without a bound.

#### Scenario: Delayed heartbeat fails after terminal journal record

- **WHEN** rollback-failed is recorded and the pending heartbeat then rejects
- **THEN** executeRelease rejects with LeaseLostError containing the renewal failure and never calls parkLease
