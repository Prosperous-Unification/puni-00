## ADDED Requirements

### Requirement: Contracts and chip presentation have adjacent owners

The frontend SHALL own reference-set contracts in `reference-set-contract.ts`
and shared chip presentation in `reference-set-presentation.tsx`. The original
field module SHALL preserve every original export and retain complete strip and
sheet state and write behavior. All three production files SHALL remain below
the unchanged 800-line ceiling.

#### Scenario: Existing consumers

- **WHEN** reference columns, dependency column and phone cards import the original field module
- **THEN** their existing contract, style, hook, formatter and component exports SHALL remain compatible

### Requirement: Existing clipped and inherited readings are preserved

Resting chip lines SHALL retain their height ceiling and hidden count. Hover
readings SHALL include accumulating inherited members and suppress overriding
inherited labels when own values exist. Types SHALL retain single-member
selection and explicit conflict resolution.

#### Scenario: Watched faults

- **WHEN** production hidden count is suppressed, resting maxHeight is removed, overriding inherited labels are included beside own values, or holdsOneMember is forced false
- **THEN** the corresponding existing mounted case SHALL fail

### Requirement: Exact committed production size evidence

Production measureSizes SHALL evaluate exact committed candidate blobs with the
unchanged 800-line ceiling and roots. Its comparison SHALL remove only the
selected reference-set-field finding and preserve unrelated outcomes. Installed
full F7 and full surveys remain independent hosted acceptance obligations.

#### Scenario: Restored oversized field

- **WHEN** a disposable committed candidate restores the original oversized field
- **THEN** the same selected-finding assertion SHALL fail because that finding remains
