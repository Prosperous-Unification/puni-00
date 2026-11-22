# verify — notes-editor-done

## Commands

| Command                                                   | Result  |
| --------------------------------------------------------- | ------- |
| `openspec validate --all --json`                          | PENDING |
| `nx run fe-01:typecheck`                                  | PENDING |
| `nx run fe-01:lint`                                       | PENDING |
| `nx run fe-01:test:unit`                                  | PENDING |
| `nx run fe-01:test`                                       | PENDING |
| `playwright test` hover-cards (`CI=1 E2E_PORT_SHIFT=500`) | PENDING |

## Failure proofs

| Check                                                                      | Injected fault                                             | Watched failure                                                                                   |
| -------------------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `Escape saves what was typed and closes the notes editor` (jsdom)          | the Escape branch removed from the Name cell's `onKeyDown` | `expected '## Risks' to be '## Risks\n\nand a mitigation'`                                        |
| `Escape saves the note and closes the editor` (Chromium)                   | the same                                                   | `Escape left the notes panel up · Expected: 0 · Received: 1`                                      |
| `the Done button beside the notes saves and closes the editor too` (jsdom) | the button's `blur()` removed                              | `expected '## Risks' to be '## Risks\n\n- one more'`                                              |
| `Done is the thing under the pointer, and closes the editor` (Chromium)    | the button's `pointerEvents` left to the panel's `none`    | `Done is not what the pointer lands on · Expected: "Done writing notes for 010" · Received: "TD"` |

The Chromium pointer-events check is the one jsdom cannot make: a button drawn over a
`pointer-events: none` panel with the same declaration renders and reads as a button, and only a
hit test in a browser sees the click fall through to the row behind.

## Historical verification supplement

The following results apply to the September 12, 2026 release in
[upstream PR 415](https://github.com/Prosperous-Unification/wbs-tool-v1/pull/415).
The head was `efb40f8e3fe76bfa01ab6915e7c6360467dcd9b6` and the merge was
`c30af8ca956fafec2bda25e5398b2158d0f8e763` at 12:15:33 UTC.

| Original check                    | Author's recorded result                                        |
| --------------------------------- | --------------------------------------------------------------- |
| OpenSpec all                      | 76 of 76 passed                                                 |
| Frontend typecheck                | Passed                                                          |
| Frontend lint                     | Passed                                                          |
| Frontend Unit                     | 31 files, 528 passed                                            |
| Complete frontend tests           | 103 files, 2,646 passed, plus 2/3 zoned                         |
| Shifted hover-cards browser cases | Three relevant cases passed for Escape, Done and panel behavior |

The [CI run](https://github.com/Prosperous-Unification/wbs-tool-v1/actions/runs/34692320396)
recorded gate job `103549652227`, Layout Gate shard jobs
`103549652303`, `103549652291`, `103549652344`, `103549652284` and
Pixels job `103550933444` as successful at that head. The shifted
local browser result covers the three selected cases. The archived
original command table and four fault proofs preserve the
[public verification blob](https://github.com/Prosperous-Unification/puni-00/blob/9739ffc29cf11a559ad7c1b29e1ffe133b434ae4/openspec/changes/notes-editor-done/verify.md)
`6db4604467dc4b6966f9c73039427a319b049bae`.

At the November 21 archive, OpenSpec reported the historical changes as
`sdd-lean`, with design ready and `isComplete: false`. The four checked
tasks and existing four-file record were accepted for the reversible
archive. These historical runs apply to their own upstream head.
