<!--
Commands, their output, and the failure-proof table R5 asks for.
-->

## Commands

Run on this macOS host, on `feat/tool-hints-wait` off `cab87fb6`.

| Command                                                                                  | Result                          |
| ---------------------------------------------------------------------------------------- | ------------------------------- |
| `bunx nx run fe-01:test`                                                                 | **2024 passed / 65 files**      |
| `CI=1 E2E_PORT_SHIFT=1900 bunx playwright test --config apps/fe-01/playwright.config.ts` | **276 passed, 1 skipped**, 8.3m |
| `bunx nx run-many -t lint typecheck`                                                     | **exit 0**, 23 projects         |
| `bunx nx format:check --all`                                                             | **clean**                       |
| `bunx openspec validate --all --json`                                                    | **28 passed, 0 failed**         |

The one lint warning is `wbs-table.tsx`'s `columns` memo — `LLM_README.md`'s
landmine #1. It is **pre-existing**, and that was checked rather than assumed:
`git stash push -u` and `bunx nx run fe-01:lint` on the stashed tree reported the
same `4471:5 warning React Hook useMemo has unnecessary dependencies` with none
of this change in the tree.

### Not run, and why

- `bin/h2puni-gate.sh` — exits **127** on this macOS host. The commands above
  were run directly, one at a time.

## Failure proof (R5)

Every check below was watched failing with the named fault injected. Two
`Proof:` comments were **wrong when first written** — guessed from what the
fault looked like it should do — and both were rewritten from the output; they
are marked.

### jsdom — `hint.test.tsx`

| Check                                           | Fault injected                                                           | Observed failure                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| a fact answers first inside a hinted control    | `HINTED` narrowed back to `[data-hint]` alone                            | `Unable to find an accessible element with the role "tooltip"` — **comment corrected**, see below           |
| a fact draws no ring                            | the ring timer started before `attend`'s `if (!at.waits)` early return   | `expected SVGSVGElement{ …(2), …(2) } to be null`                                                           |
| a tool hint says nothing until the wait is out  | `attend` calling `setOpen(at)` for a tool hint the way it does a fact    | `expected <div role="tooltip" …(2)></div> to be null`                                                       |
| a pointer that moves on opens nothing           | `clear`'s call to `stopWaiting` removed                                  | `expected <div role="tooltip" …(2)></div> to be null`                                                       |
| a sweep across three controls leaves nothing    | `RING_QUIET_MS` set to 0                                                 | `expected SVGSVGElement{ …(2), …(2) } to be null`                                                           |
| a tap says nothing                              | the `pointerType !== 'mouse'` guard deleted                              | `expected SVGSVGElement{ …(2), …(2) } to be null`                                                           |
| the ring is absent through the quiet            | the ring timer's `setRing` removed                                       | `expected null not to be null`                                                                              |
| the ring goes once the card is up               | the `stopWaiting()` inside the opening timer removed                     | `expected SVGSVGElement{ …(2), …(2) } to be null`                                                           |
| the ring follows the cursor                     | the `pointermove` listener never added                                   | `expected 'position: fixed; left: 114px; top: 21…' to contain 'left: 314px'`                                |
| no move listener survives the wait              | `stopWaiting`'s `removeEventListener` deleted                            | `expected SVGSVGElement{ …(2), …(2) } to be null`                                                           |
| the keyboard opens a tool hint at once          | the `focusin` path routed through `attend`                               | `Unable to find an accessible element with the role "tooltip"`                                              |
| a click does not jump the wait                  | `focused`'s `at.node === attending` guard removed                        | `expected <div role="tooltip" …(2)></div> to be null`                                                       |
| the description comes back off                  | the cleanup's `removeAttribute` dropped                                  | `expected 'hint-card' to be null`                                                                           |
| Escape closes                                   | the `keydown` listener and handler deleted                               | `expected <div role="tooltip" …(2)></div> to be null`                                                       |
| an empty hint or fact opens nothing             | the `words === ''` half of the guard deleted                             | `expected SVGSVGElement{ …(2), …(2) } to be null` and `expected <div role="tooltip" …(2)></div> to be null` |
| a mark with nothing to say closes the last card | `pointed`'s `clear()` replaced by an early return where `hintAt` is null | `expected <div role="tooltip" …(2)></div> to be null`                                                       |

### Chromium — `e2e/hints.spec.ts`

