# Runbook — deploying prod

Prod is image-based blue/green, unchanged by the source-run dev work. Orientation
lives in `LLM_README.md`; this is the operating detail.

## The build host, as provisioned on 2026-08-05

Three things had to exist before any command below could run. All three are in
place; each is worth knowing about because each failed in its own way first.

- **`dagger` v0.21.9** in `/home/puni1/.local/bin`, pinned to the engine's own
  image tag (`registry.dagger.io/engine:v0.21.9`). A CLI newer than the engine
  negotiates a version the engine will not serve. Installed as `puni1` — there is
  **no passwordless sudo** on this host, and none is needed.
- **A build checkout at `/home/puni1/wbs-build`**, cloned over https. It is not
  dev's: `/home/puni1/wbs-dev/src` is `git reset --hard` by every dev deploy, so
  building there races the deploy and loses local state.
- **`h2puni` resolving to itself.** `tool-deploy`'s `DEFAULT_HOST` is the alias
  `h2puni`, and the deploy runs _on_ h2puni, so it ssh's to itself. That alias
  lives in h1claw's config; on h2puni it did not resolve at all, and puni1's own
  key was not in its `authorized_keys`. Both fixed: `~/.ssh/config` maps the
  alias to `127.0.0.1`, and the key was **appended** to the existing two.

Verified end to end on 2026-08-05: images published to the registry, and
`--all --with-migrations` (dry run, no `--execute`) produced a full three-tier
plan against prod's real state.

> Check tooling on h2puni with `ssh h2puni 'bash -lc "command -v node"'`. Volta and Bun are
> on the PATH of a **login** shell only; a bare `ssh h2puni 'command -v node'` reports
> `node` missing when it is installed and working. Same trap this file documents for h1claw
> — it cost an incorrect "no node" claim in the 2026-08-04 docs pass.

```sh
# ON h2puni, once the dagger CLI and a prod checkout (not dev's) exist:
export REGISTRY_USER=wbs REGISTRY_PASS=$(grep ^REGISTRY_PASS= /home/puni1/wbs/.env | cut -d= -f2-)
bin/h2puni-gate.sh "$(git rev-parse HEAD)"   # the sha is checked out under the heavy lock
bin/publish-release.sh
bunx nx run tool-remote-scripts:install --execute   # after any swap.js / smoke.js change
bunx nx run tool-deploy:deploy -- --all --execute
```

The gate and publisher share `/home/puni1/.cache/wbs-heavy-work.lock`; either
refuses immediately with exit 75 when the other owns it. Publishing also
refuses before Dagger starts when available memory is below 8 GiB, combined
`/tmp` + `/dev/shm` use is above 25%, or one-minute load exceeds the online CPU
count. Do not bypass these refusals with the underlying Nx target.

`bin/publish-release.sh` creates or validates `wbs-dagger-engine`: v0.21.9 (the tag is derived from the installed SDK, and `main.test.ts` holds this file to it),
8 GiB memory with no swap expansion, 6 CPUs, 2,048 PIDs, loopback port 8081,
and persistent volume `wbs-dagger-engine`. It stops the engine after success or
failure. A stopped engine after a release is the expected state; do not add an
automatic restart policy.

Env root moved 2026-08-04 — `/home/puni1/wbs/.env`, not `/srv/wbs/.env`. Both are readable
today because `/srv/wbs` is a stale rollback copy; read the new path.

From an arm64 Mac instead, prepend a tunnel to prod's engine (QEMU otherwise):
`ssh -f -N -L 8081:127.0.0.1:8081 h2puni` and `export _EXPERIMENTAL_DAGGER_RUNNER_HOST=tcp://127.0.0.1:8081`.

Dagger builds `linux/amd64` → self-hosted registry (the only build/deploy contract) → swap starts the
idle colour for gateway/frontend, health-gates, repoints Caddy, drains WS, stops old, runs smoke. Backend swaps stop and prove every managed old writer before candidate startup, then gate migration, health and compatibility before any alias or routing exposure. `--dry-run` is default.
It **refuses** on a dirty tree, a stale `release.json`, or an unbuilt executor bundle — those are the
safety gates, not bugs. `deploy` builds the bundles itself via `dependsOn`.

`swap.js` takes **one tier list per run**, not one tier per invocation:
`bun bin/swap.js be,gw,fe --image-be=… --image-gw=… --image-fe=… --sha=… --execute`. That is what
keeps the deploy lock held across the whole run. The installed `/home/puni1/wbs/bin/swap.js` must
be reinstalled after this change or `assertBundleInstalled` will (correctly) refuse. A copy also
still exists at `/srv/wbs/bin/swap.js` — that is the stale rollback tree, and editing it changes
nothing.

`--version`, `--since` and `--skip-build` are **refused** — they were parsed and ignored
until 2026-08-04, so `--version=v1.2.3` read as a rollback and deployed HEAD instead.

