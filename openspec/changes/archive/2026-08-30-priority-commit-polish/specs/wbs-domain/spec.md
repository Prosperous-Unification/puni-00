## ADDED Requirements

### Requirement: Enter saves the priority cell without leaving it

A bare Enter pressed in a work item's priority cell SHALL send what is in the
box, exactly as leaving the cell does, and SHALL leave the caret in that cell.
It SHALL send once: the blur that follows the Enter SHALL NOT send the same
text a second time, so one keystroke is one request and one undo.

Enter carrying any modifier SHALL NOT be taken by this rule. `Ctrl/⌘ + Enter`
remains the chord that saves _and_ moves to the next row's name, and a bare
Enter in the Name cell remains a new line — the priority cell's rule is the
column's, not every cell's.

An Enter that be-01 refuses SHALL behave as a refused blur does: nothing is
written, the refusal is said out loud, and the typed text stays in the box.

#### Scenario: Enter sends the number without the cell being left

- **WHEN** a number is typed into a priority cell and Enter is pressed, and the
  cell is neither blurred nor tabbed out of
- **THEN** the work item is patched with that priority, and the caret is still
  in the priority cell

#### Scenario: Enter and the blur after it are one request

- **WHEN** a number is typed into a priority cell, Enter is pressed, and the
  cell is then left
- **THEN** exactly one patch is sent

#### Scenario: a modified Enter is still the chord's

- **WHEN** `Ctrl/⌘ + Enter` is pressed in a priority cell
- **THEN** it saves and moves to the next row's name, as it does from every
  other cell

### Requirement: A cell holding a refused draft shows the newest one

Where a draft is refused, typed over, and refused again, the cell SHALL show
the text refused most recently — never the one refused before it. The durable
copy a cell keeps of its refused draft SHALL be dropped the moment a newer
submission for that cell goes out, so nothing can restore a superseded draft
into a box holding a newer one while the answer is still in the air.

This is a rule of every cell that holds a refusal, not of the priority column
alone.

#### Scenario: a second refused draft replaces the first on screen

- **WHEN** a priority cell is given a value be-01 or the client refuses, and a
  different refused value is then typed over it and the cell is left
- **THEN** the cell shows the second value, the held draft is the second value,
  and the work item's stored priority is unchanged

#### Scenario: emptying the box abandons the held draft

- **WHEN** a cell showing a refused draft is emptied back to what the server
  holds and left
- **THEN** no draft is held for that cell any more
