# Verification

## The gate, uncached

```
$ bunx nx format:check --all
(no files listed)

$ bunx nx run-many -t test lint typecheck build --parallel=2 --skip-nx-cache
NX   Successfully ran targets test, lint, typecheck, build for 21 projects
      fe-01 (vitest)   236 pass  0 fail (13 new: 9 in table-frame.test.ts, 4 in wbs-table.test.tsx)

$ bunx @fission-ai/openspec@1.3.0 validate --all --json
23 items, 23 passed, 0 failed — sticky-table-frame valid
```

`fe-01:lint` failed twice first, both on the same new assertion:
`@typescript-eslint/no-unnecessary-condition` on an optional chain over an array
destructuring, which `noUncheckedIndexedAccess` does not widen. Fixed in the
test, not silenced.

## The checks, and the faults that broke them

| Check                                                       | Fault injected                                               | What the run reported                                                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| The headings are sticky (`wbs-table.tsx`)                   | `...STICKY_HEADER_CELL` dropped from the `<th>` style        | `keeps the column headings against the top of the frame` and `pins the same three columns in the heading, over everything else` failed |
| The pinned cells are pinned (`wbs-table.tsx`)               | `style={pinnedCellStyle(...)}` dropped from the `<td>`       | `pins the handle, the number and the name, and nothing past them` failed — every cell in the row came back with no `position`          |
| The frame scrolls (`wbs-table.tsx`)                         | `style={TABLE_FRAME}` dropped from the wrapping `<div>`      | `scrolls the table rather than the page` failed on the missing `overflow`                                                              |
| Each offset is the widths in front of it (`table-frame.ts`) | `left: pinned.left` replaced with `left: 0`                  | `gives a pinned cell an opaque background and a layer to paint in`, plus both DOM pinning tests — 3 failed                             |
| The indent cannot outgrow the column (`table-frame.ts`)     | the cap removed: `Math.min(depth, DEEPEST_INDENT)` → `depth` | `stops growing, so the Number column cannot outgrow its declared width` failed                                                         |
| Name is pinned, so Name is third (`wbs-table.tsx`)          | the Name and "Depends on" column definitions swapped back    | `opens with the number, the name, and then what the row waits for` and `pins the handle, the number and the name...` failed            |

Each fault was applied on its own, run, and reverted; the tree was 236 pass
between every one of them and after the last.

The fourth is worth its own line. On the first run of that fault
`table-frame.test.ts` stayed **green** — the geometry function was still right
and only the style function dropped the offset on the floor, so the unit test
was watching the wrong end of it. It gained two assertions that the offset
arrives on the cell style (`pinnedCellStyle('name', 'body')?.left === 196`),
and the fault was re-run against them: 3 failed, restored, 236 pass. This is
the thirteen-times failure in miniature, caught before it shipped rather than
after.

## What only a browser can confirm

jsdom does no layout, so **nothing here has watched a column stay put.** Every
test above asserts that a rule arrived on the element that needs it, which is
where all three of these went wrong while they were being written — not that
the rule had its effect. What needs Dany's screen:

- **That the pinned trio does not overlap.** The offsets are declared widths
  (28 / 168 / 360), and a column whose content is wider than its declaration
  grows past it — after which Name is painted over the right-hand end of
  Number. The indent cap at four levels is what bounds Number's content; the
  padlock, the expander and a ten-character number were measured by eye, not by
  a browser.
- **The `calc(100vh - 16rem)` estimate.** Too generous and the page scrolls a
  little as well — and then the frame's top can leave the viewport, taking the
  sticky heading with it, because a heading sticks to its frame and the frame
  is not sticky to anything. Too mean and there is blank space under the table.
  On a short window `minHeight: 20rem` wins and the page scrolls; same caveat.
- **The pickers.** The dep, assignee and team lists are absolutely positioned
  inside their cells, and this frame clips to its padding box. `13rem` of
  bottom padding is room for a 200px list on the last row; the notes preview is
  320px and can still need the frame scrolled to be read in full. A list opened
  near the right-hand edge is reachable the same way — the frame scrolls
  sideways, which is the whole point of it. **Not portalled**, deliberately:
  that is a bigger change than the clipping is a problem.
- **`position: sticky` on `<th>` rather than on `<thead>`.** Chosen because
  sticky on a row group is the newer of the two (Chrome 91, Safari 15). Which
  one Dany's browser prefers is his browser's to say.
- **Whether the horizontal scrollbar is discoverable at all.** A frame that
  scrolls with no visible affordance until the pointer is inside it is the one
  UX risk this change adds, and it is the kind of thing a screenshot settles in
  a second.

## What the reordering did not break

Name moving ahead of "Depends on" leaves the keyboard grid alone: the grid is
read from the DOM by `data-cell`, the dep input has no `data-cell`, and the
per-row order of editable cells (name, estimates, notes) is unchanged. All 103
tests in `wbs-table.test.tsx` — Tab walks, arrow keys, drag and drop, the dep
picker — pass unchanged apart from the two that assert the order and the
pinning themselves.