**Step-code backfill.** A `be` swap ends with `backfill-step-codes`, after `stop-blue` and before alias/routing exposure and `commit`. It runs `bun run src/backfill-step-codes-cli.ts` in the new colour, which codes every
step an older release inserted without a code. If it fails, the candidate is stopped and inspected, the outgoing backend remains stopped, the interruption markers remain, and `commit` does not run. The error names the manual command,
`docker exec be-01-<colour> bun run src/backfill-step-codes-cli.ts`. That command is idempotent:
run it until it prints `step codes backfilled: <n>`, then follow the backend interruption recovery procedure before another deploy
(`backfillStepCodes` in `libs/wbs/adapters/store-sqlite/src/step-code-backfill.ts`).

**Pre-migration backup.** A `be` swap runs `backup-db` between `stored-vocabularies` and
`migrate`. The incoming container writes a `VACUUM INTO` copy to
`/home/puni1/wbs/data/backups/wbs-pre-<sha>-<stamp>.db`, checks `integrity_check` and a nonempty
migration ledger, and only then renames it into place (`snapshotDatabase` in
`libs/wbs/adapters/store-sqlite/src/backup.ts`). If the backup fails, the swap aborts before
anything is migrated. Nothing deletes old backups; prune them by hand.

## First product deploy

Prod has run the pre-product release `0afc7775` since 2026-08-03. Its database should hold only
`20260426171432_talented_smiling_tiger`. These steps apply to the first deploy of the product
over it. They cover what the swap cannot check for itself.

**Environment files.** `startGreen` refuses a swap whose env files lack a key the release
requires or hold a value its loader would reject: a non-integer `PORT`, an unknown `LOG_LEVEL`, a
secret shorter than 32 characters, or a callback off `/api/auth/okta/callback`. It names each key,
file and rule, never a value. Write values bare. A quoted value or one containing ` #` is refused,
because Compose would strip the quotes or the comment. Nothing is written or started before the
check (`assertTierEnvComplete` in `tools/tool-remote-scripts/src/lib/docker.ts`). Each file must
hold:

| File                                  | Keys                                                                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/home/puni1/wbs/be-01.env`           | `PORT`, `LOG_LEVEL`, `GW_URL`, `DB_PATH`, `AUTH_MODE=oidc`, `AUTH_METHODS` (`none` until activation), `BROWSER_SESSION_AUTHORITY=enabled\|disabled` |
| `/home/puni1/wbs/gw-01.env`           | `PORT`, `LOG_LEVEL`, `BE_URL`, `AUTH_MODE=oidc`                                                                                                     |
| `/home/puni1/wbs/.env`                | `INTERNAL_AUTH_SECRET`, `JWT_SIGNING_KEY_CURRENT` (at least 32 characters each)                                                                     |
| `/home/puni1/wbs/oidc.env` (mode 600) | `AUTH_ISSUER_DISCOVERY_URL`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`, `AUTH_REDIRECT_URI`, `AUTH_AUDIENCE`                                           |

`BROWSER_SESSION_AUTHORITY` has no default: `enabled` commits logout, refresh and replacement through the shared durable browser lifecycle and reads the organization cookie; `disabled` keeps the legacy browser routes (see `bootBe01`). Switch deployed backends to `enabled` before fe-01's production bootstrap moves to server sign-out.

`AUTH_MODE=local` is refused. The be-01 and gw-01 images set `NODE_ENV=production`, and
`authModeOf` refuses local mode in production. OIDC is the only mode prod can boot. The swap
merges `oidc.env` into be and gw after their app files and before the derived secrets file. It
may hold only the five provider keys. `AUTH_REDIRECT_URI` must be
`https://wbs.bulletpoints.club/api/auth/okta/callback`. With `NODE_ENV=production` the group
prefix is `prod`, so the tenant's post-login Action must emit `prod:wbs:*` groups
(`docs/auth-integration.md`). Password login stays on and password registration off, which are
the release defaults. Choosing the tenant and client is an operator decision.

**The no-prod-release gate.** `bin/assert-no-prod-release.sh /home/puni1/wbs/state` refuses once
any tier is recorded. That is correct in general, and it is why the rename migration is safe to
ship only over a skeleton database. Immediately before running the gate, dump the live ledger
from a read-only open, one name per line
(`SELECT name FROM __drizzle_migrations ORDER BY created_at`). An older dump says nothing about a
deploy that has happened since. Then run:

```sh
bin/assert-no-prod-release.sh /home/puni1/wbs/state --override-with-ledger=<ledger-dump>
```

The override is accepted only when the dump lists exactly
`20260426171432_talented_smiling_tiger`. It never excuses an unreadable state directory or file.
If it refuses, stop: the rename is unsafe, and the expand/contract route in
`openspec/changes/steps-schema-rename/design.md` D2 applies. Keep the accepted output and the
dump with the deploy record.

**Restore.** Backend failures after durable stop intent require the attended recovery below. They never automatically reverse migrations, restart the older writer, or restore a snapshot. A pre-migration snapshot is evidence; after possible exposure, restoring it would discard candidate writes and is forbidden. Gateway/frontend retain their existing pre-reload cleanup. An explicitly authorized disaster recovery may use the pre-migration backup only after accounting for every write since that snapshot. Stop both be-01 colours first, then run the restore from a
throwaway container of the new image:

