<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. The link, followable

- [x] 1.1 `LinkAsText` becomes `LinkInGrid`: an anchor with `target="_blank"`,
      `rel="noreferrer noopener"` and `tabIndex={-1}`, plus a
      `[data-cell-rendered] a { pointer-events: auto }` rule against the box's
      own `none` — test: `e2e/name-markdown.spec.ts` `a link in a name is not a
tab stop but can be followed`, which asserts the popup's URL, the Tab
      landing elsewhere, and a click past the link still opening the editor;
      negative: the `pointer-events` rule deleted, watched failing on the click
      opening the editor instead of the popup.
- [x] 1.2 The hover preview's notes map `a` to `LinkFollowable`, the component
      its title already uses — test: `e2e/hover-cards.spec.ts` `a link in the
notes is followable, and drawn like the name's`; negative: the mapping
      removed, watched failing on the missing `target`.
- [x] 1.3 A non-`http(s)` URL carries no such `href` on either face — test:
      `a javascript: URL in a name is not a link at all`.

## 2. The height

- [x] 2.1 `drawnBoxHeight` measures the box the reader sees and the at-rest
      height comes from it, with a `useLayoutEffect` re-measuring once the drawn
      content has committed — test: `e2e/name-markdown.spec.ts` `a link whose
source outruns its reading does not grow the row`; negative:
      `drawnBoxHeight` made to answer `null`, watched failing on `Expected:
26.1875 / Received: 42`.

## 3. Gate

- [x] 3.1 `nx run-many -t test lint typecheck build`, `openspec validate --all
--json`, and the whole `CI=1` Playwright gate on shifted ports. On 2026-08-31, at the shipped `['number', 105]`, `FLEXIBLE_FLOOR = 200`, `['depends', 86]`: **the whole `CI=1 E2E_PORT_SHIFT=2600` Playwright gate is green — 259 passed, 0 failed, 1 skipped in 6.7m, exit 0** (the skip is `gantt.spec.ts`'s pre-existing `test.fixme`). `nx run-many -t test lint typecheck build` over the twelve app and lib projects is green (fe-01 63 files / 1992 tests, be-01 1248, gw-01 105, mcp-01 59), `bunx openspec validate --all` says 33 passed / 0 failed, `nx format:check --all` is clean, and CI's own secrets scan, doc caps and migration lint over the whole repo exit 0. `bin/h2puni-gate.sh` exits 127 on this macOS host and was **not** run — the per-project targets above were run instead, and a whole-workspace run is not the sum of per-project runs. `tool-bootstrap:test` is outside the run-many scope because it times out on this host shelling into a caddy/bun host-state matrix (`status null`, 272s per case), pre-existing and unrelated to anything here. This change's own browser share, `e2e/name-markdown.spec.ts`, is **7 passed**. Its row-height case was red for the hours the Name column was 17px narrower, on the same 42px this file records as that check's injected-fault proof; it is green at the shipped widths, and its fixture was shortened so it is no longer a canary for other columns — see task 2's note and `verify.md`.
