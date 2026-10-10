# wbs-tool — manual browser test suite (dev), 11 Aug 2026

Historical August 2026 test plan, prepared for publication 2026-10-06. It records the UI and
build assumptions of that date; it is not the current product contract. Execute
only against an authorized disposable test instance, never customer projects.
No cases were rerun as part of this archival publication.
49 cases: **A scheduling-core (18)**, **B recent-PR features (10)**,
**C UI/UX polish (6)**, **D today's merges (15)**.
Each case is independently executable — it names the rows it needs, and no case
depends on another having run first (except where a case explicitly says "continue
from case X", which is always the case immediately above it).

Grounded in the historical `wbs-tool-v1` repository, main @ `e3eae84` plus open PRs
#37 `change/name-column-drag`, #38 `change/dep-hover-highlights`,
#39 `change/gantt-calendar-snap`. **Group D** is grounded on `origin/main`
@ `01a6bed` — PR #41 `critical-snap` (@ `681740e`) and PR #43 `priority-column`
(@ `01a6bed`) merged — plus PR #42 `dep-add-button` @ `b1fe412`, open at the
time of writing.

---

## 0. Shared setup — do this once per group

1. Open the authorized test instance and authenticate using its current procedure.
2. Click **+** (`aria-label="New project"`) in the header. Rename it (the **✎**
   button, then the `Project name` box, Enter commits).
3. Click **Phases** in the toolbar. Add one phase named **Dev**. Close the dialog.
   _Without at least one phase there are no estimate columns to type into._
4. Set **Starts** (`aria-label="Project start date"`) to **2026-09-01**.
5. Leave **Plan with** (`aria-label="Final estimate"`) on **PERT**.

### Vocabulary → UI

| Term here        | Where it is                                                                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| estimate `2/3/8` | the folded **Dev** column cell; `o/r/p`, or one number for all three. Decimals allowed (`0.5`, `14.9`). Must be non-decreasing — `8/3/2` is refused, not sorted. |
| dep              | the **Depends on** cell; type row numbers, comma or space separated (`010, 020`). ✕ on a chip removes it.                                                        |
| floor            | the **Not bef.** column (`Earliest start for <number>`). Disabled with no project start date.                                                                    |
| assignee         | in the folded Dev cell: `@name`, or `2/3/8@person-a` in one gesture.                                                                                             |
| new row          | **Ctrl+N** (or **Alt+N**) from any cell. Indent **Alt+→** / **Tab** at name start.                                                                               |
| Start / End      | table columns; hover gives the full ISO date in the `title`.                                                                                                     |
| Slack            | table column; shows `critical` (with `data-critical="true"`) or a number.                                                                                        |
| bar facts        | hover a Gantt bar → hover card; same text as the bar's `aria-label`.                                                                                             |

### PERT

`final = (optimistic + 4×realistic + pessimistic) / 6`. A single number means all
three points are that number.

### Workday ↔ date reference (project start 2026-09-01, a **Tuesday**)

Weekends only; no holidays. `wd0` is the start date itself.

| wd  | date           | wd  | date           | wd  | date           |
| --- | -------------- | --- | -------------- | --- | -------------- |
| 0   | Tue 2026-09-01 | 9   | Mon 2026-09-14 | 18  | Fri 2026-09-25 |
| 1   | Wed 2026-09-02 | 10  | Tue 2026-09-15 | 19  | Mon 2026-09-28 |
| 2   | Thu 2026-09-03 | 11  | Wed 2026-09-16 | 20  | Tue 2026-09-29 |
| 3   | Fri 2026-09-04 | 12  | Thu 2026-09-17 | 21  | Wed 2026-09-30 |
| 4   | Mon 2026-09-07 | 13  | Fri 2026-09-18 | 22  | Thu 2026-10-01 |
| 5   | Tue 2026-09-08 | 14  | Mon 2026-09-21 | 23  | Fri 2026-10-02 |
| 6   | Wed 2026-09-09 | 15  | Tue 2026-09-22 | 24  | Mon 2026-10-05 |
| 7   | Thu 2026-09-10 | 16  | Wed 2026-09-23 | 25  | Tue 2026-10-06 |
| 8   | Fri 2026-09-11 | 17  | Thu 2026-09-24 |     |                |

### The two calendar rules every expectation below is derived from

- **A row's Start date** is `addWorkdays(projectStart, firstWorkdayOf(startOffset))`,
  where `firstWorkdayOf = floor(snap(x))`.
- **A row's End date** is `addWorkdays(projectStart, lastWorkdayOf(start, finish))`,
  where `lastWorkdayOf = max(firstWorkdayOf(start), ceil(snap(finish)) - 1)`.
- `snap(x)` = `x` rounded to a whole number when within **1e-9** of one, otherwise
  `x` untouched.

Geometry: one calendar day = **28 CSS px** (`DAY_PX`), one row = 28px (`ROW_PX`),
label column 176px.

---

# Group A — scheduling core

## A1 — chained PERT fractions that drift _above_ a whole day

**Setup.** Four rows at top level, no indent.

| #   | Dev estimate | Depends on |
| --- | ------------ | ---------- |
| 010 | `0/8/13`     | —          |
| 020 | `3/4/6`      | 010        |
| 030 | `2/3/6`      | 020        |
| 040 | `15`         | —          |

(`45/6 = 7.5`, `25/6 = 4.166…`, `20/6 = 3.333…`. The chained sum is
`15.000000000000002` — not 15.)

**Action.** Read the Start/End columns; open the Gantt.

**Expected.**

| #   | Start          | End                |
| --- | -------------- | ------------------ |
| 010 | Tue 2026-09-01 | Thu 2026-09-10     |
| 020 | Thu 2026-09-10 | Wed 2026-09-16     |
| 030 | Wed 2026-09-16 | **Mon 2026-09-21** |
| 040 | Tue 2026-09-01 | **Mon 2026-09-21** |

- 030's End must be **Mon 2026-09-21**, never Tue 2026-09-22. A bare
  `ceil(15.000000000000002)` mints a 16th day and prints 22 Sep — that is the
  bug this case exists for.
- 030's bar **right edge x must equal 040's bar right edge x, to the pixel.**
  040 is 15 flat days, so the two are the same span expressed two ways.
- The calendar axis' last cell is **Mon 2026-09-21**. There must be no empty
  trailing day cell past it.
- 030 and 040 both show Slack `critical`.

---

## A2 — chained PERT fractions that drift _below_ a whole day

**Setup.**

| #   | Dev estimate | Depends on |
| --- | ------------ | ---------- |
| 010 | `1/1/4`      | —          |
| 020 | `1/1/11`     | 010        |
| 030 | `1/2/2`      | 020        |
| 040 | `5`          | 030        |

(`9/6 = 1.5`, `16/6 = 2.666…`, `11/6 = 1.833…`; the chained sum at 030's finish is
`5.999999999999999` — just under 6.)

**Expected.**

| #   | Start              | End            |
| --- | ------------------ | -------------- |
| 010 | Tue 2026-09-01     | Wed 2026-09-02 |
| 020 | Wed 2026-09-02     | Mon 2026-09-07 |
| 030 | Mon 2026-09-07     | Tue 2026-09-08 |
| 040 | **Wed 2026-09-09** | Tue 2026-09-15 |

- 040's Start must be **Wed 2026-09-09**. A bare `floor(5.999999999999999)` gives
  workday 5 and starts 040 on **Tue 2026-09-08** — a whole day early, on top of
  030's last day. Check the Gantt too: 030's bar and 040's bar must not share
  any horizontal pixel range.

---

## A3 — a zero-day row and an unestimated row, back to back

**Setup.**

| #   | Dev estimate    | Depends on |
| --- | --------------- | ---------- |
| 010 | `3`             | —          |
| 020 | `0`             | 010        |
| 030 | _(leave empty)_ | 020        |
| 040 | `2`             | 030        |

**Expected.**

- 010: Tue 2026-09-01 → Thu 2026-09-03.
- 020: Start **and** End both **Fri 2026-09-04**; Days column `0`. Its Gantt bar
  is a zero-width mark at the left edge of the Fri 04 Sep cell — it must be
  visible (a stroke, not nothing) and must not be drawn a day wide.
- 030: Start **and** End both **Fri 2026-09-04**. The End cell text ends with
  ` ?`; its `title` contains `No estimate yet`.
- 030's Gantt bar is drawn **2 workdays wide** (Fri 04 + Mon 07 Sep) with a
  distinct hatched/guess fill, and its facts include the line
  `Not estimated — drawn as 2 days`.
- **040 starts Fri 2026-09-04, not Tue 2026-09-08.** The drawn 2-day guess must
  push nothing: 030 and 040 bars overlap in time, and that is correct.

---

## A4 — sub-day rows tile inside one calendar cell

**Setup.** Four rows, each estimate `0.5`, chained 010→020→030→040.

**Expected.**

| #   | Start          | End            |
| --- | -------------- | -------------- |
| 010 | Tue 2026-09-01 | Tue 2026-09-01 |
| 020 | Tue 2026-09-01 | Tue 2026-09-01 |
| 030 | Wed 2026-09-02 | Wed 2026-09-02 |
| 040 | Wed 2026-09-02 | Wed 2026-09-02 |

- Days column reads `0.5` on all four.
- Gantt: 010 and 020 each **14px** wide inside the 28px Tue 01 Sep cell —
  010 at the cell's left half, 020 at its right half, **abutting, not
  overlapping**. Same for 030/040 inside Wed 02 Sep.
- No bar spills into a neighbouring day cell.

---

## A5 — a span that straddles a weekend

**Setup.** One row 010, estimate `5`, **Not bef.** = `2026-09-03` (a Thursday).

**Expected.**

- Start **Thu 2026-09-03**, End **Wed 2026-09-09**.
- The bar is **7 calendar cells** wide (196px) for 5 workdays: it runs from the
  left edge of Thu 03 Sep to the right edge of Wed 09 Sep, **continuously across
  Sat 05 and Sun 06 Sep** — no gap, no split into two bars.
- The Sat/Sun columns are shaded differently from workday columns, and the heavy
  gridline falls on **Mon 07 Sep**, not on a Saturday.
- Days column reads `5`.

---

## A6 — a floor written on a parent reaches its leaves (PR #36)

**Setup.**

| #            | Dev estimate | Not bef.       |
| ------------ | ------------ | -------------- |
| 010 (parent) | —            | **2026-09-14** |
| 010.1        | `2`          | —              |
| 010.2        | `3`          | —              |

(Create 010, then two rows under it with Ctrl+N + Alt+→. Re-read the numbers after
indenting — they renumber to `010.1` / `010.2`.)

**Expected.**

- 010.1: Mon 2026-09-14 → Tue 2026-09-15.
- 010.2: Mon 2026-09-14 → Wed 2026-09-16.
- Parent 010 span: Mon 2026-09-14 → Wed 2026-09-16; its Gantt bracket/bar covers
  exactly its children's extent.
- Both children's bar facts show the floor line
  `Held by its start-no-earlier-than date`.
- **Regression form:** a leaf starting Tue 2026-09-01 means the parent floor was
  stored, echoed back and constrained nothing.

---

## A7 — the stricter of parent floor and child floor wins

**Setup.**

| #            | Dev estimate | Not bef.       |
| ------------ | ------------ | -------------- |
| 010 (parent) | —            | **2026-09-07** |
| 010.1        | `2`          | **2026-09-16** |
| 010.2        | `2`          | —              |

**Expected, step 1.**

- 010.1: Wed 2026-09-16 → Thu 2026-09-17 _(its own, later floor wins)_.
- 010.2: Mon 2026-09-07 → Tue 2026-09-08 _(inherits the parent's)_.
- Parent 010 span: Mon 2026-09-07 → Thu 2026-09-17.

**Action, step 2.** Change 010's floor to **2026-09-23**.

**Expected, step 2.** Both children now start **Wed 2026-09-23** — the parent's
later floor now wins over 010.1's own 16 Sep. 010.1 → Thu 2026-09-24,
010.2 → Thu 2026-09-24. Nothing moved earlier.

---

## A8 — a floor may push later, never pull earlier

**Setup.**

| #   | Dev estimate | Depends on | Not bef.       |
| --- | ------------ | ---------- | -------------- |
| 010 | `10`         | —          | —              |
| 020 | `2`          | 010        | **2026-09-04** |

**Expected.**

- 020: Start **Tue 2026-09-15**, End **Wed 2026-09-16** — the dependency wins;
  the floor of Fri 04 Sep pulls nothing back.
- 020's bar facts floor line reads exactly
  **`Waits for a dependency to finish`** — not
  `Held by its start-no-earlier-than date`.
- A **not-before caret** is still drawn above 020's bar, standing at workday 3
  (Fri 04 Sep), i.e. to the **left** of the bar. Hovering it gives the native
  `title` `No earlier than 2026-09-04`.

---

## A9 — a floor past the project's other work (negative float, pinned)

**Setup.**

| #   | Dev estimate | Not bef.       |
| --- | ------------ | -------------- |
| 010 | `3`          | —              |
| 020 | `1/4/6`      | **2026-09-18** |

(`23/6 = 3.833…`; the floor at wd13 stands 020 past everything else, so 020 _is_
the project finish.)

**Expected.**

- 010: Tue 2026-09-01 → Thu 2026-09-03.
- 020: **Fri 2026-09-18 → Wed 2026-09-23**.
- 020's bar facts floor line: `Held by its start-no-earlier-than date`.
- **Slack column on 020 shows `0` and NOT the word `critical`** (no
  `data-critical="true"` attribute). This is the engine's _pinned_ answer: the
  backward pass reconstructs `latestStart` by subtraction and
  `(13 + 23/6) − 23/6 ≠ 13` in doubles, so the float is about `−1.8e-15`, which
  `showDay` prints as `0`. Report exactly what the cell says.
- 010's Slack is a positive number (it has real slack), not `critical`.
- **Report as a finding** if the last row of the plan is drawn with the critical
  outline while its Slack cell says `0`, or if the cell reads `-0`.

---

## A10 — diamond / converging dependencies

**Setup.**

| #   | Dev estimate | Depends on |
| --- | ------------ | ---------- |
| 010 | `4`          | —          |
| 020 | `3`          | 010        |
| 030 | `6`          | 010        |
| 040 | `2`          | 020, 030   |

**Expected, step 1.**

| #   | Start          | End            | Slack      |
| --- | -------------- | -------------- | ---------- |
| 010 | Tue 2026-09-01 | Fri 2026-09-04 | `critical` |
| 020 | Mon 2026-09-07 | Wed 2026-09-09 | `3`        |
| 030 | Mon 2026-09-07 | Mon 2026-09-14 | `critical` |
| 040 | Tue 2026-09-15 | Wed 2026-09-16 | `critical` |

- 040 starts after the **later** of its two predecessors, not the first-listed one.
- Gantt: two dependency arrows converge on 040's left edge; each arrives
  horizontally and its head sits inside the bar's start. Neither arrow crosses a
  bar it does not connect.

**Action, step 2.** Change 020 to `6`.

**Expected, step 2.** Both branches now 6 days: 020 and 030 both
Mon 2026-09-07 → Mon 2026-09-14, both `critical`, 040 unchanged at
Tue 2026-09-15 → Wed 2026-09-16, `critical`. Every one of the four rows is
`critical`, and no row shows a tiny nonzero Slack like `0` from drift.

---

## A11 — resource contention: two rows, one assignee

**Setup.** No dependencies at all.

| #   | Dev estimate | Assignee |
| --- | ------------ | -------- |
| 010 | `2@person-a` | person-a |
| 020 | `3@person-a` | person-a |

**Expected.**

- **020 runs first**: Tue 2026-09-01 → Thu 2026-09-03.
- **010 runs second**: Fri 2026-09-04 → Mon 2026-09-07.
- The leveller ranks by critical-path start, then by **least float**, then by row
  number. Both start at wd0 in the unlevelled pass, 020 has float 0 and 010 has
  float 1 — so the **higher-numbered** row goes first. A run where 010 goes first
  is a leveller that fell back to row order.
- 010's bar facts floor line reads **`person-a — after <020's name> (Dev)`**.
- Both bars are the same colour (one person, one colour) and never share a
  horizontal pixel range.
- Both rows show Slack `critical` (the resource edge makes the queue the longest
  path).

---

## A12 — the person/predecessor tie goes to the predecessor

**Setup.**

| #   | Dev estimate | Assignee   | Depends on |
| --- | ------------ | ---------- | ---------- |
| 010 | `5`          | _(nobody)_ | —          |
| 020 | `5@person-a` | person-a   | —          |
| 030 | `2@person-a` | person-a   | 010        |

**Expected.**

- 020: Tue 2026-09-01 → Mon 2026-09-07 (wd0–wd4).
- 010: Tue 2026-09-01 → Mon 2026-09-07.
- 030: **Tue 2026-09-08 → Wed 2026-09-09**.
- person-a comes free at wd5 at the same moment 010 clears at wd5. The tie is
  **not** the person: 030's bar facts floor line must read
  **`Waits for a dependency to finish`**, never `person-a — after …`.
  A plan that says otherwise counts 030 into "rows waiting for a person" when
  nobody was waiting.

---

## A13 — deep hierarchy (depth 5) with mixed floors

**Setup.** One chain of nesting plus a shallower sibling leaf.

```
010                      floor 2026-09-08
  010.1
    010.1.1              floor 2026-09-16
      010.1.1.1
        010.1.1.1.1      Dev 3
    010.1.2              Dev 2
```

(Build with Ctrl+N then Alt+→ per level. Re-read numbers after each indent.)

**Expected.**

- `010.1.1.1.1`: **Wed 2026-09-16 → Fri 2026-09-18** — it takes the _latest_ of
  every ancestor floor (`max(wd5, wd11) = wd11`).
- `010.1.2`: **Tue 2026-09-08 → Wed 2026-09-09** — it is not under `010.1.1`, so
  only the root's floor reaches it.
- Parent spans: `010.1.1` = Wed 16 → Fri 18 Sep; `010.1` and `010` = Tue 08 Sep →
  Fri 18 Sep.
- Rendering: each level's Name cell is indented further than the one above, the
  indent does **not** stop growing at depth 4, and the depth-5 name text is still
  legible and not clipped to zero width inside the Name column.
- The Number column paints nothing over Name — the `<td>` is `overflow: hidden`
  and Name is sticky and opaque above it — and `010.1.1.1.1` is whole in the
  cell's `title`.

  **Corrected 2026-08-14: it does _not_ hold `010.1.1.1.1` inside the 93px
  column, and it never undertook to.** `NUMBER_ENVELOPE` is **two** levels
  (`010.1`); anything longer is clipped with the whole number in the `title`,
  which is the bargain the short dates make and which two browser tests in
  `e2e/layout.spec.ts` already assert. Measured in Chromium at 1280×800: depth 4
  ends at 125.88 against a cell ending at 133 and fits; depth 5 ends at 135.06
  and is 2.06px over (`scrollWidth` 99 against `clientWidth` 93).

  **What _is_ a live finding, and is open with the product owner** (PR #62 `design.md` D4):
  read character by character, depth 5 draws `010.1.1.1.` and depth 6 draws
  `010.1.1.1.` — **a row and its child read as the same number**, which is the
  fault the 2026-08-12 UI audit reported at depth 4 and `table-mechanics` fixed,
  one level along. Nothing fixes it yet: widening the column buys one level and
  moves the break to 6/7, and the fix that holds at every depth (eliding from
  the _head_, keeping the discriminating tail) changes how every clipped number
  in the product reads.

---

## A14 — live reflow: change an estimate mid-chain

**Setup.** Build A10 step 1 (the diamond, 020 = `3`). Confirm those dates first.

**Action.** Change **020** from `3` to `8`. Do not reload.

**Expected, without a page reload.**

- 020: Mon 2026-09-07 → **Wed 2026-09-16**, now `critical`.
- 030: unchanged Mon 2026-09-07 → Mon 2026-09-14, Slack now **`2`** (was
  `critical`).
- 040: **Thu 2026-09-17 → Fri 2026-09-18**, `critical`.
- The Gantt bars move in the same paint as the table cells — no stale bar left at
  the old x, no reload needed, and the axis extends to Fri 2026-09-18.

---

## A15 — live reflow: delete a dependency

**Setup.** Build A10 step 1 (the diamond, 020 = `3`).

**Action.** In 040's Depends on cell, click the ✕ on the **030** chip only.

**Expected, without a page reload.**

- 040: **Thu 2026-09-10 → Fri 2026-09-11** (now waits only for 020).
- 030: unchanged Mon 2026-09-07 → Mon 2026-09-14, still `critical` — it is now
  the project finish on its own.
- 020 Slack **`1`**, 040 Slack **`1`**, 010 `critical`.
- The Gantt loses exactly one arrow (030→040); the 020→040 arrow remains and is
  re-routed to 040's new position.

---

## A16 — live reflow: move a floor

**Setup.** Build A6 (parent floor 2026-09-14, children `2` and `3`).

**Action.** Change 010's **Not bef.** to `2026-09-21`.

**Expected, without a page reload.**

- 010.1: **Mon 2026-09-21 → Tue 2026-09-22**.
- 010.2: **Mon 2026-09-21 → Wed 2026-09-23**.
- Both bars slide right by exactly **7 calendar cells = 196px** (5 workdays), and
  the not-before carets move with them.
- The parent's span bar tracks the children in the same paint.

---

## A17 — a cycle is refused, including one only the expansion would close

**Setup.**

```
010            (parent)
  010.1        Dev 2
  010.2        Dev 2
020            (parent)
  020.1        Dev 2   Depends on: 010.1
```

**Action 1.** In 010.1's Depends on cell, try to pick **020.1**.
**Expected 1.** The picker refuses it — the entry is skipped by ↑/↓ and cannot be
taken with Enter; typing `020.1` and pressing Enter writes nothing and leaves a
readable refusal. The plan still schedules; no cycle banner.

**Action 2.** In **010**'s (the parent's) Depends on cell, try to pick **020**.
**Expected 2.** Also refused. Expanding `020 → 010` to leaves would put `020.1`
before `010.1`, closing a cycle against the edge already written. The refusal must
happen at write time — accepting it and then breaking every later read of the
project is the failure mode this case is for.

**Report as a finding** if either write is accepted, or if after it the Gantt shows
`Nothing can be drawn while these dependencies run in a circle`.

---

## A18 — a dependency written on parents holds all their leaves

**Setup.**

```
010            (parent)
  010.1        Dev 2
  010.2        Dev 4
020            (parent)   Depends on: 010
  020.1        Dev 1
  020.2        Dev 3
```

**Expected.**

- 010.1: Tue 2026-09-01 → Wed 2026-09-02.
- 010.2: Tue 2026-09-01 → Fri 2026-09-04.
- **020.1: Mon 2026-09-07 → Mon 2026-09-07.** It must _not_ start Thu 2026-09-03
  after only 010.1 — "the whole of 010 before 020" means every leaf of 010.
- 020.2: Mon 2026-09-07 → Wed 2026-09-09.
- Gantt arrows: the edge is drawn between the two spans; no leaf of 020 begins
  left of the right edge of 010's span.

---

# Group B — recent-PR features

## B1 — the Name column takes a dragged width (PR #37)

**Setup.** Any project with 3–4 rows and at least one phase. Note the current
computed widths of the Number and Name columns.

**Action.** Drag `[data-resize-handle="name"]` (title `Drag to resize Name`)
**right by 120px** and release.

**Expected.**

- Name's resolved width increases by ~120px (allow ±2px for pointer rounding).
- **Number stays at exactly 93px** at every viewport width. The excess goes to the
  viewport (a horizontal scrollbar or trailing space), not spread across the other
  columns. A Number of 103.48px is the losing branch resurfacing.
- Every other sized column keeps its width unchanged.
- The table's own declared width equals the sum of the resolved column widths.
- Nothing in the table remounts: if a cell had focus and a caret before the drag,
  it still has both after.

---

## B2 — the Name drag clamps at 200 and 600

**Setup.** As B1.

**Action 1.** Drag the Name handle far left (e.g. 400px past the point where Name
would be 0).
**Expected 1.** Name settles at **200px** and no lower. No column gets a negative
or zero width; no text is clipped to invisibility.

**Action 2.** Drag the Name handle far right (e.g. 900px).
**Expected 2.** Name settles at **600px** and no higher.

Both bounds hold on release _and_ during the drag — the live preview must not
overshoot and snap back.

---

## B3 — Reset layout, and the width survives a reload

**Setup.** Do B1 (Name ~120px wider).

**Action 1.** Reload the page.
**Expected 1.** Name comes back at the dragged width — the override is stored per
project, not per session.

**Action 2.** Click **Reset layout**.
**Expected 2.** Every column — Name **included** — returns to its default width in
one gesture. Number still 93px.

**Action 3.** Reload again.
**Expected 3.** Defaults persist; the override is gone, not merely hidden.

---

## B4 — hovering a Depends on cell lights every row it names (PR #38)

**Setup.**

| #   | Dev | Depends on |
| --- | --- | ---------- |
| 010 | `2` | —          |
| 020 | `2` | —          |
| 030 | `2` | —          |
| 040 | `2` | 010, 030   |

**Action.** Move the pointer into 040's Depends on cell, over the cell's empty
input area (not over a chip).

**Expected.**

- Rows **010 and 030** gain `data-dep-lit="true"` and visibly change background
  tint — including their **pinned/sticky cells** (Number, Name), which must take
  the same tint and not stay the old opaque colour.
- Row **020** is not lit. Row **040** is not lit (a row does not wait for itself);
  it carries only the ordinary `tr:hover` tint.
- Row heights, column widths and scroll position do not change on hover.

---

## B5 — hovering one chip lights one row, and emphasises its line in the card

**Setup.** As B4.

**Action.** Hover the **010** chip inside 040's Depends on cell.

**Expected.**

- **Only** row 010 is lit; row 030 goes dark.
- The hover card for the cell shows both dependencies, with **010's line** carrying
  the same tint as the lit row — a background swatch, **not** bold text and not a
  font change.
- Moving to the **030** chip swaps the lighting and the emphasis with no flicker of
  "both lit" or "neither lit" in between.

---

## B6 — the hover state machine on exit

**Setup.** As B4, pointer currently on the 010 chip (only 010 lit).

**Expected transitions.**

1. Move from the **010 chip** into the cell's own area (still inside the cell) →
   **both** 010 and 030 lit again.
2. Move from the cell to a **different cell in the same row** → nothing lit.
3. Move from the cell straight out of the table → nothing lit,
   no `data-dep-lit` attribute anywhere in the tbody.
4. Move the pointer quickly across several Depends on cells → the lit set always
   matches the cell currently under the pointer; no row stays lit behind it.

---

## B7 — a dependency whose row is not on screen

**Setup.** As B4, but make **010** a child of a collapsible parent, then collapse
that parent (or type something in **Find** that narrows 010 out of the table).

**Action.** Hover 040's Depends on cell.

**Expected.**

- No row lights for 010 (it has no `<tr>`), and **030 still lights normally** —
  one missing row must not suppress the rest.
- The hover **card still names 010**. The guarantee is the card's, not the row's.
- Nothing throws; no blank card, no missing line.

---

## B8 — a hover must not remount cells

**Setup.** As B4.

**Action.** Click into **020's Name** cell, type `abc` without committing, place
the caret between `a` and `b`. Now hover 040's Depends on cell, then leave it.

**Expected.**

- The caret is still between `a` and `b`; `abc` is still uncommitted; focus is
  still in the Name cell.
- No cell loses its editing state, no picker closes, and no row scrolls into view.
  A hover that remounts cells will show up here as a lost caret or lost focus.

---

## B9 — the chart reads workdays through the same snap the dates do (PR #39)

**Setup.** Exactly A1's four rows (`0/8/13` → `3/4/6` → `2/3/6`, plus a
standalone `15`).

**Expected — measure, do not eyeball.**

1. **030's bar right edge x === 040's bar right edge x**, to the pixel. Read both
   with `getBoundingClientRect()`. 040 is 15 whole days; 030 is the drifted
   `15.000000000000002` of the same 15 days.
2. 030's `data-finish` attribute still carries the engine's raw number
   (`15.000000000000002`) — the wire value is **not** snapped, only the drawing is.
3. The bar facts on 030 print the same End date the table prints:
   **Mon 2026-09-21**.
4. The calendar axis' final cell is Mon 2026-09-21; the axis has no extra minted
   day cell, and the drawn canvas width equals the schedule's span plus the
   symmetric padding band at each side.
5. 030's bar left edge x === 020's bar right edge x (a shared boundary, since
   030 starts at 020's finish).

**Report as a finding** any pixel difference at all in (1) — that is the exact
class of fault this PR was written for.

---

## B10 — a genuine fraction near a whole day is real work, not drift

**Setup.**

| #   | Dev estimate | Depends on |
| --- | ------------ | ---------- |
| 010 | `14.9`       | —          |
| 020 | `1`          | 010        |

**Expected.**

- 010: Tue 2026-09-01 → **Mon 2026-09-21**. (`ceil(14.9) − 1 = 14`. Never
  Fri 2026-09-18 — that would be a snap window wide enough to eat real work.)
- 020: Start **Mon 2026-09-21**, End **Tue 2026-09-22**. 020 shares 21 Sep with
  010 — that is correct; the day is 90% 010's and 10% 020's.
- Gantt: 010's bar right edge sits **inside** the Mon 21 Sep cell at ~90% of its
  width (≈25px of the 28px cell), **not** flush with either cell edge. 020's bar
  starts at that same x.
- Days column on 010 reads `14.9`.

---

# Group C — UI/UX polish

## C1 — the Depends on cell rests on one line

**Setup.** One row 060 with **six** dependencies (create 010–050 at `1` day each,
plus one more, then put all of them in 060's Depends on cell as
`010, 020, 030, 040, 050, ...`).

**Expected at rest.**

- The cell is **exactly one line tall**; the row's height is unchanged from a row
  with no dependencies.
- The chips run left-to-right and the overflowing ones are clipped behind an
  **edge fade mask** on the right — a gradient, not a hard cut and not an
  ellipsis glyph.
- The fade is on the **resting** state only: focusing/entering the cell reveals the
  full list (in a popover or expanded state) with no fade over the interactive
  content.
- A **clipped chip is inert**: it cannot be reached by Tab, its ✕ cannot be
  clicked through the fade, and it is not announced as an actionable control.
- Widening the Name column (drag it left, giving Depends on more room) reveals
  more chips and shrinks the fade; it never reflows the row to two lines.

---

## C2 — the keyboard chords

**Setup.** A project with 4 rows at `1` day each. Press **?** first and keep the
cheat sheet's own list as the reference — every assertion below is one of its lines.

Run each from a **Name** cell of row 020 unless stated.

1. **Ctrl+N** (and **Alt+N**) → a new sibling **below 020**, at the same level,
   focus lands in its Name. Works mid-table, not only at the end, and works from
   an **estimate** cell too (where it sends what was typed first).
2. **Enter** inside a Name → a **new line in the name** (the note under the first
   line). It must **not** create a work item.
3. **Ctrl+H / J / K / L** → left / down / up / right between cells, from a caret
   in the middle of a long note — one press leaves the note.
4. **Ctrl+D twice** → the first press tints the row and states what the second
   will do; the second deletes it and its children move up. Then **Ctrl/⌘+Z**
   restores it. A **held** Ctrl+D never deletes. Arming 020 then pressing Ctrl+D
   on 030 **arms 030 and deletes neither**.
5. **Ctrl/⌘+Z** then **Ctrl/⌘+Shift+Z** → undo and redo the last plan change.
   Inside a text box, Ctrl+Z is the browser's, not the plan's.
6. **Escape** closes the cheat sheet and returns focus to the element that had it.
   **Tab** out of the sheet must not trigger Ctrl+N-style page shortcuts.
7. **?** typed inside a text box stays a literal `?`.

---

## C3 — moving rows with Alt

**Setup.** 010, 020, 030 at top level; 020 has two children.

1. **Alt+↓** on 020 → 020 moves below 030 among its siblings, **taking its
   children with it**, and its parent never changes. Numbers renumber accordingly.
2. **Alt+↑** at the top of a sibling group → nothing moves; no error, no wrap.
3. **Alt+→** on 030 from **any** cell and any caret position → 030 indents under
   the row above. **Tab** does the same, but only from the very start of the Name.
4. **Alt+←** outdents from any cell; **Shift+Tab** / **Backspace** outdent from the
   very start of the Name.
5. **Backspace** on a wholly empty top-level row (no note either) removes it and
   leaves focus on the row above.

After each, the Gantt's row order matches the table's, with no orphaned bar.

---

## C4 — the Gantt panel's share of the screen

**Setup.** Open the Gantt with 10+ rows.

1. Drag the panel's top edge up and down → the chart's height follows the pointer
   with no lag ghost.
2. It cannot be dragged below **84px** (3 rows: the axis plus two chart rows).
3. It cannot exceed **80% of the viewport height**, even if a stored height claims
   more — shrink the window after a tall drag and confirm the live cap applies.
4. **Reset** returns the whole layout, chart height included, in one gesture.
5. The height survives a reload.

---

## C5 — a bar says what it is in a surface, not a tooltip

**Setup.** A11 (two rows, one assignee, one person-floored).

**Expected on hovering 010's bar.**

- **Exactly one** surface appears — the app's own hover card. There is **no**
  native browser tooltip on the bar (no `<title>` child). Two tooltips is a bug.
- The card's lines, in order: `010 - <name>` · `Dev · person-a` · the team line · the
  dates + duration · the trio · the float/critical line · the floor line
  (`person-a — after <020's name> (Dev)`) · `after …` only if it waits for something.
- The bar's `aria-label` is those same lines joined — read it and diff it against
  the card text; they must not disagree.
- Every absence is words, never a blank: an unassigned bar says `Unassigned`, a
  role-less one says `No role`, an unestimated one says
  `No estimate for this role`.
- The **not-before caret** keeps its own native `title` — it is the one mark with
  no surface.

---

## C6 — no overpaint at the worst layout

**Setup.** A13's depth-5 tree, plus: a Name on the deepest row of ~120 characters
with a second line of notes under it, six dependencies on one row, and the Name
column dragged to its **600px** ceiling. Open the Gantt.

**Expected.**

- No text overlaps other text anywhere: Number never bleeds into Name, Name never
  bleeds into Depends on, the Gantt's on-bar assignee label never runs past its
  bar or over a neighbour's.
- The sticky/pinned left columns stay opaque over scrolled content — no ghost of a
  scrolled row showing through.
- Horizontal scroll moves the body columns and leaves the pinned ones fixed; the
  header row scrolls in lockstep with the body columns.
- Row heights stay uniform: the 120-char name wraps within its own cell (or is
  clipped by design) without making that row taller than its neighbours, and the
  Gantt row at the same index stays aligned with it.
- Every stroke on the chart is the same visual weight regardless of zoom — the
  non-uniform x-scale must not stretch glyphs or stroke widths.
- Focus ring on a focused cell is fully visible, not clipped by the cell's overflow.

---

# Group D — today's merges (critical-snap #41, priority-column #43, dep-add-button #42)

Same shared setup as §0 — one phase **Dev**, start **2026-09-01**, PERT — plus the
QA removal in the execution notes below. Every date here is derived from the same
workday table in §0.

### Vocabulary → UI, the new parts

| Term here        | Where it is                                                                                                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| priority         | the **Prio** column, between _Depends on_ and _Service/team_, 48px, right-aligned, blank at rest. Cell `aria-label="Priority for <number>"`, `data-priority="<row id>"`, `inputMode="numeric"`. Type a number, **Enter** or **Tab** commits. |
| clear a priority | empty the cell and commit — that sends `priority: null`, not `0`.                                                                                                                                                                            |
| the `+`          | the add button in a **Depends on** cell: `data-dep-add="<row id>"`, `aria-label="Make <number> wait for something"`, glyph `+`, first child of the strip.                                                                                    |

### What priority is, in one paragraph

Priority ranks the **resource leveller's queue** and nothing else. It is the first
key in `goesFirst`, ahead of critical-path start, float, row number and role
order; unset is `+Infinity`, so a set priority always beats an unset one and two
unset rows tie exactly as they did before the column existed. It never decides a
**date**: whichever slice is taken first is still placed at the latest of its own
floors, so it cannot jump a dependency, a _Not bef._ floor or an earlier role on
its own row. A plan with **nobody assigned** has no contention and does not move at
all. And the leveller places every slice once and never backfills — see D4.

---

## D1 — the drifted chain is red on every row (re-verify of A1, PR #41)

**Setup.** A1's rows, verbatim. Four rows at top level, no indent, no assignees.

| #   | Dev estimate | Depends on |
| --- | ------------ | ---------- |
| 010 | `0/8/13`     | —          |
| 020 | `3/4/6`      | 010        |
| 030 | `2/3/6`      | 020        |
| 040 | `15`         | —          |

(`45/6 = 7.5`, `25/6 = 4.166…`, `20/6 = 3.333…`. The chain's finish accumulates to
`15.000000000000002`, not 15. 040 is the same 15 days written flat.)

**Action.** Read Start / End / Slack on all four rows; open the Gantt and hover
each bar.

**Expected.**

| #   | Start          | End            | Slack      |
| --- | -------------- | -------------- | ---------- |
| 010 | Tue 2026-09-01 | Thu 2026-09-10 | `critical` |
| 020 | Thu 2026-09-10 | Wed 2026-09-16 | `critical` |
| 030 | Wed 2026-09-16 | Mon 2026-09-21 | `critical` |
| 040 | Tue 2026-09-01 | Mon 2026-09-21 | `critical` |

- **All four Slack cells read the word `critical`, and all four carry
  `data-critical="true"`.** This is the whole case. Before #41 the column printed
  `0` on 010, 020 and 040 with `data-critical` on **030 alone** — the drifted
  `-1.8e-15` reading as "has slack" while rounding to `0` on screen.
- **No cell in the plan reads `0`, `-0` or `0.0` in the Slack column.** A row that
  prints a zero without the word `critical` beside it is the defect, restated.
- All four Gantt bars carry the critical outline/ring. Hover each: the float line
  reads `On the critical path — no float` on every one of the four — never
  `Float 0 days`.
- The A1 date assertions still hold: 030 ends **Mon 2026-09-21**, never Tue
  2026-09-22; 030's bar right edge equals 040's bar right edge to the pixel; the
  axis' last cell is Mon 2026-09-21 with no empty trailing day cell.

---

## D2 — priority inverts who gets the person first (PR #43)

**Setup.** Two rows, one assignee, **no dependencies**, no floors, no priorities yet.

| #   | Dev estimate | Assignee | Prio      |
| --- | ------------ | -------- | --------- |
| 010 | `3@person-a` | person-a | _(blank)_ |
| 020 | `2@person-a` | person-a | _(blank)_ |

**Expected, step 1 (the baseline, no priorities).**

- 010: Tue 2026-09-01 → Thu 2026-09-03. 020: Fri 2026-09-04 → Mon 2026-09-07.
- 010 goes first because it has **less float** (0 against 1), which is A11's rule.
  Both rows show Slack `critical` — the resource queue is the longest path.
- Both Prio cells are **empty**: no `0`, no `—`, no grey placeholder text.

**Action, step 2.** Type `1` into 020's Prio cell, Enter. Type `2` into 010's, Enter.

**Expected, step 2.**

| #   | Start              | End                |
| --- | ------------------ | ------------------ |
| 020 | **Tue 2026-09-01** | **Wed 2026-09-02** |
| 010 | **Thu 2026-09-03** | **Mon 2026-09-07** |

- The order **inverted**: the row with more float now goes first because it carries
  the smaller priority. Priority is asked before float.
- The bars moved with the dates: 020's bar now starts in the Tue 01 Sep cell (the
  chart's left edge), 010's starts in the Thu 03 Sep cell, and 010's bar left edge
  x is **greater** than 020's. The two bars share no horizontal pixel range.
- 010's bar floor line now reads **`person-a — after <020's name> (Dev)`**; 020's reads
  `Starts with the project`.
- Hover 020's bar: the card contains a line reading exactly **`Priority 1`**, sitting
  between the float/critical line and the floor line. Hover 010's: **`Priority 2`**.
- The `aria-label` of each bar contains the same `Priority N` line as its card.
- Both rows still show Slack `critical` — priority does not touch the
  critical-path pass, so no float and no `critical` marking anywhere in the plan may
  change between step 1 and step 2. **Diff the Slack column across the two steps and
  report any movement as a finding.**

---

## D3 — a priority-1 row still waits for its predecessor

**Setup.**

| #   | Dev estimate | Assignee | Depends on | Prio      |
| --- | ------------ | -------- | ---------- | --------- |
| 010 | `4@person-a` | person-a | —          | _(blank)_ |
| 020 | `2@person-a` | person-a | 010        | **1**     |

020 carries the plan's only priority and 010 carries none, so on the queue rule
alone 020 outranks 010 outright. The dependency is what decides instead.

**Expected.**

- 010: **Tue 2026-09-01 → Fri 2026-09-04** (wd0–wd3).
- 020: **Mon 2026-09-07 → Tue 2026-09-08** (wd4–wd5).
- 020 does **not** start on Tue 2026-09-01. If it does, priority has become a pin
  and the whole "never overrides a constraint" claim is gone — report as P0.
- 020's bar floor line reads **`Waits for a dependency to finish`**, never
  `person-a — after …` and never `Starts with the project`.
- 020's card carries `Priority 1`; 010's card carries no line containing the word
  `Priority` at all.
- Both rows `critical`.

---

## D4 — a priority-1 row with a floor idles its assignee (no backfill)

The consequence `priority-column`'s verify states outright rather than leaving to
be discovered: the leveller places every slice once, in priority order, and never
backfills. Giving the floored row the smallest priority makes the person wait for it.

**Setup.** One assignee, no dependencies.

| #   | Dev estimate | Assignee | Not bef.       | Prio  |
| --- | ------------ | -------- | -------------- | ----- |
| 010 | `2@person-a` | person-a | **2026-09-11** | **1** |
| 020 | `3@person-a` | person-a | —              | **2** |

(2026-09-11 is wd8. Set the date through the _Not bef._ cell — see the date-input
note in the execution notes.)

**Expected, step 1.**

| #   | Start              | End                |
| --- | ------------------ | ------------------ |
| 010 | **Fri 2026-09-11** | **Mon 2026-09-14** |
| 020 | **Tue 2026-09-15** | **Thu 2026-09-17** |

- **Assert the gap.** person-a has **nothing** scheduled from Tue 2026-09-01 to Thu
  2026-09-10 inclusive — wd0 through wd7. Neither bar occupies any part of that
  span, and 020 does **not** slide into it. Read it off the chart as well as the
  table: the leftmost pixel of the leftmost bar sits in the **Fri 11 Sep** cell.
- 020 starting Tue 2026-09-01 means the leveller backfilled — that would contradict
  `still waits for its own floor`, so report it as a finding even though an
  eight-day gap looks like the bug.
- 010's bar floor line: **`Held by its start-no-earlier-than date`**.
  020's: **`person-a — after <010's name> (Dev)`**.
- Cards: `Priority 1` on 010, `Priority 2` on 020.

**Action, step 2.** Swap the two priorities — 010 becomes `2`, 020 becomes `1`.

**Expected, step 2.**

- 020: **Tue 2026-09-01 → Thu 2026-09-03** (wd0–wd2).
- 010: **Fri 2026-09-11 → Mon 2026-09-14** — unchanged, because its floor, not the
  queue, is what puts it there.
- The project now finishes on Mon 2026-09-14 instead of Thu 2026-09-17. The eight
  idle days in step 1 are the price of the priority, and step 2 is the proof that
  they were the priority's doing and not the floor's.

---

## D5 — a parent's priority reaches its leaves, and a leaf's own beats it both ways

**Setup.** One assignee throughout. Build with Ctrl+N and Alt+→; re-read the
numbers after each indent.

```
010                       Prio 1        (parent, no estimate of its own)
  010.1   Dev 2@person-a       Prio (blank)
  010.2   Dev 2@person-a       Prio 5
020       Dev 2@person-a       Prio 3
030                       Prio 4        (parent, no estimate of its own)
  030.1   Dev 2@person-a       Prio 2
```

Four leaves, two days each, all person-a's, nothing depending on anything. The effective
priorities are: 010.1 → **1** (inherited), 010.2 → **5** (its own, larger than its
parent's), 020 → **3**, 030.1 → **2** (its own, smaller than its parent's).

**Expected.**

| #     | Start              | End                |
| ----- | ------------------ | ------------------ |
| 010.1 | **Tue 2026-09-01** | **Wed 2026-09-02** |
| 030.1 | **Thu 2026-09-03** | **Fri 2026-09-04** |
| 020   | **Mon 2026-09-07** | **Tue 2026-09-08** |
| 010.2 | **Wed 2026-09-09** | **Thu 2026-09-10** |

- **010.1 first** proves a parent's priority reaches a leaf that has none. If it
  ran last, inheritance is not happening at all — the leaf would be unset, and
  unset is `+Infinity`.
- **010.2 last** is the discriminating assertion. Its parent says 1 and it says 5;
  most-specific wins, so it is a 5 and goes behind the 3. If the floor rule
  (`Math.max`/`Math.min` over everything that applies) had been copied here, 010.2
  would take the 1 and start first or second. **Report 010.2 starting before 020 as
  a P1.**
- **030.1 second** is the same rule in the other direction: 2 beats its parent's 4.
- The parent rows 010 and 030 show `1` and `4` in their own Prio cells, and draw no
  bar of their own beyond the roll-up.
- Hover each leaf's bar: `Priority 5` appears on 010.2 and `Priority 2` on 030.1.
  **010.1's card carries no `Priority` line** — the card states the priority of the
  work item the bar belongs to, and 010.1 carries none of its own. Report what it
  actually says; either answer is defensible from the spec text, and this is the
  one place the two readings diverge visibly.

---

## D6 — the nearer ancestor wins

**Setup.** One assignee, no dependencies.

```
010                          Prio 1        (grandparent)
  010.1                      Prio 6        (parent)
    010.1.1   Dev 2@person-a      Prio (blank)
020           Dev 2@person-a      Prio 3
```

Two leaves. 010.1.1's effective priority is its **parent's 6**, not its
grandparent's 1.

**Expected.**

- 020: **Tue 2026-09-01 → Wed 2026-09-02**.
- 010.1.1: **Thu 2026-09-03 → Fri 2026-09-04**.
- 010.1.1 running **first** means the further ancestor won and the rule is
  inverted — a P1.
- Both rows `critical` (one queue, one person).

---

## D7 — unset loses, clearing restores, and what the box refuses

**Setup.** The same two rows as D2, priorities blank to start.

| #   | Dev estimate | Assignee |
| --- | ------------ | -------- |
| 010 | `3@person-a` | person-a |
| 020 | `2@person-a` | person-a |

**Step 1 — record the baseline.** 010 Tue 2026-09-01 → Thu 2026-09-03; 020
Fri 2026-09-04 → Mon 2026-09-07. Write down all four dates; steps 3 and 5 are
compared against them character for character.

**Step 2 — a set priority beats an unset one, however large.** Type `9` into 020's
Prio cell, leave 010 blank.

- 020: **Tue 2026-09-01 → Wed 2026-09-02**; 010: **Thu 2026-09-03 → Mon 2026-09-07**.
- 9 beats nothing. Unset is a state, not a big number — if the engine read unset as
  `0` the plan would not move here.

**Step 3 — clearing restores the original order.** Select 020's Prio cell, delete
its contents, commit with Enter.

- The cell is **blank**, not `0`.
- The dates return to **exactly** the step-1 baseline: 010 Tue 2026-09-01 →
  Thu 2026-09-03, 020 Fri 2026-09-04 → Mon 2026-09-07.
- No `Priority` line on either bar's hover card.
- An emptied cell that lands the row as a priority-`0` — first in the queue, ahead
  of everything — is the `Number('') === 0` trap and is a P0.

**Step 4 — the write path refuses.** With the plan in its step-3 state, type each
of these into **010's** Prio cell and commit. After every one, re-read both rows'
dates and 010's stored value.

| typed    | expected                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `1e999`  | **Refused in the browser.** An error toast reading exactly `A priority is a whole number from 1 upward.` **No request is sent** — check the network panel if the harness has one. The cell keeps the draft `1e999` rather than committing; the stored priority stays blank and no date moves. It must **not** clear the priority: `Number('1e999')` is `Infinity`, `JSON.stringify` writes it as `null`, and `null` is the clear request. |
| `urgent` | The same toast, the same silence on the wire, the same unchanged plan.                                                                                                                                                                                                                                                                                                                                                                    |
| `0`      | The request **is** sent and be-01 answers **400**. An error is surfaced, the draft stays in the box the way every refused edit does, the stored priority is unchanged and no date moves. Record the exact error text.                                                                                                                                                                                                                     |
| `-1`     | As `0`.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `1.5`    | As `0`.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `2`      | Accepted. 010's cell reads `2`.                                                                                                                                                                                                                                                                                                                                                                                                           |

- The distinction matters and is worth reporting separately: `1e999` and `urgent`
  are refused **by the browser with no request**; `0`, `-1` and `1.5` are refused
  **by be-01 with a 400**. A run where `1e999` produced a network request, or where
  any of the five silently blanked the cell, is a finding.
- Clear 010 again before step 5.

**Step 5 — equal priorities fall back to float.** Type `4` into both rows' Prio cells.

- The dates return to the step-1 baseline exactly: 010 first, because with the
  priorities tied the old rule — critical-path start, then least float — decides
  alone.

---

## D8 — three people, a diamond, and a queue priority reorders

**Setup.** Three assignees, six rows.

| #   | Dev estimate | Assignee | Depends on | Prio      |
| --- | ------------ | -------- | ---------- | --------- |
| 010 | `2@person-a` | person-a | —          | **3**     |
| 020 | `2@person-a` | person-a | —          | **1**     |
| 030 | `2@person-a` | person-a | —          | **2**     |
| 040 | `4@person-b` | person-b | 020        | _(blank)_ |
| 050 | `3@person-c` | person-c | 010        | _(blank)_ |
| 060 | `1@person-a` | person-a | 040, 050   | **1**     |

**Expected.**

| #   | Start              | End                | Slack      |
| --- | ------------------ | ------------------ | ---------- |
| 020 | **Tue 2026-09-01** | **Wed 2026-09-02** | `critical` |
| 030 | **Thu 2026-09-03** | **Fri 2026-09-04** | `critical` |
| 010 | **Mon 2026-09-07** | **Tue 2026-09-08** | `critical` |
| 040 | **Thu 2026-09-03** | **Tue 2026-09-08** | `3`        |
| 050 | **Wed 2026-09-09** | **Fri 2026-09-11** | `critical` |
| 060 | **Mon 2026-09-14** | **Mon 2026-09-14** | `critical` |

- **person-a's queue is 020 → 030 → 010**, which is priority order and neither of the two
  orders that could be mistaken for it: row order is 010, 020, 030, and float order
  is 020 (float 0), 010 (float 1), 030 (float 5). **030 sitting second is the
  assertion this case exists for.**
- **060 carries priority 1 and still starts last**, on Mon 2026-09-14, because both
  its predecessors have to land first — 040 finishes Tue 08 Sep and 050 finishes
  Fri 11 Sep. Its floor line reads **`Waits for a dependency to finish`**, and the
  `after` line names 050. A 060 that starts before 050 finishes is priority
  defying a dependency in a plan complex enough to hide it.
- 040 is the only row with slack: `3`, not `critical`, no `data-critical`.
- The two dependency arrows converge on 060's left edge without crossing a bar they
  do not connect (A10's rule, restated on a levelled plan).
- Cards: `Priority 3`, `Priority 1`, `Priority 2` on 010/020/030, `Priority 1` on
  060, and **no** `Priority` line on 040 or 050.

---

## D9 — priority in both exports

**Setup.** Three rows, no deps, no assignees needed.

| #   | Dev estimate | Prio      |
| --- | ------------ | --------- |
| 010 | `2`          | **2**     |
| 020 | `3`          | **10**    |
| 030 | `1`          | _(blank)_ |

**Action, Markdown.** Click **Copy as Markdown**. Click into the **Find** box
(`aria-label="Find"`) and press Ctrl+V. Read the box's `value`. Clear the box
afterwards — a paste of a whole plan into the find box will narrow the tree, and
leaving it there will confuse every later case.

**Expected, Markdown.**

- The header row carries a **`Priority`** column, positioned **between
  `Depends on` and `Not before`**.
- 010's Priority cell is `2`; 020's is `10`; **030's is empty** — whitespace between
  two pipes, and specifically not `0`, not `null`, not `undefined` and not `—`.
- `10` prints as `10`, not `1` and not `10.0`.

**Action, CSV.** Click **Download CSV** and read the file (the harness's download
view, or `file://` if it can reach one). If the harness cannot read a downloaded
file at all, say so and report the Markdown half alone rather than guessing.

**Expected, CSV.**

- Header: `…,Depends on,Priority,Not before,Starts,Ends,Slack,Notes`.
- 030's Priority field is **empty** — two adjacent commas, no quoted empty string
  containing `undefined`.
- The values `2` and `10` sit under the `Priority` header, not off by one column.

---

## D10 — the `+` in the Depends on cell (PR #42)

**Skip this case if dev is not serving `change/dep-add-button`** — check first and
say so rather than filing seven bugs. Every measurement here is a
`getBoundingClientRect()` or a `getComputedStyle()` reading, not an eyeball.

**Setup.** Nine rows at `1` day each, 010 through 090. Put **seven** dependencies on
020 (`010, 030, 040, 050, 060, 070, 080`). Leave **030's** Depends on cell empty.
Viewport 1440×900.

**Step 1 — at rest, on both kinds of cell.**

- 030's empty cell shows a **`+`**: `aria-label="Make 030 wait for something"`,
  `data-dep-add` present, glyph `+`.
- 020's seven-chip cell shows the same `+`, and it is the **first** child of the
  strip — before every chip. `strip.firstElementChild` is the button.
- **It is there without a hover and without a focus.** Move the pointer off the row
  entirely and confirm it is still painted (opacity 1, not the `⋯` button's
  fade-in). This is the requirement, not a paraphrase of one.
- **It carries no `title`.** `getAttribute('title')` is `null` on both. A tooltip
  is a second name.
- `tabIndex` is **-1** on both.
- Row height is 28px on both, the same as a row whose Depends on cell is empty and
  has no button — the `+` costs the row nothing at rest.
- On 020's clipped cell: the `+` answers `document.elementFromPoint()` at its own
  centre; the **last** chip does not (it is behind the 14px edge fade). The `+` is
  at the head of the line, which is the one place a clipping `nowrap` line never cuts.

**Step 2 — an empty cell is no taller open than shut.** Measure 030's row height
and its box's `y` at rest. Click the `+`. Measure again.

- **Row height is identical** to its rested height. The reference numbers from the
  fix's own cloud session: 26px at rest and 26px open on the deps cell (44.98px
  open was the defect), the box's `y` unmoved at 198, the listbox at 219 rather
  than 240.98. Assert **equality against your own rested measurement**, not against
  those literals.
- The box is on the **`+`'s own line**, not under it: `box.y` equals the `+`'s `y`
  within a pixel, and the box's width is its rested width (~84px), not the full
  strip (~102px).
- The **`+` is still visible** with the picker open — it is not hidden to buy the
  height back.
- Clicking the **cell** and clicking the **`+`** measure identically. Do both.

**Step 3 — the crowded cell still wraps.** Click into 020's seven-chip cell.

- It **grows** — chips reflow onto as many lines as they need (~118.94px in the
  reference session). That is `deps-single-line`'s open state and is unchanged here.
  A 020 cell that stayed one line would be a regression in the other direction.

**Step 4 — end to end.** On 030's empty cell, click the `+`.

- The cell's own box holds the focus (`document.activeElement` is
  `[data-depends-input]` for 030) and the picker is **open** (`aria-expanded="true"`
  on the box). There is no second listbox: one path to the box, not a second path
  into the picker.
- Type `09`, pick 090. A chip `090 ✕` appears in 030's cell, and 030's Start moves
  to the day after 090 finishes. The dates are the proof the dependency was really
  written, not just drawn.

**Step 5 — a half-typed search survives the press.** Click into 030's box, type
`04`, then click the `+`.

- The box still holds the focus, still reads **`04`**, and the picker is still open
  on the same filtered list. A box that came back empty with a fresh open picker is
  the blur-eats-the-search fault, and is a P1.

**Step 6 — the hover moves the right way in both palettes.** Hover row 030, then
hover the `+` on it. Read `getComputedStyle` `backgroundColor` on the row and on
the `+`. Repeat in the dark palette.

- **Light:** the `+` is **darker** than the row it sits on. Reference from the fix's
  own session: `+` `oklab(0.882328 …)` against a hovered row `oklab(0.93903 …)`.
  A `+` **lighter** than its row — the pre-fix `oklch(0.968 …)` — reads as a hole
  punched through the row to the page behind it, and is the finding.
- **Dark:** the `+` is **lighter** than the row. Reference: `oklab(0.24451 …)`
  against `oklab(0.18885 …)`.
- Report both palettes' four numbers. **Direction against the row is the claim** —
  light alone cannot tell "darker than the row" from "an absolute colour that
  happens to be darker here".
- The `+` never goes `--destructive` red on hover. Red is the chips' ✕ saying what
  a click will remove; an "add" that turned red would be promising a removal.

**Step 7 — the keyboard walks past it.** Tab through 030's row, at rest and with
the picker open.

- Tab into the Depends on cell lands on the **box**, never on the `+`, in both
  states — where the chips' ✕ buttons flip between the two.
- The `+` is still a `<button>` with an accessible name, so an element walk finds
  it and can activate it. Activate it by keyboard (Enter on a programmatic focus)
  and confirm the picker opens — the click path works with no `mousedown` at all.

---

## D11 — the two regressions #41 and #43 promised

**Part 1 — A9's pin is now the flipped answer.** Rebuild A9 exactly.

| #   | Dev estimate | Not bef.       |
| --- | ------------ | -------------- |
| 010 | `3`          | —              |
| 020 | `1/4/6`      | **2026-09-18** |

(`23/6 = 3.833…`; the floor at wd13 stands 020 past everything else, so 020 **is**
the project finish.)

**Expected — the opposite of what A9 says, and A9 is now stale.**

- 010: Tue 2026-09-01 → Thu 2026-09-03. 020: **Fri 2026-09-18 → Wed 2026-09-23**.
- **020's Slack reads the word `critical`, with `data-critical="true"`.** Before #41
  the backward pass' `(13 + 23/6) − 23/6 ≠ 13` gave about `−1.8e-15`, which printed
  as `0` with no marking. `critical-snap`'s second scenario promises exactly this
  flip: _"its float is 0 and it is marked critical, where the raw subtraction gave
  about -1.8e-15 and no marking."_
- The cell must **never** read `-0`. The `-0` normalisation is a separate line of
  the fix with its own failure proof.
- 020's bar carries the critical ring, and its card's float line reads
  `On the critical path — no float`.
- 020's floor line still reads `Held by its start-no-earlier-than date`.
- 010's Slack is a positive number, `13.8` (`16.8333 − 3 = 13.8333`, rounded to a
  tenth), not `critical`.
