## ADDED Requirements

### Requirement: Grant and access-group acts write audit rows

Granting or revoking an access role, removing a member's grants with the member, each
grant the operator's `revoke-backfill` deletes, and creating, renaming or deleting an
access group or adding or removing its member SHALL each write exactly one
`organization_audit` row in the same transaction as the act, with actions
`access_granted`, `access_revoked`, `access_group_created`, `access_group_renamed`,
`access_group_deleted`, `access_group_member_added`, `access_group_member_removed` and
subject kinds `access_grant`, `access_group`. The actor SHALL be the granting account's
id, or `operator:<os login>` for `revoke-backfill` (the `organization-limits-cli.ts`
precedent). The detail SHALL carry the role id, the scope kind and id, the subject kind
and id, the origin (`route`, `invitation`, `creation`, `cascade`, `operator`) and the
group name where relevant, and SHALL never carry an email. The migration that admits these
values SHALL keep the table's columns and rows, keep every existing action writable by the
outgoing release, and refuse rollback while a row of a new action exists. The backfill
SHALL NOT write audit rows.

#### Scenario: A grant audited

- **WHEN** an `org-admin` grants `(project P, project-contributor)` to group G
- **THEN** one `access_granted` row names the actor, the grant id, `project`, P, `group`,
  G and `project-contributor`

#### Scenario: Audit cannot be written

- **WHEN** the audit write fails while a grant is written
- **THEN** the grant is rolled back and the caller receives a server error

#### Scenario: Rollback over grant rows refused

- **WHEN** an `access_granted` row exists and the widening migration's `down.sql` runs
- **THEN** it fails and the table and its rows are unchanged
