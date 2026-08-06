## ADDED Requirements

### Requirement: The Depends on list marks the edges be-01 would refuse

The Depends on list SHALL show every work item that is neither the row itself
nor one of its existing predecessors, and SHALL mark those the API would refuse
— an edge onto an ancestor or a descendant of the row, or one that closes a
cycle in the dependency graph once every edge is expanded to the leaves beneath
its ends. A marked entry SHALL be shown greyed, SHALL carry a short reason
after the work item's name, SHALL be exposed as disabled to assistive
technology, and SHALL NOT be choosable by click, by Enter, or by the highlight
the arrow keys move. Marked entries SHALL be shown rather than hidden: a row
that disappears from the list reads as a fault in the tool, and a row that is
visibly refused, with its reason, tells the reader something about the plan.

The client's judgement SHALL be a prediction only. be-01 SHALL remain the sole
authority over which edges are written, and the client's rule SHALL answer as
be-01's does for the same project, tree and edges.

#### Scenario: a row that contains the one being edited

- **WHEN** the Depends on list is opened on a child row
- **THEN** its parent appears greyed, reading `contains this row`, and clicking
  it adds no dependency

#### Scenario: a row inside the one being edited

- **WHEN** the Depends on list is opened on a parent row
- **THEN** each row beneath it appears greyed, reading `inside this row`

#### Scenario: a row that would close a loop

- **GIVEN** `020` waits for `010.1`, which sits under `010`
- **WHEN** the Depends on list is opened on `010` or on `010.1`
- **THEN** `020` appears greyed, reading `would loop`, because the edge would
  be refused once expanded to the leaves

#### Scenario: the keyboard skips what cannot be taken

- **WHEN** the arrow keys move the highlight through a list containing marked
  entries
- **THEN** the highlight lands only on entries that can be added, and Enter on
  a list narrowed to marked entries alone adds nothing

#### Scenario: the graph moves under an open list

- **GIVEN** an entry is highlighted in an open list
- **WHEN** another client's edit makes that edge one be-01 would refuse
- **THEN** the entry is greyed with its reason on the next tree, and Enter adds
  nothing

#### Scenario: typed numbers are still judged by be-01

- **WHEN** a list of numbers is typed into the cell and Enter pressed
- **THEN** every number is sent as before, and whatever be-01 refuses is
  reported afterwards with the rest still added
