## MODIFIED Requirements

### Requirement: A claim occupies its leaf's demand vector atomically

When `claimWorkItem` claims a step of a leaf that holds no other claim, it SHALL acquire,
in the same transaction, every resource the leaf demands: for each demanded resource with a
stated project capacity, the capacity minus the units occupied by other leaves of the
project SHALL cover the units, else the whole batch is refused `resources_exhausted`
carrying the resource, the units asked, the units free, and the holders (person, run, work
item) of the occupying claims. The refusal SHALL name every resource the claim is short of:
`resources` lists each one, in resource-id order, with its own units asked, units free and
holders, and the refusal's top-level resource, units and holders are its first entry. Units asked are the declared demand, or the claim's
`resources` entries when given, each of which MUST be ≥ the declared units for that
resource. A second claim on another step of the same leaf SHALL acquire nothing more unless it asks for more: each asked resource MUST be at least the standing occupancy (else `below_held_occupancy`), and units above it are acquired through the same check or refused `resources_exhausted`; the claim then holds the asked units while it stands, and the leaf's occupancy is the largest standing copy. The occupancy refusals are checked after `already_claimed` and before `inside_subtree_claim`, in the order `below_declared_demand`, `below_held_occupancy`, `resources_exhausted`; `resources_on_subtree` is checked with the other subtree refusals before `item_done`. The
release of the last claim of a leaf SHALL free its occupancy. A subtree claim SHALL acquire
nothing. Occupancy SHALL be readable per project and per resource at the service level; the startable read (`startable-work`) exposes free units.

The three occupancy refusals SHALL be checked after `already_claimed` and before
`inside_subtree_claim` in the claim's refusal order (`wbs-team-claims`), `below_declared_demand`
first. An unstated capacity SHALL never refuse; a stated 0 refuses any units. A claim that
names `resources` on a non-leaf SHALL be refused `resources_on_subtree`. A redo of a claim or
an undo of a release re-acquires through the same check and, refused, answers `stale_undo` whose
detail begins `resources_exhausted:`, as a redo answers every other check it fails.

#### Scenario: Twelve agents and 32 GB

- **WHEN** a project states 32 GB of `h2puni ram`, eight leaves each demand 4 GB and are
  claimed, and a ninth claim arrives for a leaf demanding 4 GB
- **THEN** the ninth batch is refused `resources_exhausted` with free 0, asked 4, and the
  eight holders listed

#### Scenario: A later claim on a held leaf asks for more

- **WHEN** a leaf demands 4 GB, agent A holds `Impl` (4 GB acquired) and agent B claims
  `Review` asking 8 GB on a capacity of 8 GB
- **THEN** B's claim acquires 4 GB more and the leaf occupies 8 GB; on a capacity of 6 GB B is
  refused `resources_exhausted` for 8; asking 2 GB is refused `below_held_occupancy`

#### Scenario: Undo of a multi-leaf release re-acquires all or nothing

- **WHEN** a superagent's release freed two delegated leaves of 4 GB each, another agent then
  took 4 GB of the 8 GB capacity, and the release is undone
- **THEN** the undo is refused `stale_undo` with detail `resources_exhausted:` and the
  occupancy stays at 4 GB

#### Scenario: Two steps of one leaf share one occupancy

- **WHEN** agent A claims `Impl` of a leaf demanding 1 worktree and agent B claims `Review`
  of the same leaf
- **THEN** B's claim is applied and the worktree occupancy of that leaf is still 1

#### Scenario: Release of the last claim frees the units

- **WHEN** both claims of that leaf are released
- **THEN** the project's free worktrees rise by 1, and releasing only A's claim first changed
  nothing

#### Scenario: Asking for more than declared

- **WHEN** a leaf declares 2 GB and the claim asks `resources: [{ ram, 6 }]`
- **THEN** 6 GB are acquired or the batch is refused `resources_exhausted` for 6; asking 1 GB
  is refused `below_declared_demand`

#### Scenario: Unstated capacity never refuses

- **WHEN** the project has no stated capacity for a demanded resource
- **THEN** the claim is applied whatever the other leaves hold

#### Scenario: Undo

- **WHEN** a claim's journal entry is undone
- **THEN** the occupancy it created is gone with it, and redo re-acquires or is refused
  `resources_exhausted` as a fresh claim would be

#### Scenario: A claim short of two resources names both

- **WHEN** a project states 8 GB of `h2puni ram` and 1 `h2puni worktree`, one leaf demanding
  6 GB and 1 worktree is claimed, and a claim arrives for another leaf demanding the same
- **THEN** the batch is refused `resources_exhausted` with `resources` naming RAM (asked 6,
  free 2) and the worktree (asked 1, free 0), each with the first leaf's holder, and the
  top-level fields naming RAM
