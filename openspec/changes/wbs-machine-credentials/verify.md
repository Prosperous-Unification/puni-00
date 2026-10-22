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
| `machine-credential.ts` (domain):113 revoked      | predicate removed                               | `refuses a revoked credential`, property `… whatever its secrets' expiries`; mounted `is refused unknown_identity after revoke` | 2 fail; mounted 1 fail |
| domain :117 source                                | comparison removed                              | `refuses an API key against a credential of another source holding its digest`                                                  | 1 fail                 |
| domain :122 bound account                         | unbound admitted                                | `refuses a credential whose person is no longer bound to an account`                                                            | 1 fail                 |
| domain :147 secret expiry                         | `unexpired = true`                              | `refuses a secret at and after its expiry …`                                                                                    | 1 fail                 |
| domain :157 trusted issuer                        | comparison `true`                               | `never admits another trusted issuer's credential for the same subject`                                                         | 1 fail                 |
| domain :75 `digestsEqual`                         | body replaced by `left === right`               | `reads every character of both digests whatever the first difference`                                                           | 1 fail                 |
| domain :161 family                                | comparison `true`                               | `admits a consent credential only for its own family`                                                                           | 1 fail                 |
| `authentication.feature.ts`:239 `wbs_mk_` routing | branch removed (key falls to the OIDC verifier) | `routes an API key to its credential and never to the JWT verifier` and 16 more                                                 | 17 fail                |
| `authentication.feature.ts`:387 direct context    | context removed from `machinePrincipalOf`       | `admits a live key to its organization's projects only`, `is refused organization administration …`, `… before activation`      | 3 fail                 |
| `authentication.feature.ts`:328 unwired           | answered `unknown_identity`                     | `throws on a well-formed key when machine credentials are not wired`                                                            | 1 fail                 |
| `authentication.feature.ts`:342 missing account   | answered `unknown_identity`                     | `throws when the admitted credential's account does not exist`                                                                  | 1 fail                 |
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

## Slice 1 review (Fable, 2026-10-22): merge after fixes, fixed

