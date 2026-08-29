<!--
Ordered TDD slices. Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 0. Ordering

Independent of the wave-1 chain. It touches `POPOVER_COLUMNS`, `CELL` and
`reference-set-field.tsx` only, and no queued change edits any of the three.

The browser gate runs on shifted ports (`bun run e2e:beside-dev`), which is new
in this change's first commit — without it no negative here can be watched
while a dev server holds 3100/3200/4200.

## 1. The gate can run beside a dev server

- [x] 1.1 `E2E_PORT_SHIFT` moves be-01, gw-01 and fe-01 together, rewriting the URLs they hold about each other; `vite.config.ts` reads `PORT` and refuses a busy one (`strictPort`) — proof: `bun run e2e:beside-dev apps/fe-01/e2e/reference-cells.spec.ts` started be-01 on 3600, gw-01 on 3700, Vite on 4700 and passed 3/3 while `bun run dev` held 3100/3200/4200. An unusable shift throws rather than reading as zero.

## 2. Every picker column is exempt from the clip

- [x] 2.1 `tag` and `service` join `POPOVER_COLUMNS` — test: `wbs-table.test.tsx` `every column that opens a picker is exempt from the cell clip`, asserting the `<td>` style for all three of `team`, `tag`, `service`; negative: `tag` taken back out, watched failing.
- [x] 2.2 Chromium: open the Tags picker, assert the list's full height is drawn and `td.scrollTop === 0` and the strip's top is inside the row's band — negative: the exemption removed, watched failing on the scroll offset. **jsdom computes no layout and cannot be this test's oracle** (`AGENTS.md`, R5 #14/#15): the fault is a browser scrolling a clipped box.

## 3. A clipped cell cannot be scrolled

- [x] 3.1 `CELL` clips with `overflow: clip` — test: `table-frame.test.ts` `a clipped cell is not a scroll container`; negative: `hidden` restored, watched failing.
- [x] 3.2 Chromium: `the opened cell has been scrolled, so its contents left its row` asserts `scrollTop === 0` on both the crowded cell and the cell whose list is open. The two guards are asserted separately in the same run — `'tag'` out of `POPOVER_COLUMNS` fails the strip's position, and only with `CELL` **also** back to `hidden` does the scroll assertion fail, at `Expected: 0 / Received: 22`.

## 4. Editing opens a panel, not a taller row

- [x] 4.1 `reference-set-field.tsx`: an anchor span of the resting line's height holds the strip; while editing the strip is `position: absolute` with the popover's paint — test: `reference-set-field.test.tsx` `leaves the flow while it is edited`, `keeps the add button first in both states`; negative: the absolute positioning removed, watched failing.
- [x] 4.2 Chromium: a row with three tags measured at rest and with its cell open — the same height, and every chip's ✕ hit-testable — negative: the panel put back in flow, watched failing on the height.

## 5. The gate

- [ ] 5.1 `bin/h2puni-gate.sh`, `openspec validate --all --json`, and the **whole** `CI=1 E2E_PORT_SHIFT=500` Playwright gate. A change that edits `CELL` edits every cell in the table, so a filtered run proves nothing (`AGENTS.md`, `linked-row-hover`).
