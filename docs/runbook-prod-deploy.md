# Runbook — deploying prod

This runbook covers the Compose-era image-based blue/green deploy on h2puni, unchanged by the
source-run dev work. The Kubernetes release transaction is [WBS deployment on k3s](infra/deployment.md).
Orientation lives in `LLM_README.md`.

## The build host, as provisioned on 2026-08-05

Three things had to exist before any command below could run. All three are in
place; each failed in its own way first.

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

The env root is `/home/puni1/wbs` (moved 2026-08-04 from `/srv/wbs`). `/srv/wbs` is a stale
rollback copy: its `.env` and `bin/swap.js` are still readable, but reading or editing them
changes nothing.

From an arm64 Mac instead, prepend a tunnel to prod's engine (QEMU otherwise):
`ssh -f -N -L 8081:127.0.0.1:8081 h2puni` and `export _EXPERIMENTAL_DAGGER_RUNNER_HOST=tcp://127.0.0.1:8081`.

Dagger builds `linux/amd64` → self-hosted registry (the only build/deploy contract) → swap starts the
idle colour for gateway/frontend, health-gates, repoints Caddy, drains WS, stops old, runs smoke. Backend swaps stop and prove every managed old writer before candidate startup, then gate migration, health and compatibility before any alias or routing exposure. `--dry-run` is default.
It **refuses** on a dirty tree, a stale `release.json`, or an unbuilt executor bundle — those are the
safety gates, not bugs. `deploy` builds the bundles itself via `dependsOn`.

`swap.js` takes **one tier list per run**, not one tier per invocation:
`bun bin/swap.js be,gw,fe --image-be=… --image-gw=… --image-fe=… --sha=… --execute`. That is what
keeps the deploy lock held across the whole run. The installed `/home/puni1/wbs/bin/swap.js` must
be reinstalled after this change or `assertBundleInstalled` will (correctly) refuse.

`--version`, `--since` and `--skip-build` are **refused** — they were parsed and ignored
until 2026-08-04, so `--version=v1.2.3` read as a rollback and deployed HEAD instead.

**Step-code backfill.** A `be` swap ends with `backfill-step-codes`, after `stop-blue` and before alias/routing exposure and `commit`. It runs `bun run src/backfill-step-codes-cli.ts` in the new colour, which codes every
step an older release inserted without a code. If it fails, candidate boot has already established possible exposure: the executor retains the candidate and current writes, keeps the outgoing backend stopped, preserves interruption markers, and does not commit. The error names the manual command,
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

These steps apply to the first deploy of the product over the pre-product release `0afc7775`,
whose database should hold only `20260426171432_talented_smiling_tiger`. They cover what the swap
cannot check for itself.

**Environment files.** `startGreen` refuses a swap whose env files lack a key the release
requires or hold a value its loader would reject: a non-integer `PORT`, an unknown `LOG_LEVEL`, a
secret shorter than 32 characters, or a callback off `/api/auth/okta/callback`. It names each key,
file and rule, never a value. Write values bare. A quoted value or one containing ` #` is refused,
because Compose would strip the quotes or the comment. Nothing is written or started before the
check (`assertTierEnvComplete` in `tools/tool-remote-scripts/src/lib/docker.ts`). Each file must
hold:

| File                                  | Keys                                                                                                                                                                                                                                                                                                |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/home/puni1/wbs/be-01.env`           | `PORT`, `LOG_LEVEL`, `GW_URL`, `DB_PATH`, `AUTH_MODE=oidc`, `AUTH_METHODS` (`none` until activation), `BROWSER_SESSION_AUTHORITY=enabled\|disabled`, `ORGANIZATION_DEFAULT_MAX_AGENT_PERSONS`, `ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS`, `ORGANIZATION_DEFAULT_MAX_CAPACITY_UNITS_PER_RESOURCE` |
| `/home/puni1/wbs/gw-01.env`           | `PORT`, `LOG_LEVEL`, `BE_URL`, `AUTH_MODE=oidc`                                                                                                                                                                                                                                                     |
| `/home/puni1/wbs/.env`                | `INTERNAL_AUTH_SECRET`, `JWT_SIGNING_KEY_CURRENT` (at least 32 characters each)                                                                                                                                                                                                                     |
| `/home/puni1/wbs/oidc.env` (mode 600) | `AUTH_ISSUER_DISCOVERY_URL`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`, `AUTH_REDIRECT_URI`, `AUTH_AUDIENCE`                                                                                                                                                                                           |

`BROWSER_SESSION_AUTHORITY` has no default: `enabled` commits logout, refresh and replacement through the shared durable browser lifecycle and reads the organization cookie; `disabled` keeps the legacy browser routes (see `bootBe01`). Switch deployed backends to `enabled` before fe-01's production bootstrap moves to server sign-out.

The three `ORGANIZATION_DEFAULT_*` keys have no default either: they are the caps every organization without its own `organization_limits` row holds, each an integer from 0 to 1,000,000 (`wbs-organization-limits` L7). The starting values are agents 50, claims 200, capacity units 10,000; `configure.sh` writes those. A `be-01.env` written before them refuses the swap preflight, and be-01 refuses to boot naming the missing key.

The order matters in both directions, because the installed swap bundle checks this file against its own lists:

1. **First** install the new bundle: `bunx nx run tool-remote-scripts:install --execute`. The old bundle's allowlist (`assertTierEnvAllowed`) refuses any key it does not know, so adding the three keys before this blocks every be swap.
2. **Then**, before the first swap to a release carrying `wbs-organization-limits`, add the three lines to `/home/puni1/wbs/be-01.env`. The new bundle's completeness check (`assertTierEnvComplete`) refuses a file without them.

`20261022130000_add_organization_limits` is additive; its `down.sql` refuses while any organization holds its own row.
`20261022130100_widen_organization_audit_organization_limits` is a compatible rebuild of
`organization_audit` that keeps every earlier action; its `down.sql` refuses while any
`organization_limits_changed` row exists.

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

