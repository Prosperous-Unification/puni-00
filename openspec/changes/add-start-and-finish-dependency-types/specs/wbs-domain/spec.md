## MODIFIED Requirements

### Requirement: Dependencies constrain scheduled slices

Typed dependencies SHALL support FS, SS and FF as lower-bound inequalities: successor start no earlier than predecessor finish, successor start no earlier than predecessor start, and successor finish no earlier than predecessor finish, respectively. They SHALL NOT require simultaneous boundaries. Leaf Whole endpoints SHALL select last→first for FS, first→first for SS and last→last for FF; selected steps SHALL use their own start or finish. Parent endpoints SHALL apply the chosen relationship to every predecessor/successor descendant leaf pair, not to a parent envelope. Legacy `depReach` links SHALL retain their original FS interpretation.

#### Scenario: Start-to-start permits later start

- **GIVEN** A.Dev → B.Dev SS
- **WHEN** A.Dev starts before B.Dev
- **THEN** the relationship is satisfied even if the starts differ

#### Scenario: Finish-to-finish permits early successor start

- **GIVEN** A Whole → B Whole FF and B is longer than A
- **WHEN** B starts before A but finishes no earlier than A
- **THEN** the relationship is satisfied, subject to other constraints

#### Scenario: Parent SS waits for every leaf start

- **GIVEN** a parent A with two leaves, one of which has not started
- **WHEN** A Whole → B Whole SS is scheduled
- **THEN** B's first slice cannot start solely because the first A leaf started

### Requirement: Explicit dependencies are editable from the table and chart

The customization editor SHALL offer FS, SS and FF with full relationship names and explanation, while one-click search selection SHALL remain Whole→Whole FS. Chips and accessible labels SHALL identify relationship type and both scopes. SS Gantt arrows SHALL attach start→start; FF arrows SHALL attach finish→finish, including zero-time ticks for unknown slices. Collapsed proxies SHALL group by type and scope and reveal actual leaf arrows on expansion.

#### Scenario: A planner chooses FF

- **GIVEN** B's dependency editor is open
- **WHEN** the planner chooses A Whole, B QA and FF, then adds it
- **THEN** the chip identifies `010 FF · Whole → QA`
- **AND** the Gantt arrow joins A's actual finish to B.QA's actual finish

#### Scenario: Keyboard and mobile expose type

- **GIVEN** keyboard navigation or a mobile dependency card
- **WHEN** an SS or FF relationship is focused
- **THEN** its full wording, endpoints, Edit and Remove are available without hover
