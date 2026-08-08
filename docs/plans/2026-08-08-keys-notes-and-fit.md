# Keys, notes-in-the-name, and a table that fits — plan v2 (2026-08-08)

v1 was reviewed by codex (`tmp/review-codex-keys-fit.txt`, 14 findings) and agy
(`tmp/review-agy-keys-fit.txt`, 9 findings) on 2026-08-08. Every real finding is
folded in; the per-finding disposition table is at the bottom. Dany's v1.1
amendments (`tmp/plan-keys-fit-amendments-v1.1.md`) are folded in too: **Ctrl
family confirmed; accordion confirmed; Cmd+Enter lands in Name confirmed;
pinning STAYS; assignee visible+editable in the folded role view via `@`,
Slack-style; every column compacted.**

Dany's requirements:

- **R1** Notes become part of the Name field, after a newline, reached by Enter.
- **R2** Keys: Tab/Shift+Tab as they are. Enter loses "new item". Cmd+Enter next
  row / create. New-item chord. hjkl motion chords. Backspace as is. Ctrl+D ×2
  deletes the row. (Cmd+N and Cmd+H are unavailable to web pages — Chromium
  reserves File→New; macOS owns Hide. Dany approved the Ctrl family instead.)
- **R3/R4** Depends-on and Number much narrower; **v1.1: compact everything.**
- **R5** Delete & Duplicate under a per-row ⋯ menu; more actions later.
- **R6** Crucial elements always on screen; no horizontal scroll.
- **v1.1** Assignee visible and assignable from the _folded_ estimate cell (`@`
  to assign, add-new-contributor kept).

**Goal:** a keyboard you can plan with — one gesture family for structure, one
for motion, one for the item's own text — on a table that always fits the window.

**Architecture:** the domain model does not move: `name` and `notes` stay two
fields in be-01; the Name cell becomes their composite editor and the Notes
column disappears. The width table stays the single source of truth; the table
flips from "fixed total, scroll the overflow" to "100% of the frame, Name
absorbs the remainder", with sticky-left pinning **kept as the proven backstop**
for viewports below the table's minimum. The command keys are Ctrl-chords
attached per cell class through one routing matrix, and the cheat-sheet
registry + `PROVEN_BY` cross-check keep the shipped keymap and the documented
one identical (as a floor, not as the migration search — see change 4).

**Tech stack:** unchanged. No new dependencies.

**Sequencing (reordered per codex #2 — every change's width budget must be
truthful in its own commit):**

1. `actions-menu` (R5) — frees 70px.
2. `notes-live-in-the-name` (R1) — frees 260px, prerequisite for the key remap.
3. `table-fits-the-screen` (R3/R4/R6 + v1.1 compaction + folded `@`-assignee).
4. `command-keys` (R2).

---

## 0. Keyboard reality, restated with sources (codex #14, agy #6)

- Chromium's macOS hotkey documentation lists File→New among the commands a
  page cannot override; **Cmd+N never reaches page JS.** Apple's HIG owns
  **Cmd+H** (Hide) at the OS layer. Verified claims, not vibes:
  chromium.googlesource.com `docs/mac/about_hotkeys_and_keycodes.md`.
- **Ctrl+N is equally reserved on Windows/Linux Chrome.** The plan binds
  **Alt+N as the same action's second chord from day one** (matched on
  `e.code === 'KeyN'` + `altKey`, because macOS turns Alt+N into a dead key in
  `e.key`). Ctrl+N stays the documented primary on macOS.
- **Acceptance probe before change 4 is built** (codex #14): a throwaway page
  (or dev console listener) on Dany's actual Chrome confirming each chord —
  Ctrl+H/J/K/L, Ctrl+N, Ctrl+D, Cmd+Enter, Alt+N — arrives at a focused
  textarea and that `preventDefault()` suppresses the native action. Ten
  minutes, kills the dead-on-arrival risk. Synthetic Playwright events cannot
  prove OS interception; this probe is the evidence.
- **The accepted trade, stated where Dany decided it:** Ctrl+H/D/K/N shadow
  macOS's emacs-style text edits inside our cells (agy #2 rates this critical;
  Dany chose it with the trade named). The guardrails that keep the worst case
  recoverable: Ctrl+D never deletes on a single gesture (arm/confirm below,
  `event.repeat` ignored, D must be _released_ between presses — a held or
  habitual repeat forward-delete cannot confirm), and a deleted row is
  recoverable with Cmd+Z through the existing undo stack. Ctrl+H/J/K/L and
  Ctrl+N move focus or add a row — annoying to an emacs-habit user,
  non-destructive, and reversible.

