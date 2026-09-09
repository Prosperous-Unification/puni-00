<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The preview clears the lane

- [x] 1.1 `HoverCard` gains `clearsMarkerLane` — `left: -24` instead of `0`, with `100%` added
      to the scrolling width ceiling — and `HoverPreview` passes it.
      Test: `e2e/hover-cards.spec.ts` — `leaves the marker lane clear, so the pointer can run
down it` measures the open preview's right edge against the next row's marker, then walks the
      pointer down two more markers asserting each row's own preview.
      Negative: `clearsMarkerLane` removed; watched failing on `the preview covers the marker
lane · Expected: <= 486.40625 · Received: 502`.
- [x] 1.2 The `100%` in the same ceiling is its own claim, and it was watched: removed, the card
      regrows the 24px and the same assertion fails on the same two figures. Recorded beside
      the line rather than in prose somewhere else.
- [x] 1.3 The test's own vacuity was found before it was believed. Its first cut typed one
      sentence of notes, the preview shrank to fit well inside its cell, and the case passed
      with the whole change reverted. It now types a paragraph and asserts, as a precondition,
      that the card is wide enough to reach the lane from its cell's left edge.

## 2. Gate

- [x] 2.1 `fe-01:test`, then the whole browser gate on the shifted ports.
- [x] 2.2 R5 #24 recorded in `AGENTS.md`: a geometry proof needs a box big enough to commit the
      fault.
