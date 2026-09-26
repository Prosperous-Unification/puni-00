## ADDED Requirements

### Requirement: Plan documents carry step codes

A new-version plan export SHALL carry each step's code and SHALL show step references beside the structured step and work-item IDs it uses for estimates, facts and assignments. Import SHALL refuse a new-version document with a missing, malformed, reserved or duplicate step code without a partial write. A document of an earlier version SHALL import with codes suggested exactly as for newly created steps. Whole-project copy SHALL keep step codes; copied step node IDs SHALL follow the copied work item and step IDs.

#### Scenario: Codes round-trip

- **GIVEN** a project whose Dev step has code `impl` after a rename
- **WHEN** it is exported and imported into a new project
- **THEN** the imported Dev step has code `impl`

#### Scenario: A duplicate code is refused

- **GIVEN** a new-version document with two steps coded `qa`
- **WHEN** it is imported
- **THEN** the import is refused naming the duplicate and no project is written
