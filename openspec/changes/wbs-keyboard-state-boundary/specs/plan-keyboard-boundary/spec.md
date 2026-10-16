## ADDED Requirements

### Requirement: Bounded keyboard state and effect ownership

The frontend SHALL own keyboard state and standing effects in
`use-plan-keyboard-state.ts`, with both hooks and `ARM_WINDOW_MS` reexported by
identity from `use-plan-keyboard.ts`. Both production modules SHALL remain below
the unchanged 800-line frontend F7 ceiling. Handlers, navigation and callers SHALL
preserve their existing source and behavior.

#### Scenario: Installed evaluator observes the bounded extraction

- **WHEN** the installed evaluator checks exact committed base and candidate with unchanged policy
- **THEN** only the selected `use-plan-keyboard.ts` F7 finding disappears
- **AND** unrelated findings and unevaluated outcomes survive the full survey unchanged
- **AND** restoring the oversized production file in a committed fault makes the selected-finding assertion fail

### Requirement: Keyboard lifecycle survives extraction

The standing shortcut guards, delete arm timer, toast cleanup, listeners and state
SHALL retain their pre-extraction behavior.

#### Scenario: Hidden Plan shortcuts stay inactive on Board

- **WHEN** Board is visible and the hidden Plan receives window shortcut events
- **THEN** undo, redo and cheat sheet actions remain inactive
- **AND** removing the active Plan guards makes the existing regression fail

#### Scenario: The delete arm toast ends with its arm

- **WHEN** a delete arm ends by Escape, focus change or completed deletion
- **THEN** its promise toast is dismissed
- **AND** removing toast dismissal from the production cleanup makes the existing regression fail
