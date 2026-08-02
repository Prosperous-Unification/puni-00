# Compose + blue/green deploy — design

Date: 2026-08-02
Status: approved, not yet implemented. Revision 2, after cross-review.
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

### Why this is deliberately more than the use case needs

Both cross-reviews (Gemini, Codex — 2026-08-02) independently concluded this design is
"massively over-engineered for a single-host, single-user hobby project," and recommended
collapsing to Docker Swarm or plain `docker compose up`.

That assessment is correct on its own terms and is knowingly rejected. **The scaffold is the
deliverable.** The goal is a reusable deployment substrate that runs on low-tier infrastructure
today and scales up later, carried to other projects; the WBS tool is the test workload, not
the point. Complexity that buys future scale is in scope. Complexity that buys nothing is not.

This section exists so future reviewers do not re-derive the same objection. It is not a licence
for defects — every correctness finding from those reviews is addressed below.

Multi-host is not a driver _today_. h2puni is the only current target, and this design does not
carry live machinery for a second one, but decisions are made so a second host is additive
rather than a rewrite.

## Goals

- One `nx run tool-deploy:deploy` that builds only what changed and swaps it in without downtime.
- The build host is a swappable input, not an architectural commitment.
- Every service on the box, including ingress, is a Compose service.
- TLS from day one on a real domain.

## Non-Goals

- Multi-host or multi-environment orchestration in this phase.
- Kubernetes, Swarm, or any scheduler.
- Auto-rollback on smoke-test failure.
- Phase 2 items (observability stack, SOPS secrets) — separately specified below but out of
  scope for the first implementation plan.

## Verified vs unverified claims

Revision 1 asserted four things that turned out to be false. They are corrected below, but the
lesson generalises: **this document distinguishes what has been checked from what has not.**

Verified against primary sources or this repo:

| Claim                                                                                                                             | Status                                                           |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `_EXPERIMENTAL_DAGGER_RUNNER_HOST` accepts only `container://`, `image://`, `kube-pod://`, `unix://`, `tcp://` — **not `ssh://`** | Verified, Dagger docs                                            |
| Caddy `reverse_proxy` **forcibly closes WebSockets on config reload** unless `stream_close_delay` is set                          | Verified, Caddy docs (quoted in decision 7)                      |
| This repo opens SQLite with no `journal_mode=WAL` and no `busy_timeout`                                                           | Verified, `apps/be-01/src/repository/migrate.ts:6`               |
| `gw-01` reads `BE_URL` once at startup and holds it in `ForwardClient`                                                            | Verified, `apps/gw-01/src/main.ts:6`, `apps/gw-01/src/app.ts:30` |
| A container cannot reach a host-loopback-bound port via `127.0.0.1`                                                               | Verified, Caddy Docker docs                                      |
| Existing `be.caddy.tmpl` uses `handle_path`, stripping `/api` before be-01 sees it                                                | Verified, `tools/tool-compose/src/templates/be.caddy.tmpl:1`     |

Not yet verified — **the spike in Migration step 1 exists to settle these**:

- That a Dagger engine container on h2puni, reached through an SSH tunnel at
  `tcp://127.0.0.1:<port>`, builds and publishes successfully from an arm64 client.
- Whether Caddy re-resolves a changed Docker DNS alias without a reload (decision 7 avoids
  depending on this, but it would simplify the swap if true).

## Decisions

### 1. Everything on h2puni is a Compose service

The domain is **`bulletpoints.club`**. Three hostnames, all A records at `62.238.48.248`:

| Host                                    | Serves                                | Phase |
| --------------------------------------- | ------------------------------------- | ----- |
| `wbs.bulletpoints.club`                 | the app — `/api/*`, `/ws*`, static fe | 1     |
| `registry.infra.bulletpoints.club`      | the image registry, basic auth        | 1     |
| `observability.infra.bulletpoints.club` | Grafana, basic auth                   | 2     |

Infrastructure hostnames are grouped under `infra.` so the product namespace stays clean and a
future wildcard cert or DNS delegation can cover them in one stroke.

Note the label is `infra`, **not `_infra`**. A leading underscore is legal in DNS but not in a
hostname used for TLS: public CAs including Let's Encrypt reject certificate requests for names
containing underscores, and `_`-prefixed labels are reserved by convention for service records
such as `_acme-challenge`. `registry._infra.bulletpoints.club` would resolve but could never get
a certificate, which defeats the point of putting the registry behind TLS at all.

