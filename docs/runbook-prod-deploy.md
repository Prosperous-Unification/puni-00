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

Rolling back past `20260927213000_add_typed_dependency` refuses while `typed_dependency` holds
rows: the older release cannot read them, and `down.sql` will not drop them silently. The
refusal reads `CHECK constraint failed: typed dependencies exist: …`. The procedure is lossless.
Run it inside the incoming container after its writers have stopped, with the same `DB_PATH`.

Save the rows, then copy the file off the host:

```sh
bun -e "import { Database } from 'bun:sqlite'; const [path, out] = process.argv.slice(-2); const db = new Database(path, { readonly: true }); await Bun.write(out, JSON.stringify(db.query('SELECT * FROM typed_dependency').all()))" "$DB_PATH" /data/typed-dependency-<date>.json
```

Remove them. This refuses if the saved file holds fewer rows than the table:

```sh
bun -e "import { Database } from 'bun:sqlite'; const [path, saved] = process.argv.slice(-2); const kept = await Bun.file(saved).json(); const db = new Database(path); const n = db.query('SELECT count(*) AS n FROM typed_dependency').get().n; if (n !== kept.length) throw new Error('save again'); db.run('DELETE FROM typed_dependency')" "$DB_PATH" /data/typed-dependency-<date>.json
```

Then rerun `bun run src/migrate-down-cli.ts --to=<baseline>`. After a later release applies the
migration again, restore every saved row in one transaction with foreign keys on. The restore
either lands every row or fails at the first work item or step that no longer exists:

```sh
bun -e "import { Database } from 'bun:sqlite'; const [path, saved] = process.argv.slice(-2); const kept = await Bun.file(saved).json(); const db = new Database(path); db.run('PRAGMA foreign_keys = ON'); const put = db.prepare('INSERT INTO typed_dependency (id, project_id, predecessor_work_item_id, predecessor_scope, predecessor_step_id, successor_work_item_id, successor_scope, successor_step_id, type, created_at, updated_at, created_by) VALUES (\$id, \$project_id, \$predecessor_work_item_id, \$predecessor_scope, \$predecessor_step_id, \$successor_work_item_id, \$successor_scope, \$successor_step_id, \$type, \$created_at, \$updated_at, \$created_by)'); db.transaction(() => { for (const row of kept) put.run(Object.fromEntries(Object.entries(row).map(([k, v]) => ['\$' + k, v]))); })()" "$DB_PATH" /data/typed-dependency-<date>.json
```

Verified 2026-09-27 on a scratch database. Save, remove, rollback, the forward run and restore all
completed, and the restored row read back unchanged.
