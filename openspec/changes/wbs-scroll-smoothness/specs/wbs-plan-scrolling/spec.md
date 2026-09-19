## ADDED Requirements

### Requirement: Scrolling a large plan keeps its rows in order under the reader

During a steady downward scroll of a plan with 2,000 rows, including rows whose names wrap, the index of the first fully visible row in the plan renderer SHALL never decrease between consecutive animation frames, and SHALL never jump by more than the rows the scroll delta covers plus one.

#### Scenario: wheel scroll through unmeasured wrapped rows

- **WHEN** the e2e probe scrolls a fresh 2,000-row plan (every fifth name wrapping to two lines) from top to bottom at a constant wheel rate
- **THEN** the first visible row index is non-decreasing on every sampled frame

#### Scenario: scrolling back up through rows measured on the way down

- **WHEN** the probe then scrolls back to the top
- **THEN** the first visible row index is non-increasing on every sampled frame

### Requirement: The Gantt panel stays on the renderer's row

While either face scrolls, the Gantt panel's first visible row SHALL match the plan renderer's first visible row within one animation frame, including frames in which a row height correction moves the renderer.

#### Scenario: height correction during scroll

- **WHEN** a row above the viewport gets its measured height while the reader scrolls
- **THEN** the panel's first row equals the renderer's first row by the next frame

### Requirement: Large-plan scrolling stays inside the frame budget

With 2,000 rows in Chromium on the CI runner, a scripted scroll SHALL produce no main-thread task longer than 50 ms and a 95th-percentile frame interval no worse than 1.5 times the same probe's 50-row baseline on the same run.

#### Scenario: frame budget at 2,000 rows

- **WHEN** the probe records a performance trace of the scripted scroll at 50 and at 2,000 rows
- **THEN** the 2,000-row run has no long task over 50 ms and its p95 frame interval is at most 1.5× the 50-row run's

### Requirement: The Gantt panel draws only rows near its viewport

The Gantt panel SHALL mount bars only for rows intersecting its viewport plus overscan, and SHALL keep the scroll height of the full plan.

#### Scenario: large plan mounted

- **WHEN** a 2,000-row plan is open with the panel visible
- **THEN** the panel's mounted row count stays below 150 and its scroll height equals the full plan's
