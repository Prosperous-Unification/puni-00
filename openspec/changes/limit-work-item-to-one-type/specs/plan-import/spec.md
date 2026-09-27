## ADDED Requirements

### Requirement: Import refuses several types per row

Plan import SHALL refuse a document in which any work item carries more than one type, naming each such row, without a partial write, whatever the document version. Whole-project copy and subtree duplication SHALL copy a work item's types exactly, carrying a type conflict unchanged.

#### Scenario: A multi-type row is refused

- **GIVEN** a document whose row 020 carries `Story` and `Spike`
- **WHEN** it is imported
- **THEN** the import is refused naming row 020 and no project is written
