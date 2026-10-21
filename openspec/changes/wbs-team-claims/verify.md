## Verification record

Slice 1 (tasks 1.1 to 1.6) implemented 2026-10-19 on `feat/wbs-claim-record`; see below. Drafted 2026-10-19; the design interview with Dany was held the same
day and D1 to D8 reflect it. Three items are marked assumed in design.md.

Measured for the design, read-only on the dev store (`/home/puni1/wbs-dev/data/wbs.db`,
`bun:sqlite` readonly over SSH to h2puni, 2026-10-19): project `PUNI platform plan`
(`558ec5c7-f561-4181-9d9b-055b06bc9796`): 211 work items; assignments 0; team labels 0;
external refs 2; readiness `ready` 6, `draft` 1; hold `blocked` 6; step progress `done` 495,
`in_progress` 42; `project_team_capacity` rows 0; steps `plan`, `impl`, `review`.

Read for D5 to D7 on 2026-10-19: mcp-01 registers public clients dynamically without a
client name, keeps no agent identity, and forwards the human's upstream token to be-01
(`apps/wbs/mcp-01/src/oauth.ts`, `caller-auth.ts`); `external_identity` already maps many
`(issuer, subject)` pairs to one account. OpenClaw subagent session keys read
`agent:<agentId>:subagent:<uuid>` (docs.openclaw.ai/tools/subagents); Claire's engine
requires that shape for `minion_run_id` (`bin/engine-fields.mjs`).

Task 0.2, verified 2026-10-19 on h2puni against the dev tenant with the dev web client's
credentials from `oidc-dev.env` (values never printed): `POST /oauth/token` with
`grant_type=client_credentials` and the WBS API audience answered
`403 unauthorized_client: Grant type 'client_credentials' not allowed for the client`. No
machine-to-machine application exists in the dev tenant. The deployed groups Action
(`docs/auth-integration.md` §post-login) maps `event.authorization.roles` in the post-login
flow, which Auth0 does not run for client-credentials tokens, so an M2M token would carry no
`wbs_groups` even once an M2M application is authorized for the API. Decision owed to Dany
before slice 2.5: either (a) an M2M application per fleet plus a credentials-exchange
(Machine to Machine flow) Action that sets `wbs_groups` from the application's metadata, or
(b) be-01 scopes a request from a linked credential by the linked account's memberships
when the token carries no groups claim, keeping the contract independent of the identity
provider. Recommended: (b), with (a)'s application still needed for the audience.

Task 0.3, read 2026-10-19 in `plan-document-shapes.ts`: plan document v9 (the laptop's main
checkout was stale at v6 when first read; the branch carries 9) carries `people`
with `teamIds`, `teams` with `serviceIds`, and per-item `assignees` keyed by step reference.
A Burokrat branch rule can therefore read a person's teams and a step's assignee from v6
without a new version. Claims are not in v9; showing them in the export needs a v10 field,
which is not in this change (the export SHALL NOT carry account ids either way).

Dev store activation, read 2026-10-20 (read-only): `organization`, `organization_membership`
and `external_identity` hold 0 rows on dev. Organizations are not activated there, so slice
2.4's CLI refuses to link (it refuses before activation, because pre-activation logins never
read `external_identity`) and task 2.5's dev proof is blocked until dev is activated. That is
an operator decision for Dany: activating organizations on dev changes sign-in for every dev
user.

`openspec validate --all --json` on this change: run before each push, result in the PR.

## Slice 2: binding and credentials (tasks 2.1, 2.2, 2.4)

Branch `feat/wbs-person-account`, 2026-10-19. Tasks 2.3 and 2.5 are not in this slice. All
tests ran on the laptop with `env -u CLAUDECODE` (13 repo tests fail only under
`CLAUDECODE=1`).

### What landed

- `20261019130000_add_person_account`: nullable `person.account_id` FK `users.id`, plain
  index (many persons per account). `down.sql` refuses while any person is bound, naming the
  count and the unbind (`patchPerson` with `accountId: null`).
- `20261019130100_add_external_identity_person`: nullable `external_identity.person_id` FK
  `person.id`, index. `down.sql` refuses while any credential is pinned, naming the count and
  `link-credential-cli.ts --unlink`. Both guards use a temp trigger whose `RAISE` message is an
  expression (SQLite 3.53.2 under Bun 1.4.2) so the refusal can carry the count.
- `patchPerson.accountId` (string or null): scoped access only, admin or super-admin
  (`mayBindAccountInOrganization` in `@wbs/domain`); a member gets `forbidden` (403 at the
  command), a viewer the whole-batch 403, legacy access `forbidden`. The store answers
  `unknown_account` (404) for an account that does not exist or is not a member of the
  person's organization. `accountId_must_be_id_or_null` (400) for any other type.
- `PersonWithTeams.accountId` on `GET /api/people` and the `patchPerson` answer; the plan
  export (document version 9, not 6 as the brief said) drops it in `exportedPerson`.
- `DirectoryStore.boundAccountOf(personId)` (throws on an absent person) and
  `credentialPinOf(issuer, subject)` on SQLite and memory, for the claim branch.
- `libs/wbs/adapters/store-sqlite/src/credential-link.ts` and
  `apps/wbs/be-01/src/link-credential-cli.ts` (`--issuer --subject --account [--person]`,
  `--unlink`; `--flag=value` or `--flag value`).

### Commands and results

| Command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Result                                                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `env -u CLAUDECODE bun test apps/wbs/be-01/src/person-account-migration.db.test.ts apps/wbs/be-01/src/controller/person-account.controller.db.test.ts apps/wbs/be-01/src/link-credential-cli.db.test.ts apps/wbs/be-01/src/controller/fleet-credential.controller.db.test.ts libs/wbs/application/core/src/module/directory/directory.resource.test.ts libs/wbs/application/core/src/module/plan-document/plan-document.resource.test.ts apps/wbs/be-01/src/controller/project.controller.test.ts libs/wbs/adapters/store-memory/src/directory-fixture.test.ts libs/wbs/domain/contracts/src/http/directory-shapes.test.ts` | 156 pass, 0 fail                                                                                                                                                        |
| `env -u CLAUDECODE bun test libs/wbs/adapters/store-sqlite/src/testing/source-conformance.db.test.ts libs/wbs/adapters/store-memory/src/testing/source-conformance.test.ts`                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 150 pass, 0 fail                                                                                                                                                        |
| every store-sqlite and be-01 test file naming the new migrations (31 files, migration-list expectations moved by two)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 590 pass, 0 fail                                                                                                                                                        |
| `env -u CLAUDECODE bunx nx run-many -t test:unit --skip-nx-cache`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 21 projects succeeded (a first, cached-less run reported `wbs-store-sqlite:test:unit` failed under parallel load; it passed alone, 47 pass, and the whole rerun passed) |
| `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts` on the four new SQL files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | exit 0                                                                                                                                                                  |
| `bunx tsc --noEmit` for core lib/spec, store-sqlite lib/spec, store-memory spec, contracts lib, conformance spec, be-01 lib/spec/tools, fe-01 app/spec                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | no errors                                                                                                                                                               |

### R5 proofs (each fault injected, the named test watched failing, then restored)

- Person-binding guard: the `INSERT … SELECT count(*)` in `add_person_account/down.sql`
  replaced with `SELECT 0` made `refuses rollback while a person is bound` exit 0 and drop the
  column with both bindings in it.
- Pin guard: the same in `add_external_identity_person/down.sql` made `refuses rollback while a
credential is pinned` exit 0 and drop the column with the pin in it.
- Role: `mayBindAccountInOrganization` answering `role !== 'viewer'`, and separately the
  resource's role check disabled, each made `refuses a member binding a person to an account`
  answer 200 with the binding written.
- Legacy: the legacy `forbidden` removed made `refuses a binding under legacy access` answer ok
  while silently dropping `accountId`.
