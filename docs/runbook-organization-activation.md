# Organization activation

`apps/wbs/be-01/src/organization-activation-cli.ts` turns organization isolation on for an
existing WBS store. In one immediate SQLite transaction (`activateLegacyOrganization` in
`@wbs/store-sqlite/organization-legacy-activation`) it:

1. refuses unless the marker reads `pre_activation`, no organization exists and
   `--super-admin` names exactly one user by id or username;
2. creates one legacy organization named `--name`, grants that user `super_admin` and every
   other user `member`;
3. maps every root (projects, people, teams, services, tags, work item types, external
   systems, saved plans) through the legacy backfill, moves legacy `project.solution_slug`
   pairs into `project_solution` and copies legacy Auth0 pairs into `external_identity`;
4. reruns the ownership preflight's three reconciliation queries and refuses, rolling back,
   unless all are empty;
5. sets the marker `activated` at the current instant.

**Activation is one-way.** There is no undo: the marker's triggers refuse reverting it and
schema rollback across it is refused (`openspec/changes/organization-ownership-and-access`).
Recovery is forward repair or restoring the backup taken below.

## Preconditions the CLI cannot check

- be-01 serves with `BROWSER_SESSION_AUTHORITY=enabled`. Under `disabled`, an activated store
  answers `403 no_active_organization` to every account
  (`organization-activation.boot.db.test.ts`).
- Bearer-only clients bind no organization after activation, and that includes mcp-01, which
  forwards its caller's token. They answer `403 no_active_organization` until gateway and MCP
  delegation (tasks 2.5 and 6.x) ship.
- No organization-unaware release still writes the file. Root inserts after activation map
  to nothing and stay invisible.

## Procedure on dev (h2puni, `wbs-dev-src`, store under `/data`)

The dev checkout (`/home/puni1/wbs-dev/src`, mounted at `/src`) must already carry this CLI.
Read `DB_PATH` from `/home/puni1/wbs-dev/src/apps/wbs/be-01/.env` first. The commands below
assume `/data/wbs.db`.

```sh
# 1. Backup: a verified snapshot (path, sha256, bytes, migrations as JSON).
docker exec -e DB_PATH=/data/wbs.db wbs-dev-src \
  bun apps/wbs/be-01/src/backup-db-cli.ts /data/pre-org-activation-$(date +%Y%m%d%H%M).db
# 2. Dry run: rehearses the whole transaction, prints the plan, rolls back.
docker exec -e DB_PATH=/data/wbs.db wbs-dev-src \
  bun apps/wbs/be-01/src/organization-activation-cli.ts --name default --super-admin <dany user id>
# 3. Apply.
docker exec -e DB_PATH=/data/wbs.db wbs-dev-src \
  bun apps/wbs/be-01/src/organization-activation-cli.ts --name default --super-admin <dany user id> --apply
# 4. Verify: marker `activated`, every user with exactly one membership.
docker exec -e DB_PATH=/data/wbs.db wbs-dev-src \
  bun apps/wbs/be-01/src/organization-selection-preview-cli.ts
docker exec -e DB_PATH=/data/wbs.db wbs-dev-src \
  bun apps/wbs/be-01/src/organization-ownership-preflight-cli.ts
```

Pass the user **id**: on 2026-10-20 dev held two accounts whose usernames start with `dany`.
The dry run takes the write lock for its rehearsal only. Its organization id is discarded.
Exit codes: 0 done, 3 already activated, 4 an organization exists, 5 super-admin not exactly
one user, 6 reconciliation found unmapped roots, name drift or ownership conflicts (listed on
stderr). A broken marker, a malformed legacy pair or bad arguments throw (exit 1). Every
refusal leaves the store unchanged.

be-01 reads the marker on every request, so no restart is needed. Browsers then choose the
organization explicitly once.

## Verified and not verified

Verified locally on 2026-10-20 against migrated disposable fixtures:
`organization-activation-cli.db.test.ts` covers the dry run, the apply, the refusals and the
fault proofs, and `organization-activation.boot.db.test.ts` covers the booted app. The
counts are in the change's `verify.md`. The CLI has **not** been run against dev or prod.
Old-process drain, the MCP credential epoch and trusted policy state (rest of task 7.1)
are not covered.
