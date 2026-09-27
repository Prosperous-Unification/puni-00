## ADDED Requirements

### Requirement: Step-addressed commands accept step node IDs

Every command that addresses one leaf's step — estimate, clear estimate, actual, measure, progress and assignment — SHALL accept either its existing work-item and step fields or a step node ID, and SHALL refuse a request carrying both or neither as a modeled 4xx. A step-code field SHALL be accepted on step creation, and step reads SHALL return each step's code or its uncoded state. Work-item reads SHALL return each leaf's step node IDs and canonical references. A step reference SHALL be accepted only through an explicit resolve request that names the project and the revision it was read at. Existing request shapes SHALL remain valid for HTTP and MCP clients, and a node-addressed edit SHALL journal the same undoable entry as its pair-addressed form.

#### Scenario: An estimate is set by step node ID

- **GIVEN** 010.dev's step node ID N
- **WHEN** a batch sets an estimate with `stepNodeId: N`
- **THEN** the estimate is stored on 010's Dev step and one undo removes it

#### Scenario: Both address forms are refused

- **WHEN** a progress command carries both a step node ID and a work-item and step pair
- **THEN** it is refused as a modeled 4xx and nothing is written

#### Scenario: An old client keeps working

- **GIVEN** an MCP client sending the existing work-item and step fields
- **WHEN** it sets an assignment
- **THEN** the assignment is stored exactly as before this change
