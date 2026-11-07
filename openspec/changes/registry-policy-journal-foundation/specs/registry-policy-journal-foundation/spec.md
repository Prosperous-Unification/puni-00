## ADDED Requirements

### Requirement: Pure bounded publication planning

The foundation SHALL validate byte/inode measurements and conservative publication envelopes, refuse admission at ninety percent of effective capacity or insufficient host reserve, and retain unresolved reservation charges. Invalid or unknown input MUST throw; planning MUST perform no IO.

#### Scenario: Publication reaches an exact cutoff

- **WHEN** usage plus reservation and envelope reaches ninety percent of effective bytes or inodes, including safe-integer capacity boundaries
- **THEN** admission refuses with the required capacity and reasons

#### Scenario: Measurements are malformed

- **WHEN** required capacity is missing, nonfinite, negative or fractional
- **THEN** planning throws rather than treating unknown capacity as free space

### Requirement: Exact retained content planning

The foundation SHALL retain newest ten promoted bundles per product, current and two prior registered environment releases, unfinished operations, seven-day unpromoted obligations and exact protection closures. It MUST reject incomplete ownership/history/graphs and count shared content once. Plans SHALL remain advisory.

#### Scenario: A retained consumer shares one tier with old releases

- **WHEN** fourteen complete releases share a protected tier while older unique tiers are eligible
- **THEN** the shared tier survives and eligible unique tiers remain reclaimable

#### Scenario: A dependency is unknown

- **WHEN** a root or dependency is absent from the supplied complete graph
- **THEN** retirement planning throws without granting deletion authority

### Requirement: Durable serialized ownership records

The explicitly invoked journal command SHALL validate owner-only trusted state and serialize commands under a kernel flock. It SHALL persist versioned ownership, exact references, reservations and ordered maintenance phases before acknowledging. Failed or crashed operations MUST retain unresolved obligations; stale revisions, owners, tokens and skipped phases MUST fail.

#### Scenario: A publisher dies before acknowledgement

- **WHEN** a process commits a reservation and is killed before returning
- **THEN** readback retains that reservation and a second publication is refused

#### Scenario: A competing process holds the kernel lock

- **WHEN** another process holds the journal lock
- **THEN** the command refuses and does not alter canonical state

### Requirement: Bounded durable replacement and recovery

The journal SHALL reject missing, unreadable, malformed or insecure state, bound requests and replacement capacity, reserve failure headroom and require file/directory fsync. It SHALL reclaim only validated replacement orphans after validating canonical state; initialization MUST preserve possible recovery evidence.

#### Scenario: Durable sync fails

- **WHEN** replacement file or directory fsync fails
- **THEN** the command fails without acknowledgement and preserves recoverable canonical state

#### Scenario: Only a crashed replacement remains

- **WHEN** initialization finds a possible replacement without canonical state
- **THEN** it refuses and preserves that file

### Requirement: Chronological canonical receipts

The journal SHALL compare accepted canonical receipt timestamps as instants, including expanded and negative ISO years. A backwards receipt MUST fail before acknowledgement or durable mutation; valid forward and equal receipts SHALL succeed.

#### Scenario: Canonical timestamp spelling reverses lexical ordering

- **WHEN** a command crosses from year 9999 to year +010000 or orders negative expanded years
- **THEN** the command follows chronological ordering and rejects a true reversal without changing durable state

### Requirement: Explicit dormant command boundary

The foundation SHALL add no existing runtime caller, installer, target or deployment wiring. Its stdin CLI SHALL accept exactly one owner-only directory argument, bound input before parsing and acknowledge only after the journal command succeeds. Reconciliation and maintenance phases SHALL remain trusted caller assertions rather than physical evidence.

#### Scenario: The CLI receives oversized input or an authority bypass argument

- **WHEN** stdin exceeds sixty-four KiB or an additional --locked argument is supplied
- **THEN** the CLI fails without a success response
