## 1. Workspace initialization and baseline config

- [x] 1.1 Initialize Nx 18+ workspace at the repo root with Bun as package manager (`bun.lockb` lockfile, no npm/pnpm artifacts). Establish the three top-level dirs: `apps/`, `libs/`, `tools/`.
- [x] 1.2 Create root `tsconfig.base.json` with `@wbs/*` path aliases for all seven libs (stubs ok — each lib added in later tasks updates the mapping).
- [x] 1.3 Create root `package.json` with `"deploy": "nx run tool-deploy:deploy"` alias and the curated devDeps list from design D21. Add `.gitignore` (Nx cache, `dist/`, `coverage/`, `node_modules/`, decrypted secrets, age keys, `routeTree.gen.ts`).
- [x] 1.4 Create `nx.json` with named inputs (`default`, `production`), target defaults (caching for `build`/`test`/`lint`, `cache: false` for deploy/SSH targets), and tag allowlists for `scope:*`, `type:*`, `runtime:*`.
- [x] 1.5 Create `.editorconfig` mirroring Prettier (2 spaces, LF, final newline, trim trailing whitespace). _(satisfied by Task 1.3 — `.editorconfig` was written with the Prettier-mirroring content; `.gitignore` verification per plan.md Task 1.5 also passes: all required entries IGNORED, `.env.example`/`.sops.yaml`/`*.env.sops` trackable)_
- [x] 1.6 Verify `bun install` succeeds and `nx graph` renders (even if empty); commit a baseline snapshot. _(verified at HEAD `8723ef7`: `bun install` 819 pkgs clean in 227ms, `bunx nx graph` generates `/tmp/graph-baseline.html` (1189B), `bunx nx show projects` empty as expected, working tree clean)_

## 2. Lint, format, and editor baseline

- [x] 2.1 Install ESLint 9 + typescript-eslint 8 + all plugins from design D21 (react, react-hooks, jsx-a11y, tanstack router, tanstack query, drizzle, unused-imports, simple-import-sort, unicorn, prettier-config, `@nx/eslint-plugin`). _(satisfied by Task 1.3 — all plugins present at expected major versions, verified via `bun pm ls`)_
- [x] 2.2 Write root `eslint.config.js` (flat config) composing the plugins with per-glob overrides (fe-01 gets react/a11y; be-01 gets drizzle; tests get relaxed rules). Include `@nx/enforce-module-boundaries` with the tag allowlist.
- [x] 2.3 Write root `.prettierrc.json` with exact settings from design D21. Add `.prettierignore` (`dist/`, `.nx/`, `coverage/`, `*.gen.ts`, encrypted files). _(also applied `prettier --write .` canonical formatting to existing files; `prettier --check .` passes)_
- [x] 2.4 Install `lefthook` and write `lefthook.yml` with pre-commit (lint affected + format + plaintext-secret guard) and commit-msg (conventional-commits prefix) stages. _(hook scripts under `tools/tool-git-hooks/src/hooks/` are created in Task 10.4; committed with `--no-verify` per plan guidance)_
- [x] 2.5 Write `.vscode/settings.json` + `.vscode/extensions.json` per design D21, with `biomejs.biome` in `unwantedRecommendations`.
- [x] 2.6 Confirm `nx format:check` and `nx run-many -t lint` both exit 0 on the empty scaffold. _(`bunx nx format:check` exit 0, `bunx nx run-many -t lint` exit 0 — "No projects with target lint for 0 projects" as expected on empty scaffold, `bunx eslint --config eslint.config.js eslint.config.js` exit 0 after the disableTypeChecked fix on JS files)_

## 3. Shared libraries — DAG root: `@wbs/validation` and `@wbs/domain`

