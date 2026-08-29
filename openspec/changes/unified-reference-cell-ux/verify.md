# Verification Contract

**Change**: `unified-reference-cell-ux`
**Implementation owner**: TASK-182, strict `openrouter/deepseek/deepseek-v4-flash-0731`
**Planning baseline**: `origin/main@06bcd64f`, PR #156 merged as `b508f870`

## 1. Structural validation

- [ ] `bunx @fission-ai/openspec@1.3.0 validate unified-reference-cell-ux --strict --json` on h2puni reports valid.
- [ ] Proposal, delta spec, design, tasks and this contract describe the same four fields and multi-team meaning.

## 2. Required watched failures

| Check                  | Fault to inject                                               | Test that must observe it                                                       |
| ---------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| joint pool fixpoint    | stop after the first pool round                               | `schedule-joint-capacity.test.ts` re-ask case                                   |
| single-pool identity   | route a singleton through changed semantics that alter visits | `schedule-identity.test.ts` plus capacity oracle                                |
| binding team           | read `teamIds.at(0)` instead of search output                 | non-first binding-team geometry/service case                                    |
| mixed patch refusal    | allow `teamIds` and `serviceTeamId` together                  | controller exact 400 and unchanged-state case                                   |
| atomic team validation | validate before the repository transaction                    | unknown-among-known changes no scalar, join or revision                         |
| whole-set undo         | journal only the first team                                   | undo of middle-member removal loses sibling                                     |
| patch field journal    | omit `teamIds` from `fieldsOf`                                | `teamIds`-only patch creates no inverse                                         |
| structural restore     | restore only `serviceTeamId`                                  | duplicate/delete undo loses the second membership                               |
| stable projection      | project the request-order first id                            | equivalent request orders expose different scalar ids                           |
| last-writer-wins       | merge a stale client's members                                | later replacement is not the exact stored set                                   |
| own-vs-effective write | derive next ids from inherited effective set                  | clear/add inheritance case copies ancestor labels                               |
| passive overlay        | enable pointer events on the whole card                       | DOM passive-surface assertion and Chromium empty-space click-through            |
| interactive row        | remove pointer events from dependency rows                    | Chromium cell→third-row reachability                                            |
| complete list          | derive overlay entries from visible chips                     | third dependency absent from description/card                                   |
| hover cleanup          | omit owner leave or stale-id guard                            | Chromium outside-leave retains tint                                             |
| palette paint          | point card line at the grid-surface tint                      | two-palette direction assertion                                                 |
| beneath-row takeover   | drop `entersThroughDependsCard` from the cell/pill enters     | Chromium padding crossing over a dependent row; jsdom enter at a corridor point |
| one-line rest          | `wrap` on the strip, and on the chip group, one at a time     | jsdom rest case, both assertions; Chromium row height against an empty cell     |
| reachable while edited | never wrap, then wrap an empty cell too                       | jsdom editing cases; Chromium chip hit-test with the box focused                |
| no rest width floor    | restore the search box's `minWidth: 72`                       | jsdom floor case; Chromium search-holder width                                  |
| clipped line is marked | pin `overflow: visible`, then delete the fade                 | jsdom rest clip/fade case                                                       |
| inheritance said once  | draw the strip's `Inherited:` line beside the sheet's         | jsdom visible-node counts, strip and sheet                                      |
| own member said once   | restore `restingValue`                                        | jsdom visible-node count on a one-member set                                    |

### Observed through task 1

- Joint-pool fixpoint: one-pass search failed the re-ask case before restoration.
- Single-pool identity: bypassing the fast path failed `eventsVisited` at 4 versus 2 before restoration.
- Binding team: projecting `teamIds.at(0)` made the service payload case fail on `team-alpha` versus the engine-selected `team-beta`; restored head passed 1/1.
- Geometry: the non-first binding-team suite passed 123/123 and the full fe-01 suite passed 1,759/1,759 before the service payload assertion landed.

### Observed through task 2.1

- Request arms: the pre-implementation route run failed 3/61 on whole-set `teamIds`, mixed scalar/set refusal, and unknown-member validation.
- Restored controller, service, and OpenAPI freshness suites passed 150/150; be-01 lint and typecheck also passed at `e470bb6`.
- Mixed requests return the stable 400 `cannot_send_both_teamIds_and_serviceTeamId`; unknown sets leave state unchanged; OpenAPI records `teamIds` with `maxItems: 10`.

