# verify — `project-picker-flow`

Implemented 2026-08-29 in a worktree on `worktree-agent-a5224a1b954271501`.
Nothing here is a claim unless it quotes a run; what was **not** run is listed
under "Skipped or unavailable checks", and it includes the whole browser gate.

## Commands

| Command                                                              | Result                                                                                 |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `bunx nx run fe-01:test`                                             | **1816 passed, 2 failed** — both pre-existing and timezone-bound; see below            |
| `bunx nx run fe-01:lint`                                             | **pass** — 0 errors, 1 pre-existing warning in `wbs-table.tsx`                         |
| `bunx nx run fe-01:typecheck`                                        | **pass** — `tsc --build --force` on `tsconfig.app.json` and `tsconfig.e2e.json`        |
| `bunx openspec validate project-picker-flow --json`                  | **pass** — `"items": 1, "passed": 1, "failed": 0`                                      |
| `bunx prettier --check apps/fe-01/src/components/wbs apps/fe-01/e2e` | **pass** — `All matched files use Prettier code style!`                                |
| `bin/h2puni-gate.sh`                                                 | **not run** — out of scope for this session (asked for the three targets above)        |
| `CI=1 bunx playwright test --config apps/fe-01/playwright.config.ts` | **not run** — 3100/3200/4200 held by a dev server; see "Skipped or unavailable checks" |

### `fe-01:test`

```
 Test Files  1 failed | 56 passed (57)
      Tests  2 failed | 1816 passed (1818)
```

The two failures are in `src/components/wbs/plan-mermaid.test.ts` — `leaves a
bar crossing a weekend exactly where it was told, manualEndTime true` and
`still parses a point (unestimated/zero) as a real milestone with equal dates`
— on `expected '2026-09-03T21:00:00.000Z' to be '2026-09-04T00:00:00.000Z'`.
Three hours, which is this machine's offset (`date +%Z` → `EEST`). Proven
unrelated to this change, twice:

- Every change in this branch stashed (`git stash push -u`), the file re-run:
  `Tests 2 failed | 47 passed (49)`, the same two assertions.
- `TZ=UTC bunx vitest run … plan-mermaid.test.ts`: `Tests 49 passed (49)`.

`project-page.test.tsx` alone: **44 passed**, and with `hover-card.test.tsx`
beside it, **59 passed**.

## Failure proofs (R5)

Every fault was injected into the production file, the named test run, the
message below copied from that run, and the fault then reverted. The
production files were restored from a byte copy taken before the first
injection, and the whole file re-run green afterwards.

| Check                              | Fault injected                                                               | Test that saw it fail                                          | Watched                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| card placed outside the list       | `projectOptionAnchor` back to the option's rect, under the old `anchor` prop | `the open card leaves every option visible`                    | `the card opens at 45px in a list ending at 240: expected 45 to be greater than or equal to 240` (three more failed beside it) |
| side flip, not a clamp             | the flip replaced by `left: max(0, viewport.width - card.width)`             | `a narrow window flips the card to the left of the list`       | `expected 400 to be less than 400`                                                                                             |
| a card that fits nowhere is absent | the same clamp                                                               | `a window with room on neither side shows no card`             | `expected <div role="tooltip" …(2)>…(4)</div> to be null`                                                                      |
| card moves vertically only         | the anchor's edges recomputed from the option's rect                         | `moving down the list does not move the card sideways`         | `expected '241px' to be '246px'`                                                                                               |
| a pick blurs the picker            | `pickerBox.current?.blur()` removed from `choose`                            | `choosing a project takes the focus off the picker`            | `expected <input …(9)></input> not to be <input …(9)></input>`                                                                 |
| the re-arm waits for the list      | the re-arm moved above `await load()`                                        | `arms the rename only once the list can name the new project`  | `expected <input …(3)></input> to be null`                                                                                     |
| the old draft is discarded         | `setRename(null)` deleted from `create`                                      | `a draft armed for another project does not follow the create` | `expected 'Meant for p2' to be null`                                                                                           |
| the placeholder is selected        | `node.select()` deleted from `ProjectNameField`                              | `creating a project selects the whole placeholder name`        | `expected [ 11, 11 ] to deeply equal [ +0, 11 ]`                                                                               |
| selected **once**, on arming       | the effect's dependency list removed, so it runs on every render             | `does not put the whole draft back under the next keystroke`   | `expected [ +0, 1 ] to deeply equal [ 1, 1 ]`                                                                                  |
| the closed picker takes no caret   | `readOnly` removed                                                           | `e2e/project-picker.spec.ts` `clicking the closed picker …`    | **NOT WATCHED** — needs a browser; see below                                                                                   |

