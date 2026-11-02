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

| Command                                                                                                    | Result                                               |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `bunx nx run wbs-be-01:typecheck --skip-nx-cache`                                                          | exit 0                                               |
| `bunx nx run wbs-be-01:lint --skip-nx-cache`; `eslint` and `prettier` on every changed file (lefthook)     | exit 0                                               |
| `bunx nx run wbs-be-01:test --skip-nx-cache`                                                               | 3183 pass, 3 skip, 0 fail across 217 files (913 s)   |
| `bun test` the four machine-credential and trusted-issuer controller files                                 | 92 pass, 0 fail                                      |
| `bun test` `libs/wbs/adapters/auth` (whole library)                                                        | 115 pass, 0 fail across 9 files                      |
| `bun test` `libs/wbs/domain/contracts` (whole library)                                                     | 495 pass, 0 fail across 51 files                     |
| `bun test` core `module/authentication`, `src/http`, `src/ports`, `compose.test.ts`                        | 95 pass, 0 fail across 25 files                      |
| `bun test` store-sqlite `machine-credential*`, `organization-audit*`, `organization-access*`, `directory*` | 29 pass, 0 fail across 3 files                       |
| `bun test` mcp-01 `openapi-tools`, `generated-document`, `shape-document`, `calendar-marker-shapes`        | 50 pass, 0 fail                                      |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                | exit 0, 39 indexes (first written as 40: a miscount) |
| `bunx openspec validate --all --json`                                                                      | exit 0; 266 items, 266 passed                        |

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

## Slice 5 review (Fable, 2026-10-22): merge after fixes, fixed

No S1. Decision **A25** (the coordinator's, for Dany; design.md A25, spec and tasks 5.5 and
5.6 amended): a trusted issuer registration requires an `audience`, unique with its issuer URL
across the deployment (`409 audience_taken`); a subject is unique per registration, so
`subject_taken` consults no other organization; verification selects the registration by
`(iss, aud)` (none or more than one match: `invalid_token`, no fetch), then the credential by
`(registration, sub)`, and always checks `aud`. A credential's own `audience` narrows: its
token carries both. Migration `20261022120000_scope_trusted_issuer_audience` (additive: two
unique indexes, two triggers holding the audience non-null, and the deployment-wide
`machine_credential_pair` dropped; no rebuild) with a `down.sql` refusing while two
organizations bind one subject.

The review's MUST and SHOULD items, as built:

- S2-3: negatives for the algorithm allow-list, the non-empty `sub`, the `jwks_uri` length, a
  non-200 key set and both 5 s timeouts (a never-answering fetch with a 50 ms override).
- S3-1: `requiredClaims: ['exp', 'sub']` and a remaining lifetime of at most one hour. This is
  checked as `exp - now`, not jose's `maxTokenAge`, because that one requires `iat`.
- S3-2: eight trusted issuers per organization (`409 trusted_issuer_limit`); a 30 s
  cooldown after a failed key-set fetch.
- S3-3: `isPublicIssuerUrl` (core `ports/trusted-issuers.ts`) refuses literal IPv4/IPv6
  hosts, `localhost` and `.internal`/`.local`/`.localhost` names, both for the registered
  issuer (`400 invalid_body`) and for the discovered `jwks_uri` (`issuer_unreachable`).
  DNS rebinding is left to TLS certificate validation (JSDoc). Bodies are read through a
  streaming cap: 64 KB for discovery, 256 KB for a key set.
- S3-4: `NO_PENDING_MEMBERSHIPS`'s JSDoc restored in `app.ts`.

Recorded, not fixed (S3-5, S3-6):

- Production `OidcRouteOptions.issuer` comes from real discovery, which is untested: every
  fixture stubs it. A rejected memoised discovery in `oidcTokenVerifierFromEnv` stays
  rejected until restart, as the configured verifier's always has.
- Indexes are 39, not 40.
- Delegations on the trusted-issuer routes are covered transitively: they share
  `sessionOrganizationOf` with the credential routes, whose test covers a delegation; the
  trusted-issuer test covers a machine key.
- 5.4 (a real GitHub Actions token on dev) stays open. It now also needs `audience` set on
  the workflow's token request.
- `browser-lifecycle.mounted-process.db.test.ts` failed one to three timing cases in two runs
  under a host load of 12 (other agents) and passed 11 of 11 alone. The fresh full run below
  passed it. It is untouched by this slice.

Merged `origin/feat/wbs-machine-credentials-2` at `d026dabfc` (the library-typecheck fix);
`verify.md` conflicted and keeps both records.

Fresh results on the merged tree (`CLAUDECODE` unset):

