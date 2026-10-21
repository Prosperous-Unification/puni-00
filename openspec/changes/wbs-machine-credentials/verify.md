## Verification record

Drafted 2026-10-21 as an OpenSpec proposal only; nothing is implemented. A1 to A6 are
Dany's owner decisions (A7, A8, A21 and A22 added 2026-10-22; A21 withdraws A19, A22
supersedes A14); A9 to A20 in
design.md are assumed until he reads them. Sources read
on 2026-10-21: `wbs-team-claims` (D5 to D7, `fleet-credentials` spec, verify.md slice 0),
`organization-enterprise-sso` (provisioning tokens, audit widening),
`organization-ownership-and-access` (task 6.5 credential epoch, 6.6 raw-Bearer refusal),
`docs/auth-integration.md`, `link-credential-cli.ts`, `credential-link.ts`,
`authentication.feature.ts`, `organization-credential.ts`, `organization-access.ts`,
`token-verifier.ts`, `principal.ts`, `claim.ts`, mcp-01 `oauth.ts` and
`mcp-delegation-shapes.ts`, the migrations
`20261019130000_add_person_account`, `20261019130100_add_external_identity_person`,
`20261020120000_add_resources`, `20261012090000_add_enterprise_sso_records` and
`20261012090200_widen_organization_audit`.

Term collisions checked in `CONTEXT.md`: **Delegation** is an auth term, so the request
binding a credential supplies is called a direct organization context, never a delegation;
**Fleet credential** becomes an avoided name under **Machine credential**; **Provisioning
token** stays the SCIM secret and is not a credential source.

`openspec validate --all --json`: run before each push, result in the PR.

## What must be observed before any slice is called done

- Slice 1: a `wbs_mk_` token never reaches the JWT verifier (the fall-through negative); a
  secret presented under another credential's id is refused and only that credential's
  secrets are read; the digest comparison is constant-time (timing proof);
  a revoked credential is refused whatever its secrets' expiries (property); a machine key
  lists its organization's projects only and is refused on `GET /api/organization/members`;
  the enforcing-organization and session-policy cases admit a machine key; the
  `credential_not_for_person` and delegated-claim cases match the operator-linked
  behaviour byte for byte.
- Slice 2: the audit row and the credential commit or roll back together (the failing audit
  write stores nothing); the widened table refuses an unknown action and its rollback refuses
  over one new row; the migration lint names the destructive statement when the guard is
  removed; the old secret is admitted at T0 + 23 h and refused at T0 + 25 h; last use writes
  once per minute and a failed write is a server error.
- Slice 3: a consent for a stranger's agent leaves no family and no credential; an agent
  chosen at consent claims as itself through its own refreshed session; revoking the
  credential refuses the next tool call and the refresh; the agents offered are only those
  bound to the signed-in account.
- Slice 4: a pinned `external_identity` row admits nothing and is unchanged; a groups-less
  token of the configured issuer reads no credential; the CLI, its store module, the
  runbook section and the auth-integration section are gone; the secrets hook catches
  `wbs_mk_`; every fleet writes on dev through a self-serve credential.
- Slice 5: a disagreeing discovery document registers nothing; a stranger issuer is refused
  with zero key fetches; a JWKS 503 is refused without another issuer's cache; two
  organizations trusting one URL never admit each other's subjects; a real GitHub Actions
  token is admitted on dev.
- Slice 6: the secret is rendered once and absent after refresh, mutation, refusal and
  unmount; a wrong id sends no revoke; a viewer's page sends no credentials request; a
  member sees only their own agents' credentials on both pages.

## Failure proofs

| Check (file:line) | Fault injected | Test that observed the failure | Result |
| ----------------- | -------------- | ------------------------------ | ------ |
| —                 | —              | —                              | —      |

## Gate output

Not run: documentation-only proposal. `bunx openspec validate --all --json` on this
worktree is recorded in the PR.
