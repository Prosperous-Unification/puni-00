## MODIFIED Requirements

### Requirement: Typed dependencies have distinct undoable commands

Typed dependency commands SHALL accept SS and FF as well as FS, preserve type through update, undo and redo, and enforce uniqueness by both endpoints and type. Unsupported relationship types SHALL be rejected at the input boundary. Legacy `addDependency` and `removeDependency` SHALL retain their project-reach behavior through HTTP and MCP.

#### Scenario: Two types share endpoints

- **GIVEN** an FS typed relationship between A.Dev and B.Dev
- **WHEN** an SS relationship with the same endpoints is added
- **THEN** both identities are retained; a duplicate SS is refused

#### Scenario: Undo restores FF

- **GIVEN** an FF relationship is edited to SS
- **WHEN** one undo succeeds
- **THEN** the same relationship ID and FF type return
