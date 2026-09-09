# verify — notes-preview-clears-the-marker-lane

## Commands

| Command                                                      | Result              |
| ------------------------------------------------------------ | ------------------- |
| `openspec validate --all --json`                             | 66 items, 66 passed |
| `nx run fe-01:typecheck`                                     | green               |
| `nx run fe-01:lint`                                          | exit 0              |
| `nx format:check --all`                                      | clean               |
| `nx run fe-01:test`                                          | 2598 + 3 passed     |
| `playwright test -g "leaves the marker lane clear"`          | 1 passed            |
| `playwright test` (whole browser gate, `E2E_PORT_SHIFT=500`) | 321 passed, exit 0  |

## Failure proofs

| Check                                                | Injected fault                              | Watched failure                                                               |
| ---------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------- |
| `leaves the marker lane clear` — the geometry        | `clearsMarkerLane` off `HoverPreview`       | `the preview covers the marker lane · Expected: <= 486.40625 · Received: 502` |
| the same, again                                      | `100%` removed from the scrolling max-width | the same assertion, the same two figures — the card regrows the 24px          |
| `sizes the one card that scrolls…` — its declaration | `clearsMarkerLane` off `HoverPreview`       | `expected 'min(640px, 100vw)' to be 'min(640px, 100%, 100vw)'`, in jsdom      |

## The check that could not fail, and how it was found

The first cut of `leaves the marker lane clear` typed **one sentence** of notes into each of the
three rows, and it was watched **passing** with `clearsMarkerLane` removed. The card shrinks to
fit its content, so a short paragraph laid out around 300px inside a 555px cell — its right edge
was 200px clear of the marker lane whatever the placement said. The assertion was true, about a
card that was never anywhere near the fault.

It types a paragraph now, and the precondition is asserted before the claim: `cell.x +
card.width > below.x` — the card is wide enough to reach the lane from its cell's own left edge,
so the only thing that can keep it off the lane is the pull. Both faults were then watched.

R5 #24 in `AGENTS.md`: **a geometry proof needs a box big enough to commit the fault.**

## What jsdom cannot see here

The whole change is a computed layout: `left: -24px` against a `max-width: min(640px, 100%,
100vw)` inside a `position: sticky` `<td>`. jsdom reports the declarations and lays nothing out,
so it can see neither the card's right edge nor the marker it covers. The pointer walk down the
lane — three markers, each asserted — is a browser's fact too.
