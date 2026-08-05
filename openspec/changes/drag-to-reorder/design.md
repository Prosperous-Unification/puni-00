# Design

## D1 — The browser's own drag events, and no new dependency

`dnd-kit` is the obvious library and it was considered. What it is good at —
pointer sensors, touch, screen-reader announcements, collision strategies — is
mostly not what this needs: the hard part here is the _tree_ semantics (which
parent, which position, is this a cycle), and no library decides those. The
accessible path already exists and is keyboard-native: Tab and Shift+Tab, tested.

So: `draggable`, `dragstart`, `dragover`, `drop`. Zero dependencies, and the
whole decision surface stays in one pure function this repo can test the way it
tests `place-sibling.ts` on the server.

The cost is stated in the proposal's non-goals rather than hidden: no touch.

## D2 — The plan is a pure function, the DOM is a caller

`planMove(rows, draggedId, targetId, zone)` takes the flat row list and returns
either `{parentId, afterId}` — exactly the two arguments `POST /work-items/:id/move`
wants — or a refusal with a reason. It never touches an event, an element or a
fetch.

That is the whole reason the interesting cases are cheap to test: dropping a row
onto its own grandchild, dropping it back where it already is, dropping into a
collapsed branch. Wiring `dragover` to a `useState` is not where the bugs are.

## D3 — Three zones, and the middle one is the biggest

Top quarter of a row is "above it", bottom quarter is "below it", the middle half
is "inside it". The middle is deliberately the largest: making a row a child is
the operation people are actually reaching for when they drag in an outline, and
the two reorder zones are recoverable in one more drag if you miss.

A row is a valid drop target whether or not it has children. Dropping into a
childless row makes it a parent, which is how a breakdown grows.

**Below an open parent means "first child".** With the branch showing, the next
row down is the target's first child, so the line is drawn in that gap and the
row has to land there. With the branch closed, the next row down really is the
target's next sibling and "after it" is right. The table knows which; the planner
is told rather than left to guess, which keeps it pure.

## D4 — The client refuses what the server refuses, on purpose

be-01 rejects a move of a frozen row, and a move into a row's own subtree, and it
is the authority. The client checks both again before sending.

That duplication is deliberate and is not a shortcut around the server: the
request is still made and still authoritative for everything else. It exists
because drag has no error state a person can read — the row snaps back, and
nothing on screen says whether that was a rule, a network failure or a bug. A
refusal decided locally can name itself in the same instant.

The two copies are held together by asserting be-01's rule directly rather than
by example: over every row, target, zone and expansion state of a fixture tree,
no plan this function emits resolves to a parent that descends from the row being
moved. That is `descendsFrom` in `work-item.service.ts`, restated as a property.
The first version of this section claimed the copies were "held together" by
tests that only repeated a few cases, which a reviewer was right to call
overstated.

## D5 — A no-op drop is not a request

Dropping a row exactly where it already sits produces the same `(parentId,
afterId)` it already has. Sending that would renumber nothing, record an event,
push it to every subscribed socket, and make every other open browser refetch a
tree that did not change. `planMove` reports it as a refusal with reason
`unchanged`, which the caller treats as "do nothing", silently — unlike the other
refusals, there is nothing to tell anyone.