### Observed through task 2.2

- Repository set semantics failed 3/28 under missing atomic validation/projection behavior, then passed 29/29; the whole-set journal mutant failed 1/79, then passed 79/79.
- Structural insertion failed 1/29 when explicit memberships were not inserted, then passed 29/29; legacy rows still fall back to the projected scalar.
- The second-member structural mutant failed exactly the new multi-team duplicate-redo and delete undo/redo guards (79 pass, 2 fail); restored `7447f55` passed 81/81 and be-01 typecheck.
- Removing the legacy scalar fallback failed exactly the old-journal singleton restore guard (81 pass, 1 fail); restored `4015713` passed 82/82. Both commits passed touched lint and format; no local build or test ran.
- PATCH remains exact whole-set last-writer-wins; unknown-among-known validation leaves the scalar, joins, and revision unchanged.

### Observed through task 2.3

- Omitting `teamIds` from the HTTP PATCH body failed exactly one new `wbs-api.test.ts` guard; restored `8b28eaa` passed 25/25.
- Dropping the full set in the plan-card API fake failed its focused round-trip guard; restored `2fd1646` passed, with fe-01 typecheck plus touched lint/format green. No local build or test ran.

### Observed during task 3.1

- Before `reference-set-field.tsx` existed, its focused suite failed at module resolution. The restored shared strip/sheet passed 6/6 at `67d54f4`.
- A combined named mutant re-offered selected ids, passed `addButtonLabel` to `CreatablePicker`, and left a pending remove control enabled. It failed 4/6 on duplicate selection, the second `+`, pending disablement, and the ambiguous add focus path; restored code passed 6/6.
- Omitting the strip's grid contract failed the new cell identity/Tab-routing guard 1/7. Restored `e37de6d` passed 7/7 with touched lint and fe-01 typecheck green. Task 3.1 remains open for outcome semantics and concrete directory adapters. No local build or test ran.
- The legacy team create writer replaced an existing membership: the new round-trip guard failed with `['team2']` instead of `['team1', 'team2']`. Restored `a57c517` patches the whole `teamIds` set, projects the first member in the API fake, and passed all 522 table tests plus 7/7 reference-set tests, touched lint, format, and fe-01 typecheck on h2puni.
- The shared dev checkout reset from the task branch during the first read, so this evidence was produced in detached worktree `/home/puni1/wbs-dev/task182-n15` at the same `48ba9ed` parent and pushed fast-forward to the task branch. No build or test ran on h1claw.
- Widening the six `PlanCardsProps` directory writers to `Promise<CommitOutcome>` first failed fe-01 typecheck with six TS2322 errors because every table adapter still returned `void`. Restored `9a2bf77` returns `run(...)` from all six writers and adapters; fe-01 app/e2e typecheck, touched lint, and format passed on h2puni. Existing desktop/card handlers explicitly discard outcomes until the shared strip/sheet replaces them in the next behavioral chunk.
- The choose/create outcome guard failed 2/8 before `f2e6544`: a refused take cleared `New team`, and a pending take left the combobox enabled. Restored code awaits the adapter outcome, closes only on `landed`, retains refused/unsent typing, and synchronously suppresses a second take. Focused reference-set 8/8, fe-01 app/e2e typecheck, touched lint, and format passed on h2puni. Task 3.1 remains open for the concrete Teams/Tags/Services adapters.
- The Teams shared-strip watched red first patched `['team2']` instead of preserving `['team1', 'team2']`; restored `07f0451` passed 9/9. Services then passed its 14/14 focused family at `6884187`, preserving inherited/mismatch words and whole-set writes.
- The first complete desktop-family run exposed six legacy Teams compatibility faults at 524/530. Restored `c89afdf` passed all watched cases 7/7 and the complete reference-set/table run 530/530.
- Tags moved to the same `ReferenceSetStrip` adapter at `b04cc01`. The complete reference-set/table run passed 530/530; fe-01 app/e2e typecheck, touched lint, and format passed on h2puni. Teams, Tags, and Services now share one desktop strip while retaining their existing directories and `Promise<CommitOutcome>` writers, completing tasks 3.1 and 3.2. No build or test ran on h1claw.

### Observed during task 3.3

