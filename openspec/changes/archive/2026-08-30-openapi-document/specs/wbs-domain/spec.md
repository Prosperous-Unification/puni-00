## ADDED Requirements

### Requirement: The API answers with its own OpenAPI document

be-01 SHALL serve an OpenAPI 3.0 document describing every route it registers, at
one path, as JSON. The document SHALL name the header an account token is
presented in, and SHALL say that a request body a route parses by hand is
described rather than validated.

A copy of that document SHALL be committed to the repository, and a check SHALL
fail whenever the committed copy is not what the app serves — a document that has
drifted is read as current by whoever reads it, which is worse than none.

#### Scenario: the document is served as JSON

- **GIVEN** a built app
- **WHEN** its OpenAPI path is requested
- **THEN** it SHALL answer 200 with a JSON document
- **AND** that document SHALL hold every route the app registers

#### Scenario: a route that moves without the document reddens the check

- **GIVEN** the committed document
- **WHEN** a route's path changes and the committed document is left alone
- **THEN** the freshness check SHALL fail
- **AND** SHALL name the command that rewrites the document

### Requirement: A hand-parsed body is described, never declared

A route that validates its own body SHALL carry that body in the document as
documentation — the fields, their units, and the codes a refusal answers with —
and SHALL NOT declare it as a schema the framework validates.

The reason is a guard, not a preference: this framework strips unknown properties
before a handler runs, so a refusal written after a declared body schema cannot
fire. A check SHALL fail if such a route ever declares its body, because the
declaration and the description are indistinguishable to a reader of the document.

#### Scenario: a documented hand-parsed body says it is not validation

- **GIVEN** a route that parses its own body
- **WHEN** the document is read
- **THEN** its request body SHALL carry the fields and the refusal codes
- **AND** SHALL say that the schema shown is documentation rather than validation

#### Scenario: declaring one of those bodies reddens the check

- **GIVEN** a route that parses its own body
- **WHEN** a framework body schema is added to it
- **THEN** the check on documented bodies SHALL fail
