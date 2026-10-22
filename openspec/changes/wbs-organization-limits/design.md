## Context

What exists, read on 2026-10-22 on `main` at `d504c9eae`:

| Need                                | Exists today                                                                                                                                                                                                           | Missing                                                 |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| A tenant                            | `organization`, `organization_membership (role IN super_admin, admin, member, viewer)`; every root (`person`, `resource`, `project`, `service_team`) owned through a `<root>_organization` side table                  | a number per tenant: **Organization limits**            |
| A per-organization setting          | `organization_session_policy`: one row keyed by organization, a missing row is "no policy", super-admin writes with one audit row in one transaction, `GET`/`PUT /api/organization/session-policy`                     | a row whose absence means "the deployment default"      |
| An agent identity                   | `person.kind IN ('person', 'agent')`; made by `patchPerson { kind }`, by the directory add with a kind, by the plan import (`person.kind`)                                                                             | a count of agents per organization and a cap on it      |
| An agent at work                    | `claim (work_item_id, step_id, person_id, run_id, parent_claim_id)`; `claimWorkItem` refuses `person_not_bound`, `already_claimed`, `inside_subtree_claim`, `resources_exhausted`… in one journal entry                | a cap on how many claims one organization holds at once |
| Declared machine capacity           | `resource` per organization; `project_resource_capacity (project_id, resource_id, units ≥ 0)` set by `setResourceCapacity` and by the import; occupancy never exceeds it per project                                   | a cap on the units one organization's plans may state   |
| A refusal that names what it saw    | `resources_exhausted { resourceId, asked, free, holders }`, `already_claimed { holders }`, `in_use { counts }`                                                                                                         | `agent_person_limit`, `claim_limit`, `capacity_limit`   |
| Race safety under concurrent claims | one `bun:sqlite` connection; `WriteCoordinator` hands out one turn at a time; a batch is one `BEGIN IMMEDIATE … COMMIT/ROLLBACK` inside its turn (`sqlite-unit-of-work.ts`); `claim-race.db.test.ts` proves one winner | nothing: a count read inside that transaction is exact  |
| An audited administrative act       | `organization_audit`, vocabulary held by CHECKs, widened once by compatible rebuild (`20261012090200`); issue #632 proposes trigger-held vocabulary                                                                    | one action and one subject kind                         |
| An operator act on an organization  | `organization-activation-cli.ts`, `organization-ownership-preflight-cli.ts` in be-01, run in the container against `DB_PATH`                                                                                           | `organization-limits-cli.ts`                            |
| An admin page per organization      | `organization-page.tsx` composes one panel per concern; `session-policy-panel.tsx` renders loading, failure and ready over one shape pair                                                                              | a limits panel; refusal copy on three actions           |

Three facts shape the design. First, a cap is an organization fact and the store already
reaches the organization of every root through the ownership side tables, so each usage is
one join, no new column on `person`, `claim` or `project_resource_capacity`. Second, the
claim path is the one place where two requests race for the same number, and it is already
serialized: the count and the write sit in one immediate transaction, exactly where
`already_claimed` and `resources_exhausted` are decided. Third, the session policy is the
precedent for "one row per organization, read on the hot path, written by few with an audit
row"; limits copy its shape and differ in one thing: a missing row is not "none" but "the
deployment default", because a tenant must always have a number.

## Goals / Non-Goals

**Goals:** every organization has a cap on agent persons, concurrent claims and stated
capacity units per resource; the write that would cross a cap is refused, typed, naming the
cap and the count, inside its transaction; an admin reads caps with usage and sees them on
the organization page; a refused action shows the numbers; an operator sets caps with an
audit trail; a lowered cap strands nothing and refuses only new acquisitions.

**Non-Goals:** billing, plans, tenant self-service; caps on projects, spaces, members,
resources, teams, team slots, machine credentials (L4), per-person claims (L3); HTTP rate
limits; request and plan-size `Quota`; runtime metering (Dash); reclaiming over-cap usage;
a cap readout in the startable read (L15).

## Decisions

A1 (tenant = WBS organization, one deployment, row-level scoping) and the owner's gap-2
decision (caps on agent persons, concurrent claims and declared capacity, enforced at claim
and declaration time with typed refusals, billing plans attach later) are fixed, 2026-10-21.
L1 to L16 are **assumed** by this draft; each is overrulable by id without moving another
unless noted.

