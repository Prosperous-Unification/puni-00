## ADDED Requirements

### Requirement: An undiscoverable configured issuer is refused at boot

When a server composes OIDC authentication, `AUTH_ISSUER_DISCOVERY_URL` SHALL be refused
before the server opens its database or listens if it is not a URL or its scheme is not
`https:`. The refusal SHALL name the key and, for a well-known wrong scheme, the scheme; it
SHALL NOT contain any part of the configured value. be-01 and gw-01 SHALL apply the same rule.

#### Scenario: A non-HTTPS issuer

- **WHEN** be-01's production entrypoint starts with `AUTH_MODE=oidc` and an `http:` issuer
- **THEN** it exits non-zero naming `AUTH_ISSUER_DISCOVERY_URL` and `https:`, without
  creating its database file and without the configured value in its output

#### Scenario: An unparsable issuer

- **WHEN** be-01's production entrypoint starts with an issuer that is not a URL
- **THEN** it exits non-zero with `AUTH_ISSUER_DISCOVERY_URL is not a URL`, without the value

#### Scenario: A scheme-less host and port

- **WHEN** be-01's production entrypoint starts with `host:443` as its issuer
- **THEN** it exits non-zero naming `AUTH_ISSUER_DISCOVERY_URL` and `https:`, without the host

#### Scenario: The gateway

- **WHEN** gw-01 loads its configuration with `AUTH_MODE=oidc` and an `http:` or unparsable
  issuer
- **THEN** loading throws naming `AUTH_ISSUER_DISCOVERY_URL`

### Requirement: A native session does not wait on issuer discovery

When password sessions are admitted, a native session token SHALL authenticate on the JWT key
without any read of the OIDC verifier, in authentication and in be-01's per-request credential
evidence. A token that does not verify on the JWT key SHALL reach the OIDC verifier as before,
failures included. With OIDC configured and password sessions not enabled, a native token SHALL
NOT authenticate.

#### Scenario: Discovery fails, password sessions on

- **GIVEN** be-01 booted with an OIDC verifier whose every call rejects, and password
  sessions enabled
- **WHEN** a native session token reads `/api/auth/me`, `/api/projects` or `/api/people`, by
  cookie or by Bearer
- **THEN** each answers 200
- **AND** an RS256 token on `/api/auth/me` or `/api/people` answers 500

#### Scenario: Discovery fails, password sessions off

- **GIVEN** the same verifier and password sessions disabled
- **WHEN** a native session token reads `/api/people`
- **THEN** it answers 500

### Requirement: A failed discovery is retried

The configured token verifier SHALL retry a failed discovery after a bounded cooldown rather
than hold the failure until restart.

#### Scenario: Discovery recovers

- **WHEN** the first discovery rejects and a later one, after the cooldown, succeeds
- **THEN** the configured verifier answers from the later discovery

## MODIFIED Requirements

### Requirement: Account resolution failures remain server failures

Authentication SHALL distinguish invalid credentials from unexpected verification and account-store failures. Invalid credentials SHALL answer 401; unexpected failures SHALL reach the server error boundary.

#### Scenario: Password account lookup fails

- **GIVEN** a valid password-session token that authenticates against a healthy store
- **WHEN** its account lookup throws
- **THEN** the mounted auth route answers 500 rather than 401

#### Scenario: OIDC account resolution fails

- **GIVEN** verified OIDC claims that resolve against a healthy store
- **WHEN** identity resolution throws
- **THEN** the mounted auth route answers 500 without falling back to password authentication

#### Scenario: Invalid credentials versus unavailable verifier

- **WHEN** token signature or identity claims are invalid
- **THEN** authentication answers 401
- **WHEN** the verifier throws an unexpected dependency failure for a token that reaches it
- **THEN** authentication answers 500
- **AND** a native session token admitted by password sessions never reaches it
