## ADDED Requirements

### Requirement: An undiscoverable configured issuer is refused at boot

When a server composes OIDC authentication, `AUTH_ISSUER_DISCOVERY_URL` SHALL be refused
before the server opens its database or listens if it is not a URL or its scheme is not
`https:`. The refusal SHALL name the key and, for a wrong scheme, the scheme; it SHALL NOT
contain the configured value. be-01 and gw-01 SHALL apply the same rule.

#### Scenario: A non-HTTPS issuer

- **WHEN** be-01's production entrypoint starts with `AUTH_MODE=oidc` and an `http:` issuer
- **THEN** it exits non-zero naming `AUTH_ISSUER_DISCOVERY_URL` and `https:`, without
  creating its database file and without the configured value in its output

#### Scenario: An unparsable issuer

- **WHEN** be-01's production entrypoint starts with an issuer that is not a URL
- **THEN** it exits non-zero with `AUTH_ISSUER_DISCOVERY_URL is not a URL`, without the value

#### Scenario: The gateway

- **WHEN** gw-01 loads its configuration with `AUTH_MODE=oidc` and an `http:` or unparsable
  issuer
- **THEN** loading throws naming `AUTH_ISSUER_DISCOVERY_URL`

### Requirement: A native session does not wait on issuer discovery

When password sessions are admitted, a native session token SHALL be verified on the JWT key
before the OIDC verifier is read, and a token that verifies there SHALL authenticate without
any OIDC read. A token that does not verify there SHALL reach the OIDC verifier as before,
including its failures. When OIDC is configured and password sessions are not explicitly
enabled, a native token SHALL NOT authenticate.

#### Scenario: Discovery fails

- **GIVEN** an OIDC verifier whose every call rejects as failed discovery does, and password
  sessions enabled
- **WHEN** a native session token authenticates
- **THEN** it authenticates as its account, first party
- **AND** a token that is not native still rejects with the verifier's failure
