# Tasks

Four slices, in order. Each names what proved it and, where it moves a check,
the fault that check was watched failing under. The table is in `verify.md`.

## 1. The grid is what carries `[data-grid]`

- [x] `components/wbs/editable-grid.ts`: `editableGrid`, `cellIn`,
      `focusAdjacentCell`, `focusCellAt`, `focusedCellKey`, `aListIsOpenIn`,
      `cellKey`, `isCellElement` and `CellElement`, all moved unedited but for
      the anchor.
- [x] `gridOf(node)` reads `[data-grid]`; the three `closest('table')` callers
      and `tableElement` follow it. The attribute already existed — `F` put it
      there for the CSS reset and said `X` would re-anchor on it.
- [x] **Test** — every existing keyboard test, unedited.
- [x] **Negative** — the selector pointed at an attribute nothing carries.
      **26 failures**: every Tab, every arrow, the date cell it steps over, the
      Cmd+Enter walk. Watched.

## 2. `LiveField`, and `CellInput` as its face

- [x] `components/wbs/live-editing.ts`: the five rules, the held refusals map,
      the flush registry, the submission record and the commit pipeline, moved
      with every Proof comment intact.
- [x] `cell-input.tsx` keeps the element choice, the auto-size, and the three
      events; it constructs one field per mount and hands it the server value.
- [x] `wbs-table.tsx` imports `CommitOutcome`, `flushCell`,
      `forgetRefusedDrafts` and `unsent` from the module instead of the box.
- [x] **Test** — 692 fe-01 tests, unedited.

## 3. The contract that is new: across a renderer, not just a remount

- [x] `live-editing.test.tsx`, four tests on two faces of one field — a
      `[data-grid]` table and a `[data-grid]` list of cards.
- [x] Both directions, plus the two that stop it being "remembers everything":
      a landed edit carries nothing, and a refusal resolved under the second
      face is resolved for both.
- [x] **Negative, two faults.** The hold moved back inside the face: these and
      `keeps a draft be-01 refused when a new phase rebuilds every column`
      failed together. The restore gated on `closest('table')`: **only this
      file saw it** — 695 others passed, because everything else in this repo
      renders the grid as a table.

## 4. `FocusIntent`

- [x] Where a structural edit asked the focus to go, where the command was
      issued from, the staleness rule, and the two ways it lands — from the
      committed DOM, or claimed by the Name cell as it attaches.
- [x] `focusNext`, `commandFrom` and `focusIntentIsStale` leave `WbsTable`, and
      `focusIntentIsStale` leaves the `live` mirror with them.
- [x] **Test** — every existing focus test, unedited.
- [x] **Negative** — `isStale` forced to false. One failure, alone: the late
      create that must not take the focus off a cell somebody moved to.
      Watched.

## 5. The gate

- [x] `bunx nx format:check --all`.
- [x] `bunx nx run-many -t test lint typecheck build --parallel=2`.
- [x] `openspec validate --all --json`.
- [x] The browser suite on 3109/3209/4209: 47 tests, byte-unchanged specs.
