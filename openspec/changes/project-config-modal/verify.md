# verify — `project-config-modal`

Implemented 2026-08-30 on `feat/project-config-modal`, from `main` at `a32c94b`
(with `1ac9344`, `5cedb01` and `15d61e0` merged in before the gate). Ask 3 of
`openspec/DANY-REQUEST-AUDIT-2026-08-30.md`: _"i want to hide project config
under single button that will open a modal … Capacity planning (Teams),
Priorities and Steps must each go to the project config modal under one button"_.

## Ordering, and the assumption it rests on

`tasks.md` 0.1 orders this after `steps-not-phases` so the section is named
`Steps` once. **It was built first**, against `phases-dialog.tsx` as `main` has
it, and the section is called **Phases**. The decision was made with that
change's owner (the other live session, 2026-08-30): `steps-not-phases` had seven
conflicts against `main` and no honest ETA, its `tasks.md` 0.1 allows exactly this
arm "at the cost of a follow-up rename", and the rename lands inside that change's
own sweep, whose `no rendered string says Phase or Role` test will find the tab
label and the panel's words alike. What that change will meet: `phases-dialog.tsx`
is now `phases-panel.tsx` (a rename/rename against its `steps-dialog.tsx` — take
theirs, `steps-panel.tsx`), `PhasesDialog` is `PhasesPanel`, and the strings
`Phases`, `New phase`, `Add phase`, `phase-${id}` are where they were.

## What moved, and what did not

Three toolbar dialogs became three **panels** of one `ProjectSettingsModal`
(design D1): `teams-dialog.tsx` → `teams-panel.tsx`, `priorities-dialog.tsx` →
`priorities-panel.tsx`, `phases-dialog.tsx` → `phases-panel.tsx`, tests renamed
with them and re-pointed. Each panel kept every box, write, refusal and sentence.
Each lost its `Modal` shell, its trigger, its title and its `onOpenChange`, and
gained the two contracts with the shell: `onDirtyChange(boolean)` and — for the
two that have a `Done`/`Save`/`Cancel` — `onDone()`.

**Behaviour that did change, all of it the spec's:**

- Escape, the ✕ and a click outside are **refused over an uncommitted edit or a
  write in flight in any section**, and the section holding it is shown with a
  sentence (D3). The priorities dialog used to discard its drafts on Escape; the
  phases dialog used to clear an open removal confirmation on the ✕. Both now
  refuse instead. The teams dialog already refused a close over a refusal; it
  still does, through the modal.
- `Save` on the priorities section closes the **whole modal** once the ladder has
  landed, even if the reader has since moved to another tab. The reader pressed
  Save meaning "save and leave"; the refusal in between was about the window,
  not the section.
- A phase name typed back to exactly what it was is **forgotten** rather than
  kept as a draft that happens to match — the modal reads a draft as an edit to
  refuse over, and a box saying what be-01 says is holding nothing.
- The panels are mounted when the modal opens and unmounted when it closes, so
  what each dialog used to reset in `onOpenChange` is reset by the unmount. The
  priorities drafts are seeded at mount, which is the same guarantee the old
  open-transition seeding gave without the `act(...)` warnings that killed the
  effect version on 2026-08-14.

**Behaviour that did not change:** every write, every refusal sentence, every
accessible name inside the sections. The proof is the three re-pointed suites:
their cases are the old cases with the trigger click removed and the two shell
cases moved to the modal suite.

## Assumptions, stated

- **`Phases`, not `Steps`** — above.
- **The trigger is a gear on the wide bar and a labelled button on the phone
  sheet**, chosen by `renderer` at the call site (`trigger: 'glyph' | 'labelled'`).
  D5 says "a gear glyph on the wide bar and its label in the phone sheet"; one
  control with two faces was the least machinery that says both.
- **The tab list is hand-rolled** (`role="tablist"`/`tab`/`tabpanel`, arrow keys
  on both axes, Home/End, automatic activation) rather than a new Radix
  dependency: `@radix-ui/react-tabs` is not in `package.json`, and a lockfile
  change is a thing three concurrent sessions would each have to carry.
