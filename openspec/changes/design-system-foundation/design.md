# Design

## Assumptions

Recorded here because the interview was asynchronous; each is reversible until its slice lands.

- **A1** The brand is the website's. Light is paper and ink, dark is night and on-night, the accent is the warm gold, the display face is Inter Tight and the body face is Geist. WBS leaves shadcn's slate; the five WBS contrast suites are the acceptance test for the new values.
- **A2** The lib lives at `libs/shared/adapters/ui` as `@shared/ui`, following the product, ring, name layout and the `@shared/*` alias family. It is an adapter because it touches the DOM.
- **A3** WBS-only tokens stay in `apps/wbs/fe-01/src/styles.css` under the shared import: status hues, grid surfaces, `--layer-*`, `--highlight`, `--quiet-ink`, `--control-edge`, `--popover-shadow`. They are app vocabulary, not system vocabulary.
- **A4** The private Astro site in `puni-pr-00` keeps its licensed theme. Reconciling it is a later change in that repo.
- **A5** Storybook 10.3 (Vite 8 support, per its release notes) runs as targets on the lib project, not at the root. Its production build is part of the lib's `build` so CI proves stories compile; the dev server is `bunx nx run shared-ui:storybook`.
- **A6** The registry is built and validated in CI and not yet hosted. A later change serves it from puni.dev under `/r/` and registers it in each app's `components.json`, which is what the shadcn MCP server reads.

## Package shape

```
libs/shared/adapters/ui/
  CONTEXT.md             terms: theme, primitive, variant, catalogue, registry
  DESIGN.md              the written spec agents read first
  components.json        shadcn config pointing at src/ and theme.css
  registry.json          one item per primitive
  project.json           lint, lint:fast, test, test:unit, test:unit:level, typecheck,
                         build (tsc + build-storybook), storybook, registry
  src/
    index.ts             the @shared/ui surface
    theme.css            tokens, both palettes, @theme inline, no reset
    cn.ts
    button.tsx  card.tsx  input.tsx  label.tsx  modal.tsx  control.ts
    *.stories.tsx
    *.test.tsx           bun test, DOM via happy-dom as fe-01's node tier does
    theme.test.ts  registry.test.ts  stories.test.ts  design-spec.test.ts
  .storybook/
    main.ts  preview.tsx (imports theme.css, light/dark toolbar toggles `.dark`)
```

## Token stylesheet

`theme.css` carries three things and nothing else: the `@layer` order, the two palette blocks with `color-scheme`, and `@theme inline`. It has no reset and no `@source`. Each app keeps its own `styles.css` that declares `@layer`, imports `theme.css` into `layer(theme)`, imports Tailwind's utilities with its own `@source` list, and carries its own reset. This is what keeps the WBS `data-grid` guard and the `@source not` test exclusions where they are, untouched by the move.

Tailwind's utility layer in each app must also scan the lib's sources, or `bg-primary` inside `button.tsx` is never emitted. Each app's `@source` list gains `../../../libs/shared/adapters/ui/src`, and `styles.test.ts` in WBS asserts the lib path is present. Proof plan: with the entry removed, the WBS sign-in button renders with no background and `control-edge.spec.ts` fails.

Values are oklch, converted from the website's hex so the two apps agree to the digit. The website app's old names (`--ink`, `--paper`, `--accent`) are deleted, not aliased; its rules move to the shared names so there is one vocabulary to teach an agent.

## Primitives

Each component moves as it is, with its JSDoc, and its import of `@/lib/utils` becomes a relative import of `cn.ts`. `Hintable` and `Factable` on `Button` are WBS types; the lib's `Button` drops them, and WBS keeps a thin `components/wbs/hinted-button.tsx` that composes `@shared/ui`'s `Button` with the hint props. That is the one behavior-preserving split the move forces.

## Catalogue

Stories use CSF 3 with `argTypes` generated from the cva table so a new variant appears without a story edit, and one story per primitive named `Matrix` lays every variant against every size. `stories.test.ts` is the totality check: it imports each cva table and asserts every key appears in the story file's source.

`DESIGN.md` has a fixed heading per primitive, `## Button`, `## Card`, so `design-spec.test.ts` can check totality the same way.

## Registry

`registry.json` follows the shadcn registry schema with `type: registry:ui` items. The `registry` target runs `bunx shadcn build --output dist/r` then `bunx shadcn validate` where the installed CLI offers it; the item files are a build artifact, ignored by git.
