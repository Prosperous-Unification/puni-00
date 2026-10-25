## MODIFIED Requirements

### Requirement: Both engines level demands as pools

Each resource's pool size SHALL be its effective pool size: the project capacity clamped to
the directory capacity when both are stated, the directory capacity when only it is stated
and the project demands the resource, else the project capacity; one function SHALL compute
it for every schedule input (live, saved-plan capture, chain snapshot, saved-plan schedule,
publication guard) and a directory capacity of 0 SHALL clamp the pool to 0. The Fast engine
SHALL treat each demanded resource with an effective pool size as a pool: every
block of a leaf acquires the leaf's demanded units on each such pool at its start and
releases them at its finish, acquired together with its team slots at one instant through
the joint window. The CP-SAT engine SHALL add one cumulative constraint per such resource
with demand equal to the units. Demands and effective pool sizes SHALL enter the canonical schedule
input and its hash (`resourceCapacities`, already hashed, so no contract bump). A plan with no demands SHALL produce a
byte-identical schedule to the previous contract (golden corpus no-op proof). An
`exclusive` resource with capacity 1 SHALL serialise its demanders. A schedule SHALL read no
claim, no occupancy and no other project's plan.

#### Scenario: Two leaves want the one staging environment

- **WHEN** two leaves of equal priority each demand the `exclusive` resource `staging` with
  capacity 1 and nothing else constrains them
- **THEN** their blocks do not overlap in either engine, and the second block's bound names
  `staging`

#### Scenario: No demands, no change

- **WHEN** the golden corpus is scheduled under the new contract
- **THEN** every schedule is byte-identical to the recorded one

#### Scenario: A claim does not move dates

- **WHEN** a leaf is claimed and its occupancy recorded
- **THEN** the project's schedule hash and dates are unchanged

#### Scenario: The project states more than exists

- **WHEN** a project states 32 GB of `host ram` whose directory capacity is 16, and two leaves
  each demand 16
- **THEN** both engines serialise the two leaves' blocks, and the schedule hash differs from
  the one with no directory capacity

#### Scenario: A saved plan and the live plan agree

- **WHEN** a plan with a clamped pool is captured as a saved plan
- **THEN** the saved plan's schedule hash equals the live schedule hash

#### Scenario: No directory capacity, same hash

- **WHEN** the golden corpus is scheduled with no directory capacity stated
- **THEN** every schedule and hash is byte-identical to the recorded one
