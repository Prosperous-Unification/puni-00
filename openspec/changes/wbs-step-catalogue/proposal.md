## Why

Today every work package defines its own steps and every leaf carries every step of its
package. Dany (2026-10-25, replacing `wbs-work-packages` E21): steps are defined once for
the organization, per work item type, and a space or a project adds its own on top. A
story and a spike then estimate different steps, and `Dev` is not redefined per package.

## What Changes

**Catalogue**

- From: `step` rows per work package, unrelated to work item types.
- To: one catalogue per organization (code, name, default estimate unit, default
  allowance). A binding applies a step at the organization, a space or a project, to one
  type or every type. A leaf's steps are the matching bindings along its chain; layers add,
  never hide (SC2, SC18).

**Step nodes**

- From: one per leaf and package step.
- To: one per leaf and resolved step. A write that would drop one holding any protected
  fact is refused (SC17).

**Per work package**

- Unit and allowance stay per package and step, as explicit rows (SC21).

**Scheduler**

- Slices per leaf from its resolved steps; `descendant-step` reaches matching descendants
  (SC16).

**Migration**

- Every step keeps its id and is bound at its project for every type, so stored history is
  never rewritten (SC11). Identical shared codes merge automatically; divergent codes and type conflicts wait for an operator's rules file, divergent sets for regrouping; no package gains a step (SC12, SC15, SC23); merged ids are
  translated on read (SC13).

Depends on #723 (slices 1–3a) and #724; replaces slice 3b.

## Non-Goals

Subtracting an inherited step (Q1b); a mandatory work item type (Q2b); per-person steps;
changing the trio, rounding (ADR 0011, 0042), blockage (ADR 0053) or the status fold (ADR
0046).

## Constraints

Runs in the E14 window with the backup as rollback, not additively (SC14); every refusal
with a production-path negative and a `Proof:` comment; Burokrat validates offline (SC22).

## Capabilities

### New Capabilities

- `step-catalogue`: definitions, bindings, resolution, refusals, scheduling, migration,
  routes, fe-01.

### Modified Capabilities

- `work-packages` (delta of `wbs-work-packages`): slice 3b replaced.

## Domain Terms

**Step**, **Step code**, **Step node**, **Step order**, **Step graph**, **Work-item
boundary**, **Step usage** amended; **Step binding**, **Default estimate unit** added.

## Decisions Recorded

SC1–SC24 assumed by the planner; Q1–Q5 settled 2026-10-25 (SC15, SC17, SC13 superseding E33; Q1b, Q2, Q3 by adopting the recommendations). No ADR yet.

## Impact

`@wbs/domain`, `@wbs/core`, both stores, `@wbs/contracts`, be-01, mcp-01, fe-01, Navigator
and Burokrat.
