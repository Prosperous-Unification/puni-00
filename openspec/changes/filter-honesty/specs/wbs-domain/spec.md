## ADDED Requirements

### Requirement: The chart says which waits the filter stopped it drawing

The chart SHALL draw a dependency arrow, a person hand-off or a wait for a team
only where both of its ends are rows on screen, and SHALL NOT pull a row back
onto the chart to complete one: one edge can drag a whole plan back through the
closure, which is a filter that appears not to work.

While a filter is narrowing the rows, the chart SHALL say how many of those
waits it did not draw and of which kinds, in words, outside the area the chart
scrolls in. A wait with **neither** end on screen SHALL NOT be counted, since no
mark a reader can see is missing. Where every wait the plan holds was drawn, the
chart SHALL say nothing.

The count SHALL be taken where the waits are dropped, and SHALL include the wait
that leaves a row on screen for a row that is not — a bar whose successor is
hidden loses its arrow exactly as one whose predecessor is hidden does.

Where the rows were narrowed by a collapsed branch alone and no filter is on,
the chart SHALL say nothing: the branch the reader closed is on screen with the
triangle that closed it.

#### Scenario: a bar left waiting on a row the filter hid

- **GIVEN** `020 Paint` waiting on `010 Strip the walls`, and a filter keeping
  `020` alone
- **THEN** no arrow is drawn, and the chart says one wait is not drawn because
  the filter is hiding the row at the other end

#### Scenario: the row on screen is the predecessor

- **GIVEN** the same plan and a filter keeping `010` alone
- **THEN** the chart says one wait is not drawn

#### Scenario: nothing was lost

- **GIVEN** a filter keeping both ends of every wait the plan holds
- **THEN** the chart says nothing about undrawn waits

#### Scenario: the filter is cleared

- **GIVEN** the sentence on screen under a filter
- **WHEN** the filter is cleared
- **THEN** the sentence is gone

### Requirement: A reader can take out what is on screen, and the document says so

A client SHALL offer an export of the rows on screen that is **separate** from
the exports of the whole plan, and SHALL NOT turn any of those into a mode that
follows the filter: a document whose header claims the whole plan and whose
table holds part of it is how somebody is sent a plan with rows missing.

The document of what is on screen SHALL carry a header line of its own saying
that it is one reader's screen and not the whole plan, how many of the plan's
rows it holds, and what was asked of the plan to keep them — or, where nothing
was asked, that a collapsed branch is what left the rest out.

That line SHALL also say that the figures were not recomputed for the rows kept:
the schedule is worked out over the whole plan whatever the screen shows, and a
reader who assumed otherwise would read the dates as a plan of this work alone.

Where the document holds a work item whose stored dependency names a work item
it does not hold, it SHALL say how many such references there are, since the
column renders an unresolvable one as an empty cell.

The document SHALL be filed under a name that cannot be confused with the whole
plan's. No document SHALL carry two accounts of its own scope.

#### Scenario: a filtered document says what filtered it

- **GIVEN** a plan of six rows narrowed to one by a team
- **WHEN** what is on screen is exported
- **THEN** the document says it is one reader's screen, that it holds 1 of 6
  rows, and that the team is what kept it

#### Scenario: the whole-plan exports are unchanged

- **GIVEN** the same filter in force
- **WHEN** the whole plan is exported
- **THEN** every row is in it and it says nothing about a scope

#### Scenario: a dependency pointing out of the document

- **GIVEN** a kept row waiting on a row the filter left out
- **THEN** the document says one Depends on reference points at a work item it
  does not hold

#### Scenario: no filter, only a collapsed branch

- **WHEN** what is on screen is exported with nothing typed or ticked
- **THEN** the document says no filter was on and that a collapsed branch is
  what left the rest out
