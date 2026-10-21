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
4. with `--prune-retained-streams` (only with `--apply`), deletes the event streams of
   deleted projects;
5. reruns the ownership preflight's three reconciliation queries and refuses, rolling back,
   unless all are empty;
6. sets the marker `activated` at the current instant.

**Activation is one-way.** There is no undo: the marker's triggers refuse reverting it and
schema rollback across it is refused (`openspec/changes/organization-ownership-and-access`).
Only restoring the backup taken in step 1 returns to `pre_activation`, and that loses every
write made after it.

**After activation every Bearer-only client without a selection is refused**
(`403 no_active_organization`; proof: `organization-activation.boot.db.test.ts`). mcp-01
keeps working only if, before activation, be-01 has the delegation key pair
(`WBS_DELEGATION_SIGNING_KEY`, `WBS_DELEGATION_VERIFY_KEY`) and mcp-01 has be-01's
`INTERNAL_AUTH_SECRET`; its users then reconnect once and are bound to an organization
(`docs/auth-integration.md`, "MCP organization delegation"). MCP sessions opened before
activation stay unbound and are refused until task 6.5 revokes them at the cutover. The
operator activates only after accepting that loss knowingly.

## Step 0: stop if `BROWSER_SESSION_AUTHORITY` is `disabled`

```sh
grep -E '^(DB_PATH|BROWSER_SESSION_AUTHORITY)=' /home/puni1/wbs-dev/src/apps/wbs/be-01/.env
```

**If it prints `BROWSER_SESSION_AUTHORITY=disabled`, stop here.** Under `disabled`,
every account answers `403 no_active_organization` after activation
(`after activation, the disabled composition binds no organization`). The marker is
permanent, so only the backup restores access. On 2026-10-20 dev ran `disabled`.

Switching to `enabled` first is a separate, reversible change: edit that `.env` and restart
`wbs-dev-src`. Before activation, `enabled` answers every organization request exactly as
`disabled` does (`boot-browser-session.db.test.ts`). What changes is sign-in bookkeeping:

- logout, OIDC refresh and credential replacement commit through the durable browser
  lifecycle and credential revocations;
- `POST /api/auth/logout` is mounted;
- a refresh without a lifecycle correlation answers 401. Sessions issued under `disabled`
  are therefore expected to need one fresh sign-in once their access token expires. This is
  inferred from the refresh case in that test and not observed on dev.

Dev's fe-01 must also carry the organization gate
(`apps/wbs/fe-01/src/components/organization/organization-gate.tsx`), so that browsers can
select the organization after activation.

## Procedure on dev (h2puni, `wbs-dev-src`, store under `/data`)

The dev checkout (`/home/puni1/wbs-dev/src`, mounted at `/src`) must already carry this CLI.
The commands assume `DB_PATH=/data/wbs.db`. Replace it with the value step 0 printed.

```sh
# 1. Backup: a verified snapshot (path, sha256, bytes, migrations as JSON).
docker exec -e DB_PATH=/data/wbs.db wbs-dev-src \
  bun apps/wbs/be-01/src/backup-db-cli.ts /data/pre-org-activation.db
# 2. Read-only reports on the backup copy: findings and per-user selection state.
docker exec -e DB_PATH=/data/pre-org-activation.db wbs-dev-src \
  bun apps/wbs/be-01/src/organization-ownership-preflight-cli.ts
docker exec -e DB_PATH=/data/pre-org-activation.db wbs-dev-src \
  bun apps/wbs/be-01/src/organization-selection-preview-cli.ts
# 3. Dry run: rehearses the whole transaction on the live file, prints the plan, rolls back.
docker exec -e DB_PATH=/data/wbs.db wbs-dev-src \
  bun apps/wbs/be-01/src/organization-activation-cli.ts --name default --super-admin <dany user id>
# 4. Apply (add --prune-retained-streams only if step 3 refused with event_stream conflicts).
docker exec -e DB_PATH=/data/wbs.db wbs-dev-src \
  bun apps/wbs/be-01/src/organization-activation-cli.ts --name default --super-admin <dany user id> --apply
# 5. Verify: marker `activated`, every user `selection_required` with one membership.
docker exec -e DB_PATH=/data/wbs.db wbs-dev-src \
  bun apps/wbs/be-01/src/organization-selection-preview-cli.ts
docker exec -e DB_PATH=/data/wbs.db wbs-dev-src \
  bun apps/wbs/be-01/src/organization-ownership-preflight-cli.ts
```

Before activation, step 2's preflight reports every root in `unmappedRoots` and every event
stream in `ownershipConflicts`, because no organization exists yet. Those findings are
expected. Any other entry, or anything in `catalogNameDrift`, means the dry run will refuse.

Pass the user **id**: on 2026-10-20 dev held two accounts whose usernames start with `dany`.
Read the dry run's `members` (id, username and role per account), `externalIdentities`
and `solutionLinks` before applying. Those lists are the whole access change. The dry run
holds the write lock only for its rehearsal, and its organization id is discarded.

Exit codes:

- 0: done.
- 3: already activated.
- 4: an organization already exists.
- 5: the super-admin is not exactly one user.
- 6: reconciliation found unmapped roots, name drift or ownership conflicts, listed on
  stderr.
- 1: a broken marker, a malformed legacy pair or bad arguments threw.

Every refusal leaves the store unchanged.

**Retained streams.** Deleting a project leaves its `event_sequencer` and `event_log` rows
behind, and reconciliation refuses them as `event_stream` conflicts. `--prune-retained-streams`
deletes only `project:<id>` streams whose project row is gone. They have no reader, because
the project they replay is deleted. Each pruned stream is listed in `prunedStreams`. A
stream that names a live project is never pruned. On 2026-10-20 dev had 333 streams and 333
projects, with no retained stream.

be-01 reads the marker on every request, so no restart is needed. Browsers then choose the
organization explicitly once.

## Verified and not verified

Verified locally on 2026-10-20 against migrated disposable fixtures:

- `organization-activation-cli.db.test.ts` and `organization-legacy-activation.db.test.ts`
  cover the dry run, the apply, every refusal, pruning and the fault proofs;
- `organization-activation.boot.db.test.ts` covers the booted app, including
  restricted-project parity for a `member`.

The counts are in the change's `verify.md`. The CLI has **not** been run against dev or prod.
These parts of task 7.1 are not covered:

- old-process drain;
- the MCP credential epoch;
- trusted policy state.
