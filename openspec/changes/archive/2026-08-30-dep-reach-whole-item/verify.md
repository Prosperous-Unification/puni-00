# verify — `dep-reach-whole-item`

Implemented 2026-08-29/30 on `feat/dep-reach-whole-item`, rebased onto
`origin/main` at `b8259d9`.

## What this change is expected to move

Every existing project's dates, wherever a dependency's predecessor has more
than one estimated step. That is the intent, not a regression, and the evidence
for it is the identity section below rather than a green suite.

## Ordering against `project-config-modal`

`tasks.md` 0.1 queued this change behind `project-config-modal`, whose stated
cost of running first is "a fourth toolbar dialog that change then deletes". It
was run first anyway, because the reach's UI adds **no** dialog: it is a
section inside the existing `PhasesDialog`, which is the steps surface
`project-config-modal` slice 1.3 extracts wholesale into `StepsPanel`. The
toolbar gains no control — the only edit to `toolbarControls` is two props on
the `<PhasesDialog>` already mounted there. `project-config-modal` is
unimplemented on `main`; the two meet as a mechanical merge in one file.

## Identity, re-derived

| Fixture                                                         | Reach          | Before             | After               | Moved   |
| --------------------------------------------------------------- | -------------- | ------------------ | ------------------- | ------- |
| 1000 seeded two-role plans, **no** dependencies                 | both           | oracle             | oracle, bit for bit | no      |
| 1000 seeded three-role plans, **no** dependencies               | both           | oracle             | oracle, bit for bit | no      |
| 1000 seeded **single-step** plans, edges and all                | both           | oracle             | oracle, bit for bit | no      |
| 1000 seeded two-role plans **with** edges                       | `anchor-slice` | August figures     | unchanged           | no      |
| 1000 seeded two-role plans **with** edges                       | `whole-item`   | August figures     | later starts        | **yes** |
| `schedule-priority.test.ts`'s pinned contention plan            | default        | August's re-derive | the `94ed488` pin   | **yes** |
| `schedule-benchmark.test.ts`'s 220-row plan, `waitingForPerson` | default        | 175                | 159                 | **yes** |

The last two are worth reading as evidence rather than bookkeeping. Both were
**re-derived** at `dep-waits-on-first-role` and both are now back to the exact
figures the engine gave before 2026-08-11 — 159 was that fixture's pre-August
`waitingForPerson`, and the three moved slices in the priority pin are back at
`c-a/role-qa` 7→8 `roleOrder`, `c-c/role-dev` 8→10.5, `c-p1/role-qa` float 3.5.
Neither was aimed at; both fell out of the default.

`existing plans move to the whole-item rule` is the corpus form of the same
claim, and it asserts the direction as well as the movement: under `whole-item`
a row may only ever start **later** than it did under `anchor-slice`, never
earlier, over all 1000 plans.

## Deviations from `tasks.md`

- **2.1/2.3's engine tests live in `schedule-shapes.test.ts`, not
  `schedule.test.ts`.** `schedule.test.ts`'s fixtures are single-role, where a
  reach decides nothing; the multi-role helpers and every existing anchor-rule
  fixture are in `schedule-shapes.test.ts`. The scenario names are the spec's.
  `schedule.test.ts` keeps one pair — `waits for the whole predecessor by
default` and the `anchor-slice` case beside it.
- **2.3's per-project negative is at the service, not the engine.** The engine
  case (`two plans in one run keep their own reaches`) catches a memo inside
  `reachedSliceOf`; the fault the task names — the read hoisted out of the run —
  lives in `work-item.service.ts`, so the negative was injected there.
- **The migration is stamped `20260830120000`, not `20260829120000`.** It was
  written before `work_item_type` and `external_ref` landed on `main`; a stamp
  sorting **before** an already-applied migration applies out of order on every
  database that took that release.
- **The ADR is 0010.** 0008 and 0009 were both taken while this branch was open.
- **The `Start` column's "Waits for …" sentence is keyed on the reach too.**
  Not in `tasks.md`, but it is resolved through the same walk as the arrow, and
  leaving it on the anchor would print a confident sentence naming a step the
  engine did not wait for — D4's own failure, one surface along.

## Commands

| Command                                                                                         | Result                                                      |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `bun test src/` in `apps/be-01`                                                                 | 1217 pass, 0 fail (88 files), after the `origin/main` merge |
| `bunx tsc --build --force apps/be-01/tsconfig.lib.json`                                         | clean                                                       |
| `bunx tsc --build --force apps/fe-01/tsconfig.app.json`                                         | clean                                                       |
| `bunx nx run fe-01:test` (under the host lock)                                                  | see below                                                   |
| `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts …/20260830120000_add_dep_reach/*.sql` | clean                                                       |
| `bunx openspec validate --all --json`                                                           | 90/90 passed                                                |
| `bunx prettier --check` over every touched tree                                                 | clean                                                       |
| `CI=1 E2E_PORT_SHIFT=1300 bunx nx run fe-01:e2e`                                                | see below                                                   |

