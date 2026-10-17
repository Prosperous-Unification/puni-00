# Tasks

1. [x] `buttonVariants` merges for every caller; `outline` edge on `--control-edge` at 3:1 (F-124) — `e2e/control-edge.spec.ts`.
2. [x] One signed-out anchor for every card (F-125, D11) — `e2e/sign-in.spec.ts`; `e2e/signed-out-column.ts` holds every card to the anchor.
3. [x] Full carries the chart's horizontal offset both ways (F-126) — `gantt-panel.test.tsx`, `e2e/scroll-stability.e2e.ts`.
4. [x] The edge-zone drop line starts at the landing depth (F-128) — `e2e/drop-cue.spec.ts`; `e2e/shell-faults.spec.ts` F-076 reads the line.
5. [x] No hint wait or card after a drop until the pointer moves (F-129) — `e2e/drop-cue.spec.ts`.
