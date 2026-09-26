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

### Requirement: Moving into a parent has a clear target and keyboard equivalent

The existing middle-row drag zone SHALL move the dragged subtree beneath the target as its last child. While that valid zone is targeted, the row SHALL be tinted and show an indented cue such as “Move under 010 · Release”; top and bottom zones SHALL keep insertion lines. Hovering a valid collapsed parent for about 600ms SHALL temporarily expand it without changing the target or zone as layout moves. Exiting or cancelling SHALL clear the timer and restore transient expansion; successful drop SHALL retain the expansion. Frozen-number rows SHALL remain movable and keep their labels. Self/descendant and dependency-invalid reparenting SHALL be refused by the authoritative backend move command after evaluating the resulting dependency graph, including a request that bypasses the drag UI; a concurrent tree edit SHALL cancel the gesture. A refused write SHALL restore the preview and explain the refusal. A successful move SHALL be one undoable structural command. Keyboard and mobile users SHALL have a Move under… parent picker for arbitrary destinations; Alt+Right indent and Alt+Left outdent SHALL remain available.

#### Scenario: A middle drop nests a subtree

- **GIVEN** a valid dragged subtree and target row numbered 010 · Release
- **WHEN** the pointer enters its middle zone and the move succeeds
- **THEN** “Move under 010 · Release” is shown before drop and the subtree becomes its last child
- **AND** one undo restores its former position

#### Scenario: Hover expansion is temporary until success

- **GIVEN** a valid collapsed parent under the drag pointer
- **WHEN** the middle zone is held for about 600ms
- **THEN** the parent opens without changing the targeted move
- **AND** exit or cancellation restores its prior expansion, while a successful drop keeps it open

#### Scenario: An invalid or stale move is refused

- **GIVEN** a self/descendant target, dependency-invalid target, concurrent tree edit or server refusal
- **WHEN** the move is attempted
- **THEN** no invalid structure is committed, the preview is restored, and a refused write is explained

#### Scenario: A keyboard or mobile user chooses another parent

- **GIVEN** a work item and an arbitrary valid destination parent
- **WHEN** Move under… is chosen from its accessible picker
- **THEN** the same undoable structural move places it as that parent's last child
- **AND** Alt+Right and Alt+Left remain usable for adjacent indent and outdent
