## ADDED Requirements

### Requirement: Environments have explicit identity, assignment and lifecycle

Twilight MUST model branch dev, dev-main, staging and production as distinct
environments. Every environment MUST expose its stable identity, owner, lifecycle,
desired source or artifact, observed source or artifact, URL, health, freshness,
capacity state and linked evidence. Environment lifecycle effects MUST pass normal
authority, capacity, fencing and reconciliation boundaries.

#### Scenario: Two long-running branches need development environments

- **GIVEN** two active feature branches have runnable work and admitted capacity
- **WHEN** each requests a branch dev
- **THEN** Twilight creates or binds distinct environment identities and routes each URL and observed revision to its assigned branch

#### Scenario: Branch-dev capacity is exhausted

- **GIVEN** every admitted environment slot is held
- **WHEN** another branch requests a dev environment
- **THEN** the request queues with the limiting capacity reason and no existing branch dev is reassigned or destroyed

#### Scenario: A branch dev sleeps and resumes

- **GIVEN** an operator explicitly sleeps a branch dev
- **WHEN** it is later resumed
- **THEN** its stable environment/branch identity is preserved and its newly observed revision and health are verified before it is shown as running

#### Scenario: Desired and observed revisions differ

- **GIVEN** a deployment requests a newer revision than the environment serves
- **WHEN** Dany inspects the environment
- **THEN** both identities and the deployment state are visible and no passing report for the desired revision is attributed to the observed one

### Requirement: Development publication makes committed work observable

Runnable increments MUST be committed frequently and offered to their assigned
branch dev after required pre-deploy checks. Dev-main MUST continuously converge
on accepted main. A failed, stale or unavailable deployment MUST remain visible;
the existence of a commit or successful command exit MUST NOT establish the served
revision.

#### Scenario: A runnable feature increment is committed

- **GIVEN** a feature branch has a new committed runnable increment and its pre-deploy checks pass
- **WHEN** the branch-dev deployment is admitted
- **THEN** the environment attempts to converge on that commit and records its independently observed served revision and health

#### Scenario: A commit is not runnable

- **GIVEN** a frequent checkpoint commit cannot safely run in the branch dev
- **WHEN** publication is considered
- **THEN** the commit remains visible with the blocking reason and the environment continues to identify the older observed revision

#### Scenario: Main publication completes

- **GIVEN** the exact staging-accepted candidate is published to main
- **WHEN** dev-main observes the new main revision
- **THEN** it deploys or records a visible convergence failure and verifies the served identity rather than treating branch movement as deployment

### Requirement: Staging accepts the exact current-main composition before publication

Integration MUST compose the feature source with the current accepted main,
produce an immutable artifact and record both identities. Staging MUST deploy that
artifact through the production deployment, migration, recovery, routing,
authentication and health-check shape before main publication. Staging MUST use
isolated credentials and data; differences in endpoint and admitted scale MUST be
listed with their risk. Final acceptance MUST bind automated and manual
cloud-browser reports to the exact candidate, artifact, environment and scenario
revision.

#### Scenario: The composed candidate passes staging

- **GIVEN** a feature source is composed with current main and its immutable artifact is deployed to healthy staging
- **WHEN** every required automated check and manual cloud-browser scenario passes against the observed artifact
- **THEN** acceptance records candidate-bound reports and authorizes publication of only that composition

#### Scenario: Main moves before publication

- **GIVEN** staging accepted a candidate and accepted main changes before publication
- **WHEN** publication compares its base
- **THEN** it refuses the stale candidate and requires recomposition, a new artifact, staging deployment and fresh acceptance reports

#### Scenario: Staging differs from production

- **GIVEN** staging cannot match a production property other than endpoint, credentials, admitted scale or isolated test data
- **WHEN** the candidate requests staging acceptance
- **THEN** acceptance blocks until the difference, risk and compensating production check are explicitly accepted under policy

#### Scenario: Manual cloud-browser testing is unavailable

- **GIVEN** automated checks pass but the required cloud browser or human execution is unavailable
- **WHEN** staging acceptance is evaluated
- **THEN** the candidate remains unaccepted with an unavailable manual-test report and cannot publish to main

#### Scenario: A staging report names another artifact

- **GIVEN** a passing report was produced for an older candidate, artifact or served revision
- **WHEN** it is offered for the current candidate
- **THEN** acceptance refuses it as stale and preserves both records

### Requirement: Publication and production promote the accepted artifact

Main publication MUST compare and publish the exact staging-accepted source
candidate. Production MUST require a separate explicit human command bound to that
candidate, the same immutable artifact tested in staging, the target environment,
migration plan, health checks and recovery procedure. Environment-specific
configuration MUST NOT alter the artifact. Success MUST require observed production
health and served artifact identity.