Services, all on one user-defined docker network `wbs-net`:

```
caddy                    :80 :443 :443/udp   the ONLY published ports
registry:2               on wbs-net only, never published to the host
be-01-blue  / be-01-green      one live, one idle
gw-01-blue  / gw-01-green      one live, one idle
fe-01-blue  / fe-01-green      static-server containers, one live, one idle
```

**No host ports are published for any app tier or the registry.** Upstreams are container DNS
names. This is a security improvement, not just tidiness: `/internal/*` and `/metrics` are
unauthenticated on both services and currently rely on binding to localhost.

Corrected from revision 1: the registry is **not** bound to host `127.0.0.1:5000`. A
containerised Caddy cannot proxy to host loopback — inside that container, `127.0.0.1` is the
container itself. The registry lives on `wbs-net` and Caddy proxies to `registry:5000`.

Caddy needs **persistent volumes or it will re-request certificates on every restart** and hit
Let's Encrypt rate limits:

```yaml
caddy:
  volumes:
    - caddy_data:/data # certificates and ACME state — REQUIRED
    - caddy_config:/config
    - /srv/wbs/caddy:/etc/caddy:ro
  ports: ['80:80', '443:443', '443:443/udp']
```

The existing `fe.compose.tmpl` stub has exactly this bug and must be rewritten, not adapted.