---

## 1. Change `actions-menu` (R5) — first

### What changes

The `actions` column cell in `wbs-table.tsx`; `POPOVER_COLUMNS` gains
`'actions'`; new `actions-menu.tsx` (+ test); `actions` width 110→**40**.

1. One ⋯ button per row: `aria-label` `Actions for 020`,
   `aria-haspopup="menu"`, `aria-expanded`. Hand-rolled popover in the
   `creatable-picker` pattern — positioned wrapper inside the `<td>`, escapes
   the clip via `POPOVER_COLUMNS`, closes on click-outside; one open menu at a
   time (`openMenuRowId` beside `depPicker`, read through `live`).
2. Items: **Duplicate**; **Delete** — or **Unfreeze** when frozen. Same
   handlers, same `strategy: 'promote'`.
3. **Focus semantics, fully specified (codex #12):** opening (Enter, Space or
   ↓ on the button) moves _DOM focus_ to the first `menuitem`; roving
   `tabIndex` (`0` on the active item, `-1` elsewhere); ↑↓ move focus; Enter
   or Space activates; Escape closes and returns focus to the ⋯ button; Tab
   closes and moves on (no trap). After **Duplicate**: focus lands in the
   copy's Name (existing `focusNext` path). After **Delete**: the Name of the
   row that took its place — next sibling, else previous row. After
   **Unfreeze**: back on the ⋯ button. While the table is mid-refresh
   (`run()` in flight) the items are disabled rather than removed. Every ⋯
   button stays a native tab stop, which preserves today's "Tab past the last
   cell reaches the last row's actions" — one stop now instead of two.
4. jsdom cannot prove pointer-blur ordering — the open/activate/return-focus
   path gets a Playwright spec, not only unit tests.

### Verification

Unit: keyboard open/navigate/activate/close; Duplicate calls `duplicateRow`;
Delete on a parent passes `promote`; frozen shows Unfreeze; opening B closes A;
Escape restores focus. Fault rows: `POPOVER_COLUMNS` exemption removed → menu
clipped to the 40px cell (pixels asserts the open menu is hit-test visible on
the last row and at the right edge); roving `tabIndex` dropped → the
focus-follows-arrows test fails.

**Estimate:** half a day (grew from v1: real focus spec + Playwright).

---

## 2. Change `notes-live-in-the-name` (R1) — second

### The model

