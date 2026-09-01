## ADDED Requirements

### Requirement: A work item is named by its number and its name together

Words a reader reads SHALL name a work item by its number and its name
together, in that order, joined the same way everywhere.

Where a work item has no name, it SHALL still be named by its number, with words
standing in for the absent name.

This SHALL hold for the chart's row labels and bar surfaces, the table's
`inherited from …` sentences, the Depends on card and its off-screen copy, the
row toasts, the Start cell's card, and the headings of the phone's sheets.

#### Scenario: a row deleted

- **GIVEN** a plan whose row `020` is named `Paint`
- **WHEN** it is deleted
- **THEN** the toast SHALL name it `020 - Paint`

#### Scenario: a refusal naming a frozen row

- **GIVEN** the same row, frozen
- **WHEN** a delete is attempted on it
- **THEN** the refusal SHALL name it `020 - Paint`

#### Scenario: a sentence about where a value was inherited from

- **GIVEN** a child row carrying a tag written on `010`, which is named `Strip
the walls`
- **WHEN** the chip's hint is read
- **THEN** it SHALL say `inherited from 010 - Strip the walls`

#### Scenario: a sheet's heading on a phone

- **GIVEN** the card for row `010`
- **WHEN** its Priority sheet is opened
- **THEN** the heading SHALL be `Priority for 010 - ` followed by the row's name

#### Scenario: a row nobody has named

- **GIVEN** a row `030` whose name is empty
- **WHEN** it is referred to in words
- **THEN** it SHALL be named `030 - (unnamed)`
