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

## Work item hold rollback

**Code rollback with stored holds.** The `be` swap's `stored-vocabularies` step compares
the hold kinds the incoming binary reads (`hold-kinds-cli.ts`) with the `work_item.hold`
values stored, before migration and again after stopping the outgoing colour, exactly as
it does for relationship types. An older image without `hold-kinds-cli.ts` reads no holds,
so any stored hold refuses it and the error lists each kind and its count. Such an image
would schedule held work as if nothing were held (ADR 0032). Redeploy a release that reads
holds, or save and remove the holds with the commands below and rerun the deploy.

Rolling back past `20260928200000_add_work_item_status_facts` refuses while any hold is
stored; the refusal reads `CHECK constraint failed: work item holds exist: …`. Readiness is
dropped without a guard, as fact dates are. Run the commands inside the incoming container
with the same `DB_PATH`, after writers have stopped.

```sh
docker exec be-01-<colour> bun run src/work-item-hold-rollback-cli.ts save /data/work-item-holds-<date>.json
docker exec be-01-<colour> bun run src/work-item-hold-rollback-cli.ts remove /data/work-item-holds-<date>.json
docker exec be-01-<colour> bun run src/migrate-down-cli.ts --to=<baseline>
```

`remove` refuses unless the saved holds match the table exactly. After a later forward
migration, restore them; restore refuses the whole set if a saved work item is gone or has
become a parent:

```sh
docker exec be-01-<colour> bun run src/work-item-hold-rollback-cli.ts restore /data/work-item-holds-<date>.json
```
