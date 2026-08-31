# verify — `external-refs`

Sections 1–3 (storage, derivation, commands) landed earlier and are recorded in
their own tasks. This file records **sections 4–7**, the front end, done on
2026-08-31.

## The width claim

The column costs 40px. The folded table had **16px of slack** at 1280, so the
column put it 24 over — and 24, not 40, is what had to be found. It came off
**`depends`**, 110 → 86.

| Figure                                                    | Before | With the column, unpaid | As shipped |
| --------------------------------------------------------- | ------ | ----------------------- | ---------- |
| `foldedTableMinWidth([], DATED)`                          | 1067   | 1107                    | **1083**   |
| `foldedTableMinWidth(['step-dev','step-qa'], DATED)`      | 1259   | 1299                    | **1275**   |
| the same at the `UNDATED` state the browser gate measures | 1231   | 1271                    | **1247**   |
| the Name column at 1280, two steps folded                 | 217    | 177                     | **201**    |

The third row is the one the browser judges: **1247 against a 1248px frame**,
one pixel inside. The fourth is the constraint that binds one pixel tighter
still — `gives the name column everything the other columns did not take, up to
its cap` needs Name strictly above its 200px floor, and 201 is what 86 leaves.

Pinned in `table-frame.test.ts`, `pays for the refs column out of Depends on,
and leaves Number and the Name floor alone`. Four injections watched on
2026-08-31, one per term: `['refs', 48]` → `expected 1091 to be 1083`;
`['depends', 110]` → `expected 1107 to be 1083`; `['number', 102]` → `expected
1080 to be 1083`; `FLEXIBLE_FLOOR = 180` → `expected 1063 to be 1083`. The last
two are injections in the direction the first attempt took, and they are there
because the test now asserts those two did **not** move.

## Where the 40px came from, and the two places it could not

**Two attempts, both refused by a browser, before `depends`.**

Dany's answer, asked directly, was "make # column and title column a bit
shorter" — given before either was known to be at a hard limit. Both are.

**`number` cannot pay.** `number-column-widen` shipped a requirement — `A deep
row's number reads as its own number` — that a four-segment row shows its number
whole and its five-segment child shows strictly more, and the same one level
deeper. At `['number', 85]` neither holds; at 96 only the first does. Read glyph
by glyph off a frozen deep branch in Chromium at 85:

```
030 -> 030 | 030.1 -> 030.1 | 030.1.1 -> 030.1.1 | 030.1.1.1 -> 030.1.1. |
030.1.1.1.1 -> 030.1.1. | 030.1.1.1.1.1 -> 030.1.1. | 030.1.1.1.1.1.1 -> 030.1.1.
```

A depth-4 row and its depth-5 child both read `030.1.1.` — the 2026-08-12
audit's own fault, two levels shallower than where `number-column-widen` left
it. The two envelope cases in `e2e/layout.spec.ts` were left **red** rather than
relaxed while that was true.

**Neither can the Name floor, and it is the same pixel twice.** The Name column
at 1280 with two steps folded is simply what the frame leaves, so every pixel
taken from `number` _or_ from `FLEXIBLE_FLOOR` comes off Name. Measured width by
width, with the floor already at 180 (Name is `282 - number` in that state):

| `number` | Name @1280 | folded floor | depth 4 | depth 5/6 | Name > floor | markdown row |
| -------- | ---------- | ------------ | ------- | --------- | ------------ | ------------ |
| 85       | 197        | 1231 ✅      | ❌      | ❌        | ✅           | ✅           |
| 93       | 189        | ✅           | —       | —         | ✅           | ✅           |
| 96       | 186        | ✅           | ✅      | ❌        | ✅           | —            |
| 97       | 185        | ✅           | ✅      | ❌        | ✅           | ❌           |
| 101      | 181        | ✅           | ✅      | ✅        | ✅           | ❌           |
| 102      | 180        | 1248 ✅      | ✅      | ✅        | ❌           | ❌           |
| 105      | 180        | 1251 ❌      | ✅      | ✅        | ❌           | ❌           |

Depth 5/6 needs `number ≥ 98`; the Name assertions needed `number ≤ 96`. **No
width of that column is green.** `number` and `FLEXIBLE_FLOOR` are therefore
back at 105 and 200 — exactly their pre-`external-refs` values — and each
carries a short note saying the cut was tried there and what it broke.

