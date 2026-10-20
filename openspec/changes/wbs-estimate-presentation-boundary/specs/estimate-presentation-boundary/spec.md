## ADDED Requirements

### Requirement: Estimate presentation has an adjacent owner

The frontend SHALL own RolledEstimateTrio, EstimatePresentation, ASSIGNEE_SLOT_PX
and QUIET_TRIO_PX in adjacent `estimate-presentation.tsx`. The existing estimate
module SHALL preserve its public exports and retain the outer cell, CellInput,
hooks, typing, readings, header and unfolded columns. Both production files SHALL
remain below the unchanged 800-line ceiling.

#### Scenario: Existing registry and rendered cell

- **WHEN** the registry builds estimate columns and mounted callers render them
- **THEN** existing exports and DOM structure SHALL remain compatible, with no new wrapper element

### Requirement: Stored readings and detail callbacks remain precise

Equal final results SHALL remain suppressed. Parent rolled trios SHALL retain
the quiet leaf presentation. Cards SHALL read stored points and final values
while draft text remains in the editor. Detail actions SHALL read live.current
when invoked, resolve the step node only for an open card, return focus to the
cell and throw if its required focus target is missing.

#### Scenario: Watched presentation faults

- **WHEN** duplicate finals are rendered, parent quiet styling is removed, card readings use draft text, or detail focus return is removed
- **THEN** corresponding existing mounted cases SHALL fail

### Requirement: Committed production size proof preserves other findings

Unmodified production readCandidate and measureSizes SHALL compare exact
committed selections under unchanged roots, 800-line ceiling and no added pins.
Only the estimate column finding SHALL disappear. Installed full F7 and all-rule
surveys remain independent hosted acceptance obligations.

#### Scenario: Committed oversized restoration

- **WHEN** a disposable committed selection restores the original oversized estimate column
- **THEN** the same selected-finding assertion SHALL fail and SHALL pass again for the exact good selection