| Check                                  | Fault injected                                               | Observed failure                                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| no native tooltip anywhere on the plan | (unchanged from `hints-are-the-page-s-own`; not re-injected) | —                                                                                                                                           |
| no mark carries both attributes        | `data-fact="010"` added beside Undo's `data-hint`            | `Error: 1 marks carry both`, with `{fact: "010", hint: "Undo your last change to this plan (Ctrl/⌘ + Z)", tag: "button"}` in the diff       |
| the ring is absent inside the quiet    | `RING_QUIET_MS` set to 0                                     | `Error: the ring is drawn inside the quiet · Expected: 0 · Received: 1`                                                                     |
| the card is silent a second in         | `TOOL_HINT_WAIT_MS` set to 0                                 | `Error: the card came up inside the first second · Expected: 0 · Received: 1`                                                               |
| the ring is beside the cursor          | `RING_OFFSET_PX` set to 400                                  | `Error: the ring is 576px from the cursor · Expected: < 40 · Received: 575.5738714484359`                                                   |
| the ring goes when the card comes      | the `stopWaiting()` inside the opening timer removed         | `Error: the ring outlived the card it was waiting for · Expected: 0 · Received: 1`                                                          |
| a fact answers inside 400ms            | the Number cell's `data-fact` turned back into a `data-hint` | `expect(locator).toBeVisible() failed · Locator: locator('td span[data-fact="010"]') · Error: element(s) not found` — **comment corrected** |

## Four checks that could not fail, and what was done about them

**None shipped.** All four were written this round, watched **passing** with the
fault they exist for, and rewritten. The two new shapes are now in `AGENTS.md`'s
tally paragraph and the first is a `LLM_README.md` landmine.

1. **`await expect(ring).toHaveCount(0)` cannot say "nothing here right now".**
   It is a _retrying_ assertion: it polls for thirty seconds and is satisfied the
   moment the count reaches zero, which for a ring is the moment the card
   replaces it. Watched passing with `RING_QUIET_MS` set to 0, the fault instead
   surfacing two assertions later as `the card came up inside the first second`
   — a completely different bug, in the report. Every silence in the file is now
   `expect(await locator.count()).toBe(0)`.
2. **`page.locator('td [data-fact]').first()` is not about any particular mark.**
   The 400ms fact budget was watched passing with the Number cell turned back
   into a hint, because a row carries several facts and `.first()` moved on to
   the next one. Pinned to `td span[data-fact="010"]`.
3. **An advance computed from the constant it asserts against.**
   `waitOut(RING_QUIET_MS - 250)` goes **negative** when the injected fault sets
   that constant to 0, and the run failed on `Negative ticks are not supported`
   rather than on the assertion — a failure that says nothing about the
   behaviour. The advances either side of the quiet are literals now, with the
   reason written beside them.
4. **A ring read at the end of the wait rather than during it.** `draws no ring,
because there is nothing to wait for` advanced the full three seconds first,
   by which time `stopWaiting` has cleared the ring whether the fault is there or
   not. Read 100ms past the quiet instead. `estimate-triple-visible`'s "assert in
   the window the fault lives in", again.

## The bug the whole gate was green over

**Found by taking a screenshot and looking at it**, after every test in this change was written
and passing. With the wait in and nothing else wrong, **adding a work item killed every toolbar
hint for the rest of the visit**: the write hands the keyboard to the new row's Name box a few
milliseconds later, that `focusin` names a `<textarea>` with no words of its own, and the focus
path answered by clearing everything — the pointer's three-second wait included. The pointer has
not moved, so no further `pointerover` ever restarts it.

2020 jsdom tests and 276 browser tests passed through it, twenty of them written that hour, because
every one of them is about a page **at rest** and the fault lives only in the second after a write.
`estimate-triple-visible`'s window rule, arriving from a direction no assertion was pointing.

The first theory was **wrong and was checked rather than believed**: a scroll from the settling
table. The document's own capture-phase log, taken in Chromium at 900×500, holds
`59 pointerover BUTTON "Draw the schedule un"`, `94 focusout BUTTON`, `99 focusin TEXTAREA` — and no
scroll at all. The fix is that the focus path only ever _opens_; departure belongs to `blurred`,
which is already narrowed to the mark being attended.

The scroll guard was kept anyway, because a scroll during a wait would cancel it for the same
reason, and its jsdom negative was watched. Its JSDoc says plainly that it is reasoning rather than
a sighting.

Re-checked by screenshot afterwards: add a work item, rest on `Gantt` — ring at 1.5s, card at 3.7s.

## Two browser oracles written and shipped neither

Both were for "a scroll does not kill a wait", and the note in `e2e/hints.spec.ts` carries the
detail. The row-insert version is not an oracle: the same re-render both cancels the wait and
revives it through a fresh `pointerover` on a replaced button — watched **passing** with the fault
in, on one run of two. The viewport-height version fails with the fix **in**, because Chromium
re-computes hit-testing after a resize and ends the wait itself. The jsdom case dispatches exactly
one scroll and nothing else, which is the whole of what the guard is about.

## Two `Proof:` comments that were guesses

Both were written from the expectation and were wrong; both are now the output.

- The nesting case's said the narrowed selector would give the **wrong words**.
  It gives **no card at all**: the nearest mark `closest` then finds is the
  button, whose words are a tool hint, so the chip's fact is not late or wrong
  but silent for three seconds.
- The fact case's said the 400ms budget would fail. The failure lands one line
  **earlier**, at the locator — changing the attribute takes the mark out of the
  test's reach rather than making its card late.
