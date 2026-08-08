# Assumptions log — keys/notes/fit implementation (2026-08-08)

Dany's instruction: implement `tmp/plan-keys-and-fit-2026-08-08.md` (v2), no
questions, best assumptions documented here. Opus subagents implement; codex +
agy review. One assumption per line, appended as they are made; anything Dany
later overrules gets struck through with the correction beside it, never
deleted.

## Made by the orchestrator (Claire)

- **A1 — One branch, one PR.** All four openspec changes land on
  `change/keys-notes-and-fit`, sequential commits, one PR at the end.
  Precedent: the 2026-08-06 roadmap shipped six changes on one branch. Four
  PRs each waiting for a merge would serialize on Dany.
- **A2 — Review cadence.** codex+agy review the diff twice: after change 2
  (menu + notes) and after change 4 (fit + keys), not after every change.
  Matches the geometry change's two-round pattern; four rounds would double
  wall-clock for little marginal coverage.
- **A3 — The pixels job runs on h2puni** via the existing
  `/home/puni1/wbs-e2e-work` rig after changes 3 and 4 (never on h1claw — no
  browser, and builds are banned here).
- **A4 — Toast copy.** Exact wording of the Ctrl+D arm/confirm/frozen toasts
  is mine (plan gives the shape, not the letters). Kept short, includes the
  row number and "Cmd+Z restores" on the delete confirmation.
- **A5 — Accordion.** "Unfold A folds B" is implemented as: the unfolded set
  is at most one role id; unfolding replaces it; folding empties it. No
  persistence across reloads (matches today's unfold state, which is
  component state).
- **A6 — `@` picker scope.** The `@` mention picker in the folded estimate
  cell lists people (assignees), not teams — the unfolded assignee column is
  the thing being mirrored. Team assignment stays in the Team column.
- **A7 — Dev deploy at the end.** After change 4 + green gate + reviews,
  push + `./bin/dev-deploy.sh` so Dany can try the keyboard on dev. PR
  created on `Prosperous-Unification/wbs-tool-v1` per the repo's standing
  PR workflow; merge stays his.
