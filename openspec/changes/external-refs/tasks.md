<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. Storage and the vocabulary

- [x] 1.1 Migration: `external_system (id, name)` unique on name, seeded with the known systems; `work_item_external_ref (id, work_item_id, system_id, url, position)` cascading from the work item — additive forward, `down.sql` dropping both — test: `migrate-down.test.ts` round trip; migration lint green.
- [x] 1.2 Repository: full-replacement write of a work item's refs, creating an unknown system name on the way — test: `external-ref.test.ts` `a work item holds several refs to one system`, `naming an unknown system saves it`; negative: the replacement made additive, watched failing on a removed ref coming back.

## 2. Deriving the system, once

- [x] 2.1 `systemOfUrl(url)` in `libs/domain`: an ordered host+path pattern list answering a canonical name or `null` — test: `external-system.test.ts` one case per known system plus `an unmatched URL is left to the reader`; negative: the GitHub pull-request pattern loosened to the host alone, watched failing on a GitHub issue URL typed as a PR.
- [x] 2.2 Derivation runs at the write and the answer is **stored**; reads never derive — test: `a new rule does not re-type an existing ref`, adding a pattern in the test and asserting the stored value; negative: the read path made to derive, watched failing on that case. This is the change's one irreversible-by-accident rule.
- [x] 2.3 A ref with no system is refused at the write as a modeled 4xx, never a 500 — test: `the ref SHALL NOT be stored until a system is named`.

## 3. Commands, wire, undo

- [x] 3.1 `patchWorkItem` gains `externalRefs` (full list) — test: `plan-commands.test.ts` `refs are replaced wholesale`; negative: partial merge, watched failing.
- [x] 3.2 The plan payload carries each work item's refs and the system vocabulary; undo restores the previous list — test: payload shape case, `plan-history` undo case; negative: undo restoring an empty list, watched failing.

## 4. The dot column

- [ ] 4.1 `refs` column at a fixed 40px inserted between `number` and `name`; added to `hideableColumnIds` and **not** to `DEFAULT_HIDDEN_COLUMNS`; the folded 1280 figure re-pinned at +40 — test: `table-frame.test.ts` `the folded minimum grows by exactly the refs column`; negative: the column widened to 48, watched failing on the pinned figure.
- [ ] 4.2 One mark per distinct system, up to four, then an overflow mark; marks absolutely positioned in a fixed-height box; no refs renders empty — test: `wbs-table.test.tsx` `four refs to one system are one mark`, `no refs is blank`; negative: one mark per ref, watched failing on the four-GitHub case.
- [ ] 4.3 Fill-and-hue per design D3, with a dark-palette value for each; every mark carries an accessible name naming the system and its count — test: `the cell says what it links to, without colour` (reading the accessible description alone), `two marks of one hue are told apart by fill`; negative: Jira and Confluence given the same fill, watched failing on the second.

## 5. Hover card and modal editor

- [ ] 5.1 The hover card reuses `DependsCard`'s passive surface and pointer bridge, listing every ref, each followable — test: `the card lists every ref and follows one`; negative: the list narrowed to the visible marks, watched failing on the third ref disappearing.
- [ ] 5.2 The modal editor: add from a pasted URL (system derived and shown, overridable), edit, remove — test: `taking the cell opens the editor`, add/edit/remove cases; negative: the write dropped on remove, watched failing.
- [ ] 5.3 A URL that is not `http`/`https` renders as text with no `href`, on **both** surfaces — test: `a non-http URL is not a link`, storing a `javascript:` URL directly through the repository; negative: the scheme check deleted, watched failing on the `href` appearing. Links open in a new context with `rel="noreferrer noopener"`.

## 6. In a browser

- [ ] 6.1 Chromium at 1280 and 390×844, both palettes: a row with four systems and a row with none measured to the same height and the same cell width; every mark's computed colour read and asserted legible against the page — negative: the marks moved into normal flow, watched failing on the height. jsdom computes no layout.

## 7. Gate

- [ ] 7.1 `bin/h2puni-gate.sh`, `openspec validate --all --json`, migration lint, the whole `CI=1` Playwright gate on shifted ports.
