## MODIFIED Requirements

### Requirement: Every hint is drawn by the page

A mark that has something to say beyond its own label SHALL carry those words in
one of two attributes, and SHALL NOT carry a `title`.

Words about **this project** — an inherited value and the row it came from, a
computed date, a row's slack, a link's target, a refusal's reason — SHALL be
carried in `data-fact`. Words about **what a control does** SHALL be carried in
`data-hint`. A mark SHALL carry one or the other, never both; where the words
themselves differ by state, the attribute written SHALL be the one the words
being shown belong to.

The application SHALL draw those words itself, in a card of its own, opened by a
mouse arriving over the mark and by the mark taking the keyboard focus.

A `data-fact` card SHALL open with no delay of the application's own. A
`data-hint` card SHALL open only after the pointer has rested on the control for
two seconds **without pressing it**, and SHALL open with no delay when the
control takes the keyboard focus instead.

A pointer press on the mark a `data-hint` is waiting for SHALL end that wait
without opening a card, and no new wait SHALL begin until the cursor has moved.
A `pointerover` reporting the cursor position the press was made at SHALL NOT
end that silence, because the page redrawing under a still cursor is not a
departure — opening a dialog and closing it is the case that decides this.

The card SHALL be placed against the mark it belongs to, and SHALL close when
the pointer moves to anything that is not that mark, when the focus leaves it,
and on Escape.

While the card is open the mark SHALL point `aria-describedby` at it, and SHALL
be left as it was found once the card closes.

A tap SHALL open no card, because a tap has no departure behind it.

Where a mark carrying either attribute is nested inside another, the **nearest**
SHALL be the one that answers.

#### Scenario: a control the pointer presses

- **GIVEN** the plan toolbar, and a control carrying a `data-hint`
- **WHEN** the pointer moves onto it, presses it, and rests there
- **THEN** no card SHALL be on screen two seconds later, and no ring SHALL be
  drawn at any point after the press

#### Scenario: a press does not open the card through the focus

- **GIVEN** a hinted control that takes the keyboard focus when it is pressed
- **WHEN** the pointer presses it
- **THEN** no card SHALL be on screen in the moment after the press

#### Scenario: the pointer leaves a pressed control and comes back

- **GIVEN** a hinted control the pointer has pressed and is resting on
- **WHEN** the pointer moves off it onto a mark carrying neither attribute, and
  then back onto the control and rests there
- **THEN** the card SHALL open two seconds after it came back

#### Scenario: a dialog opening and closing under a still cursor

- **GIVEN** a hinted control that opens a dialog, pressed, with the dialog then
  dismissed and the cursor never moved
- **WHEN** two seconds pass
- **THEN** no card SHALL open, even though the marks under the cursor changed
  twice

#### Scenario: a fact the pointer presses

- **GIVEN** a mark carrying a `data-fact`, with its card open
- **WHEN** the pointer presses it
- **THEN** the card SHALL stay on screen

#### Scenario: a fact the pointer arrives over

- **GIVEN** the plan page, and a mark carrying a `data-fact`
- **WHEN** the pointer moves onto it
- **THEN** the application's own card SHALL be on screen within 400ms, saying
  what the mark's `data-fact` says, placed below the mark and overlapping it
  horizontally

#### Scenario: a control the pointer arrives over

- **GIVEN** the plan page, and a toolbar control carrying a `data-hint`
- **WHEN** the pointer moves onto it and rests there without pressing it
- **THEN** no card SHALL be on screen one second later
- **AND** the card SHALL be on screen two seconds after the pointer arrived,
  saying what the control's `data-hint` says

#### Scenario: no browser tooltip anywhere on the plan

- **GIVEN** the plan page with its toolbar, table and chart drawn
- **WHEN** every element in the document is examined
- **THEN** none SHALL carry a `title` attribute

#### Scenario: no mark carries both attributes

- **GIVEN** the plan page with its toolbar, table and chart drawn
- **WHEN** every element in the document is examined
- **THEN** none SHALL carry `data-hint` and `data-fact` at once

### Requirement: A waiting tool hint shows a wait ring

While a `data-hint` card is waiting to open, the application SHALL draw a ring
beside the cursor, and SHALL draw nothing at all for the first 400ms of that
wait so that a pointer sweeping across a toolbar leaves no mark behind it.

The ring SHALL show how much of the wait is left, SHALL follow the cursor while
it is drawn, and SHALL take no pointer events of its own.

The ring SHALL go when the card opens, when the pointer presses the control it
is waiting for, when the pointer moves onto anything that is not that control,
and when the pointer leaves the window.

No ring SHALL be drawn for a `data-fact`, for a keyboard focus, or for a touch
pointer.

#### Scenario: a press takes the ring away

- **GIVEN** a ring drawn beside the cursor on a hinted control
- **WHEN** the pointer presses that control
- **THEN** the ring SHALL go, and no card SHALL open while the pointer stays on
  the control

#### Scenario: the ring appears during the wait

- **GIVEN** the plan toolbar
- **WHEN** the pointer comes to rest on a hinted control without pressing it
- **THEN** no ring SHALL be on screen 200ms later
- **AND** a ring SHALL be on screen one second later, within 40px of the cursor
- **AND** no ring SHALL be on screen once the card has opened

## ADDED Requirements

### Requirement: The number cell speaks only when it is clipped

The number cell SHALL carry the whole work item number as a project fact **only
when that number is wider than its column's envelope**, and SHALL carry no words
at all otherwise. The column is sized to a fixed envelope, so a number wider than
it is clipped by the cell and the card is the only way to read it whole.

#### Scenario: a number that fits

- **GIVEN** a plan whose rows are numbered `010` and `020`
- **WHEN** the pointer moves onto a `#` cell
- **THEN** the cell SHALL carry no `data-fact` and no card SHALL open

#### Scenario: a number that does not fit

- **GIVEN** a work item nested deeply enough that its number is wider than the
  `#` column's envelope
- **WHEN** the pointer moves onto its `#` cell
- **THEN** the cell SHALL carry the whole number as a `data-fact`, and the card
  SHALL open saying it