Caddy moves into Compose (D9's original intent), so the host caddy installed by `configure.sh`
is removed along with its `/etc/sudoers.d/wbs-caddy-reload` rule. Reloads happen via
`docker exec caddy caddy reload --config /etc/caddy/Caddyfile`, needing no privilege.

### 2. The build host is a swappable input

Four places a build may originate — this Mac (arm64), some other amd64 Linux box, h2puni
itself, or GitHub Actions — and the design must not prefer one.

**Every build pins `--platform linux/amd64` explicitly and never inherits the host
architecture.** An arm64 Mac emulates; everything else builds natively.

Corrected from revision 1: **`ssh://` is not a valid Dagger runner scheme.** The supported set
is `container://`, `image://`, `kube-pod://`, `unix://`, `tcp://`. Remote builds therefore work
by tunnelling to a real engine:

```sh
# once, on h2puni: a persistent engine container with persistent state
docker run -d --restart always --privileged \
  -v dagger-engine:/var/lib/dagger \
  -p 127.0.0.1:8080:8080 --name dagger-engine registry.dagger.io/engine

# per session, on the client
ssh -NL 8080:127.0.0.1:8080 h2puni &
export _EXPERIMENTAL_DAGGER_RUNNER_HOST=tcp://127.0.0.1:8080
```

The engine requires `--privileged` and a persistent `/var/lib/dagger` for its build cache.
Both are why it is a long-lived container rather than something the deploy starts.

| Knob                 | Values                                                                                                                           |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `DAGGER_RUNNER_HOST` | unset → engine on this machine; `tcp://127.0.0.1:8080` over an SSH tunnel → engine on h2puni; unset in CI → engine on the runner |
| `REGISTRY`           | `registry.infra.bulletpoints.club` (default) or `ghcr.io/prosperous-unification`                                                 |

### 3. A registry is the contract between build and deploy

`tool-dagger` publishes; `tool-deploy` pulls. Neither knows anything else about the other. This
is what keeps the build host pluggable — changing it is one env var.

Self-hosted: a `registry:2` container on `wbs-net`, fronted by Caddy at
`registry.infra.bulletpoints.club` with TLS and basic auth. GHCR remains a one-line swap.

**Both directions need credentials.** Revision 1 specified the push and forgot the pull:

- The **build client** logs in to push. Credentials come from the environment, or `docker login`.
- **h2puni's own docker daemon logs in to pull**, because `docker compose up` fetches by digest
  from an authenticated registry. Without `~/.docker/config.json` on the server the swap fails
  at step 1 on a fresh host. `configure.sh` provisions this.

Registry configuration also needs, and revision 1 omitted:

- storage at `/var/lib/registry` on a named volume, included in backups
- `X-Forwarded-Proto` / `X-Forwarded-For` passed through by Caddy, or pushes fail confusingly
- garbage collection, since every deploy of every tier adds a layer set that is never reclaimed
  automatically. A `registry garbage-collect` run, scheduled weekly.

Cost, stated plainly: building on the Mac or in CI pushes roughly 100MB per changed tier over
that host's uplink. That is a property of choosing that build host, not of this design.

This replaces D7's bundle format entirely. `release-<sha>-<tier>.tar.gz`, `META.json`,
`schema_version`, and `/srv/wbs/releases/` are unnecessary and will not be built.

### 4. Deploy by digest

`publish` captures the digest the registry returns and records it. The swap pulls
`wbs-be-01@sha256:…`, never `:<sha>`.

Tags can be overwritten — most plausibly by a rebuild on a different host — and digests cannot.
With reproducibility as a driver and four possible build origins, this is what makes those
origins genuinely interchangeable rather than merely similar.

Rollback: `deploy --version=<older-sha>` looks that SHA's digest up in the server-side release
record, pulls, and swaps.

### 5. fe-01 ships as a static-server container

Revision 1 had fe-01 as a data-only image extracted host-side with `docker create` + `docker cp`.
Both reviewers independently rejected this, correctly: `docker cp` is not atomic and can leave a
partial tree, an `index.html` referencing missing hashed assets is a broken deploy that no
health check would catch, and it leaks application state onto the host filesystem in a design
whose first decision is that everything is a container.

fe-01 is instead a normal static-server image — `FROM caddy:alpine` with `dist/` baked in and a
minimal Caddyfile doing `try_files {path} /index.html`. It joins Compose as `fe-01-blue` /
`fe-01-green` and the ingress Caddy proxies to it exactly like the other two tiers.

This deletes an entire mechanism: no host directory tree, no `<sha>` directories, no pruning, no
atomic-move dance. All three tiers now share one deploy model. It costs one in-network proxy hop.

Static files can also be unhealthy after all, so fe-01 gets the same health gate as the others:
fetch `/` and assert a 200 plus a non-empty body before routing to it.

### 6. Deploy state is derived, not declared

`/srv/wbs/state/<tier>.json` records active colour, SHA, digest, and timestamp — but it is a
**cache, not the source of truth.**

Revision 1 claimed writing it last made a killed deploy idempotent. That is wrong, and both
reviewers caught it. If the process dies after `caddy reload` but before the state write, Caddy
routes to green while the file says blue; the next deploy treats green as idle and destroys the
container serving production traffic.

Gemini's suggested fix — write the file _before_ the reload — fails identically in the mirrored
window, so it is not adopted.

**The rendered Caddy config is the source of truth for which colour is live.** Every deploy
begins by reading the actual routing state and the actual running containers, and reconciles the
state file against them. A disagreement is logged and the observed state wins.

On top of that:

- **A `flock` on the server** serialises deploys. Two concurrent deploys are otherwise
  unrecoverable, and nothing in revision 1 prevented them.
- **Config writes are atomic** — write to a temp file, `fsync`, `rename` — so a crash can never
  leave a partial Caddyfile that a later Caddy restart would happily load.
- **A phase marker** advances through `preparing → routed → old-stopped → committed`, so
  recovery knows which window it died in without having to infer it.

`tool-deploy` still reads all three state files in one SSH round trip to feed `nx affected` a
per-tier baseline. A missing file means "never deployed" and deploys unconditionally.

### 7. Swap sequence

**The WebSocket claim in revision 1 was false.** From the Caddy documentation, verbatim:

> "By default, WebSocket connections are forcibly closed (with a Close control message sent to
> both the client and upstream) when the config is reloaded."

Revision 1 put the drain loop _after_ the reload, so it would have drained an already-empty set
and delivered exactly the downtime it was meant to prevent. The `/ws*` proxy therefore carries
`stream_close_delay 310s` from day one — slightly above the 300s drain ceiling — so existing
sockets survive the reload long enough to be drained deliberately.

**gw→be uses a stable network alias.** `gw-01` reads `BE_URL` once at startup, so pointing it at
a colour-specific container name would make the tiers inseparable. It instead targets
`be-01.internal`, a docker network alias moved atomically during a be swap. gw never restarts
and is never reconfigured when be deploys.

