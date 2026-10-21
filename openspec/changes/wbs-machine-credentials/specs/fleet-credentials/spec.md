## REMOVED Requirements

### Requirement: A credential is linked to an existing account and may be pinned to a person

**Reason**: the operator-only link (`link-credential-cli.ts`, one `external_identity` row
pinned by `person_id`) is replaced by the organization-owned machine credential
(`machine-credentials`), which an organization admin creates, rotates and revokes, and
which binds its organization to the request. An operator CLI in the live container cannot
serve a tenant and binds no organization after activation.

**Migration**: one forward migration copies every pinned `external_identity` row into
`machine_credential` with source `auth0`, the pinned person's organization and person, and
the linked user as creator; the source rows stay for the outgoing colour and are removed by
a later cleanup change. The CLI, its runbook section and the `docs/auth-integration.md`
"Fleet credentials" section are removed in the same slice. The person usage count
`pinnedCredentials` is renamed `machineCredentials` and counts the new rows. The
`deletePerson` cascade behaviour is kept by `machine-credentials` ("Revocation is immediate
and audited").

## MODIFIED Requirements

### Requirement: A machine token is scoped by its linked account and never mints an account

be-01 SHALL refuse `401 unknown_identity`, before creating any account and whether or not
organizations are activated, a verified token that carries no groups claim and whose pair is
no unrevoked machine credential. A verified token without a groups claim whose pair is an
unrevoked `auth0` machine credential SHALL be admitted as that credential: the pinned
person's bound account, scopes exactly `read` and `write`, bound to the credential's
organization (`machine-credentials`, "A machine token acts as its pinned person's account
with capped scopes"). The linked account's organization roles SHALL NOT widen those scopes.
A token that carries the groups claim SHALL keep today's mapping, so browser sign-in is
unchanged. A pinned `external_identity` row SHALL NOT admit a token on its own.

#### Scenario: An unlinked machine token

- **WHEN** a verified token with no groups claim arrives for a pair that no credential names
- **THEN** the request is refused `401 unknown_identity` and the users table is unchanged

#### Scenario: A credential of an admin's account

- **WHEN** a verified token with no groups claim arrives for an `auth0` credential whose
  person is bound to an account holding `admin` in the project's organization
- **THEN** a read and a command batch on that project are accepted, and an organization
  settings write is refused `403 insufficient_scope`

#### Scenario: A pinned link that was not migrated

- **WHEN** a verified token with no groups claim arrives for a pair that exists only as a
  pinned `external_identity` row and as no machine credential
- **THEN** the request is refused `401 unknown_identity`

#### Scenario: A browser token keeps its groups

- **WHEN** a verified token carries `wbs_groups`
- **THEN** its scopes come from the groups claim as before, whether or not its pair is linked
