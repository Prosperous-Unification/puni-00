## ADDED Requirements

### Requirement: Website binary declarations are exact

The repository policy SHALL declare exactly the existing three website icons and two fonts by path, MIME format, actual consumer and provenance source. Every other policy field SHALL remain unchanged.

#### Scenario: Existing website binaries classify through production and installed entrypoints

- **GIVEN** committed copies of the five actual website assets and their repository declarations
- **WHEN** the production CLI and installed package evaluate INV-CLASSIFY
- **THEN** classification succeeds with the exact declared metadata for all five paths

#### Scenario: Individual omissions remain refused

- **GIVEN** the same candidate with one of the five declarations independently removed
- **WHEN** either entrypoint evaluates INV-CLASSIFY
- **THEN** it refuses the omitted path as undeclared binary content

#### Scenario: Neighboring binary remains refused

- **GIVEN** an additional undeclared PNG beside the icons
- **WHEN** either entrypoint evaluates INV-CLASSIFY
- **THEN** it refuses that exact path

#### Scenario: A declaration contradicting ordinary text remains refused

- **GIVEN** ordinary UTF-8 text committed at each declared path independently
- **WHEN** either entrypoint evaluates INV-CLASSIFY
- **THEN** it refuses the binary declaration because the selected blob is ordinary text

#### Scenario: Requested committed blobs control classification

- **GIVEN** a commit containing the actual five binaries and later staged and working text replacements
- **WHEN** either entrypoint evaluates the original committed revision
- **THEN** classification succeeds using the original committed blobs

### Requirement: Survey comparison preserves identity

The external diagnostic policy SHALL remain immutable. Its successor SHALL differ only by the five exact declarations. Original and successor INV-CLASSIFY and full installed surveys SHALL select the same candidate revision and tool identity. Evidence SHALL distinguish classification success from unrelated full-survey findings and SHALL make no runtime asset digest enforcement claim.

#### Scenario: Same candidate comparison

- **GIVEN** the original immutable policy and its five-declaration successor
- **WHEN** the same installed executable evaluates the same committed candidate
- **THEN** concise evidence records both policy digests, candidate identity, classification outcomes and remaining full-survey findings
