## ADDED Requirements

### Requirement: Framework-free cell-card state

The cell-card store SHALL own its state, timers and subscription contract without
importing React. Existing F1 selectors and rule semantics SHALL remain unchanged.

#### Scenario: Production store satisfies F1

- **WHEN** the installed Twilight Burokrat evaluates the production relationship graph
  with the existing successor survey policy and F1 selector
- **THEN** the cell-card store produces no F1 finding
- **AND** restoring a React import to that store produces an F1 finding for that path

### Requirement: React delivery preserves hover card readings

The React hook SHALL subscribe to the cell-card store and expose whether its selected
cell is open as a boolean, with a false server snapshot. State transitions SHALL retain
the existing reach, takeover and pointer-over-keyboard behavior.

#### Scenario: Cell subscription isolates another cell

- **WHEN** another cell opens or changes its hover card
- **THEN** a closed selected cell stays closed without rerendering
- **AND** opening or closing the selected cell updates its reading

#### Scenario: Subscription follows its current selection and store

- **WHEN** delivery switches its selected cell or cell-card store
- **THEN** the reading follows the current selection and current store
- **AND** later changes to the previous store do not render the subscriber

#### Scenario: Server rendering starts closed

- **WHEN** delivery renders on the server with an open cell in the store
- **THEN** its selected cell is rendered closed

#### Scenario: Existing timing remains intact

- **WHEN** the original cell-card store suite exercises reach and takeover
- **THEN** all existing timing and focus restoration assertions pass unchanged
