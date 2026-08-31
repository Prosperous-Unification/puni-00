## ADDED Requirements

### Requirement: A reference cell's editor can be left the way it was entered

A reference cell's open editor SHALL be closable by the two gestures that close
every other editor in this table — moving the focus elsewhere, and Escape — and
the write it starts SHALL NOT take the focus out of the box that started it.

The box SHALL refuse what is typed into it while a write it started is in
flight, and SHALL do so without becoming unfocusable: a control that loses the
focus while a panel is deriving its own state from that focus leaves the panel
standing with nothing left to close it.

Escape SHALL close an open list and leave the box where it is; pressed again,
with the list already closed, it SHALL leave the box.

#### Scenario: a landed take leaves the focus where it was made

- **GIVEN** a work item's Tags cell with its editor open and a tag typed into it
- **WHEN** the offered tag is taken and the write lands
- **THEN** the focus SHALL still be in that cell's box

#### Scenario: a click elsewhere closes the editor a take opened

- **GIVEN** the same cell, immediately after a take has landed
- **WHEN** the pointer clicks anywhere outside the cell
- **THEN** the cell's strip SHALL be back in the row's own flow

#### Scenario: the first Escape closes only the list

- **GIVEN** a reference cell whose box holds the focus and whose list is open
- **WHEN** Escape is pressed
- **THEN** the list SHALL close, the focus SHALL stay in the box, and the
  editor SHALL stay open

#### Scenario: the second Escape leaves the cell

- **GIVEN** the same cell with its list already closed by Escape
- **WHEN** Escape is pressed again
- **THEN** the box SHALL no longer hold the focus and the editor SHALL close

### Requirement: A reference cell says its whole set when it is pointed at

A reference cell SHALL show, on hover and while it is not being edited, every
member it draws, one per line and unclipped — what the row states and what it
carries from above — and SHALL show nothing where it has nothing to say.

A carried member's line SHALL name the row it was written on, because that is
where a reader has to go to take it off. A member the row states SHALL be drawn
ahead of any it carries.

The card SHALL NOT be shown while that cell's editor is open, and SHALL NOT
take the pointer from the rows it hangs over.

#### Scenario: a clipped cell is read without opening it

- **GIVEN** a work item stating three tags in a cell too narrow to draw them all
- **WHEN** the pointer rests on that cell
- **THEN** a card SHALL name all three

#### Scenario: an inherited member says where it came from

- **GIVEN** a child work item stating one tag and carrying two from its parent
- **WHEN** the pointer rests on its Tags cell
- **THEN** the card SHALL draw the stated tag first, and each carried tag with
  the number and name of the row that states it

#### Scenario: the card stands down for the editor

- **GIVEN** a pointed reference cell showing its card
- **WHEN** that cell's editor is opened under the same pointer
- **THEN** no card SHALL be on screen for that cell

### Requirement: Every reference column may open a list over the rows below

A reference column's cell SHALL be exempt from the grid's cell clip, so that the
list it opens and the card it hovers are drawn where a pointer can reach them
rather than cut to the height of one row.

#### Scenario: the Types cell offers what is typed into it

- **GIVEN** a work item's Types cell with a name typed into it that no type
  carries yet
- **WHEN** the offered `Add` line is asked for at the point it is drawn
- **THEN** that line SHALL be what the browser finds painted there, and taking
  it SHALL label the work item with the new type
