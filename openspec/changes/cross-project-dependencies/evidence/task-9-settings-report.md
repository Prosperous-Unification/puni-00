# Project abbreviation settings handoff

- Worktree: `/tmp/puni-cross-settings`, branch `feat/cross-project-settings`, base `dbc57b2d57d084bbfbf9a54d3a491a426062dbe7`.
- Source manifest: `/tmp/puni-abbreviation-settings-manifest.tsv` (26 files, SHA-256 of final working-tree bytes). No commit or integration performed.
- Scope: required project abbreviation travels through list/create shapes, the session-scoped catalog method and typed PATCH client into a General project settings panel. The panel validates the server grammar, applies on blur/Enter, retains refused drafts, displays canonical response and typed conflict, handles in-flight close and stale project switches. Page/catalog refresh preserves project ID. This is the abbreviation clause only; it does not complete all of OpenSpec 9.2.

## Verified

- Mounted modal, project page and toolbar suites: `TZ=UTC bunx vitest run --config vitest.view.config.ts src/components/wbs/project-settings-modal.test.tsx src/components/wbs/project-page.test.tsx src/components/wbs/plan-toolbar.test.tsx --no-file-parallelism --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000`: 185/185 passed.
- Focused settings, toolbar and real HTTP client cases: same configured view runner with four files and name filter: 21 passed, 235 skipped.
- Project catalog node suite: configured `vitest.node.config.ts` runner: 2/2 passed.
- Changed-file ESLint: passed. Changed-file Prettier check: passed. `git diff --check`: passed. `bunx tsc -p apps/wbs/fe-01/src/modules/project/tsconfig.json --noEmit`: passed.
- Watched production-path negatives, each restored byte-for-byte: disabling grammar guard failed seven invalid-draft cases; removing stale-session refresh guard failed old-response test; reading project name instead of response abbreviation failed real client canonical-response test; bypassing catalog `whileCurrent` failed withdrawn-session test.

## Open combined-integration checks

- Full frontend TypeScript build in this worktree fails at `apps/wbs/fe-01/src/components/wbs/plan-refusal.ts:278`: `code_taken | dependency_cycle` is not assignable to `never`. Root reports this is fixed in feature commit `b60a2aaf4` outside this worktree.
- The first focused view run with `wbs-api.test.ts` had 221 passed, one failure at `wbs-api.test.ts:498`: `addStep` receives `code: design` beyond its expected object. Root reports the expectation is fixed in the same feature commit.
- A broad configured view run was interrupted after several minutes to isolate failures; it has no final pass count. Besides the toolbar tab expectation fixed here, three failures reproduced in isolation and belong to the separate frontend dependency/autocomplete packet:
  - `plan-read-and-write.test.tsx` transport failure and malformed-response recovery, both at line 2567: expected `input.value === ''`, received `010, 020`.
  - `plan-keyboard.test.tsx` Cmd+Enter open depends list at line 2223: expected `aria-activedescendant === dep-option-w1`, received `dep-option-["p1","w1","whole",null]`. The run also printed two React `act` warnings.
- Full Nx gate, browser tests, build, and combined branch checks were not run here. Root owns freeze/review/integration.