**L1. Three caps, no more, in v1.** `maxAgentPersons`, `maxConcurrentClaims`,
`maxCapacityUnitsPerResource`. They bound the three things a swarm grows: identities, work
in flight, and the machine units it may ever hold (occupancy never exceeds stated capacity
per project, so bounding stated capacity bounds occupancy). Projects, spaces and members are
human-paced and get their caps with billing; resources without a capacity constrain nothing
and hold nothing, so `createResource` is not capped (a resource count joins the later set).
Why not one generic `limit (organization, key, value)` table: three typed columns give the
read, the CLI and the UI a closed shape and the CHECKs a home; a key-value table is the plans
table in disguise and arrives with billing.

**L2. What `maxCapacityUnitsPerResource` bounds.** For each resource of the organization,
the sum of stated `project_resource_capacity.units` over the organization's projects SHALL
not exceed the cap. Units of one resource are commensurable; units across resources (GB
against worktrees) are not, so a single organization-wide sum would be meaningless and a cap
per resource row would be a plan knob nobody asked for. One number, applied per resource.
Team capacities (`setCapacity`, people slots) are not resource capacities and are not
counted.

**L3. No per-person claim cap in v1.** The organization cap already bounds every person's
claims; how many steps one agent run works at once is harness configuration; and a per-person
cap would have to decide whether a superagent's subtree claim and its workers' delegated
claims count against the superagent, which is a rules knot not worth the first slice. If
overruled: a delegated claim counts against its own person (the worker), never the parent
claim's holder, and the column is `max_concurrent_claims_per_person` with the same shape.

**L4. No machine-credential cap in v1.** `wbs-machine-credentials` is unmerged
(`plan/wbs-machine-credentials`); its slice 2 added no cap. When it lands, a follow-up adds
`max_machine_credentials_per_agent` to the same row, checked in the credential create and
read beside the others. Nothing here depends on that branch.

**L5. What counts.** _Agent persons_: `person` rows of kind `agent` owned by the
organization (`person_organization`). _Concurrent claims_: **bound claims**, each a
distinct `(work_item_id, person_id, run_id)` with at least one `claim` row, over the
organization's projects (`project_organization`); a whole-leaf claim writing four step rows
is one, two agents on two steps of one leaf are two, a subtree claim is one, a delegated
claim is one of its own, a human's claim counts like an agent's. Why not rows: the cap reads
as "agents at work", and a leaf's step count would otherwise set the price. _Capacity_: per
resource, the sum of stated units over the organization's projects (L2); an unstated pair
is 0.

**L6. One row, three NOT NULL integer columns, a missing row is the deployment default.**
`organization_limits (organization_id PK → organization, max_agent_persons, max_concurrent_claims, max_capacity_units_per_resource, audit columns)`,
each column `CHECK (typeof = 'integer' AND BETWEEN 0 AND 1000000)`. A row holds every cap
explicitly, so a read never mixes a row with a default. There is no "unlimited" value: a
tenant always has a number (the UI always shows "n of m"); an operator who wants no
practical bound sets 1,000,000. Why not nullable columns meaning "default": a later default
change would silently move a tenant that an operator thought pinned.

**L7. Default limits come from three required environment variables, not a table.**
`ORGANIZATION_DEFAULT_MAX_AGENT_PERSONS`, `ORGANIZATION_DEFAULT_MAX_CONCURRENT_CLAIMS`,
`ORGANIZATION_DEFAULT_MAX_CAPACITY_UNITS_PER_RESOURCE`, parsed by `BeConfig` as
`string.integer.parse` within the same 0 to 1,000,000 bound, required with no default (R5:
a deployment without them does not boot, as `BROWSER_SESSION_AUTHORITY` does not). One
default plan is one deployment decision; a plans table is billing's. Compose, the Kubernetes
manifests and `.env.example` gain the three variables in slice 1; the dev values are the
proposal's starting numbers (agents 50, claims 200, capacity units 10,000), to be set by the
operator, not read from code.

