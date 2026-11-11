## ADDED Requirements

### Requirement: Grant and access-group acts write audit rows

Granting or revoking an access role, removing a machine credential's grants with the credential, each
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

Deleting an access group SHALL append one `access_revoked` row per actually deleted
grant, one `access_group_member_removed` row per actually deleted membership, and one
`access_group_deleted` row, all in the same owner and with distinct event IDs. Cascade
rows SHALL use the owning actor and operation origin `cascade`. A successful rename to
the same name SHALL still append one renamed row. Refusals SHALL append no success row.
Agent-pool re-key SHALL audit only actually inserted successor grants; duplicate copies
SHALL append no grant event. Stored grant origin/creator SHALL remain preserved while
the new audit records the actual pool owner, current act time and origin `cascade`.
Borrowed grant mutation functions SHALL return actual-row evidence without opening an
owner or appending audit; the authenticated owning operation SHALL append the evidence
on its same connection, with fresh per-row IDs for variable cascades.

Direct authenticated member removal SHALL instead write exactly one aggregate
`organization_member_removed` row with subject kind `organization_member`, subject id
the removed account id in the row's organization, and detail `source`,
`removedUserGrantCount`, `removedGroupMembershipCount`. This applies when either count
is zero. The source SHALL be `route` or `self_leave`, supplied by that owning caller.
The actor SHALL be the authenticated owning account's id. The row and all
membership/user-grant/group-membership removals SHALL commit or roll back together;
no individual `access_revoked` rows SHALL accompany this aggregate.

SCIM deprovisioning SHALL retain its existing single `scim_user_deprovisioned` lifecycle
row and `scim:<token id>` actor. Its existing detail SHALL additionally carry
`membershipRemoved`, nullable `boundUserId` and the two removal counts, with no extra
member or per-grant events. An inactive no-op PATCH SHALL still emit no event; deletion
of a pending/inactive SCIM record SHALL retain its lifecycle event with
`membershipRemoved:false` and zero counts. A transaction-bound removal operation SHALL
return its status and evidence to the owner without opening another transaction or
appending its own audit.

#### Scenario: Membership removal is one audited aggregate

- **WHEN** the authorized owning caller removes a member holding two direct grants and three access-group memberships
- **THEN** the membership, both grants and all three group memberships are removed with exactly one `organization_member_removed` row identifying that account and counts 2 and 3, and no per-grant revoke events

#### Scenario: A member without grants still has a membership audit subject

- **WHEN** the authorized owning caller removes a member with no grants or access-group memberships
- **THEN** exactly one `organization_member_removed` row identifies that account with both counts 0

#### Scenario: Membership audit failure rolls the removal back

- **WHEN** the aggregate audit write fails while removing a member
- **THEN** the membership, user grants and group memberships are unchanged and the caller receives a server error

#### Scenario: SCIM deprovision preserves its lifecycle audit contract

- **WHEN** SCIM deprovisions an active bound account holding direct grants and group memberships
- **THEN** all membership authority is removed atomically with its existing single lifecycle row identifying the bound account and removal counts, and no additional member/grant events

#### Scenario: SCIM pending and inactive records do not invent membership removals

- **WHEN** SCIM PATCH makes no change to an already inactive record, or deletes a pending/inactive record
- **THEN** PATCH writes no event and DELETE preserves its single lifecycle event with false/zero membership-removal evidence

#### Scenario: An inactive SCIM record can still have an audited update

- **WHEN** SCIM PATCH changes `externalId` on an already inactive record while leaving it inactive
- **THEN** its existing single `scim_user_updated` event is retained, with no membership or per-grant revoke events

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

#### Scenario: Group deletion audits every cascade and its root

- **WHEN** the owning operation deletes a group holding two grants and three members
- **THEN** exactly two access-revoked, three group-member-removed and one group-deleted rows commit with the deletion, each with its own audit ID and the actual owner's actor

#### Scenario: An accepted same-name rename is an audited act

- **WHEN** the owning operation successfully renames an access group to its current name
- **THEN** exactly one access-group-renamed row records the equal old and new names

#### Scenario: Duplicate re-key copies do not invent grant events

- **WHEN** two old pool credentials contribute the same scoped role to one successor credential
- **THEN** only the actually inserted successor grant has an access-granted event; each actually deleted old grant still has its own access-revoked event, and all existing credential/pool lifecycle rows remain atomic