- The 390×844 Teams watched guard first failed because the phone sheet had no `data-reference-set="team"` and exposed only one scalar value. The shared `ReferenceSetSheet` restoration exposes every selected team as an independently removable chip.
- Phone `PlanCardsProps` now sends whole sets through `setTeams(row, teamIds)` and passes the current set to `createTeam`. The 390×844 suite covers two selected teams, refused typed input retention, pending double-tap suppression, landed close, inherited reveal, and Tags/Services create/remove through the same sheet.
- Remote `plan-cards.test.tsx` passed 109/109 and `reference-set-field.test.tsx` passed 8/8 after the standalone dialog contract was restored. The complete table suite passed 522/522 during the combined gate; fe-01 app/e2e typecheck, touched lint, and format are green with one pre-existing hook warning and zero lint errors. No build or test ran on h1claw.

### Observed during task 4.1

- Before `dependencyPointerRegion` and dependency-row targets existed, the new focused suite failed 3/3: the rectangle helper was absent and neither interactive row target could be found. Restored `6bc430f` keeps the `HoverCard` surface at `pointer-events:none`, opts only its unfocusable rows into pointer events, and removes the passive document listener on unmount.
- The table guard preserves the card and whole-set tint when owner `mouseleave` reports the underlying element reached through passive padding; a document move outside the owner/row corridor then clears the card and tint. Clearing synchronously on owner leave fails this transition before the row can be reached.
- Remote `depends-card.test.tsx` plus the complete `wbs-table.test.tsx` passed 527/527 in 79.35s. The focused bridge/hover family passed 14/14; fe-01 typecheck, touched lint, format, and pre-commit hooks passed on h2puni with one pre-existing hook warning and zero lint errors. No build or test ran on h1claw.

### Observed during task 4.2

- Before the shared tokens were applied, the new three-dependency guard failed because the dependency add button exposed no `data-reference-add` marker. Restored `06b1f035` shares the reference strip, add, and compact-chip tokens while retaining the existing dependency combobox, bulk-number parser, refusal rows, and add/remove endpoints.
- A visible-chip-only mutant narrowed the accessible description with `waitingFor.slice(0, 2)`. The watched guard failed on `Waiting for 010 - Strip, 020 - Sand` instead of the complete `Waiting for 010 - Strip, 020 - Sand, 030 - Paint`; restoring the full `waitingFor` list passed.
- Remote table, shared-strip, and dependency-card suites passed 536/536. fe-01 app/e2e typecheck, touched lint, format, and pre-commit hooks passed on h2puni with one pre-existing hook warning and zero lint errors. No build or test ran on h1claw.

### Observed during task 4.3

- The stale-state cleanup guard first failed 0/3 because pointer cancellation, scroll, and resize had no listeners. Restored `8a1892b` clears the owner/card tint on all three invalidations, captures nested scroll, and unregisters every listener with the card.
- The focused pointer-bridge suite passed 5/5; the combined table, shared-strip, and dependency-card run passed 537/537 in 80.46s. fe-01 app/e2e typecheck, touched lint, format, and pre-commit hooks passed on h2puni. Chromium owner-to-third-row travel and empty-card hit testing remain open in task 4.3. No build or test ran on h1claw.
- Chromium exposed a browser-only bridge fault: spreading the first `DOMRect` dropped its prototype-backed `left/top/right/bottom` edges, so the passive corridor became `NaN` and the card closed before the third row. The watched test failed on `the card closed while crossing passive padding`; restored `6da9d6b` copies all four edges explicitly and passed 1/1.
- Removing the corridor failed the same bridge assertion, removing row pointer events failed `the third dependency row target does not own its painted pixels`, and enabling whole-card pointer events failed `the empty card area intercepted the underlying action`. The restored focused Chromium run passed after format; scroll, resize, and pointer cancellation each clear the card and exact row tint before the test reopens it.
- Touched format, fe-01 typecheck, lint (one pre-existing hook warning, zero errors), diff check, and pre-commit hooks passed on h2puni. The shared serving checkout repeatedly reset to `origin/main`, so the exact-head gate and commit used the existing detached TASK-182 worktree and pushed `6da9d6b` fast-forward. No build or test ran on h1claw.

### Observed during task 5.1

- The new desktop reference-cell round trip first failed because the third
  Teams/Tags/Services chip had area but its centre hit-tested outside the chip.
  The inner chip group was one non-wrapping flex item, so it painted across the
  next table cell and that cell covered the value. Restored `863b75d` wraps the
  group within 100% of its cell; all three chips are visible and hit-testable.
