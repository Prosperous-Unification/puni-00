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

### Requirement: Green main is deployed to dev automatically

The deploy trigger SHALL deploy to `dev` the newest commit on `main` whose `ci` workflow
run concluded successfully, and SHALL deploy any given commit at most once.

#### Scenario: a new green commit is deployed

- **WHEN** `main` advances to a commit whose `ci` run concluded `success` and dev's last
  recorded commit is an earlier one
- **THEN** the trigger builds and deploys that commit to dev and records it

#### Scenario: a red or in-flight commit is not deployed

- **WHEN** the newest commit on `main` has a `ci` run that concluded `failure`, or has no
  concluded run yet
- **THEN** no deploy runs and dev continues to serve the previously deployed commit

#### Scenario: an already-deployed commit is not redeployed

- **WHEN** the trigger runs twice with no new commit on `main` in between
- **THEN** the second run performs no build and no deploy

### Requirement: Dev applies migrations without prompting; prod does not

A deploy to `dev` carrying migrations absent from dev's deployed release SHALL proceed as
if `--with-migrations` were given, and the trigger MUST report the migration names it
applied. A deploy to `prod` SHALL continue to abort unless `--with-migrations` is passed
explicitly.

#### Scenario: dev deploys a new migration unattended

- **WHEN** a green main commit adds a migration dev has not deployed
- **THEN** the dev deploy proceeds and the trigger's report names the added migration

#### Scenario: prod still refuses

- **WHEN** a prod deploy carries a migration absent from prod's deployed release and
  `--with-migrations` is not passed
- **THEN** the deploy aborts before any tier is touched, with the existing error

### Requirement: One deploy at a time per build host

The trigger and a human-invoked deploy SHALL be mutually exclusive on the build host. A
trigger run that cannot take the lock MUST exit without building or deploying, and MUST
NOT wait.

#### Scenario: the trigger yields to a running deploy

- **WHEN** the trigger fires while a deploy already holds the build-host lock
- **THEN** the trigger exits zero without invoking publish or deploy, and retries on its
  next scheduled run

### Requirement: The trigger reports failures and stops

When a build, deploy or smoke step fails, the trigger SHALL notify the operator once,
naming the commit and the failing step, and MUST NOT attempt that commit again. It
resumes when a newer green commit appears.

#### Scenario: a failed commit is not retried

- **WHEN** a dev deploy of commit `A` fails and the trigger fires again with `A` still the
  newest green commit
- **THEN** no second attempt is made and no second notification is sent

#### Scenario: a newer commit is attempted after a failure

- **WHEN** commit `A` failed and a newer green commit `B` appears
- **THEN** the trigger attempts `B`

### Requirement: The trigger deploys from its own checkout

The trigger SHALL operate in a working tree it owns, and MUST NOT read, check out into, or
otherwise mutate a human's working copy of the repository.

#### Scenario: a dirty human worktree does not affect the trigger

- **WHEN** the operator's checkout has uncommitted changes and the trigger fires
- **THEN** the trigger deploys from its own clean checkout at the target commit and the
  operator's uncommitted changes remain untouched