#### Scenario: Accepted candidate is published and released

- **GIVEN** staging acceptance is current and main still matches the candidate base
- **WHEN** publication succeeds and an authorized human later issues the exact production command
- **THEN** main receives that source, dev-main converges, and production promotes the staging-tested artifact with observed health and identity evidence

#### Scenario: Production command names another artifact

- **GIVEN** a candidate passed staging
- **WHEN** a production command names a rebuilt or different artifact
- **THEN** release is refused until that artifact passes the complete staging path as a new candidate

#### Scenario: Production health or migration fails

- **GIVEN** the explicit production command has started promotion
- **WHEN** migration, routing or health verification fails
- **THEN** the modeled recovery path runs, its observed outcome remains visible, and the system does not report a successful release

#### Scenario: Production state is unknown

- **GIVEN** the deployment transport exits without proving the served artifact or recovery state
- **WHEN** release reconciliation cannot establish the outcome
- **THEN** production remains unknown, the relevant resources stay held, and retry cannot create a second effect

### Requirement: Test layers and reports cover specified behavior

Every observable behavior MUST have exhaustive Given/When/Then scenarios before
implementation. Test planning MUST place most coverage in stateless unit tests,
then API tests against a real database, then Playwright browser tests, with manual
scenarios executed through the real cloud browser last. Each report MUST identify
the scenarios, source, artifact where applicable, environment, tool and outcome.
Failed, skipped, unavailable and stale results MUST remain explicit.

Scenario validation MUST require an explicit, non-vacuous Given, When and Then in
every scenario. Each requirement MUST record applicable normal, failure, boundary
and recovery behaviors or an explicit inapplicable disposition. Structural
validation MUST NOT claim semantic exhaustiveness; specification review owns the
coverage judgment and its unresolved findings block planning approval.

#### Scenario: A scenario omits one clause

- **GIVEN** an OpenSpec scenario omits Given, When or Then, or uses a clause that only restates its heading
- **WHEN** specification validation runs
- **THEN** it refuses the scenario before implementation planning and names the missing or vacuous clause

#### Scenario: Structural clauses exist but failure coverage is absent

- **GIVEN** every scenario parses but a requirement's applicable failure, boundary or recovery behavior has no scenario or disposition
- **WHEN** independent specification review evaluates its coverage ledger
- **THEN** the finding blocks planning approval until the behavior or explicit inapplicability is resolved

#### Scenario: A behavior can be proved below the browser

- **GIVEN** a scenario's decision logic can be exercised without UI or persistence
- **WHEN** its test slice is planned
- **THEN** the primary cases are assigned to stateless unit tests and higher layers retain only boundary and integration proofs

#### Scenario: Persistence behavior is tested

- **GIVEN** a scenario crosses an API persistence boundary
- **WHEN** its automated tests run
- **THEN** the API test uses a real isolated database and proves the response and persisted state

#### Scenario: Browser behavior depends on a real browser

- **GIVEN** a scenario depends on focus, default actions, layout, routing or rendered integration
- **WHEN** automated coverage is selected
- **THEN** Playwright exercises that production call path and lower-layer tests do not substitute for it

#### Scenario: Required coverage is missing

- **GIVEN** a specified scenario has no applicable layered test or manual disposition
- **WHEN** candidate acceptance evaluates coverage
- **THEN** it blocks with the uncovered scenario and does not infer coverage from unrelated passing totals

### Requirement: Scheduled development sweeps are source-bound observations

Twilight MUST schedule a nightly manual cloud-browser sweep for dev-main and every
active branch dev in the personal phase. It MAY coalesce an unchanged environment
instead of rerunning, but MUST record that disposition against the earlier matching
report. A staging candidate MUST always receive its own immediate full manual pass.

#### Scenario: Nightly sweep finds active development environments

- **GIVEN** dev-main and active branch devs serve identified revisions at the scheduled time
- **WHEN** the sweep trigger runs
- **THEN** each changed environment receives a cloud-browser assignment and report bound to its observed revision

#### Scenario: An environment has not changed

- **GIVEN** an active dev environment still serves the exact source, configuration and scenario revision of its latest passing sweep
- **WHEN** the nightly trigger runs
- **THEN** it records a coalesced disposition linked to that report rather than claiming a newly executed pass

#### Scenario: A dev environment is unhealthy or stale

- **GIVEN** an active environment is unavailable or serves a revision other than its desired revision
- **WHEN** its scheduled sweep begins
- **THEN** the report records the observed failure or staleness and does not test or pass the desired revision by assumption
