## Why

Today every work package defines its own steps and every leaf work item carries every
step of its package. Dany (2026-10-25, replacing `wbs-work-packages` E21): steps are
defined once for the organization, per work item type, and a space or a project adds its
own on top. A story and a spike then estimate different steps, and `Dev` and `QA` are not redefined
package by package.

## What Changes

**Catalogue**

- From: `step` rows per work package (name, code, unit, allowance), no link to work item
  types.
- To: one step catalogue per organization (code, name, estimate unit, default allowance,
  position). A step is bound at a scope, organization, space or project, to one work item
  type or to every type. A leaf's steps are the bindings along its chain that match its
  type. Layers add and never hide (SC2).

**Step nodes**

- From: one step node per leaf and package step.
- To: one per leaf and resolved step. A change that would drop a step node holding data
  is refused with the count (SC7).

**Per work package**

- Allowance and estimate unit stay per work package and step (`wbs-work-packages` E21 as
  revised), keyed by the catalogue step id.

**Migration**

- Each package's steps merge into the catalogue by code and are bound at its project for
  every type, so today's behaviour holds; estimates and journals are re-keyed once (E33).
  Collisions are reported, never resolved silently.

Depends on `wbs-work-packages` slices 1–3a (projects, spaces, settings catalogue). It
replaces that change's slice 3b.

## Non-Goals

Subtracting an inherited step at a lower scope (Q1); a mandatory work item type (Q2);
per-person steps; changing the trio, rounding (ADR 0011, 0042) or blockage (ADR 0053);
the Twilight binding format beyond reading resolved codes.

## Constraints

Additive migrations with guarded `down.sql`; every refusal with a production-path negative
and a `Proof:` comment; plan document and saved-plan input versions bump once; the
scheduler reads the resolved set only, never the bindings.

## Capabilities

### New Capabilities

- `step-catalogue`: definitions, bindings, resolution with provenance, refusals,
  migration, routes, fe-01 catalogue page.

### Modified Capabilities

- `work-packages` (delta of `wbs-work-packages`): slice 3b replaced by this change.

## Domain Terms

**Step** amended; **Step binding** added; **Step code** scope amended.

## Decisions Recorded

No ADR yet (one if Q1 lands as additive-only, superseding part of ADR 0031's
"exists for every leaf and step"). SC1–SC10 assumed by the planner from Dany's sentence;
Q1–Q4 await Dany.

## Impact

`@wbs/domain`, `@wbs/core`, both stores, `@wbs/contracts`, be-01, mcp-01, fe-01,
Twilight Navigator and Burokrat (plan document reader).
