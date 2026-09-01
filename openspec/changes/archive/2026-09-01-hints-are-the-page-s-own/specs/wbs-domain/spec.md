## ADDED Requirements

### Requirement: Every hint is drawn by the page

A control that has something to say beyond its own label SHALL carry those words
in a `data-hint` attribute, and SHALL NOT carry a `title`.

The application SHALL draw those words itself, in a card of its own, opened by a
mouse arriving over the control and by the control taking the keyboard focus.

The card SHALL open with no delay of the application's own, SHALL be placed
against the control it belongs to, and SHALL close when the pointer moves to
anything that is not that control, when the focus leaves it, and on Escape.

While the card is open the control SHALL point `aria-describedby` at it, and
SHALL be left as it was found once the card closes.

A tap SHALL open no card, because a tap has no departure behind it.

#### Scenario: a control the pointer arrives over

- **GIVEN** the plan page, and a toolbar control carrying a hint
- **WHEN** the pointer moves onto it
- **THEN** the application's own card SHALL be on screen within 400ms, saying
  what the control's `data-hint` says, placed below the control and overlapping
  it horizontally

#### Scenario: no browser tooltip anywhere on the plan

- **GIVEN** the plan page with its toolbar, table and chart drawn
- **WHEN** every element in the document is examined
- **THEN** none SHALL carry a `title` attribute

#### Scenario: the pointer moves on

- **GIVEN** an open hint card
- **WHEN** the pointer moves onto a control that carries no hint
- **THEN** the card SHALL close

#### Scenario: the keyboard

- **GIVEN** a hinted control
- **WHEN** it takes the focus
- **THEN** the same card SHALL open and the control's `aria-describedby` SHALL
  name it
- **AND WHEN** the card closes, the control SHALL carry no `aria-describedby`
  it did not have before

#### Scenario: a tap

- **GIVEN** a hinted control
- **WHEN** a touch pointer arrives over it
- **THEN** no card SHALL open

#### Scenario: a control with nothing to say today

- **GIVEN** a control whose `data-hint` is empty, because the value it is
  written from is absent
- **WHEN** the pointer moves onto it
- **THEN** no card SHALL open
