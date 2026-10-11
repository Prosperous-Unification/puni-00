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
- **Reauthentication bound.** The time since the credential's last sign-in that sent `prompt=login` exceeds `reauthenticate_after_seconds`. The refusal's reason SHALL be `reauthenticate_after`.

The refusal SHALL carry a login path that sends `prompt=login`. The rule SHALL be evaluated at browser selection, at every resolution of an existing browser binding, at direct context issue, and at delegation verification. Refresh SHALL NOT reset the sign-in opening time. For a native password credential, both times SHALL be its verified issue time. A credential whose required time is unknown SHALL be refused. A delegation SHALL be refused in an organization with a policy until the delegation carries its grant's authentication time. The refusal SHALL apply only to that organization's context.

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
- **WHEN** M completes the refusal's login path (which sends `prompt=login`) and selects A
- **THEN** selection succeeds

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