- [x] 3.1 Generate `libs/validation` (Nx library, `runtime:isomorphic`, `type:validation`, `scope:shared`). Export ArkType's `type`, `defineSchema`, `parseOrThrow`, `ValidationError`, `InferSchema<T>`, branded-type helpers. _(tsconfig `typescript` pinned to `^5.4.0` for Nx 18 semver check; generator run with `NX_ADD_PLUGINS=false` to avoid an Nx-18 `addPlugin` bug; stub path aliases temporarily removed during generation and restored; stray `package-lock.json` produced by generator deleted and gitignored; 3 core tests pass)_
- [x] 3.2 Create `libs/validation/src/fixtures/` sub-path export with `makeTestDb()`, `makeFrame()`, `injectedClock()`, and a `README.md` documenting the fixture conventions and agent-TDD ergonomics rules. _(6 tests pass; drizzle-orm + drizzle-kit installed)_
- [x] 3.3 Generate `libs/domain` (`runtime:isomorphic`, `type:domain`). Export `WbsItem`, `Estimate`, `Dependency`, `WbsItemId` (branded) as ArkType schemas + inferred types. _(3 wbs-item tests pass)_
- [x] 3.4 Unit tests for both libs targeting 85%+ line coverage; confirm `nx test validation`, `nx test domain` green. _(validation 97.14% lines / 100% funcs across 8 tests; domain 91.84% lines across 7 tests)_

## 4. Shared libraries — `@wbs/observability` and `@wbs/config`

