## Context

This change scaffolds the WBS tool's tech foundation. All strategic decisions are locked in `brainstorm.md` and `proposal.md`; this document addresses the design-phase open questions and the concrete *how* of implementation. Where brainstorm said "resolve in design," this is where that resolution lives.

Key constraints carried forward from brainstorm:

- Single Hetzner host, Docker Compose, Caddy fronting TLS. No Kubernetes.
- Three apps: `apps/be-01` (HTTP API, Bun+Elysia+Drizzle+`bun:sqlite`), `apps/gw-01` (WS gateway, Bun+Elysia, ephemeral state), `apps/fe-01` (Vite+React+TanStack). Seven libs (`@wbs/validation`, `@wbs/domain`, `@wbs/contracts`, `@wbs/observability`, `@wbs/config`, `@wbs/realtime`, `@wbs/scripts` — see D19).
- Gateway adopted upfront; backend has **no WS surface**; client talks HTTP→`be-01` + WS→`gw-01`.
- Deploy pipeline is **Dagger (TS) for build/test/publish + Bun/TS scripts for SSH deploy**; only a tiny `bootstrap.sh` installs Bun on the remote.
- Observability wired from day one: `pino` + `/metrics` + Grafana/Loki/Promtail/Prometheus self-hosted in Compose.
- "Experimental-for-fun" posture — novel tool choices preferred where close.

Audience: future me (first implementer) and any subagent dispatched under `/opsx:apply`.

## Goals / Non-Goals

**Goals:**

- Produce a working end-to-end local dev loop (all three apps runnable) and a working end-to-end deploy path (scripts + stack + Caddy + Compose + observability) on day one, even if the apps are health-check-only stubs.
- Establish every seam the product features will build on: repository-layer abstraction in `be-01`, internal contract between `be-01` and `gw-01`, TanStack DB dual-mode stub in `fe-01`, Dagger pipeline targets, Bun/TS deploy scripts, observability wiring.
- **Ship the Layer-A WebSocket resume protocol machinery** (sequence assignment, bounded replay buffer, reconnect handshake, client-side reconnecting-WS wrapper with exponential-backoff + jitter). Prove it end-to-end with a single `ping`/`pong` message type; product-level WS messages layer on later without protocol changes.
- **Ship encrypted-at-rest secrets management** using SOPS + age: encrypted secrets files committed to the repo, age keys on developer workstation only, decrypt-and-ship during deploy. No plaintext secrets in git, no plaintext secrets on workstation disk.
- Resolve the design-phase open questions from `brainstorm.md` with concrete decisions so `specs/` and `tasks.md` have nothing architectural left to invent.
- Keep each decision reversible where cheap; flag where it isn't.

**Non-Goals:**

- No WBS domain behavior (no table, no estimates, no Gantt). Product features come later.
- No WBS-specific WS *message types* on `gw-01`. The frame shape, sequence numbering, resume protocol, and a trivial `ping`/`pong` roundtrip message ship now so the protocol is proven end-to-end; product message types (doc edits, presence, etc.) land with their features.
- No multi-instance gateway, no Redis/NATS bus. `gw-01` is N=1 in this change.
- No CI platform integration. Pipeline runs from workstation only.
- No distributed tracing UI (Tempo deferred); no Sentry; no Uptime Kuma; no product-specific Grafana dashboards.
- No cloud/Vault-backed secrets. SOPS + age (files committed to repo, age key on developer workstation) is the ceiling — good enough for one developer, migratable to KMS/Vault later without file-format change.

## Decisions

### D1. Nx workspace layout: `apps/`, `libs/`, **and `tools/`** — Nx-all-the-way

**Decision: no free-floating `infra/`, `dagger/`, `scripts/`, or `secrets/` directories.** Every artifact that today would live outside an Nx project becomes an Nx project of its own. Three top-level directories only: `apps/`, `libs/`, `tools/`.

- `apps/<name>` — user-facing deployable units (`be-01`, `gw-01`, `fe-01`).
- `libs/<name>` — importable modules consumed by apps (see D19 for the decomposition).
- `tools/tool-<name>` — Nx projects invoked via `nx run`, not imported. Scripting, infra config, deploy orchestration, secrets tooling, remote-host bootstrap, smoke tests. The `tool-` prefix matches the `lib-` flat convention and keeps imports vs invocations unambiguous.

**Directory layout** (fully resolved):
```
apps/
  be-01/   gw-01/   fe-01/
libs/
  validation/            # @wbs/validation         (D19)
  domain/                # @wbs/domain
  contracts/             # @wbs/contracts
  observability/         # @wbs/observability
  config/                # @wbs/config
  realtime/              # @wbs/realtime  (browser-only)
  scripts/               # @wbs/scripts   (Bun-only)
tools/
  tool-compose/             # Compose + Caddy fragment templates + renderer
  tool-observability-stack/ # Grafana/Loki/Promtail/Prometheus config + dashboards
  tool-secrets/             # SOPS .env.sops files + decrypt/push CLI
  tool-dagger/              # Dagger TS module (per-app build/test/publish)
  tool-bootstrap/           # Remote-host bootstrap: bun+docker+dirs
  tool-remote-scripts/      # Bun swap scripts that run on the remote
  tool-deploy/              # Orchestrator + per-tier deploy (workstation)
  tool-git-hooks/           # Lefthook install + pre-commit hooks
  tool-smoke/               # End-to-end smoke tests (ws-ping, health)
.sops.yaml                  # stays at repo root — SOPS resolves upward from encrypted files
```

**Every workstation / remote operation becomes an `nx run` invocation.** No `bun scripts/*.ts` equivalents; no `bash scripts/*.sh`. Concretely:

| Pre-refactor form | Nx form |
|---|---|
| `bun scripts/deploy.ts --all` | `nx run tool-deploy:deploy -- --all` |
| `bun scripts/deploy-be.ts` | `nx run tool-deploy:deploy-be` |
| `bash scripts/install-git-hooks.sh` | `nx run tool-git-hooks:install` |
| `scp tools/tool-bootstrap/src/bootstrap.sh …` | `nx run tool-bootstrap:push -- --host=<host>` |
| `bun scripts/smoke/ws-ping.ts` | `nx run tool-smoke:ws-ping` |
| `sops -d secrets/production.env.sops` | `nx run tool-secrets:decrypt` |

A trivial top-level alias `"deploy": "nx run tool-deploy:deploy"` is added to `package.json` so muscle-memory `bun deploy --all` still works — it's a thin forwarder, not a divergent code path.

**Tooling choices:**

- **Bun as the package manager** (not npm/pnpm) — lockfile `bun.lockb`, install via `bun install`. Nx 18+ supports `bun.lockb`; friction points get documented, not worked around by switching PM.
- **Bun as the Node-replacement runtime** for `be-01` and `gw-01`. Nx executors invoked via `nx:run-commands` wrapping `bun`.
- **Test runners**: `bun test` for backend/libs; **Vitest** for `fe-01` (jsdom + Vite-native) — see D20.
- **TypeScript project references** across every project; path aliases `@wbs/<lib>` (see D19) and per-project `tsconfig` inherits from a root `tsconfig.base.json`.
- **Nx tags** enforce architectural boundaries via `@nx/enforce-module-boundaries`:
  - `scope:app`, `scope:shared`, `scope:infra`
  - `type:app`, `type:validation|domain|contracts|observability|config|realtime|scripts`
  - `runtime:isomorphic|bun|browser`
  - Example forbidden imports: `scope:app → scope:infra` (apps cannot import tool projects), `runtime:browser → runtime:bun`, any edge that would create a cycle.

**Gotchas sidestepped** (see the expanded set below for the tricky bits):

1. **Dashboards that Compose mounts** — `tool-observability-stack` builds its sources (JSON + YAML) into `dist/tool-observability-stack/`; Compose (rendered by `tool-compose`) references the `dist/` path, never a source path. `dependsOn` makes the mount always current.
2. **Dagger needs apps as container images, not as Nx build output** — `tool-dagger` declares `dependsOn: ["^build"]` for cache coherence but its real inputs are `apps/<name>/src/**` + `package.json` + `bun.lockb` + the relevant `tool-compose` template fragments. The tarball in `dist/tool-dagger/` is what Nx actually caches.
3. **Secrets and the cache** — `tool-secrets:decrypt` streams plaintext; `cache: false` on that target. Encrypted inputs ARE cacheable; plaintext never enters `.nx/cache`.
4. **Remote state is not an Nx input** — `tool-deploy` fetches `/srv/wbs/state/<tier>.last-deployed.json` at runtime and shells out to `nx affected` as a nested invocation. The outer `tool-deploy:deploy` target is `cache: false`.
5. **`.sops.yaml` at repo root** — SOPS resolves the key config by walking upward from the encrypted file, so the root location is required. `tool-secrets` owns the file logically; a symlink from `tools/tool-secrets/.sops.yaml` keeps IDE navigation sensible.
6. **`bootstrap.sh` is genuinely POSIX shell** — wrapped in `tool-bootstrap` anyway so it stays in the Nx graph (linted with `shellcheck` via `nx:run-commands`).
7. **No Compose file ever mounts source paths** — this discipline keeps Nx's input/output tracking sound.

