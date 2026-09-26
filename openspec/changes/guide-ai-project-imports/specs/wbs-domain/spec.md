## ADDED Requirements

### Requirement: Import with AI help is discoverable in the editor

Export / Import SHALL offer Import with AI. Activating it by pointer, keyboard or mobile equivalent SHALL open accessible help linked to the canonical guide and expose a copyable verified MCP URL and the guide's approved import prompt. The help SHALL lead through client choice, connection, sign-in and write verification, source selection, mapping preview, approved import and reconciliation. If the public URL or client has not been live verified, the help SHALL display its unverified status rather than claiming a tested connection.

#### Scenario: A planner opens and copies guidance

- **GIVEN** a planner using the editor
- **WHEN** Import with AI is activated and its prompt copied
- **THEN** the help is keyboard and screen-reader accessible
- **AND** the copied prompt matches the canonical guide

#### Scenario: Public authentication has not been proved

- **GIVEN** a client or deployment without a recorded live write and refresh flow
- **WHEN** its help is displayed
- **THEN** the client is not labeled WBS import tested