Caddy's own upstreams are handled by reload rather than by the alias, because whether Caddy
re-resolves changed Docker DNS without a reload is unverified. Two mechanisms, each used where
it is known to work.

**be-01:**

1. `docker compose up -d be-01-green` — pulls by digest.
2. Run migrations as a **discrete step** against green, before it takes traffic (decision 8).
3. Poll green's `/health` every 500ms, 60s ceiling.
4. Move the `be-01.internal` alias to green — gw follows immediately, no restart.
5. Render the Caddy fragment at green, `docker exec caddy caddy reload`.
6. `docker compose stop be-01-blue`, commit state.

**gw-01:**

1. `docker compose up -d gw-01-green`, poll `/health`.
2. Render fragment at green, reload. Existing sockets survive via `stream_close_delay`.
3. Drain loop — poll blue's `gw_active_connections` every 10s until zero or 300s.
4. `docker compose stop gw-01-blue`, commit state.

**fe-01:** identical to gw-01 without the drain.

Rollback follows D2: before the reload, stop green and walk away; after the reload but before
blue stops, re-render at blue and reload again; after blue is gone, redeploy the previous digest.

### 8. Migrations must be backward-compatible with the previous release

Blue and green both mount `/srv/wbs/data/be`, so during the overlap two be-01 processes share
one SQLite file.

**Correcting revision 1: WAL is not enabled in this repo.** `apps/be-01/src/repository/migrate.ts:6`
opens `new Database(dbPath)` with no pragmas at all, and there is no `busy_timeout` anywhere in
`apps/` or `libs/`. SQLite therefore defaults to rollback-journal mode, where a writer takes an
EXCLUSIVE lock that blocks **readers** as well as writers, with a zero busy timeout. Under
revision 1's design, blue's next read during green's migration would have failed immediately
with `SQLITE_BUSY` — not degraded, failed.

**Prerequisite, before blue/green is safe at all:** enable `journal_mode=WAL` and
`busy_timeout=5000` on every connection, and assert both at startup so a regression is loud.
This is implementation task one, ahead of any Compose work.

Even with WAL, `SQLITE_BUSY` remains possible, so migrations do **not** run implicitly on
container startup. They run as a discrete deploy step (decision 7, be-01 step 2) that must
succeed before green joins rotation. A failed migration aborts the deploy with blue untouched.

The rule stands: add columns, do not drop them; drop in a later deploy once nothing references
them. `tool-deploy` compares the migration directory against the deployed SHA, and on finding
new files requires an explicit `--with-migrations` flag, otherwise refusing and suggesting
`--stop-the-world` for a plain restart.

The WebSocket side needs no equivalent rule: the Layer-A resume protocol means dropped sockets
reconnect and replay from `event_log`, so the drain window is insurance rather than the primary
mechanism.

### 9. Testing

The repo's existing split holds — pure planning functions with a thin IO shell. `planSwap()`
takes current state and returns an ordered step list; something else executes it.

1. **Unit** — planners, template rendering, tier selection, digest parsing. No docker.
2. **Integration** — the full stack on h2puni under a second Compose project name,
   `wbs-staging`, with its own network and volumes. Run a real blue/green swap and assert
   continuous availability. Same kernel, same docker, same images as production.
3. **Smoke** — after every production deploy.

**Smoke must run inside `wbs-net`, not from outside.** Revision 1 specified smoke checks against
`/health` and `/metrics` while also specifying that Caddy exposes neither — a direct
self-contradiction, and `tools/tool-smoke/src/health.ts:20` already checks exactly those public
URLs. Smoke runs as a throwaway container on `wbs-net`, reaching services by container name.

The WS smoke check is currently a scaffold that prints and exits
(`tools/tool-smoke/src/ws-ping.ts:78`). **It must be made real before any zero-downtime claim is
credible**, since it is the only automated check that would detect the `stream_close_delay`
failure this revision exists to fix.

The integration level is what makes decision 8 enforceable: deploy the previous SHA to staging,
deploy the new one on top, and a backward-incompatible migration fails there instead of in
production.

### 10. Failure handling

