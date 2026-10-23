## ADDED Requirements

### Requirement: Claims are a resource of their own

The coordinator SHALL track claims as a fifth resource beside tree, steps, grouped directory and
calendar markers, with its own installation authority, failure state and installed `readAt`.
`tree_replaced` SHALL invalidate tree and claims; `claims_changed` SHALL invalidate claims
only; `plan_unavailable` SHALL invalidate the tree only; an unknown event SHALL invalidate
every resource, claims included.

#### Scenario: A heartbeat refreshes claims alone

- **WHEN** `claims_changed` arrives
- **THEN** a claims read runs and no tree, steps, directory or marker read is requested

#### Scenario: A reap refreshes both

- **WHEN** `tree_replaced` arrives after a sweep release
- **THEN** a tree read and a claims read run, and each installs on its own

#### Scenario: A failed claims read leaves the tree alone

- **GIVEN** a claims read failed and the previous claims remain drawn
- **WHEN** a later tree read succeeds
- **THEN** the claims stale state remains until a covering claims read succeeds

### Requirement: An unsequenced frame is a hint, and a resume rereads claims

fe-01's project stream SHALL treat a frame for its subscription with no `seq` as a change hint
for the type it names, mapped as any event: it SHALL NOT advance, read or reset the resume
point, and no `seen` follows its read. Because such frames are never replayed, the coordinator
SHALL read claims whenever the stream synchronises: on every `resume_ack` (whatever its
`replayed` count), on `resume_denied`, and on the first subscribe.

#### Scenario: An unsequenced claims_changed refreshes claims

- **WHEN** a frame `{ subscription, message: { type: 'claims_changed' } }` arrives with no `seq`
- **THEN** a claims read runs and the resume point is unchanged

#### Scenario: A resume rereads claims

- **WHEN** the socket reconnects and the gateway answers `resume_ack` with nothing replayed
- **THEN** a claims read runs
