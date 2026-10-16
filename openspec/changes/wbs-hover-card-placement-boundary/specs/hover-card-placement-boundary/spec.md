## ADDED Requirements

### Requirement: Framework-free placement boundary

The frontend SHALL own `diagonalPlacement`, `surfacePlacement`, `besidePlacement`,
`sidewaysPlacement`, their geometry types, `ANCHOR_GAP_PX`, `VIEWPORT_SHARE` and
`SCROLLING_MIN_HEIGHT` in framework-free `hover-card-placement.ts`. Existing
public geometry names SHALL remain available through `hover-card.tsx`, and both
production files SHALL remain below the unchanged 800-line frontend ceiling.

#### Scenario: Direct geometry and compatible component imports

- **WHEN** the node tier imports placement functions from the sibling and a component test imports them through the existing module
- **THEN** fixed-input outputs SHALL match the original arithmetic and all four reexported function identities SHALL match the sibling exports

### Requirement: Preserve measured rendering behavior

The component SHALL retain its React measurements and effects, width constants,
whole-row height correction, pointer behavior and #536 portalled z-index.
The pure functions SHALL retain exact flip, clamp, refusal, tie, gap, height floor
and viewport-share arithmetic.

#### Scenario: Fixed placement measurements

- **WHEN** fixed inputs exercise normal placement, flips, nonzero frame clamps, oversized cards, exact fits, ties, scrolling floor and small-frame cap
- **THEN** the geometry suite SHALL produce the recorded exact placements, including surface top 234 for mark bottom 228 and a 6-pixel gap

#### Scenario: Surface arithmetic fault

- **WHEN** the production below-mark gap addition is changed to subtraction
- **THEN** the fixed-output geometry suite SHALL fail on top 222 instead of 234

### Requirement: Committed survey evidence preserves other outcomes

The installed trusted evaluator and unchanged policy SHALL compare the exact
committed candidate with its wave 9 base. The selected F7 comparison SHALL remove
exactly the hover-card finding, and the full survey SHALL preserve unrelated
findings and unevaluated outcomes for all rules. This extraction SHALL NOT claim
WBS100 certification or closure.

#### Scenario: Extracted candidate and restored oversized fault

- **WHEN** hosted serial evaluation runs on the candidate and a disposable committed candidate restoring the oversized hover-card file
- **THEN** the candidate SHALL remove only the selected finding and the same selected-finding assertion SHALL fail for the restored oversized file