- The same Chromium case adds a third value through each real picker, adds a
  third dependency, reloads, proves inherited context and light/dark paint,
  removes one value from each set, reloads again, and preserves both siblings.
  It passed 1/1; the focused shared-field unit suite passed 8/8, fe-01 app/e2e
  typecheck and touched lint/format/hooks passed on h2puni.
- CI run 33204455231's hover failure reproduced locally. Playwright's default
  cell-centre hover landed on the first dependency chip and correctly narrowed
  the tint, so the assertion asking for the whole set was aimed at the wrong
  surface. A proven passive-padding point now drives that test; restored head
  passed 1/1.
- The 390×844 matrix adds a third Team, Tag, Service and dependency through
  the real bottom sheets, reloads, checks all three values in light and dark,
  opens inherited child sheets, removes one member from every set, reloads
  again, and preserves both siblings. It passed 1/1 alone and 2/2 with the
  desktop case at `4087586`.
- Clipped-value red head `7aa5b99` capped the shared chip group at 20px with
  hidden overflow; Chromium failed `reference chip 1 is clipped or covered`.
  Restored head `6fe01f8` passed both Chromium cases 2/2. Prettier and both
  commits' touched lint/format/secrets hooks passed on h2puni. No build or test
  ran on h1claw.

### Observed after merge, 2026-08-29

- Found by hand in Chrome on a plan where the row beneath an open card had
  dependencies of its own: the card's passive padding hit-tests to that row,
  its Depends on cell's `onMouseEnter` wrote `hoveredCell`, and 020's card
  became 030's on the way to it. It read as "the card closes for rows with
  fewer than three dependencies" — the height at which the card happened to
  stop covering such a row. The spec's `passive padding does not break
owner-to-row travel` scenario was already precise about this, so no new
  change; the fix is `entersThroughDependsCard` in `depends-card.tsx`, read by
  the cell's and the pill's enters.
- Red first: `e2e/deps-cell.spec.ts` `holds the card while the pointer crosses
its padding over the row beneath` failed on `the row beneath took the hover:
Expected ["030", …, "090"], Received ["040", "050"]`; `wbs-table.test.tsx`
  `leaves the open card alone when the row beneath it is entered through its
padding` on `expected 'What 030 waits for' to be 'What 020 waits for'`, and
  with the pill's guard alone removed on `expected ['020'] to deeply equal