## Failure proofs (R5)

Every row was injected and watched by hand. The `Proof:` comment beside each
check names the same fault and the same words.

| Check                                       | Fault injected                                                                   | Test that saw it fail                                                     | Failure text                                                                                                                                         |
| ------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| the column default reaches existing rows    | `DEFAULT 'whole-item'` → `DEFAULT 'anchor-slice'`                                | `puts every project already on disk onto the whole-item reach…`           | `expect(received).toEqual(expected)` — `{"dep_reach": "whole-item"}` against a received `{"dep_reach": "anchor-slice"}`                              |
| the column comes off again                  | `down.sql` → `UPDATE project SET dep_reach = 'whole-item';` (valid, no drop)     | the same case                                                             | `expect(received).not.toContain(expected)` / `Expected to not contain: "dep_reach"`                                                                  |
| an unrecognised stored reach throws         | the throw → `isDependencyReach(row.depReach) ? row.depReach : 'whole-item'`      | `an unrecognised stored reach is refused`                                 | `Expected substring or pattern: /unknown dependency reach/` / `Received: "(resolved without throwing)"`                                              |
| the `whole-item` arm reaches the last slice | `reachedSliceOf`'s `whole-item` arm returning the anchor index                   | `a project's reach decides what a successor waits for`                    | `expect(received).toMatchObject(expected)` — `{earliestStart: 5, earliestFinish: 7}` against a received `{earliestStart: 3, earliestFinish: 5, …}`   |
| …over the whole corpus                      | the same fault                                                                   | `holds the whole-item reach's own invariants over every multi-role plan…` | `seed 3: r1c0 starts 6, before r0c0g0 finishes at 8.666666666666666`                                                                                 |
| …and the change actually lands              | the same fault                                                                   | `existing plans move to the whole-item rule`                              | `expect(received).toBeGreaterThan(expected)` / `Expected: > 100` / `Received: 0`                                                                     |
| the `anchor-slice` arm is still the anchor  | `reachedSliceOf` reduced to `return slices.length - 1`                           | `never moves a successor when a predecessor's later slices grow…`         | `seed 3: r1c0 moved from 8.666666666666666 to 11.333333333333332 when only later slices grew`                                                        |
| the reach touches only the predecessor      | the edge joined to `reachedNodeOf(successorId)` instead of `firstNodeOf`         | `a parent predecessor expands to its leaves under either reach`           | `expect(received).toMatchObject(expected)` — `Q` `{earliestStart: 5, earliestFinish: 11}` against a received `{earliestStart: 0, earliestFinish: 7}` |
| the reach is read per project               | `project.depReach` → a module-level `heldReach ??= project.depReach`             | `each project is scheduled by its own reach`                              | `expect(received).toBe(expected)` / `Expected: 5` / `Received: 3`                                                                                    |
| the arrow follows the schedule              | `reachedSliceOf`'s `whole-item` arm replaced by the anchor walk                  | `the arrow leaves the finish under the whole-item reach`                  | `expected { predecessorId: 'strip', …(6) } to match object { fromStart: 7, fromFinish: 9, …(1) }` (and the parent case beside it)                    |
| the wait's **sentence** follows it too      | `latestReachedAmong(plan.depReach, …)` → `latestReachedAmong('anchor-slice', …)` | `names the last step under the whole-item reach`                          | `expected 'Waits for Strip (Dev) — finishes 7 Sep' to be 'Waits for Strip (QA) — finishes 10 Sep'`                                                   |
| the chosen reach is written                 | `attempt(() => setDepReach(reach))` → `attempt(() => Promise.resolve())`         | `the reach is chosen and written`                                         | `expected "spy" to be called with arguments: [ 'anchor-slice' ]` / `Received:` / `Number of calls: 0`                                                |
| the dialog is not optimistic                | a local `useState` mirror set before the request and read by `checked`           | `does not move the choice while the write is still in flight`             | `expect(element).toBeChecked()` / `Received element is not checked: <input checked="" class="mt-1" name="dep-reach" type="radio" …`                  |

### Not injected, and why

- **The cycle refusal.** `refuses a cycle under either reach` asserts the throw
  under both values rather than watching a fault: `hasCycle` is untouched by
  this change and its own negatives predate it. What this case guards is the
  claim that the reach cannot reach around the cycle check — a claim that would
  otherwise stop being true quietly.

## Slice 5.1's browser negative, watched at last (2026-08-30)

