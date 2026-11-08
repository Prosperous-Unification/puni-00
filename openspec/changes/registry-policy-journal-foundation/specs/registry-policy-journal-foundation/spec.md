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

### Requirement: Sticky write fence recovery

The journal SHALL keep its write fence after failed maintenance or a failed publication receipt, including after that publication is finished as abandoned, until maintenance completes. Completion SHALL reopen writes only when bytes and inodes are each strictly below seventy percent of effective capacity and host reserve is at least 20 GiB. Publication admission up to ninety percent MUST NOT clear the fence or grant write authority on its own.

#### Scenario: Maintenance completes at exactly seventy percent use

- **WHEN** maintenance completes with bytes or inodes at exactly seventy percent while publication admission would still admit
- **THEN** the journal stays fenced and a publication reservation is refused without changing durable state

#### Scenario: Maintenance completes with low host reserve

- **WHEN** maintenance completes with host reserve below 20 GiB
- **THEN** the journal stays fenced and a publication reservation is refused

#### Scenario: Maintenance completes below the recovery threshold

- **WHEN** maintenance completes with bytes and inodes strictly below seventy percent and at least 20 GiB host reserve
- **THEN** the fence clears and a publication can be reserved

#### Scenario: A failed publication is abandoned

- **WHEN** a failed publication receipt is later finished as abandoned
- **THEN** its reservation is released while writes stay fenced until maintenance completes

### Requirement: Whole-domain journal capacity

Journal replacement admission SHALL charge the entire measured capacity domain, including unrelated occupants, against the enrolled journal maximum; the CLI's statfs adapter measures the whole filesystem containing the journal. The journal maximum SHALL NOT be interpreted as a per-file or per-directory quota, and enrolling a shared filesystem's full size MUST NOT be treated as proof of physical isolation. Mount, quota and isolation verification remain outside this foundation.

#### Scenario: Measured domain usage approaches the journal maximum

- **WHEN** measured domain usage plus the replacement and failure headroom reaches ninety percent of the enrolled journal maximum, though the journal file itself is small
- **THEN** the command refuses without changing canonical state
