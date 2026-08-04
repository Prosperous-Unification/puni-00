# LLM_README

Agent orientation. Read this, then only the one doc your task needs.

**wbs-tool-v1** — collaborative real-time WBS tool. `be-01` (API, Elysia+Drizzle+bun:sqlite, :3100),
`gw-01` (WS gateway, :3200), `fe-01` (Vite+React static, :80 in the image, :4200 under `vite dev`).
Nx monorepo, Bun everywhere — never npm.

Two facts explain most decisions:

- **The infra is the deliverable**, deliberately beyond what one host needs. Two external reviews
  called it over-engineered; that was considered and rejected. Don't re-argue it.
- **The product barely exists.** `apps/fe-01/src` has zero `import.meta.env` reads — the frontend
  can't reach the backend. `buildApp` opens no database and wires no repository, so be-01 serves
  smoke/internal stubs only. `fe-01`'s Dockerfile injects three `VITE_*` values nothing reads.

Tool choices bias novel over mainstream (Bun, Elysia, ArkType, Dagger) on purpose.

## Commands

```sh
bun install                                     # first, on a fresh clone
bun run dev:setup                               # writes the .env files dev needs
bunx nx format:check --all                      # the gate, part 1
bunx nx run-many -t test lint typecheck build   # the gate, part 2
bun run dev                                     # be + gw + fe locally
```

`bun test` from the repo root is **not** the whole suite — it runs 0 of fe-01's test files, which
are Vitest/jsdom and invisible to `bun:test`, and reports a clean run anyway. `build` needs
`shellcheck` (`brew install shellcheck`); it is no longer allowed to skip itself when absent.

**Rules: `AGENTS.md`** (symlinked to CLAUDE.md/GEMINI.md) — read it, it governs every change.

`.github/workflows/ci.yml` runs the gate above plus the secrets scan, migration lint and
`openspec validate` on every push and PR. lefthook runs a subset pre-commit and `--no-verify`
skips it; CI is not skippable. Format uses `--all` on purpose: the default base-ref comparison
checks nothing on a push to main.

## Deploy

Live: **https://wbs.bulletpoints.club** (prod = `ssh h2puni`). **Build box = h2puni.**

**Never build on h1claw.** Dany's standing rule, 2026-08-04. It supersedes the earlier
"prefer h1claw, it is amd64" guidance in this file's history — h1claw is a 3.7 GB VPS that
runs the OpenClaw gateway and holds the prod SSH key, registry credentials and the `ghp_`
PAT. A `PreToolUse` guard on h1claw (`~/.openclaw/workspace/bin/block-local-builds.sh`)
denies `dagger`, `tool-dagger:*`, `tool-deploy:deploy` and `docker build` outright; commands
delegated over `ssh … h2puni` pass through.

### dev — source-run, no build

**Dev does not use any of the below.** Since 2026-08-04 dev runs from source:

```sh
git push && ./bin/dev-deploy.sh     # from h1claw, after any change
```

`bin/dev-deploy.sh` refuses a dirty tree or an unpushed SHA, then asks h2puni to
`git reset --hard` its checkout at `/home/puni1/wbs-dev/src`. That checkout is bind-mounted
into one container, `wbs-dev-src`, running all three tiers via `bun run dev` — be-01 and
gw-01 under `bun --watch`, fe-01 under Vite. **The watchers are the deploy**; nothing is
built, pushed or restarted. Only a moved `bun.lock` triggers `bun install` + restart, which
is the single decision `tools/tool-devsync` makes and the only part with tests.

Verified 2026-08-04: a pushed change appeared on dev with the container's `StartedAt`
unchanged to the nanosecond.

Dev sits behind basic auth (`dany`, password in `/home/puni1/wbs-dev/basic-auth.env` on
h2puni) on every path except `/ws*` — browsers cannot send an `Authorization` header on a
WebSocket handshake, and gw-01 rejects unauthenticated sockets itself
(`apps/gw-01/src/app.ts:46-55`).

Per-tier env lives in gitignored `apps/<tier>/.env` inside that checkout, **not** in
compose `env_file`: compose merges every env file into one namespace, so `be-01.env` and
`gw-01.env` both setting `PORT` put both tiers on 3200.

The old image-based dev containers (`dev-*-blue`) are **stopped, not removed** — they plus
the `site-dev.caddy.bak-*` backups are the rollback. Delete them after a week of stability.

**What dev no longer proves.** The blue/green swap, health gate, Caddy repoint and smoke
test used to run on dev before prod. They no longer do. Run a prod dry-run deliberately
before any prod deploy; dev will not catch a regression in that path.

### prod — image-based, unchanged

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
# ON h2puni, once the CLI + checkout exist:
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

`--version`, `--since` and `--skip-build` are **parsed and ignored**. Passing them does nothing.