**L8. The read.** `GET /api/organization/limits`, policy `organization-resource read`,
signed-in, answers for an `admin` or `super_admin` of the active organization
`{ source: 'default' | 'organization', limits: { maxAgentPersons, maxConcurrentClaims, maxCapacityUnitsPerResource }, usage: { agentPersons, concurrentClaims, capacityUnits: [{ resourceId, name, unitLabel, units }] } }`,
`capacityUnits` listing every resource of the organization with at least one stated
capacity, in resource-id order. A `member` or `viewer` is `403 forbidden`; a delegation or a
machine principal (A23 of `wbs-machine-credentials`: a member) is `403 insufficient_scope`;
before activation `403 no_active_organization`. Limits and usage are read in one
transaction so the numbers agree with each other. It is an MCP tool by derivation (the
tool count moves by one), like `getApiOrganizationSession-policy`.

**L9. Three refusals, each naming cap and count.**

- `agent_person_limit { cap, current }` on every write that makes one more agent person of
  the organization: `patchPerson { kind: 'agent' }` on a person of kind `person`, the
  directory add with kind `agent`, and the plan import for each agent it would create.
  Checked where `current + added > cap`; a change `agent → person` never refuses; renaming
  or re-teaming an agent never refuses. The import is all-or-none, so one agent over the
  cap refuses the whole import naming `added` beside `current`.
- `claim_limit { cap, current }` on `claimWorkItem` when the batch would add a bound claim
  the organization does not yet hold (a new `(work item, person, run)` triple). Checked
  **last** in the claim's refusal order, after `overlaps_subtree_claim`, so an agent hears
  the plan's reasons before the tenant's; `alreadyHeld` writes nothing and is never refused;
  a release never refuses; a redo of a claim and an undo of a release re-check and answer
  `stale_undo` whose detail begins `claim_limit:`, as occupancy does; claims moving on a
  split or a promotion keep their triple and are not re-checked. Two claims in one batch
  count each other: the second sees `current` including the first.
- `capacity_limit { resourceId, cap, declared, asked }` on `setResourceCapacity { units }`
  with non-null `units` when `declared + units > cap`, `declared` being the sum over the
  organization's **other** projects; clearing (`null`) or lowering never refuses; the plan
  import checks every capacity it would write the same way, against every existing
  project of the organization (every import mints a new project, which states nothing, so
  re-importing an export counts its still-stating source). `createResource` is not
  capped (L1).

All three are command refusals at the command's position in the batch, status 409 like
`already_claimed`, and all-or-none within the batch's transaction. Under legacy access (no
activated organization) no cap exists and nothing refuses: a limit is an organization's
fact and there is no organization to own it; this is the modeled optional case, as a missing
session policy is, and `verify.md` names the test that watches an activated store refuse
where the legacy store admits.

**L10. Where the decision lives and why it is race-safe.** `@wbs/domain` gets
`refuseLimit({ cap, current, added })`, pure, with its own negative; `@wbs/core` reads
`current` through a store port `OrganizationLimits` (`effectiveLimitsOf(organizationId)`,
`usageOf(organizationId)`, `countBoundClaims`, `countAgentPersons`,
`sumStatedCapacity(resourceId, exceptProjectId)`) **inside the transaction that writes**:
for claims the batch's `BEGIN IMMEDIATE` under the `WriteCoordinator`'s turn, where the
claim rows are read and written today, so two racing claims are serialized and the loser
counts the winner (`claim-race.db.test.ts` is the precedent and slice 3 adds the limit
case); for the directory and capacity writes the store's own immediate transaction under
the same gate. Nothing reads a count outside a turn and compares it later.

**L11. Lowering below usage strands nothing.** Setting a cap below the current count is
accepted; what is held stays held; the read answers `current > cap` plainly and the panel
shows the row as exceeded; the next acquisition of that kind is refused with those numbers;
releases, unbinding and lowering bring the count back under. The CLI prints usage beside
every cap it sets and warns on the console when a cap lands below usage, and never refuses
for it: an operator lowering a tenant is making a decision, not asking permission.

