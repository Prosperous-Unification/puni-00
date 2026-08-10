## Context

The pipeline is single-tenant in four exported constants and one path. `lib/docker.ts`
holds `ROOT = '/srv/wbs'` (:14), `NETWORK = 'wbs-net'` (:12), `containerName()` (:32) and
`SHARED_ENV_PATH` (:134); `swap.ts:56` builds `SITE_CADDY_PATH` from `ROOT`; and
`remote-state.ts:34` embeds `/srv/wbs/state/$t.json` in the SSH command it sends. Two of
the values a second environment needs are already overridable — `SITE_ADDRESS`
(`swap.ts:55`) and `--host` (`deploy.ts`) — which is why this is parameterisation rather
than a rewrite. See [ADR 0001](../../../docs/adr/0001-dev-environment-shares-the-prod-host.md)
for why the environment shares the prod host.

## Goals / Non-Goals

**Goals:**

- A `dev` environment on h2puni that runs the same swap path as prod, at its own address.
- Green `main` reaching dev unattended, within minutes, at most once per commit.
- Prod's behaviour byte-identical when `WBS_ENV` is unset.

**Non-Goals:**

- Auto-deploying prod, rollback, per-PR environments, a second host.
- Seeding dev from prod data. Dev starts empty and stays disposable.
- Authenticating the dev site, or pruning the registry. Both are follow-up changes.

## Decisions

**Environment identity is one variable.** `WBS_ENV`, read on the remote by `swap.js` and
passed by `tool-deploy` as `--env`. Everything else derives from it through a single
`envLayout(env)` function in `lib/docker.ts` — root, network, container prefix, shared env
path, state dir, site file. One function is the whole seam; nothing else may read
`WBS_ENV`. Unset means `prod`, so no existing invocation changes. An unrecognised value
throws (R5).

**Dev gets its own network, not its own Caddy.** `BE_ALIAS = 'be-01.internal'`
(`lib/docker.ts:16`) is network-global and `gw-01.env` resolves be through it, so two
environments on `wbs-net` would let dev traffic reach prod's backend. Separate networks
are therefore not a preference. The edge stays single — one Caddy holding :80/:443,
attached to both networks, importing `site.caddy` and `site-dev.caddy`. Dev's site file
lives in prod's caddy directory because that directory is what the container mounts;
the alternative, a second mount, buys nothing and costs another edge restart.

**Nothing polls and nothing is pushed to.** The repo is public, so a self-hosted Actions
runner would hand fork PRs execution on h1claw, which holds the prod SSH key, registry
credentials and the GitHub token; a webhook would need an inbound endpoint on a host whose
firewall we cannot read. Both are avoided by having the operator who pushes also trigger
the deploy. Superseded 2026-08-04: this section previously specified a systemd user timer
polling `gh` for the newest green `main`, which source-run dev made unnecessary.

**The trigger owns a checkout.** `deploy.ts` refuses a dirty worktree — correctly, since
an untracked file can end up in a bundle — and the operator's tree is often dirty. The
trigger uses a separate worktree it fully controls.

**Dev applies migrations unattended.** The gate exists because blue and green share one
SQLite file while traffic is being served. Dev serves no traffic worth protecting, and
halting dev on schema changes would make it stale exactly when it is most useful. Dev
therefore proceeds and reports; prod's gate is untouched.

## Risks / Trade-offs

- **Shared host.** A dev deploy that fills the disk or wedges dockerd takes prod with it.
  Accepted in ADR 0001; disk is 132 GB free today and dev adds three small containers.
- **One-time prod downtime.** Attaching Caddy to a second network recreates the edge
  container: seconds, once, at a chosen moment. There is no zero-downtime path — the
  network set of a running container cannot be extended without recreating it.
- **Registry growth.** Publishing on every green `main` rather than every prod deploy
  multiplies image churn. Retention is out of scope here and needs a follow-up.
- **Unauthenticated dev site.** Merged-but-unreleased work becomes publicly reachable. The
  repo is already public, so this leaks timing rather than code, but it is a real change
  in exposure.
- **A parameterisation bug reaches prod.** Mitigated by the negative test in slice 1: with
  `WBS_ENV` unset, every derived value must equal the literal it replaced.

## Migration Plan

1. Land the parameterisation with prod defaults; prod deploys continue unchanged.
2. Provision `/srv/wbs-dev` and its secrets on h2puni; create `wbs-dev-net`.
3. Add the dev DNS record.
4. Recreate the edge attached to both networks — the one downtime window.
5. First dev deploy by hand, `--dry-run` then `--execute`.
6. Deploy dev by hand twice before relying on `bin/dev-deploy.sh`. There is no timer to enable.

## Open Questions

- Should the dev site be behind basic auth, or carry `X-Robots-Tag: noindex` and nothing
  more? Deferred; dev ships public in this change.
- Notification channel for trigger failures: the OpenClaw gateway on h1claw is the
  obvious carrier, but the exact command is unverified and is settled in slice 5.
