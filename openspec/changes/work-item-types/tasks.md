<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 0. Ordering

- [ ] 0.1 **After `unified-reference-cell-ux`** (including its section 4b): the Type cell adopts that change's settled strip, and building it first means building it twice.

## 1. Storage

- [ ] 1.1 Migration: `work_item_type (id, name)` unique on name, and `work_item_work_item_type (work_item_id, type_id)` with the pair as primary key and both foreign keys cascading — additive forward, `down.sql` dropping both — test: `migrate-down.test.ts` round trip; migration lint green.
- [ ] 1.2 Repository: list, create (refusing a duplicate name as a modeled conflict, never a 500), remove, and full-replacement write of a work item's types — test: `work-item-type.test.ts` `a type name is unique in the directory`, `a work item carries several types`, `removing a type from the directory takes it off every row`; negative: the unique index dropped, watched failing on the duplicate case.

## 2. Service, commands, wire

- [ ] 2.1 The directory service exposes the vocabulary beside tags; `patchWorkItem` gains `typeIds` and `typeRefs` resolved like `tagIds`/`tagRefs` — test: `plan-commands.test.ts` `types are replaced wholesale`, `a ref minted in the same batch resolves`; negative: the replacement made additive, watched failing on a removed type coming back.
- [ ] 2.2 The plan payload carries each work item's `typeIds` and the directory's types; undo/redo restore the previous set — test: payload shape case, `plan-history` undo case; negative: undo restoring an empty set, watched failing.

## 3. The cell and the column

- [ ] 3.1 `type` added to `COLUMN_WIDTHS` at 120, to `hideableColumnIds` in table order (after `tag`), and to `DEFAULT_HIDDEN_COLUMNS` — test: `table-frame.test.ts` `the default table is the table it was`, asserting the **pinned** pre-change folded figure; negative: `type` removed from the hidden defaults, watched failing on that figure by 120px.
- [ ] 3.2 The Type cell as a `ReferenceSetStrip` with the `type` adapter: chips, search, create-on-name, full-replacement write — test: `wbs-table.test.tsx` `naming a type the directory does not hold creates it`, `an unset type shows nothing and inherits nothing`; negative: the Teams cell's inheritance rule copied in, watched failing on the parent's `Epic` appearing.

## 4. Filter and directory page

- [ ] 4.1 A type facet listing the types present on the plan — test: `the facet lists what the plan carries`; negative: the facet sourced from the directory rather than the plan, watched failing on `Epic` being offered.
- [ ] 4.2 The directory page edits the type vocabulary beside tags — test: `directory-page.test.tsx` create/rename/remove cases, asserting **after** the server has answered (`AGENTS.md`, `D directory-page`: an optimistic page and a patient one land on the same screen, so assert in the window the fault lives in — hold the request in flight).

## 5. In a browser

- [ ] 5.1 Chromium at 1280 and 390×844: the column shown from `Columns`, a row of three types the same height as a row of none, the chip run clipped rather than wrapped — negative: `flex-wrap: wrap` on the strip, watched failing on the measured height. jsdom computes no layout.

## 6. Gate

- [ ] 6.1 `bin/h2puni-gate.sh`, `openspec validate --all --json`, migration lint, the whole `CI=1` Playwright gate on shifted ports.
