# Runbook — deploying prod

Prod is image-based blue/green, unchanged by the source-run dev work. Orientation
lives in `LLM_README.md`; this is the operating detail.

**h2puni is not provisioned to drive prod builds yet** (verified 2026-08-04): it has `bun`,
`docker`, `git`, `node` (24.18.1 via Volta) and a running `dagger-engine` container, but
**no `dagger` CLI**. There is now a checkout at `/home/puni1/wbs-dev/src`, but it belongs to
dev — do not build from it. Installing the CLI is prerequisite work before the commands
below run there.

> Check tooling on h2puni with `ssh h2puni 'bash -lc "command -v node"'`. Volta and Bun are
> on the PATH of a **login** shell only; a bare `ssh h2puni 'command -v node'` reports
> `node` missing when it is installed and working. Same trap this file documents for h1claw
> — it cost an incorrect "no node" claim in the 2026-08-04 docs pass.

```sh
# ON h2puni, once the dagger CLI and a prod checkout (not dev's) exist:
export REGISTRY_USER=wbs REGISTRY_PASS=$(grep ^REGISTRY_PASS= /home/puni1/wbs/.env | cut -d= -f2-)
bunx nx run tool-dagger:publish-all
bunx nx run tool-remote-scripts:install --execute   # after any swap.js / smoke.js change
bunx nx run tool-deploy:deploy -- --all --execute
```

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
