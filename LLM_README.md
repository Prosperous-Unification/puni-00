# LLM_README

Agent orientation. Read this, then only the one doc your task needs.

**wbs-tool-v1** — collaborative real-time WBS tool. `be-01` (API, Elysia+Drizzle+bun:sqlite, :3100),
`gw-01` (WS gateway, :3200), `fe-01` (Vite+React static, :80 in the image, :4200 under `vite dev`).
Nx monorepo, Bun everywhere — never npm.

Two facts explain most decisions:

- **The infra is the deliverable**, deliberately beyond what one host needs. Two external reviews
  called it over-engineered; that was considered and rejected. Don't re-argue it.
- **The product is one feature deep.** Since 2026-08-04 it has accounts and presence: register,
  log in, and see who else is connected (`/api/auth/*`, gw-01's roster). be-01 opens a database
  and signs the tokens gw-01 verifies. Absent is the WBS domain itself — no work-breakdown
  model. Persisted today: `users`, `examples`, `event_log`, `event_sequencer`.

Tool choices bias novel over mainstream (Bun, Elysia, ArkType, Dagger) on purpose.

## Commands

```sh
bun install                                     # first, on a fresh clone
bun run dev:setup                               # writes the .env files dev needs
bunx nx format:check --all                      # the gate, part 1
bunx nx run-many -t test lint typecheck build   # the gate, part 2
bun run dev                                     # be + gw + fe locally
```

`bun test` from the repo root is **not** the gate and its failures do not mean what they say.
It **does** collect fe-01's files — the older claim that it collected none of them was wrong — and
19 of them fail on `location`, `localStorage` and the rest of the DOM `bun:test` has no jsdom to
provide. Use `bunx nx run-many -t test`, which routes fe-01 to `bunx vitest run`. `build` needs
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

**Dev does not use any of the prod machinery below.** Since 2026-08-04:

```sh
git push && ./bin/dev-deploy.sh     # from h1claw, seconds
```

One container, `wbs-dev-src`, runs all three tiers from a bind-mounted checkout via
`bun run dev`. **For application code the watchers are the deploy** — nothing is built,
pushed or restarted. The lockfile, migrations, and config read once at startup trigger a
restart; a changed `compose.yml` or `Dockerfile` fails the deploy with the command that
applies it. Dev sits behind basic auth (`dany`) on every path but `/ws*`.

**Which changes reach a running process, and which do not: `docs/runbook-dev-deploy.md`.**

**What dev no longer proves.** The blue/green swap, health gate, Caddy repoint and smoke
test used to run on dev before prod. They no longer do. Run a prod dry-run deliberately
before any prod deploy; dev will not catch a regression in that path.

### prod — image-based, blue/green

**h2puni can build and publish** since 2026-08-05: pinned `dagger` v0.21.8, a build
checkout at `/home/puni1/wbs-build` (**not** dev's), and the `h2puni` alias resolving
to itself. Proven: images published, dry run planned the swap. Runbook has the why.

Dagger builds `linux/amd64` → self-hosted registry (the only build/deploy contract) → the
swap starts the idle colour, health-gates it, repoints Caddy, drains WS, stops the old
colour, runs smoke. `--dry-run` is the default, and it refuses on a dirty tree, a stale
`release.json` or an unbuilt executor bundle — those are the safety gates, not bugs.

A migration is applied by be-01's swap and by nothing else. It must be additive, must ship
a `down.sql`, and an aborted deploy reverses it (`AGENTS.md`, "Migrations").

**Commands, the PATH trap on h2puni, the Mac tunnel, and the swap's one-tier-list-per-run
contract: `docs/runbook-prod-deploy.md`.**

## Landmines

- `caddy reload` **exits 0 when it did nothing**. Verify against the admin API, never the exit
  code. The check parses the route for this environment's host and reads the upstream on the
  tier's port (`routedColorFromAdminConfig`); it was a substring test until 2026-08-04, which
  matched `be-01-blue` inside dev's `dev-be-01-blue` and read prod's colour wrong.
- `be-01.internal` resolves to **both colours** mid-swap (Docker round-robin). Two releases, one SQLite file.
- `bun:sqlite` defaults to no WAL, `busy_timeout=0`. Set **and asserted at open** in
  `be-01/src/repository/db.ts`; an ESLint rule bans importing `bun:sqlite` anywhere else under
  `apps/be-01/src`, because `busy_timeout`/`foreign_keys` are per-connection and a direct
  `new Database()` silently loses them. `main.ts` opens the process connection through
  `openDrizzle`, in that same file, for the same reason.
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
2. Rollback unimplemented. `--version` is now _refused_ rather than ignored (2026-08-04), so it
   no longer looks like one; deploying an older commit still means checking it out and rebuilding.
3. `configure.sh`'s root phase never run on a fresh host; `tool-bootstrap:push` wires it, but only
   the plan is tested, never a real fresh host.
4. Health endpoints are status flags, not dependency checks. be-01 trusts an in-memory boolean,
   gw-01's is unconditional. Break `BE_URL` or delete the SQLite file and both still report 200.

Also known, lower priority: fe/smoke health accepts any non-empty body; the WS smoke passes on any
first message _containing_ `"pong"`; gateway drain reads a malformed metrics body as zero live
sockets; `tool-secrets` is a placeholder that only prints what it would run, despite its README.

Checks that cannot fail have appeared **eleven** times in this repo. The tally, and what each
one taught, is in `AGENTS.md` under R5. Three were closed on 2026-08-05; none is open.

## More

| Doc                                                                     | When                                           |
| ----------------------------------------------------------------------- | ---------------------------------------------- |
| `docs/superpowers/plans/2026-08-02-compose-blue-green-HANDOVER.md`      | before touching deploy                         |
| `docs/superpowers/specs/2026-08-02-compose-blue-green-deploy-design.md` | why the pipeline is shaped this way            |
| `docs/runbook-dev-deploy.md`                                            | deploying dev; what a deploy cannot carry      |
| `docs/runbook-prod-deploy.md`                                           | deploying prod; commands and their refusals    |
| `docs/runbook-dagger-engine-registry-dns.md`                            | engine can't resolve `registry`                |
| `docs/local-dev.md`                                                     | running locally                                |
| `HUMAN_README.md`                                                       | operating prod; triage runbook; openclaw path  |
| `openspec/changes/scaffold-tech-setup/`                                 | original scaffold — **stale**, spec above wins |

Conventions: pure planners + thin IO shell; `strictTypeChecked`; comments say **why** and state what
was/wasn't verified; never print a secret value. Explicit return types are the house style but are
**not** enforced by a lint rule — plenty of existing code infers them.
