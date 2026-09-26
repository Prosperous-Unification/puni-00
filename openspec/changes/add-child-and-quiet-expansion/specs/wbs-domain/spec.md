## ADDED Requirements

### Requirement: A work item can create its last child from either row menu

Every work-item row dropdown and equivalent mobile card menu SHALL offer Add child for a leaf or parent. A successful activation SHALL create one new last child under that work item through the existing create command, expand the parent and every ancestor, reveal the new child, and focus its Name editor. The first-child conversion SHALL retain the existing estimate hand-down and related leaf values. One undo SHALL restore the prior structure and values. A failed create SHALL not move focus or claim that a child was created.

#### Scenario: An estimated leaf becomes a parent

- **GIVEN** a leaf with estimates
- **WHEN** Add child succeeds
- **THEN** one child is its last child and receives the existing first-child hand-down
- **AND** the child is visible with its Name focused
- **AND** one undo restores the previous leaf and estimates

#### Scenario: A collapsed branch receives a child

- **GIVEN** a work item under collapsed ancestors, including a frozen parent
- **WHEN** Add child succeeds from its row or mobile card menu
- **THEN** its parent and ancestors are open and the new last child is visible

#### Scenario: Child creation fails

- **GIVEN** the create command is refused or fails
- **WHEN** Add child is activated
- **THEN** no new child is claimed and focus does not jump to a nonexistent Name editor

### Requirement: Flat plans cannot enter a collapsed-all state

When a plan has no nested work items, Expand all and Collapse all SHALL do nothing silently: they SHALL be disabled or inert, SHALL show no no-nested hint or message, and SHALL not change or persist expansion state. In particular, Collapse all on a flat plan SHALL NOT replace the default fully expanded state with an empty expansion map. When a first child later appears, it SHALL be visible with its parent open. With nested work items, the controls SHALL retain their normal all-open and all-closed actions; filtering SHALL continue to force matching branches open without overwriting the reader's saved expansion.

#### Scenario: Collapse all is pressed before the first child exists

- **GIVEN** a flat plan with no nested work items and default expansion true
- **WHEN** Collapse all is activated and a first child is subsequently created
- **THEN** the flat-plan action has saved no collapsed-all state
- **AND** the new child is visible beneath an expanded parent
- **AND** no hint or message appeared for the flat-plan action

#### Scenario: A nested plan uses expansion

- **GIVEN** a plan with at least one parent and child
- **WHEN** Collapse all or Expand all is activated outside filtering
- **THEN** all branches close or open respectively and the per-project preference is remembered

#### Scenario: Search temporarily opens a match

- **GIVEN** a filter matching a nested child
- **WHEN** the filtered plan is shown
- **THEN** the match is visible without replacing the saved reader expansion
