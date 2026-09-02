# Refactoring plan — 2026-09-02

File-by-file review of `main` @ `3346bb15` for three kinds of refactoring — code reuse,
performance, and readability with DDD — ordered so that every step makes the repo cheaper
for an LLM agent to edit safely. Six read-only sweeps, one per area, each opening every
non-test file in scope; the sweeps' full ledgers are in
[`2026-09-02-refactoring-review/`](2026-09-02-refactoring-review/README.md). Nothing was
changed by the review.

This extends [`2026-08-30-sustainability-audit.md`](2026-08-30-sustainability-audit.md),
which is three days and 155 commits old. Where the audit's project-level findings still
hold they are cited by their audit id (R1–R6, D1–D7, C1–C7, L1–L8) rather than restated.
What is new here: the per-file ledgers, a performance axis the audit did not have, a
re-measurement of every number the audit gave, and an ordering built around three
agentic-workflow costs rather than around LOC.

Vocabulary: **module / interface / seam / adapter / depth / leverage / locality** as defined
in `.claude/skills/improve-codebase-architecture/LANGUAGE.md`; domain nouns from
`CONTEXT.md`.

## 0 · What the review is optimising for

Three costs decide whether an agent can change this repo without breaking it. Every item
below is placed by which of the three it lowers.

1. **The read set.** How many lines must be loaded to change one concept. Today: one column
   in the plan table is ~165k tokens (`wbs-table.tsx`, 12,183 lines) plus ~230k for its test
   (`wbs-table.test.tsx`, 16,855 lines); one store in be-01 is ≥3,773 lines of barrel before
   the file itself; one command kind is seven files that do not link to each other.
