## ADDED Requirements

### Requirement: Machine credential and trusted issuer acts write audit rows

Creating, rotating or revoking a machine credential and registering or removing a trusted
issuer SHALL each write exactly one `organization_audit` row in the same transaction as the
act, with actions `machine_credential_created`, `machine_credential_rotated`,
`machine_credential_revoked`, `trusted_issuer_registered`, `trusted_issuer_removed` and
subject kinds `machine_credential`, `trusted_issuer`. The actor SHALL be the admin's user
id. The detail SHALL carry the source, the person id, the name, the issuer and the secret
id where present, and SHALL never carry a secret, a digest or a subject. The migration that
admits these values SHALL keep the table's columns and rows, keep every existing action
writable by the outgoing release, and refuse rollback while a row of a new action exists. A
verification refusal and a last-use write SHALL NOT write audit rows.

#### Scenario: Rotation audited

- **WHEN** an admin rotates an `api_key` credential
- **THEN** one `machine_credential_rotated` row names the actor, the credential and the new
  secret id, and holds no secret and no digest

#### Scenario: Audit cannot be written

- **WHEN** the audit write fails while an admin creates a credential
- **THEN** the create is rolled back, the caller receives a server error, and no credential
  or secret is stored

#### Scenario: Rollback over credential rows refused

- **WHEN** a `machine_credential_created` row exists and the widening migration's
  `down.sql` runs
- **THEN** it fails and the table and its rows are unchanged
