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
idle colour, health-gates, repoints Caddy, drains WS, stops old, runs smoke. `--dry-run` is default.
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

**Step-code backfill.** A `be` swap ends with `backfill-step-codes`, after `stop-blue` and before
`commit`. It runs `bun run src/backfill-step-codes-cli.ts` in the new colour, which codes every
step an older release inserted without a code. If it fails, the new colour stays live, the swap
exits non-zero and `commit` does not run. The error names the manual command,
`docker exec be-01-<colour> bun run src/backfill-step-codes-cli.ts`. That command is idempotent:
run it until it prints `step codes backfilled: <n>`, then rerun the deploy to record it
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

| File                                  | Keys                                                                                                      |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `/home/puni1/wbs/be-01.env`           | `PORT`, `LOG_LEVEL`, `GW_URL`, `DB_PATH`, `AUTH_MODE=oidc`                                                |
| `/home/puni1/wbs/gw-01.env`           | `PORT`, `LOG_LEVEL`, `BE_URL`, `AUTH_MODE=oidc`                                                           |
| `/home/puni1/wbs/.env`                | `INTERNAL_AUTH_SECRET`, `JWT_SIGNING_KEY_CURRENT` (at least 32 characters each)                           |
| `/home/puni1/wbs/oidc.env` (mode 600) | `AUTH_ISSUER_DISCOVERY_URL`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`, `AUTH_REDIRECT_URI`, `AUTH_AUDIENCE` |

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

**Restore.** Before `reload`, a failed swap rolls back by itself. After that, restore the
pre-migration backup the swap printed. Stop both be-01 colours first, then run the restore from a
throwaway container of the new image:

For a pre-route `be` abort, swap first captures the complete applied migration set from green,
persists an attempt-specific private file under `/home/puni1/wbs/state`, and reads it back before
running the forward migration. On abort it verifies that the retained and copied bytes still match,
runs `migrate-down-cli.ts --capture-file` in green, and compares the complete final ledger with
the captured set. A zero-exit down command with a different ledger is a rollback failure. The
capture remains on the host after green stops. If rollback fails, use the **exact pinned-image
`docker run` command printed by swap**: it binds that retained capture read-only, binds
`/home/puni1/wbs/data` read-write, and sets the DB_PATH observed from green before migration.
It also passes `--capture-sha256` from the original durable capture; the backend refuses changed
bytes before parsing the file or opening SQLite for reversal. Keep that digest, target, attempt,
candidate and image digest unchanged; inspect the capture and current ledger before retrying.
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
immediately after stopping the outgoing colour. An older image without
`relationship-types-cli.ts` is treated as FS-only. If either check finds unsupported
types, the error lists their counts. A post-stop failure leaves the new colour serving,
exits non-zero, and does not commit. Redeploy a release that understands those types,
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

## Shared people rollback

The intermediate storage release encodes isolated and shared modes but supports only isolated
runtime operation. The swap reads actual stored encodings and refuses an isolated-only incoming
release while any organization is shared, before migration and again after the outgoing color
stops. A missing old-schema column means isolated; missing tables or malformed state refuse.

The new column's down migration refuses while any shared organization **or any project rank**
exists. Use the combined recovery procedure instead of removing ranks alone. It preserves all
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

After forwarding the migration again, restore using a release that supports every saved mode.
This intermediate release refuses backups containing shared mode before writing anything. Restore
requires every saved organization still exists, all current modes isolated, no current ranks, and
valid rank ownership and authors. Additional isolated organizations remain untouched; additional
shared organizations refuse. Modes and ranks restore atomically:

```sh
docker exec be-01-<colour> bun run src/shared-people-rollback-cli.ts restore /data/shared-people-<date>.json
```