- Account validity: SQLite `accountMayBind` answering true made the conformance case
  `directory.patchPerson:account-binding` fail on the raw foreign-key error; the memory
  fixture's `accounts.has` check removed made it answer ok instead of `unknown_account`.
- Export: `directory: closure` written whole made `capacity-only team is named …`,
  `v9 zero-fact export retains canonical bytes` and `exports the referenced directory closure …`
  fail with `accountId` in the document.
- CLI pair check: removed, `refuses a second link of the same pair, naming the account` lost
  the account's name to the raw `UNIQUE constraint failed` error. The unique index
  `external_identity_issuer_subject` is what prevents stealing a linked pair, so the brief's
  expected "a second link steals the credential" cannot be observed without also dropping that
  index.
- CLI person check: removed, `refuses pinning to a person bound to another account or to none`
  wrote the pin.
- CLI activation check: removed, `refuses before organization activation …` wrote the row.

### First h2puni gate, and what it caught

`bin/h2puni-gate.sh 634587486dab11e3acf32cfb5521eb04197f505b` printed `h2puni gate: running on
634587486dab11e3acf32cfb5521eb04197f505b` and exited 1. Failed: `wbs-fe-01:test` (111 cases of
`plan-cards.test.tsx` plus `plan-filter`, `plan-estimates`, `plan-keyboard`,
`plan-read-and-write`): fe-01 validates the people read against the same `listPeople` shape,
its fixtures carry no `accountId`, and every refresh was refused `fake_invalid_response`.
The same refusal would hit a new fe-01 answered by the outgoing be-01 mid-swap. `accountId` is
now optional on that wire shape (be-01's own answer is still held to it by
`person-account.controller.db.test.ts`), `PersonView.accountId` is optional, and
`refusing-api.test.ts` round-trips a people fixture with and without the binding through the
client validator. Proof: the field made required again failed that case and
`directory-shapes.test.ts` `reads people from a release that sends no accountId, as mid-swap`.
Also failed: `wbs-store-memory`, `wbs-conformance` and `wbs-store-sqlite:typecheck` (`tsc
--build` over `saved-plan-capture.ts`, a literal `null` where `string | null` was needed; the
per-config `tsc -p` runs above had missed it) and `tool-devsync:test` (the new
`directory-fixture.test.ts` was not in the store-memory module index).

### Review round on 76d1c145 (S1 to S4), 2026-10-20

