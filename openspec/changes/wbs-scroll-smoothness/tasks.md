## 0. Before implementation

- [x] 0.1 Add **First visible row** to `CONTEXT.md`.

## 1. Reproduce and attribute (blocking; lands and is reviewed alone)

- [x] 1.1 e2e fixture seeding 50, 500 and 2,000-row plans through the real API, every fifth name wrapping.
- [x] 1.2 `scroll-stability.e2e.ts` in the `pixels` job: 1280×800, equal wheel steps for a fixed duration down then up (same duration at every size), per-frame first visible row of both faces from laid-out rects, and assertions that wrapped rows measure two lines. The stability and pairing assertions are expected to fail on current `main` at 2,000 rows. If they pass at every size, stop and report back to Dany with the recording: the jitter is elsewhere (browser, device, dev-mode React).
- [ ] 1.3 Attribution from five repeated traces per size: `recordHeight` calls, React commits per frame (Profiler), `placeRows` time, anchor writes and scroll-link writes per frame, Gantt layout/paint share. Numbers go in `verify.md`. Rewrite section 2 from them, dropping any cause below 5% of frame time with its number, and send the rewritten tasks through one plan review before coding.

## 2. Fixes (rewritten from the section 1 traces; review pending)

- [ ] 2.1 Stop publishing raw `scrollTop`/`scrollLeft` as React state. Publish only a changed row/column window, coalesced once per animation frame, so compositor motion inside the current window causes no commit. Deterministic Profiler test: 120 wheel inputs within one row window cause at most two commits; restoring raw-offset state makes it fail. Preserve the anchored-row proof.
- [ ] 2.2 Isolate the complete Gantt subtree from table-window commits. A Profiler test at 500 rows must keep Gantt commits at zero while the table window moves; removing the memoized boundary must restore the measured commit fan-out.
- [ ] 2.3 Realign the follower by first-visible-row id plus within-row fraction in the same animation frame as the driver's scroll event. The 50-row clamped-end case must expose zero mismatched sampled frames; applying the raw pixel delta must restore the pairing failure.
- [ ] 2.4 Keep the current linear `placeRows`, immediate height readings, and complete Gantt rendering in this change: each measured below 5% of 2,000-row task time. Reconsider them only with new traces above the cutoff.

## 3. Close

- [ ] 3.1 Re-run 1.2 and 1.3 at all three sizes; stability and pairing green; before/after numbers in `verify.md`.
- [ ] 3.2 Gate with `bin/h2puni-gate.sh <sha>`; Dany checks his own large plan on dev.
