## 1. Reproduce and attribute (no fix before this)

- [ ] 1.1 Add an e2e fixture that seeds plans of 50, 500 and 2,000 rows (every fifth name wraps) through the real API.
- [ ] 1.2 Add `scroll-stability.e2e.ts` to the `pixels` job: scripted constant-rate wheel scroll down then up; per-frame samples of renderer first-visible row, panel first-visible row, and `scrollTop` of both faces; a performance trace for long tasks and frame intervals. Record the three sizes on current `main` in `verify.md`. Expect the stability and budget assertions to fail at 2,000 rows; if they do not, stop and report back, because the jitter is then elsewhere (browser, device, dev-mode React).
- [ ] 1.3 Attribute: count `recordHeight` calls, React commits per frame (Profiler), `placeRows` time, anchor writes and scroll-link writes per frame from the same trace. Rank causes 1–4 from `proposal.md` by measured share. Tasks 2–5 run in that order, and any cause measured under 5% of frame time is dropped with its number recorded.

## 2. Height readings: batched, prefix-summed

- [ ] 2.1 Unit: 2,000 rows, 40 rows measured in one frame produce one `setHeights` and one commit. Fails today. Batch `attachRow`/`ResizeObserver` readings into one rAF flush.
- [ ] 2.2 Replace the per-reading `slice().reduce()` with a prefix-sum (Fenwick) index; anchor delta computed from it. Keep the "measured row above the viewport leaves the visible row anchored" proof green; add a negative (drop the delta) with a `Proof:`.

## 3. One layout pass per frame

- [ ] 3.1 Compute `placeRows` once per heights/rowIds change and derive both `rows` and `rowLayout` from it; window by binary search. Unit test on call counts. Keep the "broad Find renders no more than…" budget proof.

## 4. Move both faces together

- [ ] 4.1 When the anchor correction writes the renderer's `scrollTop`, apply the same delta to the Gantt panel in the same frame and mark both as echoes in `plan-scroll-link.ts`. e2e: the panel-matches-renderer scenario. Negative: remove the panel delta; the scenario must fail.

## 5. Window the Gantt panel

- [ ] 5.1 Window panel rows from the renderer's `rowLayout` (same ids, same offsets) with top/bottom spacers. Keep `gantt-panel.test.tsx`'s pairing invariants; add the mounted-row-count scenario.

## 6. Close

- [ ] 6.1 Re-run 1.2 at all three sizes; every spec scenario green; before/after numbers in `verify.md`.
- [ ] 6.2 Gate with `bin/h2puni-gate.sh <sha>`; dev check by Dany on his own large plan.
