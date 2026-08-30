# verify — `parent-figure-slot`

Both slices implemented. Every figure below was read off a Chromium run in this
worktree on shifted ports; nothing here is derived.

## Commands

| Command                                                        | Result                                         |
| -------------------------------------------------------------- | ---------------------------------------------- |
| `CI=1 E2E_PORT_SHIFT=500 playwright test -g "stands a parent"` | **1 passed**                                   |
| `bunx nx run fe-01:test`                                       | **passed** (exit 0), run after the flex change |
| `bunx openspec validate parent-figure-slot`                    | valid                                          |

## Failure proofs (R5)

| Check                                         | Fault injected                                           | Observed failure                                                  | Watched              |
| --------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- | -------------------- |
| the figure stands in one slot                 | the rolled-up trio unwrapped back to a bare text node    | `Expected: 864.53125 / Received: 827.921875` — 36.6px apart       | Chromium, 2026-08-30 |
| the trio starts in one place                  | `padding` and `border` taken back off the rolled-up trio | `borderLeftWidth: "2px" / "0px"` and `paddingLeft: "2px" / "0px"` | Chromium, 2026-08-30 |
| the border is the input's, not the textarea's | written at `1px`                                         | `borderLeftWidth: "2px" / "1px"`                                  | Chromium, 2026-08-30 |

The third row is not a guard so much as how the figure was learned: `<input>`
and `<textarea>` carry different user-agent borders in Chromium, and the number
in the source is the one the browser reported rather than one assumed from the
`[data-cell-rendered]` rule beside it.

## What is not claimed

The unfolded step cell (`4.8 · VA`) is untouched and unmeasured here — it
renders `atRest` bare, exactly as before, and no assertion in this change looks
at it.
