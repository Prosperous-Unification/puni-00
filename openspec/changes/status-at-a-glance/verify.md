# Verify

Implementation landed 2026-09-13 on `change/status-at-a-glance`, stacked on
`change/work-item-status-and-facts` (PR #423). Commands and measurements below are this
machine's (macOS, UTC+3, Chromium via Playwright, run between 01:00 and 03:00 local so the
browser's UTC day and the host's day differed); CI is the gate — `bin/h2puni-gate.sh` exits
127 on macOS.

## Assumptions, stated

- **Date only.** The prompt takes a calendar day and no time of day: ADR 0024 stands, and
  `fact_end` is a date-only column. Dany's ask said "date and time"; the time is not stored.
- **Status stays hidden by default.** The strip and the tint are the default face; the 28px
  glyph column would overrun the 1280 folded budget's 17px of slack if shown by default.
- **A change to a held fact end is two journal entries** (`setStatus`, then `patch`), never a
  fill-and-overwrite variant of `setStatus`.
- **Only the Status cell's act clears the fact end.** A per-step statement that drops a row
  from done to in progress leaves the facts alone; only a done row draws its fact end.
- **The word is in the cell's fact card, not in its accessible name and not a `title`.**
  `jsx-a11y` refuses `aria-description` on a combobox, a `title` drew the browser's grey
  tooltip beside the fact card (removed 2026-09-13 on Dany's screenshot), and `Status of 010`
  is the handle every walk, hint and browser proof finds the cell by.
- **A deleted row under an open prompt** is the `refsEditing` pattern (`?? null` → no
  surface) and is not separately tested.

## Commands

| Command                                                                                                  | Result                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bunx nx run core:test` (`progress.test.ts` + suite)                                                     | pass — 421                                                                                                                                                                                                                                                                                                                                                                                       |
| `bunx nx run contracts:test`                                                                             | pass — 378                                                                                                                                                                                                                                                                                                                                                                                       |
| `bunx nx run be-01:test`                                                                                 | 1045 pass, 0 fail, exit non-zero: two `Unhandled error between tests` after `saved-plan-list.db.test.ts` — `DrizzleQueryError` on `solver_slot` / `solver_queue` reads inside a transaction beside a `database is locked` health probe. Local, pre-existing on this host (see memory: devsync poller on macOS); untouched by this change, which writes no solver table. CI `gate` is the oracle. |
| `bunx nx run-many -t lint typecheck -p core fe-01`                                                       | pass                                                                                                                                                                                                                                                                                                                                                                                             |
| `bunx nx format:check --all`                                                                             | exit 0                                                                                                                                                                                                                                                                                                                                                                                           |
| `OPENSPEC_TELEMETRY=0 bunx openspec validate --all --json`                                               | 81 passed, 0 failed                                                                                                                                                                                                                                                                                                                                                                              |
| `bunx vitest run` (fe-01, whole suite)                                                                   | 2686 pass, 2 fail — `plan-mermaid.test.ts` M5 ×2, the pre-existing UTC+3 cases the previous change recorded                                                                                                                                                                                                                                                                                      |
| `E2E_PORT_SHIFT=1900 bunx playwright test … status.spec.ts layout.spec.ts -g "asks for the day\|pinned"` | **8 passed** (34 s): the prompt, Escape's focus return, the strip, the tint on a pinned and an unpinned cell, the fact end, the done bar; five pins with Status shown                                                                                                                                                                                                                            |

## Failure proofs

| Check                                | Fault injected                                                   | Test that observed it                                                                            | Observed                                                                                                                                                                      |
| ------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unknown` clears only what read done | the `wasDone.get(…) !== 'done'` guard removed                    | core › `unknown on a row that was not done leaves its typed fact end`                            | `Expected: "2026-09-10" / Received: null` (and the parent case red beside it)                                                                                                 |
| the row says its status              | `data-row-status` dropped from `PlanRow`'s `<tr>`                | plan-cells › `every row says its status, and a done row still says done`                         | `expected null to be 'unknown'`                                                                                                                                               |
| pinned cells paint the tint layer    | the gradient dropped from `ROW_BACKGROUND`                       | table-frame › `paints a pinned body cell with the tint layer …`; e2e status spec                 | unit: `expected 'var(--cell-bg, var(--background))' to be 'linear-gradient(…'`; Chromium: `Expected pattern: /linear-gradient\(rgba\(0, 0, 0, 0\)/ · Received string: "none"` |
| Status is the third pin              | `status` taken out of `PINNED_COLUMN_IDS`                        | table-frame › `holds Status as the third pin when it is shown …`                                 | `expected undefined to deeply equal { left: 121, width: 28 }`                                                                                                                 |
| Done is asked before it is written   | the `status === 'done'` branch collapsed to a direct `setStatus` | plan-cells › `choosing Done opens the completion prompt and sends nothing until it is confirmed` | `Unable to find an accessible element with the role "dialog" and name "Set 010 to Done"`                                                                                      |
| `Mark done` held back on a non-date  | the `if (!valid) return` and the button's `disabled` removed     | completion-prompt › `holds Mark done back while the day is not a date`                           | `expected false to be true`                                                                                                                                                   |
| focus returns to the Status cell     | found, not injected: Radix's default return target               | e2e status › `toBeFocused()` on the Status cell                                                  | `Expected: focused · Received: inactive` before `onClosed`; green after                                                                                                       |

Every fault was restored and the named suite watched green again before the next.

## Follow-up, 2026-09-13: the list under the pinned layer

Dany, on the merged build: "i cannot see the status dropdown when i try to change the status".
Reproduced in Chromium on his plan (41 rows, Links shown): the Status `<td>` is pinned since this
change — sticky with `z-index: 1`, a stacking context — and its click-opened list was never
reported as an open card, so `PlanCell` never lifted it and the list's lines lay under the next
rows' pinned Links buttons (`Unknown → <BUTTON Links for 030>`, `Done → <BUTTON Links for 040>`,
read with `elementFromPoint` after forcing the cell back to layer 1). The one-row browser proof
had nothing below the list to cover it. Fix: `StatusCell` reports `onOpenChange`, and the column
writes the store's keyboard reading (`cellCards.updateFocused`) — the list is only open while
the box holds the focus — so the `<td>` rises to `POPOVER_ROW_LAYER` while the list is on screen.

