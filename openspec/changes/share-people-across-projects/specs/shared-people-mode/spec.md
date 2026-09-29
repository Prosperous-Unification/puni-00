## ADDED Requirements

### Requirement: The mode is per organization, isolated by default

`organization.shared_people` SHALL default to `0` (`isolated`). Under `isolated`, nothing in
this change SHALL move a date. Pre-activation (legacy) access SHALL read `isolated`.

#### Scenario: an isolated organization

- **GIVEN** an isolated organization where Ana is booked in two ranked projects
- **WHEN** the lower project is read
- **THEN** its dates are those it had before this change, and the load view reports the overlap

### Requirement: Rollback refuses to lose a shared organization

`down.sql` SHALL refuse while any organization is shared, naming
`shared-people-rollback-cli.ts save|remove|restore`; rank rows are refused by the rank
migration's own `down.sql`. `STORED_VOCABULARIES` SHALL gain
`capacityModes`, and the swap SHALL refuse an image lacking it while an organization is shared.

#### Scenario: a pre-feature image

- **GIVEN** a shared organization
- **WHEN** a swap targets an image whose vocabularies lack `capacityModes`
- **THEN** the swap refuses before moving traffic

### Requirement: Booking changes fan out down the rank

When a commit or a published optimized outcome changes a project's bookings hash, the process
SHALL publish `elsewhere_changed {projectId, causeProjectId}` to every project in the cause's
downward closure. A change that does not move the hash, such as a rename, SHALL publish nothing.

#### Scenario: a rename

- **WHEN** a work item in a ranked project is renamed
- **THEN** no project below it receives `elsewhere_changed`

### Requirement: Super-admins switch the mode

`PATCH /api/organization {sharedPeople}` SHALL be allowed only to a super-admin. An admin SHALL
be answered `403 forbidden`, and legacy access SHALL be answered `409 organization_required`.
The route SHALL ship only after the engines, the chain and fe-01 understand `shared`.

#### Scenario: an admin switches

- **WHEN** an admin patches `sharedPeople: true`
- **THEN** the answer is `403 forbidden` and the organization stays isolated