**Restore and migration evidence.** Backend failures after durable stop intent require the attended recovery procedure below. They never automatically reverse migrations, stop a potentially exposed candidate, restart the older writer, or restore a snapshot. A pre-migration snapshot and capture are evidence. After possible boot exposure, restoring the earlier snapshot would discard candidate writes and is forbidden by the ordinary swap recovery procedure. Preserve current database files and interruption evidence before any recovery decision. Gateway/frontend retain their existing pre-reload cleanup.

Before forward migration, swap captures the complete applied set in an attempt-specific private file under `/home/puni1/wbs/state`, verifies copied bytes, and records capture identity durably. Capture refuses when the incoming image lacks an applied migration or carries changed migration bytes. Ship every applied migration unchanged; never reformat historical migration.sql. An absent, unreadable or changed capture is not authority to reverse the schema. The exact-set down CLI's capture-file, capture-sha256, target, attempt and candidate fields protect capture integrity, but passing those fields does not prove a downgrade preserves post-boot writes. The stopped-writer flow does not execute down or print an authorized down command.

An explicitly authorized disaster recovery must first account for every write since the proposed snapshot, prove all writers stopped, and review schema, captured ledger and fact/replay compatibility for the chosen immutable image. Restoring a snapshot, changing Caddy routing, restarting older containers or clearing interruption markers requires that separate reviewed recovery decision. The `--to=<baseline>` commands below belong to explicit data-removal workflows; they are not swap abort recovery.

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

## Fleet credential links