2. **The honest check.** Whether the command an agent runs after an edit can fail. Today
   **18 of 23 `typecheck` targets compile nothing** (solution-style tsconfig, the fault
   CLAUDE.md records as R5 #16/#17, still live for every lib and every tool); the canonical
   gate runs `--skip-nx-cache` so cache-input mistakes are masked; there is no sub-minute
   test tier for be-01 or fe-01; Playwright runs 229 cases on one worker.
3. **One place per rule.** Whether a rule is stated once and enforced, or restated in prose
   at N sites. Today the write vocabulary is written in seven places, the "columns may depend
   on three values" rule ten times, the 401 guard 23 times, the localStorage trio eleven
   times, `stampFor` seven times, and three comments in be-01 assert things the code no
   longer does.

Performance is a fourth axis with its own section, because the review found real
algorithmic and I/O costs the audit did not look for — but it ranks after the three above
where they compete, because a performance fix made against a gate that cannot fail is the
repo's own recorded failure mode.

## 1 · Numbers, re-measured

| Measure                                    | Audit (08-30)               | Now (09-02)                                        | Source                            |
| ------------------------------------------ | --------------------------- | -------------------------------------------------- | --------------------------------- |
| `wbs-table.tsx` file / `WbsTable` fn       | 11,265 / 8,820              | **12,183 / 9,418**                                 | sweep C §0, with the commit table |
| `wbs-table.test.tsx`                       | 15,570 LOC, 552 cases, 182s | **16,855 LOC, 585 cases**                          | sweep C                           |
| `repository/index.ts` / `schema.ts`        | 1,903 / 1,429               | **2,017 / 1,756**                                  | sweep A                           |
| `libs/domain` tests                        | 128 in 0.2s                 | 145 in **0.29s**                                   | sweep F, measured                 |
| `apps/be-01` tests                         | 1,203 in 26.6s              | 1,261 in **55.8s**                                 | sweep F, measured                 |
| eslint be-01 cold / `--cache` warm         | 41s / 2.5s                  | **14.7s / 2.4s**                                   | sweep F, measured                 |
| eslint libs/domain cold / warm             | 12s / —                     | **5.3s / 1.3s**                                    | sweep F, measured                 |
| `nx format:check --all` vs prettier direct | 44s vs 14s                  | **18.9s vs 17.7s** — the audit's win is withdrawn  | sweep F, measured                 |
| `typecheck` targets compiling nothing      | (be/gw fixed)               | **18 of 23**                                       | verified by hand, §3 W0-1         |
| Write-vocabulary copies                    | 5                           | **7** (`DIRECTORY_KINDS`, `compensating.COMMANDS`) | sweep B                           |
| localStorage trio copies                   | 9                           | **11**                                             | sweep D                           |
| `live.current` keys / read sites           | —                           | 82 / 159                                           | sweep C                           |
| `listByProject` call sites in one service  | —                           | 44                                                 | sweep B                           |
| Per-command queries in a 200-write batch   | —                           | ~1,200, ~400 full-project scans, inside the lock   | sweep B, traced                   |
| Requests per write or peer frame, fe-01    | —                           | **8** (tree + steps + 5 directory lists + people)  | verified by hand                  |
| Playwright                                 | —                           | 229 cases, `workers: 1`, ~15 min of a 25 min cap   | verified by hand                  |

Audit findings whose status changed: **D3 is closed** (`tags-accumulate` merged; ADR 0008
exists on `main`). **D6 mutated** — the two controllers are no longer registered, but the
files keep `.controller.ts` names, register no route, and three comments still describe
registering them. **C1, C2, C3, D7, R5 hold** unchanged (`openspec/specs` absent;
`config.yaml:31` still says "There is no CI"; `AGENTS.md` is 475 lines; `BatchResult` /
`ItemState` / `result` in nine outcome types; 23 `userFromHeaders` sites).

## 2 · Findings the audit did not have

Defects and dead paths found by reading every file. These are not refactorings; they are
the reason Wave 0 exists, and most are under an hour each.

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                             | Where                                                                                   | Verified      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------- |
| N1  | A `.derive()` computes `requestIdentity` — a JWT verify plus a `users.findById` — on **every** request including `/health`, and nothing reads it. Writes pay authentication three times.                                                                                                                                                                                                                            | `apps/be-01/src/app.ts:171–173`                                                         | ✔ grep        |
| N2  | Three indexes exist in the database and not in `schema.ts` (`actual_by_step`, `step_measure_by_step`, `step_progress_by_step`); `step.ts` comments claim to read through them; the next `drizzle-kit generate` drops them. Four indexes the `WHERE` clauses want are absent everywhere.                                                                                                                             | `drizzle/20260831120000_rename_role_to_step/migration.sql:74–78`, `schema.ts`           | ✔ diff        |
| N3  | `toProject` spreads `...rest`, so `updated_at` and `created_by` (a user id) reach `GET`/`PATCH /api/projects/:id`; its JSDoc claims the opposite. Two more bare reads break the folder's own column-list convention.                                                                                                                                                                                                | `repository/project.ts:74–146, :373`; `work-item.ts:547`; `directory.ts:127`            | sweep A       |
| N4  | Three services publish a broadcast **inside** the write lock and the outer transaction, against the runner's own watched invariant; a directory rename touching K projects does K sequential gw-01 pushes with up to ~63s of retry each, lock held.                                                                                                                                                                 | `capacity.service.ts:96`, `priority-band.service.ts:84`, `directory.service.ts:662–666` | sweep B       |
| N5  | `announceWorkItem`, `withAncestors` and the `work_items_changed` event are unreachable in production (every mutator runs inside `collect()`); the one-item path computes a full schedule and discards it.                                                                                                                                                                                                           | `work-item.service.ts:3945–3956`, `broadcast.ts:7–13, :108–125`                         | sweep B       |
| N6  | `libs/realtime` has **zero importers** (one path string in devsync); the live client is `fe-01/src/lib/project-stream.ts`. `contracts/ws.ts` types `resume_denied.reason` as `'out_of_range'` while gw-01 sends `'unavailable'`. Four `WsFrame` declarations.                                                                                                                                                       | `libs/realtime/**`, `libs/contracts/src/ws.ts:23`, `gw-01/ws.controller.ts:103`         | ✔ grep        |
| N7  | `parseOrThrow` puts `JSON.stringify(input)` in its thrown message, so be-01/gw-01 boot failures print `JWT_SIGNING_KEY_CURRENT`; mcp-01 refuses `defineConfig` for exactly this and says so.                                                                                                                                                                                                                        | `libs/validation/src/core.ts:15`, `apps/mcp-01/src/config.ts:44–48`                     | sweep E       |
| N8  | mcp-01's OAuth transaction store re-implements `libs/auth`'s less safely: verbatim binding key vs a sha256 digest, `!==` vs `timingSafeEqual`. Its caller passes verified claims the callee's signature does not accept, so every request verifies twice.                                                                                                                                                           | `apps/mcp-01/src/oauth.ts:316, :345, :170`, `caller-auth.ts:32`                         | sweep E       |
| N9  | `step.service.ts`'s fast-path predicate has drifted from the authoritative one in the store (omits actuals, progress, measures); no test compares them.                                                                                                                                                                                                                                                             | `step.service.ts:212` vs `repository/step.ts:373–380`                                   | sweep B       |
| N10 | Seven Nx targets read `bin/*.sh` and `deploy/compose/*` and declare none as inputs; editing `bin/dev-deploy.sh` invalidates nothing. Masked, not fixed, by `--skip-nx-cache` in the gate.                                                                                                                                                                                                                           | `bin/h2puni-gate.sh:9`, seven `project.json`                                            | ✔ grep        |
| N11 | The presence panel opens a **second** WebSocket by hand with no reconnect; one drop and the roster reads `(closed)`.                                                                                                                                                                                                                                                                                                | `components/presence/presence-panel.tsx:14–47`                                          | sweep D       |
| N12 | Every `ws.send` in gw-01 discards Bun's return value — no backpressure signal at all, including on the fan-out the metrics claim to count. gw-01's OTel `/metrics` is always empty; it serves a second hand-rolled snapshot instead.                                                                                                                                                                                | `apps/gw-01/src/app.ts`, `presence.ts:121`, `gateway-metrics.ts:46`                     | sweep E       |
| N13 | Stale text an agent will trust: `hand-parsed-body.ts:13` names eight routes none of which exist; `app.ts:181–192` and `history.controller.ts:49` register controllers that are gone; `plan-command-schema.ts:19` ships "The step (step)" to MCP clients; `openapi-tools.ts:199` says 40 of 51 operations (30, 27 without prose); mcp-01 README says 20 tools, its test asserts 22; `LLM_README` lists table `role`. | as named                                                                                | sweep B/E     |
| N14 | Dead code that reads as live: `repository/example.ts`, `fe-01/src/db/config.ts`, `components/smoke/**` (the only `d3` importers), `libs/scripts` (0 consumers), `tool-dagger/src/{be-01,gw-01,fe-01}.ts` (~220 LOC describing a retired tarball format), two SSH builders, `observability/metrics.ts`, `contracts/errors.ts`, `validation/branded.ts`.                                                              | as named                                                                                | sweep A/D/E/F |

## 3 · The plan

Five waves. Each wave is safe to start when the one above it has landed; items inside a wave
are independent unless a **needs** column says otherwise. Effort is one agent's, verified
per the R5 rule (negative watched failing, `Proof:` written from the output). Every item
that changes observable behaviour is an OpenSpec change; most Wave 0 items are fixes that
restore an already-precise spec and need none.

### Wave 0 — make the gate honest, remove the defects (≈ 3 days)

The cheapest wave and the one every later wave depends on: nothing below can be verified
until the type checks compile files and the cache reads the right inputs.

| Id    | Change                                                                                                                                                                                                                                                                                   | Files                                                                | Effort | R5 negative                                                                                                          |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| W0-1  | **Done, 2026-09-02** — see §6. `tsc --noEmit -p <solution>` → `tsc --build --force` in the 18 vacuous `typecheck` targets, and `libs/auth` unified onto the same form so all 23 read one way. 12 latent type errors fixed, `@types/node` bumped 18.16.9 → 22.18.0, one guard test added. | 19 `project.json`; 7 source files; `package.json`                    | 1h + ? | `const x: number = 'no'` in `tools/tool-remote-scripts/src/swap.ts`, watched red                                     |
| W0-2  | **Done, 2026-09-02** — see §7. Nine targets across six projects read files outside their own project and declared none. Declared precisely, per target. `--skip-nx-cache` **kept** in the release gate, deliberately; see §7.                                                            | `nx.json` or 7 `project.json`; `bin/h2puni-gate.sh`                  | 2h     | edit `bin/dev-deploy.sh`, assert the shellcheck target re-runs                                                       |
| W0-3  | **Done, 2026-09-02** — see §8. Deleted. The waste was larger than N1 said: a read route resolved the caller twice, not once.                                                                                                                                                             | `app.ts:171–173`                                                     | 15m    | a counter on `AuthService.authenticate` per `/health`: 1 → 0                                                         |
| W0-4  | **Done, 2026-09-02** — see §16. Seven indexes declared, four created by an additive migration, and a diff test that would have caught the drift.                                                                                                                                         | `schema.ts`, `drizzle/`, new `schema-indexes.test.ts`                | 4h     | remove one declared index, watch the diff test name it                                                               |
| W0-5  | **Done, 2026-09-02** — see §15. All three closed; the leak was measured on the wire first, and one column list now serves two readers.                                                                                                                                                   | `repository/project.ts`, `work-item.ts`, `directory.ts`, `schema.ts` | 6h     | `created_by` asserted absent from `GET /api/projects/:id` body                                                       |
| W0-6  | **Done, 2026-09-02** — see §17. One `DeferringBroadcaster` the runner holds; the negative it needed did not exist and now does.                                                                                                                                                          | `plan-commands.ts`, the three services                               | 1.5d   | extend "lets go of the write lock before the broadcast leaves" to a directory command; today it proves nothing there |
| W0-7  | **Done, 2026-09-02** — see §10. Ten call sites moved to the surviving shape; `announceWorkItem`, `withAncestors` and `work_items_changed` deleted.                                                                                                                                       | `work-item.service.ts`, `broadcast.ts`                               | 4h     | deletion test — grep confirms one non-test reference each                                                            |
| W0-8  | **Done, 2026-09-02** — see §12. `parseOrThrow` stops echoing the input; a new `parseSecretsOrThrow` names paths only and `defineConfig` uses it.                                                                                                                                         | `libs/validation/src/core.ts`                                        | 2h     | watched failing against today's `core.ts:15`                                                                         |
| W0-9  | **Done, 2026-09-02** — see §11. One exported `stepIsInUse`, both callers route through it, two negatives watched.                                                                                                                                                                        | `step.service.ts`, `repository/step.ts`                              | 2h     | a step holding only actuals refused by the fast path                                                                 |
| W0-10 | **Done, 2026-09-02** — see §14. Five sentences corrected from the code; the README's tool count is now a test, watched failing two ways.                                                                                                                                                 | as named in N13                                                      | 2h     | the README test fails when a tool is added                                                                           |
| W0-11 | **Mostly done, 2026-09-02** — see §13. Nine modules and one whole library deleted. Two of N14's entries are **not** dead and were kept, with reasons.                                                                                                                                    | as named in N14                                                      | 3h     | deletion tests pass by construction; `tsc --build` (post W0-1) names any survivor                                    |
| W0-12 | **Done, 2026-09-02** — see §9. Both renamed with their tests, every reference rewritten, the orphan comments deleted, and `middleware/validate.ts` inlined into its one caller.                                                                                                          | `apps/be-01/src/controller/`, `middleware/`                          | 1h     | `openapi-document.test.ts` already guards the route table                                                            |

### Wave 1 — the test infrastructure that makes every later wave verifiable in seconds (≈ 6 days)

The audit's L2/L3 with what the sweeps added. Zero production change in this wave.

| Id   | Change                                                                                                                                                                                                             | Files                                                    | Effort | Needs |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- | ------ | ----- |
| W1-1 | **Half done, 2026-09-02** — see §18. The rich fake is extracted to `src/testing/` and now typechecks, which found 11 divergences from `ProjectApi`. Migrating the other six fakes and the call log are still open. | new; 7 test files                                        | 1.5d   | —     |
| W1-2 | **Done, 2026-09-02** — see §22. Eleven files, all 585 cases; the fe-01 suite goes 180s → **69s**.                                                                                                                  | `apps/fe-01/src/components/wbs/*.test.tsx`               | 0.5d   | W1-1  |
| W1-3 | **Done, 2026-09-02** — see §20 and §21. `inMemoryServices()` exists and **every in-memory suite** uses it, ~500 lines lighter. The audit's "24 files" was mostly T1 suites this harness cannot serve.              | new; 24 test files                                       | 2d     | —     |
| W1-4 | **Mostly done, 2026-09-02** — see §23. be-01 has guarded T0/T1 tiers and there is a root `test:unit` at 17s. fe-01's half needs a 55-file rename; lefthook is left alone, measured.                                | every `project.json`, `vitest.config.ts`, `lefthook.yml` | 1d     | W1-2  |
| W1-5 | **Done, 2026-09-02** — see §19. A cached `lint:fast` on all 22 projects: 15.1s → 4.1s. The plan's lefthook half is **withdrawn**, measured worthless.                                                              | `project.json` ×N, `.gitignore`                          | 1h     | —     |
| W1-6 | **Investigated, not done, 2026-09-02** — see §24. The duplication is smaller than reported and the API-seeding idea conflicts with one spec's stated intent.                                                       | `apps/fe-01/e2e/*`, `playwright.config.ts:165`           | 1.5d   | —     |

### Wave 2 — performance (≈ 10 days)

Ranked by cost removed per hour. Every item has a probe that can fail: a statement counter
through `db.ts`'s `logger` hook, a render-count spy in the shape `pointed-row-render-cost`
shipped, or a request counter on the fake API. **Inject the fault the check is about.**

| Id    | Change                                                                                                                                                                                                                                                                                                                                                                                                                             | Files                                                                                                  | Effort | Probe                                                                              |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------- |
| W2-1  | **fe-01 read-after-write reads the plan, not the world.** A read seam in `wbs-api.ts`: an in-flight map so concurrent asks share a promise, and a stated freshness for the five Directory vocabularies so a write or a peer frame refetches `tree` + `steps` only. Same for `directory-page.tsx`'s five plus its `window.focus` re-read. Keep "the plan is replaced, never patched".                                               | `lib/wbs-api.ts`, `lib/project-stream.ts:113`, `wbs-table.tsx:3671–3775`, `directory-page.tsx:256,342` | 1d     | "a peer edit costs 2 requests, not 8" — fails today                                |
| W2-2  | **Memoise `shownRows`, `ganttPlan`, `startFloor`** on their real inputs (`todayIso`, not `new Date()`), as `pointed-row-render-cost/design.md` D3 said and the code did not do. Every keystroke currently re-runs `layOutGantt` through `GanttPanel`'s `useMemo(…, [plan])` and `startFloorByRow` chart open or closed.                                                                                                            | `wbs-table.tsx:10233, :10519, :10617`                                                                  | 0.5d   | `layOutGantt` call count across a keystroke: unchanged                             |
| W2-3  | **Batch gets one read of the plan (be-01).** `PlanCommandRunner.execute` opens a plan snapshot before the loop; `contextFor`, `holdsStep`, the four `storedX` read it; mutators update it in place; the forward guards become pure functions of the snapshot. Also `tree()`'s 13 sequential awaits → `Promise.all`, and `schedule()` stops calling `deriveNumbers` a second time.                                                  | `work-item.service.ts` (44 `listByProject` sites), `plan-commands.ts:118–166`, `schedule.ts:1967`      | 4d     | statement count for a 200-command batch: ~1,200 → ~20                              |
| W2-4  | **Engine hot spots**, gated by `schedule-identity.test.ts`'s thousand-seed differential and the two captured oracles: `dependsOn` reuses the id `Set` built at `:1302` (5 min); `topological` head index instead of `shift()`; `eventAt` batches inserts instead of `splice` (O(E²) → O(E log E)); `projectOntoWorkItems` one reduce per parent, no spread into `Math.min`.                                                        | `work-item.service.ts:1531`, `schedule.ts:377–409, :729–735, :2130–2212`                               | 1.5d   | differential unchanged; `eventsVisited` bound now also counts moves                |
| W2-5  | **Batch writes and the N+1** (ADR 0007's own "first thing to revisit"): `setFrozenNumbers` one `UPDATE … CASE`; `remove` batched per depth level (the reverse order is load-bearing — keep it); `DependencyStore.removeAllForMany(ids, stamp)` replaces the per-item transaction loop at two call sites.                                                                                                                           | `repository/work-item.ts:713–762`, `dependency.ts:90–111`, `work-item.service.ts:2258, :3520`          | 0.5d   | "a freeze costs one statement" via `db.ts`'s logger, as `project.test.ts:259` does |
| W2-6  | **Gantt mark memos lose their per-gesture deps**: `open?.sliceId` and `fullScreen` out of the 23-entry list via refs; one `Set` of drawn slice ids for the two link filters, the flag filter and `openBar`; `routeArrow` indexes obstacles by row.                                                                                                                                                                                 | `gantt-panel.tsx:3504–3527, :2611, :2638, :2652`, `gantt-geometry.ts:1372`                             | 1d     | "opening a bar's facts re-renders no Gantt mark" — the D4 probe, new gesture       |
| W2-7  | **`PointedCell` store** for `hoveredCell`/`focusedCell`/`openCard`, `depHover`/`depFocus`/`depLit`, in `pointed-row-store.ts`'s shape; a thin per-cell shell subscribes; the card re-renders, not the table. Then the same for `dropHint`, `widthOverrides`, `ganttHeightPx` (per `pointermove` of a drag).                                                                                                                        | `wbs-table.tsx:3038–3067, :3248, :3284, :3309, :2845, :2857`, seven writer cells                       | 2d     | `flexibleCellStyle` call count across a hover: 0 delta                             |
| W2-8  | **Layout reads off the pointer and scroll paths**: `depends-card.tsx:196–212` reads every card line's rect per `pointermove`; `plan-scroll-link.ts:243` ~10 rects per scroll event; the Gantt `onScroll` four reads + three state updates; `plan-cards.tsx:1237` a 600-frame rAF poll on a phone. One rAF per frame, node lists cached per layout generation, `transitionend` instead of the poll. Keep `alignmentMove` untouched. | as named                                                                                               | 1d     | `getBoundingClientRect` spy per pointer event; Chromium for the linked scroll      |
| W2-9  | **`calendarScale.startOf` and `addWorkdays`**: memoise the workday→calendar offsets once per horizon (fe-01 side, no `libs/domain` change); closed-form `addWorkdays`/`workdaysBetween` in `libs/domain` behind a property test equating loop and formula for 0..500 workdays × 7 start weekdays. Do not move `snapWorkdays` (ADR 0011).                                                                                           | `gantt-geometry.ts:936, :2361`, `libs/domain/src/workday.ts:246, :268`                                 | 0.5d   | `addWorkdays` call count per `placeOnCalendar`; the four `Proof:`s re-watched      |
| W2-10 | **Code splitting**: `/directory` lazy route; `GanttPanel` + `gantt-geometry` behind `lazy()` (its fault boundary exists); `PlanCards` behind the viewport branch; `manualChunks` for vendor. The sign-in form currently waits for all of it because `app.tsx:88` blocks on `fetchMe()`.                                                                                                                                            | `app-router.tsx`, `vite.config.ts`, `plan-renderer.ts`                                                 | 0.5d   | a chunk-count assertion in `e2e-packaged`                                          |
| W2-11 | **`PlanCard` shell** (the phone face got none of `pointed-row-render-cost`): a shell owning `<article>`, its own actions-menu state and subscription, fields as `children`; ~1,080 per-row reader calls per render today.                                                                                                                                                                                                          | `plan-cards.tsx:1988–2557`                                                                             | 1.5d   | `cardTrioOf` spy delta when one menu opens                                         |
| W2-12 | **Started, 2026-09-02** — see §24. Three done: the push retry's re-serialisation, the throttle's whole-map prune, and the two exporters' `nameOf`.                                                                                                                                                                                                                                                                                 | as named                                                                                               | 1d     | each a one-line spy or count                                                       |
| W2-13 | **One socket per browser** (N11): `subscribeToProject` gains `onPresence(users)`; the presence panel stops opening its own.                                                                                                                                                                                                                                                                                                        | `presence-panel.tsx`, `project-stream.ts`                                                              | 0.5d   | a dropped socket re-populates the roster                                           |
| W2-14 | **gw-01 `SocketWriter` seam** (N12): one place owns `ws.send`, checks the return, counts `dropped`/`backpressured` into `libs/observability`'s `Counter`s (their first caller); delete `/metrics/snapshot` and the `gwMetrics` singleton. `presence.broadcast()` O(C×P) per subscribe → per-project index.                                                                                                                         | `apps/gw-01/src/**`, `libs/observability/src/metrics.ts`                                               | 1d     | a backpressured fake socket increments a counter — inexpressible today             |

### Wave 3 — reuse: one implementation behind N names (≈ 12 days)

Each collapse is a **deletion test that passes**: remove the copies, route the callers, and
nothing else in the repo changes. Where the copy carries a comment saying "line for line" or
"deliberately shaped as a copy of", the comment is the bug report.

| Id    | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Files                                                                                                                                     | Effort | LOC out |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------- |
| W3-1  | **One satellite store** behind `EstimateStore`/`ActualStore`/`StepMeasureStore`/`StepProgressStore` (audit R4): parameterised by table, value columns, key width, and the one drifted flag (`estimate.ts:118` bumps unconditionally; the other three guard). `listByProject`'s 2,000-element `IN` list → an inner join, once for all four. The four `storedX` readers and the eight `setX`/`clearX` bodies in the service collapse with it. Check `audit.test.ts:110`'s `> 40` floor first — the collapse removes write sites, and that alarm firing would be a false one.                                                                                                                        | `repository/{estimate,actual,step-measure,step-progress}.ts`, `index.ts:857–1084`, `work-item.service.ts:2516–2911, :3856–3920`           | 2d     | ~900    |
| W3-2  | **`remembered<T>(key, isValid, fallback)`** → `{ read, readAndDrop, write, forget }`, taking `lib/theme.ts:60–120` as the reference shape (it is the only copy that gets read-in-render vs read-and-drop right). Migrate the other ten: `gantt-panel.tsx:663`, `project-settings-modal.tsx:63`, `project-page.tsx:65`, the eight in `wbs-table.tsx:743–1412`. Preserve the asymmetry that expansion, Mermaid lanes and saved views have no `forget` (Layout reset does not forget them) as a per-family flag.                                                                                                                                                                                     | `lib/remembered.ts` new; 11 sites                                                                                                         | 1d     | ~350    |
| W3-3  | **Reference set at three tiers, one adapter each**: `referenceColumn(kind, …)` from the `ReferenceSetAdapter` that already exists for the four table columns (`wbs-table.tsx:8511–8773`, 263 LOC, 8 writers, 12 `live` keys); `<ReferenceField kind>` for the three card components (`plan-cards.tsx:615–915`); `<DirectoryCard kind>` over `directory-page.tsx:290`'s `writesFor` table for the three directory cards (`:1079–1330`); one `EffectiveLabel<'replaced' \| 'accumulated'>` for the three label unions (`gantt-geometry.ts:176–283`). The accumulate-vs-replace distinction stays in the mode, per ADR 0008; there is deliberately no type dimension in `effective-*` (ADR 0009).    | as named, `reference-set-field.tsx`                                                                                                       | 3d     | ~750    |
| W3-4  | **Directory triple → one `namedEntity(kind, store)`** across the six layers audit R2 names: `repository/directory.ts`, `directory.service.ts:240–428` (nine methods, three bodies), `plan-commands.ts:512–658` (five triples "line for line", says the comment), `directory-usage.ts:221–285` (three identical one-line lambdas under 90 lines of JSDoc), `wbs-api.ts:743–782`. Lands naturally as descriptors when W4-3 exists; do the service and store halves now.                                                                                                                                                                                                                             | as named                                                                                                                                  | 2d     | ~450    |
| W3-5  | **One identity guard** (audit R5): an Elysia macro `signedIn(auth)` resolving the identity once and handing the handler a non-null `user`; the 23 five-line 401 blocks go; the `read`-scope check that exists at two arbitrary routes becomes one rule with a stated reason; `cookieValue` (`middleware/authenticated.ts:24`) and `cookiesOf` (`auth.controller.ts:315`) become one parser. `directory.controller.ts` 69 → ~25 lines.                                                                                                                                                                                                                                                             | `app.ts`, `middleware/`, all controllers                                                                                                  | 0.5d   | ~150    |
| W3-6  | **One refusal table, one fault boundary (fe-01)**: `refusalSentence(code, scope)` with the shared arms (`not_found`, `forbidden`, `unexpected_response`, 5xx) once — six sites today, three 5xx behaviours (`estimating-panel.tsx:139` has no 5xx arm; `directoryRefusalSentence` has none); the prefix-code idea (`SIZE_CEILING_CODE` reading be-01's constant) generalised. `lib/fault-words.ts` + one `FaultBoundary({ resetKey, fallback })` for `app-fault.tsx`/`gantt-fault.tsx`'s byte-identical helper. Pin the current strings first. Be-01's five refusal→status tables (`work-item.controller.ts:799, :493`, `step.controller.ts:14`, `project.controller.ts:123`, inline) become one. | `lib/wbs-api.ts:1839–1954`, `estimating-panel.tsx`, `wbs-table.tsx:294`, `chrome/app-fault.tsx`, `wbs/gantt-fault.tsx`; be-01 controllers | 1d     | ~250    |
| W3-7  | **One clock, one stamp** (ADR 0012's new cluster): a `Clock` collaborator with `stampFor(actorId)` built once in `services.ts`; the seven `private stampFor`, nine `this.now = opts.now ?? …` and six `this.newId = …` go; `event-sequencer.ts` (a pure pass-through that exists to inject a clock) deletes. Add one consequence line to ADR 0012 saying the stamp is still an argument at every store call — this does not weaken the ADR, and without the sentence it reads as re-litigating it.                                                                                                                                                                                                | 7 services, `services.ts`, `event-sequencer.ts`, `docs/adr/0012`                                                                          | 0.5d   | ~80     |
| W3-8  | **One deploy contract**: widen the `@wbs/tool-env` alias (which `deploy.ts:9` already imports — the "no `@wbs/*` entry point" comment justifying five duplications is false in the file that states it) into a small index exporting `Tier`, `Color`, `PORT`, `IMAGE_NAME`, `BUNDLE_FILES`, `sha256File`, `parseSha256sumOutput`, `assertCleanTree`. Give `install.ts` the `--env` flag it lacks — `deploy.ts`'s own error message today tells a dev operator to install into prod's root.                                                                                                                                                                                                        | `tools/tool-remote-scripts/src/lib/*`, `tools/tool-deploy/src/*`, `tool-dagger/src/lib/publish.ts`, `tool-smoke/src/health.ts`            | 1d     | ~200    |
| W3-9  | **One realtime envelope** (N6): `libs/contracts/src/ws.ts` becomes the single frame vocabulary (add `'unavailable'`, `presence`, `subscribe`, `unsubscribe`, `who`); gw-01 builds every outbound frame through it and parses inbound through `WsControlFrame`; `project-stream.ts`'s **rules** (backoff, `settle()`, the no-advance-on-frame seq rule) move into `libs/realtime` and the dead `reconnecting-ws.ts` seq handling that contradicts them goes, with `tanstack-adapter.ts` and `fixtures/frame.ts`. The stream must not learn about routes or the gate (ADR 0004).                                                                                                                    | `libs/realtime/**`, `libs/contracts/src/ws.ts`, `gw-01/ws.controller.ts`, `fe-01/src/lib/project-stream.ts`                               | 1.5d   | ~200    |
| W3-10 | **mcp-01 OAuth reuses `libs/auth`** (N8): its transaction store → `InMemoryOidcTransactionStore` extended with the PKCE payload (two intentional hardenings, each with a watched negative); extract `DynamicClientRegistry` and `LocalTokenIssuer` (injected keypair); `upstreamTokenFor` accepts the claims its caller passes. `oauth.test.ts`'s 24 capacity cases move to the registry's suite.                                                                                                                                                                                                                                                                                                 | `apps/mcp-01/src/oauth.ts`, `caller-auth.ts`, `libs/auth/src/oidc-store.ts`                                                               | 2d     | ~150    |
| W3-11 | **Small collapses**: `isUniqueViolation(err, index)` beside `isForeignKeyViolation` for the seven constraint-message literals (the `role`→`step` rename already broke one silently, `step.ts:28–40`) plus a test that every named index exists in the schema; `stepsOf` deleted from `ProjectRepository` (four callers hold a `StepStore`); `cleanName` ×2 → one; `descendsFrom`/`isWithin` → one; `emit-openapi-cli.ts:44–58`'s ten test doubles shared with `openapi-document.test.ts:20–34`; `forgetDraft`/`forgetNameDraft` → one; `ProjectApi extends DirectoryApi` deletes 13 delegation lines; the 17-field `tree` shape written twice in `wbs-api.ts`.                                    | as named                                                                                                                                  | 1d     | ~250    |

### Wave 4 — readability and DDD: knowledge lives with what it describes (≈ 18 days)

The structural moves. Each one turns a read set from "the file" into "the concept".

| Id   | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Files                                                                                                                                                     | Effort | Needs                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------- |
| W4-1 | **Rows out of the barrel** (audit D2, now 2,017 lines with 72 importers): each store's outcome types beside its implementation, as `event-log.ts:4–26` and `migrate-down.ts:14–26` already do; `index.ts` keeps exactly the store ports and the row types the service layer names. Nine exports have one consumer (seven their own file), five have none — delete those first as the deletion test.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `repository/index.ts`, every store                                                                                                                        | 2d     | W0-11                        |
| W4-2 | **Schedule engine into `libs/domain`** behind one `PlannedRow { id; parentId; priority }` and one `StepAssignment { workItemId; stepId; personId }`: `schedule.ts` reads three fields of `WorkItem`; `derive-numbers.ts` and `place-sibling.ts` import nothing; `assumed-assignee.ts` and `dependency.ts` ride along. `roll-up.ts` needs five named types; `directory-usage.ts` needs `DirectoryUsageRows` decomposed; `compensating.ts` stays — it is the journal. fe-01's Gantt gains an engine it can preview with. Add `@wbs/domain/schedule` subpaths; `schedule*.test.ts` (~3,800 lines) become library tests with no fixtures. Also `bumpedWorkItemOnReparent`'s predicate extracted from the SQL at `revision.ts:51` — the audit's named reason `undo.test.ts` wires twelve repositories — keeping the SQL as the writer.                                                                                   | `apps/be-01/src/service/{schedule,dependency,derive-numbers,place-sibling,assumed-assignee}.ts` → `libs/domain/src/`, `revision.ts`                       | 2d     | W4-1                         |
| W4-3 | **Command registry** (audit §4, sharpened): one descriptor `{ kind, schema, scope, parse, apply, describe }` per kind in `libs/contracts`; `PlanCommand`, `PLAN_COMMAND_KINDS`, `DIRECTORY_KINDS`, `VARIANTS`, `parseKind` (214 lines, 36 arms, the `…Ref` pairing hand-written 36 times), `applyAll` (381 lines) all derive. `compensating.COMMANDS` stays separate — 17 compensating kinds are a different vocabulary. ArkType `'+': 'reject'` replaces the hand parsers; verify Elysia 1.4's Standard Schema → JSON Schema export first. mcp-01 derives one tool per kind with glossary verbs and prose. A `runDirectory` that never enters the project arms replaces `projectId === ''` standing for "no project". One negative per kind on the production path, watched with `'+': 'reject'` removed.                                                                                                          | `libs/contracts/`, `plan-command.ts`, `plan-command-schema.ts`, `work-item.controller.ts:564–778`, `plan-commands.ts`, `apps/mcp-01/src/openapi-tools.ts` | 5d     | W3-4                         |
| W4-4 | **`WbsTable` concept split** into the fourteen modules sweep C maps with line ranges (`remembered-layout`, `use-plan-layout`, `use-column-set`, `use-plan-read`, `use-plan-filter`, `plan-toolbar`, `plan-export-actions`, `use-plan-keyboard`, `use-plan-structure`, `use-estimate-drafts`, `use-reference-sets`, `plan-columns/*` one file per column family with `columns` a 40-line registry, `plan-cell-props`, `plan-chart-input`), leaving ~1,000 lines of composition. Three things stay exactly as they are: `live` (the cells' contract), `PlanRow` and the pointed store, and the `columns` dep list — every extracted hook returns values read through `live`, never closed over in a cell. Give `live` an exported type so the "three deps" rule restated ten times becomes one declaration. Also: the 82-key `live` literal written twice (`:7070–7236`) becomes one local — 15 minutes, do it first. | `wbs-table.tsx`, 14 new modules                                                                                                                           | 4d     | W1-2, W2-2, W2-7, W3-2, W3-3 |
| W4-5 | **The four settings panels get their template**: one `SettingsSection` owning the two `onDirtyChange` effects, `busy`/`problem`, `attempt`, the refusal sentence with a 5xx arm, and reporter registration in `project-settings-modal.tsx:198`. Adding a fifth panel stops being "copy `estimating-panel.tsx` and remember five things".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `components/wbs/{estimating,priorities,steps,teams}-panel.tsx`, `project-settings-modal.tsx`                                                              | 1d     | W3-6                         |
| W4-6 | **`gantt-detail.ts`**: the detail switch's constant (`:628`), storage (`:663`), state (`:2332`), mark gates (`:3104, :3140, :3172`) and control (`:4204`) are 3,500 lines apart in `gantt-panel.tsx`; the same move for the other two gestures that span the file.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | `gantt-panel.tsx`                                                                                                                                         | 1d     | W3-2                         |
| W4-7 | **D7's nouns**: `WorkItemOutcome.result` → `value`, `BatchResult` → `BatchOutcome`, `ItemState` → `WorkItemState`, `AuthResult` → `AuthOutcome`; `ProjectApi`'s bare verbs → verb-object. Mechanical, `tsc`-driven, one PR, after W4-3 so the registry is born with the right names.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | be-01 services/controllers, `libs/domain/src/progress.ts`, `wbs-api.ts`                                                                                   | 0.5d   | W4-3                         |
| W4-8 | **`CONTEXT.md` catches up** (audit D4): Tag, Service, Work item type, External system, External ref, Solution ref, Progress, Saved view, Facet, Critical, Slack (one word — `schedule.ts` uses both `float` and `slack`), Write lock (`write-lock.ts` `{@link}`s a term that does not exist), Phase recorded as the retired reader word. Fix the `Service team` Avoid list that forbids "service", now a table, a route and an entity. Terms resolve in the design interview of whichever change first needs them, not batched.                                                                                                                                                                                                                                                                                                                                                                                     | `CONTEXT.md`                                                                                                                                              | —      | with each change             |
| W4-9 | **Module READMEs in mcp-01's shape** (≤40 lines: what, 4–6 files, the test command, the refusals, the landmines; examples that a test asserts): `libs/domain` first with the noun → module map (tags accumulate → `effective-tag.ts` ADR 0008; teams/services override → `effective-label.ts`; types do not inherit → nowhere, ADR 0009; dates → `workday.ts`; the charged figure → `estimate.ts` ADR 0011), then `apps/be-01/src/{repository,service}`, `apps/fe-01/src/components/wbs`, `tools/`. Replace the seven "generated with Nx" stubs.                                                                                                                                                                                                                                                                                                                                                                    | 10 `README.md`                                                                                                                                            | 1d     | W4-2                         |

### Not in this plan, on purpose

- **JSON-RPC envelope, Biome, oxlint, tsgo** — audit §7's verdicts stand; nothing changed.
- **Prettier direct instead of `nx format:check --all`** — withdrawn; re-measured at 17.7s vs
  18.9s on a different file set.
- **Memoising rows or cells in `WbsTable`** — refused by `pointed-row-render-cost`; the
  `live.current` architecture makes a `memo` silently stale on the first missed key.
- **Generalising `effective-tag`'s walk into one a type dimension could reuse** — ADR 0009's
  absence is load-bearing. `effective-tag.ts:215`'s O(depth²) rebuild is a real cost and a
  fix must keep the ADR 0008 order, provenance and per-tag `fromId` shape, and re-watch its
  five `Proof:`s; it is deferred until a plan deep enough to feel it exists.
- **The knowledge pipeline** (audit #1: `openspec/specs`, archive-as-ingest, doc lint, the
  `AGENTS.md` ledger out to a doc) — still right, still compounding rather than per-edit; it is
  its own change and the OpenSpec archive trap (`openspec/specs` absent, MODIFIED deltas
  refused) is the first thing it has to solve.

## 4 · Order and totals

| Wave | Days | What an agent gets when it lands                                                                           |
| ---- | ---- | ---------------------------------------------------------------------------------------------------------- |
| 0    | ~3   | `typecheck` compiles files; the gate reads the right inputs; six defects closed; the dead paths gone       |
| 1    | ~6   | a sub-second T0 in every project; `wbs-table` cases in four workers; a harness per app; e2e in ~5 min      |
| 2    | ~10  | a write is two requests and ~20 statements; a hover renders a card; the chart lays out on plan change only |
| 3    | ~12  | eleven rules stated once; ~3,700 LOC out; one envelope, one identity guard, one clock                      |
| 4    | ~18  | the read set for one concept is one module; the engine is a library; a command is one descriptor           |

Roughly fifty agent-days, in five PR-sized slices per wave. Waves 0 and 1 are the ones
whose absence has cost this repo the most — every entry in CLAUDE.md's ledger since
2026-08-09 was found by a browser, a screenshot, or running everything, because the gate
in front of it could not fail.

## 5 · Rules for agents that fall out of the review

Recorded here for `AGENTS.md`'s next edit, not added now.

- **A comment is a claim.** Three in be-01 assert facts the code no longer holds
  (`hand-parsed-body.ts:13`, `app.ts:181–192`, `directory.service.ts:653–657`) and one
  (`project.ts:373`) asserts the opposite of what its function does. Before building on a
  JSDoc sentence about _what calls this_ or _what this strips_, grep it.
- **`nx run <p>:typecheck` is a no-op for libs and tools until W0-1 lands.** The honest
  command is `bunx tsc --build <p>/tsconfig.json`.
- **A `.controller.ts` that registers no route, a `libs/*` with no importer, a `src/db/`
  the app does not use** — the tree carries dead signposts (N14). Check for an importer
  before editing what looks like the implementation.
- **The proofs are load-bearing and unindexed.** Dozens of `Proof:` comments name a test
  an edit must re-watch; there is no index from proof to test. Read the comment above the
  line before changing the line.
- **Cross-file contracts are `data-*` attributes and CSS variables found only by grep**
  (`data-modal-surface`, `data-grid`, `--cell-bg`, `data-plan-cards`). The writer never
  names the reader.

## Method

Six `Explore` sweeps on `main` @ `3346bb15`, each opening every non-test file in scope and
writing a per-file ledger (`file | LOC | role | reuse | performance | readability/DDD`)
with `file:line` anchors: A be-01 `repository/`; B be-01 `service/`, `controller/`, roots;
C the `WbsTable` cluster, section by section; D the rest of fe-01; E gw-01, mcp-01, every
lib; F tools, deploy, e2e, and the test infrastructure. Timings in §1 were measured by
sweep F on a Mac with the ESLint cache written to the scratchpad, never the repo. Claims
marked ✔ in §2 were re-checked by hand in the main session (grep or diff, output read);
the `startFloorByRow` render-body call, the eight-request `Promise.all`, the `<td>`
transition and the absence of `lazy()`/`manualChunks` were also confirmed by reading the
lines. Every other claim carries its sweep's `file:line` and was not independently re-read;
treat a ledger row as a lead with an address, not a verdict. Playwright and the fe-01
vitest suite were not run.

## 6 · Verify — W0-1, 2026-09-02

**What changed.** All 23 `typecheck` targets now run `bunx tsc --build --force <project>/tsconfig.json`.
Eighteen ran `tsc --noEmit -p` against a solution-style config (`"files": []`, `"include": []`,
`references` only), which loads the zero files the config names and exits 0; `libs/auth` already
built its lib project but checked its spec config separately, and was folded onto the same form so
every target reads one way.

The plan said to drop `--force` locally and keep it in CI. It is kept everywhere instead, matching
what be-01, gw-01, mcp-01 and fe-01 already do: `--force` is what makes a stale `.tsbuildinfo`
unable to produce a false green, which is the same failure class this item exists to close. Making
the local run incremental belongs with the test tiers in W1-4.

**The negative, watched twice.** With `const deliberatelyWrong: number = 'not a number'` appended
to `tools/tool-remote-scripts/src/swap.ts`:

| Command                                                                 | Result                                      |
| ----------------------------------------------------------------------- | ------------------------------------------- |
| `bunx tsc --noEmit -p tools/tool-remote-scripts/tsconfig.json` (before) | **exit 0 in 0.156s** — compiled nothing     |
| `bunx nx run tool-remote-scripts:typecheck` (after)                     | **exit 1**, `swap.ts(1035,7): error TS2322` |

And through the guard test: with that one `project.json` put back to the `-p` form,
`tools/tool-devsync/src/workspace-typecheck.test.ts` failed on
`Expected value to be empty · Received: [ "tool-remote-scripts" ]`. That test walks every
`project.json` on disk rather than trusting a list, so a project added with the wrong form fails
there. It is the mechanism that stops R5's most-repeated fault recurring a fourth time.

**What the honest check found — 12 latent type errors in 7 projects**, none of which any command
in the repo could see:

| Project                        | Error                                                                                                                                              | Fix                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `tool-compose` (2)             | `readdir(..., { recursive, withFileTypes })` and `Dirent.parentPath` absent                                                                        | `@types/node` bump; the `parentPath` casts are now provably needless |
| `tool-observability-stack` (2) | the same two, duplicated verbatim in a second tool                                                                                                 | same                                                                 |
| `tool-smoke` (3)               | `Uint8Array` is generic over its buffer since TS 5.7; `WebSocket` headers                                                                          | annotate the accumulator; one cast naming Bun's gap from the DOM lib |
| `tool-bootstrap` (3)           | `process.env.PATH` under `noPropertyAccessFromIndexSignature`; `getuid()`                                                                          | `env['PATH']`; `process.getuid?.()`                                  |
| `tool-deploy` (2)              | a test literal missing `layout`, required since the `--env` work                                                                                   | `layout: envLayout('dev')` — the import was already there            |
| `tool-devsync` (1)             | `pkg.scripts.dev` under the same rule                                                                                                              | `pkg.scripts['dev']`                                                 |
| `libs/realtime` (2)            | the cast `WsControlFrame & Record<string, unknown>` made every `in` check succeed and every property `unknown`, so the data arm was never narrowed | a predicate reading the values, not the keys                         |
| `libs/scripts` (1)             | `unknown[]` passed to Bun's `$`                                                                                                                    | `Bun.ShellExpression[]`                                              |

**`@types/node` 18.16.9 → 22.18.0.** `bun-types@1.3.13` asks for `*`; the exact pin was the repo's
own. Bun 1.3.14 implements the `readdir` recursion and `Dirent.parentPath` that Node 18's types
predate, so two tools carried casts to work around types that were lying about the runtime. The
bump removed 4 errors and introduced 1 (`libs/scripts`, fixed above); the four apps stayed green.

**One resolution bug the bump did not cover.** `tools/tool-compose/src/tmpl.d.ts` declared
`*.tmpl` as an ambient wildcard. A wildcard only types the programs that _include_ the file
declaring it, and `@wbs/tool-compose` is consumed through a path mapping — so `tool-remote-scripts`
compiled `index.ts` inside its own program, where the wildcard was invisible and both text imports
were `TS2307`. The wildcard is replaced by one declaration beside each template
(`site.caddy.tmpl.d.ts`, `tier.compose.tmpl.d.ts`), found by _resolution_, so every consumer gets
it. Note for later: a path mapping means a consumer recompiles the dependency's source rather than
reading its `.d.ts`. Real project references would fix that class outright and are worth a look
when W1-4 touches the same files.

**One suite is red, and it was red before this change.** `nx run-many -t test` passes 22 of 23
projects; `tool-bootstrap` reports **53 pass / 7 fail**, all in one parameterised family
(`is caught somewhere in the environment product when disconnected by …`), timing out against
that family's own 60s budget. Three checks place it:

| Run                                                            | Result                     |
| -------------------------------------------------------------- | -------------------------- |
| Whole workspace, `--parallel=4`, a lint pass running beside it | 53 pass / 7 fail, 1,032s   |
| `tool-bootstrap` alone, nothing else on the machine            | **53 pass / 7 fail, 965s** |
| The same family with the test file reverted to `HEAD`          | **0 pass / 2 fail, 525s**  |

53/7 is exactly the quiet-`main` baseline `docs/2026-08-30-agent-loop-audit.md:402` records, and
the family fails identically on `HEAD`'s own copy of the file — so it is pre-existing and nothing
in this change causes it. The three edits here (`process.env.PATH` → `process.env['PATH']` twice,
`process.getuid()` → `process.getuid?.()`) are type-level only and cannot alter what a spawned
shell does.

**A correction to that audit, though.** It attributed these failures to starvation — "60s timeouts
after 293s of wall clock: starvation, not code" — and said explicitly that its own quiet baseline
was not evidence of "what a serialised machine would print". This run is that evidence: alone, on
an otherwise idle machine, the suite still prints 53/7 and still times out (276.9s for one case).
Whatever these seven are, they are **not** contention. They are worth their own investigation and
are not in this plan.

**Commands run and green:** `nx run-many -t typecheck --skip-nx-cache` (23 projects),
`nx run-many -t test --skip-nx-cache` (22 of 23 — see above), `nx run-many -t lint` on the eight
touched projects, `nx format:check --all`. `bin/h2puni-gate.sh` was **not** run — it exits 127 on this Mac,
which is a recorded local limitation, and `build` needs `shellcheck`. Playwright was not run: no
file in this change reaches the browser.

**Still out of the gate, deliberately.** be-01, gw-01 and mcp-01 point at `tsconfig.lib.json`, so
their _spec_ projects are still unchecked — CLAUDE.md records the pre-existing errors there as
their own change, and this one did not widen that scope.

## 7 · Verify — W0-2, 2026-09-02

**What the sweep undercounted.** It named seven targets reading `bin/` and `deploy/compose/`.
Walking every `*.test.ts` for a `'../../../…'` literal found **nine reads across six projects**,
and the ninth is the one worth the paragraph: `libs/domain`'s
`every name it can answer is one the migration seeds` reads
`apps/be-01/drizzle/20260830020000_add_external_ref/migration.sql` to prove the domain's list and
the migration's seed are one fact. `libs/domain` does not depend on be-01 — the dependency runs the
other way — so that file was in no input of the task that reads it. An anti-drift check whose own
input is invisible to the thing deciding whether to run it is a check that cannot fail.

| Target                       | Declared now                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `tool-bootstrap:test`        | two `deploy/compose/` fragments the harness slices                                    |
| `tool-compose:test`          | `deploy/compose/**/*` (one candidate file, and a directory walk)                      |
| `tool-dagger:test`           | `bin/with-heavy-lock.sh`, `bin/heavy-lock-lib.sh`                                     |
| `tool-deploy:test`, `:build` | `bin/assert-no-prod-release.sh`                                                       |
| `tool-devsync:test`          | three `bin/dev-*.sh`, every `project.json`, and every `*.test.ts` the new guard scans |
| `tool-devsync:build`         | the four `bin/dev-*.sh` it shellchecks                                                |
| `domain:test`                | `apps/be-01/drizzle/*/migration.sql`                                                  |

**The fault, watched through Nx itself.** With `tool-devsync:test`'s `inputs` removed, warm the
cache, then append a line to `bin/dev-be-probe.sh`:

```
> nx run tool-devsync:test  [existing outputs match the cache, left as is]
```

Green, over a script no command read. With the declaration restored, the same edit runs the suite.

**The guard.** `tools/tool-devsync/src/workspace-targets.test.ts` (renamed from
`workspace-typecheck.test.ts`, which now holds both workspace-target rules) walks every suite,
resolves each `'../../../…'` literal, and fails on one no declared input covers. Watched failing
twice, once per project:

```
Received: [ "tool-devsync:test does not declare apps", "tool-devsync:test does not declare bin/dev-be-probe.sh", …
Received: [ "domain:test does not declare apps/be-01/drizzle/20260830020000_add_external_ref/migration.sql" ]
```

**Deviation from the plan: `--skip-nx-cache` stays in `bin/h2puni-gate.sh`.** The plan said to
delete it once the inputs were right. Two facts found while doing the work argue against:

- **CI never had the problem.** `.github/workflows/ci.yml:99` runs `nx run-many` _without_
  `--skip-nx-cache`, but there is no `actions/cache` for `.nx` and no Nx Cloud, so every CI run
  starts cold and every task actually runs. The hole was only ever the local loop — which is where
  an agent lives, so fixing it was still worth doing.
- **That gate is the release gate on the build box.** It is the last thing run before a prod
  deploy, and its whole value is that it trusts nothing. Correct inputs make the cache safe _as far
  as we know_; `--skip-nx-cache` is what makes the release gate safe when we are wrong about that.
  Belt and braces on one command, run once per release, is the right trade. Making the _inner_ loop
  fast is W1-4's job and has a different risk profile.

**Commands run and green:** `nx run-many -t test lint typecheck --skip-nx-cache` for
`tool-devsync`, `domain`, `tool-deploy`, `tool-compose`, `tool-dagger`; `nx format:check --all`;
`nx show project` for all six, confirming Nx parses the new inputs. `tool-bootstrap` was not
re-run — only its `project.json` changed, its suite takes 16 minutes, and it carries the
pre-existing 53/7 recorded in §6.

The new typecheck target earned its keep immediately: it caught `TS18046` in the guard test above
(`.filter` on a union that needs a type predicate), which the old `-p` form would have reported
green.

## 8 · Verify — W0-3, 2026-09-02

The `.derive()` is deleted. `apps/be-01/src/app.test.ts` is new and states the rule two ways, both
watched failing with the derive restored:

| Case                                                     | With the derive | Without |
| -------------------------------------------------------- | --------------- | ------- |
| `GET /health` carrying a valid session — authentications | 1               | **0**   |
| `GET /health` — `users.findById` calls                   | 1               | **0**   |
| `GET /api/projects` — authentications                    | 2               | **1**   |

The second row is the point and N1 understated it: a _read_ route resolved the caller **twice**,
because the derive ran and then the handler asked again. A write route paid three times, since the
write-scope pre-filter asks as well.

**The token has to be real, and the first draft's did not.** `authenticate(null)` returns at its
first line without a `jwtVerify` or a lookup, so a probe sent with no token — or with the
`undefined` the first draft produced by reading `session.token` where the outcome carries
`session.result.token` — leaves `lookedUp` at zero whatever the app does. The fixture registers and
signs in a real account, and the counters are reset after that setup so only the request under test
is measured. This is `estimate-triple-visible`'s "assert in the window the fault lives in" in its
other form: a check must be able to observe the cost it claims to remove.

The read-route case is what keeps this fixed. Deleting a derive is easy to undo by writing another;
"one resolution per request that needs one" is the rule that fails when someone does.

**Green:** `be-01` test (1263 pass, 0 fail, 92 files), lint, typecheck.

## 9 · Verify — W0-12, 2026-09-02

Two files named `.controller.ts` registered no route and exported only a body parser, which is
what made D6 look closed when it had only moved. Both are renamed with their test files, and every
reference rewritten:

| Was                           | Is                        |
| ----------------------------- | ------------------------- |
| `capacity.controller.ts`      | `capacity-body.ts`        |
| `priority-band.controller.ts` | `priority-ladder-body.ts` |

`grep '\.controller\.ts'` now returns the route table, which is the point: an agent looking for
where a route is registered stops finding two files that cannot register one.

**Three comments deleted or corrected, all of which named things that do not exist.** `app.ts`
carried three blocks explaining a registration order for `capacityController` and
`priorityBandController`; two described controllers retired into command kinds, and the third —
the only rule still true — is rewritten onto the route it is actually about. `history.controller.ts`
repeated the same two names and now states the rule in its own terms. Inside the renamed files,
`capacity-body.ts` said "this route writes one field" of something that is now the `setTeamCapacity`
command's payload, and `priority-ladder-body.ts` cited `capacityController`'s reasoning by a name
that has not existed for two releases. Every argument is preserved; only the referents are fixed.

**`middleware/validate.ts` is inlined into `smoke.controller.ts`.** It exported `validateBody` and
`HttpError` and had exactly one caller, while reading like the app's validation boundary — a seam
no route ever took, since every route carrying domain input hand-parses for the reason
`hand-parsed-body.ts` states. Deleting it concentrates nothing and removes a thing an agent adding
a route will reach for and find does not fit. The deletion test passes: `smoke.controller.ts` now
calls `parseOrThrow` and catches `ValidationError` directly, four lines shorter, and says in its own
doc why it is the only route shaped this way.

**Green:** `be-01` test (1263 pass, 0 fail), lint, typecheck. No behaviour changed; no test needed
editing, which is itself the check that these were names rather than code.

## 10 · Verify — W0-7, 2026-09-02

**The unreachability, established before anything was deleted.** `announceWorkItem` and
`announceTree` both return early when a collector is installed, so the narrow event ships only on a
direct, uncollected call. Every production path is collected:

- The ten mutators that call it (`patch`, `rename`, the four `setX`, the four `clearX`) are reached
  from exactly one non-test place, `plan-commands.ts`, in the `applyAll` at `:309–422`.
- `applyAll` runs inside `workItems.collect(...)` at `plan-commands.ts:138`.
- The other entry, undo and redo, runs inside `workItems.collect(step)` at `:190` — `walk`, which is
  what the two undo routes call.

So the publish branch could not be reached, and `withAncestors` computed a full schedule to keep one
ancestor chain from it that was then thrown away.

**The deletion test is the suite.** Deleting the branch and pointing the ten call sites at
`announceTree` left `be-01` at **1260 pass, 3 fail** — and all three failures assert the shape
production never sends:

```
(fail) clearing estimates > tells the project's subscribers, with the ancestors whose totals moved
(fail) what a project subscriber receives > sends a narrow patch when an estimate changes, …
(fail) what a project subscriber receives > sends a narrow patch when a name changes
```

They are rewritten rather than deleted, because their intent is right and only their claim was
stale: a figure edit and a name edit must still reach subscribers. They now assert the whole tree
arrives, ancestors included, which is what a peer actually receives. Four more files used
`work_items_changed` as an arbitrary sample payload and take `tree_replaced` instead; the two
variants carry identical fields, so those substitutions are exact.

**`broadcast.ts:7–13`'s rationale is rewritten from what is true now.** It argued at length for two
shapes because "a cell edit touches one work item and its ancestors' totals, and that is a small
patch worth computing". The command bus retired that: a write arrives in a batch, the batch
announces once after it commits, and a batch is any set of rows at all — so there is no per-row
change left to describe. The comment now says that, and says the narrow shape survived unreachable
for two releases, so the next reader does not restore it.

**Green:** `be-01` 1263 pass, `gw-01` 59 pass, `fe-01` 2046 pass across 66 files; lint and typecheck
on all three; `format:check --all`. fe-01 is in the list on purpose — it is the consumer of these
events, and a shape it still expected would have failed there rather than in be-01.

## 11 · Verify — W0-9, 2026-09-02

The rule is `stepIsInUse(held)` in `repository/step.ts`, beside the transaction that is
authoritative for it. Both callers ask it: the removal transaction, and `StepService.remove`'s gate,
which had been written as `estimates > 0 || assignments > 0` and so let a step holding only recorded
days, only progress, or only measures walk past.

**The obvious check for this could not fail, and the existing suite proves it.**
`carries the figures that are not days into the refusal it shows a person` sets two measures and
asserts the refusal — and it passes with the gate broken, because the transaction refuses one layer
down and returns its own usage. The _outcome is identical either way_. That is why the drift
survived, and it is why a test asserting the answer would have been a check that cannot fail.

What actually differs is whether a transaction opens at all, which is the gate's whole purpose: a
reader is asked to confirm before one does. The new cases count store calls, and each assertion was
injected separately because neither sees the other's fault:

| Injected fault                                                  | Which assertion fired | Observed                                       |
| --------------------------------------------------------------- | --------------------- | ---------------------------------------------- |
| `actuals` term dropped from `stepIsInUse`                       | the outcome           | `toMatchObject · - "ok": false · + "ok": true` |
| gate put back to `seen.estimates > 0 \|\| seen.assignments > 0` | the store-call count  | `Expected: 0 · Received: 1`, both cases        |

The first failure is louder than the drift was: now that both callers share the function, a missing
term deletes the step rather than merely letting it past the gate. That is the collapse working — a
rule with one home cannot be half-wrong any more.

The service imports `stepIsInUse` from `../repository/step` rather than through the barrel, which is
the direction W4-1 is heading and the shape `event-log.ts` and `migrate-down.ts` already use.

**Green:** `be-01` 1265 pass, 0 fail (two new cases), lint, typecheck.

## 12 · Verify — W0-8, 2026-09-02

**The leak was bigger than N7 said.** `defineConfig` hands `process.env` — the whole environment —
to `parseOrThrow`, whose message opened with `JSON.stringify(input)`. So one mistyped `LOG_LEVEL`
printed every secret be-01 or gw-01 holds. Both declare `INTERNAL_AUTH_SECRET` and
`JWT_SIGNING_KEY_CURRENT` in the same schema as that literal union.

**Stripping the echo is not enough, and this was measured rather than assumed.** ArkType's summary
is safe for a type mismatch and quotes what it got for a literal union or a regex:

| Constraint                      | Summary                                       |
| ------------------------------- | --------------------------------------------- |
| `PORT: 'number'` given a string | `PORT must be a number (was a string)` — safe |
| `MODE: "'dev'\|'prod'"`         | `MODE must be "dev" or "prod" (was "sekrit")` |
| a regex                         | `TOKEN must be matched by … (was "sekrit")`   |

And no field of an ArkType error is reliably safe but the path: `actual` is the value, and for a
literal union `expected` carries the whole message including it. The `cause` carries `data` too.

So there are two functions, and the split is the interface:

- **`parseOrThrow`** — for a caller's own data (HTTP bodies, wire frames). Keeps the summary,
  drops the input echo. A body was being repeated back into the log in full; now it is not.
- **`parseSecretsOrThrow`** — names the failing paths, nothing else, and passes no `cause`. It
  trades the reason for a guarantee, which is the right trade when the value _is_ the secret: the
  schema sits next to the caller and says what each key must be.

`defineConfig` uses the second. Watched failing twice, against a schema in the shape be-01 and
gw-01 actually declare:

| Injected fault                                      | Observed                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------- |
| `defineConfig` back on `parseOrThrow` with the echo | `Expected to not contain: "s3cret-signing-key-that-must-never-be-logged"` |
| the echo stripped, summary kept                     | `Expected to not contain: "verbose"`                                      |

The second injection is the one that matters: it is the fault a half-fix leaves behind, and the
case that catches it is a literal union because that is what a mistyped `LOG_LEVEL` is. The test
serialises the thrown error as well as its message, so a value surviving in `cause` fails too.

`apps/mcp-01/src/config.ts` refused `defineConfig` in writing over exactly this hazard. Its comment
is rewritten: the hazard is closed at the source, and what remains is its own narrower reason.

**Green:** `validation`, `config`, `be-01`, `gw-01`, `mcp-01`, `realtime`, `scripts` — test, lint,
typecheck.

## 13 · Verify — W0-11, 2026-09-02

Deleted, each with a clean deletion test — nothing outside itself referenced it, and removing it
concentrates no complexity anywhere:

| Gone                                                                   | Why it looked alive                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/be-01/src/repository/example.ts` + test + the `ExampleRepo` port | a store in the store folder, exported through the barrel                  |
| `apps/fe-01/src/db/config.ts` + test                                   | a directory called `db` holding a client-store design the app never built |
| `apps/fe-01/src/components/smoke/{d3-smoke,table-smoke}.tsx`           | framework tracers from the spike; the only `d3` importers                 |
| `libs/validation/src/branded.ts`                                       | `brandedString`, called by its own test only                              |
| `defineSchema`, `InferSchema` in `core.ts`                             | an identity function and an unused type, exported from the barrel         |
| `tools/tool-deploy/src/ssh.ts` + its test block                        | two builders whose only caller was that test                              |
| **`libs/scripts` entirely** (8 files, project, alias)                  | a `scope:shared` library with zero consumers                              |

`src/db/` is the one worth naming: a `DbConfig` with `mode: 'local' | 'server'`, a `wsUrl` and a
`getJwt`, which the app does not import. An agent asked about caching finds it before it finds that
there is no query library in the dependency list at all. That is what dead code that looks like
architecture costs, and it is why these go rather than sit behind a comment.

`tool-deploy/src/ssh.ts` is worse than unused. `buildSshInvocation` forces `user@host`, while
`deploy.ts` spawns `['ssh', host, …]` with no user at all and says why at `:282` — the ssh config
supplies it. Wiring the helper in would have broken the deploy; deleting it removes the trap.

**Two of N14's entries are not dead, and are kept.**

- **`libs/contracts/src/errors.ts`.** Its `ErrorCode` values are live — `gw-01`'s
  `ws.controller.ts` hand-writes `'invalid_payload'` and `'backend_unavailable'` as literals rather
  than importing them. That is an unused single source, not dead code, and wiring it up belongs to
  W3-9 with the rest of the socket vocabulary.
- **`tools/tool-dagger/src/{be-01,gw-01,fe-01}.ts`.** Reachable only through six Nx targets nothing
  else invokes — `bin/publish-release.sh` runs `main.ts`, not these. So the review's read is
  probably right. But they are release machinery, and CLAUDE.md requires an OpenSpec change for
  deploy safety. Left in place; it is its own change, not a line item in a cleanup.

`libs/validation/src/fixtures/` also stays: the review flagged `clock` and `frame` as dead, but
`makeTestDb` beside them has four be-01 consumers, so the module is live and only some exports are
in question.

**Green:** `validation`, `contracts`, `be-01`, `fe-01` (2043 tests), `gw-01`, `mcp-01`, `realtime`,
`tool-deploy`, `tool-devsync`, `tool-secrets` — test, lint, typecheck; `format:check --all`. The
workspace is 22 projects, from 23.

One thing the removal caught: `git rm -r libs/scripts` left the directory on disk, because an
untracked `coverage/` was in it — and `tool-devsync`'s `RESTART_PATHS coverage` failed on
`Expected to contain: "libs/scripts/project.json"`, reading the directory that still existed. The
test that walks the repo rather than trusting a list is what noticed.

## 14 · Verify — W0-10, 2026-09-02

Five sentences named things that do not exist. Each is corrected from the code rather than from
memory, and the two that carry a number are now checked or carry none.

| Sentence                    | Was                                                                                   | Is                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `hand-parsed-body.ts:13`    | "Eight routes … the six work-item writes, the capacity PUT and the priority-band PUT" | the two batch routes, plus a pointer to the test that reads the document |
| `plan-command-schema.ts:19` | `The step (step) this figure belongs to.`                                             | `The step this figure belongs to.`                                       |
| `openapi-tools.ts:199`      | "40 of be-01's 51 operations"                                                         | no count at all — see below                                              |
| `apps/mcp-01/README.md:15`  | "Twenty tools in all"                                                                 | "22 tools in all", asserted                                              |
| `LLM_README.md:17`          | table `role`                                                                          | table `step`                                                             |

**The counts were measured, not guessed.** The committed document holds **30** operations, **27** of
them without prose. The comment claimed 40 of 51 — wrong in both numbers, and describing an API two
renames ago. It carries no figure now, and says why: a number nothing checks is a number that goes
stale, and it was never the point of the sentence.

**`plan-command-schema.ts` was the costly one.** That string is the description an MCP client shows
a model for every one of the twelve step-carrying command kinds, and `(step)` is what the
`role → step` rename left where `(phase)` had been. `apps/be-01/openapi.json` is regenerated, since
it is committed and diffed against the app.

**The README's count is a test now.** `openapi-tools.test.ts` already asserted the tool names
against the derived list — which is why that README is the repo's good example — and the _count_
sat unchecked beside them at "Twenty" while this file asserted 22. Two tools could be added and the
sentence stay put. Watched failing two ways:

| Injected fault        | Observed                                           |
| --------------------- | -------------------------------------------------- |
| "Twenty tools in all" | `expect(received).not.toBeNull() · Received: null` |
| "20 tools in all"     | `Expected: 22 · Received: 20`                      |

The first failure is the interesting one: writing the number as a word is itself the drift, because
it takes the claim out of reach of anything that could check it.

**Green:** `be-01`, `mcp-01` — test, lint, typecheck; `format:check --all`.

## 15 · Verify — W0-5, 2026-09-02

**The leak was measured before it was fixed.** A throwaway probe against real SQLite compared the
keys a project goes in with to the keys it comes back with:

```
CREATE KEYS: createdAt,depReach,estimateMethod,estimateRounding,id,name,ownerId,
             pertWeights,restricted,revision,solutionRef,startDate
READ   KEYS: …same… + createdBy + updatedAt
```

`createdBy` is a user id, and `GET /api/projects/{id}` and `PATCH /api/projects/{id}` return that
row with no response schema, so both were on the wire. ADR 0012 says the audit columns are recorded
and not published; this is what made that true.

Three reads are fixed, and the third is a reuse win:

| Read                     | Was                              | Is                                           |
| ------------------------ | -------------------------------- | -------------------------------------------- |
| `project.ts` `toProject` | `...rest` spread the whole row   | `withoutAuditColumns(rest)`                  |
| `work-item.ts:547`       | a bare `.returning()`            | `.returning(WORK_ITEM_COLUMNS)`              |
| `directory.ts:127`       | a bare `select().from(workItem)` | `.select(WORK_ITEM_COLUMNS)` — the same list |

`WORK_ITEM_COLUMNS` is exported now and has two readers instead of one, which is what the folder's
convention wanted all along: the declared return type checks the projection is complete, and there
is one list to keep complete.

`toProject` is the read that could not name its columns — it is generic over the row it maps — so
`withoutAuditColumns` in `audit.ts` states the drop instead, beside the helpers that write those
columns. It rebuilds the object rather than copying and deleting, because a computed-key `delete` is
banned here and because building the answer states what it publishes.

**Two things the fix ran into, both worth knowing.** ESLint here does not set `ignoreRestSiblings`,
so the tidy "destructure the unwanted keys into `_`-prefixed names" idiom is an error — hence the
helper. And TypeScript will not prove `Omit<Omit<T, A>, B>` equals `Omit<T, A | B>` for a generic
`T`, so the declared return type is nested exactly as the body produces it, with a comment saying
why.

**The negative.** `project.test.ts` gains `carries the columns the Project type declares and no
others`, asserted against the created row's own keys rather than a second hand-written list — so a
column added to `Project` is not a column the test forgets. With `withoutAuditColumns(rest)` put
back to `...rest`, watched failing on `expect(received).toEqual(expected) · + "createdBy" ·

- "updatedAt"`.

The JSDoc on `stepsOf` cited `toProject` as the reason the audit columns could not reach a `Step`.
It was wrong about the mapper for as long as those columns have existed; it now says so, and says
what the mapper does today.

**Green:** `be-01` 1264 pass, 0 fail; lint; typecheck; `format:check --all`.

## 16 · Verify — W0-4, 2026-09-02

**The drift, measured.** A freshly migrated database holds 28 indexes; `schema.ts` declared 25. The
three it did not know about are `actual_by_step`, `step_progress_by_step` and
`step_measure_by_step`, created under their new names by `20260831120000_rename_role_to_step` and
never written back. Three reads in `step.ts` name them in comments as the reason they are fast, and
`drizzle-kit generate` diffs against `schema.ts` — so the next generate would have dropped all
three.

**The four new indexes were chosen from query plans, not from guesses.** `EXPLAIN QUERY PLAN` on a
migrated database, before the migration:

| Clause                           | Plan                                                               |
| -------------------------------- | ------------------------------------------------------------------ |
| `assignment` by `person_id`      | `SCAN assignment`                                                  |
| `assignment` by `step_id`        | `SCAN assignment`                                                  |
| `estimate` by `step_id`          | `SCAN estimate`                                                    |
| `dependency` by `successor_id`   | `SCAN dependency`                                                  |
| `dependency` by `predecessor_id` | `SEARCH … USING INDEX dependency_pair` — the control               |
| `assignment` by `work_item_id`   | `SEARCH … USING INDEX sqlite_autoindex_assignment_1` — the control |

The two controls matter: they say the read is the problem rather than the table. `step_id` and
`person_id` are not prefixes of their primary keys, and `dependency_pair` is
`(predecessor_id, successor_id)`, so it answers one direction and not the one a subtree delete uses
once per work item. `work_item(service_team_id)` was on the review's list and is **not** added — the
column is marked for removal, and indexing a dying column buys a plan for one release.

`20260902120000_add_lookup_indexes` is additive (`CREATE INDEX` only, so both colours run against
one file through a swap) and ships its `down.sql`. The migration lint passes; `nx run be-01:build`,
which runs it, is green.

**Adding a migration means four ledgers, and they do not all run the same way.** Fifteen descending
lists in `migrate.test.ts`, three in each of `migrate-down.test.ts` and `identity-migration.test.ts`,
one in `project.test.ts` — plus **three ascending** lists in `migrate-down.test.ts`
(`readMigrationFolders` and `appliedNames` answer oldest-first). Two more assertions were hard-coded
against "which migration is newest" and "how many exist", and each is now derived:

- `does nothing when the target is already the newest applied` read the newest off disk instead of
  naming `AUDIT_COLUMNS`. It had named the role → step rename before that.
- `locks OIDC-only accounts during downgrade…` counted `migrations: 34`, with a comment saying the
  figure moves with every migration. It counts `readMigrationFolders(FOLDER).length` now. What it
  asserts is that a re-apply leaves the ledger complete rather than short, and a literal states that
  badly.

**The guard.** `schema-indexes.test.ts` diffs every index `schema.ts` declares against every index a
migrated database holds. Watched failing on exactly the 2026-09-02 state — with
`index('actual_by_step')` taken back out, `expect(received).toEqual(expected) · - "actual_by_step"`.
It carries a second case asserting the declared list is over twenty names and contains a known one,
because two empty lists are equal and a `getTableConfig` that threw for every export would make both
sides empty for the same wrong reason.

**Green:** `be-01` 1266 pass, 0 fail; lint; typecheck; build (the migration lint); `format --all`.

## 17 · Verify — W0-6, 2026-09-02

`PlanCommandRunner` states the rule: the lock covers the transaction and nothing after it, because a
push to gw-01 is a network call and `PushClient` retries a failing one for about a minute. Three
services it calls broke that rule from inside `applyAll` — `CapacityService.set`,
`PriorityBandService.set`, and `DirectoryService.announce` once per touched project, in sequence.

It was unsound as well as slow. Under ADR 0007 a batch runs in one outer transaction, so those
event-log inserts were savepoints inside it: a command refused at step nine rolled back the recorded
events for pushes that had already left the process.

**The fix is one mechanism instead of four conventions.** `DeferringBroadcaster` wraps the real
broadcaster; `buildServices` constructs it once and every service publishes through it, so there is
exactly one broadcaster object in the process and a batch cannot hold one while a service publishes
through another. The runner holds it for the length of the transaction and drains after the commit
_and_ after the lock — or drops the queue when it rolls back. Announcements carrying nothing but a
`type` are deduplicated, which turns forty `directory_changed` for one tag rename into one per
project.

**The hold sits inside `lock.run`, not around it, and an existing test found that.** `execute` runs
concurrently for every queued batch; only the lock makes one-at-a-time true. Held around the lock, a
second batch opened a hold while the first still waited for it:

```
error: a batch is already holding announcements
```

**An order-sensitive test had to be made deterministic first.** `lets go of the write lock before
the broadcast leaves` identified the held batch by counting pushes — `pushes === 1` — so it depended
on how many microtask turns each batch took to reach its announce. Adding one `await` between the
lock and the broadcast silently swapped which batch was held, and the test failed while proving
nothing about the lock. It now drives the held batch through its own runner, so the subject is fixed
by construction. Re-watched against its original fault, `announceTreeNow` moved back inside
`lock.run`: `this test timed out after 5000ms`.

**The new negative did not exist and is the point of the change.** `holds a directory command's
announcement until the lock is let go` renames a tag that is **on** a work item — a tag nobody uses
touches no project, queues nothing, and would pass whatever the runner did — and asserts a plan
batch gets through while that directory push is held open. Watched failing with `DirectoryService`
given the raw broadcaster, which is the shape that shipped: `this test timed out after 5000ms`.

`directory.service.ts`'s doc argued the opposite of what happened: "`recordEvent` opens a
transaction of its own, so it cannot be nested inside the write's". True of a directory route, false
of every directory command in a batch. It now says both, and says which one the code does.

**Green:** `be-01` 1267 pass, `gw-01` 59, `mcp-01` 106 — test, lint, typecheck, build;
`format:check --all`.

## 18 · Verify — W1-1 (first half), 2026-09-02

`apps/fe-01/src/testing/fake-project-api.ts` exists, holding the 674-line fake that lived inside
`wbs-table.test.tsx`. It is moved, not rewritten: it is a **model** of be-01's answers — it
renumbers on every write, accumulates tags down the tree, resolves assumed assignees, and refuses
what be-01 refuses — and that is why it is the one worth sharing.

**Moving it into `src/` put it inside `tsconfig.app.json`, and a compiler read it for the first
time.** A spec project is outside fe-01's typecheck target, so a fake could stop satisfying
`ProjectApi` and nothing would say so. It had, in eleven places:

| Divergence                                                                                                                                         | Count |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `ProjectApi` methods absent outright — `addWorkItemType`, `renameTag`, `removeTag`, `setEstimateArithmetic`, `setTeamCapacity`, `setPriorityBands` | 6     |
| required wire fields missing — `ProjectListEntry.startDate`, `SliceView.capacityTeamId`, `PersonView.kind`, `WorkItemView.dates`                   | 4     |
| a duplicated object key (`startNoEarlierThanReason`)                                                                                               | 1     |

The duplicate is the one to remember. The fixture carried a comment saying _"A duplicate `teamIds`
sat here until 2026-08-18 — harmless, and only because nothing typechecks this file"_ — and had
since re-acquired the same fault on a different key. A file that documents its own blind spot still
has the blind spot.

**Three tests were asserting a person be-01 never sends.** Adding `kind` to the fixture broke
`expected [ Array(1) ] to deeply equal [ Array(1) ]` in three cases whose literal person object had
no `kind`. Those assertions described the fake rather than the wire, and are corrected.

`listWorkItemTypes` answered a fresh `[]`, so a type added through the API vanished on the next
read. It reads a directory now, like tags and services.

**Green:** `fe-01` 2043 tests across 65 files, lint, typecheck; `format:check --all`. The one lint
warning in `wbs-table.tsx:4583` is pre-existing.

**Still open in W1-1:** the other six fakes (`gantt-panel`, `plan-cards`, `project-page`,
`wbs-api`, `page-shortcuts`, `app-router`) are not migrated. They are not copies of this one — they
have different signatures for different needs (`fakeApi(startDate, skew)`,
`fakeApi({refusePatch, dated})`) — so folding them in is a design job rather than a move, and the
two trivial ones may be right to leave alone. The recorded call log subsuming the eight `watchX`
wrappers is also still to do. What is done is the precondition for W1-2: the split files can import
one fixture instead of inheriting eleven copies of it.

## 19 · Verify — W1-5, 2026-09-02

All 22 projects gained `lint:fast`: the same rules and the same files, with
`--cache --cache-location .nx/eslintcache-<project>`. `lint` is untouched and stays uncached,
because a type change in one project can stale another's `no-unsafe-*` verdict and no gate may trust
that. Measured on be-01, through Nx:

| Command                        | One file changed |
| ------------------------------ | ---------------- |
| `nx run be-01:lint` (the gate) | 15.1s            |
| `nx run be-01:lint:fast`       | **4.1s**         |

**The plan's lefthook half is withdrawn, and it is worth saying why.** The proposal was to cache the
pre-commit lint too. Measured on a realistic staged set:

| Run                                 | Time  |
| ----------------------------------- | ----- |
| no cache, as lefthook runs today    | 2.93s |
| cached, nothing changed             | 1.20s |
| cached, **one staged file changed** | 2.72s |

The third row is the only one that happens. A pre-commit hook lints the staged files, and staged
files are by definition the ones that changed, so the cache misses on every one of them. The win is
0.2s and it is noise. The gain is entirely in the _whole-project_ case, where an agent re-lints
several hundred unchanged files to check the handful it touched — which is the inner loop this wave
is about.

**The cache does not hide a real error.** With `const unusedOnPurpose = 1;` appended to
`services.ts` and the cache warm, `nx run be-01:lint:fast` failed on
`233:7 error 'unusedOnPurpose' is assigned a value but never used`, and went green with it removed.
A fast lint that could not fail would be worse than no fast lint.

`LLM_README.md` names it as the inner-loop command and says `lint` is the gate. Getting it back
under its 150-line cap turned up one more stale figure that W0-10 missed: the index still described
mcp-01's README as "20 tools", the number that file no longer claims. It names no count now.

**Green:** `lint:fast` across all 22 projects; `lint` on be-01 and fe-01 unchanged;
`format:check --all`; `doc-caps`.

## 20 · Verify — W1-3 (started), 2026-09-02

`apps/be-01/src/testing/harness.ts` exports `inMemoryServices(overrides?)`, returning the
`WorkItemService`, **its stores**, and the recording broadcaster.

Handing the stores back is the whole difference from `testWorkItemService()`, which composed the
same graph and then discarded them — which is exactly why twenty-four files re-derived it by hand
instead of using it. A suite that seeds a plan or asserts on a row needs the store.

The graph is thirteen ports with three wiring rules that are easy to get subtly wrong, and the
harness is now the one place that knows them: the work-item store takes the **directory** so labels
resolve, the four satellite stores take the **work-item store** so figures follow a row through a
move, and `inMemorySubtrees` takes **all seven** because a subtree write touches every table at
once. `undo.test.ts:122` is what happens without one place that knows this — it passed a real
`SubtreeRepository(db)` into an otherwise in-memory graph, so one store spoke to SQLite while the
rest spoke to a Map.

Seven suites migrated, and `testWorkItemService()` now delegates rather than duplicating:

| File                                                                                                                                                    | Lines            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `estimate.test.ts`                                                                                                                                      | −38              |
| `actual.test.ts`                                                                                                                                        | −45              |
| `measure.test.ts`, `progress.test.ts`, `freeze.test.ts`, `broadcast.test.ts`, `plan-history.test.ts`, `review-findings.test.ts`, `work-item-fixture.ts` | the rest of −335 |

**Every one of them was wiring stores it never read.** `estimate.test.ts` declared and constructed
five it never touched; the others the same. That is what a hand-derived graph costs: nobody trims
it, because trimming means understanding the wiring again.

Overrides carry the real variation. Four suites wrap the command journal to keep the plan's history
rows where a case can read them, and pass `inMemoryServices({ journal })`; everything else is built
by the harness.

**Green:** `be-01` 1267 pass, 0 fail across 92 files; lint; typecheck; `format:check --all`.

**Still open:** seventeen files still build the graph by hand. Two of them — `tag-empty-diff` and
`service-empty-diff` — are T1 suites over real repositories and this harness does not apply; the
rest are in-memory and should follow. `undo.test.ts` is the one worth doing next, since it is the
file the audit named and the one with the leaked real repository.

## 21 · Verify — W1-3 finished, and two corrections, 2026-09-02

Every remaining in-memory suite is migrated: `live-plan-identity`, `work-item.service`,
`project.controller` and `work-item.controller`. Inside `work-item.service.test.ts`, three cases
built a second service to drive a store that fails on purpose — a rejecting `dependencies`, a
`projects` that answers differently on the second read, a short priority ladder. Two of them
re-derived the whole graph to change one port; all three are now
`new WorkItemService({ ...serviceOptions, <the one store> })`, which says what the case is about.

Around 500 lines are gone across fourteen files, and `be-01` holds at 1267 passing.

**Correction 1 — the audit's "24 test files hand-build `WorkItemService`" is misleading, and I
repeated it.** Counting real repositories per file: **twelve of the sixteen** remaining were
SQLite-backed suites wiring real repositories on purpose. An in-memory harness is the wrong tool for
those, and the honest figure for this item was never 24. What they want is a _T1_ harness over a
real `Drizzle` — which `buildServices()` nearly is, and which is a separate piece of work.

**Correction 2 — `undo.test.ts:122` does not leak a real repository into an in-memory graph.** The
review said it did, I put that in the harness's own JSDoc, and it is false. That suite wires real
repositories throughout and takes in-memory fixtures for exactly two ports, `capacity` and
`priorityBands`, which its cases never drive. It is a coherent T1 suite. The JSDoc now says so,
because a comment that cites a false example is worse than one that cites none — the next reader
would have gone looking for a bug that is not there.

The wiring rules the harness exists to hold are still real, and are stated without the false
example: get one wrong and nothing says so — the graph still constructs, the suite still runs, and
a label or a figure is simply never there to assert on.

**Green:** `be-01` 1267 pass, 0 fail; lint; typecheck; `format:check --all`.

## 22 · Verify — W1-2, 2026-09-02

`wbs-table.test.tsx` — 16,164 lines, 62 top-level `describe` blocks, 585 cases, run serially — is
eleven files named for what they are about: `plan-table`, `plan-structure`, `plan-cells`,
`plan-estimates`, `plan-keyboard`, `plan-dependencies`, `plan-chart-seam`, `plan-layout`,
`plan-filter`, `plan-toolbar`, `plan-read-and-write`.

| Measure             | Before | After   |
| ------------------- | ------ | ------- |
| whole `fe-01` suite | ~180s  | **69s** |
| test files          | 65     | 75      |
| tests               | 2043   | 2043    |

Zero production change, and all 585 cases still run — counted, not assumed.

**Three attempts, and the two failures are the point.**

The first split took "the header" to be everything above the first `describe`. It is not:
thirteen module-scope helpers, `rowFor` among them, are declared **between** describes, around line
5,070. Files that needed them got a `ReferenceError`.

The second pruned unused declarations with a regex for "a `const` up to a line starting `};`". Test
sources are full of brackets inside strings, so that regex ran past a declaration's end and ate
whole `describe` blocks — 8 of 62 vanished, and the only reason it was caught is that the counts
were checked after every step.

What worked: split on **top-level statement starts** rather than bracket counting, share every
module-scope statement with every file, then remove unused declarations **one at a time, located by
ESLint's own line numbers**, re-parsing after each removal and reverting any that breaks the file.
Slow — one ESLint run per removal — and it cannot eat a block it cannot see.

**Two couplings the split had to honour.** `keyboard-cheat-sheet.test.tsx` reads the behaviour
tests' _source text_ to prove every chord on the cheat sheet has a test, and it read
`wbs-table.test.tsx` by name; it names the eleven now, individually rather than by glob, for the
reason its own comment gives — a file that moves must throw, and a glob would quietly read ten of
eleven. And `POPOVER_ROW_LAYER` was pruned from `plan-cells` while still used in a case body; the
compiler named it (`TS2304`), which is the check that says a split lost something.

**Green:** `fe-01` 2043 pass across 75 files, lint, typecheck, build; `format:check --all`.

## 23 · Verify — W1-4 (be-01's half), 2026-09-02

be-01's 93 suites are two tiers, decided by a suffix. 43 suites that open SQLite became
`*.db.test.ts`; the rest keep `*.test.ts`.

| Target              | Suites | Tests | Time      |
| ------------------- | ------ | ----- | --------- |
| `be-01:test:unit`   | 51     | 662   | **12.7s** |
| `be-01:test:store`  | 42     | 607   | 43.3s     |
| `be-01:test` (both) | 93     | 1269  | 56.0s     |

662 + 607 = 1269 and 51 + 42 = 93, so the two tiers **partition** the suite rather than
overlapping or dropping anything. That arithmetic is the check that the split is honest.

An agent editing a service now has a 12.7s answer instead of a 56s one. Not the audit's "< 3s"
target, and it is worth saying why: bun spends roughly 0.25s starting each of the 49 files, so 12s
is close to the floor for this many files under this runner. Opening SQLite is what the tier
actually removes — `mkdtemp` plus a migration run is about 0.7s a file.

**The guard is `src/test-tiers.test.ts`**, which walks the directory rather than trusting a list: a
suite is named `.db.test.ts` when it opens a database and only then. Watched failing on
`Received: [ "repository/db.test.ts opens a database and is not named .db.test.ts" ]`.

**It caught its own first draft.** The detector originally counted `mkdtemp` as evidence of a
database, and on that evidence 43 files were renamed — including `deployed-commit.test.ts`, which
makes a temp directory to write a `HEAD` file into and never touches SQLite. The guard reported it
immediately (`is named .db.test.ts and opens no database`), the rule narrowed to the three real
openers, and that file is back in the fast tier. The check also matched _itself_, because it quotes
the opener names in its own regex; it excludes itself now, and says so.

**Green:** `be-01` 1269 pass across 93 files, lint, typecheck; `format:check --all`.

**Still open in W1-4:** fe-01's `vitest` `projects` so its pure suites run without jsdom, a root
`test:unit`, and lefthook running it. The eleven-file split from W1-2 is what makes fe-01's half
worth doing.

### 23.1 · The rest of W1-4, and two deviations

`bun run test:unit` is the inner-loop command: be-01's fast tier plus every lib, **17.2s** for 815
tests. `LLM_README.md` names it. fe-01 is deliberately **not** in it — a 69s jsdom suite is not a
fast tier, and putting it there would make this the command people stop running.

**Deviation 1 — fe-01's `vitest` `projects` is not done, and the reason is a measurement.** 18 of
its 73 suites import no DOM, and 16 of those run under `--environment node` in **1.8s** for 359
tests. The other two (`api.test.ts`, `project-stream.test.ts`) need `WebSocket` and `window`
despite touching no component. So the tier is real and worth having — but selecting it needs the
`*.dom.test.tsx` suffix across **55** files, which is the same class of mechanical rename that took
three attempts in W1-2. It is a change of its own, not a tail end of this one.

**Deviation 2 — lefthook does not run `test:unit`.** The plan said it should. Measured, the hook
currently costs about 7s (lint and format on staged files) and this would add 17s to every commit.
CLAUDE.md already records that lefthook is the bypassable half and CI is the gate, so the trade is
17s on every commit against a check the agent should be running before it commits anyway. Left out
on purpose rather than by omission.

**Green:** `bun run test:unit` 815 pass; `format:check --all`; `doc-caps`.

## 24 · Verify — W1-6 investigated, and the first of W2-12, 2026-09-02

**W1-6 is not done, and the reason is what the specs actually contain.** Seven `seedPlan`
functions exist, but they are not seven copies of one thing: each builds a different fixture — two
rows with long names for the wrap case, none at all for the mobile dialog case, a ramp of
priorities. What they genuinely share is a **three-line preamble** (`goto('/')`, wait for the
account button, `createProject`), and `createProject` is already a shared helper. So the reported
"`seedPlan` ×6" overstates it: extracting the preamble is worth about eighteen lines.

The plan's larger idea — seed through the API instead of the UI — conflicts with at least one
spec's stated intent: `layout.spec.ts` says in its own words that it must not be seeded behind the
table's back. That is a per-spec decision, not a sweep-wide substitution.

And `workers: 4` needs a measured proof that four writers against one SQLite file behave, which is
a 15-minute browser run per attempt. Chromium is installed here and the run is possible; it is not
something to assert without having done it. Left for its own change, with the finding recorded so
the next reader does not start from the overstated figure.

**Three of W2-12's cheap wins are done**, each verified by the tiers this wave built:

- **`push-client.ts`** serialised the payload **inside** the retry loop. The dominant payload is
  `tree_replaced` carrying a whole plan, and the loop runs up to six times over about a minute when
  gw-01 is down — so an unreachable gateway made be-01 re-serialise every row of the project six
  times. Once per push now.
- **`login-throttle.ts`** walked its whole map on **every** `canAttempt` and every `recordFailure` —
  up to 10,000 iterations per login attempt, so under the load the class exists to survive, the
  throttle was itself the O(n) cost. It prunes the two keys the attempt touches, plus one older
  entry when the map is full, which drains faster than attempts can arrive while it is full.
  `canAttempt` still refuses at the ceiling, so the bound holds whatever this drops.
- **`nameOf`** was `entries.find(...)` in **both** exporters, called per cell of every row: naming
  the steps and the people in a plan was O(rows × entries), twice over, in two copies that had to
  agree about what an unknown id reads as. One copy now, in `plan-export.ts`, indexing each list
  once in a `WeakMap` keyed by the list itself — so the callers keep reading
  `nameOf(plan.people, id)` and the index is built once per export. `UNKNOWN_NAME` stops being
  duplicated with it.

**Green:** `be-01` 1269 pass across 93 files, `fe-01` 2043 pass across 75; lint and typecheck on
both; `format:check --all`.