- **A8 — The §0 acceptance probe** (chords on Dany's real Chrome) cannot be
  run by anyone here — no macOS, no browser. Implemented as a tiny probe page
  committed under `tools/dev/` with instructions in the PR body; the chord
  code ships on the evidence of the Chromium docs + reviewer confirmation,
  and the probe is Dany's 10-minute check before merging. Risk accepted and
  named rather than silently skipped.

## Made by implementing subagents

(appended per change below)

### Change 1 — `actions-menu`

- **C1-1 — `aria-disabled`, not `disabled`, on a busy item.** The plan says
  "disabled while a `run()` mutation is in flight". A native `disabled` button
  cannot hold the DOM focus, so a menu that went busy while open would drop the
  focus and one opened while busy would have nothing to focus. Items carry
  `aria-disabled="true"` and refuse activation instead — the ARIA pattern's own
  answer, and the only one compatible with the roving tabIndex the plan asks
  for.
- **C1-2 — the arrows wrap.** ↑ on the first item goes to the last and ↓ on the
  last to the first. Standard menu behaviour; the plan says only "↑↓ move".
- **C1-3 — ArrowUp on the ⋯ button does not open the menu.** The plan names
  Enter, Space and ↓ as the opening keys, and those three are what is bound.
  (The ARIA practice guide also opens on ↑, focusing the last item; not built,
  not needed for two items.)
- **C1-4 — Tab returns the focus to the ⋯ button and lets the browser move on
  from there**, rather than closing and leaving the focus on the item. That
  makes the landing spot the next tab stop after the button — the next row's
  Name — which is exactly where Tab from a closed ⋯ button goes. jsdom cannot
  see it; the assertion is in the Playwright spec.
- **C1-5 — "the next sibling" after a Delete is read from the sibling group on
  screen before the request.** For a parent deleted with `strategy: 'promote'`
  the children land in its place, so the caret ends up below them rather than
  in the first promoted child. Both readings are defensible; this one is what
  "the row that took its place" means in the sibling group, and it is stated in
  `deleteRow`'s JSDoc and in the change's `design.md`.
- **C1-6 — the menu items are named plainly** (`Duplicate`, not
  `Duplicate 010`), which is only unambiguous because one menu is open at a
  time. The row number moved onto the ⋯ button's `aria-label`
  (`Actions for 010`).
- **C1-7 — the focus effect throws when the item it was told to focus is not
  there.** Not asked for by the plan; it is the R5 check for the wiring that
  would otherwise fail silently (`aria-expanded="true"` on a button that still
  has the focus). Watched failing both ways — see the change's `verify.md`.
- **C1-8 — the menu is 140px wide and opens from the cell's right edge.**
  `actions` is the last column, so a box hanging off the left edge of a 40px
  cell would open over the table rather than off the end of it.

### Change 2 — `notes-live-in-the-name`

- **C2-1 — the focus-time baseline is `CellInput`'s `shown`, handed to
  `commit` as a second argument.** The plan says the composite cell "keeps its
  own `{name, notes}` snapshot beside it". A second snapshot is a second copy
  of a fact `CellInput` already keeps — in the one component whose entire
  design note is that two copies drift — and `shown` is the same moment by
  construction, because it is what rule 3 already asks "did anything change"
  of. So `commit(typed, baseline)`; single-field cells ignore the second
  argument.
- **C2-2 — `normalizeNewlines` converts a lone `\r` as well as `\r\n`.** The
  plan says CRLF only. A lone `\r` is what old Mac software and some rich-text
  editors produce, and an unconverted one rides invisibly on the end of the
  name.
- **C2-3 — the `\r` vector is be-01, not the keyboard.** A `<textarea>`
  normalises the newlines of whatever is assigned to it, so nothing typed or
  pasted into the box can hold a `\r` — jsdom implements that too, which is why
  the first two CRLF tests written here passed with the normalisation removed
  and were deleted as vacuous. The check that ships is watched on the reachable
  case: a note be-01 holds with `\r\n` must not be rewritten by somebody
  clicking through the row.
- **C2-4 — a selection blocks ↑/↓ from leaving a multiline cell.** The plan
  gives the rule for a collapsed caret only. Shift+↑ in a note is extending a
  selection, exactly as Shift+← is along a line, and a selection reaching
  position 0 reads `atStart` without anybody having asked to leave.
- **C2-5 — `Caret` gains `multiline`, answered by `caretOf` from the element
  type.** The alternative was a sixth parameter to `nextCell`. The caret and
  the box it is in are one fact about one element, and `caretOf` is the only
  place the DOM is read for it.
- **C2-6 — the `row.notes === ''` conjunct is kept and made non-vacuous.** The
  plan calls it belt-and-braces, which in this repo is a check that cannot
  fail. It has a case of its own: emptying the box is not the same as having
  emptied the work item, because the blur that would commit it has not
  happened. Its own test, its own observed fault.
- **C2-7 — the Notes column's `expandedRows` mechanism is deleted with the
  column.** The Name cell is the only multiline cell left and it auto-sizes, so
  the `rows`-swapping branch had no caller and no test could reach it. Shipping
  an unreachable branch in the change that orphaned it is the thing R5 is
  about.
- **C2-8 — the hover preview shows while the Name cell is being typed in.**
  The plan says "shown on hover when notes non-empty" and the pointer is often
  over the cell being typed in. Matching the old Notes cell's behaviour rather
  than adding a "not while focused" rule nobody asked for.
- **C2-9 — the Name cell's `aria-label` stays `Name of 010`.** It now holds the
  notes as well, but the label is how every keyboard test and the Playwright
  spec address the cell, and `Name and notes of 010` buys nothing a screen
  reader could not get from the content. Revisit if Dany reads a plan with one.
- **C2-10 — no way to type a newline until change 4.** Enter is still "new work
  item" here; the plan puts the newline chord in `command-keys`. Until then a
  note is written by pasting one or by editing one that exists, which is what
  every test in this change does. Named rather than smuggled in, because a
  dev deploy between changes 2 and 4 would look like a regression.
- **C2-11 — the Name column joins `POPOVER_COLUMNS` while staying pinned.** No
  cell in this table has been both before. The pin decides where the cell sits
  and the clip decides what may leave it; the preview has to. What holds
  instead of the clip is what already holds for `depends` and `team` — every
  control inside is `width: 100%`, `border-box`. Unmeasured in pixels: the
  Playwright test for it is written and awaits h2puni.

### Round-1 fixes

- **F-1 — the refused draft is held in place, not stashed elsewhere.** codex
  offered two shapes for finding 1: preserve the rejected text until retry or
  cancel, or restore the server value at once and keep the rejected text
  somewhere recoverable. The first, because the second needs a second place to
  put it, a way to show it and a way to get it back — new UI nobody asked for —
  while the box the person typed into already holds the text, and leaving it
  there is what makes leaving the cell again a retry.
- **F-2 — a refusal is resolved by the person, never by a timer or a refetch.**
  The hold ends when the same cell is left again (a retry) or when the box is
  put back to what it was showing (an abandon). Nothing else clears it: an
  automatic give-up is exactly the silent loss the finding is about.
- **F-3 — `CommitOutcome` has three members, not two.** `unsent` was added
  because `void | Promise<CommitOutcome>` is banned by
  `@typescript-eslint/no-invalid-void-type` and because the two commits that
  send nothing — the composite cell whose texts differ only in line endings,
  and an estimate box holding a half-typed trio — are neither `landed` nor
  `refused`. The estimate cells now return their verdict too; their own drafts
  already survive a refusal, so nothing about them changes behaviour.
- **F-4 — rule 5's record is `{typed, baseline}`, and it expires by itself.**
  No timer, no in-flight counter: once a refetch has moved `shown`, the same
  text typed again is diffed against a different baseline and is sent. That is
  also why it composes with F-1 — a refusal clears the record, so the retry is
  a deliberate second ask rather than a duplicate.
- **F-5 — the be-01 journal test went into `undo.controller.test.ts`.** It is
  the file that already runs the routes over real SQLite for exactly this
  reason (its own header says the in-memory stores model no revisions), and
  the assertion is about the stack that file exists to test. The journal
  instance is hoisted so the test can read the stack the app wrote rather than
  infer it from what undo answers.
- **F-6 — codex's finding 4 (the Playwright run on h2puni) is untouched here.**
  It is a machine this task cannot reach; `verify.md` still says both browser
  faults are expectations rather than observations, and A3 above owns the run.

### Change 3 — `table-fits-the-screen`

- **C3-1 — `FLEXIBLE_COLUMNS` is a set and `FLEXIBLE_FLOOR` a single number.**
  The plan writes `new Set(['name'])`, which cannot carry a per-column floor.
  One floor is documented as belonging to every flexible column rather than to
  Name in particular; there is one member, so the two readings agree today and
  the second is the one that stays true if a column is ever added.
- **C3-2 — the schedule headings keep the day/date distinction in a `title`,
  not in the heading.** The plan shortens `Starts (day)`/`Ends (day)` to
  `Start`/`End`, and 52px has room for one word. The sentence that says
  whether the figures are dates or day numbers — which the old header carried,
  and which a bare `2.5` needs — moves into each heading's tooltip, along with
  a longer gloss for `Days` and `Slack`. Nothing is lost; it is one hover away
  rather than on screen.
- **C3-3 — `PINNED_GEOMETRY` throws while loading when a flexible column is
  put in front of another pinned one.** Not asked for. Name is the last pinned
  column, so no offset is a sum that includes it — and that fact is exactly the
  kind that stops being true silently. The alternative was `?? 0`, which is a
  sticky offset that is right at one window width.
- **C3-4 — the three-role browser fixture cannot be built.** The plan's pixels
  matrix asks for one. be-01 creates a project with exactly `Dev` and `QA`
  (`STARTING_ROLES` in `project.service.ts`) and neither the API nor the UI can
  add a third, so there is no way to render one through the browser. The third
  role's cost is asserted as arithmetic instead — `tableMinWidth` for three
  folded roles is 1202 in `table-frame.test.ts` — and the gap is stated in
  `verify.md` rather than papered over.
- **C3-5 — `Remove <name>` is offered first on a bare `@` and nowhere else.**
  The plan says the list "includes `Remove <name>`" without saying where. Enter
  takes the first entry offered (`CreatablePicker`'s rule), so the position is
  the whole of whether `@ka⏎` can unassign somebody. First on a bare `@` makes
  `@` + Enter a deliberate "take them off" gesture and makes a search-and-take
  incapable of removing anyone.
- **C3-6 — an empty estimate half beside a mention commits nothing, and the
  cell goes back to what it held at focus.** The folded cell selects its
  contents on focus, so `@` typed into one replaces the figure; without this
  rule the assign gesture would clear an estimate nobody touched. Emptying a
  cell with no `@` in it still clears it. The same rule covers `4.8@ka`
  abandoned: an estimate half equal to the focus-time baseline is not a
  request for `4.8/4.8/4.8`.
- **C3-7 — `CreatablePicker`'s list is extracted as `PickerList` rather than
  imitated.** The plan left the choice open. Three things have to hold of a
  popover in this table — the `mousedown` that must not blur the box, the
  z-index above every sticky layer, the `top: 100%` against a wrapper inside
  the `<td>` — and each is a bug the moment two copies disagree. `CellInput`
  gains one optional `onTyped` hook for the same reason: a second name for the
  change event is a second answer to "did somebody type here".
- **C3-8 — the `@` picker lists people only, and only while the role is
  folded.** Teams stay in the Team column (A6 above), and the unfolded role
  keeps its assignee column: two ways to assign one person side by side is two
  things to keep in step.
- **C3-9 — the sticky assertions in `e2e/layout.spec.ts` moved to a 900px
  viewport.** They cannot be made anywhere else any more: above the table's
  minimum there is nothing to scroll, so `scrollFrameTo(400)` would fail its
  own precondition. The default viewport in `playwright.config.ts` keeps its
  1400px for the screenshot and for the tests that do not care.
- **C3-10 — the depends listbox is 260px by a named constant.** The plan gives
  the number; it is `DEP_LIST_WIDTH` beside the cell rather than a literal in a
  style object, and the browser gate measures it against the 110px column it
  drops from.
- **C3-11 — `not-before` is 146px, not the planned 108.** The plan said the
  native date input's floor decides and that the width takes whatever the
  assertion finds. It found 138: an unconstrained `input[type=date]` in the
  table's font asks this Chromium for that, plus `CELL`'s 8px of padding. The
  fixed columns therefore come to 752 rather than 714, and the three states of
  the equation are 1144 / 1240 / 1420 rather than 1106 / 1202 / 1382. Every
  conclusion the plan drew from them survives.
- **C3-12 — the toolbar wraps.** Not asked for, and found by the same run: at
  900px and at 125% zoom the _page_ scrolled sideways while the table behaved,
  because the row of toolbar buttons is about 1245px at its narrowest and could
  not wrap. One `flexWrap: 'wrap'`. Without it the two viewport assertions the
  plan asks for cannot be made about the table at all.
- **C3-13 — the notes preview's stacking bug is fixed here, in change 3.** It
  belongs to change 2 and was found by change 3's browser run: a pinned cell is
  a stacking context, so the preview was painted under the next row's pinned
  Name cell. `POPOVER_ROW_LAYER` in `table-frame.ts` and the hovered row lifted
  to it. Fixing it in the commit that found it beats leaving change 2's own
  browser fault indistinguishable from a live bug; both verify.md files say so.
- **C3-14 — the date assertion measures an unconstrained probe input.** The
  obvious `scrollWidth <= clientWidth` was watched passing with the column at
  60px: Chromium clips a date input's internals _inside_ the element. The
  replacement builds a detached `input[type=date]` in the table's font and
  holds the column against what the browser makes of it — which means a future
  Chromium that wants more turns the gate red rather than quietly cutting the
  date in half.

### Change 4 — `command-keys`

- **C4-1 — `commandChord` rejects `metaKey` for the letters and for `Enter`
  it accepts either.** The plan gives "Cmd+Enter or Ctrl+Enter" for one chord
  and "Ctrl+N", "Ctrl+D", "Ctrl+H/J/K/L" for the rest, and says nothing about
  what Cmd+H should do. Enter follows `undoChord`'s accept-either rule because
  it is one action two platforms spell differently; the letters do not,
  because they are chords one platform has already taken and because on Linux
  `Meta` is the Windows key. A predicate that claimed Cmd+K would be answering
  for a keystroke aimed at a window manager.
- **C4-2 — Shift is rejected on every chord, and Alt on every chord but its
  own.** The plan does not enumerate the pollution rules. Ctrl+Shift+Z is
  already redo and Alt+arrow is already a row move, so a loose predicate would
  answer for chords it was never given.
- **C4-3 — the flush reaches the cell's commit through a `WeakMap` keyed by
  the DOM node**, exported as `flushCell`, rather than by plumbing a commit
  thunk down to each of the four cell classes. The plan says "the same
  function blur calls, factored to be awaitable" without saying how the chord
  gets hold of it, and the chord holds `event.currentTarget` and nothing else.
  One line per cell class is what keeps the routing matrix's rows identical.
- **C4-4 — a box that is not a `CellInput` flushes to `unsent`.** The date
  cell and the picker inputs write on the change or on the pick and hold no
  draft between keystrokes, so there is nothing for a chord to send. Modeled,
  not defaulted: the chord still runs.
- **C4-5 — the re-entrancy gate is a ref of this change's own, not `run()`'s
  `busy`.** The plan says "re-entrant-safe behind `run()`'s in-flight gate";
  `busy` is React state, so two chords in one tick both read the value from
  before either ran and the gate is not a gate. `commandInFlight`, set before
  the flush and cleared in a `finally`, is.
- **C4-6 — the arm holds the row's number as well as its id**, and a refresh
  in which the number has moved disarms. The plan says "a structural refresh
  that removed or remounted the armed row"; a remount is not observable from
  here, and the honest test of the same intent is whether the sentence the
  toast made ("Ctrl+D again deletes 020") is still true. A peer's create above
  the row makes it false without removing anything.
- **C4-7 — the three-second window is a timer and only a timer.** The plan
  says "within 3s". Implemented as a `setTimeout` that disarms — which is also
  what takes the tint off — with **no** second elapsed check at the confirm: a
  check the timer has already made unreachable is exactly the vacuous check
  R5 exists to stop.
- **C4-8 — `CapsLock` joins `Control/Shift/Alt/Meta` in the keydowns that do
  not disarm.** agy #9 names four; a caps-lock tap on the way to the second
  press is the same kind of keystroke and disarming on it would be the same
  surprise.
- **C4-9 — the focus-change disarm is a window `focusout` listener.** The plan
  says "any focus change including pointer-driven". `focusout` fires however
  the focus leaves, and the armed cell is not necessarily the one that has it
  by then.
- **C4-10 — Cmd+Enter's arrival selects the next name.** The plan says it
  "lands in Name" without saying where the caret goes. Selected, which is what
  every other keyboard arrival in this table does (`focusAdjacentCell`).
- **C4-11 — the chords live under `Editing` in the cheat sheet.** The plan
  says "the 'Anywhere'/'Editing' placement the sheet's grouping wants" without
  choosing. They fire from any cell but only from a cell; `Anywhere` is the
  page — the sheet, the Find box, the toolbar — and a reader looking up what a
  chord does while typing would not find them there.
- **C4-12 — a modified Enter no longer activates an actions-menu item.** Not
  in the plan; found by the matrix's own test. The matrix says an open ⋯ menu
  is inert to Cmd/Ctrl+Enter, and it was not: the menu took any Enter and
  duplicated the branch. One guard in `actions-menu.tsx`, watched failing.
- **C4-13 — the `repeat` and keyup guards overlap, and each is proven on the
  scenario it uniquely owns.** A real held key produces neither a keyup nor a
  non-repeat keydown, so on the plan's own "held Ctrl+D" scenario either guard
  alone would pass and neither could be watched failing. `repeat` is proven on
  the repeats that arrive _after_ the confirming press — they must not arm the
  row that slid up into the gap; the keyup rule is proven on two keydowns with
  no release between them. Both are real; the overlap is stated rather than
  hidden behind one test that cannot tell them apart.
- **C4-14 — the ordering assertion is about settling, not about dispatch.**
  The plan says "commit-then-move ordering asserted on the request log (fault:
  await removed → red)". A request log alone cannot see the fault: both calls
  leave synchronously either way, and dropping the `await` still sends the
  PATCH first. What it loses is the answer, so the unit test holds the PATCH
  open and asserts nothing was created while it hung. The browser spec keeps
  the request-log form, where a real round trip makes the two orders differ.
- **C4-15 — the same-row conjunct is proven in jsdom only, and the browser test
  says so.** Reaching a second row in a browser means moving the focus, and the
  focus rule disarms before the press arrives; with the conjunct removed all
  six browser tests stay green. Recorded rather than papered over, and rather
  than deleting a guard that catches the case the focus rule cannot see.
- **C4-16 — Playwright's `keyboard.down()` does not auto-repeat**, so a held
  key is `down('d')` called again rather than `down('d')` plus a wait. Verified
  on h2puni against a throwaway spec that logged the events, after the first
  version of both held-key tests turned out to deliver one keydown.
- **C4-17 — the Depends-on box is inert to the chords whenever it has the
  focus**, because it opens its list on focus with every other row on offer.
  Matrix-correct and tested, and the one place the "Escape first" rule will be
  felt as friction. Flagged for Dany rather than special-cased.

### Round-2 fixes

- **R2-1 — a matching flush is answered with the _derived_ promise, not the
  raw `commit` one.** `sent.current.landing` is the promise that already
  carries rule 4's bookkeeping and the `sync()` a landed edit performs, so a
  chord that joins an in-flight submission is answered after the same work a
  blur would have done — not before it.
- **R2-2 — the record is written synchronously, after the chain is built.**
  `commit(...).then(...)` first, then `sent.current = {…, landing}`, then
  `return landing`. The `sent.current = null` a refusal performs is a microtask
  away at the earliest, so a flush arriving in between still finds the request
  it belongs to. The old code assigned before calling `commit`; the order only
  matters now that the promise is part of the record.
- **R2-3 — "inert" is implemented as `preventDefault` plus nothing, and the ⋯
  menu was left as it was.** The pickers take the key from the browser because
  every chord this table claims is taken (Ctrl+D unhandled is a bookmark).
  `actions-menu.tsx`'s existing guard returns without `preventDefault`; a menu
  item is a `<button>`, its guard only covers Enter and Space, and changing it
  was not this finding. Recorded rather than quietly unified.
- **R2-4 — `CreatablePicker` consumes a chord only where it was given
  `gridCell`.** A picker rendered outside a table is not in the routing matrix,
  none of these keystrokes is a chord there, and the component's documented
  promise to leave such a picker's keyboard alone still holds.
- **R2-5 — only _modified_ keys are consumed.** The bare Enter that takes an
  entry, the bare arrows that move the depends highlight, and Escape are
  untouched on every surface; the guards ask `commandChordIn` and `altMoveIn`
  and nothing else. An open list still owns its own keyboard.
- **R2-6 — `onAltMove`'s modifier rule moved into `altMoveIn` so the open `@`
  list recognizes exactly the keystrokes the handler would act on.** Two copies
  of "is this an Alt+arrow" is how one of them comes to accept a composing
  arrow the other refuses. The guard is unchanged code at a new address, and it
  was re-watched failing there rather than assumed (verify.md, fault #24).
- **R2-7 — both fixes are browser-observable, so both got a Playwright test.**
  Finding 1's is the request log inside a held-open PATCH — the same shape as
  the existing flush-ordering test, one order further on; finding 2's asserts
  that a real Cmd+Enter through a real open combobox sends nothing at all.
- **R2-8 — no new OpenSpec change.** Both findings are the code failing an
  already-precise requirement ("SHALL wait for the answer", "a cell SHALL
  ignore every command chord while a list is open"), which `AGENTS.md` R4
  exempts. The two delta specs gained scenarios saying what the requirements
  already implied — inert means consumed, and a chord joins the save already
  out — rather than a change of their own.
- **R2-9 — a picker's list carries the same accessible name as its box**, so
  `getByLabel` matches both in a browser and Playwright refuses in strict mode.
  Found on the first h2puni run of the new team-picker test, after every
  assertion the test exists for had already passed. The test asks by role now;
  the markup was left alone, because the shared name is what makes the pair one
  combobox to a screen reader.
