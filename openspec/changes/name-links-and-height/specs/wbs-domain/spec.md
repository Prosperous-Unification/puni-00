## ADDED Requirements

### Requirement: A link in a name is followable wherever the name is read

A link written in a work item's name or notes SHALL be followable from the face
the name is read on, and SHALL open in a new browsing context carrying
`rel="noreferrer noopener"`.

Inside the grid the link SHALL NOT be a tab stop: the grid's tab order steps
between cells, and a click anywhere in the cell other than on the link SHALL
still open that cell's editor.

A URL whose scheme is neither `http` nor `https` SHALL render as text and SHALL
NOT carry that URL as an `href`.

#### Scenario: a link in a name opens in a new context

- **GIVEN** a work item whose name holds `[the plan](http://example.test/plan)`
- **WHEN** the drawn link is clicked
- **THEN** a new browsing context SHALL open at `http://example.test/plan`

#### Scenario: the cell still opens where the link is not

- **GIVEN** the same work item
- **WHEN** the drawn name is clicked past the end of the link
- **THEN** the cell's editor SHALL take the focus

#### Scenario: a javascript URL is not a link

- **GIVEN** a work item whose name holds `[the plan](javascript:alert(1))`
- **WHEN** the name is drawn
- **THEN** the drawn text SHALL carry no `href` naming that scheme

### Requirement: A row is as tall as the name it draws

A Name cell's at-rest height SHALL be the height of the reading it draws, not
of the markdown source under it, wherever the two differ.

#### Scenario: a link whose source outruns its reading

- **GIVEN** two work items, one named plainly and one whose name is a markdown
  link far longer in source than in reading
- **WHEN** both rows are at rest
- **THEN** the two rows SHALL be the same height