Two notes on how far the placement negatives reach, so the table is not read
as saying more than it does:

- Anchoring the card to the **option's** rect while keeping this placement is
  seen only by the exact-position assertion in `moving down the list does not
move the card sideways` (`241px` against `246px`). It is not seen by the
  overlap assertions, because an option is inset from its list by about five
  pixels and the placement's own six-pixel gap carries it clear anyway. A
  per-option anchor cannot produce two _different_ lefts at all: every option
  in a `w-full` one-column list shares its width. The inset is the whole of
  what that test has to work with, and it is stubbed deliberately for it.
- The card's own box is stubbed at 300×90 in `project-page.test.tsx`, because
  jsdom measures every element as zero and a card with no width can neither
  run out of room nor cover anything. Each overlap assertion is preceded by an
  assertion that the width is non-zero (`G gantt-calendar-axis`'s lesson).

## Skipped or unavailable checks

- **The browser gate was not run at all.** Ports 3100/3200/4200 were held by a
  developer's `bun run dev`, and `reuseExistingServer: !isCi` would have
  measured that checkout rather than this one — `LLM_README.md`'s landmine and
  R5's sixteenth entry. Consequences, all of them unverified until a Chromium
  run with the ports free:
  - `apps/fe-01/e2e/project-picker.spec.ts` is **written and never executed**.
    Every assertion in it is a claim. It carries the same warning in its own
    header.
  - **jsdom cannot be its oracle**, which is why it exists: a click's default
    action — moving the focus and placing a caret in the text it hit — is
    performed by the browser and not at all by jsdom (R5 #14/#15, and #17 in
    `T2 compact-columns`). `readOnly` on the closed picker is exactly a rule
    about that default action, so its negative can only be watched in Chromium.
  - `apps/fe-01/e2e/header.spec.ts` was edited to match this change and not
    re-run. Three edits: the two fixtures that create a project now leave the
    rename the create arms (`Escape` on `Project name`, then the combobox
    asserted back on the bar) — without it, `New project` leaves the name field
    in place of the picker and every `getByRole('combobox', { name: 'Project'
})` in that file would fail; the ten-project loop escapes the same way each
    time round; and `the portalled card follows its option when the listbox
scrolls` now asserts `cardOffset: 0` (the card on the option's row) in
    place of `cardGap: 6` (the card under it), which is the placement this
    change moves.
  - Other specs that create a project go on to click `Add work item`, which
    blurs the armed name field and cancels the unchanged rename. Reasoned, not
    observed.
- `bin/h2puni-gate.sh` not run: this session was asked for `fe-01:test`,
  `fe-01:lint` and `fe-01:typecheck`, and the gate's build and format targets
  cover projects this change does not touch. The three targets above are the
  parts of it this change can fail.
- `apps/fe-01/src/components/wbs/hover-card.tsx` is edited beyond the impact
  the proposal names (`project-page.tsx` and its test file). The placement
  policy lives in `HoverCard`, which computes it from the card's own measured
  box, so a card placed beside a list — flipped, or refused for want of room —
  cannot be expressed from the caller. The addition is a second anchor prop
  (`beside`) and one pure function (`besidePlacement`); no existing caller's
  behaviour changes, and `hover-card.test.tsx`'s 15 tests pass unchanged.
