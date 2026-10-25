## ADDED Requirements

### Requirement: Stray request input is refused with a declared 4xx

Every mounted endpoint SHALL answer each request-boundary failure the adapter can raise for it
with a refusal its shape declares at a 4xx status, never a 5xx: an undeclared or invalid query
(`invalid_query`) and an undeclared or invalid body (`invalid_body`) on every endpoint,
`invalid_params` where params are declared, and `invalid_json` where JSON media is accepted.
An endpoint with its own request-failure classifier SHALL answer each of those failures with a
declared 4xx refusal too.

#### Scenario: A stray query on any endpoint

- **WHEN** a request that would otherwise be admitted carries an undeclared query parameter
- **THEN** it is refused with a declared 4xx, `400 invalid_query` unless its endpoint models
  another refusal, and the handler does not run

#### Scenario: A stray body on a body-less write

- **WHEN** a body-less POST or DELETE carries `{}` as `application/json`
- **THEN** it is refused with a declared 4xx, `400 invalid_body` unless its endpoint models
  another refusal, and the handler does not run
