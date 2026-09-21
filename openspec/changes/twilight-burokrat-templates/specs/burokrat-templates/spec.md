## ADDED Requirements

### Requirement: The registry lists and shows templates

Twilight Burokrat SHALL expose every template under a stable identifier with its version and subject kind. It SHALL refuse an unregistered identifier or unknown action and name every registered identifier when the identifier is unknown.

#### Scenario: List registered templates

- **GIVEN** the shipped template registry
- **WHEN** a caller runs `template list`
- **THEN** Twilight Burokrat prints every registered template in stable identifier order with its version and subject kind

#### Scenario: Refuse an unregistered template

- **GIVEN** an identifier absent from the registry
- **WHEN** a caller runs `template show` for that identifier
- **THEN** Twilight Burokrat refuses it and names every registered identifier

#### Scenario: Refuse an unknown template action

- **GIVEN** an action other than `list`, `show`, or `verify`
- **WHEN** a caller runs the `template` command with that action
- **THEN** Twilight Burokrat refuses the command with its template usage

### Requirement: A template carries the skeleton a generator instantiates

Each template SHALL carry every prescribed file path, whether the file is required, and its skeleton content, and `template show` SHALL print that complete record.

#### Scenario: Show a template skeleton

- **GIVEN** a registered repository template
- **WHEN** a caller runs `template show repository`
- **THEN** the printed record contains the port contract, adapter, and conformance-test skeletons

### Requirement: A template carries the constraints that check it

Verification SHALL evaluate exactly the requirements in the selected template record. A template stating no requirements SHALL report no findings, and a requirement whose constraint cannot be satisfied by the selected artifact scope SHALL be refused rather than ignored.

#### Scenario: Evaluate the stated requirements

- **GIVEN** a template record with one declaration requirement
- **WHEN** its artifact is verified
- **THEN** verification evaluates that requirement and reports its finding

#### Scenario: Refuse a constraint outside the artifact scope

- **GIVEN** a file template carrying a module-only constraint
- **WHEN** its artifact is verified
- **THEN** Twilight Burokrat refuses the mismatched constraint instead of reporting conformance

### Requirement: A module declares its shape

A module directory SHALL carry a README with a title and the sections `What it owns`, `What it does not own`, `Relationships`, and `Checks`, a contract file, at least one kind file, and at least one test. The README template SHALL NOT require a wiki module-index envelope in this version.

#### Scenario: Report an incomplete module

- **GIVEN** a selected module directory missing its README, contract, kind file, and test
- **WHEN** the directory is verified against the module template
- **THEN** verification reports each missing part

### Requirement: A module's files stay in the module

Every module file SHALL sit directly in the module directory or its `view` directory, and every kind file SHALL satisfy the template for its own kind.

#### Scenario: Report a deeply nested module file

- **GIVEN** a selected module containing a file outside its root and `view` directory
- **WHEN** the directory is verified against the module template
- **THEN** verification reports that file's invalid location

#### Scenario: Delegate a kind file to its template

- **GIVEN** a module whose feature-service omits its capability declaration
- **WHEN** the directory is verified against the module template
- **THEN** verification reports the feature template's capability finding

### Requirement: A file declares exactly one kind

A service file SHALL declare exactly one kind by its suffix whether it is verified on its own or inside a module.

#### Scenario: Report two declared kinds

- **GIVEN** a file name containing both feature and resource kind suffixes
- **WHEN** the file or its module is verified
- **THEN** verification reports both declarations as a one-kind violation

### Requirement: A service names its domain owner

A feature-service SHALL state exactly one capability, a resource-service exactly one glossary term, and a repository adapter exactly one port in a real line comment. Text inside a string or block comment SHALL NOT count as a declaration, and a repository adapter SHALL have a sibling test.

#### Scenario: Report a missing service declaration

- **GIVEN** a feature-service with no real `@capability` line comment
- **WHEN** the file is verified
- **THEN** verification reports that it states zero capability declarations

#### Scenario: Ignore declaration-like text

- **GIVEN** declaration text appearing only in a string and a block comment
- **WHEN** the file is verified
- **THEN** verification does not count either occurrence as a declaration

#### Scenario: Report a missing repository test

- **GIVEN** a repository adapter without its sibling test
- **WHEN** the adapter is verified
- **THEN** verification reports the missing test file

### Requirement: Template direction checks refuse forbidden imports

The verifier SHALL report a feature importing a repository, a resource importing a feature, and a repository importing either service kind from parsed import syntax. It SHALL recognize side-effect imports, ignore import text in comments and strings, and state that purely type-only imports are outside this check.

#### Scenario: Report a parsed forbidden import

- **GIVEN** a feature-service with a side-effect import of a repository file and import-like text in a comment and string
- **WHEN** the feature-service is verified
- **THEN** verification reports only the parsed side-effect import

### Requirement: Verification is bounded and honest

Verification SHALL read one explicit candidate revision, state `certifies: false`, and exit non-zero when it reports a finding. It SHALL refuse an absent subject, a wrong subject kind, a non-candidate-relative path, an unknown selection kind, a non-UTF-8 file, and any selected TypeScript file that does not parse.

#### Scenario: Print a non-certifying finding

- **GIVEN** a selected artifact that violates its template
- **WHEN** a caller runs `template verify`
- **THEN** Twilight Burokrat prints a record with `certifies: false` and exits non-zero

#### Scenario: Refuse unusable candidate input

- **GIVEN** a selected artifact that is absent, wrongly scoped, non-UTF-8, or syntactically malformed
- **WHEN** a caller runs `template verify`
- **THEN** Twilight Burokrat refuses the specific boundary instead of defaulting the artifact
