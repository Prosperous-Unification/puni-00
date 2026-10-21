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

## A22 as built (2026-10-22)

The key is `wbs_mk_<credential id>.<secret>` in `Authorization: Bearer` only (design.md
A22). `parseMachineKey` reads it once: the prefix, a lowercase UUID, one `.`, 43
base64url characters. A prefixed token outside that grammar is `401 unknown_identity`
with no read, as the spec names it. A well-formed key reads its credential by primary
key with that credential's secrets, digests the secret with SHA-256, and
`digestsEqual` compares it with every one of those secrets without an early exit. No
index on `machine_credential_secret.digest` exists, so nothing can look a digest up.
Rotation keeps the id, because a rotation adds a secret row under the same credential.
`x-wbs-api-key` and every other header are not credentials.

## Slice 1 record (2026-10-22)

Built on `feat/wbs-machine-credentials-1`, rebased on `origin/plan/wbs-machine-credentials`
`c5f631e70` (carries A21 and A22). Sources `api_key`, `oidc`, `mcp_consent` only; nothing reads or
migrates `external_identity` for credentials.

Commands and fresh results, each run in the worktree with `CLAUDECODE` unset:

| Command                                                                                                                                        | Result                                                                                                         |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts apps/wbs/be-01/drizzle/20261022100000_add_machine_credential/migration.sql`          | exit 0                                                                                                         |
| `bunx nx run wbs-be-01:typecheck --skip-nx-cache`                                                                                              | exit 0                                                                                                         |
| `bunx nx run wbs-be-01:lint --skip-nx-cache`; `bunx eslint` and `prettier --check` on every changed file                                       | exit 0                                                                                                         |
| `bunx nx run wbs-be-01:test --skip-nx-cache`                                                                                                   | 3102 pass, 3 skip, 0 fail across 213 files (840 s)                                                             |
| `bunx tsc --build --force` of `@wbs/domain`, `@wbs/contracts`, `@wbs/core`, `@wbs/store-sqlite`, `@wbs/store-memory`, `tool-git-hooks`         | exit 0 each                                                                                                    |
| `bun test` `libs/wbs/domain/domain` machine-credential, readme, domain-ring-boundary                                                           | 19 pass, 0 fail                                                                                                |
| `bun test` `libs/wbs/application/core` claim-command, credential-rules, authentication/*, compose, module-boundaries, sideways-type-boundaries | 88 pass, 0 fail                                                                                                |
| `bun test` the 32 touched `store-sqlite` tests, `audit.test.ts`, `claim.db.test.ts`                                                            | 630 pass, 0 fail across 34 files (after fixing five list and audit-stamp expectations the new migration moved) |
| `bun test tools/tool-git-hooks/src/hooks.test.ts`                                                                                              | 19 pass, 0 fail                                                                                                |
| `bunx openspec validate --all --json`                                                                                                          | exit 0; 266 items, 266 passed                                                                                  |

Not run, by the laptop RAM cap: the full `store-sqlite`, `core`, `domain`, `contracts` and
`store-memory` suites and every workspace-wide target; CI runs them. Not verified: that the
digest comparison is timing-indistinguishable in practice. What is proven is structural:
`digestsEqual` reads all 64 characters of both digests wherever they first differ (the
read-counting proof below, after mcp-01's `oauth-timing-safe.proof.ts`). A known
credential id still costs a row read an unknown id does not. The id is public by A22, so
that difference reveals nothing secret. No timing measurement was made.

## Failure proofs

Each fault was injected into the production path, the named test watched failing, the
fault removed, and the test watched passing again (2026-10-22).

| Check (file:line)                                 | Fault injected                                  | Test that observed the failure                                                                                                  | Result                 |
| ------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `machine-credential.ts` (domain):109 revoked      | predicate removed                               | `refuses a revoked credential`, property `… whatever its secrets' expiries`; mounted `is refused unknown_identity after revoke` | 2 fail; mounted 1 fail |
| domain :113 source                                | comparison removed                              | `refuses an API key against a credential of another source holding its digest`                                                  | 1 fail                 |
| domain :118 bound account                         | unbound admitted                                | `refuses a credential whose person is no longer bound to an account`                                                            | 1 fail                 |
| domain :143 secret expiry                         | `unexpired = true`                              | `refuses a secret at and after its expiry …`                                                                                    | 1 fail                 |
| domain :153 trusted issuer                        | comparison `true`                               | `never admits another trusted issuer's credential for the same subject`                                                         | 1 fail                 |
| domain :71 `digestsEqual`                         | body replaced by `left === right`               | `reads every character of both digests whatever the first difference`                                                           | 1 fail                 |
| domain :157 family                                | comparison `true`                               | `admits a consent credential only for its own family`                                                                           | 1 fail                 |
| `authentication.feature.ts`:238 `wbs_mk_` routing | branch removed (key falls to the OIDC verifier) | `routes an API key to its credential and never to the JWT verifier` and 16 more                                                 | 17 fail                |
| `authentication.feature.ts`:380 direct context    | context removed from `machinePrincipalOf`       | `admits a live key to its organization's projects only`, `is refused organization administration …`, `… before activation`      | 3 fail                 |
| `authentication.feature.ts`:327 unwired           | answered `unknown_identity`                     | `throws on a well-formed key when machine credentials are not wired`                                                            | 1 fail                 |
| `authentication.feature.ts`:341 missing account   | answered `unknown_identity`                     | `throws when the admitted credential's account does not exist`                                                                  | 1 fail                 |
| `machine-key.ts`:32 grammar                       | malformed parsed as a key                       | `refuses a malformed key unknown_identity before any read` (table renamed away)                                                 | 1 fail                 |
| `services.ts`:176 wiring                          | inert store answering null                      | every admitting case of `machine-credential.controller.db.test.ts`                                                              | 15 fail                |
| `principal.ts`:88 machine pin                     | answered null                                   | `claims as its person and is refused as any other …`, `delegates under its own person's subtree claim …`                        | 2 fail                 |
| `credential-rules.ts`:89 machine rule             | branch removed                                  | `admits a machine key under enforced SSO`, `… under a session policy`                                                           | 2 fail                 |
| `machine-credential.ts` (store):91 last-use age   | `last_used_at <= at`                            | `records its last use at most once a minute`                                                                                    | 1 fail                 |
| store :57, :103, :110 shape checks                | each removed in turn                            | `fails as a server error on a malformed stored secret digest / source / revocation time`                                        | 1 fail each            |
| `down.sql`:12 rollback guard                      | inserts 0                                       | `refuses rollback while one credential exists, keeping it`, `… while a trusted issuer exists`                                   | 2 fail                 |
| `migration.sql`:58 per-source CHECK               | `CHECK (1)`                                     | `refuses a credential whose columns contradict its source`                                                                      | 1 fail                 |
| `migration.sql`:68 pair index                     | made non-unique                                 | `keeps one OIDC pair on one credential`                                                                                         | 1 fail                 |
| `plaintext-secrets.ts`:13 `wbs_mk_` pattern       | made unmatchable                                | `detects a WBS API key, and not its documented shape`                                                                           | 1 fail                 |

## Gate output

Not run: the h2puni gate is the coordinator's, after review. `bunx openspec validate --all
--json` on this worktree is recorded in the PR.
