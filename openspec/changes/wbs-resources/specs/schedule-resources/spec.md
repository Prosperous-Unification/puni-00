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
for, as the capacity floor sentence names a team.

#### Scenario: Hover names the resource

- **WHEN** a block started later than its predecessors allowed because `h2puni ram` was
  exhausted
- **THEN** its hover sentence names `h2puni ram` and the units

### Requirement: The plan filters by the resource a leaf demands

The plan's Filters panel SHALL offer a Resource facet listing, by the tree read's
`demandedResources` names, every resource some leaf of the plan demands, plus any resource
still ticked; a parent's own stored demand SHALL NOT be offered or matched, because it
charges nothing. Ticking resources SHALL keep the leaves demanding any of them (OR within the
facet, AND with every other facet and the typed name) and the ancestors that place them,
without their subtrees, as every facet does. A plan whose read carries no demands SHALL draw
no Resource group. The facet SHALL count in the Filters badge, be stored in a saved view as
`resourceIds` and applied back from it (a view saved before the facet existed applies as
asking nothing about resources; a non-list `resourceIds` drops that view alone), and be named
in the filter's words as `resource <name> or <name>`, which the on-screen export's Scope line
and an unnamed saved view use. A ticked resource no leaf demands any longer SHALL read `a
resource this plan has not loaded` and narrow to nothing.

#### Scenario: Ticking staging

- **WHEN** `Build` and `Smoke` demand `staging`, `Lint` demands only `h2puni ram`, and their
  parent `Gate` states `disk` itself
- **THEN** the Resource group offers `h2puni ram` and `staging` but not `disk`, and ticking
  `staging` shows `Gate`, `Build`, `Deploy` and `Smoke`, only the two leaves marked as matches

#### Scenario: No demands, no group

- **WHEN** a plan's tree read carries no `demands`
- **THEN** the Filters panel draws no Resource group

#### Scenario: A saved view by resource

- **WHEN** a reader ticks `staging`, saves the view unnamed and reloads the plan
- **THEN** the view is named `resource staging`, stores `resourceIds: [<staging>]`, and
  applying it ticks `staging` and narrows the plan as before
