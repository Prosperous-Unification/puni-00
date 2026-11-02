# Local Development

Running `be-01`, `gw-01` and `fe-01` on your workstation: no Docker, no Hetzner box, no deploy
pipeline. The shortest start is in the [README](../README.md#start-here); this is the detail.
To serve a worktree from source on a local k3s cluster instead, see [local k3s lab](infra/local.md).

## One-time setup

After `bun install`, `bun run dev:setup` copies `apps/wbs/*/.env.example` to `apps/wbs/*/.env`
with safe dev-only defaults. It never overwrites an existing `.env`, and it **fails** rather than
skipping if a committed `.env.example` is missing: that means the checkout is incomplete, and
seeding around it only moves the failure to an unexplained crash at serve time.

| File                  | Purpose                                                          |
| --------------------- | ---------------------------------------------------------------- |
| `apps/wbs/be-01/.env` | backend config: `PORT`, `DB_PATH`, `INTERNAL_AUTH_*`, `HOSTNAME` |
| `apps/wbs/gw-01/.env` | gateway config: ports, `BE_URL`, JWT signing keys                |
| `apps/wbs/fe-01/.env` | Vite `VITE_*` vars pointing at local be-01 + gw-01               |

All three are gitignored. Edit them freely.

`HOSTNAME` is the caller id be-01 names itself by to the solver supervisor, and
be-01 refuses to start without it (`HOSTNAME is required for solver supervisor
authentication`). A deployed container gets its Docker hostname; the seeded
`HOSTNAME=000000000000` stands in on a workstation, where there is no supervisor
socket and optimization reports itself unavailable. A shell that exports
`HOSTNAME` overrides the file. A `be-01/.env` seeded before the line existed is
diagnosed by `bun run dev:setup`: add `HOSTNAME=000000000000` to it.

## Run all four at once

`bun run dev` (`bin/dev.sh`) runs `nx run-many -t serve --projects=wbs-be-01,wbs-gw-01,wbs-fe-01,wbs-mcp-01`,
which brings up:

| App      | URL                     | Notes                                |
| -------- | ----------------------- | ------------------------------------ |
| `be-01`  | <http://localhost:3100> | Bun + Elysia; SQLite at `./local.db` |
| `gw-01`  | <http://localhost:3200> | Bun + Elysia; WS on `/ws`            |
| `fe-01`  | <http://localhost:4200> | Vite dev server with HMR             |
| `mcp-01` | <http://localhost:3300> | MCP endpoint `/mcp`; see below       |

Logs are interleaved. `Ctrl-C` stops all four.

## Run one at a time

```bash
bun run dev:be           # just the backend
bun run dev:gw           # just the gateway
bun run dev:fe           # just the frontend
```

Equivalent to `nx run wbs-be-01:serve` etc. Each one runs under `bun --watch` (or
Vite's own watcher for fe-01) so source edits reload automatically.

## Sanity checks

Once `bun run dev` is up:

```bash
curl http://localhost:3100/health
curl http://localhost:3100/metrics | head
curl http://localhost:3200/health
curl http://localhost:3200/metrics/snapshot
curl http://localhost:3200/metrics | head
open http://localhost:4200/
```

Expected:

- `/health` returns `{"status":"ok"}` on both backends.
- `/metrics` returns Prometheus text format (OTel exporter + `target_info`; app
  counters appear once any traffic flows).
- `/metrics/snapshot` on gw-01 returns the in-memory counters JSON (useful for
  manual inspection without scraping).

## An activated organization with MCP agents

`bun run dev` cannot serve one: `AUTH_MODE=local` makes every request the fixed `local-dev`
identity, so an API key never authenticates, and nothing creates or activates an organization.
`apps/wbs/be-01/src/dev/activated-organization-server.ts` boots be-01's production composition
over a fresh migrated SQLite file in the temp directory, listening on `127.0.0.1` only, registers
`owner` (password `correct-horse`), makes it `super_admin` of `org-local` and activates isolation.
It composes machine grants for the mcp-01 at `--mcp-url`, so agents connect the way they do in a
deployment: over MCP, never with a key on `/api`. It uses public test fixture secrets, which is
why it stays on loopback. It is development only: `.dockerignore` keeps `src/dev` out of the
image and `main.ts` cannot reach it (`production-entrypoint.test.ts`). Stopping it, or a failed
start, deletes the database.

```bash
bun apps/wbs/be-01/src/dev/activated-organization-server.ts --port 7300 \
  --gw-url http://localhost:7301 --app-origin http://localhost:7400 \
  --mcp-url http://127.0.0.1:7302/mcp

# gw-01: the fixture's JWT key and internal secret. It verifies native sessions on that
# key, so the issuer is never fetched, but it must be an https: URL or gw-01 refuses to
# start. gw-01 has no bind option and listens on every interface: anyone who can reach
# it can forge a session with the public fixture key, so run it only on a trusted network.
cd apps/wbs/gw-01 && PORT=7301 LOG_LEVEL=info BE_URL=http://localhost:7300 \
  INTERNAL_AUTH_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx \
  JWT_SIGNING_KEY_CURRENT=test-jwt-signing-key-at-least-32-chars \
  AUTH_MODE=oidc AUTH_ISSUER_DISCOVERY_URL=https://issuer.invalid AUTH_CLIENT_ID=local \
  AUTH_CLIENT_SECRET=local AUTH_AUDIENCE=local \
  AUTH_REDIRECT_URI=http://localhost:7400/api/auth/okta/callback bun src/main.ts

# mcp-01 in standalone mode: MCP_PUBLIC_URL is the server's --mcp-url, and
# MCP_BE_INTERNAL_SECRET is the public fixture the server's banner prints. It also listens
# on every interface; run it only on a trusted network.
cd apps/wbs/mcp-01 && PORT=7302 MCP_AUTH_MODE=standalone \
  MCP_PUBLIC_URL=http://127.0.0.1:7302/mcp WBS_API_URL=http://127.0.0.1:7300 \
  MCP_TRUSTED_PROXY_HOPS=0 MCP_BE_INTERNAL_SECRET=<printed by the server> \
  MCP_STORE_PATH=/tmp/wbs-local-mcp.sqlite MCP_STORE_KEY_CURRENT="$(openssl rand -base64 32)" \
  MCP_SIGNING_KEY_CURRENT="$(openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 \
    | openssl pkcs8 -topk8 -nocrypt -outform DER | base64 -w0)" bun src/main.ts

cd apps/wbs/fe-01 && VITE_BE_URL=http://localhost:7300 VITE_GW_URL=http://localhost:7301 \
  bunx vite --host localhost --port 7400 --strictPort
```

Sign in at <http://localhost:7400> and choose `org-local` on `/organization`. An agent needs a
person of kind `agent` bound to `owner`'s account, then a key. Over HTTP, as `owner` with the
session token in `__Host-wbs_access`, the `__Host-wbs_organization` cookie that
`POST /api/organization/active` sets, and `X-WBS-Expected-Organization: org-local` on writes:
`POST /api/directory/commands` with `createPerson` (`personKind: agent`) then `patchPerson`
(`patch.accountId`), then `POST /api/organization/machine-credentials`
`{ source: 'api_key', name, personId }`. The answer carries the key once: save it to a file and
`chmod 600` it. A pool of agents comes from the organization page's agent pools panel and
`twilight-dash pool import` instead ([`pool import`](../apps/twilight-structure/twilight-dash/cli/README.md#pool-import)).
Lease timing has no knob: claims hold for the real 15 minutes.

The agent connects to `http://127.0.0.1:7302/mcp` with
[`twilight-dash mcp token`](../apps/twilight-structure/twilight-dash/cli/README.md#mcp-token)
as its `headersHelper`, which exchanges the key for a fresh token at mcp-01's token endpoint
on every run. For Claude Code, an `.mcp.json` such as:

```json
{
  "mcpServers": {
    "wbs": {
      "type": "http",
      "url": "http://127.0.0.1:7302/mcp",
      "headersHelper": "bun <repo>/apps/twilight-structure/twilight-dash/cli/src/entrypoint.ts mcp token --resource http://127.0.0.1:7302/mcp --key-file <key file>"
    }
  }
}
```

`activated-organization-server.test.ts` runs this path: the key, the helper, one tool call.
A human's consent on `/mcp` still cannot complete here: be-01 boots without
`WBS_DELEGATION_VERIFY_KEY`, and there is no upstream login for mcp-01 to send the human to.
`bun run dev` starts mcp-01, but its seeded `.env` points `WBS_API_URL` at the deployed dev
backend and names a placeholder issuer. To exercise MCP consent, use the booted fixture behind
mcp-01's `organization-delegation.boot.test.ts`:
`apps/wbs/be-01/src/testing/mcp-delegation-backend.ts` (production be-01 composition, fresh
delegation key pair, a test JWKS for the upstream login).

Caps come from the test defaults (50 agent persons, 200 concurrent claims, 10,000 units per
resource). To show or change them, point `organization-limits-cli.ts` at the database path the
server prints on start. The CLI reads the deployment defaults from the environment and exits 1
with a `ValidationError` without all three, even for `show`, so set them to the same numbers:

```bash
DB_PATH=<printed database path> ORGANIZATION_DEFAULT_MAX_AGENT_PERSONS=50 \
  ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS=200 \
  ORGANIZATION_DEFAULT_MAX_CAPACITY_UNITS_PER_RESOURCE=10000 \
  bun apps/wbs/be-01/src/organization-limits-cli.ts show --organization org-local
```

`set` and `reset` rehearse unless given `--apply`: [organization limits](runbook-organization-activation.md#organization-limits-after-activation).

## Tests / lint / typecheck

```bash
bin/h2puni-gate.sh <sha>                        # full gate; <sha> is checked out under that lock
bun run format                                  # prettier --write
```

Use the h2puni gate wrapper, not root `bun test` or the raw full Nx gate. Root
`bun test` collects `fe-01`'s Vitest and Playwright files and runs them under
`bun:test`, which has neither jsdom nor the Playwright runner, so the run is a
wall of unrelated failures, not a verdict. Measured 2026-10-21: `bun test
apps/wbs/fe-01` = 2454 tests / 280 files, 722 fail, 93 errors
(`Playwright Test did not expect test() to be called here`); the project's
`test` target runs Vitest twice, in UTC and in Pacific/Auckland.

`build` needs `shellcheck` on PATH (`brew install shellcheck`) and is no longer
allowed to skip itself when it is absent.

**Two TypeScripts.** `bunx tsc` is TypeScript 7 (the native compiler, installed
as `@typescript/native`); `require('typescript')` is the TS 6 API build, which
typescript-eslint needs because TS 7 ships no compiler API until 7.1. VS Code's
`typescript.tsdk` therefore points at TS 6; install the recommended
`typescriptteam.native-preview` extension to get TS 7 in the editor too.
`tools/tool-devsync/src/toolchain-pins.test.ts` holds both roles to their majors.

Scoped variants:

```bash
bunx nx test wbs-be-01
bunx nx test wbs-gw-01
bunx nx test wbs-fe-01           # vitest + jsdom
bunx nx test wbs-validation      # or wbs-domain, wbs-contracts, wbs-realtime, wbs-config, ...
```

## Observability stack (optional, local)

The full Prometheus + Grafana + Loki + Promtail stack lives in
`tools/tool-observability-stack/` and is designed for the deployed Compose
target. You can run it locally once Docker is installed:

```bash
docker compose -f tools/tool-observability-stack/src/docker-compose.yml up -d
```

Grafana: <http://localhost:3000> (admin/admin default). Prometheus scrape
config already points at `host.docker.internal:3100` and `:3200`, so it picks
up the locally-running apps. Day-to-day dev does not need it.

## Troubleshooting

- **"Failed to run the query" on be-01 startup** — stale `apps/wbs/be-01/local.db`
  from a partial migration. Delete it: `rm apps/wbs/be-01/local.db` and restart.
- **Working out when be-01 last wrote, or why it is down** — read the mtime of
  `apps/wbs/be-01/local.db-wal`, not of `local.db`. The database is `journal_mode=wal`
  (`repository/db.ts` sets it and asserts it at open), so a crashed be-01 leaves
  its last writes in the `-wal` and the main file's mtime can be a day older.
  **Do not open it with a `sqlite3` client first**: even a read-only `select`
  checkpoints the WAL into the main file and deletes it, which destroys the one
  timestamp that dates the crash. That happened here on 2026-09-02 — a
  581,632-byte checkpoint, and with it the evidence of when be-01 had actually
  stopped (a day earlier, as the pre-checkpoint mtime showed). No test writes
  this file: every `*.db.test.ts` opens its own `mkdtempSync` copy, so a
  changed `local.db` is always a real process or a client, never a gate.
- **Port already in use** — `bun run dev` refuses before nx starts and names the
  port, the tier and the process holding it, with the `kill` line to free it
  (`bin/dev-ports.sh`; ask it on its own with `bun run dev:ports`, and clear it
  with `bun run dev:kill`, which ends only holders whose working directory is
  this checkout and reports anything else rather than killing it — that path
  needs `lsof`, since a process with no readable working directory is one whose
  owner cannot be established). The usual
  cause is a dev server from an earlier session that outlived its terminal —
  fe-01 is the one that hides, because vite sets `strictPort` and so exits in
  under a second while nx lists it as a task that _completed_ beside three
  Continuous ones. To move a tier instead of freeing the port, edit `PORT=` in
  the relevant `apps/wbs/*/.env`; all URLs in peer `.env` files update by
  convention, not by magic, so change both ends. `WBS_DEV_PORTS='fe-01:4300'`
  overrides which ports are checked.
- **`@/` imports fail in fe-01 tests** — run them via `bunx nx test wbs-fe-01`
  (Vitest resolves the alias); root `bun test` does not.
- **gw-01 refuses the WS upgrade** — check the configured authentication mode.
  The seeded local mode uses its fixed development identity, so
  `wscat -c 'ws://localhost:3200/ws'` opens without a credential. OIDC mode
  accepts only the `__Host-wbs_access` httpOnly cookie from the configured exact
  Origin; use the browser login flow for that check. Never append `?token=` or
  `?localIdentity=`: URL values do not authenticate a socket.

## What local dev does NOT do

- No SOPS decryption — `tool-secrets` is not in the local dev loop.
- No deploy — `tool-deploy` and `tool-bootstrap` default to dry-run and are
  unwired for safety.
- No remote observability — run the Compose stack above if you want Grafana.
- No e2e / smoke checks — those are post-deploy (`tool-smoke`).
