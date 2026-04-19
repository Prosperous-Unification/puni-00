## ADDED Requirements

### Requirement: Dagger-based build/test/publish inside `tool-dagger`

All container-image builds and production test runs MUST be driven by Dagger TypeScript SDK modules organized under `tools/tool-dagger/`. The project MUST expose Nx targets `build-be`, `build-gw`, `build-fe`, `test-be`, `test-gw`, `test-fe`, `publish-be`, `publish-gw`, `publish-fe`, and `publish-all`.

#### Scenario: Publishing produces a per-tier bundle

- **WHEN** `nx run tool-dagger:publish-be -- --version=<sha>` runs
- **THEN** `dist/tool-dagger/release-<sha>-be.tar.gz` is produced
- **AND** the tarball unpacks to a directory containing `VERSION`, `META.json`, `image.tar`, `templates/Caddyfile.tmpl`, `templates/compose.tmpl`

#### Scenario: `publish-all` fans out in parallel

- **WHEN** `nx run tool-dagger:publish-all -- --version=<sha>` runs
- **THEN** the three `publish-<tier>` targets are scheduled concurrently
- **AND** all three bundles (`release-<sha>-{be,gw,fe}.tar.gz`) exist when the command returns

### Requirement: Per-tier deploy targets with a parent orchestrator

`tools/tool-deploy/` MUST expose Nx targets `deploy`, `deploy-be`, `deploy-gw`, `deploy-fe`. Each per-tier target MUST drive its tier's Dagger publish + scp + remote swap, be independently invocable, and support `--dry-run`, `--skip-build`, `--bundle`, and `--version` flags. The `deploy` orchestrator MUST accept explicit tier lists, `--all`, or — by default — use `nx affected` against the per-tier last-deployed SHA baseline to auto-detect which tiers changed.

#### Scenario: Per-tier deploy is invocable alone

- **WHEN** `nx run tool-deploy:deploy-be -- --host=<host>` runs
- **THEN** only `be-01` is deployed (new `be-01` container starts, Caddy is reloaded, old `be-01` container stops)
- **AND** `gw-01` and `fe-01` are untouched

#### Scenario: Orchestrator defaults to affected-based detection

- **WHEN** `nx run tool-deploy:deploy -- --host=<host>` runs with only changes under `apps/fe-01/`
- **THEN** `tool-deploy` reports planning only `deploy-fe`
- **AND** `deploy-be` and `deploy-gw` targets are not invoked

#### Scenario: `--all` forces every tier

- **WHEN** `nx run tool-deploy:deploy -- --all --host=<host>` runs
- **THEN** all three per-tier deploys execute regardless of affected-status

### Requirement: Blue/green semantics per tier

`be-01` deploys MUST use simple blue/green swap (new container on a side port; Caddy reload to flip upstream; old container stopped after reload). `gw-01` deploys MUST use blue/green with a drain window (old container kept alive until its `gw_active_connections` reach 0 or `DRAIN_TIMEOUT_SECONDS` expires, default 300). `fe-01` deploys MUST use atomic static-asset directory swap (rsync into `www-new/`, then `mv www www-old && mv www-new www`) followed by a Caddy reload.

#### Scenario: `gw-01` blue container keeps sockets alive during drain

- **WHEN** `gw-01` is redeployed and `DRAIN_TIMEOUT_SECONDS=300`
- **THEN** the blue container is NOT stopped until (a) its `gw_active_connections` counter drops to 0, or (b) 300 seconds elapse
- **AND** new WS upgrades during the drain window land on green

#### Scenario: `fe-01` swap is atomic from the user's point of view

- **WHEN** `fe-01` is redeployed
- **THEN** at no observable time does Caddy serve an `index.html` whose hashed asset URLs are absent from the served directory

### Requirement: Caddy routing contract

Caddy MUST route `/api*` to `be-01`, `/ws*` to `gw-01` (with WebSocket upgrade proxied transparently), `observability.<domain>` subdomain to Grafana, and all other paths to `fe-01`'s static assets. TLS MUST be automatic via Caddy's ACME integration.

#### Scenario: WebSocket upgrade succeeds through Caddy

- **WHEN** a client opens `wss://<host>/ws` with a valid JWT
- **THEN** Caddy proxies the upgrade to `gw-01`
- **AND** the socket successfully exchanges a `ping`/`pong`

#### Scenario: Observability subdomain is reachable after DNS propagation

- **WHEN** a user navigates to `https://observability.<host>/`
- **THEN** Caddy serves the Grafana container behind HTTP basic auth

### Requirement: Remote side hosts Bun-bundled swap scripts installed by `tool-remote-scripts`

Remote host `/srv/wbs/bin/` MUST contain `swap.ts`, `swap-be.ts`, `swap-gw.ts`, `swap-fe.ts` (Bun-bundled as single-file executables via `bun build`). `tools/tool-remote-scripts/` MUST provide an `install` target that scps the built bundles to `/srv/wbs/bin/` on the target host.

#### Scenario: Installing remote scripts updates `/srv/wbs/bin/`

- **WHEN** `nx run tool-remote-scripts:install -- --host=<host>` runs
- **THEN** `/srv/wbs/bin/{swap,swap-be,swap-gw,swap-fe}.ts` on the remote match the current workspace build
- **AND** they are marked executable (`chmod +x`)

#### Scenario: Remote `swap.ts all` delegates to per-tier scripts

