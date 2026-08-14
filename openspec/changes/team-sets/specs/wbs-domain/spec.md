## ADDED Requirements

### Requirement: A work item's teams are a set, held in a join table

A work item SHALL carry **0..n** teams, stored one row per (work item, team)
pair rather than in a column on the work item.

Applying this change SHALL write one join row for every work item that already
carries a team, and none for a work item that carries no team. No plan's dates,
labels or export SHALL move: every set is of one member or empty, and a search
over a set of one is the search over that one.

Every read of a work item's teams SHALL read the join. The set SHALL come back
in one stable order, so two reads of an unchanged plan answer the same thing.

Both columns of the join SHALL cascade. Deleting a team SHALL take its join rows
with it as part of that delete, rather than leaving rows pointing at a team the
directory no longer holds — the outgoing release's own `DELETE FROM
service_team` SHALL keep working across a blue/green swap.

#### Scenario: a labelled work item is migrated into the join

- **GIVEN** a plan whose work item is labelled with a team
- **WHEN** the change is applied
- **THEN** the join SHALL hold exactly one row for that work item and team
- **AND** an unlabelled work item SHALL hold no join row
- **AND** the plan SHALL schedule exactly as it did before

#### Scenario: two teams on one work item read back as two

- **GIVEN** a work item joined to two teams
- **WHEN** the plan's work items are read
- **THEN** both teams SHALL come back, in one stable order

#### Scenario: removing a team takes its join rows with it

- **GIVEN** a team joined to a work item
- **WHEN** the team is removed from the directory
- **THEN** the work item SHALL be joined to no team
- **AND** the removal SHALL NOT fail on a constraint

### Requirement: The column and the join say the same thing until the column is retired

Every write that changes a work item's team SHALL write the column and the join
in one transaction while `work_item.service_team_id` exists, and the two SHALL
agree: the column SHALL hold the single member of the set, or null for the
empty set.

A duplicated subtree and a restored subtree SHALL carry their labels in the join
as well as in the column, so a copy and an undone deletion draw from the same
pools the original did.

A write path SHALL write at most one team per work item in this change. A set of
more than one SHALL be unreachable through any request.

#### Scenario: labelling a work item writes both

- **GIVEN** a work item with no team
- **WHEN** a client labels it with a team
- **THEN** the join SHALL hold that team for it
- **AND** the column SHALL hold the same team

#### Scenario: clearing a label clears both

- **GIVEN** a work item labelled with a team
- **WHEN** a client takes the label off
- **THEN** the join SHALL hold no row for it
- **AND** the column SHALL be null

#### Scenario: a duplicated branch keeps the pool it drew from

- **GIVEN** a labelled branch whose team is sized on this plan
- **WHEN** the branch is duplicated
- **THEN** the copy SHALL be joined to the same team
- **AND** the copy's work SHALL draw from that team's pool

#### Scenario: an undone deletion comes back on its pool

- **GIVEN** a labelled work item whose team is sized on this plan
- **WHEN** it is deleted and the deletion is undone
- **THEN** the restored work item SHALL be joined to the team again

## MODIFIED Requirements

### Requirement: A team label on a parent reaches the leaves beneath it, most-specific wins

A work item's **set** of teams SHALL apply to every leaf beneath it whose own set
is empty. A leaf's own non-empty set SHALL beat every ancestor's, and a nearer
ancestor's SHALL beat a further one. The set SHALL be inherited **whole**: a
reader SHALL NOT be given a subset of what the ancestor states.

An empty set SHALL mean _unstated_ and SHALL inherit. There SHALL be no second
state meaning "deliberately no team", exactly as there is no second spelling of
today's null.

The inherited set SHALL name the row it came from, so every reader that shows it
can say where it was written.

No write SHALL copy a set down the tree. Inheritance SHALL be a reading,
computed in one place and shared by every consumer, so that no two readers can
disagree about the same row.

A parent chain that runs in a circle SHALL be refused rather than defaulted: it
has no nearest ancestor, and a fallback would put a row on a pool nobody
assigned it to.

#### Scenario: a parent's whole set reaches an unlabelled leaf

- **GIVEN** a parent stating two teams with an unlabelled leaf beneath it
- **WHEN** the effective teams are read
- **THEN** the leaf's effective set SHALL be both of them, named from the parent

#### Scenario: the nearer ancestor's set wins whole

- **GIVEN** a root stating `Platform` and `Design`, a child of it stating
  `Backend`, and an unlabelled leaf beneath that child
- **WHEN** the effective teams are read
- **THEN** the leaf's effective set SHALL be `Backend` alone

#### Scenario: an empty set inherits rather than meaning none

- **GIVEN** a labelled parent and a leaf whose own set is empty
- **WHEN** the effective teams are read
- **THEN** the leaf SHALL be on the parent's set
- **AND** no row anywhere in the plan SHALL read as deliberately teamless

#### Scenario: a circular parent chain is refused

- **GIVEN** rows whose parent chain runs in a circle
- **WHEN** the effective teams are read
- **THEN** it SHALL throw rather than answer

### Requirement: The plan a client reads names each row's teams

A read of a plan SHALL carry each work item's own team set, so that every client
surface — the table cell, the cards, the chart's labels, the export and the
Teams dialog — resolves inheritance from the same reading and none of them
consults a second copy.

The scheduler SHALL draw a slice's pool from the effective **team** set. While
the engine takes one pool per slice, a set of more than one SHALL be refused as
an invariant violation rather than silently narrowed to one of its members.

#### Scenario: the payload carries the set

- **GIVEN** a plan whose parent is labelled and whose leaf is not
- **WHEN** a client reads the plan
- **THEN** each work item SHALL carry its own set of teams
- **AND** the leaf's cell SHALL show the parent's team as inherited

#### Scenario: the adapter refuses a set the engine cannot spend

- **GIVEN** a row whose effective set holds two teams
- **WHEN** the slices are built
- **THEN** it SHALL throw rather than schedule against one of the two
