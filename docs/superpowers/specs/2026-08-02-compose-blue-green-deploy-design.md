# Compose + blue/green deploy — design

Date: 2026-08-02
Status: approved, not yet implemented
Supersedes: the systemd build-on-server path added in `a318cff` (`deploy/deploy.sh`, `deploy/systemd/`, `deploy/caddy/`)
Revives, with changes: D2, D6, D8, D9, D15 of `openspec/changes/scaffold-tech-setup/design.md`

## Context

The original scaffold specified a Dagger-built, Docker Compose, blue/green pipeline across
`tool-dagger`, `tool-compose`, `tool-remote-scripts`, and `tool-deploy`. None of it was ever
finished — the modules plan and print, `tool-deploy` reads a `mockRemoteState()`, `swap-be.ts`
hardcodes `activeColor: 'blue'` with `dryRun: true`, and `push.ts` states outright that
`--execute` is not wired to a real SSH call.

Commit `a318cff` replaced that path with build-on-server systemd units, which is what runs on
h2puni today and works. This design moves back to Compose deliberately, for three stated
reasons:

1. **Many tools on one box.** h2puni will run wbs-tool plus Grafana/Loki/Prometheus plus other
   side projects, and they should be managed uniformly rather than as ad-hoc systemd units.
2. **Zero-downtime deploys.** Real collaborative WebSocket sessions will be running during a
   deploy. The current stop-then-start costs 1–2 seconds of hard downtime.
3. **Reproducible environments.** The same image should run locally and on the server.

Multi-host is explicitly **not** a driver. h2puni is the only target, and this design does not
carry machinery for a second one.

## Goals

- One `nx run tool-deploy:deploy` that builds only what changed and swaps it in without downtime.
- The build host is a swappable input, not an architectural commitment.
- Every service on the box, including ingress, is a Compose service.
- TLS from day one on a real domain.

## Non-Goals

- Multi-host or multi-environment orchestration.
- Kubernetes, Swarm, or any scheduler.
- Auto-rollback on smoke-test failure.
- Phase 2 items (observability stack, SOPS secrets) — separately specified below but out of
  scope for the first implementation plan.

## Decisions

### 1. Everything on h2puni is a Compose service

The domain is **`bulletpoints.club`**. Three hostnames, all A records pointing at `62.238.48.248`:

| Host                              | Serves                                | Phase |
| --------------------------------- | ------------------------------------- | ----- |
| `wbs.bulletpoints.club`           | the app — `/api/*`, `/ws*`, static fe | 1     |
| `registry.bulletpoints.club`      | the image registry, basic auth        | 1     |
| `observability.bulletpoints.club` | Grafana, basic auth                   | 2     |

Caddy provisions Let's Encrypt certificates for each automatically on first request.

```
caddy            :80 :443    TLS terminator; the only published ports
registry:2       :5000       bound to 127.0.0.1
be-01-blue / be-01-green     one live, one idle
gw-01-blue / gw-01-green     one live, one idle
                             fe-01 is static assets, not a service
```

All on one docker network, `wbs-net`. Caddy routes `/api/*` to the live be container, `/ws*` to
the live gw container, and everything else to `/srv/wbs/www/<sha>` as static files. Upstreams
are container DNS names (`be-01-green:3100`), so **no host ports are published for the app
tiers at all**.

That last point is a security improvement over today, not just a tidiness one. `/internal/*`
and `/metrics` are unauthenticated on both services and currently depend on binding to
localhost. On a docker network they are unreachable from outside the network regardless.

