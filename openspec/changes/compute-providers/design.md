## Context

What exists, read on 2026-10-22:

| Need                                       | Exists today                                                                                                                                                                                         | Missing                                                            |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| What a plan consumes                       | `resource (name, kind exclusive\|divisible, unit_label)`, `project_resource_capacity`, `work_item_resource_demand`, `claim_occupancy` (`wbs-resources` R1 to R4, migrations `20261020120000/130000`) | what fulfils a resource's units: **Provider instance**             |
| Who owns a directory root                  | `resource_organization` bridge and freeze triggers; `GET /api/projects/:id/resources` lists the caller's directory                                                                                   | an organization-owned record beside it                             |
| A machine that writes as an agent          | `wbs-machine-credentials` (branch `plan/wbs-machine-credentials`): a machine principal `{ kind: 'machine', credentialId, personId }`, scopes `read`/`write`, role capped to `member` (A12, A23)      | a route that requires that principal and an `agent` person         |
| An organization-scoped record and its page | `organization_scim_token`, `provisioning-token-shapes.ts`, `provisioning-tokens-panel.tsx` under `organization-page.tsx`; audit rows in `organization_audit`                                         | a `compute_provider` record, its routes and panel                  |
| Dash observing a host                      | `tool-fleet:discover` over a pinned SSH transport (`discovery-ssh-transport`); `f9-local-process-observation` reads cgroup v2 memory locally; Dash's review invoker spawns harness processes         | a port that measures a resource and runs an agent against the host |
| Dash's clock-bearing state                 | the runtime lease authority (`src/authority`), the activation controller store, `solver_slot` in WBS as the lease precedent (Claire's note, item 5)                                                  | nothing this change adds; it stays there                           |
| The vocabulary                             | Twilight glossary: Capacity pool, Lease, Worker provisioner ("places an admitted attempt on registered execution capacity"), Provider-unavailable outcome; WBS glossary: Resource, Occupancy         | **Compute provider**, **Capacity report**                          |

Two facts shape the design. First, `wbs-resources` R3 already split the clock out: WBS holds
the clockless occupancy of a claim, Dash holds leases, heartbeats and measured usage. A
provider is where Dash's measurements come from; it adds no clock to WBS beyond an
`observedAt` on a report. Second, `docs/twilight-structure/names.md` places anything that
"takes time or changes something" in Dash: measuring a host and running an agent on it are
both Dash's question, so the seam is a Dash port and WBS only records the answer.

## Goals / Non-Goals

**Goals:** a tenant registers the hosts it brings; an operator sees, beside a declared
capacity, what the provider measured and when, or that it could not be reached; PUNI's two
gate hosts report into dev through the same path a customer would use; a hosted PUNI pool can
later be told apart per unit without touching a plan.

**Non-Goals:** the pool itself, billing, autoscaling, scheduler or engine changes, a claim
or an occupancy that reads a measurement, lease generalisation in Dash, report history in
WBS, credential issuance.

## Decisions

O1 to O5 are Dany's owner decisions of 2026-10-22 and fixed. P1 to P14 are **assumed** by
this draft; each is overrulable by id without moving another unless noted.

**O1. Tenants bring their own hosts and agents.** PUNI-hosted compute must be pluggable later
and is not built now. WBS stays the planner: resources, capacity, demands, claims and
occupancy; it never knows what fulfils a unit. Engines, claims and occupancy do not change.

**O2. The seam is a provider interface in Twilight Dash with adapters:** tenant SSH host
first (h2puni, h4claw today), Docker, Kubernetes, PUNI pool (slot defined, not implemented). A
provider reports measured capacity and usage for a resource and executes agent runs against
it; leases, expiry and measured usage stay in Dash.

**O3. The only WBS change is one optional `provider` reference on the resource** (what kind
of provider and which instance fulfils it), shown in the UI beside capacity so limits can
later price hosted units differently; additive, never constraining a claim.

**O4. Multi-tenant.** A provider instance belongs to one organization (row-level scoping); a
tenant's Dash reports only to its own organization's resources, authenticated with a machine
credential (API key or tenant OIDC) acting as an agent person.

**O5. Non-goals:** the PUNI pool, billing, scheduler changes, autoscaling, replacing claims
with leases.