| Check                                               | Fault injected                                      | Test that observed it                                                                                   | Observed                                                                       |
| --------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| the pinned Status cell lifts while its list is open | the `updateFocused` write dropped from `status.tsx` | plan-cells › `lifts the pinned Status cell over the rows below while its list is open`                  | `expected 1 to be 2`                                                           |
| the list's lines are what the pointer reaches       | the same write dropped                              | e2e status › `opens over the rows below it, not under them` (two rows, Links shown, every line sampled) | `Error: the Unknown line is painted over · Expected: "Unknown" · Received: ""` |

Two false negatives on the way, recorded so the next proof does not repeat them: with Links
hidden the same scene passed with the write deleted (the Name cell did not cover the line), and
with Links shown but only the **last** line sampled it passed again (that line hangs below the
final row with nothing under it). `E2E_PORT_SHIFT=1900 … status.spec.ts`: 2 passed after the fix.

## Follow-up, 2026-09-13: the hint and the list

Dany: "(1) when i click the status to select new value i want dropdown to remove the hint pop-up
(2) hint pop-up must show the full name of the status or even write status: unknown". The fact
words now begin `Status: <word>.`; the hint layer re-reads the attended mark after a `click` or
`keyup` (in a microtask, after React committed) and closes its card when the mark reads
`aria-expanded="true"`. The press path is untouched — a fact's card still survives a press that
opens nothing.

| Check                                     | Fault injected                                             | Test that observed it                                                                                        | Observed                                                 |
| ----------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| an opened list takes the mark's card down | the `click`/`keyup` listeners for `reconsidered` not added | hint › `closes the fact card the moment the list opens…`, `closes it for a keyboard that opens the list too` | `expected <div role="tooltip" …> to be null`, both cases |