Caddy moves into Compose (D9's original intent), which means the host caddy installed by
`configure.sh` is removed along with its `/etc/sudoers.d/wbs-caddy-reload` rule. Reloads happen
via `docker exec caddy caddy reload --config /etc/caddy/Caddyfile`, which needs no privilege.

### 2. The build host is a swappable input

Four places a build may originate — this Mac (arm64), some other amd64 Linux box, h2puni
itself, or GitHub Actions — and the design must not prefer one.

**Every build pins `--platform linux/amd64` explicitly and never inherits the host
architecture.** An arm64 Mac emulates; everything else builds natively. Same instruction, same
output, and nothing downstream knows where it ran.

Two config knobs, neither touching swap logic:

| Knob                 | Values                                                                                                          |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| `DAGGER_RUNNER_HOST` | unset → engine on this machine; `ssh://puni1@h2puni` → engine on the server; unset in CI → engine on the runner |
| `REGISTRY`           | `registry.bulletpoints.club` (default) or `ghcr.io/prosperous-unification`                                      |

### 3. A registry is the contract between build and deploy

`tool-dagger` publishes; `tool-deploy` pulls. Neither knows anything else about the other. This
is what keeps the build host pluggable — changing it is one env var.

Self-hosted: a `registry:2` container on h2puni behind Caddy at `registry.bulletpoints.club` with TLS
and basic auth. Chosen because a server-side build pushes over loopback and pays nothing, it
keeps the stack self-hosted, and it is one more service on a box already being managed
uniformly. GHCR remains a one-line swap.

Cost, stated plainly: building on the Mac or in CI pushes roughly 100MB per changed tier over
that host's uplink. That is a property of choosing that build host, not of this design.

This replaces D7's bundle format entirely. `release-<sha>-<tier>.tar.gz`, `META.json`,
`schema_version`, and `/srv/wbs/releases/` are all unnecessary and will not be built.

### 4. Deploy by digest

`publish` captures the digest the registry returns and records it. The swap pulls
`wbs-be-01@sha256:…`, never `:<sha>`.

Tags can be overwritten — most plausibly by a rebuild on a different host — and digests cannot.
With reproducibility as a driver and four possible build origins, this is what makes those
origins genuinely interchangeable rather than merely similar.

Rollback: `deploy --version=<older-sha>` looks that SHA's digest up in the server-side release
record, pulls, and swaps.

### 5. fe-01 ships as a data-only image

The Dagger engine may run on the server, but the client runs on the developer's machine, and
`Container.export()` writes to the **client** filesystem. Static assets therefore cannot simply
be exported to the server.

Instead fe-01 builds into an image containing only `dist/`. The swap runs `docker create` plus
`docker cp` to extract it into `/srv/wbs/www/<sha>`, points Caddy's root at the new directory,
and reloads. Atomic, no symlink race. Previous directories remain for instant rollback; prune
below the newest three.

### 6. Deploy state lives on the server

`/srv/wbs/state/<tier>.json` per tier: active color, SHA, digest, timestamp. Unchanged from D8
apart from dropping the bundle filename and adding the digest.

`tool-deploy` reads all three in one SSH round trip, feeds each tier's SHA to `nx affected` as
its baseline, and builds only what changed. A missing file means "never deployed" and deploys
unconditionally.

### 7. Swap sequence

**be-01 and gw-01** — identical apart from the drain:

1. `docker compose up -d <tier>-green` — pulls by digest, starts on the idle color.
2. Poll green's `/health` every 500ms, 60s ceiling.
3. Render the Caddy fragment at green, `docker exec caddy caddy reload`.
4. gw only: drain loop — poll blue's `gw_active_connections` every 10s until zero or 300s.
5. `docker compose stop <tier>-blue`, then write the state file.

**fe-01** has no health gate; static files cannot be unhealthy. Extract, repoint root, reload.

Rollback follows D2 unchanged: before the reload, stop green and walk away; after the reload
but before blue stops, re-render at blue and reload again; after blue is gone, redeploy the
previous digest.

The state file is written **last** so that a killed deploy still names blue, and re-running
re-attempts the same swap idempotently.

### 8. Migrations must be backward-compatible with the previous release

Blue and green both mount `/srv/wbs/data/be`, so during the overlap two be-01 processes share
one SQLite file, and green runs `runMigrations()` on startup while blue still serves the old
schema. Today's stop-then-start deploy hides this completely.

WAL mode makes the concurrent access itself survivable — readers do not block and writers
serialize over a few hundred milliseconds of overlap. A **destructive** migration is not
survivable: green drops a column, blue's next query against it fails, and blue remains the live
upstream until step 5.

The rule: add columns, do not drop them; drop in a later deploy once nothing references them.

To keep this from becoming folklore, `tool-deploy` compares the migration directory against the
deployed SHA. On finding new migration files it requires an explicit `--with-migrations` flag
before it will blue/green, and otherwise refuses and suggests `--stop-the-world` for a plain
restart. This converts a silent 3am failure into a prompt at deploy time.

The WebSocket side needs no equivalent rule: the Layer-A resume protocol means dropped sockets
reconnect and replay from `event_log`, so the drain window is insurance rather than the primary
mechanism.

### 9. Testing

The repo's existing split holds — pure planning functions with a thin IO shell. `planSwap()`
takes current state and returns an ordered step list; something else executes it. This is why
`swap.test.ts` and `render.test.ts` have value despite nothing ever having been deployed.

1. **Unit** — planners, template rendering, tier selection, digest parsing. No docker.
2. **Integration** — the full stack on h2puni under a second Compose project name,
   `wbs-staging`, with its own ports and its own `/srv/wbs-staging` tree. Run a real blue/green
   swap against it and assert continuous availability. Same kernel, same docker, same images as
   production, no risk to production.
3. **Smoke** — `tool-smoke` after every production deploy: `/health` on both tiers, an
   authenticated `/internal/forward` round trip, a WS connect-and-resume, and a fetch of
   `index.html`.

The integration level does not exist today and matters most. It is what would have caught the
`INTERNAL_AUTH_SECRET` bug that shipped for weeks in `a318cff`, and it is what makes decision 8
enforceable: deploy the previous SHA to staging, deploy the new one on top, and a
backward-incompatible migration fails there instead of in production.

### 10. Failure handling

| Failure                              | Behaviour                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| SSH or registry unreachable at start | Abort before anything starts. Nothing changed.                                        |
| Image pull fails                     | Abort. Blue still live.                                                               |
| Green fails `/health` within 60s     | Stop green, dump its logs to the operator's terminal, exit non-zero. Blue never left. |
| `caddy reload` fails                 | Green is up but unrouted. Stop green, leave blue live, exit non-zero.                 |
| Drain times out at 300s              | Proceed. Remaining sockets drop and resume via Layer-A. Logged, not fatal.            |
| Smoke fails after swap               | Report loudly, exit non-zero, do **not** auto-rollback.                               |
| Deploy killed mid-run                | State file names blue. Re-running re-attempts the same swap idempotently.             |

Smoke failure deliberately does not auto-rollback: an automatic rollback triggered by a flaky
smoke test is worse than a human looking at it.

`--dry-run` prints the full plan without executing and remains the default for anything
destructive until `--execute` is passed, matching the convention the existing scaffolds assume.

## Risks / Trade-offs

**The Dagger remote runner over SSH is unproven here.** `_EXPERIMENTAL_DAGGER_RUNNER_HOST`
carries that prefix for a reason, and it has not been verified against this host. **Spike this
first, before any other implementation work.** If it proves unreliable, the fallback is GitHub
Actions building and pushing to the same registry — decisions 3 through 10 are unaffected,
because the registry is the contract.

**Compose blue/green is hand-rolled.** Docker Compose has no native blue/green primitive, so
the colour logic is ours to write and ours to get wrong. Mitigated by the staging project in
decision 9, which exercises the real swap path on the real host.

**More moving parts than systemd.** Today's setup is four files and a `bun run`. This is a
registry, an ingress container, six app containers, and an orchestrator. The justification is
the three drivers in Context; if those stop being true, this is over-built.

**Emulated builds on the Mac are slow.** Accepted, and avoidable by pointing
`DAGGER_RUNNER_HOST` at the server.

## Phasing

**Phase 1 — this design.** Dagger builds, registry, Compose with containerised Caddy, all three
tiers, blue/green with the gw drain, TLS on the domain, staging project, smoke. Secrets stay in
`/srv/wbs/.env` as they are today.

**Phase 2 — additive, separately specified.** The observability stack (Grafana, Loki, Promtail,
Prometheus) on `observability.bulletpoints.club` behind basic auth per D15, and SOPS + age replacing the
hand-written `.env` per D18. Both are additive and cannot break Phase 1.

## Migration from the current deployment

1. Spike the Dagger remote runner against h2puni. Do not proceed until it works or the CI
   fallback is chosen.
2. Build Phase 1 against the `wbs-staging` Compose project on h2puni, leaving the live systemd
   deployment untouched throughout.
3. Cut over: stop the systemd units, `docker compose up` production, verify smoke.
4. Delete `deploy/deploy.sh`, `deploy/systemd/`, `deploy/caddy/`; disable and remove the host
   caddy and `/etc/sudoers.d/wbs-caddy-reload`; reduce `configure.sh` to installing docker,
   creating `/srv/wbs`, and enabling linger. Bun is no longer installed on the host — it exists
   only inside images.

The live deployment stays up and serving throughout steps 1 and 2.

## Open questions

None. The domain (`bulletpoints.club`) was the last one; see decision 1 for the three hostnames it
resolves to.