- **WHEN** `bun /srv/wbs/bin/swap.ts all` runs on the remote host
- **THEN** it invokes `swap-be.ts`, `swap-gw.ts`, and `swap-fe.ts` in an order compatible with their blue/green semantics
- **AND** the exit code is zero only if all three subcommands succeed

### Requirement: Last-deployed SHA baseline lives on the remote

The per-tier last-deployed SHA baseline MUST live at `/srv/wbs/state/<tier>.last-deployed.json` on the remote host. `tool-deploy` MUST fetch these files at the start of a deploy (via `ssh cat`) and use them as the `--base` for `nx affected`. On a successful per-tier deploy, the corresponding file MUST be updated.

#### Scenario: Missing baseline falls back to `--all`

- **WHEN** `tool-deploy:deploy` runs and `/srv/wbs/state/<tier>.last-deployed.json` is missing for any tier
- **THEN** that tier is treated as "affected" regardless of git state
- **AND** the orchestrator prints a warning naming the missing baseline

#### Scenario: Successful deploy updates the baseline

- **WHEN** `tool-deploy:deploy-be` completes successfully deploying `<sha>`
- **THEN** `/srv/wbs/state/be.last-deployed.json` on the remote contains `{"tier":"be","sha":"<sha>", "deployed_at":…, "bundle":"release-<sha>-be.tar.gz"}`

### Requirement: `tool-compose` owns Compose + Caddy fragment templates and rendering

`tools/tool-compose/` MUST own the Compose-service and Caddy routing-fragment templates for every tier (`be-01`, `gw-01`, `fe-01`, and the observability stack). It MUST expose at minimum `build` (copy/validate templates into `dist/`) and `render` (produce a resolved Caddyfile or Compose fragment given a tier + color + env) Nx targets. No Compose or Caddy template MAY live outside `tool-compose`.

#### Scenario: Every tier has its own Caddy fragment template

- **WHEN** the `tools/tool-compose/src/templates/` directory is listed
- **THEN** it contains at least `be.caddy.tmpl`, `gw.caddy.tmpl`, `fe.caddy.tmpl`, and `observability.caddy.tmpl` fragments
- **AND** it contains corresponding `*.compose.tmpl` fragments where the tier runs as a Compose service (`be`, `gw`, `observability`)

#### Scenario: `render` produces a valid Caddy fragment for a given tier + color

- **WHEN** `nx run tool-compose:render -- --tier=be --color=green --be-port=3101` runs
- **THEN** the output is a Caddy configuration fragment whose upstream for `/api*` references port 3101
- **AND** the fragment is valid `Caddyfile` syntax (passes `caddy validate` when assembled with the other fragments)

### Requirement: Caddyfile and Compose are composed from per-tier fragments on the remote

On the remote host, the complete Caddyfile and Compose file MUST be assembled at swap time by concatenating per-tier fragments. Each per-tier deploy MUST write its fresh fragment to `/srv/wbs/state/fragments/<tier>/` on the remote so subsequent per-tier deploys can read back last-known fragments for tiers they do not touch. A monolithic hand-edited Caddyfile MUST NOT live on the remote.

#### Scenario: Deploying only `be-01` does not overwrite `gw-01`'s fragment

- **WHEN** `nx run tool-deploy:deploy-be` completes successfully
- **THEN** `/srv/wbs/state/fragments/be/Caddyfile.tmpl` is updated to the new `be-01` fragment
- **AND** `/srv/wbs/state/fragments/gw/Caddyfile.tmpl` is unchanged from its previous deploy
- **AND** the assembled Caddyfile on the remote contains both fragments

### Requirement: Release bundle contains a `META.json` with a `schema_version` field

Every `release-<sha>-<tier>.tar.gz` produced by `tool-dagger:publish-<tier>` MUST contain a top-level `META.json` file whose JSON object includes at minimum the fields `tier`, `sha`, `built_at`, `schema_version`. The remote swap scripts MUST reject bundles whose `schema_version` is not in a known-supported set.

#### Scenario: Bundle with unknown `schema_version` is rejected on the remote

- **WHEN** a bundle with `META.json.schema_version = 99` arrives on the remote and `bun /srv/wbs/bin/swap-be.ts` processes it
- **THEN** the script exits non-zero with an error message naming the unsupported schema version
- **AND** no container swap is performed

#### Scenario: Bundle with supported `schema_version` deploys normally

- **WHEN** a bundle with `META.json.schema_version = 1` arrives on the remote
- **THEN** the swap script proceeds with the normal blue/green flow

### Requirement: `tool-bootstrap` is the only project that ships a `.sh` file

`tools/tool-bootstrap/src/bootstrap.sh` MUST be the only `.sh` file shipped in the workspace. Every other infra operation MUST be a Bun/TypeScript file. `tool-bootstrap` MUST expose `build` (shellcheck) and `push` (scp + ssh execute) targets. The script MUST be idempotent and install Bun, Docker, Docker Compose, and create the `/srv/wbs/*` directory tree.

#### Scenario: Running `bootstrap.sh` twice is a no-op on the second run

- **WHEN** `bootstrap.sh` runs on a host that already has the pinned Bun version installed
- **THEN** the script exits 0 without re-running the Bun installer
- **AND** `/srv/wbs/*` directories are not modified

#### Scenario: Repository contains exactly one `.sh` file

- **WHEN** `find . -name '*.sh' -not -path './node_modules/*' -not -path './.nx/*'` runs from the workspace root
- **THEN** the only result is `tools/tool-bootstrap/src/bootstrap.sh`
