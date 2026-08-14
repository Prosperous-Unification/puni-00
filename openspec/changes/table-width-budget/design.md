# design — `table-width-budget`

Three findings came in from the 2026-08-14 cloud regression. One of them is not
a defect, one of them is a defect the report understated, and one of them is a
defect the report overstated. Every number below was measured in Chromium at
1280×800 on h2puni on 2026-08-14, in the official Playwright image, against the
three-app stack at `main` @ `203a85b`. None of it was reasoned.

## D1 — the P2 does not exist, and the number it quotes is the other one

The report's headline: _"the table's declared min-width is now **1343px** with
one folded phase (1439 with two, 1535 with three) against D14's recorded
1219px, so a 1280px window no longer fits a single folded phase."_

`tableWidthStyle` puts **two** numbers on the `<table>`:

```ts
width: `min(100%, ${layout.maxWidth}px)`,
minWidth: layout.minWidth,
```

`maxWidth` is every declared column plus `FLEXIBLE_CAP` (420) — where the table
**stops growing**. `minWidth` is the same columns plus `FLEXIBLE_FLOOR` (200) —
where the frame **starts scrolling**. They differ by 220px, the name column's
whole range, and 1343 / 1439 / 1535 are the first of them.

Watched, one folded phase at a time, in a 1280×800 window:

| folded phases | `style.min-width` | `style.width`       | table laid out | frame client | frame scroll | scrolls?     |
| ------------- | ----------------- | ------------------- | -------------- | ------------ | ------------ | ------------ |
| one           | **1123px**        | `min(100%, 1343px)` | 1248           | 1248         | 1248         | no           |
| two           | **1219px**        | `min(100%, 1439px)` | 1248           | 1248         | 1248         | no           |
| three         | **1315px**        | `min(100%, 1535px)` | 1315           | 1248         | 1315         | **sideways** |

D14's recorded **1219px is exact and unchanged**, and it is the **two**-phase
figure — which the workspace suite's own errata already said. One folded phase
is 1123px against a 1248px frame: **125px of room**, not 63px short. The
`∥` column #57 added is 32px of the 827px of fixed columns, and it was spent out
of the 40px the two date columns gave back in the same change (`DATE_COLUMN_WIDTH`
114 → 98). The budget was never crossed.

The frame is 1248 and not 1280 because the page has 16px of padding either side.
That is also why the two-phase table lays out at 1248 rather than at 1219: above
its minimum the table takes the frame and the name column absorbs the difference,
which is the requirement doing exactly what it says.

**So no column moves in this change.** Every figure above is the figure at
`main`, and it is the figure after it.

### What was actually missing, and is the change

