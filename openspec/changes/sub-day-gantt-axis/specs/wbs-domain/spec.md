## ADDED Requirements

### Requirement: The Gantt ladder offers three sub-day rungs

The calendar-scale control SHALL offer, below the three day rungs, three discrete sub-day
rungs of 4 hours, 1 hour and 15 minutes per cell, dividing a 480-minute workday into 2, 8
and 32 cells of 28 px, with no slider. At a sub-day rung a calendar day SHALL be drawn as its
480 working minutes, weekends greyed as at day rungs, and no non-working hours SHALL be drawn
until the instant axis exists. Day rungs SHALL be unchanged in pixels, labels and behaviour.

#### Scenario: a workday plan at the 1 h rung

- **GIVEN** a plan with a one-day `Dev` slice on a calendar axis
- **WHEN** the reader picks the `1 h` rung
- **THEN** the bar is 224 px wide over eight cells and the following Saturday is a greyed cell

#### Scenario: day rungs do not move

- **GIVEN** every existing Gantt pixel assertion
- **WHEN** the panel renders at `Days`, `Weeks` and `Months` after this change
- **THEN** every assertion holds unchanged

### Requirement: Narrow marks are ticks with a pointer surface and a collision list

A bar narrower than 4 px SHALL be painted 4 px wide carrying `data-tick`; its hover card SHALL
carry the exact span. Every mark SHALL have a pointer surface of at least 18 CSS px. When more
than one pointer surface contains the pointer, hover SHALL open a list naming each mark
(`number · step · span`) and the card SHALL open for the one chosen; the panel SHALL never
pick one by guess.

#### Scenario: two minutes is a tick

- **GIVEN** a `minutes` slice charged `2 min` at the `15 min` rung
- **WHEN** the panel renders
- **THEN** the mark is 4 px wide with `data-tick` and its card reads `2 min`

#### Scenario: overlapping marks are listed

- **GIVEN** two ticks 6 px apart at the `15 min` rung
- **WHEN** the pointer rests where both surfaces overlap
- **THEN** a list of the two marks opens, and choosing the second opens its card

### Requirement: A sub-day rung is offered only up to 2,500 marks

A sub-day rung SHALL be offered only while the marks it would draw — visible leaves ×
project steps, plus attempt marks once they exist — number at most 2,500. Above that the rung
SHALL render disabled with `data-not-offered` and the words `not offered at <N> marks`, and
the panel SHALL never fall back to a sub-day rung silently. When a filter raises the count
past the limit while a sub-day rung is selected, the panel SHALL move to the `Days` rung and
say so in the control's title. The limit SHALL be the constant `SUB_DAY_MARK_LIMIT`, changed
only with a recorded measurement.

#### Scenario: a dense plan cannot open a sub-day rung

- **GIVEN** 600 visible leaves and 5 steps (3,000 marks)
- **WHEN** the control renders
- **THEN** the three sub-day rungs read `not offered at 3000 marks` and are disabled

#### Scenario: a filter brings the rung back

- **GIVEN** the same plan filtered to 400 leaves
- **WHEN** the control renders
- **THEN** every sub-day rung is offered
