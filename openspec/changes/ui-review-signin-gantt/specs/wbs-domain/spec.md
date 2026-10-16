## ADDED Requirements

### Requirement: Outline controls draw a visible edge

Every control drawn in the `outline` button shape, whether a button or a link styled as one, SHALL
paint a 1px edge whose contrast is at least 3:1 against the surface beside it and against its own
fill, in the light and the dark palette.

#### Scenario: Continue with SSO on the sign-in card

- **WHEN** the sign-in page is shown in either palette
- **THEN** the painted pixel on the left edge of Continue with SSO contrasts at least 3:1 with the card 3px outside it and with its own fill 3px inside it

#### Scenario: toolbar outline buttons

- **WHEN** a plan is open in either palette
- **THEN** Rename project and Freeze # each paint a left edge of at least 3:1 against both sides

### Requirement: The signed-out word mark does not move between cards

The signed-out page SHALL draw every card it holds (sign-in, server unavailable, access refused)
under one top anchor, so the `WBS tool v2` heading SHALL stand at the same height whichever card is
shown, at every window size.

#### Scenario: Try again lands on another card

- **WHEN** the session read answers 401, then 502, then 403 at 1440 × 900, 1024 × 768 or 375 × 812
- **THEN** the heading's top is within 0.5px of where it stood on the sign-in card each time

### Requirement: Full keeps the chart's horizontal position

Switching the Gantt chart into Full and out again SHALL keep the chart's horizontal scroll offset in
both directions (up to the new box's end), and the caption SHALL name the month of the box on screen.

#### Scenario: into Full and back

- **WHEN** the chart is scrolled 600px, Full is opened, the full chart is scrolled to 300px and Full is closed
- **THEN** the full chart opens at 600px with the same caption, and the chart under the plan comes back at 300px with the full chart's last caption

### Requirement: The drop line shows the landing depth

While a row is dragged over the top or bottom edge zone of another row, the 2px line SHALL start at
the left edge of the outline at the depth the dragged row will land at (beside the target, or as its
first child below a branch that is open) and run to the row's right edge.

#### Scenario: the gap under a last child

- **WHEN** a row is dragged below `010.4` (a child of `010`), then above `020`
- **THEN** the first line starts at `010.4`'s caret gutter and the second at `020`'s, one indent step to the left

### Requirement: A drop leaves no tool hint behind

After a drag ends, the app SHALL NOT start a tool hint's wait or open a card for the place the drag
began or for the focus the drop hands back to the moved row, until the pointer moves or a key is
pressed.

#### Scenario: a row dropped with the pointer at rest

- **WHEN** a row is dragged by its handle and dropped, and the pointer rests
- **THEN** no wait ring is drawn and no card opens in the next 2.6 seconds, and resting on another handle afterwards opens its card as before