- **The remembered section is stored as the bare id**, not JSON, so the claim
  check is `isSettingsSection(stored)` and nothing else. A `7` and a `'teams'`
  are the two shapes a reader can put there.
- **The modal is `sm:max-w-2xl`** (672px) rather than `Modal`'s 512px default,
  because the tab column takes ~144px on the left and the priorities row is five
  boxes wide.

## Commands

| Command                                                                                       | Result                                                                                                                                                                       |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bunx tsc --build --force apps/fe-01/tsconfig.app.json`                                       | clean                                                                                                                                                                        |
| `bunx tsc --build --force apps/fe-01/tsconfig.e2e.json`                                       | clean                                                                                                                                                                        |
| `bunx eslint` over every touched file                                                         | 0 errors (the one `exhaustive-deps` warning is `main`'s)                                                                                                                     |
| `vitest run` `teams-panel` / `priorities-panel` / `phases-panel` / `project-settings-modal`   | **24 / 18 / 30 / 15 pass**, 0 fail                                                                                                                                           |
| `vitest run wbs-table.test.tsx plan-cards.test.tsx`                                           | **667 pass**, 0 fail (after one stale opener re-pointed)                                                                                                                     |
| `git diff --stat main..HEAD -- apps/be-01 apps/gw-01 apps/mcp-01 libs tools bin`              | **empty** — this change reaches fe-01 and nothing else                                                                                                                       |
| `bunx nx run-many -t test lint typecheck build -p fe-01`, under the canonical lock            | **61 files, 1925 pass, 0 fail**; all four targets green                                                                                                                      |
| `bunx nx format:check --all`                                                                  | clean                                                                                                                                                                        |
| `bunx openspec validate --all --json`                                                         | **88 of 88**                                                                                                                                                                 |
| `CI=1 E2E_PORT_SHIFT=1900` whole Playwright gate, serialised, escapes stripped, planned = ran | run 1: 239 / 239 / 232 pass, 6 fail. run 2, after the fixes below: **239 planned / 239 ran / 236 passed, 2 failed, 1 skipped** — the two are the host's documented date pair |

The reachability line is the attribution for the three `tool-*` projects that
time out under load on this host (`openspec/HANDOFF-2026-08-30.md`): a diff that
does not touch `tools/` or `bin/` cannot reach them, however starved the machine
is when they run, so the gate is fe-01's four targets plus format and openspec.

## What the whole browser gate caught that nothing else could

The first full run reconciled — `Running 239 tests`, 239 numbered, 232 + 6 + 1 =
239 — and its six failures split three ways:

| Failure                                                            | Whose                                                                        |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `keyboard.spec.ts:516`, `:660`                                     | the host's documented non-US date pair                                       |
| `plan-surface.spec.ts:253`                                         | fixed on `main` at `1ac9344`; this branch was behind and has since merged it |
| `layout.spec.ts:1736`, `mobile.spec.ts:376`, `mobile.spec.ts:1372` | **this change's, and missed by every filtered run**                          |

The three were stale openers: `mobile.spec.ts` was never swept at all, and
`layout.spec.ts` had a second `Phases` opener past the one that was fixed. Each
clicked a toolbar button that no longer exists and died on a 60-second locator
timeout or a missing dialog — invisible to the jsdom suites, which were green
throughout, and invisible to a filtered browser run of the specs this change
"obviously" touched.

That is `AGENTS.md`'s `linked-row-hover` rule paid a second time: **a change that
edits a shared surface has no business believing a filtered run.**

One of the three needed more than a rename. `layout.spec.ts`'s phase-removal loop
pressed Escape once per phase; the modal refuses a close while a section holds a
write in flight, and the removal's reread lands a moment after the `Remove` button
goes — so a single press raced. It presses until the surface is gone now, which is
the honest wait for a surface that is allowed to refuse.

And `mobile.spec.ts`'s 44px sweep now measures the settings modal's **tab list**,
a control the phone gained with this change that nothing had ever measured.

Both of this change's own browser cases passed in that run: `the toolbar keeps its
1280 budget with one settings control` (224) and `opens on its control, offers
three sections, and closes back onto it` (225).

**Run 2, after the three fixes and after merging `main`: 239 planned, 239 ran,
236 passed, 2 failed, 1 skipped.** The two are `keyboard.spec.ts:516` and `:660`,
the non-US-host date pair `apps/fe-01/playwright.config.ts` documents and which
fail on `main` as well. Every count read with the escapes stripped and
planned-vs-ran reconciled, per `openspec/HANDOFF-2026-08-30.md`.

## The toolbar budget, and the reading that would have been unfailable

`tasks.md` 4.1 asks that "the folded toolbar at 1280 is no wider than before,
with the pre-change figure pinned as a number". Measured on `main` at `1ac9344`
in Chromium, the obvious reading of that sentence **cannot fail**: the bar's
content width at 1280 is `1248px`, which is the bar's own width, because the
eighteen controls already wrap to a **second row**. A full bar measures its own
width whatever is on it — the check would pass with three buttons added and pass
with ten removed.

What does move is what the bar has to **lay out**: every control's width plus the
gaps between them, `1445.33px` over 18 controls at a 6px gap, across `2` rows.
Both are pinned in `e2e/project-settings.spec.ts`, and the spec asserts a
precondition first — at least 16 controls — so a bar that lost something else
cannot satisfy the budget by shrinking.

That is `plan-toolbar-controls-gate`'s own lesson applied one change later: a
budget pinned to the wrong bar, or resolved from the current one, is decoration.

## Which tree the figures above describe

Every gate figure in this document was measured at **`da2534f`**. The branch has
moved since, and the delta is **comment-only** — ten files, 21 insertions, 17
deletions, every changed line inside a `//` or `/* */` block. Verified rather
than asserted:

```
$ git diff da2534f..HEAD -- '*.ts' '*.tsx' \
    | grep -E '^[+-]' | grep -vE '^(\+\+\+|---)' \
    | grep -vE '^[+-]\s*(\*|//|/\*)' | grep -vE '^[+-]\s*$'
```

returns one line, and that line is inside a `/* */` block in
`directory-page.tsx` whose continuation lines carry no `*` prefix. `tsc --build
--force` is clean at `HEAD`.

The commits are the cross-reference repair: every live JSDoc pointer to
`teams-dialog.tsx`, `priorities-dialog.tsx` or `phases-dialog.tsx` — files this
change renamed — resolved to nothing. `openspec/changes/*` and `docs/plans/*`
were deliberately left alone, per `steps-not-phases` 2.2: a change records what
was decided in the words of its day.

Stated because a verify table is a measurement of a tree and the tree moves —
the fault this repo met three times on 2026-08-30, most expensively as a browser
gate cited 43 minutes after the merge that invalidated it.

## Failure proofs (R5)

Eight negatives named in `tasks.md`. Six were watched by three Opus subagents in
detached worktrees at commit `9acc6b6` — each confirmed the test green on the
untouched tree, injected the fault, quoted the failure, restored, and confirmed
green again. The seventh and eighth were watched by this session. **One of the
eight was vacuous as written and is replaced; it is the last row.**