['010']`. The band over a pill measured 0.9px in Chromium, so the pill guard
  is proved in jsdom alone and the Chromium case aims at the cell beneath.
- The first cut held every enter inside the bridge's region, owner included,
  and three existing cases failed (`narrows to the pill’s row…` and two more,
  `expected ['010', '020'] to deeply equal ['010']`): the owner's own pills
  enter at a point inside the owner. The owner's subtree is exempt now.
- Green: both jsdom suites 544/544; `deps-cell.spec.ts` + `reference-cells
.spec.ts` 11/12 in Chromium, the one failure (`picks the add button up off
the row it is hovered on`, `Expected: 0, Received: 42`) reproduced on the
  stashed `main` tree on the same Mac and is the host-specific red already
  noted in the session memory. fe-01 lint, typecheck and build passed. The
  same walk that switched the card in Chrome holds it after the fix.

### Task 4b — the Tags cell three lines tall, 2026-08-29

**Read the browser section after this one with it.** Everything here is jsdom,
every assertion in it is a **style-property** assertion, and the section below
records the two faults they were all blind to.

Reported by Dany with a screenshot against the merged head. Three causes, all
confirmed in the source before any change: `flexWrap: 'wrap'` on both the strip
and its chip group; the search box's `minWidth: 72` floor inside a 120px
column; and inheritance drawn twice, as the picker's `↳ Risk, Review`
placeholder **and** as a `data-reference-inherited` line under it. A fourth was
found while writing the count: `restingValue` printed a one-member set into the
box beside its own chip (`Platform ✕ Platform`).

Red first — with the new cases in place and the fix withheld,
`reference-set-field.test.tsx` ran 7 failed / 11 passed, on
`expected 'wrap' to be 'nowrap'` (strip), `the strip rendered no chip group`,
`the strip rendered no search holder`, `expected '' to be 'hidden'`,
`expected [ '↳ Core', 'Inherited: Core' ] to deeply equal [ '↳ Core' ]` and
`expected [ 'Platform', 'Platform' ] to deeply equal [ 'Platform' ]`.

Watched failures, each fault injected into the fixed tree on its own and then
reverted (jsdom, `bunx vitest run src/components/wbs/reference-set-field.test.tsx`).
Each says a style property is what the design says — **not** that a row is one
line tall, which is a layout fact jsdom cannot compute. The Chromium table
below is the layout oracle for the same faults:

| Fault injected                                            | Test that observed it                                                   | Failure                                                                                                                                                                                             |
| --------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flexWrap: 'wrap'` on the **strip** alone                 | `rests every flex container of a crowded cell on one line`, line 252    | `expected 'wrap' to be 'nowrap'`                                                                                                                                                                    |
| `flexWrap: 'wrap'` on the **chip group** alone            | the same case, line 253                                                 | `expected 'wrap' to be 'nowrap'`                                                                                                                                                                    |
| `wrapping` forced to `false`                              | `wraps both containers only while a crowded cell is edited`             | `expected 'nowrap' to be 'wrap'`                                                                                                                                                                    |
| `wrapping` widened to `editing` (an empty cell wraps too) | `keeps an empty cell on one line while it is edited`                    | `expected 'wrap' to be 'nowrap'`                                                                                                                                                                    |
| `minWidth: 72` restored at rest                           | `leaves the whole rest line to the chips until the box is entered`      | `expected 72 to be +0`                                                                                                                                                                              |
| `overflow` pinned to `visible`                            | `fades and clips the rest line, and does neither while editing`         | `expected 'visible' to be 'hidden'`                                                                                                                                                                 |
| the rest fade deleted                                     | the same case                                                           | `expected 'display: flex; flex-wrap: nowrap; ali…' to contain 'linear-gradient(to right, #000 calc(1…'`                                                                                             |
| the strip's `Inherited:` span put back beside the sheet's | `draws an inherited set once, in the box it is shown but not stored in` | `expected [ '↳ Core', 'Inherited: Core' ] to deeply equal [ '↳ Core' ]`, and the sheet's own case on `expected [ 'Inherited: Core from 010', …(1) ] to deeply equal [ 'Inherited: Core from 010' ]` |
| `restingValue` restored                                   | `draws the sole own member once, as its chip`                           | `expected [ 'Platform', 'Platform' ] to deeply equal [ 'Platform' ]`                                                                                                                                |

The two duplication counts read **visible nodes** — an element's own text, or a
box's placeholder or value — and never accessible names: `↳ Core` beside
`Inherited: Core` is one name to the accessibility tree and two lines to the
eye, so a name count cannot see the fault it is written for.

Existing cases the new contract moved, each re-read rather than deleted:
`wbs-table.test.tsx`'s `reads the team out of the set…` and `creates the name
typed…`, and the `threeRootsAndATeam` fixture, waited on the picker's **value**
being the team's name; the chip is that reading now and the box is asserted
empty. `reference-set-field.test.tsx`'s first case asserted the strip's
`Inherited: Core`; it now asserts the strip draws no such line at all.

The counts, the browser gate and the final green are in the section below;
this one's numbers were taken before the two faults it could not see were
found.

### Task 4b in a browser, 2026-08-29 — jsdom said yes and Chromium said no

The jsdom work above was shipped as done and **was not**. Run on a free
3100/3200/4200, `reference-cells.spec.ts` failed two cases:

```
rests a crowded reference cell on one line and opens it to reach every chip
Error: three tags stand the row taller than a row with none
  Expected: <= 27.1875
  Received:    43.640625

round-trips every desktop reference set with three reachable values in both palettes
Error: expect(locator).toHaveCount(expected) failed
  Locator: [data-reference-set="tag"] … [data-reference-chip="ffd294e6-…"]
  Expected: 0
  Received: 1