`tasks.md` 5.1 was ticked with its negative unwatched — the one thing standing
between this change and `main` after the merge conflicts were resolved. Watched
now, in Chromium, on the merged tree (`5aaacbe` = `origin/main` `ac8c882` +
`5fa16ac`), serialised under the canonical lock on shift 1900:

| Step           | Result                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| green before   | `2 passed (38.4s)`, 2 planned / 2 ran                                                                                                                                                                   |
| fault injected | `void attempt(() => setDepReach(reach))` → `void setDepReach(reach)` in `phases-panel.tsx:448`                                                                                                          |
| **failed**     | `expect(locator).toHaveAttribute(expected) failed` — `Locator: locator('[data-gantt-bar][aria-label^="020 - "][aria-label*="Dev ·"]')`, `Expected: "2" / Received: "5"`. **Both** reach tests went red. |
| restored       | `git checkout --`, tree byte-identical (`git status --porcelain` empty)                                                                                                                                 |
| green after    | `2 passed (36.7s)`                                                                                                                                                                                      |

**Why it had to be a browser.** The write still happens under the fault, so a
jsdom test asserting that `setDepReach` was _called_ passes: the mock is
satisfied and the chart is stale. What the fault removes is the **re-read** —
`attempt` is what re-fetches the plan — so the only thing that can see it is a
chart drawn from the plan, and `data-start` staying at the old reach's workday
is that fact. `Expected: "2" / Received: "5"` is be-01 holding the new reach
while the reader looks at the old one.

That is `AGENTS.md` R5 #14/#15's family a fourth time: the oracle was jsdom and
the fault was a browser's.

## The stale opener the merge would have carried

`chooseTheReach` opened `getByRole('button', { name: 'Phases', exact: true })`
and awaited a dialog named `Phases`. `project-config-modal` deleted that button
— it is one `Project settings` control and a `Phases` tab now — so **both**
reach tests, including the one carrying 5.1 above, would have failed on the
opener and told nobody anything about the wrapper. Re-pointed in `5aaacbe`,
which also presses Escape until the surface is gone rather than once: the modal
refuses a close while a section holds a write in flight, and the reach's re-read
lands just after the PATCH the helper awaits.

Third stale opener found by this route today, after `mobile.spec.ts` and
`layout.spec.ts`. All three were invisible to jsdom and to any filtered run.

## The gate on the merged tree, and the one fixture the composition moved

Run on `a66c78f` (= `origin/main ac8c882` + `5fa16ac`), serialised under the
canonical lock, every count read with the escapes stripped and planned-vs-ran
reconciled.

| Command                                                                 | Result                                                                                   |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `nx run-many -t test lint typecheck build -p fe-01 be-01 domain mcp-01` | **be-01 1227, fe-01 1939 (61 files), domain 130, mcp-01 103 — 0 fail**, all four targets |
| `nx format:check --all`                                                 | clean                                                                                    |
| `openspec validate --all --json`                                        | **89 of 89**                                                                             |
| migration lint on `20260830120000_add_dep_reach`                        | clean; `down.sql` present; stamp sorts last after `work_item_type` and `external_ref`    |
| `CI=1 E2E_PORT_SHIFT=1900 nx run fe-01:e2e`                             | **241 planned / 241 ran / 237 passed, 3 failed, 1 skipped**                              |

Two of the three are the host's documented `keyboard.spec.ts` date pair. **The
third was real, and it is this change composing with
`assumed-duration-schedules`.**

`gantt.spec.ts`'s `redraws the open chart as each schedule input changes`
asserted the dependent bar at `data-start="10"`. Measured on the merged tree —
every bar's attributes read out of the page rather than re-derived:

| bar                                | start → finish |
| ---------------------------------- | -------------- |
| `010.1` `Dev`                      | 0 → 10         |
| `010.1` `QA` (nobody estimated it) | **10 → 12**    |
| `010.2` `Dev`                      | **12 → 16**    |
| `010.2` `QA`                       | 16 → 18        |

Under the anchor rule `010.2` waited for `010.1`'s first **estimated** slice —
its `Dev`, finishing at 10. Under `whole-item` it waits for the whole work item,
and `010.1`'s last slice is a `QA` nobody estimated, which since
`assumed-duration-schedules` takes two workdays rather than none. The fixture
now asserts both bars, so the two workdays between them are stated rather than
implied.

**This is the compounding this document and `assumed-duration-schedules`'
`verify.md` both predicted in prose, appearing as a number for the first time.**
Neither change moves that fixture alone; only the pair does. It was invisible to
1939 jsdom tests and to this change's own earlier browser gate, which ran on a
pre-ask-3 tree.

## Skipped or unavailable checks

Recorded as this change ran; see the report for anything still open.
