## ADDED Requirements

### Requirement: An open modal holds the page's keyboard back

While a modal surface is open, the page's own keyboard SHALL be inert. A
keystroke that a page-level listener would act on SHALL be ended before it
reaches one.

That is every keystroke the table advertises as working "from anywhere" or "from
any cell": `?`, Ctrl/⌘+Z and Ctrl/⌘+Shift+Z, and the command chords —
Ctrl+N, Alt+N, Ctrl+D, Ctrl+H/J/K/L and Ctrl/⌘+Enter. It SHALL be decided by the
same predicates those listeners use, so a chord added to the family is held back
by a modal on the same commit.

The rule SHALL NOT touch Escape, Tab or the arrow keys: those are how a modal is
left and moved through, and the modal owns them.

The rule SHALL NOT suppress the browser's own undo inside a box being typed in.
`?` and Ctrl/⌘+Z aimed at a text box in the dialog are keystrokes no page-level
listener claims, so they reach that box unchanged.

This SHALL hold for the keyboard cheat sheet as well as for a dialog or sheet.
The cheat sheet does not trap the focus — a named non-goal of the change that
added it — so Tab out of it lands in a cell of the plan behind, and until this
rule a command chord pressed there edited a plan nobody could see.

#### Scenario: the cheat sheet does not open over a dialog

- **WHEN** `?` is pressed with a dialog open over the plan
- **THEN** the cheat sheet does not appear

#### Scenario: nothing behind the dialog is undone

- **WHEN** Cmd+Z is pressed with a dialog open over the plan
- **THEN** no undo is asked for

#### Scenario: no work item is created behind the dialog

- **WHEN** Ctrl+N is pressed at a cell of the plan with a dialog open over it
- **THEN** no work item is created

#### Scenario: the cheat sheet holds them back too

- **WHEN** Cmd+Z is pressed at a control of the plan with the cheat sheet open
- **THEN** no undo is asked for

#### Scenario: a dialog's own text box keeps its undo

- **WHEN** Cmd+Z is pressed inside a text box in the open dialog
- **THEN** the keystroke is not claimed, and the browser's own undo runs
