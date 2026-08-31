<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 0. Ordering

- [x] 0.1 **After `unified-reference-cell-ux`** (including its section 4b): the Type cell adopts that change's settled strip, and building it first means building it twice.

## 1. Storage

- [x] 1.1 Migration: `work_item_type (id, name)` unique on name, and `work_item_work_item_type (work_item_id, type_id)` with the pair as primary key and both foreign keys cascading — additive forward, `down.sql` dropping both — test: `migrate-down.test.ts` round trip; migration lint green.
- [x] 1.2 Repository: list, create (refusing a duplicate name as a modeled conflict, never a 500), remove, and full-replacement write of a work item's types — test: `work-item-type.test.ts` `a type name is unique in the directory`, `a work item carries several types`, `removing a type from the directory takes it off every row`; negative: the unique index dropped, watched failing on the duplicate case.

## 2. Service, commands, wire

- [x] 2.1 The directory service exposes the vocabulary beside tags; `patchWorkItem` gains `typeIds` and `typeRefs` resolved like `tagIds`/`tagRefs` — test: `plan-commands.test.ts` `types are replaced wholesale`, `a ref minted in the same batch resolves`; negative: the replacement made additive, watched failing on a removed type coming back.
- [x] 2.2 The plan payload carries each work item's `typeIds` and the directory's types; undo/redo restore the previous set — test: payload shape case, `plan-history` undo case; negative: undo restoring an empty set, watched failing.

## 3. The cell and the column

- [x] 3.1 `type` added to `COLUMN_WIDTHS` at 120, to `hideableColumnIds` in table order (after `tag`), and to `DEFAULT_HIDDEN_COLUMNS` — test: `table-frame.test.ts` `the default table is the table it was`, asserting the **pinned** pre-change folded figure; negative: `type` removed from the hidden defaults, watched failing on that figure by 120px.
- [x] 3.2 The Type cell as a `ReferenceSetStrip` with the `type` adapter: chips, search, create-on-name, full-replacement write — test: `wbs-table.test.tsx` `naming a type the directory does not hold creates it`, `an unset type shows nothing and inherits nothing`; negative: the Teams cell's inheritance rule copied in, watched failing on the parent's `Epic` appearing.

## 4. Filter and directory page

- [x] 4.1 A type facet listing the types present on the plan — test: `the facet lists what the plan carries`; negative: the facet sourced from the directory rather than the plan, watched failing on `Epic` being offered.
- [x] 4.2 The directory page edits the type vocabulary beside tags — test: `directory-page.test.tsx` create/rename/remove cases, asserting **after** the server has answered (`AGENTS.md`, `D directory-page`: an optimistic page and a patient one land on the same screen, so assert in the window the fault lives in — hold the request in flight).

## 5. In a browser

- [x] 5.1 Chromium at 1280 and 390×844 (`e2e/types-cell.spec.ts`, 5 cases). **The 390 half of this task asked for a measurement that does not exist** — at that width the plan is `mobile-cards`' card list, with no table, no column and no cell; the case asserts that instead and fails if the table is ever rendered there. **And the named negative (`flex-wrap: wrap`) could not be made to fail**: the cell clips, so wrap and nowrap are indistinguishable at the row, and a strip comparison fails on correct code (87px with three chips, 48px with one, both under `nowrap`). The clip is asserted directly instead and watched failing on `overflow: visible`. Original text: the column shown from `Columns`, a row of three types the same height as a row of none, the chip run clipped rather than wrapped — negative: `flex-wrap: wrap` on the strip, watched failing on the measured height. jsdom computes no layout.

## 6. Gate

- [x] 6.1 `bin/h2puni-gate.sh`, `openspec validate --all --json`, migration lint, the whole `CI=1` Playwright gate on shifted ports. On 2026-08-31, at the shipped `['number', 105]`, `FLEXIBLE_FLOOR = 200`, `['depends', 86]`: **the whole `CI=1 E2E_PORT_SHIFT=2600` Playwright gate is green — 259 passed, 0 failed, 1 skipped in 6.7m, exit 0** (the skip is `gantt.spec.ts`'s pre-existing `test.fixme`). `nx run-many -t test lint typecheck build` over the twelve app and lib projects is green (fe-01 63 files / 1992 tests, be-01 1248, gw-01 105, mcp-01 59), `bunx openspec validate --all` says 33 passed / 0 failed, `nx format:check --all` is clean, and CI's own secrets scan, doc caps and migration lint over the whole repo exit 0. `bin/h2puni-gate.sh` exits 127 on this macOS host and was **not** run — the per-project targets above were run instead, and a whole-workspace run is not the sum of per-project runs. `tool-bootstrap:test` is outside the run-many scope because it times out on this host shelling into a caddy/bun host-state matrix (`status null`, 272s per case), pre-existing and unrelated to anything here. This change's own browser share, `e2e/types-cell.spec.ts`, is **5 passed**.
