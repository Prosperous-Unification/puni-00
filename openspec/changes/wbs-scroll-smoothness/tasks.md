## 0. Before implementation

- [x] 0.1 Add **First visible row** to `CONTEXT.md`.

## 1. Reproduce and attribute (blocking; lands and is reviewed alone)

- [ ] 1.1 e2e fixture seeding 50, 500 and 2,000-row plans through the real API, every fifth name wrapping.
- [ ] 1.2 `scroll-stability.e2e.ts` in the `pixels` job: 1280×800, equal wheel steps for a fixed duration down then up (same duration at every size), per-frame first visible row of both faces from laid-out rects, and assertions that wrapped rows measure two lines. The stability and pairing assertions are expected to fail on current `main` at 2,000 rows. If they pass at every size, stop and report back to Dany with the recording: the jitter is elsewhere (browser, device, dev-mode React).
- [ ] 1.3 Attribution from five repeated traces per size: `recordHeight` calls, React commits per frame (Profiler), `placeRows` time, anchor writes and scroll-link writes per frame, Gantt layout/paint share. Numbers go in `verify.md`. Rewrite section 2 from them, dropping any cause below 5% of frame time with its number, and send the rewritten tasks through one plan review before coding.

## 2. Fixes (provisional order; replaced by 1.3)

- [ ] 2.1 Batch height readings into one rAF flush; prefix-sum (Fenwick) offsets. Deterministic test: 40 readings → one commit, no full scan (spied). Keep the anchored-row proof; negative: per-reading commit restored, the commit-count test fails.
- [ ] 2.2 One `placeRows` per heights/rowIds change, windowing by binary search; call-count test; keep the render-budget proof.
- [ ] 2.3 After a renderer correction, realign the panel by the first visible row's id plus its within-row fraction, not by the renderer's pixel delta. Negative: apply the raw delta to the panel; the pairing scenario must fail.
- [ ] 2.4 If 1.3 attributes the Gantt panel: file a separate `gantt-panel-windowing` change covering global indices, spacers, hidden labels, pinned focus/open rows and crossing links. No Gantt windowing in this change.

## 3. Close

- [ ] 3.1 Re-run 1.2 and 1.3 at all three sizes; stability and pairing green; before/after numbers in `verify.md`.
- [ ] 3.2 Gate with `bin/h2puni-gate.sh <sha>`; Dany checks his own large plan on dev.
