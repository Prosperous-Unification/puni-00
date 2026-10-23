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
