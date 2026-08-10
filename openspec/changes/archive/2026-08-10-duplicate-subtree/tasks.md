## 1. The atomic write

- [x] 1.1 `SubtreeCopy` and `SubtreeStore` in `repository/index.ts`;
      `SubtreeRepository` in `repository/work-item.ts` writing all four tables
      in one `db.transaction`, in the order the foreign keys force.
      **Test:** `repository/work-item.test.ts` — a copy with rows, an estimate
      and an internal edge reads back whole.
      **Negative test:** the last insert given a dependency naming a work item
      that does not exist — the foreign key rejects it and **no** row,
      estimate or assignment from the copy is in the database. Watched failing
      with the transaction replaced by sequential writes.
- [x] 1.2 `inMemorySubtrees` fixture composing the four in-memory stores, in
      the same order, with its non-atomicity stated on the symbol.

## 2. The service

- [x] 2.1 `WorkItemService.duplicate(id, actorId)` — `contextFor` for the
      guards, `subtreeOf` for the rows, `placeAfter` for the slot, one id map,
      then one `insertSubtree` and one tree announce. `too_large` added to
      `WorkItemRefusal`.
      **Tests** (`service/work-item.service.test.ts`): a deep subtree copies
      names, notes, estimates, assignees, team labels and dates; the copy's
      numbers derive correctly; placement is next sibling; the root gains
      ` (copy)` and children do not; a leaf copies; 501 rows are refused.
- [x] 2.2 Dependency remapping. **The test:** `A → B` both inside the subtree
      gives `A' → B'` and **not** `A' → B`. **Negative test:** the remap
      dropped (edges copied with their original ids) — watched failing.
- [x] 2.3 An edge with one end outside the subtree is not copied.
      **Negative test:** the both-ends filter relaxed to either-end — watched
      failing.
- [x] 2.4 No copied row carries a frozen number, and the originals keep
      theirs. **Negative test:** `frozenNumber` carried across from the source
      — watched failing.

## 3. The route

- [x] 3.1 `POST /api/work-items/:id/duplicate`, wired through `buildServices`.
      **Tests** (`controller/work-item.controller.test.ts`): 401 without a
      token, 404 for an unknown work item, 403 on a restricted project, and a
      happy path whose returned id is present in the next tree read.

## 4. The table

- [x] 4.1 `api.duplicate(id)` in `wbs-api.ts`; a Duplicate button in the row
      actions column on every row, frozen included; the caret lands on the
      copy's Name through `focusNext`.
      **Tests** (`wbs-table.test.tsx`): the button duplicates and the focus
      lands in the copy's Name; a refused duplication raises a toast.

## 5. Gate

- [x] 5.1 `CONTEXT.md`: Subtree, Duplicate.
- [x] 5.2 Format, the run-many gate uncached, `openspec validate --all` —
      recorded in `verify.md` with the failure-proof table.
