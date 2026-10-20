# Verification

Not started. The intent, specs, design and tasks were drafted on 2026-10-20 and reshaped on 2026-10-21 (core plus numbered kits) in worktree `wt-design-system` from `main` a1a33b2cc. Slices 5 and 6 are recorded below.

## Failure-proof table

| Check   | Fault injected | Test that observed it | Result |
| ------- | -------------- | --------------------- | ------ |
| pending |                |                       |        |

## Gate

pending

## Slices 5 and 6

Run 2026-10-21 in `wt-design-system` on `feat/design-system-foundation`, every command with `env -u CLAUDECODE NX_DAEMON=false NX_ISOLATE_PLUGINS=false`. Not the gate: slice 11 runs `bin/h2puni-gate.sh` on h2puni.

| Command                                                                                                                                                                      | Result                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `bunx nx run-many -t typecheck lint test -p shared-ui-saas-01,shared-ui-core-01 --skip-nx-cache`                                                                             | pass, both slices (kit `bun test` 15 pass 0 fail; core 13 pass 0 fail)                       |
| `bunx nx run wbs-fe-01:typecheck --skip-nx-cache`                                                                                                                            | pass, both slices                                                                            |
| `bunx nx run wbs-fe-01:lint --skip-nx-cache`                                                                                                                                 | pass, both slices                                                                            |
| `bunx nx run wbs-fe-01:test:unit --skip-nx-cache`                                                                                                                            | 76 files, 970 tests passed, both slices                                                      |
| `bunx nx run wbs-fe-01:test --skip-nx-cache` (slice 5)                                                                                                                       | 76 files / 970 tests, 211 files / 4193 tests, 4 files / 5 tests: all passed                  |
| `bunx vitest run src/styles.test.ts vite-config.test.ts` in `apps/wbs/fe-01` (slice 6)                                                                                       | 2 files, 30 tests passed                                                                     |
| `bun test src/eslint-boundaries.test.ts src/workspace-projects.test.ts src/frontend-module-graph.test.ts src/module-labels.test.ts --timeout=120000` in `tools/tool-devsync` | 60 pass 0 fail, both slices; no pinned list changed                                          |
| `bunx playwright test --config apps/wbs/fe-01/playwright.config.ts` with the five contrast specs, local stack started by `webServer`                                         | 55 passed: `control-edge` 2, `status` 7, `plan-table-review` 15, `header` 18, `dark-mode` 13 |

The contrast suites pass unchanged on the kit theme; they assert the 3:1 and 4.5:1 floors, and no ratio is printed beyond what a failure reports.

### Failure proofs

| Check                        | Fault injected                                                       | Test that observed it                                                                                                                                  | Result                                                                                                                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `buttonVariants` merges      | `buttonVariants` returns `buttonClasses(props)` unmerged             | kit `button.test.tsx` `merges the outline classes for a caller that takes them raw`                                                                    | failed: `Expected to not contain: "border-0"`; the `<Button>` case stayed green, because the component merges again with its `className`                                                                                                              |
| no-preflight base            | `border-0 bg-transparent` removed from the base                      | kit `button.test.tsx` `neutralises the platform button face itself, without preflight`                                                                 | failed: `Expected to contain: "border-0"`                                                                                                                                                                                                             |
| WBS redeclares no kit token  | `--primary: red;` added to WBS's `:root`                             | `styles.test.ts` `redeclares no custom property the kit theme assigns`                                                                                 | failed: `expected [ '--primary' ] to deeply equal []`                                                                                                                                                                                                 |
| kit `@source`                | `@source '../../../../libs/shared/adapters/ui-saas-01/src';` removed | `e2e/header.spec.ts` `draws a pressed toggle filled and its neighbour plain, 3:1 apart` (light, dark); `e2e/status.spec.ts` done and in-progress cases | failed: `Plan pressed against Board · Expected: >= 3 · Received: 1` both palettes; status cases timed out clicking `Set to Done` / `Set to In progress` in a dialog that never settled. 4 failed, 49 passed                                           |
| same fault, planned observer | as above                                                             | `e2e/control-edge.spec.ts`                                                                                                                             | **did not fail** (2 passed): without `border-control-edge` the outline's `border` paints `currentColor`, which clears 3:1. A Vite build of `styles.css` alone confirmed the class is gone (`.border-control-edge` absent, present with the line back) |

