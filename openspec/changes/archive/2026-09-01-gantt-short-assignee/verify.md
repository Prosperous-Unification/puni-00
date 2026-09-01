# verify — `gantt-short-assignee`

Both slices implemented. Every figure below was read off a run in this worktree
on 2026-08-31; nothing here is derived, and what was not run says so.

## Commands

| Command                                                             | Result                                        |
| ------------------------------------------------------------------- | --------------------------------------------- |
| `E2E_PORT_SHIFT=1900 bunx playwright test` (the whole browser gate) | **265 passed / 0 failed in 6.9m, exit 0**     |
| `bunx nx test fe-01`                                                | **1995 passed** over 63 files, exit 0         |
| `bunx vitest run … gantt`                                           | **287 passed** (160 + 127), exit 0            |
| `bunx nx lint fe-01`                                                | 0 errors, 1 pre-existing warning              |
| `bunx nx typecheck fe-01`                                           | exit 0 — `tsc --build --force`, both projects |
| `bunx nx format:check --all`                                        | exit 0                                        |
| `bunx openspec validate gantt-short-assignee --json`                | 1 passed / 0 failed                           |
| `bin/h2puni-gate.sh`                                                | **not run** — exits 127 on this macOS host    |

The one lint warning is `wbs-table.tsx`'s `columns` memo, which is
`LLM_README.md`'s landmine #1 and deliberate. Pre-existing and untouched.

`tool-bootstrap:test` is excluded and **was not run**: pre-existing timeout on
this host, recorded in `teams-and-assignees/verify.md`. Nothing here touches it.

## Failure proofs (R5)

| Check                                              | Fault injected                                                        | Observed failure                                                                                                                          | Watched      |
| -------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| a bar names its assignee short at **every** width  | the whole-name candidate restored as `barLabelFor`'s first answer     | `expected 'Kat Bloom' to be 'KB'` plus four rendered `expected 'Kat · strip - strip' to be 'KA · strip - strip'` — 6 failed \| 281 passed | jsdom, 08-31 |
| the chart names a person the way the table does    | `gantt-panel.tsx`'s deleted `initialsOf` restored and pointed back at | `expected 'V' to be 'VA'` plus four rendered `expected 'K · strip - strip' to be 'KA · strip - strip'` — 5 failed                         | jsdom, 08-31 |
| the blank-name guard in front of a throwing helper | `personName.trim() === ''` deleted from `barLabelFor`'s guard         | `an assignee with no name cannot be initialled`, thrown out of the render — 1 failed \| 159 passed                                        | jsdom, 08-31 |

The second proof is the one worth reading twice. `Kat Bloom` initials to `KB`
under **both** rules, so the whole-name case cannot see the duplicate-function
fault at all — which is exactly how two `initialsOf`s with different answers sat
in one app without anything ever going red. The case that catches it uses
`vadym`, a one-word name, and asserts against `initials.ts` itself rather than
against a literal: a literal would be a third copy of the rule.

## Not covered in a browser, and why

The three checks above are jsdom's, and that is deliberate rather than a gap.
What this change alters is **which string a label holds** — `textContent`, which
jsdom reads exactly — and both call sites of the two changed functions (the live
overlay at `gantt-panel.tsx` and the standalone `.svg` builder) are covered by
jsdom cases that go through the rendered component. There is no pointer, focus,
layout or colour fact here, which is the class R5 #14/#15/#18 are about.

**What was not added:** a browser case asserting a bar's label in Chromium. It
would need an assignee on a slice, and seeding one in a browser fixture means
driving the directory and the assignee slot — a flow this change does not touch
and whose fixture does not exist in `e2e/`. The whole browser gate was run
instead, and its 265 cases include the chart's own geometry and download cases
drawing bars through the changed functions with nobody assigned.
