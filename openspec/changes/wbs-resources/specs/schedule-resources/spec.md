## ADDED Requirements

### Requirement: Both engines level demands as pools

The Fast engine SHALL treat each demanded resource with a stated capacity as a pool: every
block of a leaf acquires the leaf's demanded units on each such pool at its start and
releases them at its finish, acquired together with its team slots at one instant through
the joint window. The CP-SAT engine SHALL add one cumulative constraint per such resource
with demand equal to the units. Demands and capacities SHALL enter the canonical schedule
input and its hash with a contract version bump. A plan with no demands SHALL produce a
byte-identical schedule to the previous contract (golden corpus no-op proof). An
`exclusive` resource with capacity 1 SHALL serialise its demanders. A schedule SHALL read no
claim and no occupancy.

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

### Requirement: Waits are explained by the resource

The Gantt hover sentence and the plan's bound reads SHALL name the resource a block waited
for, as the capacity floor sentence names a team, and a filter facet per resource is deferred to a later change (the tree read carries no demands to filter rows by).

#### Scenario: Hover names the resource

- **WHEN** a block started later than its predecessors allowed because `h2puni ram` was
  exhausted
- **THEN** its hover sentence names `h2puni ram` and the units
