# P `phases-ui` — verify

Every command below was run on 2026-08-09 on Dany's Mac (darwin arm64, bun
1.3.14, chromium from the Playwright cache), from the worktree at
`.claude/worktrees/agent-a93b6d4c80dc36abd` on branch `change/phases-ui`, based
on `change/header-fits-a-row` with `change/resource-leveling` merged into it.

## The merge

`git merge change/resource-leveling` (head `25c5bbe`) into a branch cut from
`change/header-fits-a-row` (head `91ae236`) — **no conflicts**, 67 files, 7061
insertions. The two branches touch disjoint trees: `resource-leveling` brings
`R1 role-crud` and `S1`/`S2` (be-01 service, repository, controller, drizzle,
four openspec changes), `header-fits-a-row` brings `H` (fe-01 chrome and
`table-frame.ts`). Merge commit `e12d8a5`. Nothing was resolved and no test from
either side was edited.

## What landed

| file                                        | what                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/lib/wbs-api.ts`                        | `addRole`/`renameRole`/`removeRole`, the modeled `in_use`, `roleRefusalSentence` |
| `src/lib/wbs-api.test.ts`                   | new — 9 tests                                                                    |
| `src/components/wbs/phases-dialog.tsx`      | new — the surface, its trigger, the counts, the cascade, the fit sentence        |
| `src/components/wbs/phases-dialog.test.tsx` | new — 21 tests                                                                   |
| `src/components/wbs/cell-input.tsx`         | `cellKey`; the refused-draft hold outside the component                          |
| `src/components/wbs/table-frame.ts`         | `foldedTableMinWidth`                                                            |
| `src/components/wbs/table-frame.test.ts`    | +3                                                                               |
| `src/components/wbs/wbs-table.tsx`          | `settleAgainstRoles`; `PhasesDialog` in the toolbar; `cellKey` at three sites    |
| `src/components/wbs/wbs-table.test.tsx`     | +6, and `fakeApi` grows real phase CRUD                                          |
| `src/components/ui/modal.tsx`               | `PageShortcutsHeld` — the rule moves inside the portal                           |
| `src/components/ui/page-shortcuts.test.tsx` | +1, the closed-modal case                                                        |
| `e2e/phases.spec.ts`                        | new — 6 browser tests                                                            |

`e2e/layout.spec.ts`, `e2e/keyboard.spec.ts`, `e2e/tailwind.spec.ts` and
`e2e/header.spec.ts` are untouched.

## Two faults the modal's first production mount found

`F shadcn-foundation` shipped `Modal` with **no production caller**. Its own
tests all open the surface first, and the app declared no dialog at all — so two
things in its contract had never been asked. `P` is the first caller, and both
came out in the first hour.

**1. A declared modal is not an open one.** `ModalContent` called
`usePageShortcutsSuspended(true)` in its own body, with a JSDoc saying why:
"Radix unmounts the content on close, so mounted and open are the same fact".
They are not. `ModalContent` is an ordinary child of `Modal`, so React runs its
body whenever the caller renders — Radix's `Presence` decides what the **portal**
renders, not whether the component function was called. The capture listener
therefore went on the moment a dialog was declared and never came off: every
page shortcut in the app was dead while the dialog was **closed**.

Observed as **49 failures** in `wbs-table.test.tsx` the moment a closed
`PhasesDialog` was mounted in the toolbar — `outdents with shift-tab` on
`expected [ '010' ] to deeply equal [ '010', '020' ]`, Ctrl+N swallowed by a
dialog nobody had opened. The rule moved into `PageShortcutsHeld`, a child of
`DialogPrimitive.Content`, and the missing case is now a test.

**2. A dialog with no trigger restores the focus to nothing.** Radix's
`onCloseAutoFocus` calls `preventDefault()` and then focuses `triggerRef`. With
the Phases button rendered beside the dialog rather than as its
{@link ModalTrigger}, the default restore was cancelled and there was no trigger
to put the focus back on — Escape left it on `<body>`. Found by the browser, on
the first run of `Escape closes it and gives the focus back to the button that
opened it`: `expect(locator).toBeFocused() failed`. The button moved inside
`PhasesDialog`; the two were one component all along.

Neither is jsdom's fault. The first was jsdom-visible and simply had no case
written for it; the second is Radix behaviour that only mattered once a real
person could press Escape.

## A check that could not fail, found and removed

The plan (agy #7) asked for `unfoldedRoles` to be sanitized on a role event: the
accordion may hold a dead id. It may — and **nothing can observe it**. `columns`
is built by mapping over `roles`, so a dead id in `unfoldedRoles` selects no role
to unfold, and `toggleRole` replaces the single slot on the next click either
way. `unfoldedRoles` is not persisted.

The sanitizer was written with the identity guard it needed, a test written for
it, and the negative watched: **with the whole `setUnfoldedRoles` block deleted,
all six tests still passed.** So the line was removed rather than shipped as the
fourteenth check that cannot fail. The test it was written for was re-anchored on
what it really measures — the columns following the phases — and re-watched
failing. `settleAgainstRoles`'s JSDoc says all of this out loud.

The identity guard's own negative (`setUnfoldedRoles((c) => c.filter(...))`,
unconditional) **did** fail — `expected <body …> to be <input …(5)></input>` —
which is why `rebuilds nothing when the phases came back the same` survives,
re-pointed at `sameRoles`, the production line that really keeps that promise.

## Failure-proof table

Every check below was watched failing with the fault named beside it, on the
production call path, on 2026-08-09.

| check                                                                    | fault injected                                                  | what failed                                                                                        |
| ------------------------------------------------------------------------ | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `reads the counts out of the refusal rather than throwing the code`      | the `in_use` branch deleted from `removeRoleAt`                 | `promise rejected "Error: in_use" instead of resolving`                                            |
| `throws an in_use with no counts rather than confirming against nothing` | `body.inUse !== undefined` dropped                              | `promise resolved "{ ok: false, reason: 'in_use', …(1) }" instead of rejecting`                    |
| `asks for the cascade only when it is given one`                         | `?cascade=true` always on the URL                               | `expected [ …(2) ] to deeply equal [ …(2) ]`                                                       |
| `holds nothing back while the modal is closed`                           | `usePageShortcutsSuspended(true)` back in `ModalContent`'s body | `expected "spy" to be called at least once` — and 49 in `wbs-table.test.tsx` with it               |
| `gives the focus back to the button that opened it`                      | `ModalTrigger` swapped for a plain `Button` with an `onClick`   | `expected <body style><div>…(1)</div></body> to be <button …(3)></button>`                         |
| `sends nothing for a name that is only spaces`                           | the `clean === ''` guard removed from `submitNew`               | `expected "spy" to not be called at all, but actually been called 1 times`                         |
| `submits the form the keystroke was aimed at`                            | `onChord` returning early for every keystroke                   | `expected "spy" to be called with arguments: [ 'Design' ]`                                         |
| `leaves a bare Enter to the form it is in`                               | `onChord` widened to fire on any `Enter`                        | `expected "spy" to not be called at all, but actually been called 1 times`                         |
| `sends nothing when the confirmation is agreed to without the box`       | the confirmation opened with `cascade: true`                    | `expected <button …(2)></button> to have property "disabled" with value true`                      |
| `grows by one folded column per phase`                                   | the role columns dropped from `foldedTableMinWidth`'s sum       | `expected 952 to be 1144`                                                                          |
| `takes the columns of a phase that has gone, unfolded and all`           | `setRoles` made to keep whatever it first loaded                | `expected <button …(2)></button> to be null` — the removed phase's fold button still in the header |
| `drops a half-typed figure for a phase that has gone`                    | the `setDrafts` sanitizer deleted                               | `expected [ '010' ] to deeply equal []` — an empty row nobody could remove                         |
| `forgets a refusal held for a phase that has gone`                       | the `forgetRefusedDrafts` call deleted                          | `expected '9' to be undefined`                                                                     |
| `keeps a draft be-01 refused when a new phase rebuilds every column`     | the restore in `takeNode` deleted                               | `expected '' to be 'Strip the wiring'`                                                             |
| `rebuilds nothing when the phases came back the same`                    | `sameRoles` made to answer false                                | `expected <body><div>…(1)</div></body> to be <input …(5)></input>`                                 |
| — (**not shipped**)                                                      | the whole `setUnfoldedRoles` sanitizer deleted                  | **nothing failed.** 6 passed. The line was removed; see above.                                     |

## The gate

```
bunx nx format:check --all                                        → clean, exit 0
bunx nx run-many -t test lint typecheck build --parallel=2        → 21 projects, green
bunx openspec validate --all --json                               → 45 items, 45 passed, 0 failed
```

be-01: `485 pass, 0 fail` across 49 files. fe-01: `684 pass` across 32 files
(`653` before this change: +9 `wbs-api.test.ts`, +21 `phases-dialog.test.tsx`,
+3 `table-frame.test.ts`, +6 `wbs-table.test.tsx`, +1 `page-shortcuts.test.tsx`,
and `wbs-table.test.tsx` grew a phase-CRUD fake).

One lint error was fixed rather than suppressed: `row.estimates[roleId] !==
undefined` in the fake is dead code under `Record<string, Days>`, and
`Object.hasOwn` is the question that is actually being asked.

## The browser

Ports **3107 / 3207 / 4207**, dedicated to this change — two earlier agents
collided sharing the defaults. `playwright.config.ts` was patched locally
(`baseURL`, the three `webServer` URLs, `PORT`/`GW_URL`/`BE_URL` and the three
`VITE_*` overrides, `bunx vite --port 4207 --strictPort`) and **reverted before
the commit**; `git diff` on that file is empty on every commit of this branch.

```
CI=1 bunx nx run fe-01:e2e     → 47 passed (50.0s)
```

| spec               | tests | state            |
| ------------------ | ----- | ---------------- |
| `layout.spec.ts`   | 22    | green, untouched |
| `keyboard.spec.ts` | 8     | green, untouched |
| `tailwind.spec.ts` | 6     | green, untouched |
| `header.spec.ts`   | 5     | green, untouched |
| `phases.spec.ts`   | 6     | new              |

The first run of the new spec found the focus fault above and a locator
collision of its own worth recording, because it is the same shape as a check
that cannot fail: the account menu's button is named after the account, and
`getByRole('button', { name: 'Phases' })` matches an accessible name by
**substring** — with a username of `e2e-phases-…` it resolved to two elements.
`exact: true` on all seven lookups, and the throwaway account renamed. Six tests
failed on it loudly, which is the good case; a query that had matched only the
account menu would have passed against a table with no dialog in it at all.

## C3-4, closed

`openspec/changes/table-geometry-and-tab-order/verify.md` left C3-4 open: the
three-role Playwright fixture could not be built, because a project could not
have three roles. `a third phase gives the table a third set of columns` builds
one through the surface and measures what arrives — two `-final` columns and
`min-width: 1144px` before, three and `1240px` after, with the dialog's own
sentence (`3 phases need ≥1240px before the table scrolls sideways.`) asserted
while it is still on screen. The number comes from `foldedTableMinWidth`, which
sums `COLUMN_WIDTHS` and `FLEXIBLE_FLOOR` through `tableMinWidth` — the same
function the `<table>`'s `min-width` is rendered from, so the sentence and the
layout cannot disagree.

## What this change did not do

- **No reordering of phases.** `role.position` arrived with `S1`; dragging them
  about is that change's.
- **No live phase list.** The dialog re-reads through the same refetch as
  everything else; it holds no subscription of its own.
- **Nothing inside `[data-grid]`.** `git diff` adds no utility class to a `<td>`,
  a `<th>` or anything in one. The dialog is chrome and styles as chrome.
- **`unfoldedRoles` is not sanitized**, deliberately — see above.
- **The `role_added`/`role_renamed`/`role_removed` events are not handled by
  name.** They arrive on the socket, `project-stream.ts` ignores every payload by
  design and calls `onChange`, and `refresh` re-reads the roles beside the tree.
  A named handler would be a second path to the same reread. The blast-radius
  settling therefore happens on **every** read, not only on a role event, which
  is stricter than the plan asked for and one rule rather than two.

## Review sweep, 2026-08-09 — bare Enter had no browser proof

`phases-dialog.test.tsx`'s `leaves a bare Enter to the form it is in` asserts
that `onChord` claims nothing on an unmodified Enter, so the browser's own
implicit form submission does the work. In jsdom that assertion is satisfied by
the **environment**, not by the code: jsdom performs no implicit submission at
all, so a dispatched `keydown` reaches no `submit` handler whatever `onChord`
does with the event. The test cannot tell "the chord handler left Enter alone"
from "nothing here submits on Enter, ever", and no browser test pressed a plain
Enter in the dialog.

`a bare Enter in the new-phase box adds the phase` in `e2e/phases.spec.ts` now
does, beside the `Ctrl+Enter` case. It asserts the phase twice: the
`Remove Design` button inside the dialog, and — after Escape — the
`Unfold Design estimates` control on the table behind it, so a dialog that
listed a phase the refetch never put on the plan would still fail.

### Watched, and the half that stayed green

| check                                                           | fault injected on the production path                             | observed                                                                                                                            |
| --------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `e2e/phases` › a bare Enter in the new-phase box adds the phase | an unconditional `event.preventDefault()` at the top of `onChord` | **1 of 7 failed** in Chromium — `expect(locator).toBeVisible() failed … waiting for getByRole('button', { name: 'Remove Design' })` |
| `phases-dialog` › leaves a bare Enter to the form it is in      | the same fault, same run                                          | **21 of 21 passed** — the point: this is the check that could not fail                                                              |

The second row is the finding. The jsdom test is kept — it still says what
`onChord` must not claim, and it is the faster oracle for the chord's own
routing — but it is now labelled as the half it is, with the browser named
beside it.
