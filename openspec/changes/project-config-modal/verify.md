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

| Command                                                                                       | Result                                                   |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `bunx tsc --build --force apps/fe-01/tsconfig.app.json`                                       | clean                                                    |
| `bunx tsc --build --force apps/fe-01/tsconfig.e2e.json`                                       | clean                                                    |
| `bunx eslint` over every touched file                                                         | 0 errors (the one `exhaustive-deps` warning is `main`'s) |
| `vitest run` `teams-panel` / `priorities-panel` / `phases-panel` / `project-settings-modal`   | **24 / 18 / 30 / 15 pass**, 0 fail                       |
| `vitest run wbs-table.test.tsx plan-cards.test.tsx`                                           | **667 pass**, 0 fail (after one stale opener re-pointed) |
| `git diff --stat main..HEAD -- apps/be-01 apps/gw-01 apps/mcp-01 libs tools bin`              | **empty** — this change reaches fe-01 and nothing else   |
| `bunx nx run-many -t test lint typecheck build -p fe-01`, under the canonical lock            | _pending — queued behind three other sessions' gates_    |
| `bunx nx format:check --all`                                                                  | _pending_                                                |
| `bunx openspec validate --all --json`                                                         | _pending_                                                |
| `CI=1 E2E_PORT_SHIFT=1900` whole Playwright gate, serialised, escapes stripped, planned = ran | _pending — after the budget spec below exists_           |

The reachability line is the attribution for the three `tool-*` projects that
time out under load on this host (`openspec/HANDOFF-2026-08-30.md`): a diff that
does not touch `tools/` or `bin/` cannot reach them, however starved the machine
is when they run, so the gate is fe-01's four targets plus format and openspec.

## Failure proofs (R5)

Eight negatives named in `tasks.md`. Six were watched by three Opus subagents in
detached worktrees at commit `9acc6b6` — each confirmed the test green on the
untouched tree, injected the fault, quoted the failure, restored, and confirmed
green again. The seventh and eighth were watched by this session. **One of the
eight was vacuous as written and is replaced; it is the last row.**

| Check                                         | Fault injected                                                                                                                                  | Test that saw it fail                                                                                                                                          | Failure text                                                                                     |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| the panels stay mounted (D2)                  | the three `hidden` tabpanels rendered conditionally on `shown === id`                                                                           | `a half-typed value survives a look at another section`                                                                                                        | `AssertionError: expected '' to be '7'`                                                          |
| a dirty section refuses the close (D3, modal) | `requestClose`'s `if (first !== undefined) {…}` refusal deleted                                                                                 | `an in-flight write holds the modal open and is shown`; `the ✕ is refused the same way, and says which section is holding`                                     | `Unable to find an accessible element with the role "dialog" and name "Project settings"` — both |
| …and the priorities section reports it        | `const dirty = false` in `priorities-panel.tsx`                                                                                                 | `an in-flight write holds the modal open and is shown`                                                                                                         | the same, the modal closed over a ladder in flight                                               |
| …and the teams section reports it             | `const dirty = false` in `teams-panel.tsx`                                                                                                      | `the ✕ is refused the same way, and says which section is holding`                                                                                             | the same, over a typed capacity                                                                  |
| …and the phases section reports it            | `const dirty = false` in `phases-panel.tsx`                                                                                                     | `refuses to close over a confirmation nobody has answered`                                                                                                     | the same, over an open removal                                                                   |
| the remembered section is a claim (D4)        | `isSettingsSection` guard replaced by `return stored as SettingsSection`                                                                        | `an unrecognised remembered section is dropped, and the first is shown`                                                                                        | `expect(element).toHaveAttribute("aria-selected", "true")` — `Received: aria-selected="false"`   |
| one control, no separate ones (3.1)           | `<Button>Teams</Button>` left mounted beside `<ProjectSettingsModal>` in `toolbarControls`                                                      | `one control opens every project setting, and no separate control remains`                                                                                     | `AssertionError: expected [ <button …(2)></button> ] to have a length of +0 but got 1`           |
| the focus comes back to the trigger (3.2)     | **`data-takes-the-focus` on the trigger — watched PASSING; see below.** Replaced by: `ModalTrigger` swapped for a plain `Button` with `onClick` | `closing project settings puts the focus back on its trigger` (`plan-cards`); `a clean modal closes from any section, and gives the focus back to its control` | `expected <body style><div>…(1)</div></body> to be <button …(4)>…(1)</button>` — both            |

**The three `dirty = false` faults were also run against `a half-typed value
survives a look at another section`, which passed every time.** Expected and
recorded: the panels stay mounted whatever they report, so that test cannot see a
reporting fault and is not a substitute for the three above it.

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