- **S2, A23 (assumed by the coordinator, for Dany):** the review reproduced a key pinned to a
  person bound to an admin account rebinding another person, then its own person, to a
  super-admin's account through `POST /api/directory/commands` (200 both); afterwards the
  same key acted as the super-admin. Fixed: `organizationRoleOf`
  (`authentication.feature.ts`:410, beside `machinePrincipalOf`) caps a machine principal's
  role at `member` (a viewer's machine stays a viewer), applied in
  `SqliteOrganizationAccess.resolve` (`organization-access.ts`:169). design.md A12 and A23,
  the spec requirement and its new scenario, and tasks.md 2.5 record it.
- **S3, cookie carrier:** a `wbs_mk_` key in `__Host-wbs_access` is refused
  `401 unknown_identity` before any read (`middleware/authenticated.ts`:75). Bearer only.
- **S3, last-use failure:** task 2.6's negative is observed now. A trigger that refuses every
  update of `machine_credential` turns the request into a 500.
- **Recorded:**
  - For slice 2 (tasks.md 2.5): mint ids with `crypto.randomUUID()`, because the id CHECK is
    looser than `parseMachineKey`; the CHECK may be tightened.
  - For slice 5 (tasks.md 5.2a): there is no constraint between a credential's organization
    and its trusted issuer's.
  - In the spec: the OIDC pair is unique deployment-wide, revoked rows included.
- **Nits fixed:** JSDoc on `MachineAdmission`; `newMachineKey` says production minting arrives
  with slice 2; the mounted machine tests send no `X-WBS-Expected-Organization` header.

| Check (file:line)                               | Fault injected                    | Test that observed the failure                                                                                                                                     | Result |
| ----------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| `authentication.feature.ts`:410 role cap        | stored role answered for machines | `refuses patchPerson to an admin-bound key`, `refuses an admin-bound key a person bound to another account`, `gives a super-admin-bound key no claim-admin bypass` | 3 fail |
| `middleware/authenticated.ts`:75 cookie carrier | refusal removed                   | `refuses a key carried by the session cookie, with no read`                                                                                                        | 1 fail |
| `authentication.feature.ts`:349 last-use write  | rejection caught and dropped      | `fails as a server error when its last use cannot be recorded`                                                                                                     | 1 fail |

Fresh results after the fixes (`CLAUDECODE` unset):

- `bunx nx run wbs-be-01:test --skip-nx-cache`: 3107 pass, 3 skip, 0 fail across 213 files (880 s). The mounted machine-credential file: 24 pass.
- `wbs-be-01:typecheck` and `wbs-be-01:lint`: exit 0. `tsc --build` for domain, core and store-sqlite: exit 0.
- Touched library tests: core authentication, credential-rules and claim-command 52 pass; domain machine-credential 15 pass; store-sqlite organization-credential-rules 3 pass.
- Migration lint: exit 0. `openspec validate --all --json`: 266 of 266 passed.

## Slice 2 record (2026-10-22)

Built on `feat/wbs-machine-credentials-2` from slice 1's head `e24675350`. Sources: the
create route mints `api_key` only; rotation refuses `oidc` and `mcp_consent`
`409 rotation_at_issuer`.

What was built:

- `GET`, `POST /api/organization/machine-credentials`, `POST …/:id/rotate`, `DELETE …/:id`
  (`machine-credential-shapes.ts`, `machine-credential.routes.ts`), over
  `MachineCredentialAdministration` and its SQLite store
  (`machine-credential-administration.ts`). Every act rechecks activation, the role and a
  member's own account inside its one immediate transaction with its audit row. A viewer is
  `403 forbidden`; every delegation, a machine key included, `403 insufficient_scope`.
- `20261022110000_widen_organization_audit_machine_credentials`: the five A17 actions and two
  subject kinds, by compatible rebuild, `down.sql` refusing while a new-vocabulary row exists.
- `20261022110100_check_machine_credential_id`: two triggers holding `machine_credential.id`
  to the lowercase UUID shape (additive; a tightened CHECK needs a rebuild).
- `appendOrganizationAudit` refuses a `wbs_mk_` value in a detail.
- Person usage: `machineCredentials` beside `pinnedCredentials`; `deletePerson` refused
  `in_use` while a live credential exists, the cascade revoking (one audit row each) and
  deleting every credential row of the person; `patchPerson` unbind or rebind refused `in_use`.
- mcp-01 excludes the four routes from its tools; be-01 composes the store in `boot.ts` and
  both organization harnesses; `buildServices` takes an optional `now` so a mounted test pins
  the rotation window from the route to the verification.

Commands and fresh results, each run in the worktree with `CLAUDECODE` unset:

| Command                                                                                                  | Result                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `migration-lint.ts` on both new `migration.sql` files                                                    | exit 0 each                                                                                                                                  |
| `bunx nx run wbs-be-01:typecheck --skip-nx-cache`                                                        | exit 0                                                                                                                                       |
| `bunx nx run wbs-be-01:lint --skip-nx-cache`; `eslint` and `prettier` on every changed file              | exit 0                                                                                                                                       |
| `bunx nx run wbs-be-01:test --skip-nx-cache`                                                             | 3138 pass, 3 skip, 0 fail across 215 files (979 s)                                                                                           |
| `bun test` `machine-credential-admin.controller.db.test.ts`                                              | 25 pass                                                                                                                                      |
| `bun test` `libs/wbs/domain/contracts` (whole library)                                                   | 495 pass, 0 fail across 51 files                                                                                                             |
| `bun test` `libs/wbs/adapters/store-memory` (whole library)                                              | 193 pass, 0 fail across 13 files                                                                                                             |
| `bun test` core `src/module/directory`, `plan-commands`, `authentication`, `src/http`, `directory-usage` | 208 pass, 0 fail across 32 files                                                                                                             |
| `bun test` core boundary, compose and readme tests                                                       | 43 pass, 0 fail across 7 files                                                                                                               |
| `bun test` the 35 touched or directory and audit `store-sqlite` tests                                    | 651 pass, 0 fail                                                                                                                             |
| `bun test` mcp-01 `openapi-tools`, `generated-document`, `shape-document`, `calendar-marker-shapes`      | 49 pass, 0 fail                                                                                                                              |
| `bun test tools/tool-git-hooks/src/hooks/migration-lint.test.ts`                                         | 21 pass, 0 fail                                                                                                                              |
| `bunx openspec validate --all --json`                                                                    | exit 0; 266 items, 266 passed                                                                                                                |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`              | exit 0, 39 indexes; the first run named slice 1's unindexed `module/authentication/machine-key.test.ts`, now indexed in that module's README |
| `… check-root-migration working . HEAD docs/findings/root-migration.v1.json`                             | exit 0                                                                                                                                       |

Not run, by the laptop RAM cap: the full `store-sqlite`, `core`, `mcp-01` and `fe-01` suites
and every workspace-wide target; CI runs them. fe-01 is untouched: it reads only
`pinnedCredentials`, and `machineCredentials` is optional on the wire.

Not verified: that no secret reaches a log line. Nothing in the routes or the store logs, and
the tests assert the secret and its digest are absent from list responses and audit rows, but
no test captures be-01's logger. The OpenAPI document is generated from the shapes at run
time (`documentFromShapes`); no emitted golden file exists to diff, so `app.routes.test.ts`
and `generated-document.test.ts` pin the operation ids instead.

### Slice 2 failure proofs

Each fault was injected into the production path, the named test watched failing, the fault
removed, and the test watched passing again (2026-10-22).

| Check (file)                                                   | Fault injected                                | Test that observed the failure                                                                           | Result                                      |
| -------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| audit widening `migration.sql` FK guard                        | `CHECK (violations = 0)` → `CHECK (1)`        | `migration-lint.test.ts` `accepts the machine credential audit rebuild`                                  | reports `destructive statement: DROP TABLE` |
| audit widening `down.sql` guard                                | new-vocabulary filter → `WHERE 0`             | `refuses rollback over one machine credential audit row, keeping it`                                     | fails on the narrow CHECK, guard unnamed    |
| id-shape insert trigger                                        | `WHEN 0`                                      | `refuses a credential id that is not a lowercase UUID`                                                   | misplaced-hyphen id stored                  |
| `organization-audit-log.ts` `isSecretShaped` `wbs_mk_`         | prefix dropped                                | `refuses a detail carrying a token, digest or full subject`                                              | API-key-shaped detail stored                |
| `machine-credential.routes.ts` delegation guard                | removed                                       | `refuses a machine key and a delegation every credential route`                                          | machine key's list 200                      |
| store `administeringRole` viewer                               | viewer admitted                               | `refuses a viewer every credential route`                                                                | viewer's list 200                           |
| store `reachable` own-account predicate                        | always the whole organization                 | `refuses a member the credentials of another account's agent`; `narrows a member to their own agents' …` | strangers' credentials listed               |
| store `createApiKey` member own account                        | removed                                       | `refuses a member another account's agent, writing nothing`                                              | 201 for Dany's agent                        |
| store `createApiKey` organization predicate                    | removed                                       | `refuses a person of another organization or of kind person`                                             | 409 `account_not_member`, not 404           |
| store `createApiKey` `account_not_member`                      | removed                                       | `refuses an agent bound to an account that is no member`                                                 | 201                                         |
| store `createApiKey` audit in the act's transaction            | audit appended in a second, later transaction | `stores nothing when the audit row cannot be written`                                                    | 201, not 500                                |
| store `rotateApiKey` `rotation_at_issuer`                      | removed                                       | `refuses rotation of a consent credential at the issuer, changing nothing`                               | 201                                         |
| store `rotateApiKey` `rotation_in_progress`                    | removed                                       | `refuses a second rotation inside the window, and allows one after it`                                   | 201                                         |
| `directory.ts` `removePerson` live machine credentials         | left out of the in-use test                   | `refuses removing a person with a live machine credential unless cascaded`                               | 200, person removed                         |
| `directory.ts` `removeMachineCredentialsOf` on removal         | call removed                                  | that case and `removes a person whose credentials are all revoked …`                                     | 500 on the `person_id` foreign key          |
| `directory.ts` `patchPerson` in-use refusal                    | removed                                       | `refuses unbinding or rebinding a person a live machine credential acts through`                         | 200, person unbound                         |
| mcp-01 `EXCLUDED_PATHS` (each of the two entries)              | removed in turn                               | `keeps machine credential administration out of the generated MCP tools`                                 | tools exposed, 2 fail each                  |
| `boot.ts` administration binding                               | removed                                       | `boot.db.test.ts` `serves machine credential administration from the shared database once activated`     | throws: not wired                           |
| domain `machine-credential.ts` secret expiry (slice 1's check) | predicate → `true`                            | `keeps the id, admits both secrets for 24 hours, then only the new one`                                  | rotated key 200 at T0 + 25 h                |

## Slice 2 review (Fable, 2026-10-22): merge after fixes, fixed

- **S2-1:** a name such as `a|b`, `samlp|acme|carol`, `wbs_mk_fleet` or 64 hex characters
  reached `appendOrganizationAudit`'s secret guard through the audit detail, causing an unmodeled
  500 on create, rotate, revoke and a person's cascade. Fixed: no audit detail carries the
  name, and the create route refuses such a name `400 invalid_body` by the guard's own
  predicate (`isSecretShaped`, moved to `@wbs/core` and shared), so the guard stays a
  programming-fault guard. With the name out of the detail, removing the boundary check
  stores the credential (201) rather than answering 500. That 201 is the observed negative.
- **S2-2/S2-3 (A24, assumed by the coordinator):** a member's cascade over another account's
  agent, and a machine key's cascade over its own person, each revoked a credential. Fixed:
  `removePerson` takes a `MachineCredentialReach` (`machineCredentialReachOf`: an admin
  reaches every person, a member a person bound to their own account, and a delegated scope
  none). The SQLite store applies it in the removal's transaction, else `forbidden`. A
  delegated request is known by the new optional `OrganizationScope.delegated`, which
  `resolve` sets for every delegation and machine context. No audit row names an acting
  credential, because every delegated cascade and revoke is refused before anything is written.
  The mounted cascade is proven for a machine key. An MCP delegation's cascade is not mounted
  (the delegation-capable harness has no directory command runner) and rests on the same
  `delegated` flag, set from `principal.delegation` for both.
- **S3-1:** `patchPerson { kind }` on an agent with a live credential is refused `in_use`.
- **S3-2:** tasks.md 2.4's negative now names the domain predicate the proof broke. The
  machine-key route test is named for what it runs, and an MCP delegation route test is added.
- **S3-3:** the own-account predicate throws instead of widening when `and()` answers nothing.
  That state cannot be produced (two conditions always build one), so it has no observed
  negative; it is an unexpected-nullish throw, as the failure policy asks.
- **Recorded:**
  - `name_taken` is organization-wide, so a member can probe whether a name is held, as the
    spec states.
  - The audit vocabulary CHECK needs a table rebuild on every growth. Follow-up: #632,
    "organization_audit: trigger-enforced vocabulary instead of CHECK rebuilds".
  - The reviewer judged this slice's rebuild acceptable and blue/green-safe: one write
    transaction under the runner's foreign-keys-off protocol, with every outgoing action kept.

| Check (file)                                      | Fault injected    | Test that observed the failure                                                                                                | Result                 |
| ------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| `machine-credential.routes.ts` secret-shaped name | check removed     | `refuses a name shaped like a secret or a subject, storing nothing`                                                           | 201, credential stored |
| `directory.ts` `removePerson` reach refusal       | removed           | `refuses a member's cascade over another account's agent's credential`, `refuses a machine key's cascade over its own person` | 2 fail: 200, revoked   |
| `organization-access.ts` `delegated` scope flag   | removed           | `refuses a machine key's cascade over its own person`                                                                         | 200, revoked           |
| `directory.ts` `patchPerson` kind comparison      | `rekinds = false` | `refuses turning an agent with a live machine credential into a person`                                                       | 200, kind changed      |
| `directory.ts` `patchPerson` account comparison   | `rebinds = false` | `refuses unbinding or rebinding a person a live machine credential acts through`                                              | 200, unbound           |
| `machine-credential.routes.ts` delegation guard   | removed           | `refuses an MCP delegation every credential route`                                                                            | delegation's list 200  |

Fresh results after the fixes (`CLAUDECODE` unset):

- `bunx nx run wbs-be-01:test --skip-nx-cache`: 3143 pass, 3 skip, 0 fail across 215 files (897 s). `machine-credential-admin.controller.db.test.ts`: 30 pass.
- `wbs-be-01:typecheck` and `wbs-be-01:lint`: exit 0. `eslint` and `prettier` on every changed file: clean.
- Libraries: contracts 495 pass; store-memory 193 pass, the directory conformance suite included; core directory, plan-commands, http, authentication, boundary and compose tests 251 pass across 39 files; the 35 touched store-sqlite tests 651 pass; domain `machine-credential.test.ts` 15 pass.
- Burokrat `check-indexes working . HEAD` and `check-root-migration`: exit 0. The fixes add no new file.
- `bunx openspec validate --all --json`: 266 of 266 passed.

## Slice 5 record (2026-10-22)

Built on `feat/wbs-machine-credentials-5` from slice 2's head `75533f167`, then merged with
slice 2's review fix `5f63bdd77` (clean merge; trusted-issuer audit details then lost the
free-text `defaultAudience`, and a secret-shaped issuer URL is refused `400 invalid_body`).
No migration: `20261022100000_add_machine_credential` already holds
`organization_trusted_issuer`, and slice 2's audit rebuild admits both trusted-issuer acts.

What was built:

- `GET`, `POST /api/organization/trusted-issuers`, `DELETE …/:id`
  (`machine-credential-shapes.ts`, `trusted-issuer.routes.ts`) over
  `TrustedIssuerAdministration` (`ports/trusted-issuers.ts`) and its SQLite store
  (`trusted-issuer-administration.ts`). Admin and super-admin only; registration checks
  `issuer_reserved` with no read, then the read-only gate check, then one discovery fetch
  (`trustedIssuerDiscovery`, `@wbs/auth`), then the write with its audit row.
- `POST /api/organization/machine-credentials` with `source: 'oidc'` (`createOidc`):
  `unknown_trusted_issuer`, `subject_taken`; rotation `rotation_at_issuer` as before.
- Verification: `TrustedIssuerKeySets` (`@wbs/auth` `trusted-issuer.ts`), one `jose`
  remote key set per JWKS URL, at most 64 cached (LRU), 30 s unknown-`kid` cooldown,
  asymmetric algorithms only; `authenticateTrustedIssuerToken` in
  `authentication.feature.ts`; `findByPair` / `trustedKeySetsOf` on `MachineCredentials`.
  `invalid_token` is a new whole 401 in `mount.ts`, like `unknown_identity`.
- The configured issuer is `OidcRouteOptions.issuer`, the Issuer Identifier the configured
  verifier's discovery publishes (`ConfiguredTokenVerifier.issuer()`).
- mcp-01 excludes the three routes from its tools.

Commands and fresh results after the merge, `CLAUDECODE` unset:

| Command                                                                                                    | Result                                             |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `bunx nx run wbs-be-01:typecheck --skip-nx-cache`                                                          | exit 0                                             |
| `bunx nx run wbs-be-01:lint --skip-nx-cache`; `eslint` and `prettier` on every changed file (lefthook)     | exit 0                                             |
| `bunx nx run wbs-be-01:test --skip-nx-cache`                                                               | 3183 pass, 3 skip, 0 fail across 217 files (913 s) |
| `bun test` the four machine-credential and trusted-issuer controller files                                 | 92 pass, 0 fail                                    |
| `bun test` `libs/wbs/adapters/auth` (whole library)                                                        | 115 pass, 0 fail across 9 files                    |
| `bun test` `libs/wbs/domain/contracts` (whole library)                                                     | 495 pass, 0 fail across 51 files                   |
| `bun test` core `module/authentication`, `src/http`, `src/ports`, `compose.test.ts`                        | 95 pass, 0 fail across 25 files                    |
| `bun test` store-sqlite `machine-credential*`, `organization-audit*`, `organization-access*`, `directory*` | 29 pass, 0 fail across 3 files                     |
| `bun test` mcp-01 `openapi-tools`, `generated-document`, `shape-document`, `calendar-marker-shapes`        | 50 pass, 0 fail                                    |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                | exit 0, 40 indexes                                 |
| `bunx openspec validate --all --json`                                                                      | exit 0; 266 items, 266 passed                      |

Not run, by the laptop RAM cap: the full `store-sqlite`, `core` and `mcp-01` suites and every
workspace-wide target; CI runs them. No migration changed, so migration lint was not rerun.

Not verified:

- 5.4: no real GitHub Actions token was presented on dev; every token here came from a local
  issuer on 127.0.0.1 behind an injected fetch.
- The two-organizations property of 5.2 is example-based here (`never admits another
organization's subject through one shared issuer URL`); the property test is slice 1's
  pure decision.
- That a secret-shaped issuer URL ever reaches the audit writer as a 500: the `|` case was
  refused by discovery (409) when the new 400 check was removed.
- Server-side fetch safety: discovery and key-set fetches go to any HTTPS URL an admin
  names (no private-address filter), with redirects not followed and a 5 s timeout.
- A key set that fails to fetch is refetched on the next token (jose keeps no failure
  cooldown); bounded only by request rate.

### Slice 5 failure proofs

Each fault was injected into the production path, the named test watched failing, the fault
removed, and the test watched passing again (2026-10-22).

| Check (file)                                               | Fault injected                   | Test that observed the failure                                                 | Result                            |
| ---------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------ | --------------------------------- |
| `authentication.feature.ts` configured issuer never routed | comparison removed               | `never consults trusted issuers for a configured-issuer token without groups`  | planted credential admitted, 200  |
| `authentication.feature.ts` stranger issuer                | answered `configured_path`       | `refuses a stranger issuer invalid_token without fetching any key set`         | 401 `unauthenticated`             |
| `authentication.feature.ts` verdict                        | `invalid` verdict admitted       | `refuses a token signed by another key`; `refuses a wrong audience, …`         | 200, 2 fail                       |
| store `findByPair` organization predicate (5.2a)           | removed                          | `refuses a credential that names another organization's trusted issuer`        | B's credential admitted, 200      |
| store `findByPair` audience                                | default audience only            | `refuses a wrong audience, the credential audience winning over the default`   | 200 for `aud: 'wbs'`              |
| store `createOidc` trusted issuer organization predicate   | removed                          | `refuses another organization's trusted issuer, writing nothing`               | 201 on B's issuer                 |
| store `createOidc` audit in the act's transaction          | audit failure caught and dropped | `stores no OIDC credential when the audit row cannot be written`               | 201, not 500                      |
| `TrustedIssuerKeySets.verify` unavailable key set          | rethrown                         | `refuses invalid_token when the key set answers 503, and reports it`           | 500                               |
| `TrustedIssuerKeySets` LRU eviction                        | removed                          | `keeps at most maxKeySets key sets, least recently used dropped first`         | 3 of 4 fetches                    |
| `trustedIssuerDiscovery` failure catch                     | rethrown                         | `refuses an unreachable issuer, storing nothing`                               | 500                               |
| `trustedIssuerDiscovery` issuer equality                   | removed                          | `refuses a document naming another issuer, storing nothing`                    | registered, 201                   |
| `trusted-issuer.routes.ts` `issuer_reserved`               | neutralized                      | `refuses the configured sign-in issuer, fetching nothing`                      | registered, 201                   |
| `trusted-issuer.routes.ts` secret-shaped issuer            | removed                          | `refuses a body whose issuer is no HTTPS issuer URL`                           | 409 `issuer_unreachable`, not 400 |
| store `registrationRefusal` connection organization        | removed                          | `refuses another organization's connection`                                    | registered, 201                   |
| store `registrationRefusal` strategy                       | removed                          | `refuses a SAML connection as the gate`                                        | registered, 201                   |
| store `registrationRefusal` proof                          | removed                          | `refuses an unproven connection as the gate`                                   | registered, 201                   |
| store `administering` admin only                           | members admitted                 | `refuses a member and a viewer every trusted issuer route`                     | member's list 200                 |
| store `remove` `in_use`                                    | removed                          | `refuses removing an issuer two live credentials name, …`                      | 500 on the foreign key            |
| store `register` audit in the act's transaction            | audit failure caught and dropped | `stores no trusted issuer when the audit row cannot be written`                | 201, not 500                      |
| `mount.ts` whole `invalid_token`                           | dropped from the condition       | `refuses a stranger issuer invalid_token without fetching any key set`         | 500                               |
| mcp-01 `EXCLUDED_PATHS` (each of the two entries)          | removed in turn                  | `keeps trusted issuer administration out of the generated MCP tools`           | tools exposed                     |
| `boot.ts` verification binding                             | renamed away                     | `refuses a stranger issuer's JWT invalid_token once booted`                    | authenticated as null             |
| `boot.ts` administration binding                           | renamed away                     | `serves trusted issuer administration from the shared database once activated` | throws: not wired                 |

## Slice 2 workspace gate fix (2026-10-22)

The workspace gate on `5f63bdd77` failed `wbs-core:typecheck:module` and
`wbs-store-sqlite:typecheck` (TS2554). Five test callers of `DirectoryStore.removePerson`
still passed three arguments after A24 added `reach`: `claim.db.test.ts`,
`resource-occupancy.db.test.ts`, `working-plan-directory.test.ts` (twice) and
`work-item.resource.test.ts`. Each now passes `{ kind: 'every' }`. Lesson: a changed shared
signature needs every library typecheck target that compiles its callers, tests included, not
only `wbs-be-01:typecheck`, which does not compile library tests.

Fresh results (`CLAUDECODE` unset):

- `bunx nx run-many -t typecheck,typecheck:module -p wbs-core,wbs-store-sqlite,wbs-contracts,wbs-store-memory,wbs-domain --skip-nx-cache`: all six targets succeed.
- The same for `wbs-conformance,wbs-runtime-portable,wbs-mcp-01,wbs-gw-01,wbs-auth,wbs-realtime,wbs-be-01`: all eight targets succeed (`wbs-be-01:typecheck` and `:typecheck:module` included).
- `bun test` `claim.db.test.ts`, `resource-occupancy.db.test.ts`: 81 pass, 0 fail. `working-plan-directory.test.ts`, `work-item.resource.test.ts`: 133 pass, 0 fail.
- `tool-devsync:test` was not touched here; it also fails on #628, and slice 1's worker owns it.

## Gate output

Not run: the h2puni gate is the coordinator's, after review. `bunx openspec validate --all
--json` on this worktree is recorded in the PR.
