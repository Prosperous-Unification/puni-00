# verify — notes-done-by-the-marker

## Commands

| Command                                                   | Result                                   |
| --------------------------------------------------------- | ---------------------------------------- |
| `openspec validate --all --json`                          | 78 items, 78 passed                      |
| `nx run fe-01:typecheck`                                  | green                                    |
| `nx run fe-01:lint`                                       | exit 0                                   |
| `nx run fe-01:test:unit`                                  | 31 files, 528 passed                     |
| `nx run fe-01:test`                                       | 103 files, 2647 passed, + 2/3 zoned      |
| `playwright test` hover-cards (`CI=1 E2E_PORT_SHIFT=500`) | 4 relevant passed; whole file left to CI |

## Failure proofs

| Check                                                                            | Injected fault                                    | Watched failure                                                               |
| -------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| `Done stands by the notes marker, and closes the editor when pressed` (Chromium) | `right: 24` on the button changed to `right: 400` | `Done is not beside the notes marker · Expected: <= 12 · Received: 384.40625` |
| `the Done button beside the notes saves and closes the editor too` (jsdom)       | the button's `box.current?.blur()` removed        | `expected '## Risks' to be '## Risks\n\n- one more'`                          |

## Historical verification supplement

The following results apply to the September 12, 2026 release in
[upstream PR 420](https://github.com/Prosperous-Unification/wbs-tool-v1/pull/420).
Implementation `6f75ca4e0a14d3c790664f4968a6acb1605a1387` followed preview
unification `966c4e685f3c0ff9449a953b7844d12c513c494d`. The final head
`3ce26d7c37777457bbd815265029e08ca2489b11` includes the top inset
adjustment. The merge was `3decf3f750f07af69381a4a07183abcda829abb0`
at 15:45:05 UTC.

The [CI run](https://github.com/Prosperous-Unification/wbs-tool-v1/actions/runs/34698470904)
recorded gate job `103565929907`, Layout Gate shard jobs
`103565930007`, `103565930025`, `103565930044`, `103565930004` and
Pixels job `103567310171` as successful at that head. The author's
shifted local browser result covers the four selected cases. The
original verification table and both fault proofs preserve the
[public verification blob](https://github.com/Prosperous-Unification/puni-00/blob/9739ffc29cf11a559ad7c1b29e1ffe133b434ae4/openspec/changes/notes-done-by-the-marker/verify.md)
`343c5ad16d99ab0f3caa962ff16e6136a13b7797`.

At the November 21 archive, OpenSpec reported the historical changes as
`sdd-lean`, with design ready and `isComplete: false`. The three checked
tasks and existing four-file record were accepted for the reversible
archive. The amended delta preserves the original scenario titles and
the accepted button placement when merging into the canonical spec.
These historical runs apply to their own upstream head.
