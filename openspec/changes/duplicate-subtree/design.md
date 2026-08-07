## Context

A duplication touches four tables — `work_item`, `estimate`, `assignment`,
`dependency` — and the sibling group the copy lands in. Every existing mutation
touches one store; this one cannot, which is the only reason this file exists.

The tree is read and placed by code that is already here: `listByProject` plus
the `parentId` walk in `subtreeOf`, `placeAfter` for the sibling slot, and
`deriveNumbers` on read, so no copied row carries a number.

## Goals / Non-Goals

**Goals:**

- One write. A reader must never see a subtree that is half copied.
- The copy's dependencies point at the copy, never at the original.
- Reuse the placement and numbering already in the service.

**Non-Goals:**

- No new table, column or migration.
- No streaming or chunking of a large copy. It is bounded at 500 rows instead.

## Decisions

**The write is one transaction across four tables, behind its own store.**

`SubtreeStore.insertSubtree(copy)` takes the whole copy — rows, the respaced
siblings, estimates, assignments and internal edges — and writes it in one
`db.transaction`. It is a store of its own, `SubtreeRepository`, rather than a
method on `WorkItemStore`, because the transaction is genuinely wider than the
work item table and pretending otherwise would put the estimate and dependency
writes somewhere nobody looking for them would find them.

Crossing tables inside one repository is not new here: `WorkItemRepository.remove`
already deletes from `estimate` in its own transaction, for the same reason —
the foreign keys make the two writes one act or neither.

The alternative was inserting the rows atomically and then calling
`EstimateStore`, `DirectoryStore` and `DependencyStore` in a dependency-safe
order. That leaves a window in which the copy exists with no estimates and no
assignees, and a process that dies inside it leaves a silently wrong plan —
rows that look estimated at zero rather than rows that are visibly missing.
Since all four stores are already backed by one `bun:sqlite` connection, the
window bought nothing.

**Order inside the transaction is forced by the foreign keys:**

1. respaced siblings — position writes only,
2. rows, parents before children, because `parent_id` references `work_item.id`,
3. estimates and assignments, which reference the rows just written,
4. dependencies last, referencing two rows each.

`subtreeOf` already yields ancestors-first, so (2) needs no extra sort.

**Ids are remapped through one map, built before anything is written.** Every
lookup that misses throws rather than defaulting: a copied edge that quietly
kept the original's id would be a wrong plan delivered confidently, which is
what R5 is for.

**The in-memory fixture is not atomic and says so.** `inMemorySubtrees` composes
the four in-memory stores and applies the copy in the order above. The
atomicity claim is not testable against Maps — it is proved against SQLite in
`repository/work-item.test.ts`, by failing the last insert on a foreign key and
asserting nothing landed.

**Placement.** `placeAfter(siblingsOfTheOriginal, originalId)` gives the copied
root its position and any respacing the group needed. Copied descendants keep
their originals' positions: their whole sibling group is copied with them, so
the positions stay distinct and the order is preserved.

## Risks / Trade-offs

- **500 is a judgement, not a measurement.** It is well above any hand-built
  phase and well below anything that would make one transaction slow. If a real
  plan hits it, the number moves; it is one constant.
- **The copy is placed, not merged.** Duplicating a row whose sibling group is
  tightly packed respaces that group, which renumbers siblings the caller did
  not touch. That is what every insertion here already does.
- **`assignment` and `estimate` are inserted plainly**, not upserted. Their
  work item ids are freshly generated, so a conflict would mean an id
  collision, and swallowing that with `onConflictDoNothing` would hide it.
