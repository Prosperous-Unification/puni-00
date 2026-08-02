# Compose blue/green deploy — handover

Written 2026-08-03. Branch `feat/compose-blue-green`, HEAD `1a043cd`, 27 commits.

This file exists so a session with no memory of the build can resume. The spec is
`docs/superpowers/specs/2026-08-02-compose-blue-green-deploy-design.md` (revision 2),
the plan is `docs/superpowers/plans/2026-08-02-compose-blue-green-deploy.md`, and the
Dagger spike is `docs/superpowers/spikes/2026-08-02-dagger-remote-engine.md`.

## Status

All 12 planned tasks are implemented and reviewed. The pipeline **works** — the
committed orchestrator has driven real three-tier deploys, and `https://wbs.bulletpoints.club`
is serving from it right now with a Let's Encrypt certificate.

The branch is **merge-ready**. It is **not** ready to retire the old systemd path,
for the reasons below.

## What is live on h2puni

- Compose stack on network `wbs-net`: `caddy` (only published ports: 80, 443, 443/udp),
  `registry:2` (no host binding), and blue/green pairs for `be-01`, `gw-01`, `fe-01`.
- A privileged `dagger-engine` container on `127.0.0.1:8081`, driven over an SSH tunnel.
- Registry at `registry.infra.bulletpoints.club`, basic auth, real certificate.
- The **old systemd path still exists in the repo** (`deploy/deploy.sh`, `deploy/systemd/`,
  `deploy/caddy/`) and is deliberately not deleted. Plan steps 5 and 6 are outstanding.

Deploy with `nx run tool-deploy:deploy --all --execute`. It refuses if the working tree
is dirty or if `dist/tool-dagger/release.json` does not match HEAD — re-publish first
with `nx run tool-dagger:publish-all`.

## Open findings, ranked

These were found by the final whole-branch review and deliberately scoped out of the
fix waves. None break the running site; all three gate retiring the systemd path.

1. **I7 — secrets are over-distributed (worst of the three).** `tier.compose.tmpl` gives
   every tier `/srv/wbs/.env` and a writable mount of `/srv/wbs/data`. So `fe-01` — the
   public static-file container — holds `INTERNAL_AUTH_SECRET`, `JWT_SIGNING_KEY_CURRENT`
   and `REGISTRY_PASS`, and can write the directory containing `wbs.db`. The registry is
   internet-facing with delete enabled, so a compromise of `fe-01` means image push and
   delete. Related: `.dockerignore`'s `*.db` is not recursive, so `apps/be-01/local.db`
   is inside the published production image — use `**/*.db`.
2. **I2 — `activeConnections` has no fetch timeout** (`swap.ts`). `drain`'s `maxWaitMs`
   bounds the loop but not a hung request, so a wedged `gw-01` holds the deploy lock for
   the full 300s drain ceiling. Every other fetch in the codebase uses `AbortController`;
   copy that pattern.
3. **I5 — the smoke layer cannot be invoked.** `tool-smoke`'s Nx target mounts `$PWD`,
   which requires the repo on the server, and nothing in `tool-deploy` or `swap.ts` calls
   smoke at all. Design decision 9's "after every deploy" is unimplemented, so there is
   currently no post-deploy verification.

Lower priority, recorded so they are not rediscovered:

- `--version=<sha>` (the documented rollback) is parsed and silently ignored; `--since`
  and `--skip-build` are dead too, and `affected` is hardcoded to all three tiers.
- `configure.sh` has never been executed as a script — the scoped sudo grant does not
  cover `sudo sh configure.sh`, so its steps have only ever been run by hand.
- The registry preflight proves manifests exist, not blobs. A manifest-present /
  blob-missing registry would still fail mid-deploy.
- The hand-rolled RFC6455 client in `tool-smoke/src/ws-ping.ts` omits the MASK bit and
  never verifies `Sec-WebSocket-Accept`. Verified harmless against Bun's WS server, which
  does not enforce either; would surface as a false FAIL if that engine ever changes.
- `flock` acquisition failure is not distinguished from an FFI error (errno is not read),
  so an `ENOLCK` reports as "another deploy is running".

## Properties that are proven, not assumed

Worth knowing so nobody re-litigates them:

- **A WebSocket survives a swap.** One socket held open across an 82s real `gw` blue→green
  swap: 26 pings, 27 pongs, zero closes, HTTP loop unbroken. `stream_close_delay 310s` works.
- **The platform pin is real.** A control build at `linux/arm64` reported `aarch64` while the
  pinned build reported `x86_64`, so `--platform` drives the result rather than coinciding
  with the host architecture.
- **The abort path works.** Proven by deliberate fault injection: green stopped,
  `be-01.internal` handed back to blue, `site.caddy` restored byte-identical, blue never
  left rotation.
- **The lock releases on process death.** SIGKILL test asserts the holder record survives
  the kill (so no cleanup handler ran) and the lock is still acquirable — only the kernel
  can explain that.

## Things that are true and surprising

- During a `be` swap, `be-01.internal` resolves to **both** colours via Docker's round-robin
  for the whole grant→revoke window. Both are alive; there is no blackout. This means two
  releases briefly share one SQLite file with no version negotiation, and `gw-01`'s
  `ForwardClient` has no retry. Recorded in decision 7.
- `caddy reload` exits 0 even when the Caddyfile it reloads never mentions the config you
  just wrote. That silently no-opped every swap until Task 12 caught it; `swap.ts` now
  verifies against Caddy's admin API rather than trusting the exit code.
- `bun:sqlite` opens without WAL and with `busy_timeout=0` by default. Both are now set and
  asserted at startup in `apps/be-01/src/repository/db.ts`.
