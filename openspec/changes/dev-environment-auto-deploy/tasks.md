## 1. Environment layout seam

- [ ] 1.1 Add `envLayout(env)` to `tools/tool-remote-scripts/src/lib/docker.ts` returning
      root, network, container prefix, shared env path, state dir and site file, and
      re-express `ROOT`, `NETWORK`, `containerName()` and `SHARED_ENV_PATH` through it —
      test: `docker.test.ts` asserts every `prod` value equals the literal it replaced
      (`/srv/wbs`, `wbs-net`, `be-01-blue`, `/srv/wbs/.env`, `/srv/wbs/caddy/site.caddy`)
      and every `dev` value is disjoint from it
- [ ] 1.2 Reject an unrecognised `WBS_ENV` in `envLayout` before any value is derived —
      test: `envLayout('staging')` throws naming the value; negative: with the guard
      removed the same call returns a layout rooted at `/srv/wbs-staging`, proving the
      check is what refuses it rather than a downstream failure
- [ ] 1.3 Read `WBS_ENV` in exactly one place and thread the layout through `swap.ts`'s
      `SITE_CADDY_PATH` and site render — test: a grep-style unit test asserts
      `process.env['WBS_ENV']` appears once in `tool-remote-scripts/src`

## 2. Orchestrator

- [ ] 2.1 Add `--env=<prod|dev>` to `tools/tool-deploy/src/affected.ts` argument parsing,
      defaulting to `prod` — test: `parseDeployArgs` accepts both, defaults correctly, and
      rejects a third value
- [ ] 2.2 Derive the state path in `remote-state.ts` from the environment instead of the
      hardcoded `/srv/wbs/state/$t.json` — test: the generated SSH command for `dev`
      addresses `/srv/wbs-dev/state/be.json`; negative: a dev read with dev state absent
      still reports absent rather than returning prod's state, proven by a fake SSH layer
      that would answer a prod path if one were requested
- [ ] 2.3 Pass `WBS_ENV` and `SITE_ADDRESS` across the SSH boundary in the swap command —
      test: `buildDeployPlan` for `dev` produces a remote command carrying both, and the
      `prod` command is byte-identical to the current expected string

## 3. Migration handling per environment

- [ ] 3.1 Treat `--env=dev` as implying `--with-migrations` and surface which migrations
      were applied in the plan output — test: a dev plan with a new migration proceeds and
      lists it; negative: the same plan with `--env=prod` and no flag still throws
      `assertMigrationFlag`'s existing error, proving the bypass is scoped to dev

## 4. Host provisioning

- [ ] 4.1 Extend `tools/tool-bootstrap` to create an environment root — directories,
      `.env` files with freshly generated dev secrets, and the environment's network —
      test: bootstrap against a scratch path creates the tree and refuses to overwrite an
      existing `.env`; negative: with the overwrite guard removed, a second run replaces
      the secrets file, proving the guard is what prevents it
- [ ] 4.2 Attach the edge Caddy to every environment network in `deploy/compose/base.yml`
      and import both site files — test: a rendered-config test asserts the Caddyfile
      imports both, and `swap.ts`'s existing "Caddyfile really imports site.caddy" guard
      (`swap.ts:654`) is extended to the environment's own file and still fails when the
      import is missing

## 5. Deploy trigger

- [ ] 5.1 Add a poll script under `tools/tool-deploy/src/trigger.ts` that resolves the
      newest `main` commit with a successful `ci` conclusion, compares it against a
      recorded last-attempted commit, and decides deploy or no-op — test: table-driven
      cases for green-and-new, green-and-seen, red, no-run-yet, and failed-previously
- [ ] 5.2 Take an exclusive build-host lock for the whole publish-plus-deploy run,
      non-blocking — test: a second invocation while the lock is held exits zero having
      run neither publish nor deploy; negative: with the lock removed both invocations
      reach the publish step, proving the lock is what serialises them
- [ ] 5.3 Record every attempted commit before deploying and never attempt a recorded
      commit twice — test: a failing deploy of commit `A` leaves `A` recorded, a second
      run with `A` still newest does nothing and notifies nothing, and a newer commit `B`
      is attempted
- [ ] 5.4 Notify the operator once per failure, naming the commit and failing step —
      test: a stubbed notifier receives exactly one message per failed run carrying both
- [ ] 5.5 Install the systemd user timer and its unit, running the trigger from its own
      worktree — test: a unit test asserts the generated unit's working directory is not
      the operator's checkout; verified live by `systemctl --user list-timers` after install

## 6. End to end

- [ ] 6.1 Point `tool-smoke` at the deployed environment's address and fail the trigger
      run when the smoke fails — test: smoke against an unreachable address exits
      non-zero and the trigger reports that step by name
- [ ] 6.2 Deploy dev by hand twice — `--dry-run`, then `--execute` — and record both in
      `verify.md` before the timer is enabled
