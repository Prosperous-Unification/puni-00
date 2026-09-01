<!--
Commands, their output, and the failure-proof table R5 asks for.
-->

## Commands

Run on this macOS host, on `feat/hint-press-cancels` off `23e22360`.

| Command                                                                                  | Result                          |
| ---------------------------------------------------------------------------------------- | ------------------------------- |
| `bunx nx run fe-01:test`                                                                 | **2030 passed / 65 files**      |
| `CI=1 E2E_PORT_SHIFT=3900 bunx playwright test --config=apps/fe-01/playwright.config.ts` | **278 passed, 1 skipped**, 9.2m |
| `bunx nx run-many -t lint typecheck`                                                     | **exit 0**, 23 projects         |
| `bunx nx format:check --all`                                                             | **clean**                       |
| `bunx openspec validate --all --json`                                                    | **28 passed, 0 failed**         |

The one lint warning is `wbs-table.tsx`'s `columns` memo — `LLM_README.md`'s
landmine #1, pre-existing and named in `tool-hints-wait/verify.md` the same way.

### Not run, and why

- `bin/h2puni-gate.sh` — exits **127** on this macOS host. The commands above
  were run directly, one at a time.

### The shifted ports, and why 3900

Another session held 1900 and then 2500 for the whole of this change's life, so
both were out, and 2400 is within 100 of 2500 — which the config refuses for
good reason. 3400 was used for the subset runs and then became unusable: a run
killed mid-flight left its own be-01 and gw-01 listening on 6500 and 6600, and
`CI=1` correctly refuses to measure a stack it did not start. 3900 puts the
three tiers on 7000/7100/8100, clear of all of it and of the ports Chromium
refuses to navigate to.

**Written `--config=` rather than `--config `.** The other session runs a
watcher that `pkill -f "playwright test --config apps/fe-01"`, which matched
this run's own command line and killed it twice — once at test 63 of 279, with
all 63 passing. The `=` form does the same thing and does not match.

### One gate run that measured two different trees

The run before this one reported **277 passed, 1 failed**, the failure being
this change's own `a pressed control explains itself again once the pointer has
left`. It was not a defect: seven minutes into a ten-minute run, another session
edited `hint.tsx` and `hints.spec.ts` in this same worktree, taking
`TOOL_HINT_WAIT_MS` from 3000 to 2000 at Dany's request. Playwright had already
read the spec files, so the second half of that run drove new application code
from an old spec. Re-run on the settled tree, all six hint cases passed, and the
whole gate above is green.

The press cancel needed no change for the shorter wait: nothing in it is written
against the constant.

## Failure proof (R5)

Every check below was watched failing with the named fault injected.

### jsdom — `hint.test.tsx`

| Check                                        | Fault injected                                         | Observed failure                                      |
| -------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| a press ends the wait it interrupted         | the `pointerdown` listener removed                     | `expected SVGSVGElement{ …(2), …(2) } to be null`     |
| a press is not undone by the focus it causes | the `pointerdown` listener removed                     | `expected <div role="tooltip" …(2)></div> to be null` |
| a press leaves a fact's card alone           | the press path's `stopWaiting()` replaced by `clear()` | `expected null not to be null`                        |
| the page redrawing under a still cursor      | the `pressedAt` coordinate comparison removed          | `expected <div role="tooltip" …(2)></div> to be null` |
| leaving and returning waits again            | the `pointerdown` listener removed                     | `expected <div role="tooltip" …(2)></div> to be null` |

### jsdom — `wbs-table.test.tsx`

| Check                                     | Fault injected                             | Observed failure            |
| ----------------------------------------- | ------------------------------------------ | --------------------------- |
| the number cell speaks only when it clips | the `NUMBER_ENVELOPE` length guard removed | `expected '010' to be null` |

### Chromium — `e2e/hints.spec.ts`

| Check                                   | Fault injected                                      | Observed failure                                                                                                            |
| --------------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| the ring goes with the press            | the `pointerdown` listener removed                  | `Error: the ring outlived the press · Expected: 0 · Received: 1`                                                            |
| no card through the dialog's own redraw | the `pressedAt` coordinate comparison removed       | `Error: the card came up after the press · Expected: 0 · Received: 1`                                                       |
| a pressed control explains itself again | `pointed`'s `pressedAt = null` removed              | `expect(locator).toBeVisible() failed · Expected: visible · Error: element(s) not found`                                    |
| the wait is two seconds                 | `TOOL_HINT_WAIT_MS` put back to `3000`              | `expect(locator).toBeVisible() failed · Expected: visible · Timeout: 1600ms · Error: element(s) not found`                  |
| the End cell's words are a project fact | that cell's `data-fact` changed back to `data-hint` | `Expect "toBeVisible" with timeout 30000ms · waiting for locator('td[data-column="finish"] [data-fact="No estimate yet"]')` |

## One check that could not fail, and what was done about it

**It did not ship.** `a press ends the wait, and the ring with it` first pressed
the control with `shortcuts.click()` and read the ring afterwards. Injected with
the whole `pointerdown` listener removed, it was watched **passing**: the dialog
that button opens redraws the page, that redraw clears the ring through a path
the press has nothing to do with, and the fault surfaced two assertions later as
a card — which reads in the report as a different bug entirely.

The press is held open with `page.mouse.down()` now, and the ring is read while
the button is still down and no dialog exists. The same fault then failed at the
line it belongs to: `Error: the ring outlived the press · Expected: 0 ·
Received: 1`. `estimate-triple-visible`'s "assert in the window the fault lives
in", and the fourth time a **dialog's own redraw** has been the thing that made
a hint check vacuous.

## The browser found the design, not just the bug

The first cut had no state at all: a press called `stopWaiting()`, `attending`
stayed set, and every path that could restart the wait already refused on node
identity. Both jsdom cases passed. **Both browser cases failed**, on the card
coming up three seconds after the press.

Instrumented rather than theorised — a probe logging every `pointerover`,
`pointerdown` and `focusin` with its coordinates:

```
1500 pointerdown svg at=834.47998046875,65 mark=BUTTON#Keyboard shortcuts
1539 pointerover DIV at=834.47998046875,65 mark=none
1554 pointerover svg at=834.47998046875,65 mark=BUTTON#Keyboard shortcuts
```

The press cancels correctly at 1500. What restarts the wait is the **dialog**:
opening and closing it fires a departure and a return under a cursor that has
not moved, both reporting the press's own position to the last decimal. So the
departure that ends a press's quiet is the cursor moving, not the mark under it
changing — `pressedAt` holds the press's point and `pointed` returns early for
any `pointerover` reporting it.

That is a rule the jsdom suite could not have produced: `pointAt`'s default
coordinates made both of its "departures" indistinguishable from the churn, and
the case that now covers this had to be told to move.

## What the `#` cell's silence broke, and how it was found

`e2e/layout.spec.ts`'s `fits a deep plan with an unbreakable name and six
dependencies` walks the outline one depth at a time, and found each row's Number
cell through `span[data-fact="${number}"]`. Every row it walks is shallow, so
after 2.1 none of them carries the attribute and the whole outline had nothing to
measure: `Error: no indent-carrying cells on screen for 030`.

Nothing in `e2e/hints.spec.ts` could have seen it. It was found by running the
**whole** browser gate rather than the hint file in it — `linked-row-hover`'s
lesson, and the reason a change that edits a shared attribute has no business
believing a filtered run. The oracle is `[data-number]`'s own parent now, which
every row carries whatever its number is, and `wbs-table.test.tsx`'s indent walk
was moved the same way in the same breath.