Nothing had ever watched the boundary. `layout.spec.ts`'s `fits every laptop
width with the roles folded` measures **two** folded phases at 1280 and 1512 —
green, and it has been for weeks. `phases.spec.ts`'s `a third phase gives the
table a third set of columns` reads `min-width: 1315px` off the markup at the
config's default **1400px** viewport, where 1315 fits and nothing scrolls. So
the one reading D14 asks for by name — _"report the measured
`scrollWidth`/`clientWidth` for all three"_ — existed nowhere, and the two
declarations had never been asserted as the two different things they are.

That gap is exactly the shape of the day this cost: a `width` was read as a
`min-width` because no test had ever named the difference out loud. The new test
does, at the viewport the budget is stated at, for one, two and three phases, and
it asserts the boundary falls **between two and three** rather than that any one
of them fits.

## D2 — the Depends on hover: what the report got right and what it got wrong

Report: _"With two chips at the default 110px `Depends on` width, the dep input
is laid out entirely outside its own `td`: `elementFromPoint` returns the
Priority input instead. Manual case B4's hover affordance is unreachable until
the column is widened."_

The geometry is right, to the pixel. Measured, a row waiting for two others at
the resolved 110px width:

| box                              | left   | right  |
| -------------------------------- | ------ | ------ |
| `<td data-column="depends">`     | 362    | 472    |
| the wrapper `<span>` / the strip | 366    | 468    |
| the `+` add button               | 366    | 381.80 |
| first pill                       | 383.80 | 429.75 |
| second pill                      | 431.75 | 477.70 |
| `[data-depends-input]`           | 479.70 | 487.70 |

The box is **7.7px outside its own cell** and 8px wide; the second pill is
already clipped at the strip's 468. `elementFromPoint` down the cell's midline
returns `TD` at the left edge, the first pill at 25% and at the middle, the
second pill at 75%, and `TD` again at the right edge.

**The conclusion is what the report overstated.** The affordance is not
unreachable — it is reachable on 17.8px of a 110px cell. Measured by moving a
real pointer and reading `[data-dep-lit]` off the `<tr>`s:

| pointer at              | rows lit                     |
| ----------------------- | ---------------------------- |
| the cell's midpoint     | `010` — one pill             |
| `td.left + 4` (the `+`) | `010`, `020` — the whole set |
| `td.right - 4`          | none                         |

So the cell-level reading _is_ produced, by resting on the **add button** — a
control whose job is "start waiting for something else" — and by nothing else.
The cell's own 4px of padding on each side answers nothing at all, because the
handlers live on a wrapper `<span>` that stands inside the padding box.

**The fix is where the handler lives, not how wide the column is.** The
requirement says "while the pointer rests on that cell"; the implementation says
"while the pointer rests on a span inside that cell". Moving the enter and the
leave onto the `<td>` makes the whole cell answer the whole-cell gesture, at
every column width, and costs nothing: `mouseenter` fires down the entered
ancestor chain, so entering the cell over a pill still lands on the cell first
and the pill second, and the pill still wins — which is the behaviour four
existing tests pin.

### What it does not fix, and why not

At 110px with two pills, the pills still cover 92 of the 110px. After this
change the reader has the 8px of padding, the 15.8px `+`, the 2px gaps and —
this is the part that matters — **every entry into the cell**, from Name on the
left or from Prio on the right. What they still do not have is the empty input
area B4's words name, because at this width there is no empty input area to
have.

Two ways to give them one, both rejected here and both stated so they are a
decision rather than an omission:

- **Widen the column.** Two pills, both gaps, the `+` and a usable box measure
  ≈144px including padding — **+34px**. Two folded phases go 1219 → **1253**
  against a 1248px frame, so the 1280 laptop starts scrolling. The budget that
  D1 just proved intact is exactly what this would spend. Refused.
- **Let the pills shrink so the box keeps a floor.** The box is last on the
  strip, so it is the first thing the strip's `overflow: hidden` cuts; reserving
  room for it means giving the pills `min-width: 0` and letting each one clip
  individually rather than clipping the line at its edge. That changes how every
  crowded dependency cell reads, and `deps-single-line` chose the line-edge clip
  and its fade deliberately. A product call, and Dany's.

## D3 — `mouseenter` on a `<td>`, and why the pill still wins

The one thing this change could break is the pill's narrower reading, so it is
worth writing down why it cannot. `mouseenter` does not bubble, but the browser
fires it on **every** element being entered, outermost first: `<tr>`, `<td>`,
wrapper, pill. React's synthetic `onMouseEnter` reproduces that order. So a
pointer arriving straight onto a pill runs the cell's handler (`pillId: null`,
the whole set) and then the pill's (`pillId: <id>`, one row), and the pill's
write is the last one to land — which is what `depLit` reads.

Leaving a pill for the cell's padding fires the pill's `mouseleave`, whose
handler already widens back to `{ pillId: null }` ("a leave means the pointer is
still in the cell"), and the `<td>`'s own leave does not fire, because the
pointer never left the `<td>`. Both halves are unchanged by the move; what
changes is that the second one is now true of the padding as well.

## D4 — the depth-5 Number cell: worse than reported, and not fixed here

Report, as a P3: _"At depth 5, `010.1.1.1.1`'s content box ends at 135.06px
against a 93px column ending at 133 — clipped by `overflow:hidden`, still
legible, nothing painted over Name, but one more level cuts it."_

Reproduced to the digit: content right **135.0625** against a cell right of
**133**, `scrollWidth` **99** against `clientWidth` **93**. Depth 4 fits with
7.13px to spare (125.875).

The overflow itself is the column's **recorded bargain** and not a defect.
`NUMBER_ENVELOPE` is two levels; `e2e/layout.spec.ts`'s `clips a number past the
envelope and keeps it whole in the title` already asserts the clip at three, and
`two rows a level apart read as two different numbers at depth 4` already says in
so many words that "`030.1.1.1.1` loses its last glyph to the clip and carries it
in the `title`, which is the column's bargain and a named non-goal". A13's suite
wording — "holds `010.1.1.1.1` inside its 93px envelope" — is the stale half.

**But measuring what the cell actually draws found something the report did
not.** Reading the visible prefix character by character through a `Range`, the
way `visibleNumberIn` does:

| row             | drawn        |
| --------------- | ------------ |
| `010.1.1.1`     | `010.1.1.1`  |
| `010.1.1.1.1`   | `010.1.1.1.` |
| `010.1.1.1.1.1` | `010.1.1.1.` |

**A row and its child read as the same number on screen** — which is precisely
the fault the 2026-08-12 UI audit reported at depth 4 and `table-mechanics`
fixed, one level along. It also means the depth-4 test's guarantee is bought by a
single `.`: `010.1.1.1` and `010.1.1.1.` differ by one period, and the assertion
"the deeper row shows more of its own number" is satisfied by that period.

Nothing here fixes it, for one reason: **every fix that actually holds changes
how a work item number reads**, and that is not this change's to decide.

- **Widening the column** buys one level and moves the break to 6/7. Depth 6
  needs `93 + 12 = 105px`. It is affordable — two folded phases would go 1219 →
  1231, inside the 1248 frame — and it is still a treadmill: `deriveNumbers`
  grows a number by depth, by sibling-group size **and** by insertion against a
  frozen anchor, and the last of those has no bound at all. The column's own
  JSDoc argues against exactly this.
- **An ellipsis** (`…`) makes the truncation honest but leaves depth 5 and 6
  reading alike, so it does not close the fault.
- **Eliding from the head instead of the tail** — `direction: rtl` on the number,
  the standard treatment for path-like strings — is the only one that holds at
  every depth, because the discriminating part of a tree number is its **tail**
  and the head is redundant with the row's indent. It also inverts how every
  clipped number in the product reads, and it needs the number span to become a
  constrained block, which makes `numberCellNeeds`'s `contentWidth` — the
  measurement that picks the 93px in the first place — read the full cell width
  and turn `the Number column fits its envelope` into a check that cannot fail.

So: recorded, measured, and put to Dany with the costs attached. `verify.md`
carries the numbers; the workspace's manual-test notes carry the corrected A13
wording.

## D5 — `1 phase need`

Found while reading the Phases dialog for D1's figures: at one phase the
sentence reads **"1 phase need ≥1123px of width to sit side by side"**.
`count(1, 'phase')` gets the noun right and the verb was never made to agree.
`phases-dialog.test.tsx`'s `counts one phase as one` pins the string
`'1 phase need'` — it was written about the noun and swept the verb up with a
`toContain`.

It is the `and 1 others` defect #59 fixed in the chart's blocking-set sentence,
in the dialog next door, and in the one sentence this whole change is about. One
expression, one test rewritten to assert the whole sentence, and a negative
watched both ways so the fix cannot be "never say `need`".
