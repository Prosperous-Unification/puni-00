## ADDED Requirements

### Requirement: An account may act as the persons bound to it

The directory SHALL allow a person to carry at most one account, through `patchPerson` with
`accountId`, accepted only from a caller holding `admin` or `super_admin` in the active
organization. One account MAY be bound to many persons. The binding SHALL be an additive
nullable column with a `down.sql` that refuses while any person is bound. The person read
SHALL show the binding; the plan export SHALL NOT carry account ids.

#### Scenario: An admin binds two agents to one account

- **WHEN** an admin patches persons `claire` and `claire-worker` (kind `agent`) with the id of
  Dany's account
- **THEN** both person reads show the binding and a later `claimWorkItem` naming either
  person from a credential of that account is accepted

#### Scenario: A member tries to bind

- **WHEN** a caller with role `member` patches a person's `accountId`
- **THEN** the command is refused with the organization's forbidden refusal

#### Scenario: Rollback over bound people

- **WHEN** `migrate-down-cli.ts --to=<the migration before this one>` runs while a person is
  bound
- **THEN** the rollback refuses, names the count of bound people and the command that
  unbinds them, and changes nothing

### Requirement: A credential is linked to an existing account and may be pinned to a person

be-01 SHALL ship a CLI that, given an issuer, a subject, an existing account (by id or
username) and optionally a person, writes one `external_identity` row for that account,
pinned to that person when given, in one transaction, printing what it wrote. It SHALL refuse
an unknown account, a `(issuer, subject)` already linked to any account, and a person not
bound to that account. It SHALL NOT create accounts or memberships: the account's
memberships apply to every request the credential makes. It SHALL run only where the other
host CLIs run. Unlinking SHALL be the same CLI with `--unlink`.

#### Scenario: A fleet credential is linked and pinned

- **WHEN** the CLI links the Auth0 machine-to-machine `(issuer, subject)` of Claire's fleet
  to Dany's account pinned to person `claire`
- **THEN** a request bearing a verified token for that pair reaches the projects of Dany's
  organizations, and its claims are accepted for `claire` and for delegated claims under a claim
  of `claire`, and refused `credential_not_for_person` for any other person

#### Scenario: A second link is refused

- **WHEN** the CLI runs again for the same `(issuer, subject)`
- **THEN** it refuses naming the account already linked and writes nothing

#### Scenario: Pinning to a stranger's person

- **WHEN** the CLI names a person bound to another account, or bound to none
- **THEN** it refuses before touching the store

#### Scenario: Unlinking ends the credential

- **WHEN** the CLI unlinks the pair
- **THEN** the next request bearing a token for that pair is refused `401 unknown_identity`,
  no account is created, and the account's other credentials still work

### Requirement: A machine token is scoped by its linked account and never mints an account

After organization activation, be-01 SHALL refuse `401 unknown_identity`, before creating
any account, a verified token that carries no groups claim and whose `(issuer, subject)` is
linked to no account. A token that carries no groups claim and whose pair is linked SHALL be
scoped from the linked account's memberships: `viewer` reads, `member` reads and writes,
`admin` and `super_admin` edit. A token that carries the groups claim SHALL keep today's
mapping, so browser sign-in is unchanged.

#### Scenario: An unlinked machine token

- **WHEN** a verified token with no groups claim arrives for a pair that is linked to nothing
- **THEN** the request is refused `401 unknown_identity` and the users table is unchanged

#### Scenario: A linked machine token of a member

- **WHEN** a verified token with no groups claim arrives for a pair linked to an account whose
  role in the project's organization is `member`
- **THEN** a read and a command batch on that project are accepted, and an organization
  settings write is refused as a member's would be

#### Scenario: A browser token keeps its groups

- **WHEN** a verified token carries `wbs_groups`
- **THEN** its scopes come from the groups claim as before, whether or not its pair is linked
