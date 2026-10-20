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
