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
three seconds, and SHALL open with no delay when the control takes the keyboard
focus instead.

The card SHALL be placed against the mark it belongs to, and SHALL close when
the pointer moves to anything that is not that mark, when the focus leaves it,
and on Escape.

While the card is open the mark SHALL point `aria-describedby` at it, and SHALL
be left as it was found once the card closes.

A tap SHALL open no card, because a tap has no departure behind it.

Where a mark carrying either attribute is nested inside another, the **nearest**
SHALL be the one that answers.

#### Scenario: a fact the pointer arrives over

- **GIVEN** the plan page, and a mark carrying a `data-fact`
- **WHEN** the pointer moves onto it
- **THEN** the application's own card SHALL be on screen within 400ms, saying
  what the mark's `data-fact` says, placed below the mark and overlapping it
  horizontally

#### Scenario: a control the pointer arrives over

- **GIVEN** the plan page, and a toolbar control carrying a `data-hint`
- **WHEN** the pointer moves onto it and rests there
- **THEN** no card SHALL be on screen one second later
- **AND** the card SHALL be on screen three seconds after the pointer arrived,
  saying what the control's `data-hint` says

#### Scenario: a cursor crossing the toolbar

- **GIVEN** the plan toolbar, and a pointer moving across three hinted controls
  in under a second
- **WHEN** the pointer comes to rest past the last of them
- **THEN** no card SHALL have opened for any of them

#### Scenario: a fact nested inside a hinted control

- **GIVEN** a mark carrying a `data-fact` inside an element carrying a
  `data-hint`
- **WHEN** the pointer moves onto the inner mark
- **THEN** the card SHALL open at once, saying what the `data-fact` says

#### Scenario: no browser tooltip anywhere on the plan

- **GIVEN** the plan page with its toolbar, table and chart drawn
- **WHEN** every element in the document is examined
- **THEN** none SHALL carry a `title` attribute

#### Scenario: no mark carries both attributes

- **GIVEN** the plan page with its toolbar, table and chart drawn
- **WHEN** every element in the document is examined
- **THEN** none SHALL carry `data-hint` and `data-fact` at once

#### Scenario: the pointer moves on

- **GIVEN** an open card of either kind
- **WHEN** the pointer moves onto a mark that carries neither attribute
- **THEN** the card SHALL close

#### Scenario: the keyboard

- **GIVEN** a mark carrying either attribute
- **WHEN** it takes the focus
- **THEN** the same card SHALL open at once, with no wait of either kind, and
  the mark's `aria-describedby` SHALL name it
- **AND WHEN** the card closes, the mark SHALL carry no `aria-describedby` it
  did not have before

#### Scenario: a tap

- **GIVEN** a mark carrying either attribute
- **WHEN** a touch pointer arrives over it
- **THEN** no card SHALL open

#### Scenario: a mark with nothing to say today

- **GIVEN** a mark whose attribute is empty, because the value it is written
  from is absent
- **WHEN** the pointer moves onto it
- **THEN** no card SHALL open

## ADDED Requirements

### Requirement: A waiting tool hint shows a wait ring

While a `data-hint` card is waiting to open, the application SHALL draw a ring
beside the cursor, and SHALL draw nothing at all for the first 400ms of that
wait so that a pointer sweeping across a toolbar leaves no mark behind it.

The ring SHALL show how much of the wait is left, SHALL follow the cursor while
it is drawn, and SHALL take no pointer events of its own.

The ring SHALL go when the card opens, when the pointer moves onto anything that
is not the control it was waiting for, and when the pointer leaves the window.

No ring SHALL be drawn for a `data-fact`, for a keyboard focus, or for a touch
pointer.

#### Scenario: the ring appears during the wait

- **GIVEN** the plan toolbar
- **WHEN** the pointer comes to rest on a hinted control
- **THEN** no ring SHALL be on screen 200ms later
- **AND** a ring SHALL be on screen one second later, within 40px of the cursor
- **AND** no ring SHALL be on screen once the card has opened

#### Scenario: the ring goes with the pointer

- **GIVEN** a ring drawn beside the cursor on a hinted control
- **WHEN** the pointer moves off that control before the wait is out
- **THEN** the ring SHALL go, and no card SHALL open

#### Scenario: a fact draws no ring

- **GIVEN** a mark carrying a `data-fact`
- **WHEN** the pointer comes to rest on it
- **THEN** its card SHALL open at once and no ring SHALL ever be drawn