**P1. The glossary term is "Compute provider"; "provider" alone stays avoided.** `CONTEXT.md`
already avoids "provider" for an adapter and for an external-ref family, and the auth terms
use it for the identity provider. The three new terms are **Compute provider** (the kind),
**Provider instance** (the organization's registered one) and **Capacity report**. Inside
this change "provider" is the short form of compute provider. They enter the WBS glossary
under the resource cluster; the Twilight glossary's Worker provisioner is the Dash-side
actor that places an attempt on a provider and is not renamed.

**P2. A provider instance is an organization-owned record administered by admins.**
`compute_provider (id, organization_id, kind, name, locator, created_at, created_by,
updated_at)` with `kind IN ('ssh_host', 'docker', 'kubernetes', 'puni_pool')`,
`name` 1 to 80 characters unique among the organization's live instances, `locator` 1 to 256
characters of display text (`puni1@h4claw`, a Docker context name, a kube context and
namespace) that WBS never dials. Routes `GET`/`POST /api/organization/compute-providers`,
`PATCH`/`DELETE /api/organization/compute-providers/:id`, accepted from `admin` and
`super_admin`, refusing `403 forbidden` to a member or viewer and `403 insufficient_scope` to a
delegation or a machine principal as every `/api/organization/*` administration route does.
Why admins: an instance admits reports that every project of the organization sees, which is
the trusted-issuer shape (`wbs-machine-credentials` A16), not a member's own agent. Removal
with resources referencing it is `409 in_use` with the count unless `cascade`, which clears
the references and deletes the instance's reports in the same transaction; a removed instance
is deleted, not soft-deleted, and the audit row is its trace. Each act writes one `organization_audit` row: `compute_provider_registered`,
`compute_provider_updated`, `compute_provider_removed`, subject kind `compute_provider`,
detail with kind, name and locator, never a credential.

**P3. The reference is a nullable column on `resource`, set by `patchResource`.** Migration
`add_resource_provider`: `compute_provider`, `resource.provider_id` nullable referencing
`compute_provider(id)`, and `resource_capacity_report` (P5), with a `down.sql` that refuses
while any instance, reference or report exists. `patchResource.patch.providerId: string |
null` sets or clears it under the directory scope; the resource read, the project resources
read and the directory usage carry `providerId`. Refusals: an id that names no instance of the
caller's organization is `404 unknown_provider`; an id that names an instance of another
organization is `409 provider_not_in_organization` (the caller already holds the id, so
confirming it exists leaks nothing a tenant admin could not infer; collapse both to
`unknown_provider` by overruling this sentence). A provider instance may fulfil many
resources; a resource names at most one instance. Why on `resource`, not on the capacity
pair: capacity is per project, the host is not; two projects stating `h4claw ram` share the
same machine, which is exactly the known per-project occupancy limit `wbs-resources` R3
states, and a reference per pair would pretend otherwise.

**P4. Nothing in planning reads the reference or the report.** The canonical schedule input,
its hash, `decideClaim`, `refuseOccupancy` and `findStartableWork` are unchanged in source;
the golden corpus is byte-identical; the plan export and the plan document do not carry the
reference or the report (an export moves between organizations, where the instance does not
exist). Why not export it: `resource_organization` is frozen to one organization, and a
reference that survives import would name a stranger's host.

**P5. A capacity report is one idempotent `PUT` per resource, latest wins, no history.**
`PUT /api/compute-providers/:providerId/resources/:resourceId/capacity-report` with body
`{ observedAt, cadenceSeconds, outcome }` where `outcome` is
`{ kind: 'measured', capacityUnits, usageUnits }` (whole numbers 0 to 1,000,000,000, in the
resource's own unit label, no conversion ever, A12) or `{ kind: 'unreachable', reason }`
(`reason` 1 to 200 characters, the adapter's typed cause). WBS stores exactly one
`resource_capacity_report (resource_id PK, provider_id, observed_at, cadence_seconds,
outcome, capacity_units, usage_units, reason, reported_by_person_id, reported_at)` row per
resource, replacing it when `observedAt` is newer and answering `200` with the stored row.
The same body again is `200` and changes nothing; an `observedAt` older than the stored one is
`409 report_superseded` with the stored `observedAt`; an `observedAt` more than 5 minutes
ahead of WBS's clock is `400 observedAt_in_future`. Why one row: the report is the latest
truth for a chip beside a number; history, trend and reconciliation against reservations are
Dash's ("measured consumption reconciles against reservations", control-plane design) and
Claire's item 5.4 receipts, a later change. Why `PUT` and not a plan command: it is not plan
data, it moves no revision, it is not undoable, and it must be writable by a machine that
holds no project.

**P6. The report's principal must be a machine credential pinned to an `agent` person of the
provider's organization.** The route carries the identity policy, and its handler checks
the principal (a handler check, not a new policy kind): a browser session, a delegation or any principal whose `authentication.kind` is not
`machine` is `403 not_an_agent_principal`; a machine principal whose pinned person's kind is
`person` is `403 not_an_agent_principal` too (the refusal names which). The credential's
organization must own the instance and the resource, else `404 unknown_provider` (no leak
across tenants; this is where O4 is enforced). The resource must reference that instance,
else `409 provider_mismatch` naming the resource's current `providerId` or null. Why an agent
person: the report is Dash acting, and O4 says Dash acts as an agent person; a human's key
reporting hardware would hide who ran the reporter. `reported_by_person_id` is the pinned
person. No audit row per report (a hot path, like last use in `wbs-machine-credentials` A17).

**P7. Declared wins; measured is shown and adopted only by an explicit command.** The
project resources read and the project settings show, beside each stated capacity whose
resource names an instance, the latest report: `measured 15 GB, 8 in use, 2 min ago` or
`unreachable 40 min: ssh: connection timed out` or `no report yet`, and `stale` once
`now - observedAt > 3 × cadenceSeconds`. An admin "adopt measured" action writes the ordinary
`setResourceCapacity { resource, units: capacityUnits }` for the chosen project: journalled,
undoable, visible to the engines and the claim path as any typed number. Nothing adopts on
its own. Why this and not a per-resource "follow measured" flag: O1 and O3 forbid a reference
that constrains claims, and a flag whose effect is a capacity the engines read would be one;
the adopt command keeps every planning input a human-typed, journalled fact and still gives
the admin the opt-in the owner asked for. A later change may add the flag if adoption proves
tedious; the command is its building block.

**P8. The Dash port.** `apps/twilight-structure/twilight-dash/cli/src/compute/` holds:

```ts
type ProviderKind = 'ssh_host' | 'docker' | 'kubernetes' | 'puni_pool';
type Measure = 'memory_gib' | 'disk_gib' | 'cpu_cores' | 'agent_slots';
interface ResourceBinding {
  readonly resourceId: string;
  readonly measure: Measure;
  readonly path?: string; // disk_gib: the mount to measure
  readonly slots?: number; // agent_slots: the operator's ceiling
}
interface ComputeProvider {
  readonly kind: ProviderKind;
  readonly instanceId: string; // the WBS compute_provider id
  readonly capabilities: { readonly measures: ReadonlySet<Measure>; readonly runs: boolean };
  observe(binding: ResourceBinding, now: Instant): Promise<Measurement>;
  run(request: AgentRunRequest, now: Instant): Promise<AgentRunHandle>;
}
type Measurement =
  | {
      kind: 'measured';
      capacityUnits: number;
      usageUnits: number;
      observedAt: Instant;
      evidence: string;
    }
  | { kind: 'unreachable'; reason: string; observedAt: Instant };
```

A binding whose `measure` the adapter does not support is refused at configuration load
(`unsupported_measure`), never at report time. `observe` returns `unreachable` for a typed
transport fault (connection refused, timeout, host-key mismatch, auth failure) and **throws**
for everything else: a malformed `/proc/meminfo`, a `df` line it cannot parse, a missing
binary. Why throw: an unparseable answer from a reachable host is trusted state that is
malformed (R5), not an absent provider; defaulting it to `unreachable` would hide a broken
adapter behind a network story. `run` is the seam O2 asks for; its first caller is slice 2's
smoke (`run` a command that prints the host name through the same transport); the activation
controller's review invoker keeps spawning locally until a later change moves it behind the
port. The clock is injected (`src/clock.ts`); no adapter reads `Date.now`.

**P9. Adapters and what each measures.**

- `ssh_host` (slice 2): the pinned transport of `discovery-ssh-transport` (user,
  `known_hosts`, optional jump, forwarded agent, batch mode); `memory_gib` from
  `/proc/meminfo` (`MemTotal`, `MemAvailable`), `disk_gib` from `df -kP <path>`, `cpu_cores`
  from `nproc`, `agent_slots` from the binding's ceiling minus the runs Dash has started on it;
  `run` is `ssh … <command>` with the run's environment allow-listed. Units are converted to
  the binding's measure by the adapter (KiB to GiB, floored) and nowhere else.
- `docker` (slice 3): a Docker context; `memory_gib` and `cpu_cores` from `docker info`
  (`MemTotal`, `NCPU`), usage from `docker stats --no-stream` summed over containers labelled
  with the instance id (`docker stats` has no label filter, so `docker ps --filter label=…`
  names them); `disk_gib` usage from `docker system df`, capacity from the binding's
  `ceilingGib` (the daemon states no disk size; it is the operator's guess, so WBS stores usage
  above it as reported rather than refusing it); `run` is `docker run --rm` with the instance
  label, of the instance's `runImage`.
- `kubernetes` (slice 4, stub): a kube context and namespace; `capabilities.measures` is the
  full set and `runs` is true, every method answers a typed `not_implemented` outcome through
  the same `Measurement` union extended by `{ kind: 'not_implemented' }`, which WBS does **not**
  accept: the reporter refuses to start for an instance whose adapter is a stub and names it.
- `puni_pool` (slice 4, slot): the kind exists in WBS and in the port; Dash has no adapter
  class for it and configuration load refuses `provider_kind_not_available` naming it. Why a
  slot and not a stub: the pool is O1's "later"; a stub would suggest a path that does not
  exist.

**P10. The reporter and its cadence.** `twilight-dash report-capacity --config <owner-only
json>` runs one reporting loop per configured instance: every `cadenceSeconds` (default 300,
minimum 30) and immediately after a `run` starts or ends, it observes every binding and `PUT`s
one report per binding with `cadenceSeconds` in the body, so WBS can judge staleness without
a config of its own. Outcomes are modelled: `200` stored; `409 report_superseded` counted,
and after three consecutive on one binding the loop exits `another_reporter` naming the
binding (two Dash instances reporting one host is an operator fault, not a retry); `401`,
`403`, `404`, `409 provider_mismatch` and any `5xx` exit the loop at once with the refusal
(bounded convergence: one retry after `cadenceSeconds` for `5xx` and transport faults, then
exit). An `unreachable` measurement is reported, not swallowed, so WBS renders it. The
credential is read from the config file (`wbs_mk_…` or an OIDC token source), checked to be
owner-only, never printed; the WBS base URL and the instance id come from the same file.

**P11. Dash's config is the binding, WBS holds only the id.** Which resource a binding
measures, by what measure and path, lives in the Dash config beside the credential, because it
names paths and ceilings of a host WBS must never dial. WBS validates only that the report's
instance owns the resource (P6). A binding naming a resource whose `providerId` is another
instance is `409 provider_mismatch` at the first report and the loop exits.

**P12. UI.** Three surfaces, states only: an organization "Compute providers" panel under
`organization-page.tsx` (list with kind, name, locator and the count of resources each
fulfils; register, rename or relocate, remove with the `in_use` confirmation carrying the
resources' names), the resources section of project settings (`wbs-resources` task 1.5, not
yet built: the provider chip and the report sit beside each capacity, with the adopt action
for admins), and the directory page's resource row (provider chip). The loading, query-failure
and empty states are rendered; an impossible report union reaches the Error Boundary.

**P13. The first two instances are PUNI's own.** Slice 2 ends by registering `h2puni` and
`h4claw` as `ssh_host` instances of PUNI's dev organization, binding `h2puni ram`,
`h2puni tmp disk`, `h4claw ram` and `h4claw agent slots` (the resources `wbs-resources` task
6.1 declared, or their successors), and running the reporter from h2puni with an API-key
credential of an agent person; `docs/infra/gate-hosts.md` gains the operator steps. The
reporter runs as `puni1` under the observation service's pattern (`render-observation-units`),
never under the heavy lock.

**P14. Pricing hook, nothing more.** The `kind` on the instance and the `providerId` on the
resource are the whole hook O3 asks for: a later limits change can count units of resources
whose instance is `puni_pool` apart from the rest. No price, plan or quota column is added.

## Risks / Trade-offs

- **Measured and declared disagree for a long time.** By P7 nothing closes the gap on its
  own; the chip shows both. Accepted: an admin who wants the plan to follow the host adopts
  the figure, and the journal says who did.
- **One reporter, one host, two organizations.** O4 scopes an instance to one organization;
  a host two tenants share needs two instances and two credentials, each measuring the whole
  machine. Stated, not hidden; cross-tenant occupancy is outside WBS as cross-project is
  (`wbs-resources` R3).
- **Staleness is judged by WBS's clock against Dash's `observedAt`.** A skewed Dash looks
  stale or is refused `observedAt_in_future`; the refusal names the skew. The same trade-off
  the progress receipts make.
- **The Kubernetes stub refuses to start.** A tenant on Kubernetes gets the kind in WBS and a
  named refusal in Dash until slice 4's successor; preferable to a stub that reports zeros.
- **`run` ships before its real caller.** The review invoker keeps its local spawn; the port's
  `run` is proven by a smoke per adapter. The risk is a seam nobody uses drifting; the
  mitigation is that slice 2's smoke runs in the gate for the SSH adapter against a fixture `ssh`
  client, with a real sshd rehearsal recorded in verify.md as `discovery-ssh-transport` did.
- **Dependency order.** This change needs `wbs-resources` slice 1 (merged) and
  `wbs-machine-credentials` slice 1 (branch `plan/wbs-machine-credentials`) for the machine
  principal; slice 5 needs `wbs-resources` task 1.5. The `resource-directory` delta is written
  as an ADDED requirement because that capability's main spec has not been synced yet.
