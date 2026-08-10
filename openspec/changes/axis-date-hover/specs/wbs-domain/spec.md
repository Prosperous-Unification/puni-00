## ADDED Requirements

### Requirement: An axis cell says its date in words at the chart speed

The axis cell SHALL open the chart's own hover card when a mouse pointer
rests on it for the chart's hover-open delay, anchored to the cell. The card's
first line SHALL be the date in words, `<Weekday> <day> <Mon> <yyyy>` (for
example `Mon 17 Aug 2026`), and its second line SHALL be `Workday <n>` for a
working day and `Weekend` for a Saturday or Sunday. On a plan with no start
date the card SHALL say `Workday <n>` alone. The cell SHALL carry no native
`title`: one hint, and it is the card.

A pointer that leaves before the delay elapses SHALL open nothing; a pointer
that is not a mouse SHALL open nothing; and at most one hover card SHALL be
on the page at a time, the axis's and the bars' counting together.

#### Scenario: A dated cell

- **WHEN** a mouse rests on the cell for 2026-08-17 on a Monday-start plan
- **THEN** a card opens reading `Mon 17 Aug 2026` then `Workday 5`

#### Scenario: A weekend cell

- **WHEN** a mouse rests on the cell for Saturday 2026-08-15
- **THEN** the card reads `Sat 15 Aug 2026` then `Weekend`

#### Scenario: A crossing pointer

- **WHEN** the pointer crosses the axis without resting the delay out
- **THEN** no card opens
