## MODIFIED Requirements

### Requirement: A machine token is scoped by its linked account and never mints an account

be-01 SHALL refuse, before creating any account and whether or not organizations are
activated, every verified token of the configured issuer that carries no groups claim: on
`/api` with `401 { error: 'machine_bearer_not_accepted', endpoint: '/mcp' }`
(`wbs-mcp-agent-surface` M9, its groups-less half), and at mcp-01's delegation route as no
upstream sign-in (`401 unauthenticated`). No `external_identity` row, pinned or not, SHALL
admit it, and no credential lookup SHALL happen for it. A machine is admitted only by a
machine credential (`machine-credentials`, "One verification path admits every source"). A
token that carries the groups claim SHALL keep today's mapping, so browser sign-in is
unchanged.

#### Scenario: An unlinked machine token

- **WHEN** a verified token with no groups claim arrives on `/api` for a pair no row names
- **THEN** the request is refused `401 machine_bearer_not_accepted` naming `/mcp`, and the
  users table is unchanged

#### Scenario: A pinned link admits nothing

- **WHEN** a verified token with no groups claim arrives on `/api` for a pair that exists as a
  pinned `external_identity` row written by the retired CLI
- **THEN** the request is refused `401 machine_bearer_not_accepted` and the row is unchanged

#### Scenario: A browser token keeps its groups

- **WHEN** a verified token carries `wbs_groups`
- **THEN** its scopes come from the groups claim as before, whether or not its pair is linked