```

Every one of the nine jsdom negatives had passed, and every one of them was a
**style-property** assertion: `flex-wrap`, `min-width`, `overflow`,
`mask-image`. jsdom computes no layout, so none of them could see a row's
height, a hit test, or a chip that moved. R5 #14/#15/#16's rule, in its own
words: a jsdom style assertion never substitutes for browser layout.

**Fault one — the wrong column.** A probe in Chromium measured every cell of
row 010: each reference strip stood at **24.2px**, one line, exactly as
designed — and the Services cell's _wrapper_ stood at 41.6px and the row at
43.6px. That wrapper is `wbs-table.tsx`'s
`<span style={{display:'flex', flexWrap:'wrap'}}>` holding the non-owner
mismatch mark beside the strip. `ReferenceSetStrip` is a `display: flex` span,
so it is block-level and its hypothetical size is the whole line: beside a
`flex: none` triangle it could never share one, and the wrapper wrapped it
underneath **every time the mark was drawn**, crowded cell or not. The strip's
own `nowrap` was correct and irrelevant. The wrapper is `nowrap` now.

A `flex: 1` was added to `REFERENCE_SET_STRIP_STYLE` for that case and then
**deleted**: with it removed all three Chromium cases still passed, because a
flex item shrinks on `flex-shrink: 1` alone. R5 — the guard whose removal
cannot be seen does not ship.

**Fault two — the press that moved its own target.** The removal regression was
not a stale locator. Instrumented in the browser, a click on a chip's ✕ at rest
recorded:

```
EVENTS {"counts":{"down":1,"up":0,"click":0,"focusIn":1},
        "before":{"x":690.7,"y":154.6},"movedTo":{"x":667.7,"y":172.5}}
REMOVE {"stillThere":1,"requests":0,"patches":[]}
```

`mousedown` focused the button, `focusin` set `editing`, React flushed the
discrete update, the strip wrapped, the ✕ moved 23px left and 18px down onto
the second line, and the `mouseup` landed on whatever had taken its place. No
`click`, no request, no removal — a chip's ✕ did nothing at all. This is R5
#14/#15's fault class a fourth time: a discrete update inside a mouse gesture
that moves the target out from under it. The press now calls `preventDefault`
on `mousedown`, exactly as the `+` beside it does, and clipped chips are out of
the tab order at rest for the Depends-on cell's stated reason — the browser
scrolls an `overflow: hidden` box to show what it focused.

### Watched in Chromium, each fault injected alone and reverted

`CI=1 bunx playwright test --config apps/fe-01/playwright.config.ts
e2e/reference-cells.spec.ts`, `rests every reference row on one line and opens a
crowded cell to reach every chip`:

| Fault injected                              | Failure observed                                                                                                                                                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Services wrapper back to `flexWrap: 'wrap'` | `three tags stand the row taller than a row with none`, `Expected: <= 27.1875 / Received: 43.640625`                                                                                                                  |
| strip `flexWrap: 'wrap'` at rest            | the same assertion, `Received: 68.1875` — the reported three lines, measured                                                                                                                                          |
| chip group `flexWrap: 'wrap'` at rest       | the same assertion, `Received: 56`                                                                                                                                                                                    |
| `minWidth: 72` restored at rest             | `the search box still claims a width floor at rest`, `Expected: < 72 / Received: 72`                                                                                                                                  |
| the ✕'s `preventDefault` deleted            | `the chip a click removed at rest is still there`, `Expected: 0 / Received: 1`                                                                                                                                        |
| the rest fade deleted                       | `the clipped rest line wears no truncation cue`, `Expected: not "none"`                                                                                                                                               |
| `restingValue` restored                     | `the sole own member is drawn more than once`, `Expected: 1 / Received: 2`                                                                                                                                            |
| the strip's `Inherited:` span put back      | `an inherited set stands the row taller than a row with none`, `Expected: <= 27.1875 / Received: 56.5625` — the span's text wraps inside the line, which is the third line of the original report                     |
| `overflow: 'visible'` at rest               | the case never reaches its assertion: the spilled chips cover the cell, and `choose()` times out on `<td data-column="tag"> intercepts pointer events`. Decisive, and not at the named line — recorded as it happened |

The `flex-wrap`, `min-width`, `overflow` and `mask-image` cases in
`reference-set-field.test.tsx` remain, and are **style assertions**: they say
the property is what the design says, and the row heights above are the layout
oracle for the same faults. The two duplication counts (`drawnSayings`) run in
both, and the browser copy is the one that counts painted nodes.

### The two states, said explicitly

- **Rest** (nothing in the strip focused): one line, clipped, faded. Every row
  height assertion stands here — 010 with three tags, 010.1 inheriting three,
  020 with one own team, each `<= 27.1875 + 1`, the height of 030, which states
  nothing.
- **Editing** (focus anywhere in the strip, which is when the picker's list is
  open): a crowded cell wraps so every chip is reachable, and the row grows
  while it does. Only the chip hit-tests stand here. The row is measured again
  after `blur()` and must be back at the resting height.

### Full browser gate, this Mac, 2026-08-29

```
CI=1 bun run e2e
  3 failed
    [chromium] › e2e/deps-cell.spec.ts:430:3 › picks the add button up off the row it is hovered on, in both palettes
    [chromium] › e2e/keyboard.spec.ts:471:3 › Escape leaves the stored day alone, blur and all
    [chromium] › e2e/keyboard.spec.ts:615:3 › saves only the year that was typed, digit by digit, in a real Chrome
  204 passed (6.0m)
