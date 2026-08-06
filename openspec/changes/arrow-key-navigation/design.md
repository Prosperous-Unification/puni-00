# Design

## D1 — The grid is the visible rows and the editable columns, and nothing else

`nextCell` takes the row ids **in the order the table is rendering them** and the
editable column ids in their on-screen order. Both come from TanStack's row
model, which already excludes the children of a collapsed branch — so Down from a
closed parent lands on the next row a person can see rather than on a child that
is not there.

The number column is not in the list: it is derived and read-only, and stopping
on it would be a keypress of nothing on every row. The drag handle and the row
actions are buttons, already reachable by Tab from outside the grid.

## D2 — Left and Right defer to the caret

Arrow keys inside a text input already mean something, and it is something people
use constantly. So Left only leaves the cell when the caret is at position 0 with
nothing selected, and Right only when it is at the end. Anywhere else, the event
is not touched and the browser moves the caret.

Up and Down have no such conflict: every cell here is a single-line input, where
those keys do nothing at all. They move rows unconditionally, which is what makes
filling a column down forty rows possible.

`nextCell` is given the caret state rather than reading it, so the rule is
testable without a DOM: `atStart` and `atEnd` are booleans in, a target cell or
`null` out.

## D3 — Focus moves by querying the DOM, not by owning it

Each editable input carries `data-cell="<rowId>::<columnId>"`, and the handler
focuses the match. The alternative — a ref map keyed by cell — means a structure
to keep in step with a table that renumbers and reorders on every edit, and the
first thing that goes stale is the entry for a row that just moved.

The query is against the table element rather than the document, so a second
table on a page could not be focused into by accident.

## D4 — The handler comes from the `live` ref, like every other one

Column definitions in this table may depend on `roles` and nothing else.
`flexRender` renders each `cell` as a component _type_, so a definition that
changed with the row model would remount every cell and eat the focus this change
exists to move around. That rule was broken once already, by a handler that
reached the row list through `indent`/`outdent`; this one reaches it the same way
and must therefore be read at call time, not captured.