`name` and `notes` remain two fields in be-01; the UI composes them.
**The compose/split/normalize contract is a pure module** (`name-notes.ts`,
codex #9), fully specified:

- `compose(name, notes)` = `name` when `notes === ''`, else
  `name + '\n' + notes`. Never a trailing newline invented.
- `split(text)`: everything before the first `\n` is the name, everything
  after it is the notes (internal newlines preserved). No first `\n` → notes
  are `''`. `'name\n'` → notes `''`.
- `normalize`: CRLF → LF on the way in (paste is the vector).
- **Destructive edits are explicit product semantics, tested as such:**
  deleting line 1 makes the old first notes line the _name_ (agy #5) —
  that is what editing one merged text field means, Cmd+Z is the recovery,
  and the test suite pins it deliberately rather than discovering it.
  An empty first line with non-empty rest commits `name: ''` — same rule,
  no special case, the completeness checker already flags unnamed items.

### What changes

`wbs-table.tsx` (name column composite, notes column deleted), new
`name-notes.ts` (+test), `cell-input.tsx` (baseline snapshot exposure),
`cell-navigation.ts` (+test), `notes-preview.tsx` call site,
`keyboard-bindings.ts` prose.

1. Notes column deleted (width entry, column def, `POPOVER_COLUMNS`
   membership). The markdown hover preview moves to the Name cell, shown when
   the row's notes are non-empty.
2. **Commit: three-way diff against the focus-time baseline, one atomic
   PATCH** (codex #3+#4, agy #3 — both reviewers found the same clobber from
   different ends). At focus, the baseline `{name, notes}` is captured (this
   is `shown.current`'s moment in `cell-input.tsx`; the composite cell keeps
   its own `{name, notes}` snapshot beside it). At commit, the typed text is
   split and each field compared **to the baseline, never to current row
   props** — a peer's notes edit held back during local name-typing therefore
   never reads as "the local user emptied the notes". Changed fields go in
   **one** PATCH request (`{name}`, `{notes}` or `{name, notes}`), so a
   two-field edit is one refusal, one journal entry, one Cmd+Z.
3. **↑/↓ in the Name textarea: leave only from the extremes** (codex #8,
   agy #4 — v1's logical-line rule was wrong under visual wrapping, which
   Name has always had). New contract, dead simple and wrap-proof: **↑ leaves
   the cell only with the caret at position 0; ↓ only at `value.length`;
   anywhere else the browser keeps the key** and native caret movement does
   what it always does (including within wrapped visual lines — first ↑
   press walks the caret up/to 0, the next one leaves). Single-line cells
   (estimates, date) keep today's unconditional row movement — the gate
   applies to multiline textareas only. No visual-line measurement, no
   drift between jsdom and the browser.
4. Backspace's empty-row veto: `input.value === ''` covers name and notes in
   one read; the explicit `row.notes === ''` conjunct stays.
5. Tab order tightens by one stop per row. `keyboard-bindings.ts` prose
   updated.

### Verification

Unit: compose/split/normalize round-trips including CRLF, `'name\n'`,
empty-name-with-notes, delete-line-1, delete-separator; commit PATCHes
name-only / notes-only / both-in-one-request; **the symmetric peer tests
through the real render path** — peer edits notes while local edits name, and
the reverse, focus held the whole time, then blur: peer's field survives
(fault: diff re-pointed at current props → both must fail); a refused PATCH
changes neither field; ↑ mid-text stays (caret moves), ↑ at 0 leaves, ↓
symmetric, in a _wrapped_ single-logical-line name too (Playwright, real
wrapping); preview on hover with notes, absent without.

**Estimate:** a day (grew from v1: the contract module, the three-way diff,
the peer-path tests).

---

## 3. Change `table-fits-the-screen` (R3/R4/R6 + v1.1) — third

### Widths (v1.1 compaction, superseding v1)

| column                   | now | v2                      | note                                                         |
| ------------------------ | --- | ----------------------- | ------------------------------------------------------------ |
| drag                     | 28  | 24                      | handle only                                                  |
| number                   | 168 | 100                     | `INDENT_STEP` 16→12, cap 4                                   |
| name                     | 360 | **flexible, floor 200** | absorbs the remainder                                        |
| depends                  | 220 | 110                     | chips wrap; listbox `minWidth: 260`                          |
| team                     | 160 | 120                     | picker list escapes the cell                                 |
| final-total              | 70  | 52                      | header "Days"                                                |
| not-before               | 130 | 108                     | native date input's floor decides — pixels asserts unclipped |
| start                    | 70  | 52                      | header "Start"                                               |
| finish                   | 70  | 52                      | header "End"                                                 |
| float                    | 90  | 56                      | header "Slack"                                               |
| notes                    | 260 | —                       | deleted in change 2                                          |
| actions                  | 110 | 40                      | done in change 1                                             |
| role folded (`-final`)   | 76  | 96                      | now shows figure · assignee                                  |
| role point               | 76  | 52                      | a number of days                                             |
| role assignee (unfolded) | 160 | 120                     | truncate + `title`                                           |

**The honest width equation (codex #1, agy #1 — v1's arithmetic was wrong;
it omitted the unfolded assignee column and used stale role widths):**

- Fixed non-role columns: 24+100+110+120+52+108+52+52+56+40 = **714px**.
- A folded role: **96px**. An unfolded role: 96+3×52+120 = **372px**.
- Two roles folded: 714+192+200 (Name floor) = **1106px** → fits 1280.
- One unfolded, one folded (accordion): 714+372+96+200 = **1382px** → fits
  1440/1512, **does not fit 1280**.

**What gives, and where (the decision Dany already took plus one he takes
now):** the accordion (one role unfolded at a time) is confirmed. Below the
table's minimum for the current state — 1106px folded, 1382px one-unfolded —
**horizontal scroll returns and the kept pinning is the backstop** (Dany's
v1.1 call: pinning stays). So: no h-scroll on his screen in any state; no
h-scroll anywhere ≥1280 with roles folded; at 1280 with a role unfolded, the
frame scrolls and drag/Number/Name hold the left edge. **Recorded option if
that ever grates:** unfolding a role could temporarily hide Start/End/Slack
(−160px → 1222px, fits 1280); parked, not built.

More than two roles: each folded role costs 96px; the equation, not a hope,
says when a project outgrows a viewport — and the pixels job tests a
three-role fixture folded at 1280 (714+288+200 = 1202 ✓).

### What changes

1. `table-frame.ts`: the `<table>` gets `width: 100%` and
   `minWidth: <equation for the current column set>` (a new exported
   `tableMinWidth(columnIds)` — same prefix-sum honesty as today's
   `tableWidth`, which it replaces). A `FLEXIBLE_COLUMNS = new Set(['name'])`
   set: the colgroup emits no `<col>` width for members, and **`widthFor`
   keeps throwing `UnknownColumnError` on anything unlisted** — no sentinel;
   `name` simply isn't asked (agy #7, R5). The Name cell carries
   `minWidth: 200` itself.
2. **Pinning stays untouched** — `PINNED_COLUMNS`, `pinnedGeometry`,
   `pinnedCellStyle` all keep working; Name's flexibility never moves its own
   `left` (prefix of _fixed_ drag+number), and `pinnedCellStyle` stops
   setting a fixed `width` for `name` (the colgroup owns it now).
3. **Folded `@`-assignee (v1.1/B):** the folded `-final` cell shows
   `4.8 · Kat` (truncated, full name in `title`; grey "assumed" name under
   the existing `doesEveryPhase` rule). **Typing `@` in the folded estimate
   box opens the people picker** filtered by what follows the `@`; Enter/click
   assigns; no match offers `Add "<typed>"` (same idempotent endpoint);
   `Remove <name>` entry when assigned; Escape closes, strips nothing. On
   pick, the `@fragment` is stripped and the estimate text is untouched —
   the shorthand draft never sees the mention (held apart, so a half-typed
   `@ka` can't read as a broken trio or commit on blur). `opensAPopover`
   extends to role `-final` columns. The fold button's copy no longer claims
   to hide the assignee. The `@` binding lands in `KEY_BINDINGS` (Pickers).
4. Shortened headers per the width table ("Days", "Start", "End", "Slack").

### Verification (codex #11 — breadth, each assertion with an observed fault)

Playwright, at 1280×800 and 1512×982, for each of: two roles folded, each
role unfolded (accordion), three roles folded, deepest numbering + a long
unbreakable name + six dependency chips:

- `document.documentElement` **and** the frame: `scrollWidth <= clientWidth`
  when the state's equation fits the viewport (fault: fixed Name width
  re-added → red).
- Every leaf column's rect inside the frame; Name ≥ its floor; the date
  input's value unclipped at 108px (fault: width 60 → red).
- The depends listbox ≥260px; the actions menu and the folded `@` picker
  hit-test visible at the right edge and on the last row (faults: exemptions
  removed → red).
- The narrow-viewport backstop: at 900px, the frame scrolls and the pinned
  Name sits exactly at `left: 124` while it does (fault: `pinnedCellStyle`
  dropped for name → red).
- One increased-font fixture (browser zoom 125%) asserting no
  document-level overflow with roles folded.

Unit: `tableMinWidth` equation; accordion reducer (unfold A folds B);
`@`-picker assign/add/remove/escape; assumed-name display; fold-button copy.

**Estimate:** a day and a half (grew from v1: `@`-assignee is real work, and
the pixels matrix roughly doubles).

---

## 4. Change `command-keys` (R2) — last, depends on 2

### The routing matrix (codex #7 — cells do not share one handler; each class

is wired and tested explicitly)

| cell class                                            | Ctrl+HJKL | Ctrl+N / Alt+N | Cmd/Ctrl+Enter | Ctrl+D ×2   | bare Enter                      | notes                                         |
| ----------------------------------------------------- | --------- | -------------- | -------------- | ----------- | ------------------------------- | --------------------------------------------- |
| Name textarea                                         | move      | new sibling    | next/create    | arm/confirm | **newline** (browser's)         | Enter branch deleted from `onKeyDown`         |
| estimate boxes (folded + trio)                        | move      | new sibling    | next/create    | arm/confirm | commit draft (as today)         |                                               |
| date (`not-before`)                                   | move      | new sibling    | next/create    | arm/confirm | —                               | native picker keeps its own arrows            |
| depends / team / assignee / `@` picker, **list open** | **inert** | **inert**      | **inert**      | **inert**   | take entry                      | the open list owns the keyboard; Escape first |
| same pickers, list closed                             | move      | new sibling    | next/create    | arm/confirm | (depends: opens list, as today) |                                               |
| ⋯ menu open                                           | inert     | inert          | inert          | inert       | activate item                   |                                               |

One shared `commandChord(pressed)` predicate in `keyboard-bindings.ts` (typed
like `undoChord`, unit-tested per chord including the `e.code` path for
Alt+N); each cell class's existing handler calls it — no new global listener,
so `isTypingInto` and the undo/redo page-level guard are untouched.

### The chords

1. **Enter in Name: newline, nothing else** — the `preventDefault +
addSibling` branch dies. Pickers keep their Enter.
2. **Cmd+Enter / Ctrl+Enter: flush, then move or create** (codex #5 — the
   race is real). The chord handler runs the cell's own commit path first
   (the same function blur calls, factored to be awaitable), **awaits it**,
   then focuses the next visible row's Name — or, on the last row, awaits
   `addSibling` and lands in the new row's Name via `focusNext`. A refused
   commit leaves the caret where it was and no row is created. Rapid
   repeated chords: the handler is re-entrant-safe behind `run()`'s
   in-flight gate (tested: two immediate Cmd+Enters on the last row create
   exactly one row... then one more).
3. **Ctrl+N (macOS) / Alt+N (everywhere): new sibling below, from any cell**
   — `addSibling(row)`, focus its Name. Mid-row, unlike Cmd+Enter.
4. **Ctrl+H/J/K/L: unconditional cell motion** — `nextCell`'s grid walk with
   the caret gate bypassed; same skip rules (read-only roll-ups, collapsed
   branches). Consumed at the grid's edge, never leaked to the browser.
5. **Ctrl+D ×2 (codex #6, agy #9 — the arm/confirm state machine, exactly):**
   - Arm on `Ctrl+D` with `event.repeat === false` on an unfrozen row: tint
     the row, toast "Ctrl+D again deletes 020 — its children move up".
   - Confirm only when **all** hold: same _row id_; `event.repeat === false`;
     **a `keyup` of D was seen since arming** (a held key can never
     confirm); within 3s.
   - Disarm on: any non-modifier keydown that isn't the confirm
     (modifier-only `Control/Shift/Alt/Meta` keydowns do **not** disarm —
     agy #9); any focus change including pointer-driven; window `blur`;
     `visibilitychange` to hidden; a structural refresh that removed or
     remounted the armed row (the arm holds the row _id_, and a peer's
     delete/move of that id disarms); Escape; the timeout.
   - On a frozen row: refused with "020 is frozen — unfreeze it first".
   - Delete = the button's path (`strategy: 'promote'`); focus lands per the
     actions-menu rule (next sibling's Name, else previous row's). Cmd+Z
     recovers — stated in the toast copy ("Deleted 020 — Cmd+Z restores").
   - `Proof:` comments beside the arm and confirm guards naming the injected
     fault and the watching test (agy #8; house R5 style).
6. **Registry and migration, separated (codex #13):** every chord lands in
   `KEY_BINDINGS` with `PROVEN_BY` tests — that keeps sheet and keymap from
   drifting, and _that is all it does_. The migration of Enter-scaffolded
   tests is its own task: `grep` for the Enter helpers in
   `wbs-table.test.tsx` (`pressEnter`, `keyboard('{Enter}')` in Name cells —
   ~8 sites known from the arrows review), rewrite each to Ctrl+N/Cmd+Enter,
   and add direct chord tests per cell class from the routing matrix.

### Verification

Unit per matrix row (chord × cell class, including the inert-while-open
cases); the arm/confirm negatives — held Ctrl+D repeating never deletes
(fault: `repeat` check removed → red); arm on 020, Ctrl+D on 030 re-arms 030
rather than deleting either (fault: same-row check removed → red); modifier
tap between presses still confirms; peer deletes the armed row → disarmed.
Cmd+Enter: commit-then-move ordering asserted on the request log (fault:
await removed → red); refused PATCH → caret stays, no row. Acceptance probe
from §0 run on Dany's Chrome **before** this change is implemented. Live on
dev, two sockets: name ⏎ note Cmd+Enter → two committed fields on row one,
caret in the fresh row; peer sees both.

**Estimate:** a day and a half including the test migration.

---

## Budget

Change 1: 0.5d · change 2: 1d · change 3: 1.5d · change 4: 1.5d — **~4.5
agent-days** including verify.md fault tables, dev verification, and the
pixels runs on h2puni (v1 said 2.5; the reviews bought the difference).

## Disposition table (every v1 finding)

| #   | reviewer | severity | disposition                                                                                                                                                                                                                      |
| --- | -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | codex    | critical | **Accepted.** Width equation rebuilt from real per-column numbers (§3); one-unfolded honestly doesn't fit 1280 — pinning backstop (Dany's call) + parked hide-schedule-columns option.                                           |
| 2   | codex    | critical | **Accepted.** Changes reordered: menu → notes → geometry → keys; each width budget truthful in its own commit.                                                                                                                   |
| 3   | codex    | critical | **Accepted.** Three-way diff against the focus-time baseline (§2.2); symmetric peer tests through the real render path. agy #3 is the same finding — one fix.                                                                    |
| 4   | codex    | real     | **Accepted.** One atomic PATCH for the changed subset; one journal entry; tests for refusal atomicity.                                                                                                                           |
| 5   | codex    | real     | **Accepted.** Cmd/Ctrl+Enter flushes and awaits the cell commit before moving/creating (§4.2).                                                                                                                                   |
| 6   | codex    | critical | **Accepted.** Full arm/confirm state machine: `repeat===false`, keyup-of-D required, same row id, disarm set incl. pointer focus, window blur, visibility, structural refresh (§4.5).                                            |
| 7   | codex    | real     | **Accepted.** Routing matrix per cell class; pickers own the keyboard while open; `commandChord` predicate beside `undoChord` (§4 matrix).                                                                                       |
| 8   | codex    | real     | **Accepted.** Logical-line rule replaced by caret-at-extremes (0 / length); single-line cells keep unconditional movement; wrapped-name Playwright test. agy #4 same finding.                                                    |
| 9   | codex    | real     | **Accepted.** Pure `name-notes.ts` contract: CRLF, trailing newline, delete-line-1 (explicit, tested product semantics), empty-name rule (§2 model). agy #5 same finding — semantics chosen and pinned rather than guarded away. |
| 10  | codex    | real     | **Overtaken by Dany.** Pinning stays (v1.1) — as the tested backstop below the minimum width, which answers the circularity too. agy #1's pinning half: same resolution.                                                         |
| 11  | codex    | real     | **Accepted.** Pixels matrix: document+frame overflow, rects-in-frame, floors, popover hit-tests, 3-role fixture, long-content fixture, zoom fixture, narrow-viewport backstop — each with an observed fault (§3 verification).   |
| 12  | codex    | real     | **Accepted.** Menu focus ownership fully specified: roving tabIndex, focus-after-each-action, disabled-while-busy, Playwright for pointer ordering (§1.3).                                                                       |
| 13  | codex    | real     | **Accepted.** Registry check demoted to drift-floor; test migration is its own grep-driven task; direct chord tests per cell class (§4.6).                                                                                       |
| 14  | codex    | nit      | **Accepted.** Sourced claims (Chromium hotkey doc), "physically cannot" scoped, real-Chrome acceptance probe before change 4 (§0).                                                                                               |
| 1   | agy      | critical | **Accepted** (= codex #1 + #10). Math fixed; pinning kept.                                                                                                                                                                       |
| 2   | agy      | critical | **Accepted as a named product trade.** Dany chose the Ctrl family knowing the shadow; guardrails: no single-gesture destruction, repeat/keyup rules, Cmd+Z recovery in the toast copy (§0, §4.5). Not re-litigated.              |
| 3   | agy      | critical | **Accepted** (= codex #3). Baseline diff, not current-props diff.                                                                                                                                                                |
| 4   | agy      | real     | **Accepted** (= codex #8). Caret-at-extremes.                                                                                                                                                                                    |
| 5   | agy      | real     | **Accepted, semantics variant** (= codex #9). Delete-line-1 renames — explicit, tested, undoable; no commit-blocking guard (one merged field means what it says; Dany asked for one field).                                      |
| 6   | agy      | real     | **Accepted.** Alt+N bound from day one as the cross-platform chord; Ctrl+N documented macOS-primary (§0).                                                                                                                        |
| 7   | agy      | real     | **Accepted.** No sentinel; `FLEXIBLE_COLUMNS` set, `widthFor` keeps throwing (§3.1).                                                                                                                                             |
| 8   | agy      | nit      | **Accepted.** `Proof:` comments beside arm/confirm guards (§4.5).                                                                                                                                                                |
| 9   | agy      | nit      | **Accepted.** Modifier-only keydowns don't disarm (§4.5).                                                                                                                                                                        |
