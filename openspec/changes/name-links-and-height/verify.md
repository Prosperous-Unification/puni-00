# verify — `name-links-and-height`

Slices 1 and 2 implemented. Every figure below was read off a Chromium run in
this worktree on shifted ports; nothing here is derived, and what was not run
says so.

## Commands

| Command                                                                 | Result              |
| ----------------------------------------------------------------------- | ------------------- |
| `CI=1 E2E_PORT_SHIFT=600 playwright test … name-markdown`               | **7 passed**        |
| `CI=1 E2E_PORT_SHIFT=600 playwright test … hover-cards -g "followable"` | **1 passed**        |
| `bunx nx run fe-01:test`                                                | **passed** (exit 0) |
| `bunx openspec validate name-links-and-height`                          | valid               |
| the whole `CI=1` Playwright gate on shifted ports                       | see task 3.1        |

## Failure proofs (R5)

| Check                                      | Fault injected                                           | Observed failure                                                                                            | Watched              |
| ------------------------------------------ | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------- |
| the block allowlist keeps a marker as text | the `RENDERED_AS_SOURCE` loop deleted so children render | `four rows, four names, one height` failed in **both** palettes                                             | Chromium, 2026-08-30 |
| a row is as tall as its reading            | `drawnBoxHeight` made to answer `null`                   | `Expected: 26.1875 / Received: 42` — the row 15.8px taller                                                  | Chromium, 2026-08-30 |
| the drawn link takes the pointer           | the `[data-cell-rendered] a` rule deleted                | `page.waitForEvent: Test timeout of 60000ms exceeded` — no popup, the click reaching the box under the link | Chromium, 2026-08-30 |
| the notes' links are the name's links      | the `a: LinkFollowable` entry removed                    | `expect(locator).toHaveText … Expected: "the lift" … element(s) not found`                                  | Chromium, 2026-08-30 |

All four were watched. The `pointer-events` row was written as a claim first
and then observed, which is the order R5 forbids — recorded here rather than
quietly corrected, because the version of this file that shipped a `Proof:`
comment for an unobserved failure existed for about a minute and is exactly the
fault the rule is about.

## What changed about a decision that was already made

`markdown-work-item-names` recorded, with reasons, that a link in the grid is
**not** an anchor. Half of that reasoning is now reversed by the person who
asked for it, and the reversal is written on the symbol (`LinkInGrid`) rather
than left for a reader to discover from the diff. The tab-stop half is
unreversed and is asserted in the same test as the new behaviour, so the two
cannot drift apart.
