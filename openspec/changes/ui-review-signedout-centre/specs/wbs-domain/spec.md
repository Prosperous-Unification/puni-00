## ADDED Requirements

### Requirement: Every signed-out card is centred on its own

The signed-out page SHALL centre the column holding the `WBS tool v2` heading and its card
(sign-in, server unavailable, access refused) in the window, across within 1px and top to bottom
with the room above and below within 48px of each other, whichever card it holds. A window too
short for the column and two 16px gutters SHALL start the column at least 16px down and scroll to
its end, clipping nothing. A refusal that opens on the sign-in card SHALL NOT move the heading.

#### Scenario: each card centred

- **WHEN** the session read answers 401, 502 or 403 at 1440 × 900, 1024 × 768 or 375 × 812
- **THEN** the column is centred across within 1px and the room above and below it differ by at most 48px

#### Scenario: a short window

- **WHEN** the same three cards are drawn at 1440 × 600 and 375 × 568
- **THEN** each column starts at least 16px down, ends inside the page's scroll height, and is centred where it fits

#### Scenario: a refused sign-in

- **WHEN** a sign-in is refused and its message opens
- **THEN** the heading's top is within 0.5px of where it stood before

### Requirement: The schedule cue names objectives by their settings roots

The optimization cue SHALL name the priority-first objective `Priority` and the finish-first
objective `Finish` wherever it uses a short name (pill, menu, card, contrast line), and SHALL draw
`Fast · Priority 3 days earlier` on the pill without cutting it at 1280 and wider. On a 390 window
the pill SHALL NOT be drawn over the control after it, and its open menu SHALL stay inside the
window.

#### Scenario: a Priority saving on the pill

- **WHEN** Fast is displayed and Priority finishes 3 days earlier
- **THEN** the pill reads `Fast` and `· Priority 3 days earlier`, the saving's text not overflowing its box

#### Scenario: the phone row

- **WHEN** the cue is drawn at 390 × 844 and its menu opened
- **THEN** the pill's right edge is at or before `Plan actions`' left edge and the menu's box lies within the window
