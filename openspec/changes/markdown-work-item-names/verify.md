# verify — `markdown-work-item-names`

Not yet implemented.

## The decision this reverses

`hover-preview.tsx` deliberately rendered the name as text, with the reason
written on the symbol. That reason survives as D2 — the name is still never
composed into markdown source — and only the "nobody writes markdown in it"
half is reversed. The JSDoc is rewritten in the same commit, not left standing
over code that no longer does what it says.

## Commands

| Command                                                                           | Result  |
| --------------------------------------------------------------------------------- | ------- |
| `bin/h2puni-gate.sh`                                                              | not run |
| `openspec validate --all --json`                                                  | not run |
| `CI=1 bunx playwright test --config apps/fe-01/playwright.config.ts` (whole gate) | not run |

## Failure proofs (R5)

| Check                              | Fault injected                            | Test that saw it fail                   | Watched |
| ---------------------------------- | ----------------------------------------- | --------------------------------------- | ------- |
| a block marker is shown, not eaten | block map deleted so children render      | `a heading marker is shown, not eaten`  | pending |
| a link is not a tab stop           | a real `<a href>` rendered                | `a link in a name is not a tab stop`    | pending |
| the heading is not parser-made     | swapped for `` `# ${name}` `` composition | `the heading is not made by the parser` | pending |
| every face uses one renderer       | one face left raw                         | that face's emphasis case               | pending |
| the export stays raw               | export routed through the renderer        | `an export carries the markdown source` | pending |
| **the row height never moves**     | block allowlist removed                   | the Chromium three-row measurement      | pending |

## Skipped or unavailable checks

None recorded yet.