- **A9 in this document now states the pre-fix answer and is wrong against this
  build.** Note that in the report; do not file it twice.

**Part 2 — a plan with no priorities schedules as it did before the column
existed.** Rebuild A10 step 1, with every Prio cell left blank.

| #   | Dev estimate | Depends on |
| --- | ------------ | ---------- |
| 010 | `4`          | —          |
| 020 | `3`          | 010        |
| 030 | `6`          | 010        |
| 040 | `2`          | 020, 030   |

**Expected — character for character A10's table.**

| #   | Start          | End            | Slack      |
| --- | -------------- | -------------- | ---------- |
| 010 | Tue 2026-09-01 | Fri 2026-09-04 | `critical` |
| 020 | Mon 2026-09-07 | Wed 2026-09-09 | `3`        |
| 030 | Mon 2026-09-07 | Mon 2026-09-14 | `critical` |
| 040 | Tue 2026-09-15 | Wed 2026-09-16 | `critical` |

- Every Prio cell is empty. Any date differing from A10's is #43 having moved a
  plan that sets no priorities — the one thing it promised it would never do.

---

## D12 — priority moves nothing when nobody is assigned

**Setup.** Two rows, **no assignees anywhere**, no deps, no floors.

| #   | Dev estimate | Assignee   |
| --- | ------------ | ---------- |
| 010 | `3`          | _(nobody)_ |
| 020 | `2`          | _(nobody)_ |

