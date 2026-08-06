## ADDED Requirements

### Requirement: A work item can depend on another finishing

be-01 SHALL store finish-to-start dependencies between work items of the same
project. A dependency declared on a work item with children applies to every leaf
beneath it: all of them must finish before any leaf beneath the successor starts.
Dependencies MUST be reported with the tree so a reader sees them beside the rows
they constrain.

#### Scenario: a dependency is recorded and read back

- **WHEN** a dependency is added from one work item to another in the same project
- **THEN** reading the project reports it against the dependent work item

#### Scenario: a dependency on a parent constrains its whole branch

- **WHEN** a work item depends on a parent that has two leaves beneath it
- **THEN** it is scheduled to start after the later of those two leaves finishes

#### Scenario: a dependency is removed

- **WHEN** a recorded dependency is deleted
- **THEN** it no longer appears and the schedule is computed without it

### Requirement: A dependency that could not be satisfied is refused

be-01 MUST reject a dependency that would create a cycle, and one between a work
item and its own ancestor or descendant, without writing anything. A parent
already spans its children, so asking it to wait for one of them is asking it to
start after itself.

#### Scenario: a cycle is refused

- **WHEN** a dependency is added whose successor can already reach the predecessor
- **THEN** be-01 responds 409 `cycle` and nothing is written

#### Scenario: an ancestor is refused

- **WHEN** a work item is made to depend on its own parent
- **THEN** be-01 responds 409 `ancestor` and nothing is written

#### Scenario: a work item cannot depend on itself

- **WHEN** a work item is made to depend on itself
- **THEN** be-01 responds 409 `ancestor` and nothing is written

#### Scenario: a dependency across projects is refused

- **WHEN** a dependency names a work item in another project
- **THEN** be-01 responds 404 `not_found` and nothing is written

### Requirement: Every work item reports when it can start and finish

be-01 SHALL compute a schedule on read, in whole days counted from the project's
day zero. A leaf's duration is the PERT expected value of each role's three-point
estimate, `(optimistic + 4 × realistic + pessimistic) / 6`, summed across its
roles. A leaf with no estimate has a duration of zero and MUST be reported as
unestimated, because a zero that means "instant" and a zero that means "nobody has
looked" are the same number and opposite facts.

A parent has no duration of its own: it starts when the earliest of its
descendants starts and finishes when the last of them finishes. That span is not
its rolled-up effort and MUST NOT be reported as though it were.

#### Scenario: a leaf with no predecessor starts at day zero

- **WHEN** a leaf has no dependency
- **THEN** its earliest start is day 0 and its earliest finish is its duration

#### Scenario: a leaf waits for its predecessor

- **WHEN** a leaf of duration 2 depends on a leaf that finishes on day 3
- **THEN** its earliest start is day 3 and its earliest finish is day 5

#### Scenario: a parent spans its children rather than summing them

- **WHEN** a parent has two independent children of 3 and 4 days
- **THEN** the parent's span is day 0 to day 4, while its rolled-up effort stays 7 days

#### Scenario: an unestimated leaf is reported as such

- **WHEN** a leaf has no estimate for any role
- **THEN** its duration is 0 and it is reported as unestimated

### Requirement: The work items that set the project's length are marked

be-01 SHALL compute the latest each work item could start without moving the
project's finish, and report the difference from its earliest start as float. A
work item with zero float is on the critical path.

#### Scenario: the long chain is critical

- **WHEN** two chains run in parallel and one finishes later than the other
- **THEN** every work item in the longer chain has zero float and is critical

#### Scenario: a work item with slack is not critical

- **WHEN** a work item can start two days late without moving the project's finish
- **THEN** its float is 2 and it is not critical

#### Scenario: a cyclic graph is refused rather than scheduled

- **WHEN** the schedule is computed over a graph containing a cycle
- **THEN** it throws rather than returning a schedule no reader could tell was wrong