**How a typical deploy flows through the graph** (`nx run tool-deploy:deploy -- --all`):

1. `tool-secrets:decrypt` streams `production.env.sops` through `sops -d` in-memory (cached per git-SHA of the `.sops` file's content hash).
2. `tool-dagger:publish-{be,gw,fe}` run in parallel. `dependsOn: ["^build"]` triggers app builds (cache-hit on unchanged apps). `tool-compose:build` also runs so per-tier templates are available. Output: three `release-<sha>-<tier>.tar.gz` in `dist/tool-dagger/`.
3. `tool-observability-stack:build` runs in parallel — copy/validate `*.yml` and dashboard JSON.
4. `tool-remote-scripts:build` bundles swap scripts via `bun build` (single-file JS output so no Bun install is needed inside each release).
5. `tool-deploy:deploy` reads remote state, runs `nx affected` to pick tiers, then scps bundles + observability dist + swap scripts, streams decrypted env, and invokes `bun /srv/wbs/bin/swap.ts <tiers>` remotely. Remote swap renders Caddyfile from fragments, health-checks, flips Caddy, drains blue, updates `/srv/wbs/state/<tier>.last-deployed.json`.

`nx affected -t deploy` handles change detection correctly: a change touching only `apps/be-01` produces `tool-dagger:publish-be` + `tool-deploy:deploy-be` in the execution plan; everything else is skipped via cache.

### D2. Caddy blue/green script internals (per-tier)

Three cooperating pieces: the Caddyfile template, the Compose file template, and the per-tier swap script. Blue/green color marker lives at `/srv/wbs/state/current-color` on the remote.

**Port allocation (fixed, not dynamic):**
- `be-01` blue: container port 3100 → host port 3100; green: 3101.
- `gw-01` blue: container port 3200 → host port 3200; green: 3201.
- Caddy always binds 443/80 externally and upstreams to the *active color's* host port.
- The swap script writes a rendered Caddyfile that references the new color's port, then runs `caddy reload --config /etc/caddy/Caddyfile`.

**Health gate (before Caddy swap):**
- Each service exposes `GET /health` returning `200 {"status":"ok"}` only when it is actually ready (for `be-01`: DB migrations applied; for `gw-01`: can reach `be-01`'s internal health endpoint).
- Swap script polls the green color's `/health` every 500ms up to 60s. Timeout → abort swap, rollback by not touching Caddy, leave blue in place.

**Caddy reload semantics:**
- `caddy reload` is graceful: existing HTTP requests finish against the old upstream; new requests route to the new upstream. For `/ws*`, **new** WS upgrades go to green; **existing** WS sockets on blue keep their old TCP connection until closed. This is exactly what we want.
- Caddy is run as a Compose service (not a host daemon) so reloads happen via `docker exec caddy caddy reload --config /etc/caddy/Caddyfile`.

**Drain window for `gw-01` (Layer B of the WS-survival plan):**
- After Caddy reload, swap script enters a drain loop: every 10s, query `gw-01` blue's `/metrics` for `gw_active_connections`. Exit loop when the counter hits 0 or after `DRAIN_TIMEOUT_SECONDS` (default 300 = 5 min).
- Optional: send a `{"reconnect":true}` app-level broadcast to blue's sockets to migrate clients proactively. Implemented as a CLI subcommand on `gw-01` (`bun apps/gw-01/src/cli.ts broadcast-reconnect`) callable via `docker exec`.

**Rollback:**
- Before Caddy reload: abort cleanly (stop green container, leave blue alive). No state damage.
- After Caddy reload but before blue is stopped: re-render Caddyfile pointing back at blue, `caddy reload`, then stop green. Blue never left the field.
- After blue is stopped: the previous release must be re-deployed from its bundle (kept in `/srv/wbs/releases/` for ≥ 3 versions). This is "roll forward to the old version," not a hot rollback.

### D3. Internal `gw-01` ↔ `be-01` contract

Three endpoints form the contract; all defined as ArkType schemas in `libs/contracts/src/internal-contract.ts` (package `@wbs/contracts`) and imported by both services.

**`POST /internal/push` on `gw-01`** (called by `be-01` to fan out to subscribers):
```
Request headers:  X-Internal-Auth: <shared-secret>
Request body:     {
                    subscription: string,    // routing key (e.g., "doc:<id>", "user:<id>")
                    seq: number,             // monotonic per-subscription, assigned by be-01
                    message: JsonValue,      // typed message envelope
                    trace_id?: string
                  }
Response:         202 Accepted { delivered_to_sockets: number }
                  | 401 if auth fails
                  | 400 if body fails ArkType validation
```

**`POST /internal/forward` on `be-01`** (called by `gw-01` for inbound client messages):
```
Request headers:  X-Internal-Auth: <shared-secret>
                  X-Client-Id: <user-id-from-JWT>
                  X-Connection-Id: <gw-assigned>
Request body:     { message: JsonValue, trace_id: string }
Response:         200 OK { ack: true, push_responses?: PushPayload[] }
                  | 401 if auth fails
                  | 5xx if backend errors (gateway logs + replies error frame to client)
```

**`POST /internal/resume` on `be-01`** (called by `gw-01` when a client reconnects and asks to resume from a per-subscription seq):
```
Request headers:  X-Internal-Auth: <shared-secret>
                  X-Client-Id: <user-id-from-JWT>
                  X-Connection-Id: <gw-assigned>
Request body:     {
                    resume_points: { [subscription]: number },   // last-seen seq per sub
                    trace_id: string
                  }
Response:         200 OK {
                    [subscription]: { status: "replaying", count: number }
                                   | { status: "denied", reason: "out_of_range" }
                  }
                  — server then follows up by calling /internal/push for each replayed event.
                  | 401 if auth fails
```

**Client-facing WS frame shape** (what `gw-01` sends over the socket and what clients parse):
```
{
  subscription: string,
  seq: number,
  message: JsonValue
}
```
Plus a handful of control frames: `{"type":"resume_ack", ...}`, `{"type":"resume_denied", ...}`, `{"type":"error", ...}`, `{"type":"pong", ...}`.

**Shared secret:**
- `INTERNAL_AUTH_SECRET` env var, set once in the remote `.env`, same value for both services. Rotated by a deploy of both services at once (compatible because both read from the same env).

**Error handling:**
- `gw-01 → be-01` unreachable: gateway returns an error frame `{"type":"error","code":"backend_unavailable","retry_after":5}` to the client; does **not** disconnect the socket. Client's reconnecting wrapper treats this as a soft error and retries its own message later.
- `be-01 → gw-01/internal/push` unreachable: backend retries with exponential backoff up to 30s; if still failing, writes the event to the durable `event_log` table so a future `/internal/resume` can surface it. Never drops silently.

**What ships in this change:** the three endpoints above, wired end-to-end, plus a single `ping` / `pong` message type for smoke-testing. Product message types land with their features.

### D4. JWT signing-key rotation

**Approach: dual-key validation window.**

- `JWT_SIGNING_KEY_CURRENT` and `JWT_SIGNING_KEY_PREVIOUS` env vars on `gw-01`.
- `gw-01` signs new JWTs with `CURRENT`.
- `gw-01` validates incoming JWTs against `CURRENT` first, falls back to `PREVIOUS` if present.
- To rotate: deploy with new `CURRENT` and old `PREVIOUS`. Wait until no one has a JWT signed by `PREVIOUS` anymore (e.g., one token-lifetime later; default lifetime is 1 hour). Next deploy drops `PREVIOUS`.

**Live WS socket behavior during rotation:**
- Rotation does not invalidate already-upgraded sockets (the JWT check happened at upgrade time; rotating the key doesn't re-check). Only *new* connections need the new key.
- If a socket reconnects during the rotation window, its token may be signed with `PREVIOUS` — dual-key validation accepts it. Safe.

**In this change:** only `CURRENT` is set; `PREVIOUS` is plumbed (env vars read, validator supports the second key) but left unset on first deploy. Rotation is exercised in a later change.

### D5. shadcn/ui under Nx — `@nx-extend/shadcn-ui`

- **Use [`@nx-extend/shadcn-ui`](https://www.npmjs.com/package/@nx-extend/shadcn-ui).** Specific package name; no spike needed to pick between candidates.
- Integration smoke test (part of the first-deploy verification): generate a `Button` via the plugin's generator and import it in the TanStack Router root route; `nx run fe-01:build` must pass.
- **Fallback path if the plugin breaks on our Vite + TanStack Router setup**: use the shadcn CLI directly with a manually maintained `components.json` pointing at `apps/fe-01/src/components/ui/` and a tsconfig path alias `@/components`. Budget the fallback to ~1 hour of attempts before switching, not as a reason to re-evaluate the rest of the stack.

### D6. Dagger module structure — `tools/tool-dagger/`

**Per-app modules composed by a root module, all inside the Nx project `tool-dagger`.**

Structure (inside `tools/tool-dagger/`):
```
dagger.json                ← Dagger module manifest
project.json               ← Nx project config (targets below)
src/
  main.ts                  ← root module, exposes top-level targets
  be-01.ts                 ← build-be, test-be, publish-be
  gw-01.ts                 ← build-gw, test-gw, publish-gw
  fe-01.ts                 ← build-fe, test-fe, publish-fe
  lib/
    image.ts               ← shared image-building helpers (Bun base, cache mounts)
    bundle.ts              ← shared bundle-packaging helpers (tarball shape)
```

**Nx targets on `tool-dagger`** (invoked via `nx run tool-dagger:<target>`, all wrapping `dagger call …` via `nx:run-commands`):
- `build-be` / `build-gw` / `build-fe` — produce a container image (or static-asset dir for FE).
- `test-be` / `test-gw` / `test-fe` — run unit + integration tests in a throwaway container.
- `publish-be` / `publish-gw` / `publish-fe` — build + test + package into `dist/tool-dagger/release-<sha>-<tier>.tar.gz`.
- `publish-all` — fans out the three `publish-*` in parallel (Nx schedules them).

**Nx inputs/outputs wired for caching:** each `publish-*` declares `inputs: [apps/<tier>/**, tool-compose/src/templates/<tier>.*, package.json, bun.lockb]` and `outputs: [dist/tool-dagger/release-<sha>-<tier>.tar.gz]`. Cache hits skip the Dagger run entirely when nothing relevant has changed.

**Why per-app modules inside one Nx project**: maps to the three independently deployable tiers, keeps each module small, matches Nx's project-level affected detection. A single top-level Dagger module would force cross-app reasoning into one file. A *separate Nx project per app's Dagger module* would fragment the Dagger daemon usage without payoff.

### D7. Dagger ↔ Bun-script handoff contract (publish bundle format)

Each per-tier bundle is a gzipped tar with a fixed layout. Validated at unpack time; deploy aborts on schema mismatch.

**`release-<sha>-be.tar.gz`:**
```
VERSION              ← git SHA (short form, 8 hex chars)
META.json            ← { tier: "be", sha: "...", built_at: "...", image_id: "sha256:...", schema_version: 1 }
image.tar            ← docker save output for be-01
templates/
  Caddyfile.tmpl     ← Caddy routing fragment for /api*
  compose.tmpl       ← Compose fragment for the be-01 service
```

**`release-<sha>-gw.tar.gz`:** same shape with `tier: "gw"`, the gw-01 image, and gw-specific Caddyfile/compose fragments.

**`release-<sha>-fe.tar.gz`:** static assets plus Caddyfile fragment.
```
VERSION
META.json            ← { tier: "fe", sha: "...", built_at: "...", schema_version: 1 }
www/
  index.html
  assets/...
templates/
  Caddyfile.tmpl     ← Caddy site root fragment
```

**`META.json.schema_version`** exists so future bundle format changes are detectable. The deploy script errors out if the version it reads doesn't match a known-supported version.

**Deploy-target arg surface (per tier)** — arguments pass through `nx run` with `--`:
```
nx run tool-deploy:deploy-be -- [--version=<sha>] [--dry-run] [--skip-build] [--bundle=<path>]
```
- `--version`: deploy a specific version. Default: build from `HEAD`.
- `--dry-run`: print the plan (what would be built/shipped/swapped), don't execute.
- `--skip-build`: use the already-built bundle from `dist/tool-dagger/` instead of calling Dagger.
- `--bundle`: explicitly name the tarball to deploy (useful for rollback).

**Orchestrator:**
```
nx run tool-deploy:deploy -- [tiers...] [--all] [--since=<sha>] [--dry-run]
```
- No args: `tool-deploy` fetches remote last-deployed SHAs and shells out to `nx affected` to pick tiers.
- Explicit list: `nx run tool-deploy:deploy -- be gw`.
- `--all`: force all tiers.
- `--since`: override baseline SHA.

### D8. Change-detection baseline storage

**Decision: last-deployed SHA lives on the remote, one file per tier.**

`/srv/wbs/state/<tier>.last-deployed.json`:
```json
{ "tier": "be", "sha": "abc1234", "deployed_at": "2026-04-19T20:30:00Z", "bundle": "release-abc1234-be.tar.gz" }
```

Orchestrator flow:
1. At start, `ssh <host> cat /srv/wbs/state/{be,gw,fe}.last-deployed.json` (single shot, handle missing files).
2. For each tier, run `nx affected --projects=<tier's nx project> --base=<that tier's last-deployed sha>` — or a wrapper that handles the "no baseline found" case.
3. If baseline missing for a tier → treat as "affected" (deploy it).
4. On successful swap, the per-tier script updates `<tier>.last-deployed.json` on the remote.

**Why remote-only, not also local:**
- Single source of truth. No divergence between workstation and remote.
- Multiple workstations (future) all see the same state.
- Commitable baseline files in the repo would drift when multiple people deploy; gitignored local state can't be compared across developers.

**Fallback when remote is unreachable:** prompt the user (`--assume=all` or `--assume=none` flag for non-interactive use).

**SHA vs Dagger content-hash:** SHA only. Dagger content-hash would catch deploys where the code hasn't changed but a dependency did; in practice, that's rare enough (dependabot-style bumps trigger a new commit anyway). Revisit if we start getting "nothing changed, yet the deploy misses something" bugs.

### D9. Shared-infra coupling (Caddyfile / Compose)

**Decision: composed from per-tier templates.**

- Each tier's bundle ships a `Caddyfile.tmpl` fragment and a `compose.tmpl` fragment scoped to that tier.
- The remote swap script assembles the full Caddyfile by concatenating fragments from all three tiers (plus a static observability-stack fragment installed once during bootstrap).
- If only `be-01` is deploying, its fragment is the only one re-rendered; the other fragments are read from their last-known state on disk (`/srv/wbs/state/fragments/{gw,fe,observability}/Caddyfile.tmpl`).
- After a deploy, the fresh fragments for that tier are written back to `/srv/wbs/state/fragments/<tier>/`.

**Why fragments over a single monolithic Caddyfile:**
- Lets a single-tier deploy update only its own routing without touching others.
- Prevents stale config for other tiers from being accidentally re-applied.
- Observability fragment (Grafana subdomain + basic auth) is authored once and never touched by app deploys.

### D10. `tool-bootstrap` — remote host setup

The Nx project `tools/tool-bootstrap/` owns remote-host bootstrapping. Two targets:
- `nx run tool-bootstrap:build` — `shellcheck` lints `bootstrap.sh`; no bundling needed.
- `nx run tool-bootstrap:push -- --host=<host>` — scps `bootstrap.sh` to `/tmp/` and `ssh` executes it.

**`bootstrap.sh`** is POSIX shell (`#!/bin/sh`), the single `.sh` file the scaffold ships. Run once per Hetzner host. Target: Debian 12 / Ubuntu 24.04 (Hetzner's Cloud default).

```sh
#!/bin/sh
set -eu

# Bun version pinned for reproducibility; updated in future changes.
BUN_VERSION="1.1.34"

# Idempotent: skip if Bun at the right version is already installed.
if command -v bun >/dev/null 2>&1; then
    current="$(bun --version 2>/dev/null || echo "")"
    if [ "$current" = "$BUN_VERSION" ]; then
        echo "bun ${BUN_VERSION} already installed, skipping"
        exit 0
    fi
fi

curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}"

# Ensure Bun is on PATH for subsequent SSH sessions (the installer adds to ~/.bashrc).
# Our deploy scripts use absolute /root/.bun/bin/bun so PATH-ordering on login doesn't matter.

echo "bun ${BUN_VERSION} installed at $(command -v bun || echo "/root/.bun/bin/bun")"
```

**Additional one-time setup the bootstrap script also does** (kept in the same file for simplicity):
- Ensure `docker` and `docker compose` are available (install via `get.docker.com` if missing).
- Ensure `/srv/wbs/{releases,staging,state,state/fragments,www,bin,observability}` directories exist with owner `root:root`, mode `0755`.

**Not installed by bootstrap** (intentionally): SOPS and age. Decryption happens on the *developer workstation* (D18) and the decrypted `.env` is streamed over SSH. The remote never needs the age private key or SOPS binary — reducing the attack surface.

### D11. Prometheus plugin choice

**Decision: Elysia OTel plugin (`@elysiajs/opentelemetry`) with Prometheus exporter.**

- OTel is more future-proof: when tracing becomes useful (post-sync feature), we wire in Tempo and the existing instrumentation picks up traces automatically. Prometheus-only plugin would need to be swapped out at that point.
- The OTel plugin exports metrics to Prometheus via the OTel Prometheus exporter (scrape target at `/metrics`). No performance difference at this scale.
- Cost: slightly heavier dep, marginally more config. Accepted for the forward-compat payoff.

### D12. Log-field schema (structured, filterable)

Defined in `libs/observability/src/log-schema.ts` as an ArkType schema, enforced via a pino serializer:

```ts
const LogRecord = type({
    level: "'trace'|'debug'|'info'|'warn'|'error'|'fatal'",
    time: "number",                          // unix ms
    msg: "string",
    service: "'be-01'|'gw-01'|'fe-01'",      // 'fe-01' for client-side logs shipped via batched POST
    request_id: "string?",                   // set by HTTP middleware
    connection_id: "string?",                // set by gw-01 for WS-initiated logs
    user_id: "string?",                      // set after JWT decode; null for unauth requests
    ws_subscription: "string?",              // WS routing key (e.g., "doc:<id>") — set when the log is emitted in the context of a specific WS subscription (gw-01 fan-out, be-01 push/resume)
    trace_id: "string?",                     // set by OTel middleware
    span_id: "string?",                      // set by OTel middleware
    version: "string?",                      // app git SHA, injected at build time
    "err?": {
        name: "string",
        message: "string",
        stack: "string?"
    },
    "[string]": "unknown"                    // arbitrary extra fields
});
```

- Pino base config in `libs/observability/src/logger.ts` wraps pino with default fields populated from Elysia context (middleware injects `request_id`, `user_id`, `trace_id` into the logger child).
- For WS-initiated code paths in `gw-01`, a per-socket child logger carries `connection_id` and (when applicable) `ws_subscription` through all downstream calls.
- `ws_subscription` is deliberately prefixed `ws_` to make the WS origin unambiguous at log-read time — it won't be confused with unrelated "subscription"-shaped things we might add later (billing subscriptions, mailing-list subscriptions, etc.).

**Loki label strategy for efficient filtering:**
- Indexed **labels** (low-cardinality, used in LogQL `{label=value}` selectors): `service`, `level`, `version`. These are the fields Loki uses for its bucket index — keep cardinality < ~1000 per label.
- **Structured-metadata** (indexed but not bucket-defining, Loki 3.0+): `request_id`, `connection_id`, `trace_id`, `span_id`, `ws_subscription`. Queryable via `| json | connection_id="abc"` without cardinality explosion.
- **High-cardinality fields** (`user_id`, arbitrary extras): flow through as raw JSON fields; queryable via `| json | user_id="xyz"` but NOT promoted to labels. This prevents Loki series explosion at scale.
- Promtail pipeline in `tools/tool-observability-stack/src/promtail.yml`:
  ```yaml
  pipeline_stages:
    - json:
        expressions:
          level: level
          service: service
          version: version
          request_id: request_id
          connection_id: connection_id
          user_id: user_id
          trace_id: trace_id
          ws_subscription: ws_subscription
    - labels:       { level, service, version }
    - structured_metadata: { request_id, connection_id, trace_id, span_id, ws_subscription }
  ```
- Typical filter queries the dashboards ship:
  - All logs for a user across services: `{service=~"be-01|gw-01"} | json | user_id="<uid>"`
  - One request end-to-end: `{service=~"be-01|gw-01"} | json | request_id="<rid>"`
  - All errors on a given version: `{level="error", version="<sha>"}`
  - Everything a WS connection did: `{service="gw-01"} | json | connection_id="<cid>"`
  - Everything on a WS routing stream: `{service=~"be-01|gw-01"} | json | ws_subscription="doc:<id>"`

### D13. Gateway custom metrics

All Prometheus-style. Names use `gw_` prefix for namespacing.

| Name | Type | Labels | Description |
|---|---|---|---|
| `gw_active_connections` | gauge | — | Current count of open WS sockets |
| `gw_connections_total` | counter | `outcome` ∈ {accepted, rejected_auth, rejected_other} | Total WS upgrade attempts |
| `gw_reconnects_total` | counter | — | Client reconnects (from resume-protocol header, once Layer A ships) |
| `gw_message_fanout_total` | counter | `subscription_kind` (e.g., "doc", "room") | Server→client messages fanned out via `/internal/push` |
| `gw_inbound_messages_total` | counter | `kind` | Client→server messages forwarded to `be-01` |
| `gw_drain_seconds` | histogram | — | Drain-window duration, recorded once per graceful shutdown |
| `gw_backend_unavailable_total` | counter | — | Times the gateway failed to reach `be-01`'s `/internal/forward` |

Cardinality discipline: no labels derived from user-controlled strings (user-id, doc-id) to avoid Prometheus series explosion. Subscription kinds are a closed enum.

### D14. Grafana bootstrap — dashboards as code, lived in `tool-observability-stack`

**Decision: dashboards committed to the `tool-observability-stack` project as JSON, provisioned into Grafana on container start.**

Structure (inside `tools/tool-observability-stack/`):
```
project.json
src/
  grafana/
    provisioning/
      datasources/
        loki.yml
        prometheus.yml
      dashboards/
        default.yml
    dashboards/
      be-01-overview.json
      gw-01-overview.json
      wbs-alerts.json
  prometheus.yml
  promtail.yml
  loki.yml
```

Nx targets:
- `nx run tool-observability-stack:build` — copies source into `dist/tool-observability-stack/` and validates: JSON-schema check on Grafana dashboard JSON; `promtool check config prometheus.yml`; `promtail -check-syntax promtail.yml`.
- `nx run tool-observability-stack:lint` — yaml-lint + json-lint + shellcheck on anything shell-adjacent.

Compose (rendered by `tool-compose`) references `dist/tool-observability-stack/` (never the source path). Grafana reads provisioning at boot and applies datasources + dashboards. Editing in the UI is allowed for exploration but changes intended to stick must be exported to JSON and committed.

Seed dashboards shipped in this change:
- **be-01 overview**: request rate, p50/p95/p99 latency, 5xx rate, active DB connections, `event_log_rows_total`, `resume_replays_total`.
- **gw-01 overview**: active connections gauge, reconnect rate, fanout rate, drain histogram, `gw_backend_unavailable_total`.
- **wbs-alerts**: alert state panel driving the two Grafana-managed alert rules (D16).

### D15. Observability access path

**Decision: subdomain `observability.<app-domain>` fronted by Caddy with basic auth + TLS.**

- Subdomain preferred over path prefix because: Grafana assumes it owns its entire URL root and misbehaves under path prefixing without significant config. Loki/Prometheus admin UIs behave similarly.
- TLS: Caddy provisions automatically if the DNS A record exists at deploy time.
- Basic auth: single admin account; password in remote `.env` as `OBSERVABILITY_BASIC_AUTH_HASH` (bcrypt hash, generated locally and copied into env).
- Upstream: Caddy → Grafana (port 3000 internally). Loki / Prometheus / Promtail are *not* directly exposed — Grafana is the single UI.

**Fallback** if DNS / wildcard cert isn't set up: path-based `/_obs/grafana/` with Grafana's `root_url` and `serve_from_sub_path` configured. Documented but not the default.

### D16. Alert notification channel

**Decision: [ntfy.sh](https://ntfy.sh)** for the initial two alerts ("service down", "5xx rate spike"). Picked for simplicity above all else. Telegram rejected on ownership-jurisdiction grounds; WhatsApp rejected as impractical for a solo hobby project (Meta Business verification, dedicated phone number, template-message approvals, no native Grafana contact point).

- **Transport**: Grafana → HTTP POST to a long random topic URL, e.g., `https://ntfy.sh/wbs-alerts-7fK2pQ9xLm-<random>`. Grafana has a native webhook contact point; no bridging service needed.
- **Delivery**: push to iOS/Android apps, desktop app, browser, or CLI. Priority flags bypass Do-Not-Disturb for the "service down" alert.
- **Security**: topic name is a long random string and functions as a bearer secret on the public ntfy.sh instance. Migration path if that's ever insufficient: `docker run binwiederhier/ntfy` on the same Hetzner box, point Grafana at the local URL, add token-based auth. No code change, no URL format change — just swap the host.
- **Ownership**: open source, German developer (Philipp Heckel), no Russia connection.
- **Why over Slack/Discord despite those being valid**: zero account setup, zero workspace/server provisioning, the "POST to a URL" model matches the experimental-for-fun posture, and the migration path to self-hosted is trivial. Slack and Discord both work fine but carry more friction for a solo dev with no existing workspace.
- **Alternatives documented but not default**, switchable via env `NOTIFY_CHANNEL=ntfy|slack|discord|email` (default `ntfy`):
  - **Slack Incoming Webhook** — native Grafana contact point, US jurisdiction (Salesforce); good if already in a Slack workspace.
  - **Discord webhook** — similar shape to Slack, US jurisdiction; good if already in Discord.
  - **Email (SMTP)** — universal fallback; slower, easier to miss.
  - **Gotify self-hosted** — Android-first, weak iOS; compelling only if you want everything self-hosted from day one.

**Managed secrets for notifications** (in SOPS, depending on chosen channel):
- `NTFY_TOPIC_URL` (default)
- `SLACK_WEBHOOK_URL` (alternative)
- `DISCORD_WEBHOOK_URL` (alternative)
- `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_HOST` (alternative)

### D17. Layer-A resume protocol (ships in this change)

The WebSocket resume-on-reconnect protocol is promoted from "deferred" to "ships now". Without product message types, the scaffold proves the protocol with a single `ping`/`pong` exchange; real messages plug in later.

**Sequence ownership:**
- Every message emitted via `gw-01 → client` carries `{subscription, seq, message}`.
- `seq` is **per-subscription**, monotonic, assigned by `be-01` at the moment it calls `/internal/push`.
- Subscriptions are opaque strings (routing keys). Example shapes: `doc:<uuid>`, `user:<uuid>`, `room:<id>`. No cardinality ceiling imposed by the protocol — metrics labels (D13) are what prevent explosion.
- Seq counters live in SQLite table `event_sequencer(subscription TEXT PRIMARY KEY, next_seq INTEGER NOT NULL)` with row-level `UPDATE ... RETURNING next_seq; next_seq = next_seq + 1` performed atomically in a single transaction alongside the insert to `event_log`.

**Replay buffer (`be-01`):**
- **In-memory ring** per subscription: LRU, keyed on `subscription`, holds up to 1000 events per subscription or 5 minutes of history, whichever is smaller. Fast path for reconnect.
- **Durable fallback**: `event_log(id INTEGER PK, subscription TEXT, seq INTEGER, message BLOB, created_at INTEGER, UNIQUE(subscription, seq))`. Last 10,000 events per subscription retained by a housekeeping job (cron-ish Bun script inside `be-01`, runs every 5 min).
- **Out-of-range** reconnect: `seq + 1` older than the oldest retained row in `event_log` for that subscription → `resume_denied: out_of_range`. Client responsibility: discard local state for that subscription and re-fetch via HTTP.

**Reconnect handshake:**
- Client's reconnecting wrapper, on socket open, sends first frame: `{"type":"resume","resume_points":{"doc:abc": 42, "user:xyz": 7}}`.
- `gw-01` forwards to `be-01`'s `/internal/resume` endpoint.
- `be-01` responds with per-subscription status; for each `replaying` subscription, it sends `/internal/push` calls (with the original seq numbers) that `gw-01` routes to the reconnecting client.
- After replay completes, `gw-01` emits `{"type":"resume_ack","replayed":{"doc:abc": 7, ...}}` so the client knows it's caught up and can resume sending.
- If a subscription returns `resume_denied`, the client UI shows a "reconnected, re-syncing" state and kicks off an HTTP re-fetch.

**Client-side reconnecting WebSocket wrapper:**
- Location: `libs/realtime/src/reconnecting-ws.ts` (package `@wbs/realtime`).
- API (sketch):
  ```ts
  const ws = createReconnectingWs({
      url: "wss://app.example.com/ws",
      jwt: () => Promise<string>,         // called fresh on each (re)connect
      onFrame: (frame) => void,
      onStateChange: (state: "open"|"reconnecting"|"denied"|"closed") => void,
      subscriptions: SubscriptionTracker,  // stores last_seq per subscription in localStorage
  });
  ws.send({subscription, message});
  ws.subscribe(subscription);
  ws.unsubscribe(subscription);
  ```
- Backoff: starts at 500ms, doubles up to 30s cap, ±20% jitter on every attempt. Stops trying after 1 hour of continuous failures (emits `onStateChange("closed")`; user-facing UI must surface this).
- Heartbeat: sends `{"type":"ping"}` every 25s; expects `{"type":"pong"}` within 10s. Missing pong → treat socket as dead, tear down, rely on backoff-reconnect loop.
- Subscription tracker: serializes `{ subscription: last_seq }` to localStorage on every received frame. On next page load, the map is already populated so the first reconnect can resume immediately.

**TanStack DB adapter** (thin, in `libs/realtime/src/tanstack-adapter.ts`):
- Wraps the reconnecting WS wrapper as a TanStack DB sync engine.
- Ships as a stub in this change — present, typed, `ping`/`pong`-tested, not connected to any TanStack DB collection yet.

**What ships now:**
- `EventSequencer` service in `be-01` with the schema above.
- `event_log` table + retention job.
- `/internal/resume` endpoint in `be-01`.
- Resume handshake handling in `gw-01` (forward-to-be, replay-via-push).
- `reconnecting-ws.ts` + `tanstack-adapter.ts` in `@wbs/realtime`.
- End-to-end `ping`/`pong` test that proves: connect → ping → pong → disconnect → reconnect with stale seq → server replays missed pongs → `resume_ack` fires.

**What does not ship:**
- Real product subscriptions (doc edits, presence, etc.) — those are future changes.
- Auth on subscribe/unsubscribe operations beyond JWT-at-upgrade — a subscription filter per user will be added alongside the first real subscription kind.
- Cross-backend-instance seq coordination — single backend instance, so a single sequencer, no coordination needed.

### D18. Secrets management — SOPS + age, encrypted at rest

**Decision: files encrypted in the repo via [SOPS](https://github.com/getsops/sops) with [age](https://age-encryption.org) as the key backend.** Plain `.env` is forbidden in git.

**File layout:**
```
tools/tool-secrets/src/
├── production.env.sops       # SOPS-encrypted dotenv; committed to repo
├── staging.env.sops           # future; committed
├── local.env.example          # placeholder template, gitignored real local.env per developer
├── README.md                  # how to decrypt, add recipients, rotate
└── cli/{decrypt.ts,push.ts}   # Bun CLIs invoked via nx run tool-secrets:<target>
.sops.yaml                     # committed at repo root; lists age recipient public keys
```

`.sops.yaml` root config:
```yaml
creation_rules:
  - path_regex: tools/tool-secrets/src/.*\.env\.sops$
    age: >-
      age1... (developer 1 public key),
      age1... (developer 2 public key — placeholder for future)
```

**Age key management:**
- Private key on each developer workstation: `~/.config/sops/age/keys.txt` (SOPS default).
- Private key NEVER committed and NEVER placed on the remote host.
- Public keys (age recipients) committed in `.sops.yaml` so everyone with a matching private key can decrypt.
- Backup: each developer is expected to store their age private key in a password manager. Losing it = losing access to all secrets files encrypted for that key. Recovery = another recipient decrypts, re-encrypts for the new key.

**Rotation flow** (`sops updatekeys` is the one-shot):
1. Generate new age keypair: `age-keygen -o new-key.txt`.
2. Add new public key to `.sops.yaml` under the relevant `creation_rules`.
3. Run `sops updatekeys secrets/production.env.sops` — re-wraps the file-level data key for all current recipients. Commit.
4. Distribute the new private key to the intended human via a secure channel (1Password, Bitwarden share, signal, etc.).
5. After a grace period, remove the old public key from `.sops.yaml` and `sops updatekeys` again. Commit.

**Deploy flow:**
- `nx run tool-deploy:deploy` detects the target environment (defaults to `production`) and invokes `nx run tool-secrets:push` at the SSH boundary.
- `tool-secrets:push` runs `sops -d tools/tool-secrets/src/production.env.sops` locally — decrypted content is kept only in memory (Bun stream), never written to the developer's disk.
- Streams the decrypted content over `ssh` to the remote, landing at `/srv/wbs/.env` with `chmod 0600`.
- On the remote, Docker Compose reads `/srv/wbs/.env` normally. Plaintext at runtime is unavoidable for a Compose-based setup; mitigated by `0600` perms and root-only access to the host.

**Managed secrets** (all via SOPS — exact list per `tools/tool-secrets/src/README.md`):
- `INTERNAL_AUTH_SECRET`
- `JWT_SIGNING_KEY_CURRENT`, `JWT_SIGNING_KEY_PREVIOUS`
- `OBSERVABILITY_BASIC_AUTH_HASH` (bcrypt of Grafana admin password)
- `NTFY_TOPIC_URL` (default notification channel, see D16)
- `SLACK_WEBHOOK_URL?`, `DISCORD_WEBHOOK_URL?` (alternative notification channels)
- `SMTP_USER?`, `SMTP_PASSWORD?`, `SMTP_HOST?` (email-fallback channel, optional)

Telegram is intentionally NOT in this list — rejected in D16 on ownership-jurisdiction grounds.

**Non-secrets** (domain names, port numbers, log levels, etc.) stay in committed plain `.env.example` and are merged with the decrypted secrets at deploy time.

**Pre-commit hook** (part of this change, installed by `nx run tool-git-hooks:install` — see D21):
- Rejects any commit that adds a file matching `.env` or `*.env` *without* the `.sops` suffix or the `.example` suffix.
- Rejects commits that introduce an obviously-plaintext secret pattern (AWS keys, JWT-looking strings) anywhere in the diff. Heuristic, not a full secret scanner — but enough to catch obvious mistakes.

**Why SOPS + age over alternatives:**
- vs. `git-crypt`: SOPS encrypts per-value, so git diffs remain meaningful (one encrypted string changed, not a whole binary blob). Better review ergonomics.
- vs. HashiCorp Vault / AWS KMS: no runtime infra, no network dependency, no seal/unseal dance. Fits single-dev single-box scale.
- vs. plain age: SOPS adds structured format (YAML/JSON/dotenv) and key-rotation tooling. age is a primitive; SOPS is the product.
- vs. 1Password CLI or similar: vendor lock-in, network dependency, no offline deploys.
- **Migration path if scale grows**: SOPS backends are swappable. `age` → AWS KMS / GCP KMS / HashiCorp Vault Transit without changing file format. The only code change is in `.sops.yaml` and the SOPS invocation.

**What ships in this change:**
- `.sops.yaml` at repo root with a single age recipient (the first developer's public key).
- `tools/tool-secrets/src/production.env.sops` populated with placeholder ciphertext for all the variables listed above.
- `tools/tool-secrets/src/local.env.example` documenting the variables a developer needs for local dev.
- `tools/tool-secrets/src/README.md` with the rotation playbook and first-time setup instructions.
- `tools/tool-secrets/src/cli/decrypt.ts` — Bun CLI that streams decrypted content to stdout; `cache: false` Nx target.
- `tools/tool-secrets/src/cli/push.ts` — decrypt + scp in one pass, never touches workstation disk.
- `tools/tool-git-hooks/src/hooks/pre-commit` — enforces the plaintext-secret guard via lefthook (see D21).
- `tool-deploy` targets wired to `nx run tool-secrets:decrypt` at the SSH boundary.

### D19. Library decomposition — `@wbs/*` replaces `libs/lib-01`

**Decision: drop the `lib-NN` numeric convention; use semantic `@wbs/<domain>` names.** The numeric scheme made sense while ownership was undecided; with clear concerns per lib, semantic names are self-documenting and survive refactors. Each lib lives in `libs/<name>/` with `name: "@wbs/<name>"` in its `package.json`.

Seven libs, each with a distinct concern:

| Lib | Consumers | Public API (representative exports) | Runtime | Depends on |
|---|---|---|---|---|
| **`@wbs/validation`** | every app + every other lib | `type` (re-export of ArkType), `defineSchema`, `parseOrThrow`, `ValidationError`, `InferSchema<T>`, branded-type helpers | isomorphic | — |
| **`@wbs/domain`** | be-01, gw-01, fe-01, contracts | `WbsItem`, `Estimate`, `Dependency`, `WbsItemId` (branded), domain schemas, pure domain invariants | isomorphic | `@wbs/validation` |
| **`@wbs/contracts`** | be-01, gw-01, fe-01 | HTTP request/response schemas (public + internal be↔gw), WS envelope schemas, resume-protocol message types (`seq`, `ack`, `resume`, `resume_ack`, `resume_denied`), error-code enum | isomorphic | `@wbs/validation`, `@wbs/domain` |
| **`@wbs/observability`** | be-01, gw-01, fe-01 (browser subset), `@wbs/scripts` | `createLogger(service)`, log-field schema (D12), pino serializers, `Counter`/`Histogram`/`Gauge` wrappers, Elysia `/metrics` plugin, request-id + trace-id helpers | isomorphic core; Prometheus registry + `/metrics` plugin under sub-path `@wbs/observability/server` (Bun-only) | `@wbs/validation` |
| **`@wbs/config`** | every app, `@wbs/scripts` | `defineConfig(schema)`, standard env schemas (port, log-level, URLs), SOPS-decrypted-file loader, config-assertion helpers | Bun-only | `@wbs/validation`, `@wbs/observability` |
| **`@wbs/realtime`** | fe-01 only | `ReconnectingWsClient`, resume-protocol state machine, replay-buffer types, `createTanstackDbAdapter`, connection-status store | browser-only | `@wbs/contracts`, `@wbs/observability` (browser subset) |
| **`@wbs/scripts`** | `tool-*` projects | `$` wrapper with structured error handling, SSH command builder, SOPS encrypt/decrypt helpers, Dagger argument helpers, file/path utilities, typed JSON/YAML readers | Bun-only | `@wbs/validation`, `@wbs/observability`, `@wbs/config` |

**Dependency DAG** (no cycles):
```
validation
   ├── domain
   │    └── contracts
   │         └── realtime (browser)
   └── observability
        └── config (bun)
             └── scripts (bun)
```

`@wbs/realtime` deliberately does not depend on `@wbs/domain`. Transport envelopes are all it needs; domain payloads flow through as opaque validated blobs.

**Rejected / consolidated candidates** (documented so the rejections don't need re-litigating):
- **`@wbs/utils`** — rejected. Grab-bag magnet. Generic helpers (`assertNever`, `Result`, branded-type helpers) live in `@wbs/validation`; anything else belongs to a specific domain lib.
- **Split `logging` + `metrics`** — rejected. They share field conventions and request-id plumbing; one lib (`@wbs/observability`) is right.
- **Split `http-contracts` + `ws-contracts`** — rejected. Same versioning cadence; one `@wbs/contracts` with sub-path exports.
- **`@wbs/errors`** — rejected. Error types belong to the lib owning the failure domain.
- **`@wbs/types`** — rejected. Types without behavior aren't a library; they belong with their owning concern.
- **`@wbs/sops`, `@wbs/dagger` as separate libs** — rejected. These are scripting surfaces; they live inside `@wbs/scripts` as sub-modules.

**Nx tags** on each lib enforce boundaries:
- `scope:shared` — every lib.
- `type:validation|domain|contracts|observability|config|realtime|scripts` — exactly one per lib.
- `runtime:isomorphic|bun|browser` — enforces that browser code never imports Bun-only libs, and vice versa.

### D20. Test strategy

The codebase is largely implemented by AI subagents under TDD; tests must be a durable source of truth for "what this code is supposed to do" because fresh subagents don't inherit prior-turn context.

**Layered testing:**

| Layer | Covers | Tool | Location | Nx target | Runtime budget |
|---|---|---|---|---|---|
| **Unit** | Pure functions, ArkType validators, serializers, React hooks (logic only) | `bun test` (libs, be-01, gw-01) + `vitest` + jsdom (fe-01) | `src/**/*.test.ts` colocated | `nx test <proj>` | <2s per project |
| **Integration** | be-01 routes against `bun:sqlite(:memory:)` + Drizzle migrations; gw-01 WS handlers against real `new WebSocket`; Elysia app boot; `/internal/push` + `/internal/forward` + `/internal/resume` round-trips | `bun test` with `app.handle(req)` + native WS | `src/**/*.integration.test.ts` | `nx test <proj>` (same target, name filter on CI) | <10s per project |
| **Contract** | Internal HTTP contract between be-01 and gw-01 (both directions) — one ArkType schema, two consumers | `bun test` + shared schemas from `@wbs/contracts` driving both producer and consumer test files | `libs/contracts/src/**/*.contract.test.ts` | `nx test contracts` | <3s |
| **Property** | Layer-A resume protocol invariants, ArkType round-trips, sequence/ack math | `fast-check` inside `bun test` | `src/**/*.property.test.ts` | same `nx test <proj>` | <20s per project, seeded |
| **E2E** | Full stack via Docker Compose: browser → fe-01 → be-01 → gw-01, DB persisted, real WS | `playwright` (Chromium only; WS first-class) | `apps/fe-01-e2e/tests/**.spec.ts` as a separate Nx project | `nx e2e fe-01-e2e` | full: <90s; `@smoke`-tagged subset: <20s |
| **Smoke / Deploy** | Post-deploy health: `/metrics` responds, WS handshake succeeds, `ping`/`pong` resume flow works | `bun test` scripts under `tool-smoke` | `tools/tool-smoke/src/**.smoke.test.ts` | `nx run tool-smoke:check -- --env=prod` | <15s |
| **Mutation** | `libs/*` only (pure, high-leverage) | `stryker` with `bun test` runner | `libs/<lib>/stryker.conf.json` | `nx run <lib>:mutation` | 5-15 min, SKIPPED by default, run weekly |

Test files colocated next to the implementation (`*.test.ts`) — except E2E (separate Nx project) and mutation (separate config). One convention, no divergence.

**Ergonomics rules for agent-driven TDD** — baked into the repo's lint/convention:
1. Test names state the invariant, not the action (`"replay buffer never delivers seq <= last_acked"`, not `"it works"`).
2. One assertion concept per test.
3. No snapshots except tiny ArkType-derived JSON schemas; HTML/DOM snapshots banned.
4. Deterministic clock + RNG — inject `now()` and `random()`; never read `Date.now()` in code under test. `fast-check` seeds are pinned.
5. Failure messages embed the offending value.
6. No shared mutable fixtures across tests — factories only (`makeMessage({seq: 3})`).
7. No network, no filesystem, no clock in unit tests — enforced by ESLint rule banning those imports in `*.test.ts` not marked `.integration.` or `.e2e.`.
8. Arrange-Act-Assert separated by blank lines (a shape subagents pattern-match on).
9. Red-before-green in TDD flow — the subagent must show failing output before writing production code.
10. Public API only in tests — no `@ts-expect-error`-gated internal imports; if it needs testing, it needs exporting.

**Test data and fixtures:**
- ArkType schemas in `@wbs/contracts` + `@wbs/domain` are the single source of truth.
- `libs/validation/src/test-fixtures.ts` (sub-path export `@wbs/validation/fixtures`) exposes `makeTestDb()` (in-memory SQLite with Drizzle migrations), `makeFrame()` (WS frame factory), `makeWbsItem()` (domain factory). Consumers import from this single location; no ad-hoc duplication.

**Layer-A resume protocol invariants** (fast-check, modeling a session):
- Monotonic delivery: `receivedSeqs` strictly increasing modulo dropped duplicates.
- No replay below ack: server never emits `seq <= clientLastAck` after any reconnect.
- Buffer bound: `|buffer| <= BUFFER_MAX` across any interleaving.
- Handshake idempotency: N consecutive `{type:"resume"}` frames produce identical post-state.
- Drain termination: given a finite buffer and no new produces, drain completes in ≤ `|buffer|` server sends.
- Session isolation: two clients never cross-deliver messages.

Integration tests exercise the real WS loop: clean connect, mid-stream disconnect with in-flight frames, reconnect beyond buffer window (surfaces `resume_denied`), duplicate reconnect race, ack-then-disconnect before server sees ack.

**Coverage stance:** **line coverage enforced at 85% for `libs/*` only; not enforced for apps.** Apps are dominated by wiring whose coverage number lies (Elysia route registration inflates it). Libs are pure and high-leverage, and they're where subagents need the tightest safety net. `bun test --coverage` runs in lib test targets; failure under threshold fails the Nx target.

**Agent "done" signal** per micro-task:
```
nx affected -t test,lint,typecheck --base=<micro-task-start>
```
All three green, plus the new failing test from the start of the TDD cycle now green = task complete. Verified against plan.md checkpoints.

**Usually-skipped tests** (not in default graph):
- Mutation (`:mutation` targets) — on-demand only.
- E2E full suite — only `@smoke`-tagged runs per-PR; full suite nightly against deploy host.
- Chaos/soak tests for Layer-A (1-hour reconnect storm) — `apps/gw-01/src/**/*.soak.test.ts`, `nx run gw-01:soak`, never in default.

### D21. Lint + format baseline — ESLint (flat config) + Prettier + lefthook

**Decision: ESLint 9 (flat config) + Prettier 3, with lefthook for pre-commit orchestration.** Biome evaluated and rejected for three concrete reasons specific to this stack:
1. `@tanstack/eslint-plugin-router` and `@tanstack/eslint-plugin-query` provide real value on our TanStack Router file-based routing and TanStack Query cache keys — no Biome equivalent.
2. `jsx-a11y` has no Biome peer at comparable depth.
3. `eslint-plugin-drizzle` catches `DELETE` / `UPDATE` without `WHERE` — a subagent-class bug the drizzle plugin alone justifies.

Nx 18+ ships official flat-config ESLint generators (`@nx/eslint`); `@nx/biome` is community and less mature. Migration ESLint → Biome later is cheap; Biome → ESLint later is expensive. Revisit at month 6 if ESLint runtime becomes a problem — by then we'll have real benchmark data on this codebase, not speculation.

**ESLint flat config** — root `eslint.config.js` composes:
- `@eslint/js` `recommended`
- `typescript-eslint` `strictTypeChecked` + `stylisticTypeChecked` (project-service mode picks up each project's `tsconfig.json` automatically)
- `@nx/eslint-plugin` `flat/base`, `flat/typescript`, `flat/javascript` (gives Nx module-boundary rules — the D1 tag set)
- `eslint-plugin-react` `flat/recommended` + `flat/jsx-runtime` (fe-01 only, files glob)
- `eslint-plugin-react-hooks` `recommended-latest`
- `eslint-plugin-jsx-a11y` `flat/recommended` (fe-01 only)
- `@tanstack/eslint-plugin-router` `flat/recommended`
- `@tanstack/eslint-plugin-query` `flat/recommended`
- `eslint-plugin-drizzle` with `enforceDeleteWithWhere` + `enforceUpdateWithWhere` (be-01 only, targeting the repository layer)
- `eslint-plugin-unused-imports` (autofix dead imports)
- `eslint-plugin-simple-import-sort` (deterministic import order)
- `eslint-plugin-unicorn` `recommended`, with `prevent-abbreviations` and `no-null` turned off (too noisy for this stack)
- `eslint-config-prettier` last (disables stylistic rules that fight Prettier)

Explicit overrides:
- `no-floating-promises` → error (Bun + Elysia swallows silently otherwise).
- `@typescript-eslint/consistent-type-imports` → error with `fixStyle: 'separate-type-imports'`.
- Nx `enforce-module-boundaries` tag set from D1.

**Prettier 3 config** (`.prettierrc.json`, one file, non-negotiable):
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "arrowParens": "always",
  "endOfLine": "lf",
  "bracketSameLine": false,
  "plugins": ["prettier-plugin-tailwindcss"]
}
```
`prettier-plugin-tailwindcss` sorts shadcn className strings.

**Config layout:** root-anchored, flat inheritance. One `eslint.config.js`, one `.prettierrc.json`, one `.prettierignore`, one `.editorconfig`. Per-project files only if a project genuinely diverges (rare).

**Pre-commit — lefthook** (not husky+lint-staged):
- Single YAML (`lefthook.yml`), single static binary, no postinstall dance, native parallelism.
- Better match for Bun's lockfile semantics than husky.
- Native staged-file filtering replaces lint-staged's role.

`tools/tool-git-hooks/src/install.ts` runs `bunx lefthook install`. `lefthook.yml` at repo root defines:
- `pre-commit`: parallel jobs `lint` (`bunx nx affected -t lint --uncommitted --fix`) and `format` (`bunx nx format:write --uncommitted`). Re-stages after fix.
- `commit-msg`: a tiny Bun script enforcing conventional-commits prefixes.

The **plaintext-secret pre-commit hook** (D18) is also declared in `lefthook.yml` — separate job in the same `pre-commit` stage; rejects additions of non-`.sops` / non-`.example` env files and heuristic secret patterns.

**Editor integration** — `.vscode/extensions.json`: `dbaeumer.vscode-eslint`, `esbenp.prettier-vscode`, `bradlc.vscode-tailwindcss`, `nrwl.angular-console`. **`biomejs.biome` is explicitly excluded** so two formatters don't fight.

`.vscode/settings.json`:
```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.organizeImports": "never"
  },
  "eslint.useFlatConfig": true,
  "eslint.workingDirectories": [{ "mode": "auto" }],
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```
`organizeImports: never` because `simple-import-sort` owns that — two sorters fight otherwise.

**Nx targets:**
- `nx lint <project>` → `@nx/eslint:lint`, inputs include `default` + `eslint.config.js` + `.prettierrc.json` (cache invalidates on config change). Declared on every `apps/*`, `libs/*`, `tools/*` project.
- `nx format` / `nx format:check` → Nx built-in Prettier commands.
- `nx run-many -t lint` / `nx affected -t lint` — free from the target declaration.

**Files the scaffold ships:**
- `/eslint.config.js`
- `/.prettierrc.json`
- `/.prettierignore` (`dist/`, `.nx/`, `coverage/`, `node_modules/`, `*.gen.ts` for TanStack Router generated route tree)
- `/.editorconfig` (mirrors Prettier)
- `/lefthook.yml`
- `/tools/tool-git-hooks/src/install.ts`
- `/tools/tool-git-hooks/src/hooks/pre-commit`
- `/.vscode/settings.json` + `/.vscode/extensions.json`
- Per-project `project.json` declaring `lint` target pointing at root config.
- `/package.json` devDeps: `eslint@^9`, `typescript-eslint@^8`, `@nx/eslint`, `@nx/eslint-plugin`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`, `@tanstack/eslint-plugin-router`, `@tanstack/eslint-plugin-query`, `eslint-plugin-drizzle`, `eslint-plugin-unused-imports`, `eslint-plugin-simple-import-sort`, `eslint-plugin-unicorn`, `eslint-config-prettier`, `prettier@^3`, `prettier-plugin-tailwindcss`, `lefthook`.

## Risks / Trade-offs

- **[Risk]** Bun+Nx friction on an unusual plugin or executor → **Mitigation**: documented fallback to `bun run` shell wrappers per app; the Nx task graph still works.
- **[Risk]** Nx shadcn plugin turns out to be abandoned → **Mitigation**: 1-hour budget to attempt, then fall back to manual shadcn CLI + path aliases (D5).
- **[Risk]** Dagger engine container slows dev iteration if someone accidentally uses it for dev-loop commands → **Mitigation**: scripts are clearly named (`dagger call publish-*` vs `bun scripts/*`); README distinguishes the two. The dev loop uses plain `nx`/`bun --watch` with no Dagger in the path.
- **[Risk]** Blue/green swap script has a bug that nukes the running blue before green is healthy → **Mitigation**: health gate before Caddy reload, abort-on-timeout, and `/srv/wbs/releases/` keeps ≥3 versions so re-deploy of the previous version is available.
- **[Risk]** Gateway redeploy drains slower than `DRAIN_TIMEOUT_SECONDS` → clients on blue get abruptly disconnected after timeout → **Mitigation**: once Layer A (sequence+resume) ships in the sync feature, this is a UX non-event. Until then, gateway redeploys are explicitly accepted as socket-dropping (there are no WS endpoints anyway).
- **[Risk]** Schema changes between blue and green `be-01` during the drain window → data inconsistency → **Mitigation**: expand-→-backfill-→-contract discipline is documented; migrations are additive-only in a single deploy. A pre-commit lint on `apps/be-01/src/db/migrations/` rejects `DROP` / destructive operations without a `// safe: <explanation>` comment.
- **[Risk]** Single-point-of-failure observability stack (Grafana/Loki running on the same box as the apps) — if the box dies, observability dies with it → **Mitigation**: accepted for a one-box hobby project. Migration to a separate observability host is a future change; log retention is limited (7 days default) so on-box disk is bounded.
- **[Risk]** SQLite write contention if `be-01` blue and green both write during the drain window → **Mitigation**: SQLite's WAL mode handles concurrent readers + single writer gracefully; accept minor write-lock waits during the window (typically <5 min). Move to Postgres if this becomes a real problem.
- **[Risk]** JWT dual-key complexity introduces an auth bypass if validator order is wrong → **Mitigation**: validator tries `CURRENT` first, falls back to `PREVIOUS` only when the first explicitly fails with `InvalidSignature`; other failures (expiry, malformed) are *not* retried. Unit-tested.
- **[Trade-off]** Deploying the observability stack on the same box costs ~500 MB RAM → **Accepted**: Hetzner boxes with ≥4 GB RAM are cheap; observability earns its keep immediately.
- **[Trade-off]** Bun scripts depend on Bun being bootstrapped on the remote — a fresh host requires running `bootstrap.sh` before `deploy.ts` works → **Accepted**: one-time cost, idempotent script, documented in the deploy README.
- **[Risk]** `event_log` table grows unbounded if the retention job fails silently → **Mitigation**: Prometheus metric `event_log_rows_total` exposed by `be-01`; Grafana alert if it exceeds 1M or the retention job's last-run timestamp is >1h old.
- **[Risk]** A pathological subscription with many small events floods the in-memory ring and evicts useful history too fast → **Mitigation**: per-subscription ring cap is documented; add a Grafana panel showing `gw_message_fanout_total` by subscription_kind so hot subscriptions are visible; revisit ring sizing if a real workload shows the default is wrong.
- **[Risk]** Replay storm on mass reconnect (e.g., after a gateway redeploy drain expires, 100s of clients reconnect at once with stale seqs) → **Mitigation**: client reconnect wrapper uses ±20% jitter; `be-01` rate-limits replay-triggered `/internal/push` calls per connection; Grafana alert on `/internal/resume` rate spike.
- **[Risk]** Replay protocol delivers messages a client has *already* processed (if local `last_seq` lagged the acknowledged seq) → **Mitigation**: client treats incoming `seq <= stored last_seq` as idempotent replay and no-ops at the app level; message handlers must be idempotent. Documented requirement for future product message types.
- **[Risk]** `/internal/resume` with a huge `resume_points` map (user subscribed to thousands of subscriptions) produces a huge response → **Mitigation**: hard cap of 100 subscriptions per resume handshake; clients with more must resume in batches. Out of scope for this change (no product subscriptions yet); documented as a future constraint.
- **[Risk]** Loss of a developer's age private key means permanent inability to decrypt repo secrets for that recipient → **Mitigation**: documented backup requirement to a password manager; multi-recipient encryption is supported so a second developer (or a break-glass offline key) can re-encrypt after a loss.
- **[Risk]** A teammate commits plaintext `.env` by accident → **Mitigation**: pre-commit hook (D18) rejects non-`.sops` / non-`.example` env files and heuristically-looking credentials; also documented in `secrets/README.md`. Git history is not retroactively scrubbed by the hook — if one lands, the leak is real and the secret must be rotated.
- **[Risk]** Decrypted `.env` lands on the remote in plaintext — a host compromise reads it → **Accepted**: inherent to Compose-based env injection. `chmod 0600`, root-owned, firewalled box. Migration to Docker/Compose secret mounts backed by a KMS is a future change when it earns its complexity.
- **[Trade-off]** The scaffold now ships the full reconnect protocol but only a `ping`/`pong` message type — some code paths are unexercised by product logic until the first sync feature arrives → **Accepted**: integration test covers the protocol skeleton end-to-end so bitrot is detected.

## Migration Plan

This is the initial scaffolding — no migration from prior state. "Deployment" here means the first-ever deploy of the scaffold on a fresh Hetzner host.

**Workstation one-time setup (per developer):**

1. Install `sops` and `age`: `brew install sops age` (macOS) or equivalent.
2. Generate an age keypair: `age-keygen -o ~/.config/sops/age/keys.txt`.
3. Extract the public key (`age-keygen -y ~/.config/sops/age/keys.txt`), add to `.sops.yaml` under the relevant `creation_rules` section, commit.
4. Another developer with decrypt access runs `sops updatekeys tools/tool-secrets/src/*.env.sops` and commits; now the new developer can decrypt.
5. `bun install` at the repo root.
6. `nx run tool-git-hooks:install` — lefthook installs pre-commit + commit-msg hooks.
7. Back up `~/.config/sops/age/keys.txt` to a password manager.
8. Install the ntfy mobile app (or use browser/desktop). Pick a long random topic name (e.g., `wbs-alerts-<random>`), subscribe to it in the app, put the full URL in SOPS as `NTFY_TOPIC_URL`, and re-run `nx run tool-secrets:push`. (For Slack/Discord/email, swap in the matching variable and set `NOTIFY_CHANNEL` accordingly.)

**First-deploy sequence (on a fresh Hetzner host):**

1. **Provision the Hetzner host**: Debian 12 / Ubuntu 24.04, SSH key authorized, firewall allows 22/80/443 only.
2. **Bootstrap the host**: `nx run tool-bootstrap:push -- --host=<host>`. Installs Bun, Docker, Compose; creates `/srv/wbs/*` directory tree.
3. **Seed secrets**: `nx run tool-secrets:push -- --env=production --host=<host>` — decrypts `tools/tool-secrets/src/production.env.sops` locally in-memory, streams to `/srv/wbs/.env` over SSH with `0600` perms. No plaintext touches workstation disk.
4. **Deploy**: `nx run tool-deploy:deploy -- --all --host=<host>` from the workstation. This:
   a. Calls Dagger (`tool-dagger:publish-{be,gw,fe}`) to build all three apps + publish all three bundles.
   b. Builds the observability stack assets (`tool-observability-stack:build`).
   c. Builds the remote swap scripts (`tool-remote-scripts:build`).
   d. Ships everything to the host via scp.
   e. `ssh <host> bun /srv/wbs/bin/swap.ts all` to run the per-tier swap.
   f. Updates `/srv/wbs/state/<tier>.last-deployed.json` for all three.
5. **Verify**: `nx run tool-smoke:check -- --remote=<host>` runs:
   - `curl https://<host>/health` for both `be-01` and `gw-01` routes.
   - Basic-auth + HTML fetch of `https://observability.<host>/` (Grafana).
   - `ping`/`pong` WS smoke test including a forced reconnect that exercises the resume protocol.

**Rollback strategy:**
- Per-tier: `nx run tool-deploy:deploy-<tier> -- --version=<previous-sha> --bundle=/srv/wbs/releases/release-<previous-sha>-<tier>.tar.gz`. The blue/green machinery doesn't care whether the "new" version is actually older.
- All-tier: orchestrator supports `--version=<sha>` to force a specific version across all tiers.
- Data: SQLite migrations are expand-→-backfill-→-contract, so schema rollback is always a no-op for a single step back.

## Open Questions

These remain for the implementation / first-feature phase, not blockers for starting this change:

- **`@nx-extend/shadcn-ui` compatibility with Vite + TanStack Router**: verified during the scaffold's first UI-component task; 1-hour budget with manual-shadcn-CLI fallback documented (D5).
- **Dagger TypeScript SDK version stability**: pin a known-working version in `tools/tool-dagger/dagger.json`; upgrade intentionally.
- **Pre-commit migration lint** (D2 risks): a simple `rg -P '(DROP|ALTER.*DROP COLUMN|RENAME COLUMN)' apps/be-01/src/db/migrations/` via a lefthook job is probably enough. Formalize in a later change if it grows teeth.
- **Retention policy for observability storage**: Loki default 7 days; Prometheus default 15 days. Revisit when disk usage surprises us.
- **Exact event-log retention figures** (1000/5-min in-memory; 10k durable) are default guesses — tune against the first real subscription kind's traffic.
- **Per-subscription auth** (which users can subscribe to which subscription key) is not enforced in the scaffold — a subscription filter will be added alongside the first real subscription kind.
- **Age key escrow / break-glass**: single developer is covered by personal backup. With a teammate, an additional "break-glass" age recipient (YubiKey or paper key in a safe) is recommended.
- **Remote `.env` file integrity check**: after a SOPS-driven secrets push, nothing verifies the file wasn't truncated. Add a sha256 pre/post comparison if it becomes a failure mode.
- **Bundle-integrity sha256**: not implemented; SSH/TLS transport integrity relied upon. Add if needed.
- **Nx Bun lockfile edge cases**: if a community plugin assumes npm, we document the friction rather than swap PM.
- **Biome re-evaluation (D21)**: revisit the ESLint vs Biome choice at month 6 with real benchmark data from this codebase.
- **Stryker mutation test config**: baseline `stryker.conf.json` ships; per-lib tuning deferred until a lib has enough tests to target.
- **Loki structured-metadata field list**: D12 lists the initial set; as subscriptions gain shapes (e.g., `doc-id` queries become common), promote more fields to structured metadata.