| Command                                                                                                                                          | Result                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `bunx nx run wbs-be-01:test --skip-nx-cache`                                                                                                     | 3193 pass, 3 skip, 0 fail across 218 files (927 s) |
| `bunx nx run wbs-be-01:typecheck --skip-nx-cache`, `:lint --skip-nx-cache`                                                                       | exit 0                                             |
| `bunx nx run-many -t typecheck,typecheck:module -p wbs-core,wbs-store-sqlite,wbs-contracts,wbs-store-memory,wbs-domain,wbs-auth --skip-nx-cache` | all succeed                                        |
| `bun test` the four `tool-devsync` boundary, targets, retired-roots and toolchain-pins tests                                                     | 78 pass, 0 fail                                    |
| `bun test` `@wbs/auth` (whole library)                                                                                                           | 124 pass, 0 fail                                   |
| `bun test` `@wbs/contracts` (whole library)                                                                                                      | 495 pass, 0 fail                                   |
| `bun test` core `module/authentication`, `src/http`, `src/ports`, `compose.test.ts`                                                              | 95 pass, 0 fail                                    |
| `bun test` the 31 store-sqlite migration-ledger tests and `machine-credential*`                                                                  | 611 pass, 0 fail across 32 files                   |
| `bun test` the four mcp-01 shape and tool tests                                                                                                  | 50 pass, 0 fail                                    |
| `migration-lint.ts` on `20261022120000_scope_trusted_issuer_audience/migration.sql`                                                              | exit 0                                             |
| `check-indexes working . HEAD`                                                                                                                   | exit 0, 39 indexes                                 |
| `bunx openspec validate --all --json`                                                                                                            | 266 of 266 passed                                  |

### Review fix failure proofs

Each fault was injected into the production path, the named test watched failing, the fault
removed, and the test watched passing again (2026-10-22).

| Check (file)                                         | Fault injected               | Test that observed the failure                                               | Result                                   |
| ---------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------- |
| `TrustedIssuerKeySets.verify` `algorithms`           | option removed               | `refuses alg none and an HS256 token signed with a published oct key`        | `JOSENotSupported` thrown, not `invalid` |
| `verify` non-empty `sub`                             | check removed                | `refuses an empty sub`                                                       | verified, subject `''`                   |
| `verify` `requiredClaims` `exp`                      | `exp` dropped                | `refuses a token without exp or living longer than an hour`                  | verified                                 |
| `verify` one-hour lifetime                           | check neutralized            | same                                                                         | ten-year token verified                  |
| `fetchKeySet` status 200                             | check removed                | `refuses a key set answered by a redirect or a 404, and reports it`          | 500-status key set verified              |
| `verify` 30 s failure cooldown                       | short-circuit removed        | `fetches a failing key set at most once per cooldown`                        | 3 fetches, not 2                         |
| `fetchKeySet` timeout race                           | race removed                 | `ends a key-set fetch that never answers at its timeout`                     | hung past 2 s                            |
| `discover` timeout race                              | race removed                 | `ends a discovery that never answers at its timeout`                         | hung past 2 s                            |
| `cappedJson` body cap                                | cap removed                  | `refuses a key set larger than its cap`                                      | verified                                 |
| `discover` `jwks_uri` length                         | bound removed                | `answers unreachable for every document it cannot use`                       | 2049-char URI discovered                 |
| `discover` `isPublicIssuerUrl`                       | check neutralized            | same                                                                         | plain-HTTP URI discovered                |
| `trusted-issuer.routes.ts` public host               | check removed                | `refuses an issuer on a literal IP or a private name, fetching nothing`      | 409 `issuer_unreachable`, not 400        |
| store `audience_taken`                               | refusal removed              | `refuses a second organization the same issuer and audience`                 | 500 on the unique index                  |
| store `trusted_issuer_limit`                         | refusal removed              | `refuses a ninth trusted issuer`                                             | registered, 201                          |
| `authenticateTrustedIssuerToken` single registration | `length > 1` dropped         | `refuses a token naming two organizations' audiences`                        | admitted as A, 200                       |
| `authenticateTrustedIssuerToken` credential audience | registration's audience only | `refuses a wrong audience, the credential audience winning over the default` | 200                                      |
| store `createOidc` subject per registration          | predicate → the issuer URL   | `binds one subject in two organizations through one shared issuer URL`       | B refused 409 `subject_taken`            |
| migration audience trigger                           | `WHEN 0`                     | `refuses a trusted issuer without an audience`                               | stored                                   |
| migration subject index                              | made non-unique              | `keeps one subject per trusted issuer, and lets two issuers share it`        | stored                                   |
| `down.sql` guard                                     | inserts 0                    | `refuses rollback while two organizations bind one subject`                  | failed on the bare index, guard unnamed  |

## Slice 3 record (2026-10-22)

