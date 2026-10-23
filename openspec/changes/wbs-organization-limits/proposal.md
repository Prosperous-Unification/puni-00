## Why

Several organizations will share one WBS deployment (A1), and a swarm in one of them can
today declare any number of agent persons, hold any number of claims and state any
capacity its plans like. Nothing bounds a tenant but disk. Billing plans will need a number to attach to an
organization, and our fleets need the same fence to be the first tenant honestly: a cap that
refuses out loud, where claims already do.

## What Changes

**What an organization may hold**

- From: no bound on agent persons, claims or stated resource capacity.
- To: three caps per organization: agent persons, concurrent claims, and stated capacity
  units per resource summed over its projects. Every organization has a number for each;
  a deployment default applies until an operator sets the organization's own.

**Where the bound is checked**

- From: nowhere.
- To: at the write that would cross it, inside the same transaction, refused typed like a
  claim is today: `agent_person_limit` on making an agent person, `claim_limit` on
  `claimWorkItem`, `capacity_limit` on `setResourceCapacity` and the plan import. Each
  refusal names the cap and the current count. What is already held stays held.

**Who sees it**

- From: nothing to see.
- To: admins read `GET /api/organization/limits` with usage beside each cap; the
  organization page shows "7 of 8"; a refused action shows the same numbers. An operator
  sets caps by CLI; every change is one `organization_audit` row with before and after.

## Non-Goals

- Billing, plan purchase or plan change by the tenant, a plans table, metering.
- Caps on projects, spaces, members, humans, resources, teams or team slots; a per-person
  claim cap (L3); a per-agent machine-credential cap (L4).
- Rate limiting of HTTP; request body and plan-size quotas (`Quota` stays what it is).
- PUNI-hosted compute; anything Twilight Dash meters at runtime.
- Reclaiming what is held above a lowered cap.

## Constraints

- One additive migration with a guarded `down.sql`; blue and green share one SQLite file,
  so an outgoing release that knows no caps must keep writing.
- A cap check is race-safe only inside the batch's `BEGIN IMMEDIATE` under the write
  coordinator, where `already_claimed` is; nothing counts outside it.
- Every refusal ships with a production-path negative and a `Proof:` comment.
- Audit vocabulary widens by the mechanism `organization_audit` has when the slice is built
  (issue #632). UI on `@ui/core-01`/`@ui/saas-01`; behaviour and states only.

## Capabilities

### New Capabilities

- `organization-limits`: the three caps, their defaults, the read with usage, the three
  refusals, lowering below usage, the operator CLI.

### Modified Capabilities

- `plan-command-registry` (`wbs-team-claims`): `claim_limit` joins the claim's refusal
  order; undo and redo re-check it.
- `resource-directory` (`wbs-resources`): `setResourceCapacity` and the import refuse
  `capacity_limit`.
- `organization-audit` (`organization-enterprise-sso`): `organization_limits_changed`.

## Domain Terms

Organization limits, Default limits, Limit usage, Bound claim (in `CONTEXT.md`).

## Decisions Recorded

No ADR. A1 (tenant = organization) and the owner's "caps on agent persons, concurrent
claims and declared capacity, typed refusals, billing later" are fixed. L1 to L16 are this
draft's assumptions, each overrulable by id; all in design.md, "Decisions".

## Impact

`@wbs/domain` (pure limit decision), `@wbs/contracts` (shapes, refusals), `@wbs/core`
(port, route, claim and capacity checks), `@wbs/store-sqlite` (migration, repository,
usage reads), be-01 (config, CLI, audit widening, compose and Kubernetes env),
mcp-01 by derivation (one more tool), fe-01 (limits panel, refusal copy),
`docs/runbook-organization-activation.md` (operator section).
