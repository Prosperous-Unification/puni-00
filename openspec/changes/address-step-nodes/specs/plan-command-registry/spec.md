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

### Requirement: Project batches validate the effective work-item target

A project batch SHALL resolve `workItemRef` before a supplied `workItemId` and SHALL refuse a command whose effective target work item does not belong to the batch project with indexed `404 not_found`. The refusal SHALL roll back all preceding writes in that batch. For a step-node address, the effective work item SHALL be a leaf of the batch project and the step SHALL belong to that project; a parent SHALL yield indexed `409 rolled_up` and an unknown step SHALL yield indexed `404 unknown_step`. Pair-addressed clear commands SHALL retain their existing behavior.

#### Scenario: A foreign target rolls back earlier commands

- **GIVEN** a batch in project A that first creates a work item and then patches an item in project B
- **WHEN** the batch is submitted
- **THEN** the patch is refused at its command index with `404 not_found` and the created work item is absent

#### Scenario: A ref takes precedence over a literal ID

- **GIVEN** a batch that creates work item ref `new`
- **WHEN** a later command carries `workItemRef: "new"` and a missing literal `workItemId`
- **THEN** the command targets the newly created work item
