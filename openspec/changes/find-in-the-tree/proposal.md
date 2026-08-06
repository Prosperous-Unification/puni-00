# Find a work item in the tree, and fold the tree at will

## Why

Both UX reviewers put search and collapse/expand-all in their top ten. A plan
of any size is scrolled, and the only ways to reach a row today are the
scrollbar and one triangle at a time.

codex's requirement was the hard one, and it is what shapes this change:
**narrowing must keep the ancestors of a match and reveal matches inside
collapsed branches, or the narrowed tree lies.** A hit shown without the rows
above it is a work item torn out of the plan that gives it meaning — its
indent and its number then describe a tree that is not on screen. A hit
counted and left hidden inside a closed branch is worse: the table says it
found something and does not show it.

## What Changes

**A Find box narrows the table**

- A row stays on screen if its name contains what was typed
  (case-insensitive substring — the rule `matchingProjects` and
  `pickerEntries` already use), **or** it is an ancestor of such a row, **or**
  it is a descendant of one. Everything else goes.
- Ancestors are context; a descendant is there because matching a parent is
  how a person asks for a branch. **Only the row whose own name matched is
  marked** (a tint on its Name cell), so "why is this row here" reads at a
  glance.
- **Matches are revealed.** While the box holds something, the expansion the
  table renders is the search's: every kept row open. The reader's own
  expansion is neither merged into nor written over, so clearing the box puts
  the plan back exactly as it was left — collapsed branches included.
- Escape clears the box. It is not a cell of the keyboard grid (no
  `data-cell`), so Tab and the arrows cannot walk into it out of a row.
- `N of M rows` beside the box while searching. Nothing matching shows an
  **empty table** and `No matches for …`, never the whole table back: a filter
  that falls back to everything on no match reads as broken.

**Collapse all / Expand all, and the expansion is remembered**

- Two toolbar buttons: `{}` — every branch closed — and `true`, every branch
  open. TanStack's own two ends.
- The expansion is remembered per project per browser in
  `wbs.expanded.<projectId>`, restored into the initial state on mount so the
  plan does not visibly rearrange itself a frame after it loads.
- **A row created since the save arrives collapsed** while a record is in
  force, because TanStack reads an absent key as closed; under `true` — a
  browser that has never collapsed anything — it arrives open. Verified
  against `getExpandedRowModel` and `getIsExpanded`, and adopted rather than
  papered over: the alternative is a fourth state to keep in step.
- Ids in the record naming rows that no longer exist are harmless; expansion
  is read per row id and they are never looked at.
- A stored value that is not an expansion is dropped, key and all. It is
  user-editable storage read at a boundary, and a table that cannot be opened
  until somebody clears storage by hand is a worse answer than forgetting
  which triangles pointed down.

## Non-Goals

- **No search across notes, numbers, teams or assignees.** Names only. The
  Depends on picker already searches numbers, and a box that searched
  everything would need to say which field it hit.
- **No shared search.** Local to one reader; nobody else's table moves.
- **No highlight-within-the-name.** The cell is an editable textarea; marking
  a substring inside it means a second rendering of the value beside the one
  being typed into.
- **No jump-to-next-match key.** The narrowed table is the answer.

## Costs, named

- **The triangles and the two buttons stand down while a search is on.** What
  is open then is the search's answer; a control that either lied about that
  or closed a branch holding a hit is worse than one that waits. The buttons
  say why in their title.
- **A row edited or moved out of the match set disappears from the narrowed
  view.** The search re-derives from the rows that came back from every
  refetch, by anybody — it cannot pin a row it no longer describes. Clearing
  the box brings it back.
- **A row created while searching is not on screen**: its name is empty and
  matches nothing. Enter and Add work item still create it, and the focus lands
  on it once the box is cleared.
- **The readiness walk can aim at a hidden row while searching.** It opens the
  ancestors in the reader's own expansion, which the search overrides, so the
  cell is not found and the focus is left alone — a modeled miss, not a throw.
