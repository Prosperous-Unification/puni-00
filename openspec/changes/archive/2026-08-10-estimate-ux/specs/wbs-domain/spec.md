## ADDED Requirements

### Requirement: An estimate is never altered on its author's behalf

The table SHALL send a three-point estimate only when all three boxes read as
a number of days, zero or more, and `optimistic ≤ realistic ≤ pessimistic`. It
SHALL NOT alter any box the person did not type in, and SHALL NOT send a trio
it had to repair. A trio that cannot be sent SHALL be shown as invalid on the
boxes at fault — both members of each pair that breaks the order, or the empty
boxes of a partly filled trio — each carrying the reason. What was typed SHALL
remain on screen until it is corrected or replaced, including across a refresh
caused by somebody else's edit.

#### Scenario: one point typed into an empty row

- **WHEN** `5` is typed into the optimistic box of an unestimated row
- **THEN** nothing is sent, the box still reads `5`, and the other two are
  marked invalid with a reason naming that the estimate is not saved

#### Scenario: an unordered trio

- **WHEN** `5`, `3`, `10` are typed into optimistic, realistic and pessimistic
- **THEN** nothing is sent, optimistic and realistic are marked invalid,
  pessimistic is not, and all three still read as typed

#### Scenario: completing the trio sends it unaltered

- **WHEN** the realistic box of `5 / 3 / 10` is corrected to `7`
- **THEN** `5 / 7 / 10` is sent, exactly as typed

#### Scenario: a draft is not silently discarded

- **WHEN** a row holds a typed but unsent estimate and Backspace is pressed at
  the start of its empty name
- **THEN** the row is not removed

### Requirement: A project chooses how its estimates become one figure

A project SHALL hold one estimate method — `pert`, `optimistic`, `realistic`
or `pessimistic` — defaulting to `pert`, changeable by anyone who may edit the
project. The tree read SHALL report the project's method, each work item's
final figure per role and their sum. The schedule's durations SHALL be
computed from that same method, so the dates and the figures reported beside
them are the same numbers. A role no estimate below a row mentions SHALL be
absent from the final figures rather than reported as zero.

#### Scenario: PERT by default

- **GIVEN** a leaf estimated `2 / 3 / 10` for Dev in a new project
- **WHEN** the tree is read
- **THEN** its final Dev figure is 4, its total is 4, and the method is `pert`

#### Scenario: planning on the pessimistic figure

- **GIVEN** the same leaf, in a project whose method is `pessimistic`
- **WHEN** the tree is read
- **THEN** its final Dev figure is 10, and its earliest finish is day 10

#### Scenario: a method the project cannot plan with

- **WHEN** a request asks to set a method that is not one of the four
- **THEN** it is refused, and the project keeps the method it had

#### Scenario: a method the database should not hold

- **GIVEN** a stored project whose method column holds something else
- **WHEN** that project is read
- **THEN** the read throws rather than planning it as PERT
