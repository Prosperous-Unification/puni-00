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

## Section 3 measured concurrency

All six planned attempts used the frozen checkout
`de2293a9bc6288b80db5539b0bd74fa44df6565b`, zero retries, a fresh database
from the normal E2E startup, and three checked, run-owned ports. The timing is
`/usr/bin/time -p` wall time. A refusal count covers backend or POST refusal;
the lock count covers `SQLITE_BUSY` and `database is locked`.

| Planned sample | Shift (ports)            | Outcome                                                                                                                  | Wall time | Locks | Refusals | Vite `write EPIPE` |
| -------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------ | --------: | ----: | -------: | -----------------: |
| one worker 1   | 5500 (8600/8700/9700)    | 356 passed, 37 skipped                                                                                                   |  1144.60s |     0 |        0 |                644 |
| one worker 2   | 6100 (9200/9300/10300)   | failed: case 42 did not arm project rename within 30s; stopped at Playwright's configured failure boundary after case 45 |   209.17s |     0 |        0 |                 62 |
| one worker 3   | 6700 (9800/9900/10900)   | 356 passed, 37 skipped                                                                                                   |  1189.73s |     0 |        0 |                734 |
| four workers 1 | 7300 (10400/10500/11500) | 356 passed, 37 skipped                                                                                                   |   453.41s |     0 |        0 |                668 |
| four workers 2 | 7900 (11000/11100/12100) | 356 passed, 37 skipped                                                                                                   |   445.62s |     0 |        0 |                642 |
| four workers 3 | 8500 (11600/11700/12700) | 356 passed, 37 skipped                                                                                                   |   430.96s |     0 |        0 |                654 |

The three four-worker runs have a 445.62s median. There is no valid
three-run one-worker median because planned sample 2 failed; the two completed
one-worker observations were 1144.60s and 1189.73s. The `write EPIPE` lines
were Vite websocket proxy noise observed without a Playwright failure in five
completed runs; they are retained rather than counted as lock or backend
refusals.

The acceptance rule refuses the four-worker configuration because all six
planned runs were not green. `playwright.config.ts` therefore remains unchanged
at `workers: 1`, even though the valid four-worker median is much faster than
the two completed one-worker observations.

Two full one-worker diagnostics are excluded from the planned matrix because
they overlapped other host work. The first passed 356 with 37 skipped in
1202.10s. The post-failure diagnostic also passed 356 with 37 skipped in
1178.68s, with zero locks/refusals and 700 Vite `write EPIPE` lines. Neither
replaces failed planned sample 2.

- `bunx vitest run playwright-config.test.ts --no-file-parallelism --maxWorkers=1`
  from `apps/fe-01` — 9 passed, confirming the retained configuration. The
  sandboxed attempt reached 8 passes and failed only because its authentication
  probe could not spawn Bun (`spawnSync bun EPERM`); the same command passed
  outside that process sandbox.

## Section 3 local final checks

The measurement commits were rebased without conflict onto `b84e0713`, whose
only intervening change hardens the agent-trailer hook and its test. No E2E
implementation or configuration changed during integration, so the six-run
matrix was not repeated.

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t test lint typecheck -p fe-01 contracts --skip-nx-cache --output-style=static`
  — all six targets passed. `fe-01:test` passed 2,698 UTC tests across 105
  files and 3 zoned tests across 2 files; `contracts:test` passed 380 tests
  across 41 files. Both projects' lint and typecheck targets passed.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@latest validate --all --strict --json`
  — 82/84 items passed. The workspace-wide check exits 1 because unrelated
  changes `local-solver-development` and `stale-solver-seat-masks-failure`
  each have no delta and do not declare `skip_specs: true`.
- `OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@latest validate e2e-plan-seeding --strict --json`
  — this change passed 1/1 with no issues.

Task 3.4 remains unchecked. The canonical `bin/h2puni-gate.sh <sha>` host-wide
gate was not run under the coordinator's explicit sequencing instruction, and
the strict all-change validation remains red on the two unrelated changes
named above.
