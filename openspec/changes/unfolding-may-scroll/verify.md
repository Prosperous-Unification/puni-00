# Verification

Everything below was run for this change, on this branch's own head. Nothing is
quoted from another change's run.

## Where things ran

This box (`h1claw`) runs no test suite and no build — Dany's rule, enforced by a
`PreToolUse` hook. h2puni ran the unit suite under a real node (`~/uf-unit.sh`,
`node node_modules/vitest/vitest.mjs run …`) and the browser gate in the official
Playwright image (`~/uf-e2e.sh`); CI ran the whole gate plus `pixels`.

The landmine those scripts exist for is unchanged: `bunx vitest` under bun on
h2puni dies in its own worker bootstrap and `nx run fe-01:test` wraps it and
exits 0, so a green `run-many -t test` on that host says nothing about fe-01.

**This change is stacked on `spreadsheet-geometry` (PR #54)**, whose branch is
its base: the two rewrite the same regions of `wbs-table.tsx`,
`wbs-table.test.tsx` and `e2e/layout.spec.ts`, and the width figures quoted here
(348 for an open role, 1471 for one open, 1723 for two) are that change's. If
#54 is not merged first this needs a rebase, not a re-derivation.

## The gate

| command                                          | where  | result                     |
| ------------------------------------------------ | ------ | -------------------------- |
| fe-01 unit suite under node                      | h2puni | UNIT_RESULT                |
| `bun run e2e`                                    | h2puni | E2E_RESULT                 |
| `bunx nx format:check --all`                     | h2puni | FORMAT_RESULT              |
| `bunx nx run-many -t lint typecheck --parallel=2` | h2puni | LINT_RESULT                |
| `bunx nx run-many -t test lint typecheck build`  | CI     | GATE_RESULT                |
| `bun run e2e` (`pixels`)                         | CI     | PIXELS_RESULT              |
| `openspec validate --all --json`                 | CI     | OPENSPEC_RESULT            |

## The faults, watched

Each injection was reverted with `git checkout -- .` before the next.

| #   | Fault injected                                                        | Test that went red                                                                                                                                                          | What it said                                                                                                                              |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `toggleRole` put back to the accordion, `current.includes(roleId) ? [] : [roleId]` | `unfolds each role on its own, and leaves the others open`; `walks both open roles in turn, and the grid arrows cross between them`; **in Chromium** `opens every role at once, scrolls the frame for it, and holds the pinned block` | `Unable to find a label with the text of: Dev optimistic for 010`; the same for `Dev pessimistic for 010`; `getByLabel('Dev optimistic for 010') — element(s) not found` |
| 2   | the fold button's copy put back to "any other role folds"             | `says what the fold button does, which is no longer hiding the assignee`                                                                                                    | `expected 'Dev — show the three points behind th…' to contain 'the table may scroll sideways'`                                            |

Fault 1 is one line seen three ways on purpose. The jsdom pair says the state is
a set; only the browser can say the frame scrolls for it and the pinned block
still stands where the layout put it.

## The check that could have been vacuous, and what stops it

`opens every role at once…` asserts the frame scrolls. A frame that scrolls
because the table *fits* is not a thing, but a frame that reports
`scrollWidth > clientWidth` for some other reason is — so the test asserts
first that the width equation is **past** the frame at that viewport
(`both roles open should not fit this frame`), and only then that the frame
scrolls. Without the first assertion the second would pass on any table with a
stray overflowing descendant, which is the shape of R5 #16.

The same reasoning is why the pinned-column check reads `frame.scrollLeft > 0`
before comparing offsets: every offset it asserts is also correct in an
unscrolled table, so the scroll has to be established as a fact first.

## Assertions intentionally superseded

| old claim                                                                                       | replacement                                                                                            | fault injected                        | what was observed                                                             |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| `unfolds one role at a time, so the table still fits the window` (unit) — QA open, Dev's boxes gone | `unfolds each role on its own, and leaves the others open` — both open at 1723px, then one folded at 1471 | 1                                     | the accordion's own recorded fault is now the behaviour; see the table above  |
| `One role's estimates are unfolded at a time` (spec, `table-fits-the-screen`)                   | removed by name, with reason and migration; replaced by `Roles unfold independently, and an unfolded table may scroll` | —                                     | the spec delta carries both halves                                            |
| `holds the equation with one role unfolded…` relied on the other role folding **itself**        | it folds the other role by hand, by the button's exact name, and goes on measuring the one-open state   | —                                     | with a substring match it clicked **Unfold** instead: `expected 0, received 1` |
| the fold button promises "any other role folds"                                                 | it promises the table may scroll sideways                                                              | 2                                     | see the table above                                                           |
| `docs/plans/2026-08-08-phases-gantt-mobile-roadmap.md`'s fit language                           | an addendum saying the guarantee is the **folded** one, and that unfolded may scroll                   | —                                     | prose; the dialog's figure is unchanged and its test still pins it            |

## What did not change, and is asserted to have not

- The folded matrix: `fits every laptop width with the roles folded` and
  `gives the name column everything the other columns did not take, up to its
  cap` are untouched and green. Folded is the state a plan is read in and the
  guarantee there is exactly what it was.
- The Phases dialog's folded minimum, which `phases-dialog.test.tsx` pins
  against a real render.
- `unfoldedRoles` is still local to the reader and still unshared, and it is
  still deliberately not sanitized when a phase is removed — `columns` maps over
  the roles that exist, so a dead id selects nothing. That finding is
  `phases-ui`'s and it survives the accordion going.
