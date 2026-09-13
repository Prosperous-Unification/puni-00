## Section 1 fixture boundary

Baseline reviewed at `c61b370dba618f00a875599d2d3a2aadb39f2f79`. The completed measured-rendering prerequisite `f66f73e8` is an ancestor of this checkout.

### Setup and tested gestures

- `rendering-fixture.ts` owns prerequisite setup: it signs in through the existing browser session, creates and names a project through the header, leaves the plan page while batches are authored, verifies the stored tree, and returns row identities. It does not take a rendering sample. `rendering-baseline.spec.ts` owns logical readiness (`aria-rowcount === rows + 1`), `renderingGeometry`, acceptance ceilings, and its existing malformed-identity and zero-geometry fault proofs.
- `plan-surface.spec.ts`'s `seedPlan` owns static prerequisites: project creation, row creation, and the persisted estimate needed to make the chart non-empty. The cases themselves own their defining gestures: opening the chart, table and chart wheel scrolling, keyboard traversal, horizontal-scroll isolation, and the corresponding geometry reads.
- The Section 2 allowlist remains `rendering-fixture.ts` and static setup in `plan-surface.spec.ts`. `layout.spec.ts`, `keyboard.spec.ts`, `mobile.spec.ts`, `priority-ramp.spec.ts`, `slack-cell.spec.ts`, `gantt.spec.ts`, `hints.spec.ts`, and `project-picker.spec.ts` retain their UI setup. `create-project.ts` remains the boundary that waits for the real header create to arm rename, verifies focus and selection, and settles the header; its consumers are unchanged in Section 1.

Retained measurement artifacts remain historical observations of their recorded fixture hash. This change does not relabel them after harness changes.

### Evidence

- `CI=1 E2E_PORT_SHIFT=2400 bunx playwright test --config apps/fe-01/playwright.config.ts apps/fe-01/e2e/project-picker.spec.ts --grep "abandoning the new project’s rename keeps the project"` — 1 passed. The real create still armed rename and Escape retained the project.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run fe-01:typecheck --skip-nx-cache` — passed.
- `bunx prettier --check openspec/changes/e2e-plan-seeding/{tasks,verify}.md` — passed.
- `git diff --check` — passed.
- `bunx @fission-ai/openspec@latest validate e2e-plan-seeding --strict --json` — valid, 1 passed and 0 failed.

The remaining Section 1 tasks are intentionally unmarked and unimplemented at this checkpoint.

## Section 1 implementation

`plan-fixture.ts` now validates recipes before writes, names project and
directory records with run/worker/test identity, resolves references across
real 200-command batches, validates every public response through the shared
contract client, and independently rereads row order, estimates and tag links.
`rendering-fixture.ts` uses the same generated-shape Page transport; its former
unconstrained generic response cast is gone.

The first browser run reached the isolated three-server stack but Playwright's
Node loader could not resolve Ajv's ESM subpath `ajv/dist/2020`. Naming the
existing module as `ajv/dist/2020.js` exposed the same validator without
changing any schema or acceptance rule. The next focused boundary run passed
5/5; the expanded final fixture and rendering-boundary run passed 10/10.

R5 reversals exercised the public routes: the second 201-row creation batch was
changed from its resolved `afterId` back to the earlier batch's local
`afterRef`, and be-01 refused command zero as
`createWorkItem/unknown_ref` before the fixture tree read. A duplicate row ref
failed before the observed project POST. A real missing-project command
refusal surfaced at setup. Removing the first result id from an intercepted
HTTP 200 failed at response identity validation. Removing exactly one
`setEstimate` while the tag write succeeded failed on stored `row/Dev`; removing
exactly one tag patch through a successful empty real batch failed on the
stored tag ids for `row`.

Fresh checks:

- `CI=1 E2E_PORT_SHIFT=2500 bunx playwright test --config apps/fe-01/playwright.config.ts apps/fe-01/e2e/plan-fixture.spec.ts apps/fe-01/e2e/rendering-fixture.spec.ts --workers=1` — 10 passed, 0 failed.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck -p fe-01,contracts --parallel=2 --skip-nx-cache --output-style=static` — both passed.

## Section 2 selected adoption

The rendering fixture now shares the generated-shape Page client while keeping
the table unmounted during bulk writes and retaining its independent final-tree
checks. The six plan-surface scenarios now create their static rows and initial
estimate through the fixture, select the exact project through the real picker,
then perform the same chart, wheel, keyboard, and geometry gestures as before.
No nonallowlisted E2E seed changed.

Two browser contexts concurrently seeded recipes with the same logical project,
row, and tag labels. Their run/worker/test-qualified project names and every
returned project, row, and tag id differed; each exact project was then selected
through its own picker. Removing worker/test identity made the real directory
writes collide on the shared tag, so the isolation proof is non-vacuous.

- `CI=1 E2E_PORT_SHIFT=4900 bunx playwright test --config apps/fe-01/playwright.config.ts apps/fe-01/e2e/plan-fixture.spec.ts apps/fe-01/e2e/plan-surface.spec.ts --workers=1` — 14 passed, 0 failed in 39.1s.
- The first attempt at shift 2500 was refused because port 5700 remained owned by an earlier interrupted process; no server was reused. Two picker-path defects were observed and fixed before the green run: an unescaped bracketed name threw a regular-expression error, then a word boundary after the closing bracket could never match.

## Section 3 concurrency audit

The all-E2E listing audit found one account-wide project read in the mobile
long-dependency setup and first-entry measurements in the header picker. The
mobile setup now reads the page's exact selected project id. Its case creates
and promotes a rival project first, proving that the global first project is
different; substituting that global id failed the real case at
`no 020 in the seeded plan`. Header measurements now locate the selected
project option by its exact project id.

The first exploratory four-worker run made the header fault concrete:
`CI=1 E2E_PORT_SHIFT=5500 bun run e2e --workers=4` ran with zero retries and a
fresh database, then finished 354 passed, 37 skipped and 2 failed in 8m54s.
Both failures measured another worker's first `New project` option and reported
`entryOverflow 0`, while the exact long-name option was present later in the
same rendered list. After exact-id scoping,
`CI=1 E2E_PORT_SHIFT=6100 bunx playwright test --config apps/fe-01/playwright.config.ts apps/fe-01/e2e/header.spec.ts apps/fe-01/e2e/mobile.spec.ts --grep 'widest entry|entry is clipped|short entry|dependency search' --workers=2`
passed 4/4. The remaining count assertions are scoped to a current plan,
dialog, listbox or rendered surface; the positional project options used only
as geometry anchors do not claim global membership or count.
