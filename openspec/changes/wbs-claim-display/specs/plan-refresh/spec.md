## ADDED Requirements

### Requirement: Claims are a resource of their own

The coordinator SHALL track claims as a fifth resource beside tree, steps, grouped directory and
calendar markers, with its own installation authority, failure state and installed `readAt`.
`tree_replaced` SHALL invalidate tree and claims; `claims_changed` SHALL invalidate claims
only; `plan_unavailable` SHALL invalidate the tree only; an unknown event SHALL invalidate
every resource, claims included. Claims SHALL NOT gate the baseline, and a claims obligation
SHALL NOT hold the stream acknowledgment.

#### Scenario: A heartbeat refreshes claims alone

- **WHEN** `claims_changed` arrives
- **THEN** a claims read runs and no tree, steps, directory or marker read is requested

#### Scenario: A reap refreshes both

- **WHEN** `tree_replaced` arrives after a sweep release
- **THEN** a tree read and a claims read run, and each installs on its own

#### Scenario: The baseline does not wait for claims

- **WHEN** the initial claims read fails
- **THEN** the baseline is still established from the tree and the other resources, and claims
  alone are stale

#### Scenario: Claims never hold the stream acknowledgment

- **GIVEN** the claims read keeps failing
- **WHEN** `tree_replaced` events arrive and their tree reads succeed
- **THEN** the acknowledged sequence advances with the tree, and a later successful claims read
  still installs

#### Scenario: A failed claims read leaves the tree alone

- **GIVEN** a claims read failed and the previous claims remain drawn
- **WHEN** a later tree read succeeds
- **THEN** the claims stale state remains until a covering claims read succeeds

### Requirement: Claims announcements are transient

`claims_changed` is a live announcement that the durable event log does not hold and a resume
does not replay; it may carry no sequence. fe-01 SHALL treat it as a claims-only invalidation
whatever sequence it carries, and it SHALL neither move, hold nor open a gap in the stream
acknowledgment. Every time the stream synchronises, on an accepted resume and on a refused one
alike, fe-01 SHALL reread claims. A change whose sequence is not a whole number SHALL NOT enter
the sequence bookkeeping.

#### Scenario: An unsequenced heartbeat

- **WHEN** a `claims_changed` frame arrives with no sequence
- **THEN** a claims read runs, no other read is requested, and the acknowledged sequence is
  unchanged

#### Scenario: A sequence on a transient announcement is ignored

- **WHEN** a `claims_changed` frame carries a sequence
- **THEN** it is handled exactly as an unsequenced one

#### Scenario: A reconnect rereads claims

- **WHEN** the stream reconnects and the server accepts the resume
- **THEN** one claims read runs, since the gap's claims announcements are not replayed

#### Scenario: A malformed sequence is dropped

- **WHEN** a frame carries a sequence that is not a whole number
- **THEN** no invalidation is made from it
