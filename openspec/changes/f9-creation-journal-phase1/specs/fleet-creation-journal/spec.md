## ADDED Requirements

### Requirement: Exclusive durable creation reservation

A k3d up invocation SHALL reserve a new owner-only creation journal bound to a validated lab ID, UUID attempt ID and nonempty Docker daemon ID before creating external resources. The journal SHALL be exclusively created and synchronized with its containing directory before creation proceeds.

#### Scenario: Occupied attempt

- **WHEN** a creation attempt selects an existing journal
- **THEN** reservation fails without overwriting that journal or invoking resource creation

#### Scenario: Invalid identity or failed persistence

- **WHEN** the attempt identity is invalid or journal persistence fails
- **THEN** resource creation is refused and the error propagates

### Requirement: Durable isolated terminal transitions

A creating journal SHALL transition atomically to ready or failed, with exclusive serialization per attempt. Terminal transitions SHALL be refused. Different attempts SHALL retain separate journal histories across ordinary up, down and up.

#### Scenario: Creation fails

- **WHEN** resource creation throws
- **THEN** the attempt records failed state before the error propagates, the wrapper performs no cleanup, and output reports resource state as unknown

#### Scenario: Separate attempts and repeated ordinary lifecycle

- **WHEN** distinct attempts run concurrently or ordinary up/down/up repeats
- **THEN** their identities and terminal states remain distinct, and ordinary down does not remove attempt journals

#### Scenario: k3d creation fails internally

- **WHEN** the pinned k3d cluster-create command fails after partial creation
- **THEN** the wrapper has explicitly passed `--no-rollback`, disabling the tool's automatic failure rollback, records failed state and requires manual inspection without claiming resource ownership

### Requirement: Strict consuming lifecycle boundary

The receipt-consuming lifecycle API SHALL require an owner-only regular journal file owned by the invoking user, without following a final symlink or blocking on a FIFO, and SHALL validate its exact schema and expected attempt, lab and daemon identities. It SHALL refuse deletion for valid journals while the identity executor is disabled.

#### Scenario: Missing journal

- **WHEN** the consuming lifecycle cannot find the requested journal
- **THEN** it reports absence before deletion

#### Scenario: Unreadable journal

- **WHEN** the journal exists but cannot be read or has forbidden permissions
- **THEN** the consuming lifecycle reports that refusal before deletion

#### Scenario: Malformed or mismatched journal

- **WHEN** journal contents are malformed, contain unknown fields, or identify another attempt, lab or daemon
- **THEN** the consuming lifecycle refuses the journal before deletion

#### Scenario: Valid journal

- **WHEN** the journal passes the consuming boundary
- **THEN** deletion is refused because the identity executor is disabled

#### Scenario: Nonregular journal

- **WHEN** an owner-only FIFO occupies the requested journal path
- **THEN** the consuming boundary opens nonblocking and rejects the opened descriptor before reading contents

#### Scenario: Foreign owner identity

- **WHEN** the directory owner or opened file owner differs from the consuming process identity
- **THEN** the boundary rejects that ownership mismatch independently of the permission mode