- [x] 4.1 Generate `libs/observability` (`runtime:isomorphic` main export; `runtime:bun` for `/server` sub-path). Export `createLogger(service)`, the `LogRecord` ArkType schema (including `ws_subscription`), pino serializers, `Counter`/`Histogram`/`Gauge` wrappers. _(2 logger tests pass; pino 10 + OTel sdk-metrics 2 + exporter-prometheus 0.215)_
- [x] 4.2 Add `@wbs/observability/server` sub-path export providing the Elysia OTel plugin with Prometheus exporter (`@elysiajs/opentelemetry`). _(3 observability tests pass; @sinclair/typebox@^0.34 pinned to satisfy Elysia 1.4 peer dep)_
- [x] 4.3 Generate `libs/config` (`runtime:bun`). Export `defineConfig(schema)`, standard env schemas (port, log-level, JWT keys, internal auth), a SOPS-decrypted-file stream loader, config-assertion helpers with clear error messages. _(5 tests pass)_
- [x] 4.4 Unit tests for both libs; verify `runtime:browser` code cannot import the `/server` sub-path or `@wbs/config`. _(module-boundary rule fires on a scratch `validation -> config` import; lint executor switched from `@nx/eslint:lint` → `nx:run-commands` + root `bunx eslint` because Nx 18's bundled ESLint 8.57 crashes on typescript-eslint 8.x rules that rely on `meta.defaultOptions`; strict-lint cleanup follows)_

## 5. Shared libraries — `@wbs/contracts`, `@wbs/realtime`, `@wbs/scripts`

- [x] 5.1 Generate `libs/contracts` (`runtime:isomorphic`). Export ArkType schemas for `/internal/push`, `/internal/forward`, `/internal/resume`, public HTTP contracts, WS envelope, resume-protocol messages (`resume`, `resume_ack`, `resume_denied`, `ping`, `pong`, `error`), error-code enum. _(7 tests pass; WsControlFrame switched from tuple-string union to chained `.or()` — ArkType resolved only first two branches of a 6-branch tuple)_
- [x] 5.2 Generate `libs/realtime` (`runtime:browser`). Implement `ReconnectingWsClient` (exponential backoff 500ms→30s ±20% jitter, heartbeat 25s, localStorage-persisted per-subscription `last_seq`, resume handshake, 1-hour ceiling). Stub `createTanstackDbAdapter`. _(5 unit tests pass)_
- [ ] 5.3 Generate `libs/scripts` (`runtime:bun`). Export `$` wrapper over `Bun.$` with structured errors, SSH command builder, typed JSON/YAML readers, Dagger argument helpers.
- [x] 5.4 Property tests (`fast-check`) for `@wbs/realtime` covering: monotonic delivery, no replay below ack, handshake idempotency. Unit + contract tests for `@wbs/contracts`. _(backoff ±20% band + SubscriptionTracker monotonicity properties both pass; contract tests live with 5.1 — 7 unit tests)_

## 6. Backend — `apps/be-01` HTTP skeleton

- [ ] 6.1 Generate `apps/be-01` (Nx Bun app; `scope:app`, `type:app`, `runtime:bun`). Elysia HTTP server, config loaded via `@wbs/config`, `/health` endpoint, structured pino logging via `@wbs/observability`, `/metrics` via the server sub-path.
- [ ] 6.2 Create `apps/be-01/src/repository/` with Drizzle + `bun:sqlite` behind an interface; write a throwaway example repository to prove the abstraction. Add `no-restricted-imports` ESLint rule banning `drizzle-orm/*` outside `repository/`.
- [ ] 6.3 Scaffold `controller/` and `service/` layers with one smoke route end-to-end; enforce ArkType validation on every route via a shared helper.
- [ ] 6.4 Drizzle migration runner + `/health` goes 503 during migration / 200 when done. Integration tests using `app.handle(req)`.

## 7. Backend — Layer-A resume protocol in `be-01`

- [ ] 7.1 Create `event_sequencer(subscription, next_seq)` + `event_log(id, subscription, seq, message, created_at)` Drizzle schemas + migration. Add `EventSequencer` service with atomic `UPDATE … RETURNING next_seq` transaction.
- [ ] 7.2 Implement `POST /internal/forward` and `POST /internal/resume` endpoints with `X-Internal-Auth` validation, `@wbs/contracts` request/response shapes, and structured error responses.
- [ ] 7.3 Implement `/internal/push` HTTP client toward `gw-01` with retry-with-exponential-backoff and durable-log fallback on unreachable backend.
- [ ] 7.4 Implement in-memory ring buffer (1000 events OR 5 min per subscription, whichever smaller) with durable `event_log` fallback; retention job keeps ≤10k rows per subscription.
- [ ] 7.5 Property tests covering the Layer-A invariants from spec: monotonic delivery, no replay below ack, buffer bound, handshake idempotency, drain termination, session isolation.

## 8. Gateway — `apps/gw-01` WS skeleton + resume handshake

- [ ] 8.1 Generate `apps/gw-01` (Bun + Elysia, `runtime:bun`). WS endpoint at `/ws`, `/health` endpoint, pino logging + `/metrics` via `@wbs/observability/server`.
- [ ] 8.2 JWT upgrade-time auth with dual-key validation (`CURRENT` + `PREVIOUS`); fallback only on `InvalidSignature`, not on expiry/malformed. Unit-test the fallback ordering.
- [ ] 8.3 In-memory `subscription → Set<socket>` map with subscribe/unsubscribe ops; no persistence.
- [ ] 8.4 `POST /internal/push` endpoint (shared-secret auth) that fans out to subscribed sockets and returns `{delivered_to_sockets}`. Forward inbound client frames to `be-01`'s `/internal/forward` with identification headers.
- [ ] 8.5 Reconnect handshake: accept `{"type":"resume"}`, forward to `be-01`'s `/internal/resume`, relay replayed frames, emit `resume_ack` / `resume_denied`. Register `gw_*` Prometheus metrics.
- [ ] 8.6 `ping`/`pong` message type with <1s response, 25s keepalive; integration test the full reconnect cycle against a real Elysia app.

## 9. Frontend — `apps/fe-01`

- [ ] 9.1 Generate `apps/fe-01` via the `@nx-extend/shadcn-ui` plugin (Vite + React 18 + TypeScript + TanStack Router file-based routing). Add `Button` smoke component and import in the root route. Fall back to manual shadcn CLI within 1 hour if the plugin breaks.
- [ ] 9.2 Add `@tanstack/react-table` + `d3` as deps and ship minimal smoke examples to prove the build succeeds with both.
- [ ] 9.3 Wire TanStack DB in dual-mode (local + server) via a config flag; server mode uses `@wbs/realtime`'s `ReconnectingWsClient` pointed at `gw-01`. Ship the seam, not a feature collection.
- [ ] 9.4 Vitest + jsdom unit tests for a handful of components + the TanStack DB config switch. Confirm `routeTree.gen.ts` is gitignored.

## 10. Tool projects — templates, observability, secrets, hooks

- [ ] 10.1 Generate `tools/tool-compose` with per-tier Caddyfile + Compose fragment templates (`be.caddy.tmpl`, `gw.caddy.tmpl`, `fe.caddy.tmpl`, `observability.caddy.tmpl`, and matching `*.compose.tmpl`). Targets: `build`, `render`.
- [ ] 10.2 Generate `tools/tool-observability-stack` with `grafana/provisioning/{datasources,dashboards}/`, seed dashboards (`be-01-overview`, `gw-01-overview`, `wbs-alerts`), `prometheus.yml`, `promtail.yml` (labels `{service,level,version}`, structured-metadata `{request_id,connection_id,trace_id,span_id,ws_subscription}`), `loki.yml`. Targets: `build`, `validate` (JSON-schema + `promtool check`).
- [ ] 10.3 Generate `tools/tool-secrets` with placeholder `src/production.env.sops`, `src/local.env.example`, `src/README.md` (rotation playbook), and CLI in `src/cli/{decrypt,push,encrypt,updatekeys}.ts`. Root `.sops.yaml` with the first developer's age public key. Targets: `decrypt`, `push`, `encrypt`, `updatekeys` (all `cache: false`).
- [ ] 10.4 Generate `tools/tool-git-hooks` with `src/install.ts` that runs `bunx lefthook install`, and pre-commit helpers in `src/hooks/` (plaintext-secret guard, optional migration lint). Target: `install`.

## 11. Tool projects — deploy pipeline

- [ ] 11.1 Generate `tools/tool-dagger` with the TypeScript SDK module structure from design D6 (`main.ts`, `be-01.ts`, `gw-01.ts`, `fe-01.ts`, `lib/{image,bundle}.ts`). Targets: `build-{be,gw,fe}`, `test-{be,gw,fe}`, `publish-{be,gw,fe}`, `publish-all`. Each `publish-*` produces a `release-<sha>-<tier>.tar.gz` with `META.json`, `VERSION`, image tarball, templates.
- [ ] 11.2 Generate `tools/tool-bootstrap` with `src/bootstrap.sh` (POSIX, idempotent, installs pinned Bun + Docker + creates `/srv/wbs/*` tree) and `src/push.ts` (scp + ssh execute). Targets: `build` (shellcheck), `push`.
- [ ] 11.3 Generate `tools/tool-remote-scripts` with `src/{swap,swap-be,swap-gw,swap-fe}.ts` (Bun-bundled single-file outputs) and helper modules (`caddy.ts`, `health.ts`, `drain.ts`, `state.ts`). Remote Caddyfile is assembled from fragments read from `/srv/wbs/state/fragments/<tier>/` with fresh ones overwritten per deploy. Targets: `build`, `install`.
- [ ] 11.4 Generate `tools/tool-deploy` with orchestrator (`src/deploy.ts`) + per-tier (`deploy-{be,gw,fe}.ts`) and helpers (`affected.ts`, `ssh.ts`, `remote-state.ts`). Orchestrator fetches remote `/srv/wbs/state/<tier>.last-deployed.json` and runs nested `nx affected`; supports `--all`, `--since`, `--version`, `--bundle`, `--dry-run`, `--skip-build`.
- [ ] 11.5 Generate `tools/tool-smoke` with `src/{health,ws-ping}.ts` and a composite `check` target. `ws-ping` exercises a full reconnect + resume cycle and exits non-zero on any protocol violation.

## 12. First deploy and end-to-end verification

- [ ] 12.1 Provision a Hetzner Cloud host (Debian 12 or Ubuntu 24.04), authorize a dedicated deploy SSH key, open firewall ports 22/80/443, configure DNS A records for `<app>.<domain>` and `observability.<domain>`.
- [ ] 12.2 Run `nx run tool-bootstrap:push -- --host=<host>`. Verify Bun, Docker, Compose installed and `/srv/wbs/*` tree exists.
- [ ] 12.3 Edit `tools/tool-secrets/src/production.env.sops` (`sops` edit) to populate `INTERNAL_AUTH_SECRET`, `JWT_SIGNING_KEY_CURRENT`, `OBSERVABILITY_BASIC_AUTH_HASH`, `NTFY_TOPIC_URL`. Run `nx run tool-secrets:push -- --env=production --host=<host>`; verify `/srv/wbs/.env` has `0600` perms.
- [ ] 12.4 Run `nx run tool-deploy:deploy -- --all --host=<host>`. Observe Dagger builds, bundle ships, swap scripts execute, each tier goes green, old blue drains.
- [ ] 12.5 Run `nx run tool-smoke:check -- --remote=<host>`. Verify `/health` on be/gw, Grafana reachable under basic auth, ping/pong reconnect cycle passes.
- [ ] 12.6 Exercise redeploy paths: deploy-be alone (no WS impact), deploy-gw alone (drain window visible in `gw_drain_seconds` histogram), deploy-fe alone (atomic static swap). Stop `be-01` briefly to trigger the "service down" alert and confirm the ntfy push arrives.
