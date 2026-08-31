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

- [x] 4.1 `refs` column at a fixed 40px inserted between `number` and `name`; added to `hideableColumnIds` and **not** to `DEFAULT_HIDDEN_COLUMNS`; the folded 1280 figure re-pinned — test: `table-frame.test.ts` `pays for the refs column out of Number and the Name floor, and the folded minimum does not move`; negative: the column widened to 48, watched failing on the pinned figure (`expected 1075 to be 1067`, 2026-08-31). **It also had to join `PINNED_COLUMN_IDS`** — a column between two pinned ones scrolls under the second — which no artifact anticipated. The +40 put the folded table 23px over the 1280 budget for a few hours; it was **paid for** on 2026-08-31 (`number` 105 → 85, `FLEXIBLE_FLOOR` 200 → 180, Dany's call), the test renamed because "grows by exactly the refs column" stopped being true, and the two other halves of the budget watched failing too (`expected 1087 to be 1067`, each). What that narrowing cost — `number-column-widen`'s depth-4/5 guarantee — is the one thing still open. All in `verify.md`.
- [x] 4.2 One mark per distinct system, up to four, then an overflow mark; marks absolutely positioned in a fixed-height box; no refs renders empty — test: `wbs-table.test.tsx` `four refs to one system are one mark`, `no refs is blank`, plus `external-ref-marks.test.ts`; negative: one mark per ref, watched failing on the four-GitHub case. "Distinct system" is read at the **family** granularity (`github-pr` and `github-issue` share a mark) — see `external-ref-marks.ts` for why the palette cannot express any finer.
- [x] 4.3 Fill-and-hue per design D3, with a dark-palette value for each; every mark carries an accessible name naming the system and its count — test: `the cell says what it links to, without colour`, `two marks of one hue are told apart by fill`; negative: Jira and Confluence given the same fill, watched failing on the second.

## 5. Hover card and modal editor

- [x] 5.1 The hover card reuses `DependsCard`'s passive surface, listing every ref, each followable — test: `the card lists every ref and follows one`; negative: the list narrowed to the visible marks, watched failing on the third ref disappearing. Its **pointer bridge** is deliberately not reused: that bridge lights the rows a dependency names, and a ref points out of the plan. The Name cell's wrapper arrangement holds the card instead.
- [x] 5.2 The modal editor: add from a pasted URL (system derived and shown, overridable), edit, remove — test: `taking the cell opens the editor holding the row's links`, add/edit/remove cases; negative: the write dropped on remove, watched failing.
- [x] 5.3 A URL that is not `http`/`https` renders as text with no `href`, on **both** surfaces — test: `a non-http URL is not a link, on the card or in the editor`, storing a `javascript:` URL directly through the repository; negative: the scheme check deleted, watched failing on the `href` appearing, in jsdom **and** in Chromium. Links open in a new context with `rel="noreferrer noopener"`.

## 6. In a browser

- [x] 6.1 Chromium, both palettes: every mark measured a 6×6 disc inside its fixed box and inside the 40px cell, both rows the same height and both cells the same width; every mark's computed colour read and asserted 3:1 against the ground it stands on — `e2e/external-refs.spec.ts`. **The height half of this box could not fail as written** and the check was replaced: see `verify.md`, "One check that could not fail". The 390×844 arm asserts the phone's cards carry no ref column rather than measuring one they do not have.

## 7. Gate

- [x] 7.1 `bin/h2puni-gate.sh`, `openspec validate --all --json`, migration lint, the whole `CI=1` Playwright gate on shifted ports. On 2026-08-31, at the shipped `['number', 105]`, `FLEXIBLE_FLOOR = 200`, `['depends', 86]`: **the whole `CI=1 E2E_PORT_SHIFT=2600` Playwright gate is green — 259 passed, 0 failed, 1 skipped in 6.7m, exit 0** (the skip is `gantt.spec.ts`'s pre-existing `test.fixme`). `nx run-many -t test lint typecheck build` over the twelve app and lib projects is green (fe-01 63 files / 1992 tests, be-01 1248, gw-01 105, mcp-01 59), `bunx openspec validate --all` says 33 passed / 0 failed, `nx format:check --all` is clean, and CI's own secrets scan, doc caps and migration lint over the whole repo exit 0. `bin/h2puni-gate.sh` exits 127 on this macOS host and was **not** run — the per-project targets above were run instead, and a whole-workspace run is not the sum of per-project runs. `tool-bootstrap:test` is outside the run-many scope because it times out on this host shelling into a caddy/bun host-state matrix (`status null`, 272s per case), pre-existing and unrelated to anything here. The 40px this column costs is paid by `depends` (110 → 86); it was tried on `number` and `FLEXIBLE_FLOOR` first and a browser refused both — no width of `number` satisfies `number-column-widen`'s depth-5 requirement _and_ the Name column's own assertions at the same time. Both are back at their pre-change values. The measurement, the chip width that bounds `depends` from below (66px) and the Name column that bounds it from above (86px) are in `verify.md`.