**Expected, step 1.** Both start **Tue 2026-09-01**. 010 ends Thu 2026-09-03,
020 ends Wed 2026-09-02.

**Action, step 2.** Set 010's Prio to `9` and 020's to `1`.

**Expected, step 2.** **Nothing moves.** All four dates identical to step 1, both
bars in the same pixels. With nobody assigned there is no contention, so there is
no queue for a priority to reorder. A plan that moved here has a priority acting as
a date, which is the failure mode the whole requirement is written against.

- The cards do now carry `Priority 9` and `Priority 1` — the number is stored and
  displayed, it simply decides nothing.

---

## D13 — undo and redo a priority

**Setup.** D2's two rows in their step-1 baseline (010 `3@person-a`, 020 `2@person-a`, both
Prio blank, 010 first).

1. Type `1` into 020's Prio, Enter. The order inverts (020 Tue 2026-09-01).
2. **Ctrl/⌘+Z** → 020's Prio is **blank** again and the dates return to the
   baseline (010 Tue 2026-09-01 → Thu 2026-09-03, 020 Fri 2026-09-04 →
   Mon 2026-09-07).
3. **Ctrl/⌘+Shift+Z** → `1` is back and the order inverts again.
4. Replace the `1` with `5`, Enter. Then **Ctrl/⌘+Z** → the cell reads **`1`**, not
   blank. An undo that takes a _replaced_ priority back to empty rather than to its
   previous value is a finding — the two directions are separate lines in the undo
   record and each has its own failure proof.
