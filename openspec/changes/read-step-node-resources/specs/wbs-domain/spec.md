## ADDED Requirements

### Requirement: Live leaf step resource readings

The system SHALL expose optional `nodeResources` on live work-item reads. A new producer SHALL emit one entry per project step on every retained leaf, including held leaves; stepless leaves SHALL emit an empty map and parents SHALL omit the field. Older producers MAY omit the field.

#### Scenario: Resource provenance and width

- **WHEN** a leaf is read
- **THEN** each entry contains nodeId, assignment, teams, maxParallel and width
- **AND** assignment is unassigned, explicit with personId, or assumed with personId and fromStepId
- **AND** only exactly one assignment enables assumption, including when multiple assignments name the same person
- **AND** teams is unstated or stated with fromWorkItemId and entries of teamId and nullable project capacity
- **AND** nearest nonempty team labels override ancestors whole
- **AND** a named person gives width one; otherwise width is maxParallel clamped by the minimum stated pool capacity

#### Scenario: Read parity and persistence

- **WHEN** complete, single, constraints-page or MCP reads describe the same leaf
- **THEN** their resource values agree, resolving before page filtering and hold reduction from complete captured values
- **AND** outline pages omit nodeResources
- **AND** rename and reparent retain stable node identity while effective resources reflect current ancestry
- **AND** plan documents and saved plans omit derived nodeResources and imports ignore supplied values
