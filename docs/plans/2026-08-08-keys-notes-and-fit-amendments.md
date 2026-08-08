# Amendments to plan-keys-and-fit-2026-08-08 — v1.1, after Dany's answers

Dany, 2026-08-08 ~15:50 Kyiv: **yes** to the Ctrl family; **ok** to the
accordion and to Cmd+Enter landing in Name — but sticky-left pinning must
**stay**; assignees must be visible _and_ editable in the **folded** role view;
and every column gets compacted as far as it will go.

## A. Pinning stays (change 1 amended)

The pinning machinery (`PINNED_COLUMNS`, `pinnedGeometry`, `pinnedCellStyle`)
is **kept, not deleted**. It becomes the backstop for the one case width:100%
cannot cover: a viewport narrower than the table's minimum (sum of the fixed
columns + Name's floor). The table gets `minWidth: <that sum>`; above it there
is no horizontal scroll and pinning is invisible; below it the frame scrolls
and drag/Number/Name hold the left edge exactly as today.

Flexible Name does not disturb the offsets: only drag, number, name are
pinned, their lefts are prefix sums of _fixed_ widths (drag, number), and
Name's own flexibility only moves what comes after it. `tableWidth()` (fixed
total on the `<table>`) still dies; `minWidth` replaces it.

Playwright assertion amended: at 1280×800 and 1512×982, `scrollWidth <=
clientWidth` (no h-scroll at laptop widths, roles folded or one unfolded);
plus one run at a deliberately narrow width (e.g. 900px) asserting the pinned
Name still sits at its computed offset while the frame scrolls — the backstop
provably works.

## B. Assignee in the folded role view (new work in change 1's column pass)

Today a folded role renders one column, `<roleId>-final` (the `o/r/p`
shorthand box or the computed figure); the assignee column exists only
unfolded. Amended per Dany (2026-08-08 ~15:55 Kyiv): **`@` in the folded
cell assigns, Slack-mention style. One input, no second line.**

- **Typing `@` in the folded estimate box opens the people picker** as a
  popover under the cell, filtered live by what follows the `@`. Enter (or
  click) takes the highlighted person; **no match offers `Add "<typed>"`**,
  creating the contributor by name exactly as the unfolded
  `CreatablePicker` does — same idempotent add-by-name endpoint, same
  free-agent semantics. On pick, the assignment PATCHes, the `@fragment` is
  stripped from the box, and the estimate text is left as it was —
  `2/3/8@ka⏎` is one fluid gesture: trio typed, Kateryna assigned. Escape
  closes the list, strips nothing, changes nothing.
- The estimate parser never sees the `@` half: the fragment is held apart
  from the shorthand draft (which stays `2/3/8`-shaped), so a half-typed
  mention cannot read as a broken trio or get committed on blur.
- **Display when folded:** the cell shows the figure plus the assignee —
  `4.8 · Kat` — truncated, full name in `title`; the grey "assumed" name
  renders under the same `doesEveryPhase` rule the unfolded cell has.
  **Removing an assignee folded:** the picker (opened by `@`) shows a
  `Remove <name>` entry when someone is assigned, mirroring the unfolded
  clear affordance.
- **Clip exemption:** the folded picker's list sits inside the `-final`
  column's `<td>`, which clips today. `opensAPopover` extends to role
  `-final` columns, with a fault row (exemption removed → the list is
  clipped to the 96px cell).
- The fold button's copy ("show/hide the three-point estimate and assignee",
  ~line 2526) is rewritten — the assignee no longer folds away, so hiding it
  is no longer what the button does.
- Rejected alternative, recorded: a second `CreatablePicker` line inside the
  folded cell — two tab stops where Dany asked for one gesture, and a
  permanent height cost on every row for a control used occasionally.
- The `@` binding lands in `KEY_BINDINGS` ("Pickers": `@` — assign in a
  folded estimate cell) with its `PROVEN_BY` tests, same as every chord in
  change 4.

## C. Compact everything (change 1's width table, superseding v1's numbers)

Proposed px, to be proven by the pixels job rather than argued (headers
shortened where named):

| column                   | now | plan v1  | v1.1                | note                                     |
| ------------------------ | --- | -------- | ------------------- | ---------------------------------------- |
| drag                     | 28  | 28       | 24                  | handle only                              |
| number                   | 168 | 110      | 100                 | indent step 16→12, cap 4                 |
| name                     | 360 | flexible | flexible, floor 200 | absorbs the rest                         |
| depends                  | 220 | 120      | 110                 | chips wrap; listbox minWidth 260         |
| team                     | 160 | 160      | 120                 | picker list escapes the cell anyway      |
| final-total              | 70  | 70       | 52                  | header "Days"                            |
| not-before               | 130 | 130      | 108                 | native date input's floor decides        |
| start                    | 70  | 70       | 52                  | header "Start"                           |
| finish                   | 70  | 70       | 52                  | header "End"                             |
| float                    | 90  | 90       | 56                  | header "Slack"                           |
| notes                    | 260 | deleted  | deleted             | lives in Name                            |
| actions                  | 110 | 44       | 40                  | one ⋯ button                             |
| role folded (`-final`)   | 76  | 76       | 96                  | grew: now holds estimate + assignee line |
| role point               | 76  | 76       | 52                  | a number of days                         |
| role assignee (unfolded) | 160 | 160      | 120                 | truncate + title                         |

Folded-roles fixed sum ≈ 906px + Name's 200 floor ≈ 1106 — fits a 1280
laptop with margin; one role unfolded ≈ +180 over its folded self, still
under 1280 with Name at floor... to be _measured_, not trusted: the pixels
job runs the folded and one-unfolded layouts at 1280×800 and fails on any
h-scroll. If 1280 cannot hold one-unfolded, the accordion question reopens
with real numbers in hand.

The native date input is the one box that may refuse its 108px on some
platform renderings — the pixels job asserts its value is not clipped, and
the width takes whatever floor the assertion finds.

## D. Fold into v2

These amendments merge into plan v2 together with the codex/agy findings
(reviews of v1 are running as this is written; anything they say about
deleted pinning is moot per A, and their width comments get re-aimed at the
v1.1 table).