Merged `origin/plan/wbs-team-claims` first (D6b and the fleet-credentials requirement "A
machine token is scoped by its linked account and never mints an account").

- **S1** A mapped token without an email claim no longer clears its owner's email and
  verification (`resolveMappedIdentity` returns the owner untouched). Test: `leaves the owner's
row byte for byte under a linked machine token` (`fleet-credential.controller.db.test.ts`),
  which now seeds Dany with `email='dany@example.com', email_verified=1` and compares the whole
  `users` table after a groups-bearing and a groups-less machine request. Proof: the guard
  removed, that case failed on `email: null, email_verified: 0`.
- **S2 / D6b** `OidcIdentity.groupsClaimed` says whether the token carried `wbs_groups` at all.
  `AuthService.authenticateOrRefuse` sends a token without it through
  `readExistingOidcIdentity` only (no account minted, nothing written): linked to nothing it is
  refused `401 unknown_identity`; linked, it is scoped by `scopesOfRoles` from the account's
  `organization_membership` roles (viewer read; member read, write; admin and super_admin all
  three), and the per-organization role checks apply as for any session of that account. The
  organization-credential evidence path does the same. Tokens with the claim are unchanged.
  `unknown_identity` is answered in `mount.ts` before the endpoint shape, because no endpoint
  shape declares it: declaring it on all 38 401 shapes made fe-01 fail to compile in 21 files
  (exhaustive refusal switches for a refusal no browser can receive). Tests:
  `refuses an unlinked machine token as unknown_identity, minting no account`,
  `ends at --unlink: unknown_identity, no new account, and the pair links again`,
  `scopes a linked token without groups from its account's membership: a member` (read 200,
  project write 200, organization settings write 403), and
  `tells a token without the groups claim from one with an empty claim`
  (`oidc-identity.test.ts`). Proofs, each watched failing: the groups rule removed (unlinked
  and unlink cases mint and answer 403, member case 403); `scopesOfRoles` answering `[]`
  (member read 403 `insufficient_scope`); the `mount.ts` bypass removed (401 cases answer 500);
  `groupsClaimed` always true (same three cases). The member case now runs a real command
  batch: the suite moved to `OrganizationHarness.openComposedWith`, which task 2.3 gave
  `upstreamCredential` (before that it wrote through `PATCH /api/projects/:id`).
  Pre-activation, a groups-less token resolves only a `users.idp_*` pair, so it is refused
  there too rather than minting (stricter than the spec, which speaks of after activation).
- **S3-1** `link-credential-cli.ts` refuses a pair that is an account's own `users.idp_*`
  sign-in, naming that account (`refuses an account's own unmapped sign-in pair, naming it`).
  Proof: the check removed, the row was written.
- **S3-2** The memory directory keeps `organizationMembers` and binds an owned person only to a
  member of its organization; a new shared conformance case
  `directory.patchPerson:owned-binding` runs on both stores (each source seeds the owned person
  through its own side tables; memory through the new fixture seam `ownPersonInOrganization`).
  Proof: either store's membership read answering true failed that case on that store.
- **S3-3** Before this round, `fleet-credential.controller.db.test.ts` signed its machine
  token with `wbs_groups`, which a real Auth0 machine-to-machine token does not carry (task
  0.2). Its default token now carries none, so the groups-less path is what the suite proves.
- **S4** A patch with `name` and a refused `accountId` leaves the rename unapplied: the batch's
  unit of work rolls it back (`leaves a rename sent beside a refused account unapplied`); no
  reorder was needed. The CLI's unreachable `?? ''` and the adjective-named `required` are
  gone (`requireFlag`).
- Test doubles that spied on `AuthService.authenticate` for the endpoint path now spy on
  `authenticateOrRefuse`, which the identity resolver calls.

### Task 2.3: the claim reads the real binding and pin (2026-10-20)

Merged `origin/plan/wbs-team-claims` at f49bc99ad (slice 1, PR #579) first. The binding
migrations moved to `20261019130000_add_person_account` and
`20261019130100_add_external_identity_person`, because slice 1's `20261019120000_add_claim`
took the same stamp; the 17 migration-list expectations carry all three.

- `ClaimIdentity.pinnedPersonOf` takes the request credential's pair
  (`CredentialPair | null`), not the actor id: `credentialPairOf(authentication)` is the pair of
  an `upstream` authentication (a verified token, or a delegation's carried pair) and null for a
  first-party session, which is unpinned. `runCommandBatch` passes it through `runWithin` /
  `runAfterWithin` into each `CommandContext`, and `claim` / `release` read it. Legacy `run`
  and directory batches pass null (no credential is linked before activation; a directory
  batch claims nothing).
- `UNBOUND_CLAIM_IDENTITY` is gone. `claimIdentityOf(directory)` answers both reads from the
  directory's `boundAccountOf` and `credentialPinOf`; SQLite's `ClaimRepository` and the memory
  claim store both use it, so a claim reads the rows `patchPerson` and `link-credential-cli.ts`
  write.
- `OrganizationHarness.openComposedWith` takes `upstreamCredential`, so a machine token can run
  a real command batch.
- Tests: `apps/wbs/be-01/src/controller/claim-identity.controller.db.test.ts` (composed harness,
  real SQLite, scoped access): a member claims as a person bound to their account (200); a
  member is refused `person_not_bound` for a person bound to another account and for one bound
  to nobody, and on release of another account's claim; an admin claims as both (the bypass);
  a credential linked to `mem` and pinned to `claire` is refused `credential_not_for_person` as
  `codex` (also bound to `mem`) and accepted as `claire`, while `mem`'s own session is unpinned.
  `claim-command.test.ts` (memory) now seeds bindings with `patchPerson` and the pin through the
  fixture seam `pinCredential`, and claims as an organization-owned person once it is bound to a
  member (refused `person_not_bound` before, `unknown_account` for a non-member).
  `claim.db.test.ts` reads both from the repository.
- Proofs, each watched failing then restored: `ClaimRepository.boundAccountOf` answering null
  (member's own claim and the release case answer 403, `claim.db.test.ts` fails); `isClaimAdmin`
  answering false (both admin cases 403); `runCommandBatch` passing a null credential (the
  pinned `codex` claim answers 200); `claimIdentityOf`'s pin read answering null (the memory
  and SQLite pinned cases accept).

### Gate on 8be412a35 and the Dash descriptor flake (2026-10-20)

`bin/h2puni-gate.sh 8be412a35d3bcb6eb33124e42f205e0e80ca2202` printed `h2puni gate: running
on 8be412a35d3bcb6eb33124e42f205e0e80ca2202` (after waiting 8710s for the lock). The 47 WBS
projects passed; the one failure was outside this branch:
`apps/twilight-structure/twilight-dash/cli/src/activation/controller.db.test.ts` "selected
check closes remaining owned descriptors after a leaf descriptor was closed" (expected 23 open
descriptors, received 22). This branch changes nothing under `apps/twilight-structure`. Rerun
on the laptop three times with `env -u CLAUDECODE bun test
apps/twilight-structure/twilight-dash/cli/src/activation/controller.db.test.ts -t "closes
remaining owned descriptors"`: 1 pass 0 fail, 1 pass 0 fail, 1 pass 0 fail. Read as a
host-load flake in a process-wide `/proc/self/fd` count; the merged head after slice 3 is gated
again.

### Assumptions made in this slice (for Dany's review)

- The bound account must be a member of the person's organization (`unknown_account`
  otherwise); an unowned (pre-tenancy) person needs only an existing account.
- Legacy access cannot bind: no organization, so no admin role.
- `link-credential-cli.ts` refuses before organization activation: until then logins resolve
  through `users.idp_*` and never read `external_identity`, so a linked machine pair would mint
  a new account at its first request.
- `--unlink` refuses the account's own `users.idp_*` sign-in pair: `resolveOidcIdentity`
  requires it to stay mapped, and removing it would make every other credential of the account
  throw at login.
- `external_identity.created_by` of a CLI link is the linked account itself: the host operator
  has no WBS account to name.

### Found, not changed

- Fixed in the review round (S2): unlinking used to let the next machine request mint a new
  account; it is now refused `401 unknown_identity` and `users` does not grow.
- Removing a person that a credential is pinned to was a raw foreign-key failure (500) on
  SQLite; modeled in "Slice 2 follow-ups" below.
- Not verified by a build: that `link-credential-cli.ts` ships in the production image. The
  be-01 Dockerfile copies `apps/wbs/be-01` whole (`COPY apps/wbs/be-01 ./apps/wbs/be-01`), as
  for the other `src/*-cli.ts`; no image was built here.

### Slice 2 follow-ups (PR #578 second review, 2026-10-20)

Branch `feat/wbs-claims-followups`, laptop, every test under `env -u CLAUDECODE`. No h2puni
gate was run here (the orchestrator gates the merged plan head).

| Finding                                         | Change                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3-1 groups-less token with an email claim      | Test `leaves the owner's email alone under a groups-less token carrying an email` (`fleet-credential.controller.db.test.ts`). It could not fail at first: the composed harness wired credential evidence only with `sessionBinding` and without the upstream verifier, unlike `boot.ts`. `openComposedWith` now wires it whenever `upstreamCredential` is given.      |
| S3-2 deleting a person with a pinned credential | `DirectoryUsageRows.pinnedCredentials` / `DirectoryUsage.pinnedCredentials` (wire: optional, mid-swap). `removePerson` without cascade is refused `in_use` naming the count; with cascade the pinned `external_identity` rows are **deleted** in the same transaction (see decision below). Both stores; conformance case `directory.removePerson:pinned-credential`. |
| S3-3 runbook home                               | `docs/auth-integration.md` "Fleet credentials"; `docs/runbook-prod-deploy.md` "Fleet credential links" with the `docker exec` line.                                                                                                                                                                                                                                   |
| S4 `unknown_identity` headers                   | `mount.ts` answers it with `responseHeaders(matched.endpoint.shape)`; the unlinked-token test asserts `cache-control: no-store` and `Vary` on `/api/organization/active`.                                                                                                                                                                                             |
| S4 test name, Proof placement, verify and tasks | The add_claim rollback test is named for what it proves; the `scopesOfRoles` and `groupsClaimed` proofs sit beside the symbols; "Interim identity reads" marked superseded by 2.3; 2.5 listed before 2.6.                                                                                                                                                             |

**Cascade decision for a pinned person (assumed, for Dany's review).** A confirmed removal
revokes the credentials pinned to the person (deletes their `external_identity` rows, as
`--unlink` does) rather than setting `person_id` null. Unpinning would widen the credential: an
unpinned credential may claim as any person bound to its account, so deleting an agent person
would silently promote its fleet. Revoking narrows instead; the operator relinks with
`link-credential-cli.ts`. The fe-01 confirmation names the count ("N fleet credentials pinned to
X are revoked."); it was checked by a component test, not reviewed by eye in a browser.

R5 proofs (fault injected, test observed, restored):

| Check                                                            | Injected fault                                   | Observed                                                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| evidence path reads the link only (`organization-credential.ts`) | groups-less branch through `resolveOidcIdentity` | the email case failed: Dany's row took `fleet@elsewhere.example`                                  |
| bearer path reads the link only (`authenticateOrRefuse`)         | linked read through `resolveOidcIdentity`        | the email case, the unlinked case and the unlink case failed                                      |
| `scopesOfRoles` (re-watched)                                     | answers `[]`                                     | the member case failed (read 403)                                                                 |
| `groupsClaimed` (re-watched)                                     | always `true`                                    | four fleet cases and `tells a token without the groups claim from one with an empty claim` failed |
| SQLite pin usage                                                 | `pinned` left out of the refusal                 | SQLite certification failed `directory.removePerson:pinned-credential` (removed unconfirmed)      |
| SQLite revocation                                                | the `external_identity` delete removed           | the same case failed on the `person` delete (foreign key)                                         |
| memory pin usage                                                 | refusal disabled                                 | memory certification failed the same case                                                         |
| memory revocation                                                | the pin loop removed                             | the same case failed: `credentialPinOf` still named the removed person                            |
| HTTP removal of a pinned person                                  | `directory.ts` as before this change             | `refuses removing a pinned person in_use, then revokes the credential with it` answered 500       |
| `unknown_identity` headers (`mount.ts`)                          | before the fix                                   | the unlinked case read `cache-control` null                                                       |
| fe-01 confirmation line                                          | the block disabled                               | `names the fleet credentials a pinned person's removal revokes` failed                            |

Commands:

| Command (cwd repo root unless named)                                                                                                                                                                                                 | Result           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| `bun test` be-01: directory controller, fleet-credential, migration-cli, directory service, claim-identity, organization-credential-rules, organization-selection, directory-command-organization, every `src/http/elysia/*.test.ts` | 325 pass, 0 fail |
| `bun test` memory and SQLite source conformance, SQLite `directory.db.test.ts`, core `directory-usage.test.ts`, auth `oidc-identity.test.ts`                                                                                         | 172 pass, 0 fail |
| `bun test` (conformance)                                                                                                                                                                                                             | 35 pass, 0 fail  |
| `bun test` (store-memory)                                                                                                                                                                                                            | 190 pass, 0 fail |
| `bun test` core `src/module/directory`, `src/module/authentication`, `directory-usage.test.ts`, `claim-command.test.ts`                                                                                                              | 41 pass, 0 fail  |
| `bunx vitest run` fe-01 `directory-page`, `wbs-api`, `refusing-api`, `directory.resource` tests                                                                                                                                      | 160 pass, 0 fail |
| `bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                                                                                                                                                                   | 15 pass, 0 fail  |
| `bunx tsc --build --force` in be-01, store-sqlite, store-memory, conformance, core, contracts, fe-01, mcp-01                                                                                                                         | no diagnostics   |
| `bunx @fission-ai/openspec@1.12.0 validate wbs-team-claims`                                                                                                                                                                          | valid            |

Not run: the h2puni gate, the whole be-01 and store-sqlite suites, and a browser review of the
fe-01 confirmation.

## Slice 1: the claim record and its decision (tasks 1.1 to 1.6)

Run on the laptop 2026-10-19, every test under `env -u CLAUDECODE` (13 repo tests fail only
under `CLAUDECODE=1`). Heavy suites were run per project, not the full gate. The h2puni gate
on `f4bdfee82` was queued behind the host lock and cancelled before it ran when the review
below arrived; the gate on the review fixes is recorded under "Review fixes".

### Commands and results

| Command (cwd)                                                                                             | Result                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun test src/claim.test.ts` (libs/wbs/domain/domain)                                                     | 49 pass, 0 fail                                                                                                                                                                   |
| `bun test --timeout=10000` (libs/wbs/domain/domain)                                                       | 1137 pass, 1 fail: `domain-ring-boundary.test.ts` fails identically with this branch stashed ("No cached ProjectGraph", pre-existing, environmental)                              |
| `bun test src --timeout=10000` (libs/wbs/application/core)                                                | 1070 pass, 0 fail                                                                                                                                                                 |
| `bun test` (libs/wbs/application/conformance)                                                             | 35 pass, 0 fail                                                                                                                                                                   |
| `bun test` (libs/wbs/adapters/store-memory)                                                               | 188 pass, 0 fail                                                                                                                                                                  |
| `bun test src/claim.db.test.ts src/claim-race.db.test.ts` (libs/wbs/adapters/store-sqlite)                | 10 + 6 pass, 0 fail                                                                                                                                                               |
| `bun test src/testing/source-conformance.db.test.ts` (store-sqlite)                                       | 75 pass, 0 fail                                                                                                                                                                   |
| `bun test --timeout=30000` (store-sqlite, whole suite)                                                    | 1658 pass, 1 fail: `working-plan-performance.test.ts` › `keeps cached medians within ten percent…` (timing, run while be-01 tests loaded the laptop); rerun alone: 8 pass, 0 fail |
| `bun test` (libs/wbs/domain/contracts)                                                                    | 475 pass, 0 fail                                                                                                                                                                  |
| `bun test` (apps/wbs/mcp-01)                                                                              | 423 pass, 0 fail                                                                                                                                                                  |
| `bun test src/openapi/` (apps/wbs/be-01)                                                                  | 6 pass, 0 fail                                                                                                                                                                    |
| `bun test` undo, command-organization, work-item controller, elysia work-item, migration-cli (be-01)      | 312 pass, 0 fail                                                                                                                                                                  |
| `bunx tsc --build` core, domain, contracts, store-sqlite, store-memory, conformance, be-01, mcp-01, fe-01 | no diagnostics                                                                                                                                                                    |
| `bunx eslint` on every changed TypeScript file                                                            | no errors                                                                                                                                                                         |
| `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts` on both SQL files                              | exit 0                                                                                                                                                                            |
| `bunx @fission-ai/openspec@1.12.0 validate wbs-team-claims --json`                                        | 1 passed, 0 failed                                                                                                                                                                |

OpenAPI emit diff: `bun apps/wbs/be-01/src/openapi/emit-openapi-cli.ts` on the base and on this
branch. No path added or removed. Per operation, only additions: both command routes gain the
`claimWorkItem` and `releaseWorkItem` body arms; 400 gains `runId_must_be_1_to_256_characters`,
`parentClaim_must_be_an_id`, `steps_must_be_a_list_of_ids`, `steps_must_be_at_most_50`; 403
gains `person_not_bound`, `credential_not_for_person`, `parent_claim_foreign`; 404 gains
`parent_claim_unknown`; 409 gains `parent_claim_not_ancestor`, `item_done`, `not_claimed_by`,
`not_startable`, `step_done`, `already_claimed`, `inside_subtree_claim`,
`overlaps_subtree_claim`. The domain-challenge 409 was split into two arms (same codes) because
`already_claimed` now also carries command detail. MCP: the tool list does not move (the
generated-document tool count test passes unchanged); `openapi-tools.test.ts` pins the two new
kinds inside the batch tool.

### R5 proofs (fault injected, test observed, all restored and re-run green)

| Check                                   | Injected fault                                                           | Observed                                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `claim_step` unique index               | index statement replaced by `SELECT 1`                                   | `holds one claim per step of a work item` failed                                                                                       |
| `claim_subtree` partial index           | removed                                                                  | `holds one subtree claim per work item…` failed                                                                                        |
| run length CHECK                        | removed                                                                  | `bounds the run to 1 to 256 characters` failed                                                                                         |
| own-parent CHECK                        | removed                                                                  | `refuses a claim that is its own parent` failed                                                                                        |
| insert / update project triggers        | condition replaced by `0` / trigger moved off `claim`                    | `refuses a step of another project…` failed                                                                                            |
| parent and work-item cascades           | `ON DELETE CASCADE` removed, each                                        | the cascade case failed (and the repository remove case for the parent)                                                                |
| `down.sql` guard                        | guard statements removed                                                 | `refuses to reverse add_claim while one claim exists…` (migration-cli.db.test.ts) exited 0, table and row gone                         |
| domain: admin bypass                    | `&& !caller.isAdmin` removed                                             | `lets an admin claim for an unbound person` failed                                                                                     |
| domain: bound account                   | check replaced by `false`                                                | the three `person_not_bound` cases failed; via the command path `refuses a person nobody bound…` failed                                |
| domain: pin                             | check replaced by `false`                                                | `credential_not_for_person…` and the release case failed; via the command path `refuses a pinned credential…` failed                   |
| domain: parent account                  | check removed                                                            | `parent_claim_foreign…` failed (the foreign delegated claim passed)                                                                    |
| domain: order                           | `already_claimed` skipped when an ancestor holds a foreign subtree claim | `orders already_claimed before inside_subtree_claim` failed                                                                            |
| domain: inside check                    | removed                                                                  | both `inside_subtree_claim` cases failed                                                                                               |
| domain: release cascade                 | loop disabled                                                            | `cascades a subtree release…` failed                                                                                                   |
| SQLite store `taken` check              | disabled                                                                 | SQLite certification failed on `claims.add:taken-stated-remove`                                                                        |
| SQLite null writing account             | check removed                                                            | `refuses a stored claim with no writing account` failed                                                                                |
| SQLite `createdBy` from the claim       | override removed                                                         | `writes the claim as its claimant’s account…` failed                                                                                   |
| memory store `taken` check              | disabled                                                                 | memory certification failed                                                                                                            |
| memory `MemoryState` claim copy         | removed                                                                  | 8 of claim-command.test.ts lost their committed claims                                                                                 |
| journal decoder `readClaimReplay`       | call removed                                                             | `refuses a malformed claim replay` failed                                                                                              |
| `touchedBy` for claims                  | returned `[]`                                                            | `refuses a redo of a claim after the leaf moved on` applied the redo                                                                   |
| replay of `add_claims` refusing `taken` | answered ok                                                              | `refuses a redo of a claim once another holder took the step` failed                                                                   |
| working-plan refresh after a claim      | refresh removed                                                          | `shows the batch the progress its claim stated` let `setStatus ready` through                                                          |
| run length normalizer                   | upper bound removed                                                      | the 257-character run normalized                                                                                                       |
| refusal holders                         | replaced by `[]`                                                         | both orders of the race case failed                                                                                                    |
| write coordinator                       | `source.uow` replaced by a unit of work over the open gate               | the queued batch failed `BEGIN IMMEDIATE`: "cannot start a transaction within a transaction" instead of `already_claimed`, both orders |

On the race negative: the brief expected "bypass the coordinator and both win". Both cannot
win here: one connection refuses a nested `BEGIN IMMEDIATE`, and the `claim_step` unique index
and the store's held check stand behind the coordinator. What was observed is recorded above.

### Interim identity reads (slice 2 owes the real ones)

**Superseded by task 2.3** (slice 2, "Task 2.3: the claim reads the real binding and pin"):
`UNBOUND_CLAIM_IDENTITY` is gone and the pin is read per credential. Kept as the record of
slice 1.

`ClaimStore.boundAccountOf(personId)` and `pinnedPersonOf(actorId)` answer `null` in the SQLite
and memory adapters (`UNBOUND_CLAIM_IDENTITY`) until `person.account_id` and
`external_identity.person_id` land on `feat/wbs-person-account` (task 2.1). Until then only an
organization `admin` or `super_admin` (scoped access) can claim: everyone else is refused
`person_not_bound`. Legacy access has no role and never bypasses. The command tests inject an
identity that binds persons and pins a credential, and prove `credential_not_for_person` fires
when the pin answers another person. The pin is read per account here; slice 2 must read it per
credential.

### Known gaps, not addressed in this slice

- Undo of a work-item deletion does not restore claims on it: the claim rows cascade with the
  work item, and the deletion snapshot does not carry them.
- Deleting a person cascades their claims (blue/green safety, like `assignment`), silently;
  directory usage does not count claims yet.
- Step deletion is restrictive on `claim.step_id` (like `step_blockage`); step usage does not
  count claims, so removing a claimed step fails on the foreign key.
- Memory source: `removePerson` does not cascade claims.
- A leaf whose only worked step is done reads `done` by the table's fold, so a claim on it is
  refused `item_done` even when other steps have no statement; the spec's default-claim
  scenario holds once the remaining steps carry work (an estimate). Tested both ways.

## Review fixes (PR #579 review, 2026-10-19)

| Finding                                                               | Fix                                                                                                                                                                                                                                                                                                                               | Test (fault injected → observed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S2-1 undo of a subtree claim cascaded delegated claims it never wrote | the `remove_claims` replay refuses when a stored claim not in the entry names a listed claim as parent ("a claim has been delegated under it since.")                                                                                                                                                                             | `refuses an undo of a subtree claim that would take a delegated claim it never wrote` in store-sqlite `claim-race.db.test.ts`, the exact sequence: F subtree-claims root, F claims the child under it, G renames the child, undo (stale), undo again → refused `stale_undo`, both claims kept. Refusal removed → the second undo answered ok and the cascade took the delegated claim. It lives in the SQLite harness rather than core's `claim-command.test.ts` because core does not depend on `@wbs/store-sqlite`, and the memory source keeps no revisions so the first undo is never stale there |
| S2-2 `steps: []` answered alreadyHeld                                 | normalizer refuses `steps_must_name_a_step` (new parser code); `decideClaim` throws on an empty list                                                                                                                                                                                                                              | `refuses an empty step list on a claim and a release` (command-normalizers.test.ts): refusal removed → normalized. Property widened to `minLength: 0`; an empty list must throw, never answer alreadyHeld: throw removed → the property and `throws on an empty step list…` failed                                                                                                                                                                                                                                                                                                                    |
| S3-1 steps named on a non-leaf ignored                                | `steps_on_subtree` (409) in `decideClaim` and `decideRelease`                                                                                                                                                                                                                                                                     | `refuses steps named on a non-leaf` / `…non-leaf release`: each check removed → its case failed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| S3-2 a different `parentClaim` read as alreadyHeld                    | same holder now also means same parent; otherwise `already_claimed` naming itself                                                                                                                                                                                                                                                 | `refuses the holder repeating its claim under another parent, naming itself`: parent left out → alreadyHeld                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| S3-4 docs                                                             | gate state stated above; tasks.md 1.5 matches the observed negative                                                                                                                                                                                                                                                               | —                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| S3-5 person delete with claims                                        | `DirectoryUsageRows.claims`; SQLite `removePerson` refuses `in_use` without `cascade` and deletes the claims with it; the memory source does the same through its own claim table (before, memory dropped the person and kept stale claims); usage effect `claim_released` (step or subtree), on the wire and in fe-01's sentence | conformance `directory.removePerson:claims-in-use` on both sources: SQLite check removed → SQLite certification failed; memory refusal removed → memory certification failed. `names each claim the removal releases…` (directory-usage.test.ts): filter emptied → failed                                                                                                                                                                                                                                                                                                                             |
| S3-5 step delete with a claim                                         | step usage counts `claims` (`stepIsInUse`, `StepInUse.claims?` on the wire, optional for an older be-01); a confirmed cascade deletes them                                                                                                                                                                                        | `counts the claims, refusing an unconfirmed removal of a claimed step…` (step.db.test.ts): claims term removed → the step and its claim were deleted unconfirmed                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| S4                                                                    | `claiming()` returns `identity: ClaimIdentity`; a leaf in a project with no steps answers `no_steps`                                                                                                                                                                                                                              | `answers no_steps on a leaf of a project with no steps`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |

Still a known gap: deleting a work item and undoing the delete does not restore its claims
(they cascade with the row and the deletion snapshot does not carry them). The S2-1 fix does
not cover it: it guards a claim's own undo, not a structural delete's. The memory step fixture
does not model step usage at all, so it does not count claims either.

Commands after the fixes, laptop, `env -u CLAUDECODE`:

| Command (cwd)                                                                                        | Result                                                    |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `bun test src/claim.test.ts` (domain)                                                                | 54 pass, 0 fail                                           |
| `bun test src --timeout=10000` (core)                                                                | 1072 pass, 0 fail                                         |
| `bun test` (conformance)                                                                             | 35 pass, 0 fail                                           |
| `bun test` (store-memory)                                                                            | 188 pass, 0 fail                                          |
| `bun test` (contracts)                                                                               | 475 pass, 0 fail                                          |
| `bun test` (mcp-01)                                                                                  | 423 pass, 0 fail                                          |
| `bun test` claim, claim-race, step, directory, source-conformance (store-sqlite)                     | 144 pass, 0 fail                                          |
| `bun test --timeout=30000` (store-sqlite, whole suite)                                               | 1661 pass, 0 fail                                         |
| `bun test` step service/controller, typed-dependency ×3, directory controllers (be-01)               | 192 pass, 0 fail after one expectation gained `claims: 0` |
| `bunx vitest run` wbs-api and directory tests (fe-01, `TZ=UTC`)                                      | 113 pass, 0 fail                                          |
| `bunx tsc --build --force` domain, contracts, core, conformance, both adapters, be-01, mcp-01, fe-01 | no diagnostics                                            |

Index fix after review: the gate on `4bad2c3ac` would fail R1's module index check
(`tools/tool-devsync/src/repo-namespacing-handoff.test.ts`: "unindexed candidate path …
claim-fixture.ts"); it was cancelled. `claim-fixture.ts`, `claims.ts` and
`claim-command.test.ts` were added to their folders' `module-index` memberships; the other new
files sit in folders with no module index. `bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts`:
15 pass, 0 fail; the whole tool-devsync suite: 859 pass, 0 fail (one earlier run showed ten
eslint-boundary failures that did not repeat, the "No cached ProjectGraph" condition).

### Gate for slice 1

`bin/h2puni-gate.sh cc968e684c2f371a2306c115f1d2fb02fdffaf2b` on h2puni (tree
`/home/puni1/puni-00-gate-tbf`, log `~/gate-claim-record-cc968e68-r2.log`): printed
`h2puni gate: running on cc968e684c2f371a2306c115f1d2fb02fdffaf2b`, 47 projects passed, Burokrat
and Dash suites passed, `exit=0` (2026-10-20). The earlier run on the same SHA was refused with
exit 75 after its 30-minute queue budget behind another gate; the rerun used
`HEAVY_LOCK_WAIT_SECONDS=10800`.

## Slice 3: the startable read (tasks 3.1 and 3.2)

Run on the laptop 2026-10-19/20 on `feat/wbs-startable-read` (branched from
`feat/wbs-claim-record`), every test under `env -u CLAUDECODE`, targeted suites only.

What was built: `findStartableWork` (`libs/wbs/application/core/src/module/work-item/startable.ts`),
`WorkItemService.startableWithin`, the descriptor `readStartableWork`
(`GET /api/projects/:id/startable?team=`, `getApiProjectsByIdStartable`), and its route. It
reuses `isStartableStatus` (now exported from `claim.ts` and used by `decideClaim`), the
`statusesOf` fold the claim command uses, and a new `predecessorLeavesOf` beside
`blockedByProxyOf`. The claim write instant comes from a new port read
`ClaimStore.listStampedByProject` (SQLite `created_at`; the memory source stores the write's
stamp), certified by the new case `claims.listStampedByProject:write-instant`.

Choices the spec left open, recorded here:

- `team` is a team id. A team the caller's directory does not hold (under scoped access, one the
  organization does not own) answers 404 `unknown_team`; `unknown_team` became a shared refusal
  code (bare here, with command context in a batch).
- `number` is the frozen number when one is frozen, else the derived one; `numberIsFrozen` says
  which.
- `claimed` lists every claimed step of every leaf the team filter keeps, whatever the leaf's
  status, so a claim on work that has since stopped still shows. `leaves` holds only leaves with
  at least one startable step.
- The subtree claim named is the nearest one above the leaf; with nested delegated subtree claims,
  `parentClaimId` leads up the chain.
- Unfinished predecessors are predecessor leaves (legacy and typed dependencies taken down to
  leaves, as `blockedByProxyOf` reads them) whose derived status is not `done`.
- Names are the organization's own under scoped access, as the tree read names assignees.
- The organization harness's `WorkItemService` now carries a claim store; production already
  did through `servicesOver`.

### Commands and results

| Command (cwd)                                                                                                                                               | Result                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `bun test src/module/work-item/startable.test.ts` (libs/wbs/application/core)                                                                               | 9 pass, 0 fail                                          |
| `bun test src --timeout=10000` (libs/wbs/application/core)                                                                                                  | 1081 pass, 0 fail                                       |
| `bun test src/blocked-by-proxy.test.ts src/blocked-by-proxy.property.test.ts src/claim.test.ts` (libs/wbs/domain/domain)                                    | 66 pass, 0 fail                                         |
| `bun test` (libs/wbs/application/conformance)                                                                                                               | 35 pass, 0 fail                                         |
| `bun test` (libs/wbs/adapters/store-memory)                                                                                                                 | 188 pass, 0 fail                                        |
| `bun test src/claim.db.test.ts src/claim-race.db.test.ts src/testing/source-conformance.db.test.ts` (libs/wbs/adapters/store-sqlite)                        | 94 pass, 0 fail                                         |
| `bun test` (libs/wbs/domain/contracts)                                                                                                                      | 475 pass, 0 fail                                        |
| `bun test` (apps/wbs/mcp-01)                                                                                                                                | 423 pass, 0 fail                                        |
| `bun test src/app.routes.test.ts src/openapi/ organization-context, startable-organization, schedule-organization, work-item-rows controller tests` (be-01) | 106 pass, 0 fail                                        |
| `bun test` command-organization, membership-organization, directory-command-organization controller tests (be-01)                                           | 74 pass, 0 fail                                         |
| `bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts` (root)                                                                                   | 15 pass, 0 fail (with the new files staged and indexed) |
| `bunx tsc --build --force` domain, contracts, core, conformance, store-sqlite, store-memory, be-01, mcp-01, fe-01                                           | no diagnostics                                          |
| `bunx eslint` on every changed TypeScript file                                                                                                              | no errors                                               |
| `bunx @fission-ai/openspec@1.12.0 validate wbs-team-claims --json`                                                                                          | 1 passed, 0 failed                                      |

MCP: the generated tool list moves by exactly one, 81 to 82 (`getApiProjectsByIdStartable`);
the pinned list in `apps/wbs/mcp-01/src/generated-document.test.ts` and the README count were
updated.

OpenAPI emit diff (`bun apps/wbs/be-01/src/openapi/emit-openapi-cli.ts` on
`origin/feat/wbs-claim-record` and on this branch): one path added,
`/api/projects/{id}/startable` (GET, responses 200, 400, 401, 403, 404, 409); no path removed or
changed; every non-path key (components included) identical.

### R5 proofs (fault injected, test observed, all restored and re-run green)

| Check                                            | Injected fault                                               | Observed                                                                                                                                     |
| ------------------------------------------------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| startable status (the brief's negative)          | `statusFor(leafId)` replaced by `row.readiness ?? 'unknown'` | `leaves a ready leaf behind an unfinished held predecessor out` failed (the blocked-by-proxy leaf was listed)                                |
| team filter                                      | condition replaced by `false`                                | the allotment, no-team and subtree cases failed                                                                                              |
| claimed step not startable                       | a held step also counted free                                | the same three cases failed                                                                                                                  |
| scoped names and teams                           | root catalogs read under scoped access                       | `answers a member and a viewer alike, with the organization's own names` and `refuses a team the caller's organization does not hold` failed |
| repeated query key                               | `hasRepeatedKey` check removed                               | `refuses a repeated team and an undeclared key` failed                                                                                       |
| SQLite stamped read                              | null-instant check made unreachable                          | `refuses a stamped read of a claim with no write instant` failed                                                                             |
| memory write instant                             | stored `claimedAt: 0`                                        | memory certification failed on `claims.listStampedByProject:write-instant`                                                                   |
| `unknown_team` as a bare refusal (type boundary) | registry change reverted                                     | `readStartableWork` failed TS2345 (`not assignable to parameter of type 'never'`)                                                            |

### Not run, and known gaps

- The be-01 and store-sqlite suites were run per affected file, not whole; the h2puni gate
  carries them (below).
- The read does not go through the shared live-plan capture the tree read uses when shared
  people mode is on; it reads the stores through `admits`, as `updateInstantsWithin` does beside
  the tree. A stranger is refused alike (404, and 403 before any lookup for an unbound session),
  but a live-plan `access_refused` the tree read can answer is not reproduced here.
- No pagination: the read answers the whole project. The dev store's 211 work items make that
  small; a large project would want a page.

### Review fixes (PR #581 review, 2026-10-20)

| Finding                                       | Fix                                                                                                                                                                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3-1 a claimed step lacked its assignee (D1)  | `ClaimedStep.assignee: NamedPerson \| null` (and on the wire); test `shows a claimed step beside its assignee`                                                                                                                                                      |
| S3-2 silent subtree claims were invisible     | `subtreeClaims`: every subtree claim of the project, team filter or not, with address, holder, run, parent and write instant; test `lists a silent subtree claim whose every leaf has stopped`                                                                      |
| S3-3 directory-wide scans under legacy access | new `DirectoryStore.namesOf(catalog, ids)` (one primary-key read per id; SQLite, memory, the batch wrapper); assignee names come with `assignmentsInProject`, holders and teams through `namesOf`; test `startable-scope.db.test.ts` (40 unrelated assigned people) |
| S3-4 two reddening checks without `Proof:`    | both watched and commented (rows below)                                                                                                                                                                                                                             |
| S4 orphaned `ClaimWriteOutcome` JSDoc         | moved back beside its type                                                                                                                                                                                                                                          |
| S4 claim person outside the organization      | `claim_person` arm in `findCrossReferences` (and in `PROJECT_CROSS_REFERENCE_KINDS`, mapped to `unknown_person` in command references); crossing case added to `schedule-organization.controller.db.test.ts`                                                        |
| S4 duplicated progress and dependency reads   | `statusReadsOf` returns the statuses with the progress statements and edges it read; `statusesOf` and `startableWithin` share it                                                                                                                                    |
| S4 unreachable cycle guard                    | dropped: `deriveNumbers` has already thrown for a cycle or an orphan; the walk now throws on a parent that is not a row                                                                                                                                             |

`organization-ownership.ts` (activation reconciliation) has no `claim` arm; activation of an
organization over claims whose person it does not own is not covered by this fix.

R5 proofs added (fault injected, test observed, restored):

| Check                                   | Injected fault                                       | Observed                                                                                                   |
| --------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| done step left out (`startable.ts`)     | `!done.has(key)` replaced by `true`                  | `leaves a done step out and keeps the other` failed                                                        |
| finished predecessors dropped           | `!== 'done'` filter made always true                 | `names the unfinished predecessors of a startable leaf, and drops finished ones` failed                    |
| claimed step's assignee                 | `assignee: null`                                     | `shows a claimed step beside its assignee` failed                                                          |
| subtree claims listed                   | `subtreeClaims: []`                                  | `lists a silent subtree claim whose every leaf has stopped` and the subtree-holder case failed             |
| legacy names bounded (service)          | `directory.listPeople()` in place of `namesOf`       | `materializes only the assignee and the claim holder during a tiny startable read` failed on `SCAN person` |
| legacy names bounded (SQLite `namesOf`) | `listPeople()` filtered in place of the per-id reads | the same case failed on `SCAN person`                                                                      |
| `claim_person` cross reference          | arm removed                                          | `fails the schedule read closed over a crossing claim_person` answered 200, 500 owed                       |

Commands after the fixes, laptop, `env -u CLAUDECODE`:

| Command (cwd)                                                                                                                                       | Result            |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `bun test src --timeout=10000` (core; `startable.test.ts` alone: 11 pass)                                                                           | 1083 pass, 0 fail |
| `bun test` blocked-by-proxy, its property test, claim (domain)                                                                                      | 66 pass, 0 fail   |
| `bun test` (conformance)                                                                                                                            | 35 pass, 0 fail   |
| `bun test` (store-memory)                                                                                                                           | 188 pass, 0 fail  |
| `bun test` (contracts)                                                                                                                              | 475 pass, 0 fail  |
| `bun test` claim, claim-race, source-conformance, startable-scope, assignment-scope, project, organization-reconciliation, directory (store-sqlite) | 168 pass, 0 fail  |
| `bun test` (mcp-01)                                                                                                                                 | 423 pass, 0 fail  |
| `bun test` app.routes, openapi, organization-context, startable-organization, schedule-organization, work-item-rows, command-organization (be-01)   | 136 pass, 0 fail  |
| `bun test tools/tool-devsync/src/repo-namespacing-handoff.test.ts`                                                                                  | 15 pass, 0 fail   |
| `bunx tsc --build --force` domain, contracts, core, conformance, both adapters, be-01, mcp-01, fe-01                                                | no diagnostics    |

OpenAPI emit diff against `origin/feat/wbs-claim-record` re-run: still one path added, nothing
else changed. MCP tool count unchanged by the fixes (82).

### Gate for slice 3

`bin/h2puni-gate.sh 49f4bc4ff7c942824112ddb6f48f837498b14765` on h2puni (tree
`/home/puni1/puni-00-gate-tbf`, `HEAVY_LOCK_WAIT_SECONDS=10800`, log
`~/gate-startable-49f4bc4f.log`): printed `h2puni gate: running on
49f4bc4ff7c942824112ddb6f48f837498b14765`, `exit=0` (2026-10-20). That SHA is the review fixes
rebased onto `plan/wbs-team-claims`; the commit recording this paragraph changes this file only.
Earlier queued runs on `e767ac91d` and `d77c5336f` were cancelled before they started (exit 143).

## Whole-change review (2026-10-20, orchestrator)

Adversarial read-only review of the merged plan head 262ddf52d against `origin/main`: no S1.
S2-1: a leaf that gains its first child strands its step claims (not handed down with the
other step facts); fixed in the follow-up branch `feat/wbs-claims-handdown` with the spec
scenario "A claimed leaf is split". S3-1 (refusal holder names from the root directory, not
the organization's names, and a full `listPeople` scan), S3-3 (delegated claims under a
pinned credential proven only in the domain), S3-4 (`deletePerson --cascade` of a superagent
takes workers' delegated claims without naming them or moving their items' revisions), S3-5
(mid-swap FK refusals not in the blue/green notes) and the S4s are carried in the same
follow-up branch; S3-2 (refusal codes the deltas did not state) fixed in the specs. Not yet
verified: the pre-activation `401 unknown_identity` clause (every fleet-credential test runs
after activation); a test is owed by the follow-up branch.

### Whole-change follow-ups (branch `feat/wbs-claims-handdown`, 2026-10-20)

Each negative: fault injected, the named test watched failing, fault restored.

- **S2 claims stranded on a split leaf.** `ClaimStore.moveAll(from, to)` on SQLite (one `UPDATE`, ids, account and `created_at` kept, both revisions bumped) and memory; `createWorkItem` moves a gaining leaf's claims to its first child beside the other step facts; the journal carries a new `move_claims` command (forward after `restore_subtree`, inverse before the child's `delete_subtree`), whose replay refuses when the claims on its source changed. Negative: hand-down skipped: `releases the handed-down claim on the child` (`claim-command.test.ts`) answered `not_claimed_by`, and the SQLite case in `claim-race.db.test.ts` read the claim still on the leaf; inverse omitted: undo read no claim on the parent (memory) and the child's delete cascaded it away (SQLite); forward omitted: redo left it on the parent; replay refusal removed: `refuses an undo of a split once the child's claims changed` answered ok; `readClaimMove` removed: `refuses a malformed claim move`; `moveAll` aimed at no row (SQLite) or its clash refusal disabled (memory): certification case `claims.moveAll:in-place`.
- **S3-1 holder names from the root directory, full scan.** `claim`/`release` take the caller's `ResourceAccess`; names come from the organization's person list under scoped access and from `namesOf` under legacy access. Negative: root `listPeople()` restored: `names the holder by the organization's name, not the root name` (`claim-identity.controller.db.test.ts`) read `root-claire`; `reads only the people a refused claim names` (`startable-scope.db.test.ts`) saw `SCAN person USING INDEX person_name` and 85 rows.
- **S3-3 delegation under a pinned credential.** test only: `delegates under its own person's subtree claim, and only there`. Negative: `decideClaim`'s pin callback answering false: the delegated claim with `parentClaim` answered 403.
- **S3-4 superagent removal and delegated claims.** usage rows' `claims` are now every claim the removal takes (own and delegated, transitively, both sources); `directoryUsageOfPerson` names each on its own row; `removePerson` bumps and reports every affected work item. Negative: transitive read disabled: certification case `directory.removePerson:delegated-claims` (both sources); own claims only in `removePerson`: same case on both sources and `moves the revision of a delegated claim's work item when its superagent is removed` (`claim.db.test.ts`, revision 0); person filter restored in `directoryUsageOfPerson`: `names each claim the removal releases…`.
- **S3-2 pre-activation `unknown_identity`.** test only: `refuses an unlinked groups-less token before activation, minting no account`. Negative: `authenticateOrRefuse`'s groups-less branch disabled: 200 with an empty project list instead of 401.
- **S3-5 swap window.** documented here and in `docs/runbook-prod-deploy.md` (Team claims swap window and rollback). Negative: not a check.
- **S4.** `credential-link.ts` imports `CredentialPair` from `@wbs/contracts`; `startable.ts` narrows the step claims instead of `?? ''`; D7 consequence on admin-written claims; the runbook's rollback order. Negative: not checks.

**Blue/green window.** During the window, the outgoing be-01's confirmed `deletePerson` of a
person green pinned, or `removeStep` of a step green claimed, fails on the foreign key (500,
nothing written), and an outgoing fe-01 shown green's `claim_released` effect arm fails its
validator; those fail closed. The outgoing be-01's confirmed `deletePerson` of a person who
holds claims but is not pinned does not: the `claim.person_id` cascade takes the claims with no
`in_use` refusal and no revision bump, so the runbook rules out person deletions during the
swap window. Taken from the whole-change review and its PR #589 review; not re-run in a
two-colour setup here.

**Assumed (for Dany's review).** The hand-down moves the claims rather than refusing the
create: a split is a planning act and the holder keeps the work. Under scoped access a claim or
release naming a person outside the caller's organization answers `unknown_person` (it read the
root directory before). A `claim_released` effect names the row and step, not the holder, so
the wire shape fe-01 validates is unchanged.

Second round (PR #589 review):

- **S2 a move under a claimed leaf.** `moveWorkItem` whose destination is a leaf holding step
  claims is refused `destination_claimed` (409, holders by id, name and run; nothing written);
  the moved row is other work and does not take the claims over. Negative: refusal disabled,
  `refuses a move under a claimed leaf, naming its holders, until they are released`
  (`claim-command.test.ts`) answered ok.
- **S3-1 `remove_claims` replay after a split.** The replay refuses when a recorded claim now
  sits on another work item. Negative: check disabled, `refuses an undo of a claim once
another actor split the leaf` (memory, no revisions) answered the undo ok.
- **S4.** `touchedBy`'s `move_claims` arm is redundant with the create's explicit touched ids
  (commented; no production negative). The four step-parallel fixtures that build the
  work-item service without a claim store keep the `claims === undefined` skip: they predate
  claims, hold none, and requiring the store would change four fixtures for no reachable state.
- **Known gap, not fixed here.** `delete_subtree` and `restore_subtree` carry no claims, so
  undoing the deletion of a claimed leaf restores the row without its claims.
- **Known gap, not fixed here.** A redo of a `move` onto a leaf claimed since relies on the
  revision gate (SQLite); the replay itself does not re-check `destination_claimed`.

Commands (all with `env -u CLAUDECODE`): see the PR body for the counts on the final head.

Swarm rehearsal (2026-10-20): both changes exercised together for two fleets on a booted be-01,
with the findings it raised, in `openspec/changes/wbs-resources/verify.md`, "Swarm rehearsal".

## Final gate on the merged head (2026-10-20)

`bin/h2puni-gate.sh dd0a5749091dbcdfc6bfe9ee4ecf9cea2b9dc104` from `/home/puni1/puni-00-gate-tbf`
(log `~/gate-claims-plan-final.log`): printed
`h2puni gate: running on dd0a5749091dbcdfc6bfe9ee4ecf9cea2b9dc104`, 47 projects passed, Burokrat
and Dash suites passed, `GATE_EXIT=0`. That head contains slices 1–3, the slice 2 follow-ups, the
whole-change follow-ups (PR #589) and `origin/main` at 0e8909294. This commit changes only
verify.md.

## MCP delegation packet (tasks 2.5 MCP half, 6.4, 6.6) — gate 2026-10-21

- Head `47863f26770f4185a2d4878dc376d2d535a9fc68` (packet 0dcc31b64 merged with main 617beec66).
- `bin/h2puni-gate.sh 47863f26770f4185a2d4878dc376d2d535a9fc68` from `/home/puni1/puni-00-gate-tbf`,
  launched 2026-10-21T01:58:26Z, log `/home/puni1/gate-mcp-delegation.log`:
  `h2puni gate: running on 47863f26770f4185a2d4878dc376d2d535a9fc68`, 178 ✔ tasks, no ✖,
  `Successfully ran targets test, lint, typecheck, build for 47 projects and 7 tasks they depend on`,
  `… for 2 projects and 3 tasks they depend on`, `lint:source twilight-burokrat`, `lint twilight-dash`,
  `solver-image-smoke wbs-be-01`, `GATE_EXIT=0`.
- Review: internal Fable adversarial review of 0dcc31b64, no S1/S2 (record on PR #602).

## Dev activation (2026-10-21, task 7.1 operator run)

`docs/runbook-organization-activation.md` followed on h2puni: `BROWSER_SESSION_AUTHORITY` flipped
to `enabled` (`.env` backup kept), host-side backup `data/pre-org-activation-20261021.db`
(943,288,320 bytes, sha256 `4cf8b2cd…7509`), preflight on the copy as the runbook expects (482
unmapped roots, 334 stream conflicts, 0 drift), dry run exit 0, apply exit 0: organization
`default` (`651b4c8a-1413-44d2-868e-cdb03542804f`), super-admin `dany-1b998b1c7079`
(`190c5947-7068-4b1e-ae63-183d21de24db`), 30 members, mapped roots project 334 / person 20 /
service_team 42 / service 15 / tag 20 / external_system 5 / saved_plan 42 / resource 4, 0 pruned
streams, 3 external identities. Afterwards: marker `activated`, 30 users `selection_required`
with one candidate, preflight empty. Browser: the organization gate offered `default`, choosing it
loaded the PUNI plan with "Organization: default" in the header.

MCP delegation (PR #602, main `5a529fd94`) was deployed first: be-01 carries the RSA pair, mcp-01
be-01's `INTERNAL_AUTH_SECRET`, startup logs `organization_delegation: on`. As the runbook states,
an MCP session consented before activation is refused `403 no_active_organization` on every
organization-bound call (observed on the headless wbs-dev session: `getApiOnboarding` answers
`selection_required` with the one `default` membership); it must re-consent once.

## Dev dispatch and the bound-claim proof (2026-10-21, operator run)

Through the wbs-dev MCP re-consented after activation (the pre-activation consent bound no
organization and answered `403 no_active_organization`; the stale OAuth client id that mcp-01
had forgotten on restart is issue #607). Project `558ec5c7`, all writes undoable.

- **Binding is an admin act.** `patchPerson {accountId}` on an agent person → 200 as super-admin;
  the same command from a member session answered `forbidden` the day before.
- **A bound claim holds occupancy.** `claimWorkItem` on 070.03 with slots 1 / ram 4 / disk 3 and
  `assign: true` → `acquired` lists all three; the startable read shows the two steps under
  `claimed` with holder, assignee and run, and `resources` slots 1/2, ram 4/8, disk 3/30; the
  by-person work read lists both assignments and both claims.
- **Exhaustion refuses and names holders.** Capacity of ram lowered to 4, then the same claim on
  060.06.4 → `409 resources_exhausted {asked: 4, free: 0, holders: [070.03's holder]}`; the
  startable read moved 060.06.4 to `doesNotFit` with `shortfall: 4`. Capacity restored, 060.06.4
  claimed (slots 2/2, ram 8/8); a third slot claim refused on slots naming both holders.
- **Release frees.** `releaseWorkItem` both → `claimed: []`, occupancy 0 on every resource.
- **Observed, per spec, worth knowing:** release leaves the progress a claim stated and the
  assignments `assign: true` wrote in place (only undo removes them); the proof reverted them with
  `clearProgress` and `setAssignee null`.
- **Dispatch.** Two fleet teams with `setCapacity 2`, four agent persons bound to the operator's
  account, advisory labels on 070 / 060.06 (Claire) and 010 / 080 (Claude Code), a subtree claim
  on 070, a delegated claim on 070.03 Impl under it and a claim on 060.06.4 Impl; both leaf claims
  acquired the leaves' declared demands with no `resources` given. The team-filtered startable
  read lists the allotment with `teams` naming the label's source row and `subtreeClaim` naming the
  superagent on every 070 leaf. Ids and the full record: puni-plan
  `fleets/coordination-contract-v2.md` §12.
