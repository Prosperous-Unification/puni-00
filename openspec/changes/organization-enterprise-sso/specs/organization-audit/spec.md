## ADDED Requirements

### Requirement: Every enterprise SSO, provisioning and policy act writes one audit row in its own transaction

Each of the following acts SHALL write exactly one `organization_audit` row in the same transaction as the act:

- creating, updating, deleting or proving an enterprise connection, and changing its enforcement;
- issuing, rotating or revoking a provisioning token;
- provisioning, updating or deprovisioning a SCIM user, and activating a pending membership;
- changing the session policy.

The row SHALL name the organization, the actor (the super-admin's user id, or `scim:<token id>` for a SCIM act), the action, the subject kind and the subject id. Its detail SHALL never contain a token, a token digest or a full upstream subject. If the audit row cannot be written, the act SHALL be rolled back and its outcome SHALL NOT be reported as success. A refused act SHALL write no row. Existing `restricted_project_recovery` rows and writers SHALL keep working unchanged. Audit rows SHALL be append-only: the store SHALL refuse any update or delete of a row. They SHALL be retained with no cleanup.

#### Scenario: Connection change audited

- **GIVEN** a super-admin of A
- **WHEN** they enable enforcement on A's proven connection
- **THEN** one `sso_enforcement_changed` row naming the actor and the connection is written with the change

#### Scenario: SCIM act names the token as actor

- **GIVEN** token T of A
- **WHEN** T provisions `carol@acme.test`
- **THEN** one `scim_user_provisioned` row is written with actor `scim:<T's id>`, and no token or digest appears in it

#### Scenario: Audit cannot be written

- **GIVEN** an audit write that fails
- **WHEN** a super-admin creates a connection, issues a token or sets a policy, or a SCIM client deprovisions a user
- **THEN** the act is rolled back, the caller receives a server error, and storage is unchanged

#### Scenario: Audit rows cannot be changed

- **GIVEN** an `sso_connection_created` row
- **WHEN** a writer updates its detail or deletes it
- **THEN** the store refuses, and the row is unchanged

#### Scenario: Refused act leaves no audit

- **GIVEN** an admin who is not a super-admin
- **WHEN** they try to create a connection
- **THEN** WBS answers `403` and no audit row is written

### Requirement: The audit vocabulary widens without breaking the release it replaces

The migration that admits the new actions and subject kinds SHALL keep `organization_audit`'s columns and existing rows. The outgoing release SHALL be able to keep writing `restricted_project_recovery` rows while both colours share the database. An unknown action or subject kind SHALL still be refused by the store. Its rollback SHALL refuse while any row of a new action exists.

#### Scenario: Old release writes during the swap

- **GIVEN** the widened table
- **WHEN** the outgoing release writes a `restricted_project_recovery` row for a project
- **THEN** the write succeeds

#### Scenario: Unknown action refused

- **GIVEN** the widened table
- **WHEN** a writer inserts the action `sso_teleport`
- **THEN** the store refuses it

#### Scenario: Rollback over new rows refused

- **GIVEN** a `scim_user_provisioned` row exists
- **WHEN** the migration's `down.sql` runs
- **THEN** it fails, and the table and its rows are unchanged