Link or unlink a fleet's machine-to-machine credential in the live colour; the
flags, scopes and refusals are in
[fleet credentials](auth-integration.md#fleet-credentials):

```sh
docker exec be-01-<colour> bun run src/link-credential-cli.ts --issuer=<iss> --subject=<sub> --account=<id or username> [--person=<id>]
```

## Team claims swap window and rollback

**Swap window.** While the outgoing be-01 still serves beside a green that holds claims and
fleet pins, the outgoing binary does not know either. Its confirmed `deletePerson` of a person
green pinned a credential to fails on the `external_identity.person_id` foreign key, and its
`removeStep` of a step green claimed fails on `claim.step_id`: both answer 500 and write
nothing. An outgoing fe-01 shown a green usage carrying a `claim_released` effect fails that
arm's validator and shows the refusal. Those three fail closed; retry after the swap commits.
One does not: the outgoing be-01's confirmed `deletePerson` of a person who holds claims but
has no pinned credential succeeds, and the `claim.person_id` cascade takes those claims (and
every claim delegated under them) with no `in_use` refusal naming them and no revision moved
on their work items. Rule: no person deletions during the swap window.

Claim occupancy (`20261020130000_add_claim_occupancy`) is lost the same silent way, never
overcommitted by WBS's own check: an outgoing-colour claim writes no `claim_occupancy` row, so
its leaf holds nothing and every later claim on that leaf copies the empty vector until all of
them are released; an outgoing-colour redo of a claim, or undo of a release, re-adds the claims
without their rows. Rule: no claim redo, and no release undo, from the outgoing colour during
the swap window. After a rollback to the older image the table stays but nothing reads or
writes it: claims made or put back there hold nothing and check no capacity, and a release
there drops its rows by cascade. `migrate-down-cli.ts` below this migration refuses while any
row exists; release the claims that hold units first, and the occupancy is gone with them.

Plan documents (`wbs-resources`, version 10) cross the window one way only. A file green
exports is version 10; the outgoing be-01 knows versions 1 to 9 and refuses it loudly at
`POST /api/projects/import` with 400 `unsupported_version` at `document.version`, importing
nothing. A version 9 file the outgoing colour exports imports into green, carrying no
resources, capacities or demands. Rule: during the swap window, import a green export only
into green; after a rollback, re-export from the older image rather than importing a v10 file.

**Rollback.** `migrate-down-cli.ts --to=<the migration before 20261019120000_add_claim>`
runs each down in its own transaction, newest first: it reverses the two binding migrations
(`20261019130100_add_external_identity_person`, `20261019130000_add_person_account`, each
refusing while a credential is pinned or a person is bound) and only then refuses on
`add_claim` while any claim exists. A refused run therefore leaves the bindings already
removed; release every claim first, then rerun.

## Table-guarded rollbacks

Five features share one rollback shape: their down migration refuses while the feature's table
holds rows, and a container-local CLI saves, removes and later restores those rows losslessly.
The table names each feature's migration, CLI, save file and refusal; the rules after it carry
what differs.

| Feature                                                            | Migration                                   | CLI (`src/…`)                            | Save file                                  | Down refusal                                           | Code-rollback guard                           |
| ------------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------- | ------------------------------------------ | ------------------------------------------------------ | --------------------------------------------- |
| <a id="typed-dependency-rollback"></a>Typed dependency             | `20260927213000_add_typed_dependency`       | `typed-dependency-rollback-cli.ts`       | `/data/typed-dependency-<date>.json`       | `CHECK constraint failed: typed dependencies exist: …` | `relationship-types-cli.ts`                   |
| <a id="work-item-status-facts-rollback"></a>Work item status facts | `20260928200000_add_work_item_status_facts` | `work-item-status-facts-rollback-cli.ts` | `/data/work-item-status-facts-<date>.json` | `CHECK constraint failed: work item holds exist: …`    | `readiness-kinds-cli.ts`, `hold-kinds-cli.ts` |
| <a id="space-rollback"></a>Space                                   | `20260929100000_add_spaces`                 | `space-rollback-cli.ts`                  | `/data/spaces-<date>.json`                 | `CHECK constraint failed: spaces exist: …`             | none needed                                   |
| <a id="project-rank-rollback"></a>Project rank                     | `20260929180000_add_project_rank`           | `project-rank-rollback-cli.ts`           | `/data/project-ranks-<date>.json`          | `CHECK constraint failed: project ranks exist: …`      | none needed                                   |
| <a id="step-node-attempt-rollback"></a>Step node attempt           | `20261012120000_add_step_node_attempts`     | `step-node-attempt-rollback-cli.ts`      | `/data/step-node-attempts-<date>.json`     | `CHECK constraint failed: step node attempts exist: …` | `attempt-outcomes-cli.ts`                     |

**Code rollback.** Where the table names a guard CLI, the `be` swap's `stored-vocabularies` step
compares the values the incoming binary reads through that CLI with the values stored, before
migration and again after stopping the outgoing colour. An older image without the CLI reads
none, so any stored value refuses it and the error lists each value and its count. Redeploy a
release that reads them, or save and remove the rows with the commands below and rerun the
deploy. Where the guard is "none needed", the older image has no routes for the feature and its
tables are inert to it.

**Schema rollback.** Rolling back past the migration refuses while its table holds rows: the
older release cannot read them, and `down.sql` will not drop them silently. Run the procedure
inside the incoming container after its writers have stopped, with the same `DB_PATH`, replacing
`<cli>` and `<file>` with the table's values. Save, then copy the file off the host and keep it
secure:

```sh
docker exec be-01-<colour> bun run src/<cli> save <file>
```

Remove only after the save is secure. Remove refuses unless the saved rows match the table
exactly, every column included:

```sh
docker exec be-01-<colour> bun run src/<cli> remove <file>
docker exec be-01-<colour> bun run src/migrate-down-cli.ts --to=<baseline>
```

After a later forward migration or redeploy, restore. Restore refuses the whole set when a row
no longer fits, for the reasons listed per feature below:

```sh
docker exec be-01-<colour> bun run src/<cli> restore <file>
```

### Per-feature rules

- **Typed dependency.** The table is `typed_dependency`. The guard compares the incoming binary's supported types with the shared
  database before migration, then again after migration and health while the outgoing colour
  remains stopped, before shared-alias/routing admission. Candidate boot is already possible
  write exposure. An older image without `relationship-types-cli.ts` is treated as FS-only. A
  pre-boot compatibility failure leaves the candidate unstarted and the older writer stopped with
  interruption state retained. A post-boot failure retains the possibly exposed candidate and
  current writes, keeps the older writer stopped, preserves interruption state, and does not
  commit. Redeploy a release that understands those types, or stop all typed-dependency writers
  and use a compatible container to `save` and `remove` the rows, then rerun the code deploy; no schema rollback is needed for this case. After deploying a
  compatible reader again, `restore` them. Restore refuses if any endpoint no longer fits its
  project or work-item shape.
- **Typed dependency, known and deliberate: a reader-only release refuses SS/FF loudly.**
  Releases built after round 25 (#181 Fast, #182 solver) but before the SS/FF writes and UI
  (#183, #190) report `["FS","SS","FF"]` from `relationship-types-cli.ts`, so the swap guard admits
  them over a database that holds SS/FF rows. Fast and the solver schedule those rows correctly,
  but two readers in that release still accept only FS: the plan export
  (`plan-document.resource.ts`) throws `unknown typed dependency type SS`, so
  `GET /api/projects/:id/export` returns 500 for that project; the fe chart
  (`plan-chart-input.ts`) throws `GanttDataError: unsupported chart dependency SS`, so the chart
  shows its fault boundary for that project. Projects without SS/FF rows are unaffected. This is
  "refuse loudly" rather than a silent FS reading, so it stays. To fix it, roll forward to a
  release that includes #190. If the older release must serve those projects, `save` and `remove`
  the typed rows.
- **Work item status facts.** The guard compares the readinesses and hold kinds stored in
  `work_item`. An older image would schedule held work as if nothing were held, or give a ready
  leaf a child the status read then refuses (ADR 0032). Only holds guard the down migration;
  readiness is dropped without a guard, as fact dates are. Restore refuses if a saved work item is
  gone or has become a parent.
- **Space.** Dropping the `space` and `space_project` tables would lose every space and its order.
  Remove compares every stored space and member. Restore refuses, naming the space, when a saved
  organization is gone, a saved project is no longer owned by its space's organization, the
  organization already holds a space of that name, or an author is no longer a user.
- **Project rank.** Dropping `project_rank` would lose every organization's project order. Restore
  refuses, naming the project, when a saved project is no longer owned by its organization or an
  author is no longer a user.
- **Step node attempt.** The guard compares attempt outcomes stored in `step_node_attempt`; any
  ended attempt refuses an older image, and a database with no attempts, or only running ones,
  passes. The down refusal leaves the table and its ledger row in place; `<baseline>` is the
  migration below it. The project timezone is dropped without a guard: it is a planner's setting,
  lost as readiness is. `save` refuses on a database the attempts migration never reached. The
  save file (format version 2) holds every attempt and every node's issued-number mark
  (`step_node_attempt_issued`), which `down.sql` drops without a guard; the CLI prints both
  counts, e.g. `step node attempts saved: 3, marks: 2`. `remove` refuses unless the saved attempts
  and marks equal both tables column for column, then deletes both. Restore brings back numbers
  and marks, so no node issues a removed number again; it refuses the whole set if a saved
  attempt's work item is gone or has become a parent, a saved mark's work item is gone, or a saved
  step is gone, and it refuses a version-1 file.

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

Migration `20261014140000_add_step_blockage_activation` initializes a constrained
singleton writer admission marker to `DISABLED`. Restart preserves that state.
Direct facts remain readable and exportable, but insert, update and delete,
including nonempty document v9 import and blockage-aware undo or redo, refuse
`step_blockage_inactive`. Empty import remains usable. Boot and readiness require
valid marker state, the admission migration and all three exact writer triggers.
The image-local receipt boundary is described under [Step blockage writer activation](#step-blockage-writer-activation); activation remains an attended host operation.

The admission migration's `down.sql` refuses retained facts and relevant nested
forward/inverse journal history or `moveProgress` preconditions, including empty
snapshots. It retains its schema and ledger on refusal. The lossless recovery
file protocol below is preserved, but `remove` and `restore` also reach writer
admission and refuse on a disabled database. Operational removal or restoration
on that database is blocked until stopped-writer recovery integration is available;
do not bypass the marker or drop its triggers. `save` remains a readable capture.
The commands below describe the existing recovery protocol for databases whose
writer admission already permits those writes; they do not enable a disabled
marker or dispose of retained journal history.

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

## Step blockage writer activation

Migration `20261015100000_add_step_blockage_activation_receipt` adds receipt authority without enabling writers. Its down migration refuses an ENABLED marker, any retained receipt, or malformed marker authority, including an enabled database with no facts. A disabled database with no receipt can reverse this migration. Image-local inspection and activation also require the exact constrained receipt table, even when it is empty; a matching ledger does not admit a missing, weakened or view-substituted schema. Never disable the marker or delete a receipt to bypass rollback admission.

Activation requires two separate releases/windows. First deploy a capable release in preserve-only mode and prove the routed image and a retained rollback release both understand `step_blockage_activation_v1`. Later perform attended activation with those independently observed immutable images. An empty blockage table does not remove an ENABLED database's capability obligation. Kubernetes deployment remains preserve-only: its first-start must still observe DISABLED and cannot perform activation.

Ordinary Compose deployment records the outgoing container ID, its digest-pinned image reference and its immutable local image ID before writer stop. The pinned reference must resolve to that same image ID. After the outgoing container stops, deployment re-reads and compares the association before running compatibility admission with the captured rollback digest and the separate candidate digest. Missing or changed identity refuses before maintenance, migration or application exposure; after stop, all interruption evidence remains retained. The candidate cannot stand in for the outgoing rollback image. Both images must independently support every stored vocabulary before maintenance, including relationship types, holds, readiness, capacity modes, attempt outcomes, direct blockages, replay/admission capabilities and estimate units. The candidate check is required even while activation is DISABLED and no activation capability obligation is present.

A genuine first install records an explicit absent predecessor. It requires no existing managed backend writer at preflight or read-only admission, a capable candidate, and coherent pre-marker or DISABLED database authority. ENABLED authority requires a rollback image. An existing backend under either colour prevents first-install classification.

The image's existing `src/step-blockage-replay-kinds-cli.ts` advertises `step_blockage_activation_v1` alongside its journal capabilities. Compose and Kubernetes independently inventory activation authority with coordinator-owned read-only SQLite code. A valid ENABLED marker and exact receipt contribute `{kind:"step_blockage_activation_v1",count:1}` even when both fact and journal inventories are empty. Candidate and rollback image observations must come from each exact digest's own CLI; a coordinator constant is not image evidence. The existing read-only Compose `--check-backend-recovery` proof checks both images for this obligation and leaves writers stopped and interruption markers retained. Kubernetes carries the same obligation in its sealed deployment admission receipt.

A successful preserve-only deployment while DISABLED does not prove that either image advertises the activation capability. Before later activation, retain positive CLI observations tied independently to the routed immutable digest and the retained rollback digest. The attended host coordinator requires those observations even when the database is still DISABLED, before starting maintenance or publishing activation intent.

A coherent database predating the marker migration contributes no activation obligation only when its existing readable migration ledger records neither activation migration, and no marker/receipt schema object or admission trigger remains. Partial authority refuses. A valid pre-receipt DISABLED marker is also compatible with the preserve-only rollout; deployment then applies the additive receipt migration through its existing maintenance phase. Neither classification changes runtime boot or image-local receipt inspection, and neither skips fact or journal admission.

The image contains `src/step-blockage-activation-cli.ts`. Its `inspect` command opens an existing database read-only and reports `{state,receipt}`. Its `activate <receipt.json>` command is a primitive for the fenced host coordinator. It neither establishes stopped writers nor proves the supplied image/database identities. Use the fenced Compose operation below for activation. Calling this primitive manually does not establish its host prerequisites.

A version-1 receipt has exactly these fields: `protocol` (`step-blockage-activation`), `version` (`1`), nonempty `activationId`, immutable `candidateImage` and `rollbackImage` digest references, nonempty canonical host `databaseIdentity`, and nonnegative safe integer `activatedAt` milliseconds. The host creates this identity after fencing and validation, durably records it before invocation, and requires exact readback before any application exposure. Persisting the receipt and changing DISABLED to ENABLED share one IMMEDIATE transaction. Identical retries return the existing receipt; conflicting retries refuse. Legacy ENABLED without a receipt cannot be attributed to an attempt and refuses inspection/activation through this boundary.

### Attended Compose activation

1. Deploy the capable backend release through the ordinary preserve-only deployment first, without `--activate-step-blockage`. Confirm the receipt migration is applied and authority remains DISABLED. Complete and review that release before the activation window. Ordinary deployment never calls the activation primitive.
2. Pause deployment automation and arrange the backend outage window. Retain the routed outgoing container and its immutable image as the rollback release; both that image and the activation candidate must independently advertise `step_blockage_activation_v1`. A first installation cannot activate. Review the exact candidate digest and its matching release commit through the normal release process. Do not substitute a mutable tag or delete the outgoing container.
3. From the production deployment root, run the installed executor with the reviewed digest and matching SHA. The placeholders below must be replaced by those reviewed identities:

   ```sh
   cd /home/puni1/wbs
   bun bin/swap.js be --image-be=<registry/name@sha256:digest> --sha=<release-sha> --execute --activate-step-blockage
   ```

   The flag admits only `be` with `--execute`; multi-tier runs, preflight and backend-recovery modes refuse it. The executor holds the normal deployment lock for the entire transition. It captures and stops the exact outgoing/idle writers, inventories every stored vocabulary against both images, separately requires the activation capability from both images even while DISABLED, and runs the candidate's read-only receipt inspection against a private SQLite-family copy. Inspection must already report exactly `{state:"DISABLED",receipt:null}` before maintenance/migration; missing prior receipt migration refuses the activation attempt rather than installing and activating it in one first release.

4. The executor uses the validated inert maintenance container for backup and migration. Before activation it rechecks the maintenance configuration/image/container, stopped outgoing writer, rollback image association, canonical database identity and complete writer inventory. It exclusively publishes and syncs `state/be-writer-activation.json`, containing the exact receipt, writer identity and maintenance ID, and reads those bytes back before invoking the image-local CLI. Each activation/readback execution repeats the identity fence. The command response must equal the attempted receipt, and a separate `inspect` must report ENABLED with that exact receipt before maintenance stops and application exposure begins.
5. On successful application exposure and the normal deployment commit, the executor removes the activation intent together with the stop, maintenance, migration and exposure markers. Retain the deployed release and a capable rollback image.

### Activation interruption

Preparation (both image probes and prior receipt inspection) and activation (identity fences, intent publication/readback, transfer, mutation and committed inspection) each have a 60-second total operational budget. Fences include mount and namespace observations; each repeated call shares its phase deadline. The selected budget still requires representative-host timing evidence and is not a whole-deployment SLA. A timeout aborts the local Docker client, but daemon-side execution may still complete; it never proves SQLite remained unchanged. A late publication may leave its intent after timeout. Neither event resumes the sequence or authorizes retry.

A failed command, failed intent publication/readback, identity drift, or missing/malformed activation readback leaves completion uncertain. An activation marker by itself also blocks ordinary retry; the executor does not generate a replacement attempt over retained evidence. Preserve all host intents, pinned image/database/container identities, snapshots and current database bytes. Keep application writers stopped, the inert maintenance identity retained, and automation paused until an attended recovery decides how to reconcile the exact receipt. Preserve `be-writer-activation.json` alongside all existing stop, maintenance, migration and exposure markers, including any markers whose writes may have completed before an interruption. Record the exact attempted activationId, receipt fields, maintenance/container/image identities, canonical database path and migration-capture hash. Read-only inspection through the retained capable image can establish current authority, but it grants no authority to clear markers, restart writers, expose applications or roll back. Recovery is attended; no automatic activation-resume or deactivation operation exists. Never infer DISABLED from a transport failure, restart an incompatible writer, or automatically reverse the migration after an activation attempt.

## Dependency binary capability prerequisite

Compose independently runs the exact candidate and retained rollback backend
images' `src/dependency-capabilities-cli.ts` before recording writer stop intent,
and repeats those observations through backend recovery admission. The probes are
DB-free, use `--pull never --network none`, and share a 15-second deadline. Missing,
unreadable, failing, stalled or malformed CLI refuses; an older image lacking the
CLI cannot be used as either candidate or rollback. First installation probes only
the candidate. Explicit empty semantics is a valid binary observation.

The Kubernetes release coordinator now runs both exact backend image capability
executables after F6 admission, before Flux suspension or writer interruption.
Every resumed forward or rollback execution refreshes admission and runs two new
Job/Pod-attributed probes, even for equal image digests. Missing, unreadable,
failing, malformed or timed-out output refuses with the existing journal and
serving state retained; no generic rollback, schema, tier or controller cleanup
runs. Lease claim/renewal and F6 admission are the only coordination changes before
refusal. Inspect the retained journal and observation artifacts in the configured
state directory; these observations grant no recovery or activation permission.
Kubernetes dependency store admission and semantic exposure remain open work.

After every known writer is stopped, shared recovery admission runs the coordinator's
strict dependency inventory against a private SQLite main/WAL/journal copy. The
source bind is recursively readonly/private. Neither image's activation inspector
supplies authoritative store evidence. The scanner requires both dependency
migration identities, a well-formed unique name/hash ledger, actual tables, exact
constrained marker/receipt schemas, all three exact admission triggers, exactly one
DISABLED marker, no receipts and no external relationships. ENABLED always refuses,
including an empty store and images advertising support.

A fresh scan runs after maintenance stops and before durable application exposure.
It first resolves the complete SQLite family again, verifies the retained rollback
image association, inventories exactly the outgoing and replacement maintenance
containers (maintenance only on first installation), and independently proves each
stopped. A successful earlier observation cannot substitute for this scan.

Historical stores without both dependency migrations refuse, even if otherwise
coherent. This path cannot bootstrap an older store or a missing first-install
file; a historical compatibility adapter needs separate specification and proof.
Refusal after durable stop intent retains current bytes, migration capture and
interruption evidence under the [attended recovery procedure](#backend-writer-barrier-recovery).
Standalone inspection grants no restart or marker clearance authority.

Task 10.2 remains open for complete semantic participant exclusion, activation and
Kubernetes semantic admission. Writer inventory permits readonly readers and does not
fence gateway/MCP/browser participation; a successful dormant observation grants no
dependency rollout, activation or downgrade permission.

## Backend writer barrier recovery

Every Compose `be` swap has an attended outage window. Before stopping a writer, the executor checks registry/pull, environment, existing SQLite integrity and ledger, Caddy/exposure state and effective merged Compose configuration. The candidate's image/name must match, its network aliases may name only its own colour, and published ports, dependencies, external links and unresolved env files refuse. A private resolved JSON snapshot preserves exactly the checked environment and mounts. Startup uses that snapshot with `--force-recreate --no-deps --pull never`; an unchanged stopped idle container must never be restarted with a dynamically retained `be-01.internal` alias.

The candidate database is resolved through its writable directory bind and canonical host directory plus filename. The main DB, `-wal`, `-shm` and `-journal` must share that mapping; main-file binds, sidecar shadows, renamed main-file symlinks and redirected/dangling sidecar links refuse before any writer stops. Outgoing and idle `Config.Env.DB_PATH` values are independently resolved through their Docker `Mounts.Destination` mappings and must identify that same file. A `/data` source mounted only at `/unused-backups` is not database proof. Missing/ambiguous environment, missing destinations, filename mismatch, unrelated live mounts and unreadable paths refuse before stop intent. Unmanaged writable mounts overlapping the database/data root or sharing a main/WAL/SHM/journal file device and inode refuse without receiving stop commands. Distinct writable regular files can be proved unrelated. Every unmanaged container with mounts requires a stable actual private PID/mount namespace audit, including nested writable mounts hidden beneath a Docker-inspected read-only mount and writable mounts on a SQLite-family device. A fresh bind of Docker `Mounts.Source` is insufficient: a running container can retain a replaced source or a private submount. A stopped unmanaged container with mounts refuses with its exact ID and requires operator review/removal; containers with no mounts remain irrelevant.

The actual namespace audit runs fixed metadata-only code through exact-ID `docker exec`, using explicit `/bin/busybox sh` for both supervisor and scanner. It adds no capabilities. Audited running targets must have Docker `init: true`, a private PID namespace, `Privileged=false` and no added capabilities; missing tools or unsupported target configuration refuse before writer stop. A fresh Source rebind and the earlier DAC_READ_SEARCH-only proc-root helper are insufficient: default-cap Caddy/registry deny that helper's proc-root access. See [ADR 0054](adr/0054-compose-audits-run-in-initialized-containers.md).

**Attended prerequisite:** updating `deploy/compose/base.yml` to `init: true` recreates Caddy and registry, causing ingress/registry interruption. Backend tier rendering also requires init; an already-running older backend without it must be prepared during maintenance. Review immutable images, retained data/volumes, networks and routes, and apply the resolved Compose configuration during that window. The swap never performs this maintenance automatically. Keep blockage activation disabled until the prerequisite and release review are complete. If backend interruption evidence already exists, follow the pinned recovery procedure below; applying init does not authorize an older writer restart or schema reversal.

Before the window, record exact IDs and inspect `HostConfig.Init`, `HostConfig.Privileged`, `HostConfig.CapAdd`, `HostConfig.PidMode` and mounted sources/destinations. After the attended recreation, verify the new identities, `Init=true`, default capabilities, unchanged volumes/networks, ingress and registry health, and the routed backend's immutable image. Run the guarded swap only after these checks. No live maintenance was performed by this change.

The source view is **code-read-only**, not a filesystem-enforced read-only mount. Immutable shell programs invoke only metadata reads, never write APIs or application code. A supervisor first proves its own PID=process-group=session identity and reports start ticks. It starts one scanner, waits up to 15 seconds for the host's nonce-specific ACK, kills its still-owned group on timeout/EOF/cancel and waits/reaps the scanner on success. Docker init reaps forced descendants. Strict NUL-framed path/device/inode/mode entries, before/after mountinfo, complete counts and reap receipts precede admission; BusyBox find/timeout exit status alone is insufficient and neither is used. Actual writable roots include nested mounts beneath top-level RO and writable mounts on any SQLite-family device. Managed running writers additionally prove the actual main/WAL/SHM/journal family matches the canonical probe family.

The operating boundary is trusted, nonadversarial quiescence: all tasks retain the Docker-created namespace; persistent mounts and aliases remain stable during admission, and no process retains an already-open deleted SQLite alias. The audit proves observed persistent namespace exclusion. It does not claim protection against transient topology/inode ABA, hostile receipt spoofing or private per-process namespaces. Hold registry pushes/garbage collection and filesystem topology changes during the attended audit; required metadata races refuse visibly.

Missing/unreadable or ambiguous mount metadata, special/symlink aliases, malformed/incomplete receipts, unavailable init/tools, more than 100,000 entries, depth over 64, stdout above 32 MiB or stderr above 64 KiB refuse. Every stderr byte is a failure. The complete host operation has a 45-second per-container deadline, reserving its final 20 seconds for bounded exact-group cleanup; each remote supervisor independently has a 15-second deadline. Host abort hard-kills the exact CLI. Cleanup inventories the original group's members in the same exact container and refuses any remaining live or zombie process after bounded convergence. Missing session identity, an unreadable/stalled cleanup or uncertain creation reports the exact container, attempt/group/start context for manual investigation. It never declares an orphan absent without proof. These checks repeat after managed writers stop.

The exclusive private interruption files under `/home/puni1/wbs/state` are `be-writer-stop.json`, `be-writer-maintenance.json`, `be-writer-migration.json` and `be-writer-exposure.json`. Preflight freezes two mode0600, hash-pinned Compose snapshots from one validated resolved application configuration and immutable image. Both retain the exact environment, working directory, database/solver mounts and init prerequisite. Stop intent records both snapshot identities and exact outgoing/idle IDs before either writer stops. Stopped identities and the complete inventory are revalidated, then independent read-only fact/replay one-offs admit the digest against the stopped SQLite family.

**Maintenance precedes application startup.** The maintenance snapshot explicitly replaces entrypoint with `bun -e 'setInterval(() => {}, 60000)'`, clears command, disables healthcheck and sets restart=no. It starts with forced recreation, no dependencies and pull=never. The executor records its exact ID, image ID and snapshot hashes, and inspects running/unpaused/not-restarting identity plus inert entrypoint/command/health/restart, environment, mounts and working directory before database CLI execution. Backup, migration-set capture and forward migration target that exact ID, never the reusable colour name. Capture bytes are published, read back and digested; durable migration intent precedes the forward CLI. After successful migration the exact maintenance ID stops and is independently proved stopped. Only then is application exposure durably recorded and the original application snapshot force-recreated. Actual app boot retains `migrateOnStartup=false` and the StepBlockage admission check; an authentic predecessor cannot boot until its admission migration has run. Health, compatibility readback, backfill and alias/Caddy routing follow. Only recorded commit clears interruption files.

Each stored read-only probe copies the quiescent main file and retained WAL/journal into private writable scratch; source SHM is excluded and SQLite creates scratch SHM. Absence of optional sidecars is explicit; unreadability refuses. Source files must remain quiescent. Phase writes never replace interruption evidence, and ordinary retry refuses every retained, malformed or unreadable marker.

Keep automation paused and preserve database, snapshots, all markers, migration capture and failure output off-host. Recovery has three distinct boundaries:

- No migration intent and no application exposure: prove both marker absences, the candidate/maintenance identities stopped, the unchanged schema/ledger, and all fact/replay compatibility before an attended restart decision. This is never automatic.
- Migration intent/capture without application exposure: the schema may have changed, including a CLI that failed after applying migrations. Preserve the database and original capture/hash, prove maintenance stopped, and review schema/ledger plus compatibility. Absence of application exposure does not authorize automatic down, snapshot restore or an older restart.
- Application exposure present, unreadable, malformed or uncertain: application writes are possible. Preserve current writes and admit only a compatible image under an explicit recovery decision; never automatically down, restore an earlier snapshot or restart an incompatible old writer. Start/health failures retain exposure and do not automatically stop/reverse the candidate.

A committed state whose marker cleanup failed requires actual routing, recorded candidate state and health verification before a reviewed cleanup action. Capture is evidence, not authority to discard post-boot writes. The read-only recovery command below enables neither the disabled SQLite writer marker nor any remove/restore operation.

Only with proved absence of boot exposure may the operator consider restoring the stopped previous backend. The application must never have started; verify its absence/stopped identity, stopped maintenance, the unchanged migration ledger, and every fact/replay requirement. Migration intent or evidence of application boot prevents an unchanged-schema recovery classification and requires a reviewed recovery decision. Do not recompute a replacement digest to admit edited capture bytes or remove a marker to bypass an ordinary deploy refusal.

The following read-only proof requires the pinned candidate image already installed locally (image inspect refuses absence and no command pulls), takes the deploy lock, proves all managed database writers stopped, validates the supplied DB_PATH through the full fixed `/data` family mapping even when no containers remain, resolves actual managed database identities, and compares independent candidate fact/replay inventories with the proposed previous immutable image. It never reverses schema, restarts a writer, restores a snapshot or clears a marker:

```sh
bun /home/puni1/wbs/bin/swap.js be --check-backend-recovery \
  --previous-image=<previous-registry-ref@sha256:64hex> \
  --image-be=<candidate-registry-ref@sha256:64hex> \
  --database-path=/data/<actual-db-name>
```

Step blockage facts and nested move/deletion replay capabilities are cumulative obligations. Fact save/remove cannot erase journal compatibility. Proof success grants no restart; before any explicitly approved restart, the operator must also prove the retained schema/ledger compatible and account for every post-boot write. Verify resulting health and Caddy routing before a reviewed marker-completion action.

The disposable Docker regression is `bunx nx run tool-remote-scripts:test:backend-recreation`. It requires the pinned Alpine image named in the proof script already installed, uses a unique project/network and scratch bind only, and verifies complete cleanup. It reproduces dynamic idle aliases and proves forced recreation, no dependency starts, and literal environment preservation.

`/internal/forward` remains a pure acknowledgment endpoint; setter, import and activation-shaped frames confer no write or deploy authority. The `--check-backend-recovery` operation is read-only and never activates StepBlockage writers. Activation requires the explicit operation described in [Attended Compose activation](#attended-compose-activation).

The Debian backend runtime copies `/bin/busybox` from Docker Official Image
`busybox:1.37.0-musl@sha256:5cec3fc171c87218698e85a52af7087de727372aae264a787b8112901a5b0092`.
The [publisher's image documentation](https://github.com/docker-library/docs/tree/master/busybox)
identifies musl as statically compiled; the extracted amd64 binary is static PIE,
SHA-256 `2c92c1289f3ab36f8b43fb68d3b56b0ec32290f2d6f6bf4ef44df6bd7edc02ad`.
Debian `/bin/sh` is dash and lacks the supervisor's `read -t` behavior.

For an outgoing backend that predates this image dependency, prepare its attended
`init: true` recreation before deployment: record and retain its exact current
application image ID/digest and full effective environment/mount configuration.
Extract `/bin/busybox` from the pinned official image into an operator-owned path,
verify the SHA-256 above and executable mode, and bind that file read-only at
`/bin/busybox` in the recreation configuration. Keep the exact old application
image for this preparation. Review the resolved configuration and outage/recovery
commands before stopping it; recreate it only in the attended window, then prove
health and actual namespace admission. This preparation changes container init
and supplies an audit executable; it is a separate prerequisite to candidate
activation. Do not copy tools into or alter a running outgoing container.

`bun tools/tool-remote-scripts/src/lib/mount-exec-image.rehearsal.ts` exercises
production admission against disposable `wbs-be-01:f8-v1` containers, with the
verified binary extracted to `/tmp/puni-audit-busybox`. It requires Docker access
and that exact cached fixture image; missing dependencies fail. It checks normal
admission, absent binary, restored Debian shell, and the 15-second supervisor
deadline with a stalled scanner/descendant, then removes only its created IDs.

## Dependency gateway fence admission prerequisite

Ordinary image swaps read `state/dependency-gateway-fence.json` under the deploy
lock before observing or planning any tier. Direct executor calls also check
before phase, Docker or configuration effects. This applies to gateway-only,
frontend-only, backend-only and mixed runs. Only an absent marker in a readable,
existing state directory permits admission. Missing/unreadable state,
unreadable/malformed markers, symlink markers (including dangling links), and valid
retained markers refuse with the path. The reader verifies actual directory
readability, including a traverse-only directory; mode bits alone are not the
access authority.
The closed v1 marker has exactly two fields:
`{"format":"dependency-gateway-fence","version":1}`.

Presence is a conservative deployment barrier, not proof of physical gateway
exclusion or semantic activation. Retained `dependency-gateway-intent.json` or
`dependency-gateway-complete.json` also refuses ordinary admission, including an
orphan companion without its marker. The explicit lifecycle below is the only
writer in this packet; it grants no activation or ordinary-swap bypass.

## Managed Compose gateway exclusion

This is an attended, disruptive prerequisite for the environment's two managed
Compose gateway names only. It stops their existing sockets. It does not prove
that every gateway, MCP process, browser, backend or background worker is excluded.
Do not run it as an ordinary deploy or as an activation command. No live execution
has been established by the repository tests.

```sh
bun /home/puni1/wbs/bin/swap.js gw --fence-dependency-gateways --execute --sha=<full-40-hex-git-sha>
bun /home/puni1/wbs/bin/swap.js gw --inspect-dependency-gateway-fence
```

Use the environment's installed bundle and `WBS_ENV` layout. The requested SHA is
provenance, not proof of the installed bundle or image's source revision. These
commands reject mixed tiers, image/preflight/activation/dry-run flags, duplicate
flags and each other. Dispatch happens before ordinary registry/image/plan work;
each command acquires the same environment `state/deploy.lock` itself.

A new attempt requires a canonical, readable, existing state directory and all
three records absent. The executor inventories all containers using unfiltered,
full-ID `docker ps -a`, accounts for every returned inspect identity, and resolves
the two expected managed names. Extra managed names/services, inconsistent Compose
projects, incomplete inventory and unsupported process states refuse. Each managed
member must have a digest-pinned gateway image resolving to its exact image ID,
matching Compose service and nonempty project labels, exactly the environment
network and its full network ID, init enabled, private PID namespace, no privilege
or added capabilities, a complete restart policy, and stable process/start identity.
Old existing containers without these prerequisites require separate attended
preparation; this command never recreates them. Two absent names prove only an empty
managed cohort.

Under that lock the executor exclusively publishes, fsyncs and reads back the exact
v1 two-field marker, then a separate closed/versioned `dependency-gateway-intent.json`.
Intent binds its unique attempt, environment/root/network, requested SHA, both
colour identities or explicit absences, original restart policies and process state.
It reobserves before effects, runs `docker update --restart=no <full-id>` for every
member with full cohort readback after each update, then bounded
`docker stop --time 10 <full-id>` with identity and stopped-state readbacks.
All Docker calls share a 60-second attempt budget; a timed-out local client does
not prove a daemon-side operation stopped or failed.

Before completion it freshly inventories the full cohort and requires stable
image/name/network/label/start identity, unchanged restart count, `Running=false`,
`Paused=false`, `Restarting=false`, PID 0, exited/created status and restart policy
`no` with zero policy retry count. It exclusively publishes and reads back
`dependency-gateway-complete.json`, bound to the attempt and SHA256 of the exact
persisted intent bytes, then freshly proves the same current cohort again.
Inspection validates all records and repeats that complete physical observation;
a completion file by itself is historical evidence only.

A marker alone classifies an interruption before durable intent. Intent without
completion is uncertain. A completion without marker/intent, changed intent bytes,
foreign records, malformed/unreadable state or current Docker drift refuses.
Every failure after marker publication retains existing records and current Docker
state. There is no automatic cleanup, restart, policy restoration, retry, marker
clearance or activation. Keep the three records and inspect exact container IDs
and restart policies with the pinned executor available; recovery requires an
explicit attended compatible procedure outside this packet. Never delete evidence
or restart a previously fenced gateway to make an ordinary deploy pass.

The lock coordinates this deploy executor only. Docker administrators and other
controllers must respect the exclusion interval; a fresh observation is not a
continuous daemon-side lease. Representative Docker timing and a disposable real
Docker/websocket lifecycle proof remain necessary before operational acceptance.

## Managed Compose backend exclusion

This attended disruptive prerequisite stops only the selected environment's
managed blue/green backend containers. First establish and inspect the managed
Compose gateway fence above. Use the installed environment bundle and layout:

```sh
bun /home/puni1/wbs/bin/swap.js be --fence-dependency-backends --execute --sha=<full-40-hex-git-sha>
bun /home/puni1/wbs/bin/swap.js be --inspect-dependency-backend-fence
```

Both commands own the same `state/deploy.lock`; the backend owner invokes the
narrow gateway inspector under its held lock. Mixed ordinary/image/activation/
preflight/dry-run flags and duplicate flags refuse. This operation neither
migrates nor activates semantics. Requested SHA records provenance only.

A fresh attempt requires all `dependency-backend-{fence,intent,complete}.json`
records absent and a nonempty backend cohort satisfying the existing managed
gateway process/image/security/network/Compose prerequisites for backend images.
Every member needs exactly one absolute DB_PATH through a writable directory bind.
Both colours must resolve the same canonical main/WAL/SHM/journal family, main-file
inode and parent-directory inode. File binds, sidecar shadows/aliases and missing
or unreadable trusted paths refuse. Unmanaged writable mounts overlapping that
family's directory refuse, including stopped/restartable foreign containers.
This can require attended preparation of existing containers.

The backend intent retains both colour identities/absences and original restart/
process identity, canonical database identity and exact SHA256 hashes of gateway
marker/intent/completion bytes. Exclusive fsynced/readback publication precedes
restart disable on every exact full backend ID; every update has a complete fresh
readback before any stop. Bounded stops then require unchanged identity/start,
PID zero, stopped state and policy `no`. All Docker calls share one 60-second
budget. Every observation validates gateway and backend cohorts jointly from one
full inventory. Completion binds persisted intent bytes; final fresh joint
inventory and later read-only inspection establish only the observed interval.

Any interrupted publication, orphan/corrupt records, timeout or current-state drift
refuses. Retain all backend and gateway records and current Docker state for
explicit attended recovery. No automatic restart, policy restoration, retry,
cleanup, marker clearance or ordinary deployment bypass exists. A historical
receipt grants no semantic authority. This slice excludes neither MCP, ingress,
browsers, background/host processes nor external Docker supervisors; cooperating
administrators remain an assumption. Continuous participant exclusion and safe
activation remain separate parent tasks.
