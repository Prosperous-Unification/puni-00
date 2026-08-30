<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

R7 M3 of `notes/wbs-brief-2026-08-14-r7-markdown-export.md`: Mermaid's `gantt`
has exactly one grouping channel, `section`, and M1 spent it on the plan's own
outline with no choice offered. The brief's Q2 named the interesting
alternative and deferred it here: **per-assignee sections recover the lane
colouring the fence otherwise loses** (row 9 of the brief's mark inventory) —
our chart spends its colour channel on people, Mermaid has none, and grouping
by assignee is the one way this document can partly stand in for it. Grouping
by phase (`Dev`, `QA`, …) is the third reading somebody might want.

## What Changes

**`planToMermaid`/`planToMermaidDocument` gain an optional `sectionMode`
parameter**, `'outline' | 'phase' | 'assignee'`, defaulting to `'outline'` —
every existing caller draws exactly what it always did.

- `outline` (default, unchanged): the row's outermost ancestor, M1's own rule.
- `phase`: the role a slice is estimated under, this codebase's own word for
  it (`phases-dialog.tsx`); a slice under no role groups under `no phase`,
  sorted last.
- `assignee`: whoever is on the bar, in the roster order the app already lists
  people in; an unassigned slice groups under `unassigned`, sorted last.

Grouping under `phase`/`assignee` scatters a section's slices across the row
list (a `Dev` slice on row 3 and another on row 40 share a section), so the
sort's primary key becomes the section's own position rather than the row's —
otherwise Mermaid would draw the same section name as two separate,
non-contiguous bands. `outline` needed no such key: `plan.rows` is already a
depth-first walk, so a subtree is contiguous and the row's own order already
groups it, which is why M1's sort worked with none.

Both role names and person names are free text, so `phase`/`assignee` section
labels go through the same `mermaidPhrase` escaping a row's own name already
does.

## Non-goals

**No toolbar control.** `wbs-table.tsx` is two other agents' file tonight and
this change was told not to touch it; the capability ships with the `outline`
default and no way to reach the other two from the app. `verify.md` carries
the patch, the same pattern M1 and M2 left for their own buttons — and both of
those gaps went unwired for a day and cost a P1 (2026-08-15 cloud regression).
Naming it here so it does not repeat.

**`displayMode: compact`** — the brief's other M3 line item, folding same-role
bars back onto one row where they do not overlap. Out of scope: it needs YAML
front-matter the brief's §3 restricted to "unless Q2 says so", and Q2 did not.
