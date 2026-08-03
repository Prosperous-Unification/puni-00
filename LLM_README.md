# LLM_README

Agent orientation. Read this, then only the one doc your task needs.

**wbs-tool-v1** — collaborative real-time WBS tool. `be-01` (API, Elysia+Drizzle+bun:sqlite, :3100),
`gw-01` (WS gateway, :3200), `fe-01` (Vite+React static, :80). Nx monorepo, Bun everywhere — never npm.

Two facts explain most decisions:

- **The infra is the deliverable**, deliberately beyond what one host needs. Two external reviews
  called it over-engineered; that was considered and rejected. Don't re-argue it.
- **The product barely exists.** `apps/fe-01/src` has zero `import.meta.env` reads — the frontend
  can't reach the backend.

Tool choices bias novel over mainstream (Bun, Elysia, ArkType, Dagger) on purpose.

## Commands

```sh
bunx nx run-many -t test lint typecheck   # the gate; run before claiming done
bun run dev                               # be + gw + fe locally
```

lefthook runs prettier + a secrets scan pre-commit. Never `--no-verify`.

## Deploy

Live: **https://wbs.bulletpoints.club** (`ssh h2puni`).

```sh
ssh -f -N -L 8081:127.0.0.1:8081 h2puni
export _EXPERIMENTAL_DAGGER_RUNNER_HOST=tcp://127.0.0.1:8081
export REGISTRY_USER=wbs REGISTRY_PASS=$(ssh h2puni 'grep ^REGISTRY_PASS= /srv/wbs/.env | cut -d= -f2-')
bunx nx run tool-dagger:publish-all
bunx nx run tool-deploy:deploy -- --all --execute
```

Dagger builds `linux/amd64` → self-hosted registry (the only build/deploy contract) → swap starts the
idle colour, health-gates, repoints Caddy, drains WS, stops old, runs smoke. `--dry-run` is default.
It **refuses** on a dirty tree or stale `release.json` — that's the migration gate, not a bug.

## Landmines

- `caddy reload` **exits 0 when it did nothing**. Verify against the admin API, never the exit code.
- `be-01.internal` resolves to **both colours** mid-swap (Docker round-robin). Two releases, one SQLite file.
- `bun:sqlite` defaults to no WAL, `busy_timeout=0`. Set+asserted in `be-01/src/repository/db.ts`.
- **Migrations must be backward-compatible** — blue and green share one DB. `--stop-the-world` refuses.
- `.dockerignore` is **not recursive**: `**/*.db`, not `*.db`.
- Server umask is `0002` — create sensitive files with their mode from birth, never chmod after.
- `--platform linux/amd64` is always pinned. Dev is arm64, server is amd64.

## Open findings

1. Deploy lock doesn't serialize across tiers — two `--all` deploys can interleave.
2. Smoke can pass while gateway→backend is broken (never exercises `gw-01`'s secret or `ForwardClient`).
3. Rollback unimplemented — `--version` parsed and ignored.
4. Stale-bundle check compares two possibly-stale artifacts.
5. `configure.sh`'s root phase never run on a fresh host.

Checks-that-cannot-fail have appeared three times here. Prove your check fails when the thing is broken.

## More

| Doc                                                                     | When                                           |
| ----------------------------------------------------------------------- | ---------------------------------------------- |
| `docs/superpowers/plans/2026-08-02-compose-blue-green-HANDOVER.md`      | before touching deploy                         |
| `docs/superpowers/specs/2026-08-02-compose-blue-green-deploy-design.md` | why the pipeline is shaped this way            |
| `docs/runbook-dagger-engine-registry-dns.md`                            | engine can't resolve `registry`                |
| `docs/local-dev.md`                                                     | running locally                                |
| `openspec/changes/scaffold-tech-setup/`                                 | original scaffold — **stale**, spec above wins |

Conventions: pure planners + thin IO shell; explicit return types; `strictTypeChecked`; comments say
**why** and state what was/wasn't verified; never print a secret value.
