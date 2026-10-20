# Design system foundation

## Why

Three surfaces draw PUNI and none share styling: the WBS editor on shadcn's slate defaults, the website app on hand-written brand variables, and every future product starting from nothing. Agents generate most of our UI now, and each re-derives palette, radius and shape from whatever file it opens first.

## What Changes

**One token stylesheet.**

- From: tokens duplicated per app, in two vocabularies.
- To: `@shared/ui/theme.css` defines shadcn's semantic vocabulary with PUNI brand values, light and dark; every app imports it.
- Impact: WBS repaints from slate to the PUNI palette, so every measured contrast check must re-prove.

**Shared primitives.**

- From: five shadcn-style components vendored under `apps/wbs/fe-01`.
- To: the same components in `libs/shared/adapters/ui`, imported as `@shared/ui`, each with a cva variant table and JSDoc.
- Impact: imports move; behavior unchanged.

**A catalogue agents and people can read.**

- From: component knowledge lives in JSDoc only.
- To: `DESIGN.md` beside the lib states principles, tokens and per-component rules; Storybook renders every primitive in every variant and both palettes; a shadcn registry built from the lib lets an outside product or an agent tool pull a component by name.
- Impact: new lib targets in the gate; no runtime effect.

## Non-Goals

No new components. No Figma, token pipeline or runtime theming API. The private Astro site and its licensed theme stay untouched. The website app adopts tokens only. WBS-only tokens (status hues, grid surfaces, layers) stay in `apps/wbs/fe-01`. Registry hosting is a follow-up.

## Constraints

React, Tailwind v4 and shadcn conventions stay. The WBS reset guard around `data-grid` and the `@source` scoping that keeps tests out of the bundle survive the move. The lib is `scope:shared ring:adapter runtime:browser`, reaching only domain and browser-runtime libs. Fonts are the vendored Geist and Inter Tight. Every WBS e2e contrast claim must hold on the new values, or the values change until it does.

## Capabilities

### New Capabilities

- `design-tokens`: one semantic token stylesheet, two palettes, consumed by every app.
- `ui-primitives`: the shared component library, its variants and its registry.
- `ui-catalogue`: the design spec and Storybook that render the system for agents and reviewers.

### Modified Capabilities

none

## Domain Terms

Theme, primitive, variant, catalogue, registry: `libs/shared/adapters/ui/CONTEXT.md`.

## Decisions Recorded

- [ADR 0041](../../../docs/adr/0041-one-token-vocabulary-carries-the-puni-brand.md)

## Impact

`libs/shared/adapters/ui` (new), `apps/wbs/fe-01` (imports, palette, e2e re-proofs), `apps/website/fe-01` (token import), `tsconfig.base.json`, Storybook and shadcn CLI, gate time.
