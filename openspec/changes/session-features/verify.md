# verify — session-features

Branch `ui-review/session-features` from main `b144be17d`. UI review finding F-002, decision D1.
Bun tests ran under `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`; e2e with `E2E_PORT_SHIFT=500`.

## Red first

| Test                                                     | Before the change                                                                                                                                                                       |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/wbs/be-01/src/session-features.db.test.ts`         | 0 pass, 5 fail: `features` absent on every row; broken marker `Expected: 500, Received: 200`                                                                                            |
| `apps/wbs/fe-01/src/lib/session-features.test.tsx`       | 3 fail, 2 pass: each "reported off" case issued its read (Spaces: `expected 'Could not reach the server. Try again.' to contain 'Spaces need an organization'`)                         |
| `apps/wbs/fe-01/e2e/quiet-load.spec.ts` (on `b144be17d`) | 3 fail: `/` `GET /api/onboarding 403`; `/organization` five panel 403s and `GET /api/organization 409`; `/spaces` `GET /api/spaces 409`; each with Chromium's "Failed to load resource" |

## R5 negatives (each watched, then restored)

| Injected fault                                                 | Observed                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `readSessionFeatures` answers `onboarding: true` always        | session-features.db.test.ts 2 pass, 3 fail (both pre-activation rows, broken marker) |
| `organizations` from the marker alone (no selection check)     | 4 pass, 1 fail: the activated `disabled` row                                         |
| marker refusal caught and reported as `onboarding: false`      | 4 pass, 1 fail: `Expected: 500, Received: 200`                                       |
| OnboardingScreen reads whatever the feature says               | `expected [ { …(2) } ] to deeply equal []`                                           |
| OrganizationPage starts with no loss whatever the feature says | the inactive state is never found (panels mounted, their reads failed)               |
| SpacesPage reads and polls whatever the feature says           | `expected [ …(2) ] to deeply equal []`                                               |
| `App` does not pass the session read's `features` on           | quiet-load.spec.ts `/` fails with `GET /api/onboarding 403`                          |

## Commands

| Command                                                                                                  | Result                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx nx run-many -t lint:fast typecheck -p wbs-contracts wbs-core wbs-store-sqlite wbs-be-01 wbs-fe-01` | Successfully ran (after `eslint --fix` sorted two imports)                                                                                      |
| `bunx nx run-many -t typecheck -p wbs-mcp-01 wbs-gw-01 wbs-conformance wbs-store-memory`                 | Successfully ran                                                                                                                                |
| `bunx nx run-many -t test -p wbs-be-01 wbs-contracts wbs-core wbs-store-sqlite`                          | contracts, core, store-sqlite green; be-01 2258 pass, 1 fail (`oidc.integration.test.ts` expected the old `/me` body), fixed and rerun: 57 pass |
| `bunx nx run wbs-fe-01:test` (with `test:unit`)                                                          | 74 + 194 + 4 test files passed                                                                                                                  |
| `bunx @fission-ai/openspec@1.12.0 validate --all --json`                                                 | 190 items, 190 passed                                                                                                                           |

## Integration restack (2026-10-14)

Restacked standalone #442 exact head `0762e60915346af9d686a0aaf90132e5a861d6c3`
onto reviewed #405+#417 candidate `dde93acd308d071422d76c857b7325c015cdeeb9`.
The feature provider encloses the complete organization runtime tree; scoped space clients
and #417 refusal presentation/recovery are preserved. The feature test uses the mandatory
organization resource fixture and the accessible `Open All projects` recovery link.

The first integrated quiet-load run failed all three pages on
`GET /api/organization/memberships 403`: the legacy gate mounted membership choices
before its asynchronous runtime startup settled. With organizations reported off the
gate now waits for that runtime without mounting membership choices. Absent features
retain their existing fallback; activated membership discovery remains authoritative.

Fresh focused verification on the reviewed parent:

- Backend session/features/auth/route tests: 114 pass, 0 fail across six files. The initial
  sandbox run had one listener `EPERM`; rerun with localhost permission passed.
- Frontend session features, onboarding, organization page/gate, spaces and app:
  84 pass across six files.
- Quiet-load Chromium acceptance: 3 pass, including `/organization` recovery composition.
- Dedicated activated organization browser acceptance: 1 pass; ports 7300/7301/7400
  were confirmed free before startup.
- Nx scoped lint:fast/typecheck for contracts/core/sqlite/backend/frontend: 13 successful
  tasks, four cache hits on final rerun; initial run had zero cache hits.
- OpenSpec: 191 passed, zero failed. Composed frontend files pass Prettier; diff check clean.
- Watched negatives, restored: forcing feature reachability true gave 3 frontend failures
  (2 pass); forcing activation true gave 3 backend failures (2 pass); removing the transient
  gate guard failed the new inactive-runtime test on one observed membership request.
- Production comparison: backend, store, core, contracts and feature hook are byte-identical
  to standalone #442. Four frontend surfaces compose parent changes; the gate guard is
  the additional production change required by their integration.

Full host gate, full suites and publishing are delegated to the root integration review;
this worker does not run the host gate, push or merge.

