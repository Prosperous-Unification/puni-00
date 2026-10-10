## ADDED Requirements

### Requirement: Three attempt commands join the registry

`startAttempt`, `endAttempt` and `removeAttempt` SHALL be plan command kinds addressing one
step node by pair or step node ID, accepted on HTTP, the batch endpoint and the derived MCP
tools, journalled with verbatim inverses, and refused at their command index with the codes
`wbs-domain` names, rolling the batch back. The registry's kind count SHALL move by exactly
three. Their history sentences SHALL read `started attempt 2 of 010.dev`, `ended attempt 2 of
010.dev failed` and `removed attempt 2 of 010.dev`.

#### Scenario: the kind count moves by three

- **GIVEN** the plan command registry after this change
- **WHEN** its kinds are counted
- **THEN** the count is the count before it plus three

#### Scenario: a refusal rolls the batch back

- **GIVEN** a batch that renames a work item and then ends an attempt on a node with none
  running
- **WHEN** it is submitted
- **THEN** it is refused `409 no_running_attempt` at index 1 and the rename is absent

#### Scenario: an MCP client starts an attempt by step node ID

- **GIVEN** `010.dev`'s step node ID N
- **WHEN** an MCP client sends `startAttempt` with `stepNodeId: N` and a reference
- **THEN** attempt 1 is stored on `010.dev` with that reference and one undo removes it