## Slices 7 to 10

Run 2026-10-21 in `wt-design-system` on `feat/design-system-foundation`, every command with `env -u CLAUDECODE NX_DAEMON=false NX_ISOLATE_PLUGINS=false`. `node_modules` was a symlink to another checkout's; it was replaced by `bun install --frozen-lockfile` (1296 packages) before any dependency was added. Not the gate.

### Slice 7

| Command                                                                        | Result                                   |
| ------------------------------------------------------------------------------ | ---------------------------------------- |
| `bunx nx run-many -t typecheck lint test -p shared-ui-saas-01 --skip-nx-cache` | pass; `bun test` 19 pass 0 fail, 5 files |

| Check                        | Fault injected             | Test that observed it                                              | Result                                                             |
| ---------------------------- | -------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| kit spec total on primitives | `## Label` heading deleted | `design-spec.test.ts` `has a section for every exported primitive` | failed: `expect(received).toEqual(expected)`, received `["Label"]` |

### Slice 8

Installed exactly: `storybook@10.3.6`, `@storybook/react-vite@10.3.6`, `@storybook/addon-themes@10.3.6` (newest 10.3.x; `@storybook/react-vite@10.3.6` peers `vite ^5–^8`, `react ^16.8–^19`). `bun add` reported no peer warning against `vite` 8.2.2 and `react` 19.2.8.

| Command                                                                                                                                       | Result                                                                                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run shared-ui-saas-01:build --skip-nx-cache`                                                                                         | pass, `build-storybook` then `tsc --build`; 2.5 s wall (`real 0m2.525s`), Vite `built in 796ms`; `git status` shows nothing under `dist/` (`.gitignore:5:dist/`)                                         |
| `bunx nx run-many -t typecheck lint test -p shared-ui-saas-01 --skip-nx-cache`                                                                | pass; `bun test` 21 pass 0 fail, 6 files; `typecheck` covers the stories and `.storybook` through `tsconfig.storybook.json` (a `const x: number = "a"` in `card.stories.tsx` made it exit 1 with TS2322) |
| `bun test src/workspace-targets.test.ts src/workspace-projects.test.ts src/namespace-layout.test.ts --timeout=120000` in `tools/tool-devsync` | 66 pass 0 fail                                                                                                                                                                                           |
| Every built story loaded in headless Chromium from `dist/storybook/ui-saas-01`, `globals=theme:light` and `theme:dark`                        | 25 stories × 2 palettes, no page or console error; dark puts `dark` on `<html>` and the body paints `oklch(0.129 0.042 264.695)`                                                                         |

| Check                      | Fault injected                                                   | Test that observed it                                                         | Result                                                                                                                          |
| -------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| button stories total       | every `variant: 'ghost'` line deleted from `button.stories.tsx`  | `stories.test.ts` `names every button variant and size in the button stories` | failed: `expect(received).toEqual(expected)`, received `["ghost"]`                                                              |
| a story file per primitive | `label.stories.tsx` moved away                                   | `stories.test.ts` `has a story file for every exported primitive`             | failed: received `["Label"]`                                                                                                    |
| story build blocks `build` | `input.stories.tsx` imports `Nope` from `./index` and renders it | `bunx nx run shared-ui-saas-01:build --skip-nx-cache`                         | exit 130: `[MISSING_EXPORT] "Nope" is not exported by "src/index.ts".`, `Storybook exited with an error`; restored, rerun green |

Giving the kit a `build` target makes it a buildable library to `@nx/enforce-module-boundaries` (`enforceBuildableLibDependency: true`), which then refuses its imports of a non-buildable `@ui/core-01`: kit `lint` failed on every primitive with `Buildable libraries cannot import or export from non-buildable libraries`. Core therefore gained the `build` its package shape already listed (`tsc --build` of `tsconfig.lib.json`). A buildable core in turn made `tools/tool-devsync` `eslint-boundaries.test.ts` `a UI kit reaches shared browser code and nothing of a product or of Bun` fail (`Expected to not contain: "@nx/enforce-module-boundaries"`, received it), because core may reach the non-buildable `@shared/validation`; that leaf library (it imports only `arktype`) gained the same `build` target, and the four `tools/tool-devsync` suites then read 93 pass 0 fail. The rule reads Nx's cached project graph: with `.nx/workspace-data` deleted it reported nothing and 11 boundary cases failed, so each run above regenerated the graph first (`nx show projects`).

### Slice 9

Installed exactly: `shadcn@3.8.5`, the newest 3.x (npm `latest` is 4.22.1; the brief named 3.x). Its CLI offers `build`, `registry add` and the experimental `registry:build`, no validate command; `build` parses `registry.json` against the schema and reads every item file.

| Command                                                                                                                                                                     | Result                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run shared-ui-saas-01:registry --skip-nx-cache`                                                                                                                    | exit 0; `dist/registry/ui-saas-01/` holds `button card cn control input label modal registry.json`; `git status --ignored` shows `!! dist/` |
| `bunx nx run shared-ui-saas-01:build --skip-nx-cache`                                                                                                                       | pass, with `build-storybook` and `registry`; 2.6 s wall (`real 0m2.597s`)                                                                   |
| `bun test src/workspace-targets.test.ts src/workspace-projects.test.ts src/namespace-layout.test.ts src/eslint-boundaries.test.ts --timeout=120000` in `tools/tool-devsync` | 93 pass 0 fail                                                                                                                              |

