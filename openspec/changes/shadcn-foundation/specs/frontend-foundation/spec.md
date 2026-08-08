## ADDED Requirements

### Requirement: The reset stops at the editable grid

The app SHALL carry a reset for its vendored components, and that reset SHALL be
written into the `base` cascade layer so it never outranks a utility class.

Every rule in that layer SHALL be scoped away from the editable grid — the
`<table>` marked `data-grid` and everything inside it. The cells, the boxes typed
into them, the buttons in them, the earliest-start date box, the ⋯ menu and both
pickers SHALL compute the same `box-sizing`, margins and font the browser gives
them with no stylesheet at all, because `table-frame.ts`'s declared column widths
were measured against exactly that.

The reset SHALL NOT be Tailwind's own preflight, which is document-wide and
cannot be scoped.

#### Scenario: a chrome control takes the app's type

- **WHEN** an input on the signed-out page is measured
- **THEN** its font is the one it inherits from the page, not the platform's own

#### Scenario: a control inside the grid keeps the platform's type

- **WHEN** a dependency chip inside the grid is measured
- **THEN** its font family and size are neither its cell's nor the page's

#### Scenario: an unguarded rule is refused

- **WHEN** any rule compiled into the `base` layer carries no grid guard
- **THEN** the stylesheet's own test names that selector and fails

### Requirement: The palette is tokens, and dark mode is configured but not shipped

Colour, radius and font SHALL be CSS custom properties under shadcn's own names,
so a component vendored from that registry needs no edit to find them, and the
utilities generated from them SHALL read the properties at use time rather than
copying their values.

A `dark` variant of every colour SHALL be defined. Nothing SHALL set it: this
change ships no theme switch and no toggle.

`--font-sans` SHALL name the generic family the table's column widths were
measured in until some change alters that face **and** re-measures the
`not-before` column.

#### Scenario: a component reads the palette

- **WHEN** a vendored button renders
- **THEN** its colours come from the token properties, not from literals in the
  component

### Requirement: Vendored components are chrome-only

The vendored component set SHALL be used for chrome — the auth screen, the
toolbar, the toasts, the cheat sheet, the project picker, the presence panel,
dialogs and sheets — and SHALL NOT be used inside a table cell.

A swap SHALL keep the accessible name, role and labelling of what it replaces.
Where a test asserts one of those, the markup SHALL be adapted to keep the
assertion rather than the assertion relaxed to fit the markup.

#### Scenario: the auth form after the swap

- **WHEN** the sign-up screen is filled in by label and submitted
- **THEN** every control is found by the same accessible name as before
