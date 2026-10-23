## REMOVED Requirements

### Requirement: A credential is linked to an existing account and may be pinned to a person

**Reason**: the operator-only link (`link-credential-cli.ts`, one `external_identity` row
pinned by `person_id`) is replaced by the organization-owned machine credential
(`machine-credentials`), which an organization admin creates, rotates and revokes, and
which binds its organization to the request. An operator CLI in the live container cannot
serve a tenant and binds no organization after activation.

**Migration**: none of the pinned rows is copied; PUNI's fleets are re-admitted through
the self-serve path as the first tenant (an admin issues API-key credentials for the agent
persons; laptop Claude Code authorizes its agent at the MCP consent page) before the swap,
and the outgoing colour honours the links until it stops. The pinned rows stay inert until a
later cleanup change drops the column. The CLI, `credential-link.ts`, its runbook section
and the `docs/auth-integration.md` "Fleet credentials" section are removed in the same
slice. The person usage count
`pinnedCredentials` is renamed `machineCredentials` and counts the new rows. The
`deletePerson` cascade behaviour is kept by `machine-credentials` ("Revocation is immediate
and audited").

## MODIFIED Requirements

### Requirement: A machine token is scoped by its linked account and never mints an account

be-01 SHALL refuse `401 unknown_identity`, before creating any account and whether or not
organizations are activated, every verified token of the configured issuer that carries no
groups claim: no `external_identity` row, pinned or not, SHALL admit it, and no credential
lookup SHALL happen for it. A machine is admitted only by a machine credential
(`machine-credentials`, "One verification path admits every source"). A token that carries
the groups claim SHALL keep today's mapping, so browser sign-in is unchanged.

#### Scenario: An unlinked machine token

- **WHEN** a verified token with no groups claim arrives for a pair no row names
- **THEN** the request is refused `401 unknown_identity` and the users table is unchanged

#### Scenario: A pinned link admits nothing

- **WHEN** a verified token with no groups claim arrives for a pair that exists as a pinned
  `external_identity` row written by the retired CLI
- **THEN** the request is refused `401 unknown_identity` and the row is unchanged

#### Scenario: A browser token keeps its groups

- **WHEN** a verified token carries `wbs_groups`
- **THEN** its scopes come from the groups claim as before, whether or not its pair is linked