**L12. The operator CLI is the only writer in v1.** `organization-limits-cli.ts` in be-01
(`show --organization <id>`, `set --organization <id> [--max-agent-persons n] [--max-concurrent-claims n] [--max-capacity-units-per-resource n]`,
`reset --organization <id>` deleting the row so the default applies again), run in the
container like `organization-activation-cli.ts`. `set` on an organization without a row
starts from the deployment defaults for the columns not given, so a row is always complete
(L6). It refuses an unknown organization, a value outside the bound, `set` with no column
and `reset` where no row exists. Why no HTTP route yet: no tenant may change its own plan
(the brief), super-admins of a tenant are the tenant, and a PUNI-staff role does not exist;
the store method is route-shaped (`OrganizationLimits.set(organizationId, limits, act)`)
so a staff route is a binding, not a redesign.

**L13. Audit.** Every `set` and `reset` writes one `organization_audit` row in the same
transaction: action `organization_limits_changed`, subject kind `organization_limits`,
subject id the organization id, actor `operator:<os login>` (`os.userInfo().username`,
which throws when the login is unavailable, so no row names nobody), detail flat as the
store requires: `beforeSource`, `afterSource` (`default` | `organization`),
`beforeMaxAgentPersons`, `afterMaxAgentPersons`, and the same pair for the other two caps.
An unchanged `set` writes no row and says so. The vocabulary widens by the mechanism
`organization_audit` has when slice 5 is built: a compatible rebuild as `20261012090200`
while issue #632 is open, a `DROP TRIGGER`/`CREATE TRIGGER` pair once it has landed; either
way the behaviour is the `organization-audit` spec's (unknown action refused, outgoing
release still writes, rollback refused while a new-action row exists). Hazard, named: the
unmerged `wbs-machine-credentials` branch carries its own rebuild
(`20261022110000`); whichever lands second must carry the first's vocabulary, and slice 5
rebases on whatever `main` holds.

**L14. UI, behaviour only.** The organization page gains a `LimitsPanel` after the session
policy panel, shown to `admin` and `super_admin` (the read's `forbidden` renders the panel
as absent, not as an error, for a member who reaches the page), with states loading,
failure (with the failure message and reload) and ready. Ready lists one row per cap:
"Agent persons 7 of 8", "Concurrent claims 12 of 200", and under "Capacity units per
resource (cap 64)" one line per listed resource, "h2puni ram 48 of 64 GB"; a count at or
over its cap is marked exceeded, and a `source: 'default'` read says "deployment default".
There is no edit control (L12). Refusal copy on the actions: a refused claim in the table and
in the startable surfaces reads "Organization limit: 200 of 200 concurrent claims"; the
people page's kind change reads "Organization limit: 8 of 8 agent persons"; the project
settings capacity field reads "Organization limit: h2puni ram would declare 72 of 64 units
across your projects". The MCP batch tool returns the typed refusal body unchanged.

**L15. The startable read does not carry the caps.** An agent learns the claim cap from the
refusal, which names the numbers; adding `limits` to `GET /api/projects/:id/startable` is
a follow-up once the first fleets say they want it before trying.

**L16. Counting crosses nothing but the organization.** Usage never reads another
organization's rows; a foreign project, person or resource in a request is `404` as it is
today, before any cap is consulted. The caps are not per project, per space or per team.

## Risks / Trade-offs

- **L5's triple is the decision most likely to be overruled.** Counting rows is simpler and
  cheaper (one `COUNT(*)` with two joins) but makes a four-step leaf cost four. The
  distinct triple costs one `COUNT(*) OVER (SELECT DISTINCT …)` per claim, on a table of
  hundreds, inside a transaction that already reads the leaf's claims. Measured in slice 3;
  if it shows, a counter column is the fallback, not a change of meaning.
- **A required environment variable blocks a deploy that forgets it.** Chosen on purpose
  (R5); slice 1 adds the three to every environment file in the repo and the runbook, and
  `config.test.ts` refuses a missing or out-of-bound value with a message naming the variable.
- **Caps are organization-wide, swarms are per project.** A tenant with two projects
  shares one claim cap between them; a per-project split is the "per-project limits"
  non-goal and would need a rule for projects that move between spaces.
- **The import refuses whole.** A plan whose agents or capacities cross a cap imports
  nothing; the refusal names the first cap crossed and its numbers. Importing in parts is
  the operator's answer, the same as for `in_use`.
- **Legacy stores are uncapped.** Dev is activated; the legacy branch exists only until
  prod activation. Stated, tested, not hidden.
- **The audit rebuild may collide with the machine-credentials rebuild** (L13). Known and
  named; the fix is ordering, which the gate enforces.
