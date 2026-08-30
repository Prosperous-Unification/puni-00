## ADDED Requirements

### Requirement: A bar says when the team's size took its parallelism down

A chart SHALL say, on the bar, where a work item asked for more people than its
team's capacity allows — naming both numbers: how many may be at work at once,
and the parallelism that did not apply.

It SHALL say it wherever the two differ, including where the width came down to
one. A width of 1 draws no compressed line — there is nothing to compress — so
that is the case with no other account of itself on the chart.

It SHALL say nothing where the work item got the width it asked for, and nothing
on work somebody is named on: a named person collapses the width to 1 whatever
the team's size is, and that is a different sentence the bar already carries.

#### Scenario: a row asking for three from a team of two says both numbers

- **GIVEN** a work item asking for 3 people, on a team the plan states 2 for
- **WHEN** the chart is drawn
- **THEN** its bar SHALL say the team may have 2 at work at once
- **AND** SHALL say the 3 was not applied

#### Scenario: a clamp down to one is still said

- **GIVEN** a work item asking for 3 people, on a team the plan states 1 for
- **WHEN** the chart is drawn
- **THEN** its bar SHALL say the parallelism did not apply

#### Scenario: a row that got what it asked for says nothing about a clamp

- **GIVEN** a work item asking for 2 people, on a team the plan states 2 for
- **WHEN** the chart is drawn
- **THEN** its bar SHALL say nothing about the team's size