| Failure                                              | Behaviour                                                                                                         |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Another deploy holds the `flock`                     | Refuse immediately, name the holder.                                                                              |
| SSH, registry, or registry auth unavailable at start | Abort before anything starts. Nothing changed.                                                                    |
| Image pull fails                                     | Abort. Blue still live.                                                                                           |
| Migration step fails                                 | Stop green, abort. Blue untouched and un-migrated.                                                                |
| Green fails `/health` within 60s                     | Stop green, dump its logs, exit non-zero. Blue never left.                                                        |
| `caddy reload` fails                                 | Green is up but unrouted. Stop green, leave blue live, exit non-zero.                                             |
| Drain times out at 300s                              | Proceed. Remaining sockets drop and resume via Layer-A. Logged, not fatal.                                        |
| Smoke fails after swap                               | Report loudly, exit non-zero, do **not** auto-rollback.                                                           |
| Deploy killed mid-run                                | Next run reconciles from observed Caddy config and container state; the phase marker names the window it died in. |

Smoke failure deliberately does not auto-rollback: an automatic rollback triggered by a flaky
smoke test is worse than a human looking at it.

`--dry-run` prints the full plan without executing and remains the default for anything
destructive until `--execute` is passed.

### 11. The existing stubs are rewritten, not adapted

`tools/tool-compose/src/templates/` publishes app ports to the host and uses `handle_path` for
`/api`, which strips the prefix before be-01 receives it — but be-01 mounts its controllers
under `/api` already, which is why the live template deliberately uses `handle`. Reusing these
stubs would produce 404s that look like routing bugs.

They are deleted and rewritten as part of this change. `tool-compose`'s renderer and its tests
are sound and stay.

## Risks / Trade-offs

**Two revision-1 claims were already falsified by review; more may be.** The build mechanism and
the WebSocket-reload behaviour were both asserted without verification and both were wrong. The
"Verified vs unverified claims" section above exists to keep that visible, and the spike in
Migration step 1 settles the largest remaining unknown before anything is built on it.

**Compose blue/green is hand-rolled.** Docker Compose has no native blue/green primitive, so the
colour logic is ours to write and ours to get wrong. Mitigated by the staging project.

**The Dagger engine is a privileged container.** `--privileged` on a long-lived container is a
real expansion of blast radius on a box also serving public traffic. Accepted because the engine
is not reachable off-host — the tunnel terminates at loopback — but it is the single most
security-relevant object in this design.

**More moving parts than systemd.** Justified by the scaffold rationale in Context, not by the
current use case, which the systemd path already serves adequately.

**Emulated builds on the Mac are slow.** Accepted, and avoidable via the tunnel.

## Phasing

**Phase 1 — this design.** WAL + busy_timeout prerequisite, Dagger builds via tunnelled engine,
registry with auth both directions, Compose with containerised Caddy, all three tiers as
containers, blue/green with `stream_close_delay` and the gw drain, the `be-01.internal` alias,
deploy lock and reconciliation, TLS, staging project, real WS smoke. Secrets stay in
`/srv/wbs/.env`.

**Phase 2 — additive.** Observability stack on `observability.infra.bulletpoints.club` behind basic
auth per D15, and SOPS + age replacing the hand-written `.env` per D18.

## Migration from the current deployment

1. **Spike the build mechanism.** Start a Dagger engine container on h2puni, tunnel to it, and
   publish one `linux/amd64` test image to the registry path. Roughly 30 minutes. Do not proceed
   until it works or the GitHub Actions fallback is chosen — the registry-as-contract design
   means that swap changes nothing downstream.
2. **Land the WAL + `busy_timeout` prerequisite**, with a startup assertion and a test. This is
   independently valuable and ships to the live systemd deployment immediately.
3. Build Phase 1 against the `wbs-staging` Compose project on h2puni, leaving the live systemd
   deployment untouched throughout.
4. Cut over: stop the systemd units, `docker compose up` production, verify smoke.
5. Delete `deploy/deploy.sh`, `deploy/systemd/`, `deploy/caddy/`; remove the host caddy and
   `/etc/sudoers.d/wbs-caddy-reload`; reduce `configure.sh` to installing docker, creating
   `/srv/wbs`, enabling linger, and provisioning registry credentials. Bun is no longer
   installed on the host — it exists only inside images.

The live deployment stays up and serving throughout steps 1 to 3.

## Open questions

None. The two decisions reopened by cross-review — the build mechanism and the be/gw coupling —
were resolved to the SSH tunnel and the `be-01.internal` alias respectively.
