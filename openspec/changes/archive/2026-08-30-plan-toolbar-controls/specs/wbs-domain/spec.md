## MODIFIED Requirements

### Requirement: Freezing and unfreezing a plan's numbers are one control

The system SHALL offer one plan-toolbar control, labelled `Freeze #`, that
opens a menu holding `Freeze numbering` and `Unfreeze all`. Both SHALL keep
their accessible names and SHALL write exactly what they write today.

The control SHALL NOT present the two as a toggle or a single button whose label
changes, because a plan may be partly frozen.

While the menu is open, a plan keyboard chord SHALL NOT reach the plan. A menu
item taken with a modifier held SHALL be refused and SHALL NOT also perform the
item's own action.

#### Scenario: one control offers both writes

- **WHEN** the plan toolbar is read
- **THEN** exactly one control SHALL concern freezing
- **AND** opening it SHALL offer `Freeze numbering` and `Unfreeze all`

#### Scenario: a modified Enter on a menu item does nothing

- **GIVEN** the freeze menu open on `Unfreeze all`, with frozen rows on the plan
- **WHEN** Enter is pressed with a modifier held
- **THEN** no row SHALL be unfrozen
- **AND** no chord SHALL have reached the plan

### Requirement: Expand and collapse are icon controls with their words intact

The system SHALL draw the expand and collapse controls as square icon buttons
carrying a chevron each, and SHALL keep their accessible names `Expand all` and
`Collapse all` and their hover titles.

The chevron drawn SHALL differ in shape from a row's own disclosure control, so
that a plan-wide control and a row-wide one are not one shape with two meanings.

#### Scenario: the controls are found by the names they always had

- **WHEN** the plan toolbar is read
- **THEN** a control accessibly named `Expand all` SHALL be present
- **AND** a control accessibly named `Collapse all` SHALL be present
- **AND** neither SHALL show those words as visible text

### Requirement: A toolbar glyph is drawn, not named

The system SHALL draw every toolbar icon as inline SVG using `currentColor` and
`em` sizing, and SHALL NOT rely on a font's coverage of a symbol codepoint for a
control's meaning. In particular the cheat-sheet control SHALL NOT be `⌨`.

An icon inside a control that already carries an accessible label SHALL be
hidden from the accessibility tree, so the control has one name.

#### Scenario: the cheat sheet control carries a drawn icon

- **WHEN** the control that opens the keyboard cheat sheet is read
- **THEN** its accessible name SHALL be `Keyboard shortcuts`
- **AND** it SHALL contain an inline SVG hidden from the accessibility tree
- **AND** it SHALL contain no symbol-font glyph

### Requirement: The toolbar is narrower for these changes

The system SHALL render the folded plan toolbar at a 1280px viewport no wider
than it rendered before this change.

#### Scenario: the folded toolbar fits its budget

- **GIVEN** a plan at a 1280px viewport with the toolbar folded
- **WHEN** the toolbar's width is measured
- **THEN** it SHALL be no greater than the width measured before this change