## Cumulative frontend integration — 2026-10-14

Isolated clone `/tmp/puni-frontend-aggregate-sol` started at stabilized base
`8446c9c51e20c34695986f3095c58adbcb535685`. Ordered merge commits preserve reviewed
organization #413 `f6b16b5ab8243a7778b7528773f3fc61d1de48bf`, UI/session #442
`92c1808dd102d532812d8eaef8af53ce66fa22f8` (including #417
`dde93acd308d071422d76c857b7325c015cdeeb9`), and Gantt #401
`39b8c2cdf8fb213b1fda3a9159f6f4c077b16a09`. Tested application tree:
`c160a28e8a8b6aaa4f98ccef55a977f295715a0c`.

Two conflicts were resolved: both organization verification append sections were
retained, and the stabilized mounted logout test's existing `Proof:` comment was
retained over the incoming equivalent comment. The 30 s test budget agrees on
both sides. No application source required conflict edits or behavioral fixes.
`git merge-base --is-ancestor` confirmed all four reviewed tips above are ancestors.
The source checkout was read only; dependencies were reused through a local
`node_modules` symlink. No push, PR, deployment or remote merge was performed.

Fresh checks on the combined application tree:

- `TZ=UTC bunx vitest run` with one worker, no file parallelism, 30 s test/hook
  budgets and the selected session features, organization page/gate/context,
  onboarding, spaces, app, plan table/project page/chart seam and four Gantt
  component suites: **574 passed across 14 files**, 254.18 s
  (`/tmp/puni-frontend-aggregate-vitest.log`). An initially listed nonexistent
  `organization-owner.test.ts` matched no file; the expanded rerun below uses
  the actual `organization-owner.model.test.ts` and resources suite.
- Expanded approved DOM rerun of the same 14 files plus
  `src/runtime/organization-owner.model.test.ts` and
  `src/runtime/organization-resources.test.tsx`, with `CLAUDECODE=0 AGENT=0`:
  **588 passed across 16 files**, 203.10 s
  (`/tmp/puni-frontend-aggregate-vitest-approved.log`). The initial run's quiet
  reporting reflected work in progress; both runs completed successfully.
- Same settings over Gantt axis months, bar labels, panel fill, panel and chart
  seam: **333 passed across five files**, 75.45 s
  (`/tmp/puni-frontend-aggregate-gantt-dom.log`).
- `TZ=UTC bunx vitest run src/components/wbs/gantt-geometry.test.ts
--config=vitest.node.config.ts --no-file-parallelism --maxWorkers=1`:
  **217 passed**, 2.15 s (`/tmp/puni-frontend-aggregate-geometry.log`).
- `TZ=UTC bunx vitest run src/components/wbs/plan-read-and-write.test.tsx
-t 'refused draft|failed read|refused rename'` with the DOM settings above:
  **3 passed, 87 unselected**, 10.68 s
  (`/tmp/puni-frontend-aggregate-recovery.log`). These exercise draft preservation
  on refetch, unknown-status read failure, and rename refusal presentation.
- Focused session feature/gate probe: **13 passed across two files**, 26.66 s
  (`/tmp/puni-frontend-aggregate-vitest-probe.log`).
- `bun test` over backend session-features, auth-password-endpoints,
  auth.integration, oidc.integration and app.routes, with `--timeout=30000`:
  initial sandbox run **104 pass, 1 listener EPERM failure**; approved listener
  rerun **105 pass, 0 fail, 1594 assertions**, 27.29 s
  (`/tmp/puni-frontend-aggregate-backend-approved.log`).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run wbs-fe-01:typecheck
--outputStyle=static`: **2 successful uncached tasks**, 37.1 s, module and app
  checks (`/tmp/puni-frontend-aggregate-typecheck.log`).
- Same Nx flags with `wbs-fe-01:lint`: **1 successful uncached task**, 2m41s
  (`/tmp/puni-frontend-aggregate-lint.log`). Direct zero-warning ESLint over nine
  combined session/organization/spaces/chart production and test files also
  exited zero (`/tmp/puni-frontend-aggregate-scoped-lint.log`).
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: **193 items passed,
  zero failed** (`/tmp/puni-frontend-aggregate-openspec.log`).
- `git diff 8446c9c51e20c34695986f3095c58adbcb535685 HEAD --check`: exited zero.

R5: this aggregate introduces no new production safety checks. Existing adjacent
proofs and fault records from the three reviewed changes are preserved; no new
mutation proof is claimed. Fresh DOM checks cover local feature suppression,
organization access withdrawal, runtime races, recovery and chart composition.

Browser verification was attempted through `bin/with-heavy-lock.sh -- bunx
playwright test --config=apps/wbs/fe-01/playwright.organization.config.ts
--reporter=line` and exited **70** before Playwright: `heavy lock:
/home/puni1/.cache does not exist` on local `pop-os`. The canonical lock was not
bypassed. Activated organization, quiet-load, Gantt/browser geometry and other
browser suites remain unverified on this aggregate. Full repository suites,
build, backend/dependency-wide lint/typechecks, hosted CI and the exact-SHA
`bin/h2puni-gate.sh` remain required integration checks for the root owner.
