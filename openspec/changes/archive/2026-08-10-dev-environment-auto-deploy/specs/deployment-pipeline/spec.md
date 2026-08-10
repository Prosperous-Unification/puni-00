## ADDED Requirements

### Requirement: Environment-scoped remote layout

The remote swap executor and the deploy orchestrator SHALL derive the environment root,
Docker network, container names, shared env path, tier state path and rendered site path
from `WBS_ENV`. When `WBS_ENV` is unset the derived values MUST equal the `prod` values
in use today, so that an existing prod deploy is unchanged.

#### Scenario: prod is the default

- **WHEN** `WBS_ENV` is unset
- **THEN** the environment root is `/srv/wbs`, the network is `wbs-net`, the be container
  for blue is `be-01-blue`, the shared env file is `/srv/wbs/.env`, and the site file is
  `/srv/wbs/caddy/site.caddy`

#### Scenario: dev derives a disjoint layout

- **WHEN** `WBS_ENV=dev`
- **THEN** the environment root is `/srv/wbs-dev`, the network is `wbs-dev-net`, the be
  container for blue is `dev-be-01-blue`, the shared env file is `/srv/wbs-dev/.env`, and
  the site file is `/srv/wbs/caddy/site-dev.caddy`

#### Scenario: an unknown environment is refused

- **WHEN** `WBS_ENV` is set to a value other than `prod` or `dev`
- **THEN** the process exits non-zero naming the unknown environment, and no Docker or
  filesystem command runs

### Requirement: Environment state is read from the environment's own root

The orchestrator's remote state read SHALL address `<environment root>/state/<tier>.json`
for the environment being deployed. It MUST NOT read another environment's state under
any circumstance, including when the requested environment's state is missing.

#### Scenario: dev state absent does not fall back to prod

- **WHEN** a dev deploy is planned and `/srv/wbs-dev/state/be.json` does not exist
- **THEN** the read reports dev's be state as absent, and `/srv/wbs/state/be.json` is
  never read

### Requirement: Each environment owns its container network

Every environment SHALL have its own Docker network, and the internal aliases a tier
publishes (`be-01.internal` among them) MUST be scoped to that network.

#### Scenario: aliases do not collide across environments

- **WHEN** both environments are running with their tiers up
- **THEN** `be-01.internal` resolves inside `wbs-net` only to the prod be container and
  inside `wbs-dev-net` only to the dev be container

### Requirement: The shared edge serves every environment

The edge Caddy container SHALL be attached to every environment's network and SHALL
import each environment's rendered site file. Each environment's site address SHALL come
from `SITE_ADDRESS` for that environment.

#### Scenario: dev is reachable at its own address

- **WHEN** a dev deploy completes with `SITE_ADDRESS=dev.wbs.bulletpoints.club`
- **THEN** a request to that address is served by the dev fe container, and a request to
  `wbs.bulletpoints.club` is served by the prod fe container

#### Scenario: a broken dev site file cannot take prod down

- **WHEN** the rendered dev site file is invalid and Caddy's config validation fails
- **THEN** the dev swap aborts before reloading Caddy, and the running prod site continues
  to be served by the previously loaded configuration

### Requirement: A pushed commit is deployed to dev on request

The dev deploy SHALL deploy the requested commit to `dev` from source, SHALL refuse a
commit that is not present on a remote branch, and SHALL report failure when any dev tier
does not answer after the deploy.

Superseded 2026-08-04: an earlier version of this requirement had a timer poll `ci` for the
newest green `main` commit and deploy it unattended. Dev now runs from source rather than
from images, so a deploy is a checkout move that costs seconds, and the operator who pushes
is the operator who triggers it. Nothing polls, and no timer exists to fail silently. CI
still runs and still reports; it is not in the path.

#### Scenario: a pushed commit is deployed

- **WHEN** `bin/dev-deploy.sh` runs on a clean tree whose HEAD exists on a remote branch
- **THEN** dev's checkout is reset to that commit, and the deploy reports the SHA now served

#### Scenario: an unpushed commit is refused

- **WHEN** HEAD is on no remote branch, or the working tree is dirty
- **THEN** the deploy refuses before contacting h2puni, because dev pulls from GitHub and
  cannot see local-only work

#### Scenario: a tier that does not answer fails the deploy

- **WHEN** any of the three tiers returns a 5xx after the checkout has moved
- **THEN** the deploy exits non-zero and names the container to inspect, rather than
  reporting the SHA as deployed

### Requirement: Dev applies migrations without prompting; prod does not

Dev SHALL apply pending migrations without an operator flag. A deploy to `prod` SHALL
continue to abort unless `--with-migrations` is passed explicitly.

Dev satisfies this by running one be-01 process with `MIGRATE_ON_STARTUP=true`, the same
opt-in `apps/be-01/.env.example` sets for local dev. Design decision 8 forbids migrating on
boot in a _deployed_ container because blue and green share one SQLite file across a swap
overlap; source-run dev has no second colour, so the ordering that decision protects does
not exist there.

Because a migration is imported by no watched module, `bun --watch` cannot see one arrive.
The dev deploy SHALL therefore treat a change under the migration directory as requiring a
restart.

#### Scenario: dev applies a new migration

- **WHEN** a deployed commit adds a migration dev has not applied
- **THEN** the dev deploy restarts be-01 and be-01 applies the migration at boot

#### Scenario: prod still refuses

- **WHEN** a prod deploy carries a migration absent from prod's deployed release and
  `--with-migrations` is not passed
- **THEN** the deploy aborts before any tier is touched, with the existing error

### Requirement: One dev deploy at a time

Concurrent dev deploys SHALL be mutually exclusive. A run that cannot take the lock MUST
exit non-zero without touching the checkout, and MUST NOT wait.

#### Scenario: a second deploy yields

- **WHEN** a dev deploy starts while another holds the lock
- **THEN** it exits without fetching, resetting, installing or restarting

### Requirement: Dev deploys from a checkout it owns

The dev deploy SHALL operate in a working tree it owns, and MUST NOT read, check out into,
or otherwise mutate a human's working copy of the repository.

#### Scenario: a dirty human worktree does not affect dev

- **WHEN** the operator's checkout has uncommitted changes and a dev deploy runs
- **THEN** dev resets its own checkout at the target commit and the operator's uncommitted
  changes remain untouched
