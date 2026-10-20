# Design

## Assumptions

Recorded because the interview was asynchronous; each is reversible until its slice lands. Decisions Dany made: D1 direct import plus registry, D2 Storybook, D3 website adopts tokens only (now deferred to the agency-site kit), D4 spec at the lib, D5 core plus numbered kits (`@ui/saas-01`, `@ui/agency-site-01`).

- **A1** The SaaS kit starts on WBS's current values, oklch slate, so this change moves no pixel and the five WBS contrast suites pass unchanged. Taking the brand gold into the SaaS kit is its own later change with its own by-eye review.
- **A2** Kits live at `libs/shared/adapters/ui-<kit>` tagged `scope:shared ring:adapter runtime:browser product:shared type:ui`, because `productConstraints` lets a product reach only itself and `product:shared`. The alias family `@ui/<kit>` is independent of the path.
- **A3** Core holds no component. Shared behavior (a modal's portal and focus trap) moves down only once two kits carry the same code, never in advance.
- **A4** WBS-only tokens stay in `apps/wbs/fe-01/src/styles.css` under the kit import: status hues and node readings, grid surfaces, `--highlight`, `--quiet-ink`, `--popover-shadow`. The `--layer-*` tokens and `--control-edge` moved into the kit's theme, because the kit's modal reads `--layer-modal` and its outline button `--control-edge`.
- **A5** Storybook 10.3 (Vite 8 support, per its release notes) runs as targets on each kit project, not at the root. Installed: `storybook`, `@storybook/react-vite` and `@storybook/addon-themes` at exactly 10.3.6, against Vite 8.2.2 and React 19.2.8 with no peer conflict. Its production build is part of the kit's `build` so CI proves stories compile; `bunx nx run shared-ui-saas-01:build --skip-nx-cache` (Storybook build plus `tsc --build` of the library) took 2.5 s wall on the laptop on 2026-10-21. The dev server is `bunx nx run shared-ui-saas-01:storybook`.
- **A6** The registry is built and validated in CI and not yet hosted. A later change serves it from puni.dev under `/r/<kit>/` and registers it in each app's `components.json`, which is what the shadcn MCP server reads.
- **A8** Claude Design is the screen-design canvas, fed by `/design-sync` (a user-started command in Claude Code). In its Storybook shape it imports each kit's story modules and exposes every story as a preview card, so the stories from slice 8 are the input and nothing is authored twice. Each kit carries a `.design-sync/config.json` naming its `src/` and story glob; the sync target is one design-system project per kit on claude.ai/design (`PUNI saas-01`), which moves into Claude when the standalone site closes on 2026-12-14.
- **A7** The website app and the private Astro site wait for `@ui/agency-site-01`, a later change that copies the website's `--ink`/`--paper`/`--accent` values into a second theme and owns its own primitives.

## Package shape

```
libs/shared/adapters/ui-core-01/        @ui/core-01
  CONTEXT.md          terms: core, kit, theme, palette, primitive, variant, catalogue, registry
  DESIGN.md           principles, vocabulary meanings, the kit list; the LLM entry point
  project.json        lint, lint:fast, test, test:unit, test:unit:level, typecheck, build
  src/
    index.ts          cn and the test helpers (parseTheme, listPrimitives)
    vocabulary.css    @theme inline mapping every shadcn token name to var(--name); no values
    brand.css         --brand-gold, --brand-night, --brand-paper, --brand-ink, fonts, @font-face
    fonts/            Geist and Inter Tight variable files with OFL notices (moved from website)
    vocabulary.test.ts  surface.test.ts

libs/shared/adapters/ui-saas-01/        @ui/saas-01
  DESIGN.md           values, scales, one section per primitive
  components.json     shadcn config pointing at src/ and theme.css
  registry.json       one item per primitive
  project.json        the core targets plus storybook, build-storybook (in build), registry
  src/
    index.ts
    theme.css         @import '@ui/core-01/vocabulary.css'; :root and .dark values; color-scheme
    button.tsx  card.tsx  input.tsx  label.tsx  modal.tsx  control.ts
    *.stories.tsx
    *.test.tsx        bun test with happy-dom, as fe-01's node tier does
    theme.test.ts  registry.test.ts  stories.test.ts  design-spec.test.ts
  .storybook/
    main.ts  preview.tsx (imports theme.css; light/dark toolbar toggles `.dark`)
```

`ui-agency-site-01` follows the same shape when it exists; the `ui-kit` capability is written once for every kit.

## Theme layering

A kit's `theme.css` carries the vocabulary import and the two palette blocks, nothing else. Each app keeps its own `styles.css` that declares `@layer`, imports the kit theme into `layer(theme)`, imports Tailwind's utilities with its own `@source` list, and carries its own reset. The WBS `data-grid` guard and the `@source not` test exclusions do not move.

Tailwind's utility layer in each app must scan the kit's sources, or a class only the kit names (`aria-pressed:bg-primary`, `border-control-edge`) is never emitted. WBS's `@source` list gains `../../../../libs/shared/adapters/ui-saas-01/src` (relative to `src/styles.css`), and `styles.test.ts` asserts it. Proof: with the entry removed, `header.spec.ts`'s pressed-toggle case fails at 1:1. `control-edge.spec.ts` does not fail: the outline's `border` falls back to `currentColor`, which also clears 3:1.

## Primitives

Each component moves as it is, with its JSDoc, and its import of `@/lib/utils` becomes `@ui/core-01`'s `cn`. `Hintable` and `Factable` on `Button` and `Input` are WBS types; the kit drops them, and no wrapper replaces them, because TypeScript does not check a hyphenated JSX attribute, so `data-hint` and `data-fact-lead` still pass. The one split the move forces is the modal's: the page-shortcut hold is WBS keyboard policy, so the kit's `ModalContent` takes a `held` node it renders first inside the portal, and WBS's `components/wbs/modal.tsx` wraps it with the hold.

## Catalogue

Stories use CSF 3 with `argTypes` generated from the cva table so a new variant appears without a story edit, and one story per primitive named `Matrix` lays every variant against every size. `stories.test.ts` is the totality check: it imports each cva table and asserts every key appears in the story file's source. `DESIGN.md` has a fixed heading per primitive, `## Button`, `## Card`, so `design-spec.test.ts` checks totality the same way.

## Registry

`registry.json` follows the shadcn registry schema with `type: registry:ui` items. The `registry` target runs `bunx shadcn build --output dist/r` then `bunx shadcn validate` where the installed CLI offers it; the item files are a build artifact, ignored by git.
