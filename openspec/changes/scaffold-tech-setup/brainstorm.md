## Design Summary

A WBS (Work Breakdown Structure) tool built **local-first** (browser is source of truth; server sync is opt-in) with a hybrid **table + nested list** as the core UX — same columns per row, rows nest so sub-items aggregate into parents. On top of that: three-point estimates, item-to-item dependencies, configurable role assignments, and a d3 Gantt driven by estimates + deps + assignees.

This change scaffolds **only the tech foundation**: an Nx monorepo with a backend app (`be-01`), a **WebSocket gateway app (`gw-01`)** adopted upfront, a frontend app (`fe-01`), seven `@wbs/*` shared libs (see Decision 8), and `tool-*` Nx projects for deploy/infra/scripting (see Decision 14), plus a minimal `ssh`/`scp` deploy path to a single Hetzner host. No product features land in this change — no WS endpoints either; only the tier seams are in place.

**Spirit of the stack**: the user has explicitly opted into an *experimental-for-fun* posture on tech choices. Stability-via-maturity is not the optimizer here; learning-by-building with newer pieces (Bun, Elysia, ArkType, TanStack DB, Nx + Bun interop, TanStack Router) is. When a tool choice is close, bias toward the one that is more fun / more recent / less mainstream, not the one with the biggest install base. This is a deliberate trade-off — expect rough edges and budget time for them.

## Alternatives Considered

### Approach A: Nx + Bun + Elysia + TanStack + k3s/Caddy on Hetzner (chosen)

- **What it is**: Nx monorepo, Bun-native backend (ElysiaJS + Drizzle + ArkType), Vite/React frontend wired with TanStack Router/Table/DB and shadcn/ui, deployed as containers to a self-hosted k3s cluster on a single Hetzner box with Caddy (or Traefik) for TLS/ingress.
- **Pros**:
  - Matches every explicit choice in `init-spec-prompt.md`.
  - TanStack DB gives us one client-side store that works in both local and server modes without rewriting queries.
  - ArkType + Drizzle + Elysia produce end-to-end type safety cheaply, and ArkType schemas live in shared libs (later decomposed into `@wbs/validation` + `@wbs/contracts` + `@wbs/domain` per Decision 8) for reuse on the FE.
  - Nx unifies build/test/lint across three projects and supports code generators for future apps/libs.
  - Bun-native SQLite is fast and has no build step.
- **Cons**:
  - k3s on a single node is overkill infrastructure relative to the product.
  - Nx, Bun, Elysia, and TanStack DB are each individually fine but the combined stack is new-ish — fewer Stack-Overflow answers when something breaks.
  - Bun-native SQLite creates a tight coupling that must be hidden behind the repository layer to keep the DB-agnostic promise real.
- **Why chosen**: It is the spec the user wrote. The only soft points are k3s (vs. compose) and Caddy vs. Traefik — both captured as open questions below rather than reasons to reject the whole approach.

### Approach B: pnpm workspaces + Node + Fastify + React Router + Docker Compose (conservative)

- **What it is**: Drop Nx for pnpm workspaces, drop Bun for Node, drop Elysia for Fastify, drop TanStack Router for React Router, and deploy with Docker Compose + Caddy instead of k3s.
- **Pros**:
  - Every piece is battle-tested and well-documented.
  - Compose on a single Hetzner box is materially simpler than k3s.
  - Easier to hire or onboard against.
- **Cons**:
  - No type-safe routing (React Router) compared to TanStack Router.
  - TanStack DB integration is less natural without the rest of the TanStack ecosystem.
  - Nx's generator and affected-graph story is genuinely nicer than pnpm workspaces as the repo grows.
  - Ignores the user's stated preferences.