## Landmines

- `caddy reload` **exits 0 when it did nothing**. Verify against the admin API, never the exit code.
  The post-reload check is a substring test on the live config — it proves the colour is mentioned,
  not that the public route reaches it.
- `be-01.internal` resolves to **both colours** mid-swap (Docker round-robin). Two releases, one SQLite file.
- `bun:sqlite` defaults to no WAL, `busy_timeout=0`. Set **and asserted at open** in
  `be-01/src/repository/db.ts`; an ESLint rule bans importing `bun:sqlite` anywhere else under
  `apps/be-01/src`, because `busy_timeout`/`foreign_keys` are per-connection and a direct
  `new Database()` silently loses them. Nothing opens a runtime connection yet — `openDatabase`'s
  only caller is `repository/migrate.ts`.
- **Migrations must be backward-compatible** — blue and green share one DB. `--stop-the-world` refuses.
  The pre-commit lint catches the obvious destructive statements; the actual compatibility judgement
  is yours, asserted by passing `--with-migrations`.
- `.dockerignore` is **not recursive**: `**/*.db`, not `*.db`.
- Server umask is `0002` — create sensitive files with their mode from birth, never chmod after.
  `configure.sh` does not yet honour this (see findings).
- `--platform linux/amd64` is pinned **on the Dagger publish path**, which is the only supported one.
  A hand-run `docker build` from the Dockerfiles is not pinned. Dev is arm64, server is amd64.

## Open findings

1. Smoke can pass while gateway→backend is broken. It now authenticates to `/internal/forward`, but
   against `be-01` **directly** — `gw-01`'s `ForwardClient` is still never exercised. It also accepts
   any 2xx without requiring `{ack:true}`.
2. Rollback unimplemented — `--version` parsed and ignored.
3. `configure.sh`'s root phase never run on a fresh host; `tool-bootstrap:push` wires it, but only
   the plan is tested, never a real fresh host.
4. A tier-scoped deploy can _acknowledge_ a migration without applying it: the gate runs for every
   selected tier, but only a `be` swap includes the `migrate` step. `deploy gw --with-migrations`
   from a commit carrying a migration reports progress and leaves the DB unmigrated.
5. Health endpoints are status flags, not dependency checks. be-01 trusts an in-memory boolean,
   gw-01's is unconditional. Break `BE_URL` or delete the SQLite file and both still report 200.
6. `swap.js`'s `readRecordedColor` collapses absent, unreadable and malformed state files to
   `null` — the same defect already fixed in `tool-deploy`'s `readRemoteState`, in the file that
   decides which colour is live. Found by scan, not yet fixed; needs deploy-semantics judgement.
7. `configure.sh:182` — `grep -v '^REGISTRY_PASS=' .env > tmp 2>/dev/null || true`. On first run
   the absent `.env` is the intended case, but an **unreadable** `.env` also yields an empty tmp,
   and the next line `mv`s it into place: every other app secret in that file is silently dropped.

Also known, lower priority: fe/smoke health accepts any non-empty body; the WS smoke passes on any
first message _containing_ `"pong"`; gateway drain reads a malformed metrics body as zero live
sockets; `tool-secrets` is a placeholder that only prints what it would run, despite its README.

Checks-that-cannot-fail have appeared **eight** times here. Fixed: `assertPragmas` with no runtime
caller, the migration lint's unreachable `ALTER TABLE ... RENAME COLUMN` branch, `readRemoteState`
reading an unreadable file as never-deployed, `shellcheck … || echo`, the secrets scanner's
`.catch(() => '')` (an unreadable file scanned as clean — in a CI gate), and `dev:setup` skipping a
missing `.env.example`. Open: findings 6 and 7 above. Prove your check fails when the thing is
broken, and say so in the comment — see AGENTS.md R5.

## More

| Doc                                                                     | When                                           |
| ----------------------------------------------------------------------- | ---------------------------------------------- |
| `docs/superpowers/plans/2026-08-02-compose-blue-green-HANDOVER.md`      | before touching deploy                         |
| `docs/superpowers/specs/2026-08-02-compose-blue-green-deploy-design.md` | why the pipeline is shaped this way            |
| `docs/runbook-dagger-engine-registry-dns.md`                            | engine can't resolve `registry`                |
| `docs/local-dev.md`                                                     | running locally                                |
| `HUMAN_README.md`                                                       | operating prod; triage runbook; openclaw path  |
| `openspec/changes/scaffold-tech-setup/`                                 | original scaffold — **stale**, spec above wins |

Conventions: pure planners + thin IO shell; `strictTypeChecked`; comments say **why** and state what
was/wasn't verified; never print a secret value. Explicit return types are the house style but are
**not** enforced by a lint rule — plenty of existing code infers them.
