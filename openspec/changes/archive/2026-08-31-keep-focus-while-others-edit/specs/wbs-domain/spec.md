## ADDED Requirements

### Requirement: A cell keeps its focus while others edit

fe-01 SHALL apply a new server value to an editable cell by assigning it to the
existing input, never by replacing the input. Focus, the caret and any selection
MUST survive another client's edit to any row, including the row and the field
that currently has focus.

#### Scenario: their edit lands in the field being typed in

- **WHEN** another client's edit changes the name of the row this client is
  typing a name into
- **THEN** the input is the same element it was, keeps the focus, and still holds
  what was typed

#### Scenario: their edit lands in a cell nobody is in

- **WHEN** another client's edit changes a value no one here is typing into
- **THEN** that cell shows the new value

### Requirement: Typing wins until the cell is left

fe-01 SHALL hold back an incoming value for a cell that has focus and has been
typed in, and apply it when the focus leaves — unless what was typed differs from
the value the cell was last showing, in which case that edit is sent and the
refetch it triggers settles the cell.

#### Scenario: leaving a cell that was typed in

- **WHEN** the focus leaves a cell holding a value different from the one it was
  last showing
- **THEN** that value is sent to be-01

#### Scenario: leaving a cell that was typed in and put back

- **WHEN** the focus leaves a cell that was typed in and ends holding the value
  it was last showing, while another client's newer value is waiting
- **THEN** nothing is sent and the waiting value is shown

### Requirement: A blur that changed nothing writes nothing

fe-01 SHALL send a cell's value only when it differs from the value that cell was
last showing. Moving the focus through a row MUST NOT write to it.

#### Scenario: clicking through a row

- **WHEN** a cell is focused and left with nothing typed
- **THEN** no request is made for it
