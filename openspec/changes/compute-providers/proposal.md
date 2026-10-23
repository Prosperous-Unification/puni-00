## Why

A tenant's swarm runs on the tenant's own hosts: PUNI's fleets run on h2puni and h4claw over
SSH today, and a customer will bring Docker, Kubernetes or hosts of their own. WBS declares
what a plan consumes (`wbs-resources`: resources, capacity, demands, occupancy), but nothing
records what fulfils a resource's units, so an operator types `h2puni ram = 15` and nobody
learns that the host has 15,602 MiB, that 8 GB are in use, or that it is unreachable. When
PUNI later sells hosted compute, a PUNI pool unit must be priceable apart from a tenant host
unit without the plan changing.

## What Changes

**Twilight Dash gains a provider seam.** One `ComputeProvider` port with adapters: tenant SSH
host (first, the one PUNI runs on h2puni and h4claw today), Docker, Kubernetes, and a PUNI pool
slot, defined, refusing to run. A provider instance reports measured capacity and
usage for the resources bound to it and executes agent runs against it. Leases, expiry and
measured usage stay in Dash, as `wbs-resources` R3 left them.

**WBS gains one optional reference and one report.** A provider instance is an
organization-owned record; a resource may name the one that fulfils it; a Dash reporter,
acting as an agent person through a machine credential (`wbs-machine-credentials`), `PUT`s an
idempotent capacity report for that resource. Declared capacity keeps deciding schedules and
claims; the measured figure is shown beside it and adopted only by an explicit admin command.

## Non-Goals

- The PUNI pool itself, billing or pricing, scheduler or engine changes, autoscaling,
  replacing claims with leases, changing claims or occupancy.
- Measured capacity constraining a schedule or a claim by itself.
- Dash's lease authority generalisation (Claire's item 5); report history in WBS.
- Credential issuance (that is `wbs-machine-credentials`).

## Constraints

- Additive migration with a guarded `down.sql`; blue and green share one SQLite file.
- The provider reference and the report are satellites: a resource without them behaves
  byte for byte as before (schedule hash, claim decision, startable read unchanged).
- An absent, unreachable or stale provider is a rendered state in Dash and in the UI, never a
  defaulted number.
- A report is accepted only from a machine principal pinned to an `agent` person of the
  provider's organization.
- Every refusal ships with a production-path negative and a `Proof:` comment.
- UI on `@ui/core-01`/`@ui/saas-01` (ADR 0056); behaviour and states only.

## Capabilities

### New Capabilities

- `compute-provider`: provider registration per organization, the resource's provider
  reference, the capacity report, its visibility and its refusals; the Dash port and adapters.

### Modified Capabilities

- `resource-directory` (`wbs-resources`): a resource may carry a `providerId`, set through
  `patchResource`, additive and never read by a schedule or a claim.

## Domain Terms

Compute provider, Provider instance, Capacity report (in `CONTEXT.md`).

## Decisions Recorded

No ADR. The owner decisions of 2026-10-22 are fixed and restated in design.md as O1 to O5;
P1 to P14 are this draft's assumptions, each overrulable by id.

## Impact

`@wbs/contracts`, `@wbs/core`, `@wbs/store-sqlite`, be-01 (migration, two route families,
`patchResource`), mcp-01 by derivation, fe-01 (organization panel, resources section,
directory row), `twilight-dash` (`src/compute`), `docs/infra/gate-hosts.md` (the first two
instances), `CONTEXT.md`.