**A filtered run is what hid it.** The four-test run that first reported
`102 ✅` measured the budget and the two envelope cases and nothing else; the
whole gate then found two more assertions red in two other files. A change that
edits a shared width has no business believing a filtered run
(`LLM_README.md`'s landmine, in its third shape).

### `depends`, and what bounds it at each end

`depends` is the one wide fixed column in the default set whose width no
requirement pins the way `number`'s depth-5 legibility and Name's row height pin
theirs. It holds dependency chips — short, fixed-shape content — and the whole
list is already carried by the hover card and the cell's own `sr-only`
description (`deps-single-line`), so what a narrower column costs is how many
chips are visible before the clip, not what a reader can find out.

**From below: 66px, measured.** In Chromium a `030 ✕` chip lays out at
**40.52px** (`scrollWidth` 41, so that is its natural size and not a squeeze)
and the add affordance at **15.02px**, with a 2px gap and the 8px of padding the
declared width includes: 65.54, so **66px** is the narrowest this column can be
and still show one whole dependency plus the way to add another.

**From above: 86px**, by the Name column — 87 puts Name exactly on its floor and
86 leaves 201.

86 is the **top** of that range, not the bottom: no more is taken from the
column than the budget needs. What it costs is the second chip — at 110 two
chips and the add button fitted (108.06 of 110), at 86 one does, and the rest
clip into the card. Both margins are one pixel.

**`tag` and `team` (120 each) are the next candidates** if another default
column is ever added; both are hideable, and `team` is already hidden by
default. There is nothing left in this budget.

## `layout.spec.ts`, and the fourth pinned column

The column sits between `#` and Name, so it **had** to join
`PINNED_COLUMN_IDS`: `position: sticky; left` holds a cell at a fixed offset,
and an unpinned column between two pinned ones scrolls under the second while
every offset behind it is a sum 40px short. That is a fourth pinned column, and
`e2e/layout.spec.ts` was written for three.

`apps/fe-01/e2e/layout.spec.ts` was off-limits to the session that wrote the
rest of this file (another agent was live in it). **It was edited on
2026-08-31**, and this is what changed:

| Edit                                                                        | Why                                                                                                                   |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `refs: declaredLeft('refs', …)` added to the eight `measuredLefts` literals | a fourth pinned column; every offset is still read from `frameLayout`                                                 |
| `expect(declaredLeft('name')).toBe(129)` → `169`                            | `drag` 24 + `number` 105 + `refs` 40 — `number` is unchanged, and the 40 is paid by `depends`, which sits behind Name |
| `· 3.7` → `· 4` (×3) and `· 24.3` → `· 25` (×2)                             | `estimate-weights-and-rounding`: whole days, `ceil` per step                                                          |
| `Name of 020` → `Links for 020`, with a second Tab asserted behind it       | the tab-order decision below                                                                                          |
| the `three pinned columns` doc on `measuredLefts`                           | there are four                                                                                                        |

Nothing in the file's arithmetic was written out by hand: `declaredLeft` and
`frameLayout` are the same numbers the app lays out from, which is the property
that made the whole fourth-column edit five lines rather than a re-derivation.

### The tab-order decision: Tab out of a row's ⋯ lands on `Links`, not `Name`

Real behaviour change, decided rather than absorbed. The ⋯ cell is the row's
last column and the ref cell is its second, so the first control Tab meets in
the next row is the ref cell's `<button>`.

**Kept in the tab order.** The cell holds no input — the button is the _only_
way into it, and a cell whose one entrance is a pointer is a cell a keyboard
reader cannot open at all. It also carries the row's links as an
`aria-describedby` sentence, which is announced where the focus lands and
nowhere else. The alternative, `tabIndex={-1}` plus a chord, buys back one tab
stop per row in a table that already spends one per control a row owns (Name,
priority, every estimate box, ⋯) and costs the column its only keyboard door;
no chord for it exists, and inventing one is a change of its own.

`drives the actions menu from the keyboard, and gives the focus back` now
asserts **both** stops — `Links for 020`, then `Name of 020` — because the
claim being made is that the focus carries into row 020 in column order, and a
single-label assertion would be satisfied by a menu that trapped Tab on a page
where row 020 happened to be first. The reasoning is on the assertion as well
as here.

## The marks, as shipped

Dany asked to see these rather than be told (design D3). Light and dark are one
value each wherever a mid-lightness `oklch` reads on both grounds, and a token
wherever it cannot — `priority-band-style.ts`'s convention.

| System     | Fill    | Shape  | Light                       | Dark                        |
| ---------- | ------- | ------ | --------------------------- | --------------------------- |
| Jira       | blue    | filled | `oklch(0.55 0.19 255)`      | same                        |
| Confluence | blue    | ring   | `oklch(0.55 0.19 255)`      | same                        |
| GitHub     | neutral | filled | `currentColor` (near-black) | `currentColor` (near-white) |
| Slack      | green   | filled | `oklch(0.58 0.15 155)`      | same                        |
| other      | muted   | ring   | `var(--muted-foreground)`   | same token, dark value      |

Measured contrast against the cell's own ground, Chromium, 2026-08-31: every
mark clears 3:1 in **both** palettes (`every mark is legible in the light/dark
palette`). The GitHub mark is the one that only clears it because it is a token:
pinned to the near-black a hex would have given it, the dark half reads
**1.1138806212915524**.

## Commands

Run from the workspace root unless stated. The 2026-08-31 rows are the pass that
paid for the column's width and took `layout.spec.ts` on; the earlier rows are
the session before it.

| Command                                                                     | Result                                                                                       |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `bunx nx run fe-01:typecheck`                                               | pass (`tsc --build --force` on the app and e2e projects)                                     |
| `bunx nx run fe-01:test`                                                    | **63 files / 1992 tests passed**                                                             |
| `bunx nx run fe-01:lint`                                                    | pass — 0 errors, 1 pre-existing `react-hooks/exhaustive-deps` warning in `wbs-table.tsx`     |
| `bunx nx run be-01:test`                                                    | **1248 pass / 0 fail**, 89 files                                                             |
| `CI=1 E2E_PORT_SHIFT=2600 bunx playwright test … e2e/external-refs.spec.ts` | 5 passed                                                                                     |
| `CI=1 E2E_PORT_SHIFT=2600 bunx playwright test …` (whole gate, 2026-08-31)  | **259 passed / 0 failed / 1 skipped in 6.7m, exit 0**                                        |
| `bunx openspec validate --all`                                              | 33 passed, 0 failed                                                                          |
| secrets scan, doc caps, migration lint (CI's own commands, whole repo)      | all exit 0                                                                                   |
| `bin/h2puni-gate.sh`                                                        | **not run** — exits 127 on this host (macOS); the per-project targets above were run instead |

**`E2E_PORT_SHIFT=1600 was refused on this host**: another agent held shift 500,
whose fe-01 sits on 4700, which is shift 1600's be-01. `Error:
http://localhost:4700/health is already used`. 2600 clears all three tiers
(5700/5800/6800) and was used for every browser run recorded here. A `bun run
dev` has held 3100/3200/4200 throughout, which is why every run above is
shifted — an unshifted one measures that checkout (`LLM_README.md`'s landmine).

## Failure proofs (R5)

Every row was watched: the fault injected, the command run, the message below
copied from the output, the fault removed.

| Check                                     | Fault injected                                        | Test that saw it fail                                                       | Observed                                                                                            |
| ----------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| the column's width is pinned              | `['refs', 40]` → `48`                                 | `pays for the refs column out of Depends on, …`                             | `expected 1091 to be 1083`                                                                          |
| the payment, the column that made it      | `['depends', 86]` → `110`                             | the same test                                                               | `expected 1107 to be 1083` — the 24px this column really gave                                       |
| the payment did **not** move to Number    | `['number', 105]` → `102`                             | the same test                                                               | `expected 1080 to be 1083`                                                                          |
| nor to the Name floor                     | `FLEXIBLE_FLOOR` → `180`                              | the same test                                                               | `expected 1063 to be 1083`                                                                          |
| one mark per system, not per ref          | the family count → one entry per ref                  | `four refs to one system are one mark` (+4 in `external-ref-marks.test.ts`) | `expected [ 'github', 'github', 'github', …(1) ] to deeply equal [ 'github', 'jira' ]`              |
| colour is not the only channel            | `FAMILY_PAINT.confluence.filled` → `true`             | `two marks of one hue are told apart by fill`                               | `expected 'oklch(0.55 0.19 255)' to be 'transparent'`                                               |
| the card lists every ref                  | the card's list deduplicated by system                | `the card lists every ref and follows one`                                  | `expected [ <a …(4)></a>, <a …(4)></a> ] to have a length of 3 but got 2`                           |
| a non-http URL is not a link (jsdom)      | `followableHref` returns its argument unconditionally | `a non-http URL is not a link, on the card or in the editor`                | `expected <a data-refs-card-url="ref1" …(3)></a> to be null`                                        |
| a non-http URL is not a link (Chromium)   | the same fault                                        | `a stored javascript: URL never becomes an href, on either surface`         | `expect(locator).toHaveCount(expected) failed · Expected: 4 · Received: 5`                          |
| the write states the whole list on remove | the removal's `onReplace` deleted                     | `removes one ref and states the list that is left`                          | `expected [] to have a length of 1 but got +0`                                                      |
| the marks are out of flow                 | `markStyle`'s `position: 'absolute'` → `'static'`     | `four marks stand inside the cell, …`                                       | `jira is not a 6×6 disc · Expected {"height": 6, "width": 6} · Received {"height": 15, "width": 0}` |
| every mark is legible on both grounds     | `FAMILY_PAINT.github` → literal `oklch(0.2 0 0)`      | `every mark is legible in the dark palette`                                 | `github is not legible on this ground · Expected: >= 3 · Received: 1.1138806212915524`              |

### One check that could not fail, found and replaced

`tasks.md` 6.1 asks for "a row with four systems and a row with none measured to
the same height … negative: the marks moved into normal flow, watched failing on
the height". **The height assertion was watched _passing_ with that exact fault
injected** — 26.1875px either way, because the ref cell's box is 12px inside a
row the Name cell already stands 26.19px tall. The row is never this cell's to
move, so the equality is a true statement this design cannot break.

What the fault really does is collapse the marks: a `<span>` in normal flow is
inline, width and height do not apply to it, and the four discs become
zero-width text boxes standing outside the box they were meant to sit in
(`[164,150,0,15]`, measured). The test now asserts each mark is a 6×6 disc
inside its box, and the same fault was then watched failing on the message in the
table above. The row-height equality is kept — the spec asks for it — with a
comment saying it is not what the fault is watched against.

### Two more, in the plan rather than in a check

- **The pinned run.** Nothing in `proposal.md`, `design.md` or `tasks.md`
  mentions `PINNED_COLUMN_IDS`, and a column between `#` and Name has no choice
  about joining it. Recorded above.
- **The folded budget.** D5's "affordable against the 240px
  `configurable-columns` freed" is arithmetic against a figure that did not move.
  Recorded above, with the measurement.

## Skipped or unavailable checks

- Nothing is fetched from any external system, so nothing about a ref's target
  is verified — a ref to a deleted issue is a working link to a 404, by design.
- `bin/h2puni-gate.sh` exits 127 on this macOS host and was not run; the
  per-project `test`, `lint` and `typecheck` targets were run instead, and a
  whole-workspace run is **not** the sum of per-project runs
  (`LLM_README.md`'s landmine).
- `apps/fe-01/e2e/layout.spec.ts` **was** edited and run on 2026-08-31; see the
  section above. Nothing in it was relaxed at any point: its two envelope
  assertions were left red for the hours `number` sat at 85 and 96, and
  `gives the name column everything the other columns did not take` was left red
  for the hours the Name floor sat at 180. Both are green at the shipped widths,
  which is what taking the 40px off `depends` bought.
- `e2e/name-markdown.spec.ts`'s `NAMES.link` fixture was **shortened** on
  2026-08-31, and that is a change to a test rather than to the thing it tests.
  Its reading was 47 characters, about 6px from wrapping at the Name column's
  own width, so a case whose claim is "the row is as tall as its reading, not
  its source" had become a canary for every other column's width. The reading is
  7 characters now and the source 63; the negative was re-watched on the same
  message.
- The phone's card renderer has no ref column at all. That is asserted rather
  than assumed (`the same at 390×844 …`), and adding one is not in this change.
- The export (`plan-export.ts`) carries no ref column. `proposal.md`'s Impact
  mentions the export; no task in `tasks.md` asks for it, and none was written.
