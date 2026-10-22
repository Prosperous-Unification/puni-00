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
activation are revoked by the credential epoch advance (step 2b), so every MCP client
reauthorizes once. The operator activates only after accepting that loss knowingly.

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
# 2b. MCP credential epoch: drain mcp-01, advance the epoch, restart. See the next section.
# 3. Dry run: rehearses the whole transaction on the live file, prints the plan, rolls back.
docker exec -e DB_PATH=/data/wbs.db wbs-dev-src \
  bun apps/wbs/be-01/src/organization-activation-cli.ts --mcp-store /data/mcp-session.sqlite \
  --name default --super-admin <dany user id>
# 4. Apply (add --prune-retained-streams only if step 3 refused with event_stream conflicts).
docker exec -e DB_PATH=/data/wbs.db wbs-dev-src \
  bun apps/wbs/be-01/src/organization-activation-cli.ts --mcp-store /data/mcp-session.sqlite \
  --name default --super-admin <dany user id> --apply
# 5. Verify: marker `activated`, every user `selection_required` with one membership.
docker exec -e DB_PATH=/data/wbs.db wbs-dev-src \
  bun apps/wbs/be-01/src/organization-selection-preview-cli.ts
docker exec -e DB_PATH=/data/wbs.db wbs-dev-src \
  bun apps/wbs/be-01/src/organization-ownership-preflight-cli.ts
```

## Step 2b: advance the MCP credential epoch

The order is: drain the old mcp-01, run `apps/wbs/mcp-01/src/credential-epoch-cli.ts`, then
run the activation CLI (steps 3 and 4). The activation CLI proves the order: its required
`--mcp-store` names mcp-01's store, and while that store is absent, lacks the epoch migration
or is still at epoch 0, `--apply` refuses with `mcp_epoch_not_advanced` (exit 7) before
touching the WBS database. The dry run prints its plan and then the same refusal. A
malformed epoch or an unreadable store throws (exit 1). There is no bypass flag. The epoch CLI moves the MCP store from epoch 0 to 1 in one
transaction. It revokes every pre-activation refresh family and deletes its sessions, so
codes, sessions and refresh tokens issued before it are refused (`invalid_grant`, or 401 on a
tool call). Epoch 1 is one-way, and only the store backup returns to 0.

1. **Drain.** On dev mcp-01 runs inside `wbs-dev-src` with be-01, gw-01 and fe-01. Draining it
   means stopping the container, which takes dev down for the minute this step lasts.
   `restart: unless-stopped` keeps it stopped, but devsync restarts it
   (`docker restart wbs-dev-src`, `tools/tool-devsync/src/sync.ts`) when a deploy lands while
   the poller runs. That is safe: the epoch CLI then exits 3, or the starting mcp-01 cannot
   read the store until the advance ends. If the CLI exits 3, stop the container again and
   rerun, or push nothing to `main` during this step.
2. **Advance.** The CLI opens the store with SQLite's exclusive locking mode and no busy wait.
   While any process on the host has read or written the store through a still-open
   connection, it prints
   `{"refusal":"store_in_use",…}` on stderr and exits 3, changing nothing. Run it without
   `--apply` first. That rehearsal prints `revokedFamilies` and `removedSessions` and rolls
   back. A second `--apply` at epoch 1 prints `already_activated` and exits 0. A connection
   that was opened but never used holds no lock and is not seen; mcp-01's store always runs
   statements as it opens, so a running mcp-01 is always seen. An absent,
   unmigrated or unknown-epoch store throws (exit 1), and the path is never created.
3. **Restart.** mcp-01 at epoch 1 refuses to start without `INTERNAL_AUTH_SECRET` in
   `apps/wbs/mcp-01/.env`, and a release older than this change refuses epoch 1 at startup.
   An old release therefore cannot come back after the advance. Until be-01 is activated, a
   new MCP consent is refused with `temporarily_unavailable`.

```sh
grep -c '^INTERNAL_AUTH_SECRET=' /home/puni1/wbs-dev/src/apps/wbs/mcp-01/.env   # must print 1
docker stop wbs-dev-src
# Backup: the store with any -wal/-shm left by the stop, next to it, mode kept.
for f in /home/puni1/wbs-dev/data/mcp-session.sqlite*; do
  cp -p "$f" "${f/mcp-session.sqlite/mcp-session.pre-epoch.sqlite}"
done
epoch() {
  docker run --rm --user 1000:1000 -v /home/puni1/wbs-dev/src:/src -v /home/puni1/wbs-dev/data:/data \
    -w /src -e MCP_STORE_PATH=/data/mcp-session.sqlite wbs-dev-src:1 \
    bun apps/wbs/mcp-01/src/credential-epoch-cli.ts "$@"
}
epoch            # dry run: prints the counts and rolls back
epoch --apply    # advances; rerunning prints already_activated
docker start wbs-dev-src
```

The copy is taken while the container is stopped, so no process is writing it. The store
and its `-wal` file are credentials (mode 600). No live dev run has proved that the one-off container sees the same file lock as `wbs-dev-src`. Both use the
same host bind mount on one kernel, and `credential-epoch.test.ts` proves the refusal only
between two local processes.

**Dev is already activated.** Dev's marker was set on 2026-10-21 (03:48 UTC), before the
activation CLI checked the MCP epoch, while its MCP store stayed at epoch 0. On dev, then, the epoch CLI runs after the marker, as a catch-up. It
also revokes the families bound after activation (still epoch 0), so every dev MCP client
reauthorizes once more. Nothing else depends on the order there.

## Activation CLI notes

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
- 7: the MCP credential epoch has not advanced (`mcp_epoch_not_advanced`, with `reason`
  `absent`, `unmigrated` or `epoch_0`); run step 2b first.
- 1: a broken marker, a malformed legacy pair, a malformed MCP epoch, an unreadable MCP store
  or bad arguments threw.

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

- old-process drain (on dev it is the container stop in step 2b; there is no executor proof);
- trusted policy state.

The epoch CLI is covered by `apps/wbs/mcp-01/src/credential-epoch.test.ts`. It has not been
run against dev or prod.