Built on `feat/wbs-machine-credentials-3` from `origin/plan/wbs-machine-credentials` at
`412c62038` (slices 1, 2 and 5 and main with #622 and #624). See tasks.md, "Slice 3 as
built", for what differs from the task text.

What was built:

- be-01: `POST /internal/mcp/organizations` lists `agents` per membership;
  `POST /internal/mcp/credentials` mints the `mcp_consent` credential with its audit row
  (`ConsentCredentials`, `consent-credential.ts`); `/internal/mcp/delegation` takes
  `credentialId` and signs `credential_id`/`person_id` with scopes capped to `read write`;
  `/internal/mcp/authority` takes `credentialId` and `grant`; the delegation verifier admits
  a consent delegation only while its credential is live for that family, organization,
  person and account; `POST /internal/mcp/credentials/ended` revokes on mcp-01's report.
- `@wbs/contracts`: `CredentialAuthentication` kind `consent`, `credentialPinOf` reads its
  person; `@wbs/core`: the credential rules judge its upstream pair, `organizationRoleOf`
  caps it to `member`.
- mcp-01: migration `20261022130000_mcp_family_person`; the choice page offers agents (also
  for one organization); choosing one records the pending consent, mints, then issues the
  code; family and sessions carry person and credential; `reportEndedConsents` sweeps once a
  minute from `main.ts`.

Commands and fresh results, `CLAUDECODE` unset:

| Command                                                                                                                                                                                                                                                                | Result                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `bunx nx run-many -t typecheck,typecheck:module -p wbs-core,wbs-store-sqlite,wbs-contracts,wbs-store-memory,wbs-domain,wbs-auth,wbs-gw-01,wbs-mcp-01,wbs-realtime,wbs-runtime-portable,wbs-conformance,wbs-be-01 --skip-nx-cache` (after merging slice 6, `6ed37a10d`) | exit 0, 12 projects                                                                                              |
| `bunx nx run-many -t lint -p wbs-mcp-01,wbs-be-01 --skip-nx-cache`                                                                                                                                                                                                     | exit 0                                                                                                           |
| `bunx nx run wbs-be-01:test --skip-nx-cache`                                                                                                                                                                                                                           | 3214 pass, 3 skip, 0 fail across 218 files (983 s)                                                               |
| `bunx nx run wbs-mcp-01:test --skip-nx-cache`                                                                                                                                                                                                                          | 511 pass, 1 fail (`credential-epoch-cli.ts > refuses without MCP_STORE_PATH…`, the worktree's `.env`, see below) |
| `bun test apps/wbs/mcp-01/src/credential-epoch.test.ts` with `apps/wbs/mcp-01/.env` moved aside                                                                                                                                                                        | 19 pass, 0 fail                                                                                                  |
| `bunx nx run tool-devsync:test --skip-nx-cache`                                                                                                                                                                                                                        | 894 pass, 0 fail across 47 files (606 s)                                                                         |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                                                                                                                                                            | exit 0                                                                                                           |
| `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts $(git ls-files '*.sql')`                                                                                                                                                                                     | exit 0                                                                                                           |
| `bunx openspec validate --all --json`                                                                                                                                                                                                                                  | 267 of 267 passed                                                                                                |

Failure proofs, each watched on 2026-10-22 with the fault injected into the production path,
the named test observed failing, and the code restored (the adjacent `Proof:` comment names
both):

| Check                                                        | Injected fault                                | Observed failing test                                                                                                                                                |
| ------------------------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| agents listed for the token's account only (`agentsBoundTo`) | `account_id = userId` predicate removed       | `lists only the agents bound to the token's account` (ada saw eve's agent)                                                                                           |
| mint only for the account's own agent (`mint`)               | `account_id = userId` predicate removed       | `refuses a mint for another account's agent, storing nothing`                                                                                                        |
| end report touches only that family's credential             | `mcp_family_id` predicate removed             | `ignores an end report that names another family`                                                                                                                    |
| no mint without a key pair                                   | inactive/key refusal removed                  | `mints nothing before activation or without a key pair` (201)                                                                                                        |
| mint only for the account the token proves                   | `binding_changed` comparison removed          | `refuses a mint for an account the token does not prove`                                                                                                             |
| no delegation for a revoked consent credential               | `credential_revoked` refusal removed          | `refuses the next delegation of a revoked consent credential`                                                                                                        |
| consent delegation capped to read and write (issue)          | ceiling = the token's scopes                  | `issues a delegation pinned to the agent, capped to read and write` (signed `read write editor`)                                                                     |
| consent family denied once revoked (authority)               | credential reread skipped                     | `denies a consent family once its credential is revoked`                                                                                                             |
| malformed consent request refused at the boundary            | id and client checks removed                  | `refuses a malformed consent request` (server error at the id trigger)                                                                                               |
| authority names credential and family together               | both-or-neither check removed                 | `refuses a cookie beside the upstream token and a malformed body`                                                                                                    |
| consent delegation refused on use once revoked (verifier)    | refusal skipped                               | `refuses a delegation issued before its credential was revoked` (200); `admits a consent delegation as its agent, capped to read and write`                          |
| consent claims both or neither                               | check removed                                 | `refuses a consent delegation that names a person without its credential`                                                                                            |
| consent principal capped to read and write (verifier)        | `MACHINE_SCOPES` filter removed               | `admits a consent delegation as its agent, capped to read and write`                                                                                                 |
| consent judged by the human's enforced SSO pair              | `consent` left out of the SSO rule            | `refuses a consent delegation whose human signed in outside the enforced connection, and admits one inside it`                                                       |
| A23 cap covers a consent                                     | `consent` left out of `organizationRoleOf`    | mcp-01 boot `a consent session's tool call claims as its agent, never with the human's reach` (`loose` answered `credential_not_for_person`, not `person_not_bound`) |
| claim pin reads a consent's person                           | `consent` left out of `credentialPinOf`       | same boot test (claim as `codex` accepted)                                                                                                                           |
| verifier wired with the credential reader (boot)             | reader left out of `boot.ts`                  | mcp-01 boot `offers dany's agents at consent, …` and the two after it                                                                                                |
| mcp-01 sends the credential on every delegation              | `credentialId` dropped in `bearerFor`         | mcp-01 boot claim test (claim as `codex` accepted)                                                                                                                   |
| mcp-01 sends credential and family on the authority read     | the two fields dropped                        | mcp-01 boot `revoking the consent in WBS ends the session: 401, and refresh is refused` (refresh 200)                                                                |
| family consent passed to the authority reader                | consent left out of `checkRefreshAuthority`   | mcp-01 boot `offers dany's agents at consent, …` (every consent family refused)                                                                                      |
| end acknowledged only after be-01 answered                   | `reportConsentEnded` call removed             | mcp-01 boot `a family mcp-01 ends marks its credential revoked in WBS`                                                                                               |
| agents offered for one organization                          | single membership bound whatever its agents   | `offers the agents of a single organization` (302)                                                                                                                   |
| agent index a plain decimal                                  | regex removed                                 | `refuses a forged agent choice` (`-1`, `00` minted)                                                                                                                  |
| no code after a refused mint                                 | refusal skipped                               | `refuses consent as another account's agent and creates no family`                                                                                                   |
| exchange refuses a consent no longer pending (store)         | `changes !== 1` refusal removed               | `refuses to exchange a consent code whose pending consent was already reported ended`                                                                                |
| exchange maps it to `invalid_grant`                          | mapping removed                               | `refuses a consent code whose pending consent was already reported ended`                                                                                            |
| retired-by-epoch families reported                           | epoch comparison removed from `endedConsents` | `reports a consent family retired by the epoch advance, or by another writer`                                                                                        |
| unexchanged codes reported                                   | pending half removed                          | `reports a consent whose code was never exchanged, once it expires`                                                                                                  |
| be-01 mint answer names the asked credential                 | comparison weakened                           | `mints a consent credential, reading each modeled refusal and throwing on the rest`                                                                                  |
| `credential_revoked` ends the family                         | mapping removed                               | `reads each modeled delegation refusal and throws on the rest`                                                                                                       |
| family CHECK: credential and organization halves             | each half removed                             | `refuses a family that names a person without its credential`; `refuses a person on an unbound family`                                                               |
| session person equals its family's                           | trigger `WHEN 0`                              | `refuses a session unlike its family's person`; `… acting as its human`                                                                                              |
| family and session person immutable                          | triggers `WHEN 0`                             | `refuses a changed family person`; `refuses a changed session person`                                                                                                |
| report column only on a consent family                       | `CHECK (1)`                                   | `refuses a reported end of a family acting as nobody`                                                                                                                |
| rollback preflight                                           | refusal removed                               | `refuses to roll back while a family names a person`; `… while a consent is pending`                                                                                 |
| rollback purge of reported families                          | family `DELETE` turned into `SELECT 1`        | `refuses to roll back while a family names a person`                                                                                                                 |
| sweep scheduled at startup                                   | schedule call removed                         | `schedules the consent end report and reports its failure`                                                                                                           |
| sweep failure line redacted                                  | redaction built with `[]`                     | same test (`boundary-secret` in the line)                                                                                                                            |

Unverified or skipped:

- No live dev consent (task 3.5): no Google sign-in at the dev consent page, no `claire` claim,
  no revoke on the people page; nothing ran on dev or h2puni.
- Revocation in the boot tests is the slice 2 fixture's `UPDATE … revoked_at` (as the revoke
  route writes it), not the `DELETE /api/organization/machine-credentials/:id` route through a
  browser session; the route's own tests are slice 2's.
- The sweep's one-minute cadence is a `setInterval` in `main.ts`; the tests drive the sweep by
  hand.
- `credential-epoch-cli.ts > refuses without MCP_STORE_PATH or with unknown arguments` failed in
  this worktree because `bun run tools/dev/setup.ts` writes `apps/wbs/mcp-01/.env` with
  `MCP_STORE_PATH`, which Bun loaded into the CLI child; the review follow-up spawns it in a
  scratch `cwd`, and it passes with the file present.

## Gate output

Not run: the h2puni gate is the coordinator's, after review. `bunx openspec validate --all
--json` on this worktree is recorded in the PR.

## Slice 6 record (2026-10-22)

Built on `feat/wbs-machine-credentials-6` from slice 5's head `a0e71ecde`. fe-01 only: no
`libs/**`, be-01 or contract change.

What was built (`apps/wbs/fe-01/src/components/organization/`):

- `organization-role.ts`: `useOrganizationRole` reads `GET /api/organization/active` once per
  page through the runtime scope; `credentialReach` maps the role to `all`, `own` or `none`.
- `machine-credentials-panel.tsx`: the panel (and, with `person`, the people page sub-panel):
  loading, empty with the A7 reach sentence, rows, transport failure with retry, modeled
  refusals, the include-revoked toggle, create dialog, secret shown once (copy, dismiss,
  selectable read-only field), exact-id revoke, rotate on `api_key` only, serialized writes.
- `machine-credential-refusal.ts`: one sentence per modeled refusal of the seven routes.
- `trusted-issuers-section.tsx`: admins only; list, register (audience required, prefilled
  `wbs:org:<organizationId>`), remove with `in_use` and its count.
- `person-credentials.tsx`: `usePeopleCredentials` and `PersonCredentials` for the people
  page; `directory-page.tsx` gains `credentialsOf`, `app-router.tsx` composes both pages,
  `organization-page.tsx` takes `userId` and mounts the panel by role.

Proofs, each fault injected by a script, the named test run alone, then restored (2026-10-22;
all 17 rerun after the A25 merge, each exit 1):

| Guard (file)                                                         | Injected fault                    | Observed failure                                                                  |
| -------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| active organization equals the captured one (`organization-role.ts`) | comparison replaced by `false`    | `gives the page up when the active organization is another one`: text not found   |
| viewer gets no panel (`organization-page.tsx`)                       | panel rendered for `none`         | `renders no credentials panel for a viewer and sends no credentials request`      |
| `name_taken` copy (`machine-credential-refusal.ts`)                  | `not_found` copy                  | `renders name_taken in the dialog`: copy mismatch                                 |
| `in_use` count (`machine-credential-refusal.ts`)                     | count dropped                     | `shows in_use with its count`: copy mismatch                                      |
| refusal clears the key (panel `processRefusal`)                      | clearing removed                  | `discards a created key when the reread is refused`: key input still rendered     |
| a new write clears the key (panel `mutate`)                          | clearing removed                  | `withdraws a shown key as soon as another write starts`: key input still rendered |
| read failure keeps the key (panel `read`)                            | `setSecret(null)` added           | `keeps a created key when the list cannot be reread`: key not found               |
| member offered own agents only (panel `read`)                        | filter on account removed         | `offers a member only their own agents`: three options                            |
| refresh clears the key (panel `refresh`)                             | clearing removed                  | `create shows the key once, then refresh discards it, without browser storage`    |
| write admission (panel `mutate`)                                     | `isPending` check removed         | `serializes forced revoke submissions`: 2 writes, expected 1                      |
| exact-id revoke (panel row)                                          | comparison replaced by `false`    | `requires the exact id before revoking, then rereads`: no alert                   |
| clipboard is optional (panel secret)                                 | guard replaced by `false`         | `says when the clipboard is unavailable`: uncaught error, note not found          |
| `oidc` issuer/subject non-null (panel `required`)                    | placeholder returned              | `an oidc row without its subject reaches the error boundary`: no fault boundary   |
| rotate on `api_key` only (panel row)                                 | source condition removed          | `offers rotate on API keys only`: rotate button on the OIDC row                   |
| create source vocabulary (panel `sourceOf`)                          | unchecked cast                    | `throws loudly on an impossible source selection, draft unchanged`: 0 faults      |
| people page reach (`person-credentials.tsx`)                         | agent kind only, account ignored  | `offers a member no list for another account’s agent`: toggle rendered            |
| people page slot (`directory-page.tsx`)                              | `credentialsOf?.(person)` removed | `draws each person’s machine credentials under their row`: text not found         |

Commands and fresh results, `CLAUDECODE` unset:

| Command                                                                                                                           | Result                                                   |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `bunx vitest run` organization, directory, runtime, `app.test.tsx`, `app-router.test.tsx`, session-features, the four tier suites | 40 files, 575 tests pass                                 |
| `bunx vitest run` the four new or changed organization suites                                                                     | 89 pass: panel 36, trusted issuers 19, people 7, page 27 |
| `bunx vitest run` `test-tiers`, `vitest-budget`, `vitest.view-level`, `node-tier`                                                 | 4 files, 12 tests pass                                   |
| `bunx nx run-many -t typecheck lint -p wbs-fe-01`                                                                                 | exit 0                                                   |
| `bun test` tool-devsync `eslint-boundaries`, `workspace-targets`, `retired-roots`, `toolchain-pins`                               | 78 pass, 0 fail                                          |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                       | exit 0, 39 indexes (store-memory review debt pre-exists) |
| `bunx openspec validate --all --json`                                                                                             | exit 0; 266 items, 266 passed                            |

Eye review: screenshots of the admin empty, populated (1280 and 375 px), create dialog,
secret-shown-once, query failure, member empty and revoke-confirmation states, drawn by
Chromium against `vite` with every `/api` route stubbed; `main` scrolled sideways 0 px in each.
They are not committed.

Not run, by the laptop RAM cap: the full `wbs-fe-01:test` (UTC and Auckland view runs) and
every workspace-wide target; CI runs them. No e2e spec or pixel baseline was added: the
organization e2e spec runs in legacy mode, where the panel is not composed.

Not verified:

- Against a real be-01: every reply here is a stub of the contract shapes.
- Aligned to A25 after merging slice 5's head `11accf7b3`: the register form sends the
  required `audience` (prefilled and hinted as `wbs:org:<organizationId>`), lists `audience`,
  and maps `audience_taken`, `trusted_issuer_limit` and the private-host `invalid_body`; the
  create dialog says a credential's audience narrows the issuer's. Counts above were rerun
  after the merge.

### Slice 6 review fixes (2026-10-22)

Fable review of PR #634: MERGE AFTER FIXES. Fixed on the same branch, base unchanged at
`11accf7b3`:

- S2-1: `refresh` takes `discard` or `keep`. Retry after a failed reread, and a trusted issuer
  change (S3-5), reread with `keep`; Refresh and the revoked toggle still discard the key.
- S2-2: the people page requirement in `specs/machine-credentials/spec.md` now says what is
  built: a toggle, the live count visible once opened, no credentials read before it opens;
  its scenario rereads the list instead of decrementing a count.
- S3-1: `mutate` catches an unexpected throw into the panel fault (Error Boundary).
- S3-2: an impossible source option throws loudly from the `onChange` handler and leaves the
  draft unchanged; it does not reach the Error Boundary (the earlier wording was wrong).
- S3-3: `invalid_body` on an `oidc` create names the name, subject and audience.
- S3-4, S3-6: `MachineCredentialRefusal`, `CredentialOperation`, `idPrefix`, `content`,
  `request`.
- UX: the register form is a framed "Register a trusted issuer" block; "Issued by" shows the
  member's username for an admin (from `GET /api/organization/members`), the account id
  when the viewer is a member or the read fails.

New proofs (injected, named test run alone, restored):

| Guard                                  | Injected fault                 | Observed failure                                                             |
| -------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------- |
| Retry keeps the key (`refresh` `keep`) | clear on `keep` too            | `retry after a failed reread keeps the key`: key not found                   |
| Refresh discards the key               | clearing removed               | `create shows the key once, then refresh discards it`: key input still there |
| `mutate` catch                         | `throw cause` instead          | `a thrown write reaches the error boundary`: no fault boundary               |
| `oidc` `invalid_body` copy             | `create-oidc` falls to API key | `renders invalid_body on an oidc create as name, subject or audience`        |

All 17 earlier proofs reran on the fixed tree and each failed under its fault.

Fresh results: vitest organization, directory, runtime, app, app-router, session-features and
the four tier suites 40 files, 579 pass; the four new or changed organization suites 93 pass
(panel 40, trusted issuers 19, people 7, page 27); `nx run-many -t typecheck lint -p wbs-fe-01
--skip-nx-cache` exit 0. Screenshots 02 (populated) and 05 (secret shown once) retaken.

## Last-use write turn fix (#668, 2026-10-23)

The swarm end-to-end test (PR #666, F3) saw every API-key request wait for be-01's write turn:
`touchLastUsed` took the turn and `BEGIN IMMEDIATE` on every request although its update is
conditional. It now reads `last_used_at` outside the turn and enters it only when the use is
due (absent, or at least a minute old), reading again inside the turn before it updates. The
observable behaviour of task 2.6 (last use coarse to the minute, a failed write a server
error) is unchanged; this restores design A13's intent. The touch answers `'recorded' |
'fresh' | 'absent'`: a credential removed between admission and the touch (A24's person
cascade, a queued `removePerson`) is `'absent'`, and both callers (API key and trusted-issuer
token) answer `401 unknown_identity`, the refusal the next request gets.

| Guard (file)                                          | Injected fault                          | Observed failure                                                                                                                                       |
| ----------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `machine-credential.ts` (store) read-first skip       | early return removed (every use enters) | `answers while another write holds the turn when its last use is fresh`: timed out at 5 s                                                              |
| store due write through the coordinator               | update run through an always-open gate  | `waits for the turn when its last use is due, then records it`: answered within 300 ms                                                                 |
| store `lastUseOf` age                                 | `> at - 60 s` reduced to `> at`         | `records its last use at most once a minute` (20 s use moved it), and the two cases below                                                              |
| store `lastUseOf` boundary                            | `>` widened to `>=`                     | `advances once the minute has passed, by the injected clock`: stayed 5000000                                                                           |
| store `lastUseOf` absent                              | no row answered `'due'`                 | `answers absent for a credential that does not exist` (`machine-credential-touch.db.test.ts`): `'recorded'`                                            |
| `authentication.feature.ts` API-key `'absent'`        | branch never taken (admitted)           | `AuthService with an API key > refuses unknown_identity when its credential is removed before the use is recorded` (`machine-key.test.ts`)             |
| `authentication.feature.ts` trusted-issuer `'absent'` | branch never taken (admitted)           | `AuthService with a trusted-issuer token > refuses unknown_identity when its credential is removed before the use is recorded` (`machine-key.test.ts`) |

No memory twin or conformance suite exists for `MachineCredentials`; `NO_MACHINE_CREDENTIALS`
still rejects every touch.

## Gate of record (h4claw) — 2026-10-22

- `bin/h2puni-gate.sh 688f7836403b49030bb21a279e6ec4b777ec2d3c` on h4claw (`~/gate-688f7836.log`; the plan branch head holding slices 1, 2, 3, 5 and 6 with main 1d143e932 merged): first Nx pass 49 projects + 9 dependents in 47m 11s, twilight pass 2 projects in 50m 26s, `solver-image-smoke` 3m 37s, `GATE_EXIT=0` at 09:38:24 UTC.
- CI on 688f7836403 (PR #625): every check green.
- Reviews: every slice had a Fable review before merging into the plan branch (#628 slice 1 after fixes incl. A23; #631 slice 2 after fixes incl. A24; #633 slice 5 after fixes incl. A25; #634 slice 6 after fixes; #641 slice 3 MERGE with S3 follow-ups landed).
- Not observed live: tasks 3.5 (consent as an agent on dev), 4.x (slice 4, retirement of the operator links, waits for the fleets' self-serve onboarding), 5.4 (a real GitHub Actions token on dev), 6.3 (by-eye acceptance on dev).

## Slice 4 record (2026-10-25): retirement of the operator links, tasks 4.1 and 4.2

Branch `feat/wbs-machine-credentials-retire-links` from main `93b6f3555`. Held from merging
until task 4.3's pre-swap step (every fleet holds its API key): merging deploys to dev, where
the swap refuses every Auth0 machine-to-machine token. 4.3 (operator, Dany) is not done.

Red first: the rewritten `fleet-credential.controller.db.test.ts` against main's code failed
4 of 7 (`admits nothing for a pinned row …`, `admits nothing for an unpinned row …`,
`leaves the owner’s email alone …` each received 200 instead of `401 unknown_identity`;
`removes a person with a pinned row unconfirmed …` received 409 `in_use`).

| Command (worktree, `env -u CLAUDECODE` for `bun test`)                                                                                                                                                                                                                                     | Result                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `bun test` be-01: fleet-credential, claim-identity, machine-credential, machine-credential-admin, directory controller, directory service, person-account-migration, person-account controller, oidc-identity controller, organization-credential-rules, `swarm-rehearsal.boot.db.test.ts` | 270 pass, 0 fail (11 files)                     |
| `bunx nx run-many -t typecheck -p wbs-be-01 wbs-fe-01 wbs-store-sqlite wbs-store-memory wbs-auth wbs-core wbs-conformance wbs-contracts tool-git-hooks`                                                                                                                                    | 12 tasks succeeded                              |
| `CLAUDECODE=0 bunx nx run-many -t test -p wbs-core wbs-store-memory wbs-conformance wbs-contracts wbs-auth tool-git-hooks wbs-store-sqlite --parallel=1`                                                                                                                                   | 7 projects succeeded                            |
| fe-01 `TZ=UTC bunx vitest run src/components/directory/directory-page.test.tsx`                                                                                                                                                                                                            | 51 pass (red first on the renamed confirmation) |
| `bunx openspec validate --all --json`                                                                                                                                                                                                                                                      | 287 items, 0 failed                             |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD`                                                                                                                                                                                                | exit 0                                          |

Lint: `NODE_OPTIONS=--max-old-space-size=8192 bunx nx run-many -t lint` over the same nine
projects: eight passed, `wbs-store-memory` failed on an unused import left in
`directory-fixture.test.ts`; fixed, then `nx run-many -t lint test -p wbs-store-memory`
succeeded.

Not run locally (laptop RAM, another heavy agent): the full be-01 `test:store`/`test:unit` and
fe-01 suites; CI carries them.

### Slice 4 failure proofs

| Guard (file)                                                           | Injected fault                                                           | Observed failure                                                                                                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `authentication.feature.ts` groups-less refusal (4.1)                  | link read restored (`readExistingOidcIdentity`, linked account admitted) | `admits nothing for a pinned row …`, `admits nothing for an unpinned row …`, `leaves the owner’s email alone …` failed (3 of 7)                                      |
| `oidc-identity.ts` `groupsClaimed`                                     | answered `true` always                                                   | 5 of 7 `fleet-credential` cases failed (links admitted, unlinked tokens minted accounts)                                                                             |
| `store-sqlite/directory.ts` delete of a removed person's pinned rows   | delete removed                                                           | `removes a person with a pinned row unconfirmed …` answered 500 (foreign key)                                                                                        |
| `claim-store.ts` `claimIdentityOf` pin                                 | `pinnedPersonOf` answered null                                           | `refuses a pinned credential claiming as another agent` (memory) and `machine-credential.controller.db.test.ts` `claims as its person …`, `delegates under …` failed |
| `user.ts` email kept under a token without one                         | early return removed                                                     | `keeps its groups whether or not its pair is linked …` read `email: null, email_verified: 0`                                                                         |
| grep test: no production reader of `external_identity.person_id` (4.2) | `DirectoryRepository.credentialPinOf` restored                           | `has no production reader …` listed its `.select({ personId: externalIdentity.personId })` beside the allowed delete                                                 |
| `plaintext-secrets.ts` `wbs_mk_` pattern (4.2)                         | pattern made unmatchable (`(?!)`)                                        | `aborts a commit staging a WBS API key, exit 1, …` exited 0; `detects a WBS API key …` scanned null                                                                  |

Each fault was restored from a copy and the file's diff checked before moving on.

### Slice 4 review fixes (Fable on #731 at 2cb8e3674: request changes, fixed)

- **S2-1** `sessionUser` admitted a groups-less token whose pair a retired link maps, so a
  fleet's Auth0 token as the session cookie could start and complete an account link (Fable
  reproduced it). `sessionUser` now answers no session for a token without `wbs_groups`, and
  the refresh path refuses a refreshed token without it before installing it. Red first: both
  new `oidc-identity.controller.db.test.ts` cases failed on 2cb8e3674 (link start 200, refresh
  204).
- **S3-1** `organizationCredentialEvidence` throws for groups-less evidence (unreachable: the
  principal was admitted on the same token), with a unit test.
- **S3-2, S3-6** Runbook swap section: no person deletions during the window, the last-used
  evidence step, the `wbs_groups`-on-refresh evidence step, the rollback caveat for rows that
  person removals deleted, and the post-rollback cleanup of every CLI row (described, backup
  first).
- **S3-3** Task 4.3's pre-swap step now requires a decoded refreshed dev access token showing
  `wbs_groups`, recorded here before the PR merges. Not done: it is Dany's operator step.
- **S3-4** Stale comments fixed (`claim.ts`, `wbs-api.ts`, `work-item-shapes.ts`,
  `refusal.ts`). The open `wbs-permissions` change still plans `scopesOfRoles` changes
  (tasks.md:72; design.md:9, 296, 486, 639); left to its owner, listed in the PR.
- **S3-5** The grep test's JSDoc states what it does not prove.
- **S3-7** The h2puni/h4claw gate was not run by this slice's worker; CI on the PR is the
  check of record until the coordinator runs the gate.

| Guard (file)                                      | Injected fault           | Observed failure                                                                                                           |
| ------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `authentication.feature.ts` `sessionUser` groups  | check removed            | `refuses a link start under a groups-less cookie whose pair is linked`: 1 of 80 failed                                     |
| `auth-oidc-endpoints.ts` refresh groups           | check removed            | `refuses a refreshed access token without groups, leaving the lifecycle alone`: 1 of 80 failed                             |
| `organization-credential.ts` groups-less evidence | throw replaced by `null` | `throws for groups-less upstream evidence behind an admitted principal` (`organization-credential.test.ts`): 1 of 4 failed |

Fresh runs after the fixes (`env -u CLAUDECODE bun test`): fleet-credential,
oidc-identity, organization-credential, machine-credential, organization-credential-rules,
claim-identity, `boot.db.test.ts`, swarm rehearsal: 193 pass, 0 fail. The nine other suites
that call link, `sessionUser` or refresh (boot-browser-session, auth-oidc, pending-membership,
browser-lifecycle mounted process, enterprise-link, organization-audit-completeness,
oidc.integration, auth-oidc-shapes, enterprise-email-trust): 114 pass, 0 fail. `nx run-many -t typecheck lint` over be-01, fe-01, core, contracts and store-sqlite: the
first run failed lint on two `prefer-optional-chain` guards and an `await` in the new unit
test; fixed (guards re-watched after the rewrite), then typecheck and lint of be-01 and core
succeeded, the other three having passed in the first run. `nx test` for core and contracts:
succeeded. `openspec validate --all --json`: 287/287. Burokrat `check-indexes`: exit 0.

## Task 4.3 pre-swap evidence (2026-10-31)

- **Linked fleets on dev: none.** A read-only look at dev on 2026-10-31 found no
  `external_identity` row with a `person_id` (no pinned links), no `@clients` subject (no
  Auth0 machine-to-machine identity) and no fleet API keys. No fleet on dev authenticates
  through an operator link, so the key-issuance and last-use steps are vacuous: merging cuts
  off no fleet. The fleets already call through `/mcp` (`wbs-mcp-agent-surface` 8.1).
- **A refreshed browser token carries `wbs_groups`: ASSUMED, not observed.** Decoding one needs
  the owner's browser session. Basis: the dev tenant's post-login Action sets `wbs_groups` on
  both the ID and the access token (`docs/auth-integration.md`, the Action at about L170–180),
  and Auth0 runs post-login Actions on a refresh-token exchange too (Auth0's documented
  `oauth2-refresh-token` transaction protocol). Owed by Dany after merge: decode a refreshed dev
  access token and confirm `wbs_groups`; if it is missing, sessions end at their first refresh
  (the refresh path refuses it, 401).
- **Not done (owner):** deleting the Auth0 machine-to-machine applications in the dashboard,
  and the post-swap "every fleet writes" record in puni-plan. 4.3 stays unticked for them.
- **Hold lifted:** Dany approved landing #731 on 2026-10-31.

## Slice 4 merge with main (2026-10-31)

Merged `origin/main` 7e0c05d82 into the branch (agent pools #771/#774/#772, MCP machine
credentials, #785 REST off).

- **Conflicts.** `principal.ts`: `CredentialPin` stays an interface without the upstream pair
  (this slice) and gains main's optional `runId` (`wbs-mcp-agent-surface` M15);
  `credentialPinOf` keeps main's run for a machine grant and this slice's null for an upstream
  pair. `claim-store.ts`: main's `pinnedRunOf` kept, reduced to `credential?.runId ?? null`
  now that no pair can reach it; `claimIdentityOf` keeps this slice's directory-free pin.
- **Semantic conflicts.** `swarm-rehearsal.boot.db.test.ts` used its fleets' API keys as
  `/api` Bearers, which #785 refuses: the fleets now buy a machine grant at
  `/internal/mcp/machine-grants` (as mcp-01 does) and call with it; the raw key is asserted
  `machine_bearer_not_accepted`; step 6 checks the revoked credential both under its held
  grant and at a new grant request (`unknown_identity`). Step 4's undo now runs as the claire
  fleet: undo is per acting person on main, and the release is that fleet's entry, not dany's.
- **The groups-less half of M9** landed with this merge (`wbs-mcp-agent-surface` verify.md
  slice 21): 4.1's `unknown_identity` for a groups-less configured-issuer token on `/api` is
  now `machine_bearer_not_accepted`; `sessionUser` and refresh are unchanged.