For a pre-route `be` abort, swap first captures the complete applied migration set from green,
persists an attempt-specific private file under `/home/puni1/wbs/state`, and reads it back before
running the forward migration. On abort it verifies that the retained and copied bytes still match,
runs `migrate-down-cli.ts --capture-file` in green, and compares the complete final ledger with
the captured set. A zero-exit down command with a different ledger is a rollback failure. The
capture remains on the host after green stops. If rollback fails, use the **exact pinned-image
`docker run` command printed by swap**: it binds that retained capture read-only, binds
`/home/puni1/wbs/data` read-write, and sets the DB_PATH observed from green before migration.
The exact-set CLI requires `--capture-file`, `--capture-sha256` (from the original durable
capture), `--target`, `--attempt` and `--candidate`; the printed automatic/manual command
passes all five. The backend refuses changed bytes before parsing the file or opening SQLite for
reversal. Keep those fields and the image digest unchanged; inspect the capture and current
ledger before retrying. An absent or unreadable capture is not an empty applied set.
Before migrating, capture refuses with `applied migration <name> is absent or changed in candidate`
when the incoming image lacks an applied migration or carries different bytes for it. Ship every
applied migration unchanged in the candidate; never reformat a historical `migration.sql`.
The `--to=<baseline>` commands below are legacy operator procedures for
separate data-removal workflows, not the automatic swap abort path.

After `reload`, restore the pre-migration backup as follows:

```sh
docker run --rm -v /home/puni1/wbs/data:/data -e DB_PATH=/data/wbs.db \
  --entrypoint bun <be-01 image> run src/restore-db-cli.ts /data/backups/<name>.db
```

The restore verifies the backup before replacing anything. It moves `wbs.db`, `-wal` and `-shm`
aside as `.displaced-<stamp>` and never deletes them. Then restore `site.caddy`, `docker start`
the old containers and `caddy reload`. Copy the backup off the host before deploying.

**Smoke.** After the swap, smoke also checks the read paths. `/api/auth/me` without a credential
must answer `{"user":null}`, and `/api/projects` without one must be 401. For signed-in reads,
put `SMOKE_READ_USER_ID` and `SMOKE_READ_USERNAME` in `/home/puni1/wbs/smoke-read.env`
(mode 600). They must name a dedicated, low-value account that owns nothing anyone needs. Smoke
then mints a one-minute session with the deployed signing key and reads `/api/auth/me` and
`/api/projects`. Without the file, those two checks print `SKIPPED`. Failures print the status
and response keys, never the account or project values. Writes stay a manual smoke.

The minted session is a password session. It passes only while `AUTH_PASSWORD_LOGIN` is not
`false`: in OIDC mode, a token the OIDC verifier rejects falls through to the password check only
while password sessions are on (`AuthService.authenticate`). With password login off, the
signed-in checks fail with 401. Every signed-in request asks the OIDC verifier first, so an
outage of the provider's discovery or JWKS endpoint shows as 500 on the signed-in checks. That is
not an application fault.

## Typed dependency rollback

**Code rollback with SS/FF rows.** The `be` swap compares the incoming binary's
supported types with the shared database before migration, then checks again
after migration and health while the outgoing colour remains stopped, before candidate exposure. An older image without
`relationship-types-cli.ts` is treated as FS-only. If either check finds unsupported
types, the error lists their counts. A compatibility failure before exposure stops and inspects the candidate, leaves the older writer stopped, retains interruption state, and does not commit. Redeploy a release that understands those types,
or stop all typed-dependency writers and use a compatible container to `save` and `remove`
the rows with the commands below. Copy the saved file off the host and keep it secure.
Rerun the code deploy; no schema
rollback is needed for this case. After deploying a compatible reader again,
`restore` the saved rows with the command below. `remove` verifies that its
saved set exactly matches the table before deleting anything.

