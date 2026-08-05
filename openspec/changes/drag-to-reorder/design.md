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

## D4 — The client refuses what the server refuses, on purpose

be-01 rejects a move of a frozen row, and a move into a row's own subtree, and it
is the authority. The client checks both again before sending.

That duplication is deliberate and is not a shortcut around the server: the
request is still made and still authoritative for everything else. It exists
because drag has no error state a person can read — the row snaps back, and
nothing on screen says whether that was a rule, a network failure or a bug. A
refusal decided locally can name itself in the same instant.

The two copies are held together by testing the client's against the cases the
server's tests already cover: `frozen`, and `cycle`.

## D5 — A no-op drop is not a request

Dropping a row exactly where it already sits produces the same `(parentId,
afterId)` it already has. Sending that would renumber nothing, record an event,
push it to every subscribed socket, and make every other open browser refetch a
tree that did not change. `planMove` reports it as a refusal with reason
`unchanged`, which the caller treats as "do nothing", silently — unlike the other
refusals, there is nothing to tell anyone.