`bunx vitest run hint.test.tsx plan-cells.test.tsx plan-cards.test.tsx`: 278 passed. fe-01 lint
and typecheck green; `bunx nx format:check --all` exit 0.

## Historical ownership reconciliation

Attempts now owns the server's fact fill and clear, including the four mixed-status
and undo scenarios carried from this file. Its dated fixture binds UTC and no attempts.
The unqualified earlier UTC body below remains historical. A qualifying attempt or
the project's local day supplies a missing day under the later reviewed Attempts rule.
The Status prompt owns both actual confirmed days and the distinct follow-up patches
for changed stored days. The earlier one-field wording remains historical below.
[Status fact history](https://github.com/Prosperous-Unification/puni-00/commit/4aad8e994)
and [Attempts fact history](https://github.com/Prosperous-Unification/puni-00/commit/a6e11687a)
attribute those changes. This supplement supplies no runtime evidence.

### Retired Status fact-fill overlay

Source at local parent `7f8a426a2823f81b01e8fe1307d4b092941e8920`,
`openspec/changes/status-at-a-glance/specs/wbs-domain/spec.md`, blob
`4edaca2c263af1fedae3b70625c295869aeeacd6`.

```text
### Requirement: Marking done fills an empty fact end with the day of the act

Marking a work item `done` SHALL fill the fact end of every work item the act writes — the
leaves and, for a parent, the parent itself — whose `factEnd` is `null` with `on`; `on`
absent, be-01 SHALL take the calendar day of the act's own write stamp in UTC. A stored fact
end SHALL NOT be overwritten by the fill. fe-01 SHALL always send `on` as the day the
completion prompt confirmed. Setting `unknown` SHALL set `factEnd` and `factStart` to `null` on every work
item in scope — the leaves and, for a parent, the parent itself — whose status read `done`
before the act (`status-from-the-menu` widened this from the fact end alone), and SHALL leave
the facts of every other row untouched. The fill and the clear SHALL
be part of the same journal entry as the statements, so one undo takes them away together.

#### Scenario: a typed fact end survives the mark

- **GIVEN** a leaf whose fact end reads `2026-09-10`
- **WHEN** it is marked `done` with `on: '2026-09-12'`
- **THEN** its fact end still reads `2026-09-10`

#### Scenario: be-01 supplies the day when the client does not

- **GIVEN** a clock whose act stamps `2026-09-12T23:30:00Z`
- **WHEN** a leaf with no fact end is marked `done` with no `on`
- **THEN** its fact end reads `2026-09-12`

#### Scenario: leaving done takes the fact end away, and undo puts it back

- **GIVEN** a done leaf whose fact end reads `2026-09-12` and whose fact start reads
  `2026-09-08`
- **WHEN** `setStatus` sets it `unknown`, then the actor undoes once
- **THEN** after the act its `progress` is empty and both facts are `null`; after the undo every
  statement and both days are back, from one journal entry

#### Scenario: a parent's unknown clears only what read done

- **GIVEN** an in-progress parent with a typed fact end `2026-09-12` over two leaves, one done
  with fact end `2026-09-11`, one in progress whose fact end was typed as `2026-09-09`
- **WHEN** `setStatus` sets the parent `unknown`
- **THEN** the done leaf's fact end is `null`, and the parent's `2026-09-12` and the other
  leaf's `2026-09-09` stand

#### Scenario: a done parent's unknown clears the parent and every leaf, and one undo restores them

- **GIVEN** a parent marked `done` on `2026-09-12`, so it and both leaves hold that fact end
- **WHEN** `setStatus` sets the parent `unknown`, then the actor undoes once
- **THEN** all three fact ends are `null` after the act and `2026-09-12` again after the undo,
  and the act added one journal entry

#### Scenario: unknown on a row that was not done leaves the facts

- **GIVEN** an in-progress leaf with a typed fact end
- **WHEN** `setStatus` sets it `unknown`
- **THEN** its `progress` is empty and its fact end is what it was

#### Scenario: the reader's day wins over the server's

- **GIVEN** a browser whose local day is `2026-09-13` while UTC is still `2026-09-12`, and a
  leaf with no fact end whose forecast ends on or after `2026-09-13`
- **WHEN** the Status cell marks it done and the completion prompt is confirmed as offered
- **THEN** the command carries `on: '2026-09-13'` and the fact end reads `2026-09-13`

#### Scenario: the start is filled where empty and kept where typed

- **GIVEN** two leaves, one with no fact start and one with `2026-09-02`
- **WHEN** each is marked `done` with `on: '2026-09-12', factStart: '2026-09-08'`
- **THEN** the first's fact start reads `2026-09-08` and the second's still `2026-09-02`

#### Scenario: a non-date start is refused

- **GIVEN** a `setStatus` with `factStart: 'last week'`
- **WHEN** it reaches the commands route
- **THEN** it is refused `400 factStart_must_be_a_date` and no row is written

#### Scenario: unknown takes both days, and one undo brings both back

- **GIVEN** a parent marked `done` on `2026-09-12` from `2026-09-08`
- **WHEN** `setStatus` sets it `unknown`, then the actor undoes once
- **THEN** every fact start and fact end in scope is `null` after the act and back after the
  undo, from one journal entry

```

### Earlier Status prompt wording

Source at local parent `7f8a426a2823f81b01e8fe1307d4b092941e8920`,
`openspec/changes/status-at-a-glance/specs/wbs-domain/spec.md`, blob
`4edaca2c263af1fedae3b70625c295869aeeacd6`.

```text
### Requirement: Choosing Done opens the completion prompt before anything is written

Choosing `Done` in the Status cell of a row whose status is not `done` SHALL open the
completion prompt and SHALL send nothing until it is confirmed. The prompt SHALL name the
row, SHALL hold one date field prefilled with the row's fact end when it holds one and with
the reader's local calendar day otherwise, SHALL offer `Cancel` and `Mark done`, and SHALL
put focus in the date field; on close, confirmed or dismissed, focus SHALL return to the
Status cell that asked. Confirming SHALL send `setStatus` with the field's day as `on`;
when the row already held a fact end and the field's day differs, a `patch` of `factEnd` to
the field's day SHALL follow. Cancel, Escape and a click outside SHALL close the prompt with
nothing sent and the status unchanged. A field holding no day or a day that is not an
`IsoDate` SHALL disable `Mark done`. Choosing `Unknown` SHALL open no prompt.

#### Scenario: today is offered and sent

- **GIVEN** a leaf reading `Unknown` with no fact end, on a browser whose local day is
  `2026-09-13`
- **WHEN** `Done` is chosen and the prompt confirmed unchanged
- **THEN** exactly one command was sent, `setStatus` with `on: '2026-09-13'`, and the row reads
  `Done`

#### Scenario: another day is typed

- **GIVEN** the same leaf
- **WHEN** `Done` is chosen, the field changed to `2026-09-10`, and the prompt confirmed
- **THEN** `setStatus` carries `on: '2026-09-10'` and the Fact end cell reads that day

#### Scenario: a held fact end is offered, and a change to it follows as a patch

- **GIVEN** a leaf reading `In progress` whose fact end is `2026-09-10`
- **WHEN** `Done` is chosen, the field changed to `2026-09-11`, and the prompt confirmed
- **THEN** `setStatus` with `on: '2026-09-11'` is sent, then `patchWorkItem` with `factEnd:
'2026-09-11'`, in that order

#### Scenario: cancelling writes nothing

- **GIVEN** a leaf reading `Unknown`
- **WHEN** `Done` is chosen and the prompt dismissed by Cancel, by Escape, or by a click outside
- **THEN** no command is sent, the row still reads `Unknown`, and focus is back in the Status
  cell

#### Scenario: a parent's prompt speaks for its leaves

- **GIVEN** a parent reading `In progress`
- **WHEN** `Done` is chosen and the prompt confirmed with `2026-09-12`
- **THEN** one `setStatus` for the parent carries `on: '2026-09-12'`, and every leaf beneath
  it with no fact end reads that day

```