**Known, deliberate: a reader-only release refuses SS/FF loudly.** Releases built after
round 25 (#181 Fast, #182 solver) but before the SS/FF writes and UI (#183, #190) report
`["FS","SS","FF"]` from `relationship-types-cli.ts`. The swap guard therefore admits them over
a database that holds SS/FF rows. Fast and the solver schedule those rows correctly, but two
readers in that release still accept only FS:

- the plan export (`plan-document.resource.ts`) throws `unknown typed dependency type SS`, so
  `GET /api/projects/:id/export` returns 500 for that project;
- the fe chart (`plan-chart-input.ts`) throws `GanttDataError: unsupported chart dependency SS`,
  so the chart shows its fault boundary for that project.

Projects without SS/FF rows are unaffected. This is "refuse loudly" rather than a silent FS
reading, so it stays as it is. To fix it, roll forward to a release that includes #190. If the
older release must serve those projects, `save` and `remove` the typed rows with the commands
below.

Rolling back past `20260927213000_add_typed_dependency` refuses while `typed_dependency` holds
rows: the older release cannot read them, and `down.sql` will not drop them silently. The
refusal reads `CHECK constraint failed: typed dependencies exist: …`. The procedure is lossless.
Run it inside the incoming container after its writers have stopped, with the same `DB_PATH`.

Save the rows, then copy the file off the host:

```sh
docker exec be-01-<colour> bun run src/typed-dependency-rollback-cli.ts save /data/typed-dependency-<date>.json
```

Remove them only after the save is secure. Remove refuses unless the saved rows match the table
exactly, including every column:

```sh
docker exec be-01-<colour> bun run src/typed-dependency-rollback-cli.ts remove /data/typed-dependency-<date>.json
docker exec be-01-<colour> bun run src/migrate-down-cli.ts --to=<baseline>
```

After a later forward migration, restore from the saved file. Restore refuses the whole set if
any endpoint no longer fits its project or work-item shape:

```sh
docker exec be-01-<colour> bun run src/typed-dependency-rollback-cli.ts restore /data/typed-dependency-<date>.json
```

## Work item status facts rollback

**Code rollback with stored readiness or holds.** The `be` swap's `stored-vocabularies`
step compares the readinesses and hold kinds the incoming binary reads
(`readiness-kinds-cli.ts`, `hold-kinds-cli.ts`) with the values stored in `work_item`,
before migration and again after stopping the outgoing colour, as it does for relationship
types. An older image without those CLIs reads none, so any stored value refuses it and the
error lists each value and its count. Such an image would schedule held work as if nothing
were held, or give a ready leaf a child the status read then refuses (ADR 0032). Redeploy a
release that reads them, or save and remove the statements with the commands below and
rerun the deploy.

Rolling back past `20260928200000_add_work_item_status_facts` refuses while any hold is
stored; the refusal reads `CHECK constraint failed: work item holds exist: …`. Readiness is
dropped without a guard, as fact dates are. Run the commands inside the incoming container
with the same `DB_PATH`, after writers have stopped.

```sh
docker exec be-01-<colour> bun run src/work-item-status-facts-rollback-cli.ts save /data/work-item-status-facts-<date>.json
docker exec be-01-<colour> bun run src/work-item-status-facts-rollback-cli.ts remove /data/work-item-status-facts-<date>.json
docker exec be-01-<colour> bun run src/migrate-down-cli.ts --to=<baseline>
```

`remove` refuses unless the saved statements match the table exactly. After a later forward
migration or redeploy, restore them; restore refuses the whole set if a saved work item is
gone or has become a parent:

```sh
docker exec be-01-<colour> bun run src/work-item-status-facts-rollback-cli.ts restore /data/work-item-status-facts-<date>.json
```

## Space rollback

Code rollback needs nothing: an older image has no spaces routes, and the `space` and
`space_project` tables are inert to it. Rolling back past `20260929100000_add_spaces` refuses
while any space exists, reading `CHECK constraint failed: spaces exist: …`, because dropping
the tables would lose every space and its order. Run the procedure inside the incoming
container after its writers have stopped, with the same `DB_PATH`. Save, then copy the file
off the host:

```sh
docker exec be-01-<colour> bun run src/space-rollback-cli.ts save /data/spaces-<date>.json
```

Remove only after the save is secure. Remove refuses unless the file equals every stored space
and member, every column included:

```sh
docker exec be-01-<colour> bun run src/space-rollback-cli.ts remove /data/spaces-<date>.json
docker exec be-01-<colour> bun run src/migrate-down-cli.ts --to=<baseline>
```

After a later forward migration, restore. Restore refuses the whole set, naming the space, when
a saved organization is gone, a saved project is no longer owned by its space's organization,
the organization already holds a space of that name, or an author is no longer a user:

```sh
docker exec be-01-<colour> bun run src/space-rollback-cli.ts restore /data/spaces-<date>.json
```

## Project rank rollback

Code rollback needs nothing: an older image has no rank routes, and the `project_rank` table is
inert to it. Rolling back past `20260929180000_add_project_rank` refuses while any rank exists,
reading `CHECK constraint failed: project ranks exist: …`, because dropping the table would lose
every organization's project order. Run the procedure inside the incoming container after its
writers have stopped, with the same `DB_PATH`. Save, then copy the file off the host:

```sh
docker exec be-01-<colour> bun run src/project-rank-rollback-cli.ts save /data/project-ranks-<date>.json
```

Remove only after the save is secure. Remove refuses unless the file equals every stored rank,
every column included:

```sh
docker exec be-01-<colour> bun run src/project-rank-rollback-cli.ts remove /data/project-ranks-<date>.json
docker exec be-01-<colour> bun run src/migrate-down-cli.ts --to=<baseline>
```

After a later forward migration, restore. Restore refuses the whole set, naming the project,
when a saved project is no longer owned by its organization or an author is no longer a user:

```sh
docker exec be-01-<colour> bun run src/project-rank-rollback-cli.ts restore /data/project-ranks-<date>.json
```

## Shared people restore approvals

The approval preparation endpoint is available at
`POST /api/organization/shared-people/restore-approvals`. A personally authenticated super-admin
submits `{operationId, backupDigest}` in their active organization. `backupDigest` is the lowercase
SHA-256 of the canonical shared-people backup, printed offline with:

```sh
bun run apps/wbs/be-01/src/shared-people-rollback-cli.ts digest <backup-file>
```

This command needs no `DB_PATH` and opens no database. It validates the complete v1 backup and
normalizes field/array ordering before hashing; whitespace and presentation order do not change
the digest. Keep the backup unchanged after approval. The installed host owner fences containers
and installs audited receipt/consumption recovery, while shared physical acceptance and activation
remain open in tasks 10.3b–10.4. Preparing approval does not activate shared capacity or permit
this release to restore a shared backup.

The server supplies the actor and organization from the request identity. Delegations cannot
approve; neither `actorId` nor `organizationId` is accepted in the body. A retry by the same
current super-admin for the same operation/digest returns the existing approval. A changed digest
or approving person returns `409 restore_approval_conflict`; use a fresh operation ID for a new
restore intent. Keep returned approval IDs for the consuming restore step. Approval evidence is
retained, and migration rollback refuses once any operation, approval or completion exists.
A completed operation cannot gain approvals for another organization. An identical existing
approval retry still requires the same current personally authenticated super-admin.

## Shared people rollback

The intermediate storage release encodes isolated and shared modes but supports only isolated
runtime operation. The swap reads actual stored encodings and refuses an isolated-only incoming
release while any organization is shared, before migration and again after the outgoing color
stops. A missing old-schema column means isolated; missing tables or malformed state refuse.

Every switch through `PATCH /api/organization` is recorded in `shared_people_audit`
(`20261011200000_add_shared_people_audit`), and a rollback never discards audit evidence, as with
`organization_audit`. While this release supports only isolated people the route refuses a switch
to shared (`409 capacity_mode_unsupported`) and a switch to the mode an organization already has
records nothing, so the table stays empty. Check it before choosing a path:

```sh
docker exec be-01-<colour> bun -e "import { Database } from 'bun:sqlite'; const db = new Database(process.env.DB_PATH, { readonly: true }); console.log(db.query('SELECT COUNT(*) AS switches FROM shared_people_audit').get())"
```

Once any switch is recorded the schema rollback is closed: rolling back past the audit migration
refuses with `CHECK constraint failed: shared people switches are recorded: …`, and
`shared-people-rollback-cli.ts remove` refuses with the same reason before changing anything. What
remains is to switch every shared organization back to isolated through the route as one of its
super-admins (each switch is audited and tells every project; each project's own dates return).
There is no operator CLI or maintenance identity for this: the switch is an organization act, so
it must be made by a super-admin of that organization signed in in person (a delegated session is
refused). The last-super-admin guard keeps a super-admin membership row in every organization, but
that row is not proof of a person who can still sign in. If one can, they switch the organization
back themselves from the organization page's Shared people panel (`PATCH /api/organization
{"sharedPeople": false}`); promoting an operator instead needs that same super-admin, so it is
never a shortcut. If no super-admin can sign in, recovery starts by restoring one super-admin's
sign-in; WBS has no operator path around it. Then roll back code
only: with no organization shared, the swap's capacity-modes guard admits an
older image, and the extra column and table are inert to it.

The procedure below applies only while no capacity-mode switch, restore operation or restore
approval is recorded. Check `shared_people_audit`, `shared_people_restore_operation` and
`shared_people_restore_approval` before preparing a schema rollback. Any row closes that rollback;
`shared-people-rollback-cli.ts remove` refuses inside its immediate transaction before changing
modes, ranks or organization audit fields. Restore evidence remains durable even when every
organization is isolated and no switch audit exists. Do not remove evidence to force a downgrade.
The new column's down migration also refuses while any shared organization **or any project rank** exists. Use the combined recovery procedure instead of removing ranks alone. It preserves all
organization identities and semantic modes, including isolated, and every rank field:

```sh
docker exec be-01-<colour> bun run src/shared-people-rollback-cli.ts save /data/shared-people-<date>.json
```

Save holds one dedicated read-only snapshot and exclusively creates a private file. Choose a new
path when a file already exists; existing recovery bytes are never overwritten. Secure the backup
before removing state. Remove compares the complete saved state with the database under one
immediate transaction, so any intervening mode, organization identity or rank change refuses:

```sh
docker exec be-01-<colour> bun run src/shared-people-rollback-cli.ts remove /data/shared-people-<date>.json
docker exec be-01-<colour> bun run src/migrate-down-cli.ts --to=<baseline>
```

After forwarding the migration again, the legacy container-local restore accepts isolated
backups only. It always refuses shared backups, including in a later shared-capable release;
shared recovery must consume approvals through the host owner. This release remains isolated-only. Restore
requires every saved organization still exists, all current modes isolated, no current ranks, and
valid rank ownership and authors. Additional isolated organizations remain untouched; additional
shared organizations refuse. Isolated ranks restore atomically:

```sh
docker exec be-01-<colour> bun run src/shared-people-rollback-cli.ts restore /data/shared-people-<date>.json
```

### Host recovery preflight

Build this release's host recovery artifact with `bunx nx run wbs-be-01:build-host-restore`
(the normal `wbs-be-01:build` also builds it). Copy
`dist/apps/wbs/be-01-host/shared-people-host-restore.js` to
`/home/puni1/wbs/bin/shared-people-host-restore.js` on h2puni. It runs with the pinned Bun 1.4.2
and Docker; no checkout or node_modules is needed at the recovery location. Stop every container with a writable mount over the production database
before invoking it. Both `be-01-blue` and `be-01-green` must be stopped, exist and identify the same
`/home/puni1/wbs/data/wbs.db` through their configured DB_PATH and mounts. The operator needs
permission to inspect every mounted host source; absent, unreadable or ambiguous facts refuse. Running containers with writable directory mounts on the database filesystem also refuse: those directories can contain hardlinks to the database. Distinct-device mounts can be excluded by physical device comparison. Plan an attended maintenance window for these containers and for unreadable mount sources.

```sh
bun /home/puni1/wbs/bin/shared-people-host-restore.js /home/puni1/wbs/data/shared-people-<date>.json
```

This process takes `/home/puni1/wbs/state/deploy.lock` itself and holds that exact flock through
one backup read, full Docker inventory inspection, binding checks and the restore transaction.
The installed audited owner retains that backup and one writer connection through completion. Do not wrap a detached writer with a separate locking process. A killed
owner releases the flock and SQLite rolls its uncommitted transaction back. The owner never
starts containers or changes runtime capability.

An offline digest can be supplied to the personal approval endpoint before the attended restore.
For shared backups this release diagnoses operation/approval references read-only and refuses
before opening the writer. For an isolated backup, supplying these references requests audited
rank recovery and consumes the approvals on success:

```sh
bun /home/puni1/wbs/bin/shared-people-host-restore.js /home/puni1/wbs/data/shared-people-<date>.json \
  --operation=<operation-id> --approval=<approval-id> --approval=<another-approval-id>
```

These IDs identify stored bindings; they assert no actor or session authority. The owner requires
exactly one stored approval per organization with saved ranks or saved shared mode, bound to the
original canonical digest, and rechecks each recorded person's current super-admin membership
in that organization on the immediate SQLite writer. All current organizations must be isolated
and current ranks empty; saved organizations must still exist. Extra isolated organizations survive.

One transaction restores historical ranks, changes saved shared modes in a compatible release,
and writes receipt plus approval consumption. Only actual isolated-to-shared changes gain an
audit and durable null-cause events for every owned project, including unranked projects.
Isolated rank-only recovery records receipt/consumption without mode audits or events. Any failure
rolls the entire unit back. Keep the returned receipt and exact approval IDs. An identical retry,
including after process restart or later edits, returns the original receipt/counts without replay;
a changed backup digest or approval set refuses. Never reuse a completed operation for new intent.

Before transporting the artifact, run `bunx nx run wbs-be-01:test:host-restore`. This uncached
Linux rehearsal requires Docker and the pinned `oven/bun:1.4.2` image digest
`sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895`; fetch that image
explicitly if absent. Missing Docker, Bun or the image fails the target. The rehearsal mounts only
a disposable scratch fixture at the fixed host paths, runs the unchanged bundle without network,
checkout, dependencies or Docker socket, and uses a test-owned inventory executable. It proves
approved isolated rank recovery, durable receipt retry, shared refusal before a writer, and
flock/colour/database identity fencing. This does not establish live-host exclusion.

`SUPPORTED_CAPACITY_MODES` remains `['isolated']`: installed transaction tests do not authorize
shared physical recovery. Shared physical acceptance, attended exclusion and activation remain
open in 10.3b/10.4. The existing isolated container-local save/remove/restore commands remain
available. The recorded h2 inspection has six additional running containers on the database
filesystem and six unreadable mount sources, plus disagreeing blue/green database identity;
these remain attended-operation blockers (see the change's verify.md). No production containers
have been stopped or changed by this checkpoint.

## Step node attempt rollback

**Code rollback with ended attempts.** The `be` swap's `stored-vocabularies` step compares the
attempt outcomes the incoming binary reads (`attempt-outcomes-cli.ts`) with the outcomes stored in
`step_node_attempt`, before migration and again after stopping the outgoing colour. An older image
without that CLI reads none, so any ended attempt refuses it, the error listing each outcome and
its count; a database with no attempts, or only running ones, passes. Redeploy a release that
reads them, or save and remove the attempts with the commands below and rerun the deploy.

Rolling back past the attempts migration, `20261012120000_add_step_node_attempts`, refuses while
any attempt row exists; the refusal reads `CHECK constraint failed: step node attempts exist: …`
and leaves the table and its ledger row in place. `<baseline>` is the migration below it. The project timezone is dropped without a
guard: it is a planner's setting, lost as readiness is. Run the commands inside the incoming
container with the same `DB_PATH`, after writers have stopped. `save` refuses on a database the
attempts migration never reached. The save file (format version 2) holds every attempt and every
node's issued-number mark (`step_node_attempt_issued`), which `down.sql` drops without a guard;
the CLI prints both counts, e.g. `step node attempts saved: 3, marks: 2`.

```sh
docker exec be-01-<colour> bun run src/step-node-attempt-rollback-cli.ts save /data/step-node-attempts-<date>.json
docker exec be-01-<colour> bun run src/step-node-attempt-rollback-cli.ts remove /data/step-node-attempts-<date>.json
docker exec be-01-<colour> bun run src/migrate-down-cli.ts --to=<baseline>
```

`remove` refuses unless the saved attempts and marks equal both tables column for column, then
deletes both. After a later forward migration or redeploy, restore them, numbers and marks
included, so no node issues a removed number again; restore refuses the whole set if a saved
attempt's work item is gone or has become a parent, a saved mark's work item is gone, or a saved
step is gone, and it refuses a version-1 file:

```sh
docker exec be-01-<colour> bun run src/step-node-attempt-rollback-cli.ts restore /data/step-node-attempts-<date>.json
```

## Estimate unit rollback

An older image understands only workday estimates. The swap refuses it while any step
stores `minutes` or command history binds estimates to minutes, including undo and redo
entries whose steps were removed or changed to workdays. The estimate unit migration’s
`down.sql` refuses the same state.
Stop writers before saving and removing minute estimates, and keep the save file until
restoration is verified:

```sh
DB_PATH=/data/wbs.db bun run src/estimate-unit-rollback-cli.ts save /data/estimate-units.json
DB_PATH=/data/wbs.db bun run src/estimate-unit-rollback-cli.ts remove /data/estimate-units.json
```

`remove` refuses a save that no longer matches the stored minute steps and estimates.
It also refuses any minute-bound command history, preserving whole entries unchanged.
Journal recovery is not supported: keep the compatible release until that history has
expired through the normal retention policy. Never strip unit bindings or relabel history.
It deletes their estimate rows before changing their units to `workdays`; it never reads
minute trios as days. Deploy the older release or reverse the migration after removal.
To restore, apply the forward migration on a compatible release and then run:

```sh
DB_PATH=/data/wbs.db bun run src/estimate-unit-rollback-cli.ts restore /data/estimate-units.json
```

Restoration writes the saved units and estimate columns verbatim, in one transaction,
and refuses missing steps, new estimates on those steps, or a malformed save. Saved minute
trios must be finite, ordered whole minutes within the unit maximum, validated before writes.

## Step blockage rollback

Direct blockage is a sparse audited fact on a leaf step node (ADR 0053). The swap
compares `step-blockage-kinds-cli.ts` with the stored fact inventory before migration
and again after the outgoing colour stops. A release without that CLI understands
no direct blockage; it may serve an empty inventory, but any retained blockage
refuses the swap and names the lossless recovery procedure below. Missing or
unreadable source/database state refuses the check.

The swap also checks the incoming image's replay capabilities against both
`payload.forward` and `inverse`, walking nested batches, and the stored preconditions.
`replace_blockage` requires its command capability. `move.expectedProgress` and
`Preconditions.moveProgress` require `move_progress_v1`, including empty snapshots;
the capability is counted once per journal entry, independently of live facts.
Subtree commands carrying own `deletionState` metadata require `delete_state_v1`
in either nested journal direction, including empty collections. A deletion parent
progress snapshot also retains the cumulative `move_progress_v1` requirement.
An empty blockage table does not make older code safe while a stored undo or redo
still names the new command. The fact rollback CLI does not remove journal
history. Use a compatible image or let the normal bounded journal retention
drain those entries before switching to an older image; do not delete history
by hand to bypass this refusal.

Migration `20261013140000_add_step_node_blockages` is additive. Its paired `down.sql`
refuses while any blockage remains, preserving the table and migration ledger.
Stop writers before recovery, then save and remove the facts:

```sh
DB_PATH=/data/wbs.db bun run src/step-blockage-rollback-cli.ts save /data/step-blockages-<date>.json
DB_PATH=/data/wbs.db bun run src/step-blockage-rollback-cli.ts remove /data/step-blockages-<date>.json
DB_PATH=/data/wbs.db bun run src/migrate-down-cli.ts --to=20261012130000_add_step_estimate_unit
```

The version-1 save contains every column, including original blocked time and audit
columns, ordered by node identity. `save` exclusively creates a new file and refuses
an existing destination without changing its bytes; choose a fresh path for each capture.
Recovery requires an existing readable database;
it never creates a missing database. `remove` refuses a stale save before deleting
anything. Keep the save until restoration has been verified. After applying the
forward migration on a compatible release:

```sh
DB_PATH=/data/wbs.db bun run src/step-blockage-rollback-cli.ts restore /data/step-blockages-<date>.json
```

`restore` requires an empty blockage table, including when the saved and existing
facts address disjoint nodes. It validates the file before opening a transaction,
and foreign keys and ownership triggers refuse removed work items, removed steps,
parents and project mismatches. The whole restoration commits or none of it does.
Any failed recovery must be completed with the relevant command above before
repeating the deploy; do not drop the guarded table manually.

Before enabling the feature, inventory historical parent-owned `step_progress`,
retain those statements in compatible reads, and repair affected plans explicitly.
Drain incompatible writers before enabling blockage writes: older structural writers
can invalidate node ownership during a blue/green overlap. New blockage command
history must also be covered by rollback compatibility when that command family is
enabled; the persistence checkpoint alone is not a deployable feature.

## Backend writer barrier recovery

Every Compose `be` swap has an attended outage window. Before stopping a writer, the executor checks registry/pull, environment, existing SQLite integrity and ledger, Caddy/exposure state and effective merged Compose configuration. The candidate's image/name must match, its network aliases may name only its own colour, and published ports, dependencies, external links and unresolved env files refuse. A private resolved JSON snapshot preserves exactly the checked environment and mounts. Startup uses that snapshot with `--force-recreate --no-deps --pull never`; an unchanged stopped idle container must never be restarted with a dynamically retained `be-01.internal` alias.

The candidate database is resolved through its writable directory bind and canonical host directory plus filename. The main DB, `-wal`, `-shm` and `-journal` must share that mapping; main-file binds, sidecar shadows, renamed main-file symlinks and redirected/dangling sidecar links refuse before any writer stops. Outgoing and idle `Config.Env.DB_PATH` values are independently resolved through their Docker `Mounts.Destination` mappings and must identify that same file. A `/data` source mounted only at `/unused-backups` is not database proof. Missing/ambiguous environment, missing destinations, filename mismatch, unrelated live mounts and unreadable paths refuse before stop intent. Unmanaged writable mounts overlapping the database/data root refuse without receiving stop commands; read-only mounts remain permitted.

The exclusive private files under `/home/puni1/wbs/state` are `be-writer-stop.json`, `be-writer-migration.json` and `be-writer-exposure.json`. Stop intent records exact outgoing and existing idle IDs before either is stopped. Both inspect as stopped, unpaused and not restarting; the complete identity/database inventory is checked again. The incoming digest first passes independent fact/replay admission in network-none one-offs with the production directory mounted read-only while every previous writer is stopped. Each stored probe copies the quiescent main file and any retained WAL/journal into a private writable container scratch directory; source SHM is excluded, and SQLite creates scratch SHM. This handles clean WAL closure with absent sidecars and retained WAL without modifying production files. Absence of optional WAL/journal is explicit; unreadability refuses. The source must remain quiescent throughout copying; an incompatible digest refuses before boot. **Possible writer exposure is durable before candidate startup**, because application boot can write or listen even before health and shared-alias grant. Migration capture identity is separately durable before migration. Fact/replay admission, backup, migration, health, final admission and backfill precede the gateway shared alias and Caddy route switch. Only recorded commit removes interruption files; ordinary retries refuse any retained, malformed or unreadable marker. Phase writes do not replace them.

Keep automation paused and preserve markers, migration capture, snapshot and failure output off-host. Candidate start/health/migration failures retain possible exposure, do not automatically stop/reverse the candidate, and never authorize down recovery, old snapshots or incompatible old-writer restart. An exposure file that exists, is unreadable, is malformed, or whose absence cannot be proved always means possible exposure. Recover by preserving current writes and admitting a compatible image under an explicit operator decision. The captured applied set remains evidence; it is not authority to discard post-boot writes. A committed state whose marker cleanup failed also requires checking actual routing and recorded state before marker removal.

Only with proved absence of boot exposure may the operator consider restoring the stopped previous backend. The candidate must never have started; verify its absence/stopped identity, the unchanged migration ledger, and every fact/replay requirement. Migration metadata or evidence of candidate boot contradicts that pre-boot recovery classification and requires a reviewed recovery decision. Do not recompute a replacement digest to admit edited capture bytes or remove a marker to bypass an ordinary deploy refusal.

The following read-only proof takes the deploy lock, proves all managed database writers stopped, resolves their actual database identities, and compares independent candidate fact/replay inventories with the proposed previous immutable image. It never reverses schema, restarts a writer, restores a snapshot or clears a marker:

```sh
bun /home/puni1/wbs/bin/swap.js be --check-backend-recovery \
  --previous-image=<previous-registry-ref@sha256:64hex> \
  --image-be=<candidate-registry-ref@sha256:64hex> \
  --database-path=/data/<actual-db-name>
```

Step blockage facts and nested move/deletion replay capabilities are cumulative obligations. Fact save/remove cannot erase journal compatibility. Proof success grants no restart; before any explicitly approved restart, the operator must also prove the retained schema/ledger compatible and account for every post-boot write. Verify resulting health and Caddy routing before a reviewed marker-completion action.

The disposable Docker regression is `bunx nx run tool-remote-scripts:test:backend-recreation`. It requires the pinned Alpine image named in the proof script already installed, uses a unique project/network and scratch bind only, and verifies complete cleanup. It reproduces dynamic idle aliases and proves forced recreation, no dependency starts, and literal environment preservation.

`/internal/forward` remains a pure acknowledgment endpoint; setter, import and activation-shaped frames confer no write or deploy authority. SQLite StepBlockage activation remains a separate durable application boundary. This Compose barrier does not activate it.