| Check                          | Fault injected                                | Test that observed it                                                      | Result                                                                                                                         |
| ------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| registry total on primitives   | `label` item removed from `registry.json`     | `registry.test.ts` `names every primitive source file in exactly one item` | failed: received `["src/label.tsx"]`                                                                                           |
| every item file exists (test)  | `control` item's path set to `src/missing.ts` | `registry.test.ts` `points every item at a file that exists`               | failed: received `["src/missing.ts"]` (the totality case also failed on `["src/control.ts"]`)                                  |
| registry target (missing file) | `label` item's path set to `src/missing.tsx`  | `bunx nx run shared-ui-saas-01:registry --skip-nx-cache`                   | exit 1: `ENOENT: no such file or directory, open '…/ui-saas-01/src/missing.tsx'`; through `build`, exit 130 with the same line |
| registry target (schema)       | an item's `type` set to `registry:nope`       | `bunx shadcn build` in the kit                                             | exit 1: `Invalid registry file found at …/ui-saas-01/registry.json.`                                                           |

### Slice 10, agent half

Prepared, sync not run. The kit gained `package.json` (`@ui/saas-01`, private, entry `./src/index.ts`) and `.design-sync/config.json` (`shape: storybook`, `srcDir: src`, `cssEntry: .storybook/preview.css`) with a README saying the keys were read from the command's bundled source on 2026-10-21 and are unverified. `/design-sync` was not run; that, the render check and the slice's negative are Dany's step, and slice 10 stays unticked.

| Command                                                                                                                                                              | Result                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun install --frozen-lockfile`                                                                                                                                      | exit 0, `no changes` (the root has no workspaces)                                                                                                                       |
| `bunx nx show projects`, `bunx nx show project shared-ui-saas-01 --json`, before and after                                                                           | 51 projects both times; the kit's targets unchanged; Nx adds the tag `npm:private` and `metadata.js` (`packageName @ui/saas-01`, `isInPackageManagerWorkspaces: false`) |
| `bun test` of `workspace-targets`, `workspace-projects`, `namespace-layout`, `eslint-boundaries`, then `toolchain-pins`, `lint-policy-cache` in `tools/tool-devsync` | 93 pass 0 fail; 26 pass 0 fail                                                                                                                                          |
