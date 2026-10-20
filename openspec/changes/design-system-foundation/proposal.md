# Design system foundation

## Why

Three surfaces draw PUNI and none share styling: WBS on shadcn's slate defaults, the website app on hand-written variables, every future product from nothing. Agents generate most of our UI now and re-derive palette and shape from whatever file they open first. Surfaces also differ on purpose: a dense SaaS editor and an agency site share one vocabulary, not one look.

## What Changes

**One vocabulary, in a core package.**

- To: `@ui/core-01` defines shadcn's semantic token names through `@theme inline`, the brand constants (gold, night, paper, Geist, Inter Tight) and `cn`. No values, no components.
- Impact: none at runtime.

**A SaaS kit, the first of several.**

- From: five shadcn-style components and a slate palette vendored under `apps/wbs/fe-01`.
- To: `@ui/saas-01` owns that palette as its `theme.css`, light and dark, and those five primitives with their cva tables and JSDoc.
- Impact: WBS imports move; pixels unchanged.

**A catalogue agents and people can read.**

- From: component knowledge lives in JSDoc only.
- To: each kit carries a `DESIGN.md`, a Storybook rendering every primitive in every variant and both palettes, and a shadcn registry. Core's `DESIGN.md` is the entry point, linked from `LLM_README.md`.
- Impact: new lib targets in the gate.

## Non-Goals

No new components. No repaint: the SaaS kit starts on WBS's measured values; the brand gold is a later change. No `@ui/agency-site-01` yet, so no website adoption. No Figma, token pipeline or runtime theming API. No primitive in core. WBS-only tokens (status hues, grid surfaces, layers) stay in `apps/wbs/fe-01`. Registry hosting is a follow-up.

## Constraints

React, Tailwind v4 and shadcn conventions stay. The WBS `data-grid` reset guard and the `@source` test exclusions survive the move. Kits are `scope:shared ring:adapter runtime:browser product:shared`, since a product reaches only itself and shared; paths `libs/shared/adapters/ui-<kit>`, aliases `@ui/<kit>`. A kit depends on core only. Every WBS e2e contrast claim passes unchanged.

## Capabilities

### New Capabilities

- `ui-core`: the token vocabulary, brand constants and helpers every kit builds on.
- `ui-kit`: a theme, owned primitives and a registry per kit; `saas-01` is the first.
- `ui-catalogue`: the design spec and Storybook that render a kit for agents and reviewers.

### Modified Capabilities

none

## Domain Terms

Core, kit, theme, palette, primitive, variant, catalogue, registry: `libs/shared/adapters/ui-core-01/CONTEXT.md`.

## Decisions Recorded

- [ADR 0041](../../../docs/adr/0041-ui-kits-own-their-primitives.md)

## Impact

`libs/shared/adapters/ui-core-01` and `ui-saas-01` (new), `apps/wbs/fe-01` (imports), `tsconfig.base.json`, Storybook, shadcn CLI.
