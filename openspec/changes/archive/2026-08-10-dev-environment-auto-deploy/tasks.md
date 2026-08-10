> **Reconciled against `main` 2026-08-10 (Lane B of
> `docs/plans/2026-08-10-ux-batch-and-roadmap.md`).** The change was revised on
> 2026-08-04 (recorded in `proposal.md` "Revised 2026-08-04" and `design.md`
> "Superseded 2026-08-04"): the poller, build-host lock, attempt record,
> notifier and systemd timer were all dropped when dev became **source-run** —
> the operator who pushes triggers the deploy (`bin/dev-deploy.sh`, watchers in
> `tools/tool-devsync`). This task list predates that revision. `[x]` below
> means _closed_: either the note names the shipped artifact, or the item is
> struck as superseded. Verification is code inspection plus the named test
> files existing on `main` — no test runs or fault injections were performed
> for this reconciliation.

## 1. Environment layout seam

- [x] 1.1 Shipped, relocated: `envLayout(env)` lives in
      `tools/tool-remote-scripts/src/lib/env.ts` (path-mapped as `@wbs/tool-env`),
      not `docker.ts`, and roots live under `/home/puni1`, not `/srv`
      (`/srv` is root-owned; see the comment above `LAYOUTS` and ADR 0002).
      Tests: `docker.test.ts` "gives prod the values that were hardcoded before
      WBS_ENV existed" and "gives dev a layout disjoint from prod, except the
      mounted caddy dir".
- [x] 1.2 Shipped: `envLayout` throws naming the unknown value and the known
      environments (`env.ts`). Tests: `docker.test.ts` "refuses an environment
      it does not know" / "refuses an unknown environment by name, not by
      falling back to prod". The negative as drafted (guard removed → a
      `/srv/wbs-staging` layout) no longer applies: layouts are a closed
      `Record`, so an unknown name has nothing to derive from.
- [x] 1.3 Shipped: `CURRENT_ENV` in `env.ts` is the one read of `WBS_ENV`, and
      `env-seam.test.ts` ("WBS_ENV is read in exactly one place … is read only
      by lib/env.ts") is exactly the grep-style test this task asked for.
      `swap.ts` takes `SITE_CADDY_PATH` and the default `SITE_ADDRESS` from
      `CURRENT_ENV`.

## 2. Orchestrator

- [x] 2.1 Shipped: `tools/tool-deploy/src/affected.ts` parses `--env` through
      `envLayout`, so an unknown value is refused before a plan exists. Tests:
      `deploy.test.ts` "defaults to prod", "parses --env=dev into dev's
      layout", "refuses an environment nobody provisioned".
- [x] 2.2 Shipped: `readRemoteState(host, stateDir)` requires the state
      directory (`remote-state.ts` — its JSDoc names the read-prod's-state
      hazard a default would cause). Test: `deploy.test.ts` "reads the state
      directory of the environment being deployed, never another" (asserts
      `/home/puni1/wbs-dev/state` was the only path asked, and that absent dev
      state reads as "(never deployed)").
- [x] 2.3 Shipped: `deploy.test.ts` "sends dev its own root and WBS_ENV"
      (`cd /home/puni1/wbs-dev && WBS_ENV=dev bun bin/swap.js …`), "sends prod
      the exact command it sent before environments existed" (no `WBS_ENV`
      emitted for prod — `deploy.ts`), and the smoke command carries
      `-e SITE_ADDRESS=dev.wbs.bulletpoints.club`.

## 3. Migration handling per environment

- [x] 3.1 Shipped: `deploy.ts` (`migrationsAcknowledged = args.withMigrations
|| args.layout.env === 'dev'`) and the plan output names what acknowledged
      them. Tests: `deploy.test.ts` "lets dev deploy a new migration
      unattended, and says so" and "still refuses prod without an explicit
      acknowledgement".

## 4. Host provisioning

- [x] 4.1 ~~Extend `tools/tool-bootstrap` to create an environment root…~~ —
      struck, **absent artifact**: `bootstrap.sh`/`configure.sh` contain no
      `WBS_ENV`/dev handling (grep, 2026-08-10). Dev's root, `.env` files and
      `wbs-dev-net` were provisioned by hand on h2puni, and today's dev runs
      from `deploy/dev-src` compose (source-run revision), so the bootstrap
      extension was never wanted after 2026-08-04.
- [x] 4.2 Partially shipped: `deploy/compose/base.yml` attaches the one edge
      Caddy to both networks (`networks: [wbs-net, wbs-dev-net]`, with the
      recreate-downtime warning beside it), and `swap.ts`'s import guard
      follows the environment because `SITE_CADDY_PATH` comes from
      `CURRENT_ENV`. **Absent artifact:** the rendered-config test asserting
      the Caddyfile imports both site files was never written —
      `Caddyfile.bootstrap` imports only `site.caddy`, and the live
      Caddyfile's `site-dev.caddy` import was a hand provision on h2puni
      (its basic-auth gate was later removed; `docs/runbook-dev-deploy.md`).

## 5. Deploy trigger

- [x] 5.1 ~~Poll script `tools/tool-deploy/src/trigger.ts`~~ — struck: the file
      does not exist and the poller was removed from the design on 2026-08-04.
      The trigger is the operator: `git push && ./bin/dev-deploy.sh`.
- [x] 5.2 ~~Exclusive build-host lock for publish-plus-deploy~~ — struck with
      the trigger: nothing unattended runs, so there is nothing to serialise.
      (`bin/dev-deploy.sh` does refuse a dirty tree or an unpushed SHA.)
- [x] 5.3 ~~Record every attempted commit~~ — struck with the trigger: dev
      tracks whatever was pushed; there is no attempt ledger.
- [x] 5.4 ~~Notify the operator once per failure~~ — struck with the trigger:
      the operator runs the deploy in a terminal and sees it fail. The
      devsync path fails loudly and names the fix for changes a restart
      cannot carry (`tools/tool-devsync/src/sync.ts`, `RECREATE_PATHS`).
- [x] 5.5 ~~Install the systemd user timer~~ — struck: "No systemd timer:
      nothing runs between deploys" (`proposal.md` Impact;
      `bin/dev-deploy.sh`'s own comment says the same).

## 6. End to end

- [x] 6.1 Half shipped, half struck: the swap's smoke is environment-scoped
      (`deploy.test.ts` "smokes dev over dev's own network, root and
      address"), but ~~fail the trigger run when the smoke fails~~ is struck
      with the trigger — and today's source-run dev never executes the swap or
      its smoke at all (`docs/runbook-dev-deploy.md`, "What dev no longer
      proves").
- [x] 6.2 ~~Deploy dev by hand twice — `--dry-run`, then `--execute` — and
      record both in `verify.md` before the timer is enabled~~ — struck,
      **absent artifact**: this change has no `verify.md` and the image-based
      dev it would have rehearsed was retired on 2026-08-04. The shipped path
      was verified live on 2026-08-04 — a pushed change appeared on dev with
      the container's `StartedAt` unchanged (`docs/runbook-dev-deploy.md`).
      There is no timer to enable.
