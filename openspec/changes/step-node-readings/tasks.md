## 0. Spec

- [x] 0.1 Intent, delta spec and design; OpenSpec validation green (020.11, 2026-10-11).
      Glossary entries are task 0.2. Depends on `step-node-attempts` slices 1–5.
- [ ] 0.2 Apply glossary entries (Node reading, Waiting) to `CONTEXT.md` verbatim from
      `puni-plan/batch-10/interviews/glossary-delta.md`, in the first green commit of slice 1.

## 1. The reading in `@wbs/domain`

- [ ] 1.1 Red: `node-reading.test.ts` one case per clause in order (skipped, done, hold over
      in progress, running attempt as in progress, proxy, waiting with one and two done
      predecessors, first node unknown, a predecessor not done → unknown), "skipped is never
      produced with participation null" (fast-check over every other input),
      "NODE_READINGS has eight words". Files: `libs/wbs/domain/domain/src/node-reading.ts`.
- [ ] 1.2 Green: `NODE_READINGS`, `NodeReading`, `isNodeReading`, `nodeReadingOf`.
- [ ] 1.3 Negatives: the `predecessors.length >= 1` clause dropped → "first node unknown"
      reads `waiting`; the hold clause moved below in progress → "hold over in progress".

## 2. The fold's attempt extension and the wire

- [ ] 2.1 Red: `roll-up.test.ts` "a node with an attempt holds work", "a running attempt reads
      in progress in the fold", "an ended failed attempt keeps a silent QA in the fold";
      `work-item.resource.test.ts` mounted "reads readings per node from the resolved step
      graph" (QA waits on a done Dev through a workflow edge; an authored edge counts too),
      "no node reads skipped"; the contract union in `work-item-response.ts`.
- [ ] 2.2 Green: `workedStepsOf(…, attempts)`; `rollUpProgress` reading running attempts;
      `readings` on the read computed from `resolveStepNodeGraph`.
- [ ] 2.3 Negatives: attempts left out of `workedStepsOf` → "an ended failed attempt keeps a
      silent QA in the fold" reads `done`; predecessors taken from step order instead of the
      graph → the authored-edge case.
- [ ] 2.4 Dev-store report: run the fold before and after on a copy of wbs-dev's database and
      record the count of leaves whose status moves in `verify.md` (expected 0: no attempts
      exist yet).

## 3. fe-01

- [ ] 3.1 Red: `status-cell.test.tsx` "gives every reading its own glyph" (eight distinct);
      `plan-cells.test.tsx` (the corner glyph and its sr-only words per reading; the Status
      column still shows the row fold; `paused` renders the query-failure state);
      `folded-step-card.test.tsx` ("Waiting", "3 attempts, last cancelled", executor and
      reference); `e2e/status.spec.ts` a waiting QA glyph in a browser.
- [ ] 3.2 Green: `NODE_READING_GLYPH`, `NODE_READING_TOKEN`, the corner glyph in the step
      cell, the card's first lines.
- [ ] 3.3 Negatives: `skipped` set to `⊖` → "every reading its own glyph" fails with seven
      distinct glyphs; the unknown-word guard removed → `paused` renders a blank corner.

## 4. Verify

- [ ] 4.1 Affected tests, the format check, `lint:fast`, `typecheck`, OpenSpec validation,
      the host gate; outputs, the dev-store count and every proof row in `verify.md`.
