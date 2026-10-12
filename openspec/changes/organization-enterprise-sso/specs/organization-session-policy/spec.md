## ADDED Requirements

### Requirement: A super-admin sets the organization's session policy

Only a current super-admin of an activated organization SHALL set or clear its session policy. The policy SHALL have two values, `max_session_seconds` and `reauthenticate_after_seconds`. Each SHALL be null or an integer from 300 to 2,592,000. When both are set, `reauthenticate_after_seconds` SHALL NOT exceed `max_session_seconds`. Every change SHALL write one audit row in the same transaction. An organization without a policy SHALL behave as it did before this change.

#### Scenario: Set a policy

- **GIVEN** a super-admin of A
- **WHEN** they set `max_session_seconds` 28800 and `reauthenticate_after_seconds` 3600
- **THEN** the policy is stored and one audit row names both values

#### Scenario: Invalid values refused

- **GIVEN** a super-admin of A
- **WHEN** they set 299, 2592001, a non-integer, or a reauthentication bound larger than the session bound
- **THEN** WBS answers `400 invalid_body` and the policy is unchanged

#### Scenario: Non-super-admin refused

- **GIVEN** an admin of A
- **WHEN** they set or clear A's policy
- **THEN** WBS answers `403` and the policy is unchanged

### Requirement: Session policy is evaluated whenever the organization context is issued or resolved

In an organization with a session policy, WBS SHALL refuse the organization context with typed `403 reauthentication_required` in two cases:

- **Session bound.** The time since the credential's sign-in opened exceeds `max_session_seconds`. The refusal's reason SHALL be `max_session`.
- **Reauthentication bound.** The time since the credential's last interactive authentication (`reauthenticated_at`) exceeds `reauthenticate_after_seconds`. The refusal's reason SHALL be `reauthenticate_after`.

The refusal SHALL carry a login path that sends `prompt=login` and `max_age=<reauthenticate_after_seconds>`. A login callback SHALL set `reauthenticated_at` in one of two ways:

1. from the verified ID token's `auth_time`, only when the transaction sent `max_age` and the claim is present and no later than the callback;
2. otherwise to the callback time, only when the transaction sent `prompt=login` and the returned pair's `{strategy}|{connection}|` equals the authenticating pair of the credential it replaces, or when it opens a lifecycle with no predecessor.

Sending `prompt=login` alone SHALL NOT set it, and a link callback SHALL NOT change it. Limitation: `reauthenticated_at` proves an interactive authentication at Auth0, not necessarily a fresh credential entry at the customer's IdP, because Auth0 need not force the upstream IdP to prompt.

Times SHALL be compared in milliseconds using the evaluating service's injected `now()`. A bound is exceeded when the elapsed time is greater than the policy value times 1000; equality is admitted. The policy SHALL be read in the same query as the lifecycle and revocation lookup that resolution already performs. The rule SHALL be evaluated at browser selection, at every resolution of an existing browser binding, at direct context issue, and at delegation verification. Refresh SHALL NOT reset the sign-in opening time. For a native password credential, both times SHALL be its verified issue time. A credential whose required time is unknown SHALL be refused. A delegation SHALL be refused in an organization with a policy until the delegation carries its grant's authentication time. The refusal SHALL apply only to that organization's context.

#### Scenario: Session bound exceeded

- **GIVEN** A has `max_session_seconds` 28800, and M's sign-in opened 28801 seconds ago and has refreshed since
- **WHEN** M's next A request resolves the binding
- **THEN** WBS answers `403 reauthentication_required` with reason `max_session` and a `prompt=login` login path
- **AND** M's B context still resolves

#### Scenario: Reauthentication bound exceeded

- **GIVEN** A has `reauthenticate_after_seconds` 3600, and M's last `prompt=login` sign-in was 3601 seconds ago
- **WHEN** M selects A
- **THEN** WBS answers `403 reauthentication_required` with reason `reauthenticate_after`

#### Scenario: Fresh prompted sign-in admitted

- **GIVEN** the same policy
- **WHEN** M completes the refusal's login path (which sends `prompt=login` and `max_age`), the callback carries a verified `auth_time` from now, and M selects A
- **THEN** selection succeeds

#### Scenario: Link callback does not reauthenticate

- **GIVEN** A has `reauthenticate_after_seconds` 3600, and M's `reauthenticated_at` is 3601 seconds old
- **WHEN** M completes a link callback through `google-oauth2` whose transaction sent `prompt=login`, then selects A
- **THEN** selection answers `403 reauthentication_required`

#### Scenario: Different connection does not reauthenticate the replaced credential

- **GIVEN** M's credential was authenticated by `samlp|acme-saml|m`, and the callback carries no `auth_time`
- **WHEN** a login callback with `prompt=login` returns `google-oauth2|7` and replaces it
- **THEN** the new lifecycle's `reauthenticated_at` is not set from the callback time

#### Scenario: Exact bound under a fake clock

- **GIVEN** A has `max_session_seconds` 28800, and the service clock is fixed at `opened_at + 28800000` ms
- **WHEN** M's binding resolves, and resolves again with the clock advanced by 1 ms
- **THEN** the first resolution is admitted, and the second answers `403 reauthentication_required` with reason `max_session`

#### Scenario: Unknown time refused

- **GIVEN** A has a policy, and M's lifecycle was opened before the times were recorded
- **WHEN** M selects A
- **THEN** WBS answers `403 reauthentication_required`

#### Scenario: Delegation without an authentication time refused

- **GIVEN** A has a policy
- **WHEN** be-01 verifies an MCP delegation for A that carries no grant authentication time
- **THEN** the call answers `403 reauthentication_required` and nothing executes

#### Scenario: Policy cleared

- **GIVEN** A's policy was cleared
- **WHEN** M, whose sign-in is older than the former bounds, selects A
- **THEN** selection succeeds