| Check                                         | Fault injected                                                                                                                                  | Test that saw it fail                                                                                                                                          | Failure text                                                                                                                           |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| the panels stay mounted (D2)                  | the three `hidden` tabpanels rendered conditionally on `shown === id`                                                                           | `a half-typed value survives a look at another section`                                                                                                        | `AssertionError: expected '' to be '7'`                                                                                                |
| a dirty section refuses the close (D3, modal) | `requestClose`'s `if (first !== undefined) {…}` refusal deleted                                                                                 | `an in-flight write holds the modal open and is shown`; `the ✕ is refused the same way, and says which section is holding`                                     | `Unable to find an accessible element with the role "dialog" and name "Project settings"` — both                                       |
| …and the priorities section reports it        | `const dirty = false` in `priorities-panel.tsx`                                                                                                 | `an in-flight write holds the modal open and is shown`                                                                                                         | the same, the modal closed over a ladder in flight                                                                                     |
| …and the teams section reports it             | `const dirty = false` in `teams-panel.tsx`                                                                                                      | `the ✕ is refused the same way, and says which section is holding`                                                                                             | the same, over a typed capacity                                                                                                        |
| …and the phases section reports it            | `const dirty = false` in `phases-panel.tsx`                                                                                                     | `refuses to close over a confirmation nobody has answered`                                                                                                     | the same, over an open removal                                                                                                         |
| the remembered section is a claim (D4)        | `isSettingsSection` guard replaced by `return stored as SettingsSection`                                                                        | `an unrecognised remembered section is dropped, and the first is shown`                                                                                        | `expect(element).toHaveAttribute("aria-selected", "true")` — `Received: aria-selected="false"`                                         |
| one control, no separate ones (3.1)           | `<Button>Teams</Button>` left mounted beside `<ProjectSettingsModal>` in `toolbarControls`                                                      | `one control opens every project setting, and no separate control remains`                                                                                     | `AssertionError: expected [ <button …(2)></button> ] to have a length of +0 but got 1`                                                 |
| the toolbar budget (4.1)                      | one control added whose name matches none of the three, so the precondition passes and the bar is merely wider                                  | `the toolbar keeps its 1280 budget with one settings control`                                                                                                  | `1465px of controls to lay out, against the 1445.33px the bar had with three buttons` — `Expected: <= 1447.33 / Received: 1464.703125` |
| the focus comes back to the trigger (3.2)     | **`data-takes-the-focus` on the trigger — watched PASSING; see below.** Replaced by: `ModalTrigger` swapped for a plain `Button` with `onClick` | `closing project settings puts the focus back on its trigger` (`plan-cards`); `a clean modal closes from any section, and gives the focus back to its control` | `expected <body style><div>…(1)</div></body> to be <button …(4)>…(1)</button>` — both                                                  |

**The three `dirty = false` faults were also run against `a half-typed value
survives a look at another section`, which passed every time.** Expected and
recorded: the panels stay mounted whatever they report, so that test cannot see a
reporting fault and is not a substitute for the three above it.

### The budget negative, and the assertion the obvious fault never reaches

Slice 4.1's `Proof:` first named one fault: restore `Teams` and `Priorities`
beside the settings control. Watched, that fails — and **on the wrong
assertion**. The test checks a precondition first (no separate Teams, Priorities
or Phases control remains), so the run stops at `expect(locator).toHaveCount(
expected) — Expected: 0 / Received: 1` with the width assertion **never
evaluated**. A `Proof:` naming only that fault would be evidence for the
precondition and none at all for the budget it is written under.

The fault that reaches the width is one control whose **name matches none of the
three**, so the precondition passes and the bar is merely wider:
`<Button variant="outline" size="sm">Capacity planning and priorities</Button>`.
Watched failing on

```
Error: 1465px of controls to lay out, against the 1445.33px the bar had with three buttons
Expected: <= 1447.33
Received:    1464.703125
```

Both are recorded, because they prove different lines. This is `AGENTS.md`'s
**"inject the fault the check is about, not the one that is easy to inject"**,
and it is the second time in this change that a `Proof:` written before the run
named something the run did not do — the first being the vacuous one below.

### The vacuous one, and what it was replaced with

Slice 3.2 is written as "the control carries no `data-takes-the-focus`", and the
first `Proof:` on its test said the attribute had been injected and watched
failing. It had not been watched. Run in isolation it **passed with the fault
in**: `closingControlIn` returns nothing for a control with `aria-haspopup`, so
the sheet never reads the mark off a trigger that opens a surface of its own, and
its presence changes nothing. Nothing to delete — only a claim to withdraw
(`AGENTS.md`, "delete the guard whose removal you cannot see"). The restore is
guarded by the `ModalTrigger`, not by the attribute's absence, and that is the
fault now named, watched failing in two suites with the focus left on `<body>`.

Written down because it is the day's pattern one more time: a `Proof:` comment
is an artefact that looks like a conclusion and is a claim until the run.

## Skipped or unavailable checks

- `bin/h2puni-gate.sh` is that host's; this is a Mac. The four fe-01 targets run
  under `bin/with-heavy-lock.sh`, serialised behind the other sessions' gates.
- The `tool-*` projects are not run by this change's gate; the reachability line
  above is why, and the handoff records that their suites assert contention
  behaviour and are uninterpretable beside another heavy job.