- **Why not**: The user's tech choices are not casual defaults — they're the product of earlier research. The only real win here is Compose over k3s, and that can be recovered as a narrower decision inside Approach A (see Open Question #1).

### Approach C: Next.js monorepo (framework-first)

- **What it is**: A single Next.js app with server actions replacing the separate BE app; Turborepo for the monorepo; Drizzle + ArkType reused.
- **Pros**:
  - Fewer moving parts — one framework, one deploy target.
  - File-based routing, server actions, and streaming come for free.
- **Cons**:
  - Local-first is awkward in Next.js — the mental model fights SSR/server-actions.
  - TanStack DB's local-first story is better served by a plain Vite SPA.
  - The user explicitly chose TanStack Router, shadcn/ui, and Vite; adopting Next.js contradicts that.
- **Why not**: Local-first + TanStack DB is the axis the product is built around, and that axis reads more cleanly in a Vite SPA + separate API than in Next.js.

## Agreed Approach

**Approach A** is the chosen stack, with three refinements decided during brainstorm review:

- **Docker Compose instead of k3s** on the single Hetzner box. k3s would be overkill for one node; Compose is dramatically simpler and matches the "minimal infra" phrasing in `init-spec-prompt.md`.
- **Caddy only** (Traefik dropped). Traefik's advantages were mostly k8s/CRD-driven; with Compose in place, Caddy's zero-config TLS and Caddyfile ergonomics win on simplicity.
- **Dedicated WS gateway adopted upfront** as a third app (`apps/gw-01`). Originally the gateway tier was deferred ("Layer C" in the earlier version of Decision 11). After evaluating cost (~1-2 days of upfront work, ~15-20% ongoing two-service complexity) against benefit (backend redeploys — the frequent ones — no longer drop sockets; architecture maps 1:1 to how real production systems are shaped; fits the experimental-for-fun posture), the user elected to adopt it now.

All other pieces from Approach A stand. The stack posture is **experimental-for-fun** (see Design Summary) — this is a *feature* of the change, not a risk to mitigate away.

## Key Decisions

1. **Nx monorepo — three top-level directories, Nx-all-the-way**: `apps/` for user-facing deployables (`be-01`, `gw-01`, `fe-01`), `libs/` for importable modules (seven `@wbs/*` libs — see Decision 7), and **`tools/` for invokable infra projects** (`tool-deploy`, `tool-dagger`, `tool-compose`, `tool-observability-stack`, `tool-secrets`, `tool-bootstrap`, `tool-remote-scripts`, `tool-git-hooks`, `tool-smoke`). No free-floating `infra/`, `scripts/`, `dagger/`, or `secrets/` directories — every artifact lives inside an Nx project with proper `build`/`lint`/`test`/deploy targets. App names keep the `nn-NN` convention so `be-02` / `gw-02` / `fe-02` slot in cleanly; libs use semantic `@wbs/<domain>` names (numeric `lib-NN` scheme dropped — see Decision 7). Every workstation and remote operation is `nx run tool-<x>:<target>`, not a loose shell script.
2. **Backend stack** (`apps/be-01`): Bun runtime + TypeScript + ElysiaJS HTTP framework + Drizzle ORM + ArkType validation. SQLite (via `bun:sqlite`) as the initial dev driver. **No WebSocket surface** — backend is plain HTTP. Backend redeploys can therefore be aggressive (rolling every push if desired) without touching client sockets.
3. **Backend layering**: `controller → service → repository`. Drizzle types never escape the repository layer — services consume repository interfaces only. This is the concrete mechanism that keeps the promise of DB-agnosticism.
4. **DB driver**: `bun:sqlite` is fine — the Bun-specific coupling is isolated to the repository implementation layer. The repository *interface* stays driver-agnostic; swapping to Postgres later means a new Drizzle driver + new repository impl, nothing above.
5. **Gateway app** (`apps/gw-01`) — **adopted upfront**:
    - **Runtime**: Bun + TypeScript + ElysiaJS (same stack as `be-01` — one less thing to learn).
    - **Responsibilities**: terminate TLS-protected WS (via Caddy upstream), authenticate clients on upgrade (JWT with a signing key shared via env / secret), maintain an **in-memory** `subscription → Set<socket>` map, forward inbound client messages to `be-01` via internal HTTP, accept pushes from `be-01` on a `POST /internal/push` endpoint and fan out to the subscribed sockets.
    - **State**: ephemeral only. No SQLite in `gw-01` — gateway state dies with the socket. Durable data (events, sequence logs for Layer-A resume) lives in `be-01`'s DB.
    - **Internal contract** (`gw-01` ↔ `be-01`): shared-secret `X-Internal-Auth` header (env-injected), plus ArkType-validated payloads. Contract types live in `@wbs/contracts` (see Decision 8) so both ends compile against the same schemas.
    - **Topology (this change)**: single gateway instance, one backend instance. Internal traffic is plain HTTP between Compose services. No Redis/NATS bus. Multi-instance scaling is a forward-looking concern — when it arrives, the bus slots in between gateway and backend without touching the client protocol.
    - **Why upfront, not deferred**: cost (1-2 days + ~15-20% ongoing complexity) is modest; benefit (backend redeploys never drop sockets; architectural seams are correct from day one; clean migration path to Redis/NATS when horizontal scaling is needed) is real and fits the experimental-for-fun posture.
6. **Frontend stack**: React + TypeScript + Vite + TanStack Router (file-based routing) + shadcn/ui + TanStack Table + d3 + TanStack DB. TanStack DB is configured for two modes: local (browser-persisted) and server. In server mode, the client talks **HTTP to `be-01`** for request/response and **WebSocket to `gw-01`** for real-time pushes.
7. **Server sync transport**: **WebSocket via `gw-01`**, not HTTP polling. The eventual server mode is intended to be *collaborative* (real-time multi-user), so the transport choice is not deferrable to "whichever is cheapest". This change does not implement sync endpoints, but the gateway app and internal contract are in place so the first sync feature change only adds message types, not infra.
8. **Shared libraries — `@wbs/*`, seven focused libs, not one grab-bag**: drop the numeric `lib-NN` convention in favor of semantic `@wbs/<domain>` names. Libs: `@wbs/validation` (ArkType foundation; root of the DAG), `@wbs/domain` (WBS business types), `@wbs/contracts` (wire-level HTTP + WS schemas, internal gw↔be contract), `@wbs/observability` (pino + metric helpers + log schema + Elysia `/metrics` plugin), `@wbs/config` (env + config parsing), `@wbs/realtime` (browser-only: reconnecting WS client + TanStack DB adapter + resume-protocol state machine), `@wbs/scripts` (Bun-only: `Bun.$` wrapper + SSH + SOPS + Dagger helpers for tool projects). Dependencies form a DAG with no cycles (see design.md D19). Nx tags `scope:shared`, `type:<name>`, `runtime:isomorphic|bun|browser` enforce boundaries via `@nx/enforce-module-boundaries`.
9. **shadcn/ui under Nx — `@nx-extend/shadcn-ui`**: specific package, no spike needed. Fallback: shadcn CLI + manual `components.json` wiring (1-hour budget if the plugin breaks on Vite + TanStack Router).
10. **Deploy target**: Docker Compose on a single Hetzner host, fronted by Caddy for TLS/ingress. Compose services: `be-01`, `gw-01`, plus Caddy. `fe-01` ships as static assets served by Caddy directly. No Kubernetes.
11. **Deploy transport**: a **split pipeline — Dagger for build/test/publish, plain bash for the deploy step**.
    - **Dagger** (TypeScript SDK, matches the rest of the stack) owns: building Docker images for `be-01` and `gw-01`, building static assets for `fe-01`, running unit + integration tests in throwaway containers, and producing versioned publish bundles (image tarballs + FE assets). Per-app publish targets (`publish-be`, `publish-gw`, `publish-fe`) plus a `publish-all` aggregator. The same `dagger call <target>` commands run on the developer workstation and on the deploy host — that's the local/CI parity win. BuildKit caching comes for free.
    - **Plain bash** owns the deploy step itself: `scp`-ing the publish bundle to the Hetzner host, running a remote script that orchestrates the blue/green container swap, and reloading Caddy. Dagger can drive SSH modules but adds indirection without reducing lines at this scale — deploy stays trivially debuggable shell.
    - **Deploy script architecture — per-tier plus an orchestrator** (Bun/TypeScript inside Nx `tool-*` projects — see Decision 14 for the project layout):
        - `nx run tool-deploy:deploy-be` — builds (via `nx run tool-dagger:publish-be`), scps, and triggers the remote `swap-be.ts` (simple swap, no drain window).
        - `nx run tool-deploy:deploy-gw` — same shape, triggers `swap-gw.ts` (drain-window logic: green starts on side port, Caddy reload, blue drains until timeout or sockets closed).
        - `nx run tool-deploy:deploy-fe` — builds, scps, triggers `swap-fe.ts` (atomic static-asset directory swap — rsync into `www-new/`, then `mv www www-old && mv www-new www`; no container lifecycle).
        - `nx run tool-deploy:deploy` — the orchestrator. Accepts either an explicit list (`nx run tool-deploy:deploy -- be gw`), an `--all` flag, or — by default — uses `nx affected --base=<last-deployed-sha>` to auto-detect which apps changed since the last successful deploy, then invokes only the relevant per-tier targets. Each per-tier target is also directly invocable; the orchestrator is a convenience.
        - Remote side mirrors the split (Bun-bundled scripts installed by `tool-remote-scripts`): `/srv/wbs/bin/swap-be.ts`, `swap-gw.ts`, `swap-fe.ts`, with a `/srv/wbs/bin/swap.ts [be|gw|fe|all]` dispatcher.
    - **Change detection baseline**: `nx affected` needs a baseline SHA ("what was last deployed"). Captured in `.deploy-state/<tier>.json` on the remote (read back via a short `ssh cat`), or cached locally per tier. Fallback when no baseline is available: treat as `--all`. Exact mechanism resolved in design.
    - **Dev loop stays untouched**: `nx serve` / `bun --watch` / `vite dev` are not routed through Dagger. Dagger is for pipelines, not the inner dev loop.
    - **Why Dagger over plain bash for build/test too**: fits the experimental-for-fun posture, gives reproducible builds with cache, and means that when CI arrives later the pipeline moves unchanged. Accepted cost: Dagger engine is a local container, small startup overhead, ~1 day of learning curve. No CI platform is introduced in this change — Dagger runs locally and on the remote only.
    - **Shared-infra special case**: Caddyfile and Compose file aren't owned by any single app. Either (a) treat them as implicitly included in every per-tier deploy (so `deploy-be.sh` also ships the current Caddyfile), or (b) give them their own `deploy-infra.sh` that bumps them independently. Resolved in design — current leaning: (a), because their contents depend on which image versions are live anyway.
12. **Deploy strategy — zero downtime via Caddy blue/green, split by tier**:

    With the gateway adopted upfront, deploy concerns split cleanly by which container is being replaced. The three-layer WS-survival plan (A/B/C) still frames the thinking; what changes is *when each layer actually gets invoked*.

    **Backend (`be-01`) redeploy — the frequent case, ~zero WS impact**:
    - Green `be-01` starts on a side port.
    - Caddy's upstream for `/api*` is pointed at green and reloaded (graceful — in-flight HTTP requests finish).
    - `gw-01` holds all client WS sockets; it is **not touched**. Its internal-HTTP calls transparently re-resolve to green on the next request (Docker's internal DNS / Caddy upstream).
    - Blue `be-01` stops after reload succeeds.
    - **Net effect on clients**: no socket drops. This is the main prize from adopting the gateway upfront.

    **Gateway (`gw-01`) redeploy — the rare case, WS-survival plan applies**:
    - This is where Layers A and B actually matter.
    - **Layer A — Client auto-reconnect + server-side resume (mandatory, always)**: every server→client event carries a monotonic per-subscription sequence number. Client stores last-seen seq; on reconnect it sends `resume_from=<seq>`; `be-01` replays missed events from a bounded buffer (in-memory ring + durable fallback from DB) through `gw-01`'s push endpoint. Client uses a reconnecting WS wrapper with exponential backoff + jitter. Non-negotiable — network drops happen for non-deploy reasons anyway.
    - **Layer B — Drain window on gateway redeploy**: Green `gw-01` starts on a side port and becomes the Caddy upstream for `/ws*` (only *new* WS upgrades hit green). Blue `gw-01` keeps its existing sockets alive. Blue is shut down after the shorter of (a) all its sockets closed, or (b) a drain timeout (e.g., 5 min). Optionally blue sends an app-level `{"reconnect":true}` hint so clients migrate proactively.
    - **Layer C — Multi-instance gateway + Redis/NATS bus (still deferred)**: the cost is now lower because the gateway app already exists and its protocol is already proven; it becomes a matter of swapping the internal-HTTP call between `gw-01` and `be-01` for a pub/sub message. Trigger to adopt: a second `gw-01` instance is needed (horizontal WS scaling), or backend crash resilience for open sockets becomes a requirement.

    **Frontend (`fe-01`) redeploy**: pure static assets served by Caddy; no sockets, no runtime. Swap the asset directory atomically and reload Caddy. Irrelevant to WS.

    **Constraints that still apply** (regardless of which tier is redeploying):
    - During any drain window where old and new `be-01` both run, both write to SQLite — schema migrations must be forward-compatible across a single deploy step (expand → backfill → contract across separate deploys, never in one).
    - Caddy proxies `/ws*` to `gw-01` with WebSocket upgrade transparent (Caddy default) and idle timeouts longer than the client heartbeat interval.
    - The internal `gw-01` ↔ `be-01` contract is versioned; a backend deploy must be compatible with the currently-running gateway version, and vice versa.

    This change (`scaffold-tech-setup`) implements **the baseline** blue/green deploy for both `be-01` and `gw-01` **and Layer A** (per-subscription sequence numbers, bounded replay buffer, reconnect handshake, client-side reconnecting WS wrapper with exponential-backoff + jitter). The protocol is proven end-to-end with a `ping`/`pong` message type; product WS message types layer on later without protocol changes. Layer B (drain window on gateway redeploy) is the deploy-script concern and ships here. Layer C (multi-instance gateway + pub/sub bus) remains deferred.
13. **Scope discipline**: no WBS domain behavior in this change (no table, no estimates, no Gantt). No product WS *message types* either — only `ping`/`pong` to exercise the protocol. Layer-A resume protocol and its implementation (sequencer in `be-01`, replay buffer, `/internal/resume` endpoint, client reconnecting wrapper in `@wbs/realtime`) **do** ship as part of the foundation (scope expanded after review). Secrets handling: **encrypted at rest via SOPS + age** ships as part of the scaffold; plain `.env` in git is forbidden.
14. **Scripts are Bun/TypeScript **inside Nx `tools/` projects**, not free-floating `scripts/` files** — uniform stack and uniform graph.
    - **Workstation entry points** live in `tools/tool-deploy/src/` (orchestrator + per-tier `deploy-{be,gw,fe}.ts`), `tools/tool-secrets/src/cli/` (decrypt + push), `tools/tool-smoke/src/` (ws-ping, health), `tools/tool-git-hooks/src/` (lefthook installer), `tools/tool-bootstrap/src/` (host bootstrap pusher). Invoked as `nx run tool-<x>:<target> [-- <args>]`.
    - **Remote scripts** live in `tools/tool-remote-scripts/src/` (`swap.ts` + per-tier `swap-{be,gw,fe}.ts`), bundled via `bun build` and scp'd to `/srv/wbs/bin/` by `tool-remote-scripts:install`.
    - **Language**: Bun + TypeScript with `Bun.$` (zx-style). Type-safe CLI args via ArkType schemas. Shared helpers in `@wbs/scripts` (lib); unit-testable where it matters.
    - **Only `.sh` file that ships**: `tools/tool-bootstrap/src/bootstrap.sh` — POSIX shell, ~10 lines, idempotent. The chicken-and-egg exception for installing Bun on a fresh host.
    - **Why Nx-wrapped rather than raw `scripts/*.ts`**: changes in a lib/app flow through Nx's affected graph into the deploy targets automatically; the Dagger publish step's output becomes a cached Nx artifact; the graph is a single source of truth. A trivial top-level alias `"deploy": "nx run tool-deploy:deploy"` preserves `bun deploy …` muscle memory.
    - **Non-goals**: dev-loop commands (`nx serve`, `bun --watch`, `vite dev`) still run directly — never wrapped in a tool project.
15. **Basic observability — self-hosted LGTM-style stack, instrumented from day one**:
    - **Logging**: `pino` in both `be-01` and `gw-01` (structured JSON). Elysia middleware assigns a per-request `request_id`; for `gw-01` also a per-socket `connection_id` and per-message `message_id`. Log fields standardized in `@wbs/observability` (see Decision 8 / design D12 / D19) so grepping across services works.
    - **Metrics**: `/metrics` Prometheus endpoint on `be-01` and `gw-01` via an Elysia OTel plugin (or a plain Prometheus plugin — confirmed in design). Standard HTTP metrics (request rate, latency histogram, error rate) automatically; gateway-specific custom metrics wired explicitly: `gw_active_connections`, `gw_reconnects_total`, `gw_message_fanout_total`, `gw_drain_seconds` (per deploy).
    - **Traces**: OpenTelemetry SDK wired into both services, but Tempo / Jaeger **deferred** — traces only become useful once there's a multi-service request flow worth tracing (post-sync feature). For now OTel exports to stdout in dev and is buffered to `/dev/null` in prod.
    - **Self-hosted stack** (added to the same Docker Compose as the apps): Grafana + Loki + Promtail + Prometheus. Promtail tails container logs and ships to Loki; Prometheus scrapes `/metrics` endpoints on `be-01` and `gw-01`; Grafana is the single UI. ~500 MB RAM footprint — fine on a Hetzner box.
    - **Error tracking**: no separate service (no Sentry yet). Uncaught exceptions go to pino at `level=error`, land in Loki, Grafana alerts on error-rate spike. Sentry (self-hosted or hosted free tier) can be added later if error-grouping/release-tracking UX matters; not needed for day one.
    - **Uptime**: single Grafana alert on `up{}` for each service, routing to **ntfy.sh** by default (picked for simplicity; Telegram rejected on ownership-jurisdiction grounds; WhatsApp evaluated and rejected as impractical — Meta Business verification + template-message approvals + dedicated phone-number provisioning). Slack, Discord webhook, and email documented as env-flag alternatives. Uptime Kuma as a dedicated service deferred.
    - **Access**: Caddy route `observability.<domain>` (subdomain) or `/_obs/*` behind HTTP basic auth + TLS. Admin-only. Never exposed alongside the app.
    - **What ships in this change** (`scaffold-tech-setup`):
        - App-side: `pino` wired + request-ID middleware + `/metrics` endpoint in both `be-01` and `gw-01` (emitting at least the HTTP basics and the gateway custom metrics).
        - Stack-side: Grafana + Loki + Promtail + Prometheus added to Compose; Caddy routing; a *minimal* seed dashboard (one per service) so the wiring is proven end-to-end.
        - Alerting rules: a baseline set covering at minimum "service is down" and "5xx rate spike" — basic but non-zero. Exact list locked in design D14.
    - **Out of scope for this change**: Tempo, Sentry, Uptime Kuma, product-specific dashboards (latency SLOs per endpoint, per-user session views, etc. — those land with the features they measure).
    - **Why upfront**: observability is famously cheap to add on day one and expensive to retrofit. With the gateway adopted upfront, there's real state worth watching (active sockets, drain duration) from the first feature onward.
16. **Test strategy is codified upfront** because subagents under `/opsx:apply` rely on tests as the single source of "what this code is supposed to do". Layers: unit (`bun test` / Vitest) + integration (Elysia `app.handle` + real WS) + contract (shared ArkType schemas drive both producer and consumer tests) + property (`fast-check` for Layer-A invariants) + E2E (Playwright) + smoke (post-deploy). Coverage: 85% line coverage on `libs/*` only (apps' wiring inflates the number misleadingly). Agent "done" signal: `nx affected -t test,lint,typecheck` green + new failing test now passing. Colocated `*.test.ts` files; E2E as a separate project; mutation (Stryker) gated and weekly. Full details in design.md D20.
17. **Lint + format baseline — ESLint (flat config) + Prettier + lefthook**. Biome evaluated but rejected: no peers for `@tanstack/eslint-plugin-router`, `@tanstack/eslint-plugin-query`, `jsx-a11y` depth, or `eslint-plugin-drizzle` (which catches `DELETE`/`UPDATE` without `WHERE` — a subagent-class bug on its own). ESLint 9 flat config at repo root, Prettier 3 with fixed opinions (100-width, semi, single-quote, trailing-all, 2-space LF), lefthook owning pre-commit (parallel lint + format + plaintext-secret guard). VS Code integration shipped (`.vscode/settings.json` + `extensions.json`). Revisit Biome at month 6 with real benchmark data. Full details in design.md D21.

## Open Questions

All six questions raised in the first brainstorm draft were resolved during user review and promoted into **Key Decisions** above. A seventh question — whether to adopt the WS gateway tier upfront or defer it — was raised during a later review round and also resolved. Audit trail:

1. **k3s vs Docker Compose** → Compose (Decision 10).
2. **Caddy vs Traefik** → Caddy only (Decision 10).
3. **Nx project layout** → conventional `apps/` + `libs/` (Decision 1).
4. **TanStack DB sync transport** → WebSocket, with a dedicated gateway app (`gw-01`) adopted upfront (Decisions 5, 7).
5. **SQLite driver** → `bun:sqlite` behind the repository layer (Decisions 3, 4).
6. **shadcn/ui under Nx** → attempt the Nx shadcn plugin first, fallback to manual (Decision 9).
7. **Gateway tier: adopt upfront or defer?** → **adopt upfront** (Decision 5). Cost (1-2 days + ~15-20% ongoing complexity) deemed modest relative to payoff (backend redeploys never drop sockets; correct architectural seams from day one; clean migration to Redis/NATS when horizontal scaling is needed) and alignment with the experimental-for-fun posture.
8. **Build/test/publish pipeline — plain bash or Dagger?** → **Dagger for build/test/publish, bash only for the SSH deploy step** (Decision 11). Adopted for experimental-for-fun reasons and future CI readiness. Dev loop is explicitly out of scope for Dagger.
9. **Script language — bash or Bun/TypeScript?** → **Bun/TypeScript for all scripts**, with a tiny plain-shell `bootstrap.sh` exception for installing Bun on the remote host the first time (Decision 14).
10. **Observability — defer or wire from day one?** → **wire basic LGTM-style stack upfront** (Decision 15). Apps ship with `pino` logs + `/metrics` + Grafana/Loki/Promtail/Prometheus in Compose. Tempo / Sentry / Uptime Kuma deferred.
11. **Layer-A resume protocol — defer or ship now?** → **ship now** (Decisions 12, 13). Sequence-assigner in `be-01`, bounded replay buffer (in-memory ring + durable `event_log` table), `/internal/resume` endpoint on `be-01`, reconnect handshake on `gw-01`, client reconnecting-WS wrapper + TanStack DB sync-engine stub in `@wbs/realtime` (see Decision 8). Product WS message types remain deferred; only `ping`/`pong` ships to prove the protocol end-to-end. Scope adjustment made after brainstorm re-review: protocol design is cheaper to nail now than to retrofit.
12. **Secrets — plain `.env` or encrypted?** → **SOPS + age, encrypted at rest, committed to repo** (Decision 13's expanded scope; detailed in `design.md` D18). No plaintext in git; age keys on developer workstations only; deploy script decrypts in-memory and streams to remote. Migration path to KMS/Vault preserved via SOPS's pluggable backends.
13. **Infra layout — separate `infra/scripts/secrets/dagger` dirs or fold into Nx?** → **fold into Nx `tools/` as `tool-*` projects** (Decisions 1, 11, 14; details in `design.md` D1). Every operation becomes `nx run tool-<x>:<target>`.
14. **`libs/lib-01` as single grab-bag or multiple focused libs?** → **seven `@wbs/*` libs** (Decision 8; details in `design.md` D19). Drop numeric `lib-NN` scheme; semantic names.
15. **Alert channel — Telegram?** → **ntfy.sh** (Decision 15; details in `design.md` D16). Picked over Slack/Discord/email for simplicity (zero account setup, POST-to-URL model). Telegram rejected on ownership-jurisdiction grounds; WhatsApp evaluated and rejected as impractical for a solo hobby project; Slack / Discord / email available as env-flag alternatives.
16. **Test strategy — casual or codified?** → **codified upfront** (Decision 16; details in `design.md` D20).
17. **Lint+format — ESLint+Prettier or Biome?** → **ESLint+Prettier+lefthook** (Decision 17; details in `design.md` D21). Biome revisited at month 6.
18. **shadcn/ui plugin — which one?** → **`@nx-extend/shadcn-ui`** (Decision 9 revision; details in `design.md` D5).

Remaining questions genuinely open — for `design.md` to articulate, not re-debate:

- **Exact zero-downtime Caddy blue/green script shape for both tiers**: how ports are allocated for each service (be-01 blue/green, gw-01 blue/green), how Caddy's config is regenerated/reloaded, where health checks live, how the drain-window timer is implemented for gw-01.
- **Internal `gw-01` ↔ `be-01` contract shape**: request/response framing for inbound (client→server) messages, push payload schema for server→client, auth header details, error-handling contract (what happens when backend is down or unreachable during a gateway request?).
- **JWT signing-key rotation**: how the shared signing key used for WS auth is rotated across a deploy without invalidating live sockets.
- **Nx shadcn plugin viability check**: a small design-phase spike to confirm the plugin works with the chosen Vite + React + TanStack Router setup, with the manual-wiring fallback documented.
- **Dagger module structure**: one top-level Dagger module or per-app modules (`be-01`, `gw-01`, `fe-01` each with their own build/test targets composed by a root `publish-all` target)? How Nx's affected-graph interacts with Dagger's BuildKit cache (or if the two caches coexist without interference).
- **Dagger ↔ bash handoff contract**: what format the per-tier publish bundles are (tarball? image registry? directory with metadata JSON?), the minimal argument surface each per-tier deploy script accepts, and where the bundle lands on disk under `dist/`.
- **Change-detection baseline mechanism**: where `.deploy-state/<tier>.json` (or equivalent) lives — remote-only (read via `ssh cat` at the start of orchestrator run), local-only (committed to repo? in .gitignore?), or dual-write. Behavior when the baseline is missing or stale (fallback to `--all`? prompt?). Whether the baseline stores the git SHA, the Dagger content-hash, or both.
- **Shared-infra coupling**: Caddyfile and Compose file are shipped with every per-tier deploy vs. having their own `deploy-infra.ts` that runs independently. Current lean is bundled-per-tier; confirm in design.
- **`bootstrap.sh` content + idempotency**: exact shell commands to install Bun on a fresh Hetzner host, including Bun version pinning and a re-run-safe check (`command -v bun >/dev/null || ...`). Where the script lives in the repo and how the first deploy invokes it.
- **Elysia Prometheus vs Elysia OTel plugin**: which one the `/metrics` endpoint is built on. OTel is more future-proof (traces arrive with zero code changes later); Prometheus-plugin is lighter. Design-phase spike to pick.
- **Log-field schema**: agreed set of mandatory fields (`request_id`, `service`, `level`, `msg`, `connection_id` where applicable) formalized as an ArkType schema in `@wbs/observability` and enforced via a pino serializer. Avoids drift across services.
- **Gateway custom metrics definitions**: exact metric names, labels, and types for `gw_active_connections` (gauge), `gw_reconnects_total` (counter), `gw_message_fanout_total` (counter, labeled by subscription), `gw_drain_seconds` (histogram). Naming follows Prometheus conventions.
- **Grafana bootstrap**: dashboards as code (JSON committed to repo and provisioned on container start) vs manually curated after first deploy. Leaning toward code; confirm in design.
- **Observability access path**: subdomain (`observability.<domain>`) vs path (`/_obs/*`) behind Caddy basic auth. Subdomain is cleaner TLS-wise if you have a wildcard cert; path is simpler if you don't.
- **Alert notification channel**: email, Telegram, generic webhook, or Discord for the "service down" + "5xx spike" alerts. Low-stakes decision but needs to be concrete for the first deploy.
