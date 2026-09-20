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

#### Scenario: either face reaches a short plan's clamped end

- **WHEN** either face drives a 50-row plan to either clamped end
- **THEN** both faces expose the same first-visible-row id and within-row fraction without rolling the driver back

### Requirement: Compositor motion does not continuously commit React state

The plan renderer SHALL publish a new row or column window only when that mounted interval or the viewport dimensions change. Raw scroll offsets inside the published windows SHALL NOT cause a React commit.

#### Scenario: repeated wheel input inside the mounted windows

- **WHEN** controlled wheel inputs move within the current row and column windows
- **THEN** no commit publishes a raw offset

#### Scenario: a viewport boundary changes

- **WHEN** scrolling crosses a row or column window boundary, or the frame is resized
- **THEN** the renderer publishes the changed window or dimensions and mounts the required cells
