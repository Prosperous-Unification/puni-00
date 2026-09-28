## ADDED Requirements

### Requirement: Plan documents carry step codes

Plan document version 3 is the new version. A version-3 plan export SHALL carry each step's code, and SHALL be refused as a modeled 4xx naming the steps and the backfill command while any step is uncoded, never inventing a code on read and SHALL show step references beside the structured step and work-item IDs it uses for estimates, facts and assignments. Import SHALL refuse a new-version document with a missing, malformed, reserved or duplicate step code without a partial write. A document of an earlier version SHALL import with codes suggested exactly as for newly created steps. Whole-project copy SHALL keep step codes; copied step node IDs SHALL follow the copied work item and step IDs.

#### Scenario: Codes round-trip

- **GIVEN** a project whose Dev step has code `impl` after a rename
- **WHEN** it is exported and imported into a new project
- **THEN** the imported Dev step has code `impl`

#### Scenario: Export waits for the backfill

- **GIVEN** a project with a step an older writer created without a code
- **WHEN** it is exported before the backfill runs
- **THEN** the export is refused naming that step and the backfill command

#### Scenario: A duplicate code is refused

- **GIVEN** a new-version document with two steps coded `qa`
- **WHEN** it is imported
- **THEN** the import is refused naming the duplicate and no project is written

#### Scenario: An earlier-version document is coded by suggestion

- **GIVEN** a version-1 or version-2 document whose steps are named Discover, Build and Verify
- **WHEN** it is imported and the new project exported
- **THEN** the exported steps are coded `discover`, `build` and `verify`, whatever the earlier file held under `code`

#### Scenario: A malformed or reserved code is refused

- **GIVEN** a version-3 document with a step coded `QA` or `s1-qa`
- **WHEN** it is imported
- **THEN** the import is refused as `invalid_body` at that step's `code` and no project is written