```

All three are the known baseline for this machine (203 passed / 3 failed on
`main` at `b3acb7b`), and none is this branch's: `deps-cell.spec.ts:430` fails
on `Expected: 0 / Received: 42` unsettled animations, and both keyboard cases
type US date order into an `en_UA` locale — `Expected "2026-05-20" / Received
"2026-02-05"`. The count moved 203 → 204 because this branch adds one case.

### Green after the fix

```
bunx nx run fe-01:test
 Test Files  1 failed | 56 passed (57)
      Tests  2 failed | 1813 passed (1815)
```

The two are `plan-mermaid.test.ts`'s weekend/milestone cases, pre-existing:
the same two fail at the branch point `b3acb7b` with 1804 passing.

```
✖ 1 problem (0 errors, 1 warning)     # wbs-table.tsx:4053, pre-existing useMemo deps
 NX   Successfully ran target lint for project fe-01
 NX   Successfully ran target typecheck for project fe-01
```

`bunx prettier --check` passes over every touched file, and
`bunx @fission-ai/openspec@1.3.0 validate unified-reference-cell-ux --strict --json`
reports `"passed": 1, "failed": 0`.

## 3. Remote gate output to record after apply

- [ ] Focused DOM suites: exact pass counts and watched-red messages.
- [x] Focused Chromium suites: 2/2 at restored head `6fe01f8`; clipped-value red `7aa5b99` failed the named hit-test assertion.
- [x] `bin/h2puni-gate.sh --all` at `00f850f` exited 0: Nx test, lint, typecheck and build succeeded for all 23 projects.
- [x] `bin/h2puni-gate.sh --all` at `e57b3ae` exited 0: test, lint,
      typecheck and build succeeded for all 23 projects; Nx retried and passed the
      two reported flaky build tasks.
- [x] `bun run format:check --all` passed. The unscoped `bunx openspec`
      invocation reproduced the known package-resolution failure; the CI-pinned
      `bunx @fission-ai/openspec@1.3.0 validate --all --strict --json` passed
      76/76. Migration lint passed over every tracked drizzle SQL file.
- [ ] GitHub `gate` and `pixels` run ids on the reviewed exact head.
- [ ] Sol xhigh and Gemini sealed artifact paths, models, verdicts, all findings and dispositions.

## 4. Acceptance evidence to record after deploy

- [x] Desktop add/create/remove/reload for two Teams, three Tags, three Services and three Dependencies.
- [x] 390×844 sheet parity for the same own sets plus inherited context.
- [x] Light/dark screenshots or measured paint assertions showing no native grey button face or hidden third value.
- [x] Pointer sequence cell → third overlay row → cell → outside, with exact lit-row sets at every step.
- [x] `elementFromPoint` proof that empty card space delivers the underlying cell action.
- [x] Rollback/reapply evidence on a database copy; no live database is modified by the rehearsal.

### Rollback rehearsal

- Chromium's isolated `e2e-1787948452603.db` was WAL-checkpointed and copied;
  no live database was touched. The branch has no drizzle diff against main.
- A singleton rehearsal copy removed the two non-projected memberships while
  keeping every scalar projection. Rolled-back main head `33a251e` started
  without migrations and returned 200 from `/api/projects/:id/work-items`:
  five rows, all five singleton-compatible.
- Reapplied head `eba5946` read the untouched multi-set copy through the same
  endpoint: five rows, one multi-team row, plus the persisted tag/service sets.
  The restored 390×844 Chromium case then proved all four reference cells
  through add/remove/reload. No build or test ran on h1claw.

## 5. Completion gate

- [ ] Every task checkbox is complete and every check above has an observed failure proof.
- [ ] Worktree clean, branch pushed, CI green, exact-head reviews complete.
- [ ] Main-session review approves the measured dev-mode Flash trial before merge.
- [ ] Dev health reports the merged commit and TASK-183 is unblocked.