5. The undo toast names the change in words, as every other undone edit does.

---

## D14 — the Prio column's own layout and keyboard

**Setup.** Any plan with three or four rows, one phase **Dev**, folded. Viewport
1280 wide. No row with a _Not bef._ date set (that column is at its narrow 56px,
which is the state the width budget was measured in).

**Expected.**

- The header cell reads exactly **`Prio`** — not `Priority`, not `PRIORITY` — on
  **one line**, in the 10px all-caps header row. The full word wraps to two lines
  and takes the whole header row with it; that is why it is abbreviated.
- The column is **48px** wide and sits **between `Depends on` and `Service/team`**.
- The header's `title` reads: `How important this work is: 1 upward, smaller first.
It decides who gets a shared person first — never who skips their dependencies.`
- A blank cell's `title`: `How important this work is: 1 upward, smaller first.
Blank means nobody has said.` A cell holding 2: `Priority 2. Smaller is more
important; it decides who gets a shared person first.`
- The cell input has `inputMode="numeric"` and **no spinner arrows** (it is not
  `type="number"` — spinners would not fit 48px, and a number input swallows the
  arrow keys the grid navigates with). Text is **right-aligned**.
- **The grid keyboard works from the Prio cell**: ↑/↓/←/→ and Ctrl+H/J/K/L move
  between cells, Tab from the Depends on box lands on Prio and the next Tab reaches
  Service/team, Alt+↑/↓ moves the row, Ctrl+N makes a new row.
- **No horizontal scrollbar** at 1280px with **one or two** phases folded.
  **Three** folded phases scroll, as they already did. Report the measured
  `scrollWidth`/`clientWidth` for all three.

  **Read `min-width`, never `width`.** The `<table>` carries both, and they are
  220px apart: `width: min(100%, N)` is the sum with Name at its 420px **cap** —
  where the table stops growing — and `min-width` is the sum with Name at its
  200px **floor**, which is the only one that decides whether anything scrolls.
  Reading the first as the second is what produced the 2026-08-14 run's P2, and
  it is not a defect: watched in Chromium at 1280×800 on 2026-08-14 (PR #62's
  `holds the folded budget at 1280, and says where it stops`), on a plan no row
  of which sets an earliest start:

  | folded phases | `min-width` | `width`             | frame client | frame scroll | scrolls? |
  | ------------- | ----------- | ------------------- | ------------ | ------------ | -------- |
  | one           | **1123px**  | `min(100%, 1343px)` | 1248         | 1248         | no       |
  | two           | **1219px**  | `min(100%, 1439px)` | 1248         | 1248         | no       |
  | three         | **1315px**  | `min(100%, 1535px)` | 1248         | 1315         | **yes**  |

  The frame is 1248 and not 1280 because the page has 16px of padding either
  side. **1219px is the two-phase figure** (the errata already said so) and it is
  unchanged since this case was written; the folded table has **29px of slack**
  at 1280 — measured, by watching a 32px column widening blow it and a 16px one
  not. With a row dated, `not-before` goes 56 → 84 and every figure above rises
  28px, which is the 1247-against-1248 the earlier wording was about.

- The pinned left columns hold the left edge when it does scroll.
- Type a four-digit priority (`9999`) into a cell: it fits inside the 48px without
  clipping the last digit and without widening the column.

---

## D15 — a sixth of a day of real slack survives the snap

The negative half of #41: the 1e-9 window must not eat the smallest fraction a PERT
final can carry. A widened window is caught here and nowhere else.

**Setup.** A diamond, no assignees.

| #   | Dev estimate | Depends on |
| --- | ------------ | ---------- |
| 010 | `1`          | —          |
| 020 | `3`          | 010        |
| 030 | `1/3/4`      | 010        |
| 040 | `1`          | 020, 030   |

(`1/3/4` is `(1 + 12 + 4)/6 = 17/6 = 2.8333…`. Beside 020's flat 3, that leaves 030
exactly **one sixth of a day** of room — eight orders of magnitude above the window.)

**Expected.**

| #   | Start          | End            | Slack      |
| --- | -------------- | -------------- | ---------- |
| 010 | Tue 2026-09-01 | Tue 2026-09-01 | `critical` |
| 020 | Wed 2026-09-02 | Fri 2026-09-04 | `critical` |
| 030 | Wed 2026-09-02 | Fri 2026-09-04 | **`0.2`**  |
| 040 | Mon 2026-09-07 | Mon 2026-09-07 | `critical` |

- **030's Slack must read `0.2` and must NOT say `critical`**, and it must carry no
  `data-critical="true"`. `1/6 = 0.1666…`, and the column rounds to a tenth. A `0`
  or a `critical` here is the window swallowing real slack — the exact failure the
  proposal's constraint section is written against, and a P0 for #41.
- 020 and 030 end on the **same calendar day** despite 030 being the shorter of the
  two — the sixth of a day does not reach the next workday boundary. That is
  correct and is not the finding.
- 030's bar carries **no** critical ring and its card's float line reads
  `Float 0.2 days` (report the exact wording), never `On the critical path`.

---

# Execution notes

**Target.** An authorized disposable test instance. Obtain access through its
current approved process before starting; do not guess credentials. The original
plan assumed HTTP basic authentication, which is a historical environment detail.

**Which build.** Confirm before running Group B: the dev instance must be serving
a branch that has PRs **#37, #38 and #39** in it. If dev is on plain `main`
(`e3eae84`), all ten Group B cases will fail for the trivial reason that the
features are not deployed — check first and say so rather than filing ten bugs.
Group A and Group C are valid against `main` as well, except A1/A2's snap
assertions in the Gantt, which are PR #39's.

**Scratch projects.** Create a **fresh project per group** — three in total:

- `ui probe 11 Aug — A scheduling`
- `ui probe 11 Aug — B recent PRs`
- `ui probe 11 Aug — C polish`

Inside a group, clear the rows between cases (or add a fresh block of rows below
and work in it) rather than making a project per case. Every project needs the
shared setup in §0: one phase named **Dev**, start date **2026-09-01**, PERT.

**Do not touch** any project not carrying the `ui probe 11 Aug` prefix.

**Reporting.** Per case: id, pass/fail, and on fail the **observed** value beside
the expected one — exact dates, exact pixel numbers from
`getBoundingClientRect()`, exact cell text. A screenshot for anything visual.
Where a case says "report as a finding", do that even if the case otherwise
passes. Measured pixel assertions (A4, B1, B9, B10) must be measured, not
eyeballed.

**Known-pinned, not a bug:** A9's `0` Slack on the project's own last row. Report
the observed text, flag it as matching the pinned behaviour, and move on.
**Superseded by D11 on any build carrying PR #41** — there, `critical` is the
correct answer and a `0` is the finding. Check which build dev is on before
deciding which of the two applies.

---

## Group D — execution notes

**Which build.** Group D needs `origin/main` @ `01a6bed` or later — PRs **#41**
(`critical-snap`) and **#43** (`priority-column`) merged. **D10 additionally needs
PR #42** (`dep-add-button`, head `b1fe412`), which was still open when this was
written. Check the deployed commit first:

- No Prio column in the table → #43 is not deployed. **D2–D9 and D12–D14 are all
  invalid**; say so once rather than filing twelve bugs.
- No `+` in the Depends on cells → #42 is not deployed. **Skip D10**, run the rest.
- D1, D11 part 1 and D15 are #41's. If D1 shows `0` without `critical`, #41 is not
  deployed — do not run D11 part 1 against that build, it will contradict itself.

**Scratch project.** One fresh project for the whole group:

- `ui probe 11 Aug D`

Do not reuse the A/B/C projects — several Group D cases assert that a plan with no
priorities is unchanged, and a stray priority left on a row from an earlier case
would quietly invalidate them.

**Remove the QA phase immediately after creating the project.** A new project
ships with **two** phases, **Dev** and **QA**, not the one §0 assumes. Leave QA in
place and every row carries an unestimated QA slice, which the chart draws as a
2-day hatched "ghost" bar beside the real one — bars that overlap nothing, rows
that appear to run longer than their estimate, and hover cards reading
`No estimate for this role`. It cost a full re-run last time. Open **Phases**,
delete **QA**, keep **Dev**, close the dialog, and confirm there is exactly one
estimate column before typing anything.

**Date inputs (D4, D11).** The _Not bef._ cell is a native date input and **will not
take typed text on a plain focus**. Click **directly into the month segment** first
— the leftmost segment of the field, a real pointer click at its own coordinates,
not a Tab into the cell and not a click on the cell's padding — then type the digits
in the field's own order. Read the committed value back off the cell before relying
on it; a half-entered date silently commits as nothing and the row will schedule
from the project start, which looks exactly like a broken floor.

**Clear the plan between cases** (or add a fresh block of rows below and work in
it). Where a case gives priorities, clear them before the next case — an unset Prio
cell must be **blank**, not `0`.

**Reset the Find box** after D9's paste. A plan pasted into it narrows the tree and
will make every later case look like it lost its rows.

**Reporting, Group D specifics.**

- Every colour claim in D10 step 6 is **two** `getComputedStyle` reads — the `+`
  **and** the row under it — in **both** palettes. Four numbers, or the case is not
  run. Direction against the row is the assertion; an absolute value proves nothing.
- Every height claim in D10 step 2 is the **same element** measured at rest and
  open. Compare against your own rested number, not against the literals quoted
  from the fix's session.
- Where a case says report a finding even on a pass (D1's zero-without-`critical`
  sweep, D5's 010.1 hover card, D7's refusal split, D9's CSV readability), do that.
- Exact cell text for every Slack assertion — `critical`, `0`, `-0`, `0.2` and
  `13.8` are five different answers and four of them are bugs somewhere in this
  group.
