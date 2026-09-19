## ADDED Requirements

### Requirement: Scrolling a large plan never moves rows backwards

With a fixed 1280×800 viewport and a 2,000-row plan in which every fifth row's name wraps to two measured lines, the first visible row of the plan renderer SHALL be non-decreasing across consecutive animation frames of a downward scroll, and non-increasing across an upward scroll. The first visible row is the lowest-index row whose bottom edge is below the renderer's top edge, computed from the rows' laid-out rectangles.

#### Scenario: downward scroll through unmeasured wrapped rows

- **WHEN** the probe scrolls a freshly opened plan downward in equal wheel steps for a fixed duration
- **THEN** every sampled frame's first visible row index is greater than or equal to the previous frame's, and the wrapped rows report two-line heights

#### Scenario: upward scroll through measured rows

- **WHEN** the probe then scrolls upward for the same duration
- **THEN** every sampled frame's first visible row index is less than or equal to the previous frame's

### Requirement: The Gantt panel stays on the renderer's row

While either face scrolls, the Gantt panel's first visible row id SHALL equal the renderer's first visible row id by the next animation frame, including after a renderer height correction.

#### Scenario: height correction during upward scroll

- **WHEN** a row above the renderer's viewport gets a measured height different from its estimate while the reader scrolls upward
- **THEN** by the next frame the panel's first visible row id equals the renderer's

### Requirement: Height readings cost one commit per frame

However many rows report heights within one animation frame, the plan renderer SHALL apply them in one state commit, and computing a row's offset SHALL NOT scan every earlier row.

#### Scenario: forty rows measured at once

- **WHEN** 40 newly mounted rows of a 2,000-row plan report heights in the same frame
- **THEN** the heights state commits once, and the offset computation reads O(log n) index nodes per row
