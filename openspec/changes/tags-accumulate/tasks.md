<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The rule

- [x] 1.1 `effective-tag.ts` forks off `effectiveLabelsOf` and accumulates: climb to the nearest settled ancestor collecting the chain, fold back down, own entries first then each ancestor's nearest-first, a restated tag kept once from the nearer row. `EffectiveTags` becomes `readonly TagInForce[]`; absence still spells "no tag anywhere above". Tests in `effective-tag.test.ts`: `keeps every ancestor's tags when a row states one of its own`, `accumulates every ancestor in the chain, not only the nearest`, `a row restating an ancestor's tag states it itself, once`, `names the row each tag came from`, `resolves a chain of untagged rows once`, `refuses a parent chain that runs in a circle`, `refuses a circle above a row that is itself outside it`.
- [x] 1.2 Negatives, all watched — failure text in `verify.md` and in each `Proof:`: the inherited half of `accumulate` deleted (four cases red); the `claimed` guard deleted; `push(above)` re-stamped with `statedBy`; the identity early return deleted; the cycle guard replaced by `seen.size;` (watched as a hang, killed by `timeout`).
- [x] 1.3 Teams and services do **not** move: `effective-label.ts`, `effective-team.ts` and `effective-service.ts` keep the overriding walk, and `effective-service.test.ts`'s three-dimension case is the fence — its team and service arms are unchanged and only its tag arm reads as a union.
- [x] 1.4 JSDoc across all four domain files says which rule each dimension takes and why, pointing at ADR 0008 and ADR 0009.

## 2. What a face reads

- [x] 2.1 `TagLabel` becomes `{ own, inherited }` with per-tag `fromRow` and the tag's `id`; `hasTags` replaces the `state === 'none'` test — `gantt-geometry.test.ts` `carries a stated and an inherited tag together, each with its source`.
- [x] 2.2 `wbs-table.tsx`'s `effectiveTagLabelOf` splits on `fromId === row.id` and nothing else; the filter facet maps the union.
- [x] 2.3 `gantt-panel.tsx`'s `tagWords` names the source per tag — `gantt-panel.test.tsx` `says what kind of thing the work is, and where an inherited tag came from`, third row stating one tag and inheriting another; negative: the pre-0008 sentence restored, watched failing.
- [x] 2.4 `plan-export.ts`'s `tagCell` stops sharing `labelCell` and prints `Ready; Risk (inherited from 010 Compliance)` — `plan-export.test.ts`; negative: `labelCell` restored, watched failing.

## 3. The cell

- [x] 3.1 `ReferenceSetAdapter` grows `inheritedEntries`; `ReferenceSetStrip` draws them after the own chips, outlined, muted, `↳`-prefixed, **with no ✕**, `title` naming the stating row, filtered against `ownIds`. `reference-set-field.test.tsx` `draws what it carries beside what it states, and only the second removably` and `drops an inherited member the row has since stated`; negatives: the map emptied, a ✕ added, the filter deleted — all watched.
- [x] 3.2 The Tags cell passes `inheritedEntries` and **not** `inheritedLabel`, and its placeholder stops repeating the inherited names — `wbs-table.test.tsx`. The `type` kind passes neither (ADR 0009).
- [x] 3.3 `plan-cards.tsx` splits `CardSetField` into `CardServiceField` (unchanged) and `CardTagsField`, which draws `data-card-tags` for the stated names and `data-card-tags-inherited` for the carried ones — `plan-cards.test.tsx`.

## 4. Height and what is drawn, in a browser

- [x] 4.1 Chromium, `e2e/reference-cells.spec.ts`, on `E2E_PORT_SHIFT=1105` (1100 puts be-01 on 4200, which a dev server holds — see `verify.md`): a row that states one tag and inherits two rests at the same height as a row that carries none; the cell holds one own chip, two inherited chips and exactly one Remove button; the own chip and the `+` are hit-testable. **jsdom computes no layout and cannot be this test's oracle** (`AGENTS.md`, R5 #14/#15).
- [x] 4.2 The one-Remove-button claim is ADR 0008's own consequence and is the browser negative: a ✕ added to the inherited chip, watched failing on `Expected: 1 / Received: 3`.
- [x] 4.3 A `scrollWidth > clientWidth` guard was written on the theory that `CELL`'s `overflow: clip` might absorb a wrap and leave the heights vacuous. The injected fault said otherwise — it failed on the existing height check at `Expected: <= 27.1875 / Received: 68.1875` — and the guard, whose own removal could not be observed even when reordered ahead of the heights, was **deleted**. The reasoning stands where it was.
- [x] 4.4 The **whole** browser gate, not a filtered run: this change edits `reference-set-field.tsx`, which every reference cell draws (`linked-row-hover`'s lesson). 226 passed, 5 failed, all five accounted for in `verify.md`.
- [x] 4.5 Two browser-only faults in this change's own tests, found and fixed: the phone sheet's `Inherited:` assertion, and driving two cells of neighbouring rows in one pass under an open panel.

## 5. Documentation and gate

- [x] 5.1 ADR `docs/adr/0008-tags-accumulate-down-the-tree.md`: names the 2026-08-13 Q4 decision it supersedes, scopes the reversal to tags, cites ADR 0009 for why the type dimension goes the other way, and records the identity-corpus trap and the cap in those terms.
- [x] 5.2 `CONTEXT.md`: **Tag**, **Tag set**, **Effective tag set**, **Stating row**.
- [x] 5.3 Both identity corpora carry the comment saying their `tagIds` assertion is about **stated** tags and must stay that way.
- [x] 5.4 `bunx nx run-many -t test lint typecheck` under the host lock, prettier, `openspec validate --all --json`. Results in `verify.md`.
