## Verification record

Nothing implemented yet. Drafted 2026-10-19; the design interview with Dany was held the same
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

Not verified: that an Auth0 machine-to-machine token carries `wbs_groups` (task 0.2); that
plan document v6 carries a person's teams (task 0.3). `openspec validate --all --json` on this
change: run before each push, result in the PR.

## Slice 2: binding and credentials (tasks 2.1, 2.2, 2.4)

Branch `feat/wbs-person-account`, 2026-10-19. Tasks 2.3 and 2.5 are not in this slice. All
tests ran on the laptop with `env -u CLAUDECODE` (13 repo tests fail only under
`CLAUDECODE=1`).

### What landed

- `20261019120000_add_person_account`: nullable `person.account_id` FK `users.id`, plain
  index (many persons per account). `down.sql` refuses while any person is bound, naming the
  count and the unbind (`patchPerson` with `accountId: null`).
- `20261019120100_add_external_identity_person`: nullable `external_identity.person_id` FK
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

- Spec `fleet-credentials` "Unlinking ends the credential" says the next request is refused as
  an unknown identity. Observed in `fleet-credential.controller.db.test.ts`: after activation an
  unmapped pair mints a new account through `resolveMappedIdentity` and the request is refused
  403 `no_active_organization` (users went from 1 to 2). The credential no longer reaches the
  account's projects, but an account is created. Deciding whether a machine pair may mint an
  account belongs with task 0.2/2.5.
- Removing a person that a credential is pinned to is a raw foreign-key failure (500) on SQLite;
  no modeled refusal yet.
- Not verified by a build: that `link-credential-cli.ts` ships in the production image. The
  be-01 Dockerfile copies `apps/wbs/be-01` whole (`COPY apps/wbs/be-01 ./apps/wbs/be-01`), as
  for the other `src/*-cli.ts`; no image was built here.
