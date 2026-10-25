## ADDED Requirements

### Requirement: An undo stack belongs to one acting person

A command journal SHALL be kept per project, account and acting person. The acting person SHALL
be the agent person of the request's machine or consent credential, and none for any other
credential. Appending, clearing the redo branch, pruning to 50 entries, reading the stack,
flipping an entry between undo and redo, and answering whether undo or redo is possible SHALL
each read that stack alone. A flip SHALL refuse an entry of another stack.

#### Scenario: An agent's undo never reverts its human's edit

- **WHEN** a human renames one row, their agent renames another, and the agent presses undo
- **THEN** the agent's rename is reversed and the human's stays

#### Scenario: A human's undo never reverts their agent's edit

- **WHEN** a human renames one row, their agent renames another, and the human presses undo
- **THEN** the human's rename is reversed and the agent's stays undoable by the agent

#### Scenario: Two keys on one account keep separate stacks

- **WHEN** two agent persons bound to one account each rename a row through their own key
- **THEN** each one's undo reverses only its own rename

#### Scenario: Another actor's edit keeps a redo branch

- **WHEN** an agent undoes its rename and another agent of the same account then edits
- **THEN** the first agent's redo still applies

#### Scenario: A busy agent never prunes its human's history

- **WHEN** a human edits, their agent then makes 51 edits, and the human edits again
- **THEN** both of the human's edits are still undoable

### Requirement: An entry the outgoing release journals is its account's own

An entry written without an acting person SHALL be on its account's own stack, so an agent
edit the outgoing colour journals mid-swap lands on its human's stack.

#### Scenario: The outgoing colour's insert

- **WHEN** a release that predates the column journals an entry
- **THEN** the account's own stack holds it and no agent's stack does
