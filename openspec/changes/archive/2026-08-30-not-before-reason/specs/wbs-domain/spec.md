## ADDED Requirements

### Requirement: A work item may record why it may not start yet

A work item SHALL be able to hold, beside its not-before date, a free-text reason
in the planner's own words saying why the work is held back.

The reason SHALL be words about that date and nothing else. It SHALL NOT be a
state, SHALL NOT hold any work back on its own, SHALL NOT reach a child, a
parent or a successor, and SHALL move no date anywhere in the plan.

The reason SHALL be at most 200 characters after surrounding whitespace is
removed, and a blank one SHALL be stored as no reason rather than as an empty
value, so that "nobody has said" has exactly one spelling.

#### Scenario: a date and the words that explain it

- **GIVEN** a work item held back by a not-before date
- **WHEN** a reason is recorded for it
- **THEN** the plan SHALL report that reason beside that date
- **AND** every date in the plan SHALL be what it was before the reason was
  recorded

#### Scenario: a blank reason is no reason

- **GIVEN** a work item with a not-before date
- **WHEN** a reason of only whitespace is recorded for it
- **THEN** the plan SHALL report no reason for that work item

#### Scenario: a reason longer than a sentence is refused

- **GIVEN** a work item with a not-before date
- **WHEN** a reason longer than 200 characters is recorded for it
- **THEN** the write SHALL be refused
- **AND** nothing SHALL be stored

### Requirement: A reason with no not-before date is refused

A work item SHALL NOT be left holding a reason with no not-before date for that
reason to be about, and a write that would leave it in that state SHALL be
refused as `not_before_reason_needs_a_date`.

The rule SHALL be decided against the work item as it will stand — the stored
date and the requested change together — because a request carrying only a reason
is legal against a work item that already has a date and illegal against one that
does not.

Clearing the not-before date SHALL NOT clear the reason on the writer's behalf.
A request that clears the date and leaves the reason SHALL be refused, and the
way to take both off SHALL be one request that names both.

The refusal SHALL NOT apply to a request that names neither the date nor the
reason, so that every write that was legal before this reason existed stays
legal.

#### Scenario: words with no date are refused

- **GIVEN** a work item with no not-before date
- **WHEN** a reason is recorded for it
- **THEN** the write SHALL be refused as `not_before_reason_needs_a_date`
- **AND** nothing SHALL be stored

#### Scenario: the date cannot be taken out from under the words

- **GIVEN** a work item holding a not-before date and a reason
- **WHEN** the date alone is cleared
- **THEN** the write SHALL be refused as `not_before_reason_needs_a_date`
- **AND** both the date and the reason SHALL be unchanged

#### Scenario: the date and the words are taken off together

- **GIVEN** a work item holding a not-before date and a reason
- **WHEN** one request clears both
- **THEN** the work item SHALL hold neither

#### Scenario: an unrelated change to a work item with neither is unaffected

- **GIVEN** a work item with no not-before date and no reason
- **WHEN** it is renamed
- **THEN** the rename SHALL succeed

### Requirement: A duplicated work item keeps the reason with the date

A duplicated work item SHALL carry both its original's not-before date and its
original's reason, because the copy is subject to the same constraint and the
words are still true of it.

#### Scenario: a copy is held back for the same stated reason

- **GIVEN** a work item holding a not-before date and a reason
- **WHEN** it is duplicated
- **THEN** the copy SHALL hold the same date and the same reason

### Requirement: An undone change to the pair restores both halves

An undo SHALL restore every half of the not-before pair that the undone change
named, so that undoing a change which cleared both puts both back and undoing one
which wrote only the reason leaves the date alone.

#### Scenario: undoing a cleared pair restores the date and the words

- **GIVEN** a work item whose not-before date and reason have both been cleared
  in one change
- **WHEN** that change is undone
- **THEN** the work item SHALL hold the date and the reason it held before

#### Scenario: undoing a written reason leaves the date

- **GIVEN** a work item that had a not-before date, to which a reason was then
  added
- **WHEN** the change that added the reason is undone
- **THEN** the work item SHALL hold no reason
- **AND** SHALL hold the date it had

### Requirement: The chart says why only where the not-before is what binds

A bar whose binding floor is the work item's not-before date SHALL say the
reason, where one is recorded, appended to the sentence that names that floor.

A bar held by anything else — a dependency, an earlier role, a person, a team's
capacity, or the project start — SHALL NOT say the reason, because the sentence
there names what is actually holding the bar and the not-before is not it.

A bar floored by a not-before nobody has explained SHALL say exactly what it said
before reasons existed.

#### Scenario: an explained floor reads as one sentence

- **GIVEN** a bar whose binding floor is its work item's not-before date
- **AND** a reason recorded for that work item
- **WHEN** the bar is read
- **THEN** its floor sentence SHALL name the not-before date and then the reason

#### Scenario: a bar held by a dependency says nothing about the reason

- **GIVEN** a work item holding a not-before date and a reason
- **AND** a bar of that work item whose binding floor is a dependency
- **WHEN** that bar is read
- **THEN** its floor sentence SHALL name the dependency and SHALL NOT name the
  reason

### Requirement: An exported plan carries the reason beside the date

An exported plan SHALL carry the reason in a column of its own beside the
not-before date, so that the date column stays a column of dates.

The reason SHALL be escaped as every other free-text cell of the export is, so
that a sentence containing a comma, a quote, a pipe or a line break is recovered
whole by a reader of either format.

#### Scenario: the reason is exported beside the date it explains

- **GIVEN** a plan with a work item holding a not-before date and a reason
- **WHEN** the plan is exported
- **THEN** the not-before column SHALL hold the date alone
- **AND** a column beside it SHALL hold the reason

#### Scenario: a plan nobody has explained exports blank cells

- **GIVEN** a plan whose work items hold no reasons
- **WHEN** the plan is exported
- **THEN** the reason column SHALL be empty for every row
