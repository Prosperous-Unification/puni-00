## ADDED Requirements

### Requirement: A directory person may be bound to one account

The directory SHALL allow a person to carry at most one account, through
`patchPerson` with `accountId`, accepted only from a caller holding `admin` or
`super_admin` in the active organization. The binding SHALL be an additive nullable column
with a `down.sql` that refuses while any person is bound. The person read SHALL show the
binding; the plan export SHALL NOT carry account ids.

#### Scenario: An admin binds an agent to its account

- **WHEN** an admin patches person `Claire superagent` (kind `agent`) with the id of the
  account `claire-fleet`
- **THEN** the person read shows the binding and a later `claimWorkItem` naming that person
  from the `claire-fleet` account is accepted

#### Scenario: A member tries to bind

- **WHEN** a caller with role `member` patches a person's `accountId`
- **THEN** the command is refused with the organization's forbidden refusal

#### Scenario: Rollback over bound people

- **WHEN** `migrate-down-cli.ts --to=<the migration before this one>` runs while a person is
  bound
- **THEN** the rollback refuses, names the count of bound people and the command that
  unbinds them, and changes nothing

### Requirement: An operator grants a verified machine identity a membership

be-01 SHALL ship a CLI that, given an issuer, a subject, an organization and a role other
than `super_admin`, creates the account and its external identity mapping when absent and
grants the membership, in one transaction, printing what it created and what already
existed. It SHALL refuse a role of `super_admin`, an unknown organization, and a subject
already mapped to an account of a different issuer. It SHALL be the only path that grants
a membership without an invitation or a join request, and it SHALL run only where the other
host CLIs run.

#### Scenario: A first grant for a machine identity

- **WHEN** the CLI runs for an unseen `(issuer, subject)` with role `member`
- **THEN** an account, its mapping and the membership exist, and a request to be-01 bearing a
  verified token for that pair with the editor group reaches the organization's projects

#### Scenario: A second grant is idempotent

- **WHEN** the CLI runs again with the same arguments
- **THEN** it reports the existing account and membership and writes nothing

#### Scenario: Super-admin is refused

- **WHEN** the CLI is asked for role `super_admin`
- **THEN** it refuses before touching the store
