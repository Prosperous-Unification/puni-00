## 0. Before implementation

- [x] 0.1 Add **First visible row** to `CONTEXT.md`.

## 1. Reproduce and attribute (blocking; lands and is reviewed alone)

- [x] 1.1 e2e fixture seeding 50, 500 and 2,000-row plans through the real API, every fifth name wrapping.
- [x] 1.2 `scroll-stability.e2e.ts` in the `pixels` job: 1280×800, equal wheel steps for a fixed duration down then up (same duration at every size), per-frame first visible row of both faces from laid-out rects, and assertions that wrapped rows measure two lines. The stability and pairing assertions are expected to fail on current `main` at 2,000 rows. If they pass at every size, stop and report back to Dany with the recording: the jitter is elsewhere (browser, device, dev-mode React).
- [ ] 1.3 Attribution from five repeated traces per size: `recordHeight` calls, React commits per frame (Profiler), `placeRows` time, anchor writes and scroll-link writes per frame, Gantt layout/paint share. Numbers go in `verify.md`. Rewrite section 2 from them, dropping any cause below 5% of frame time with its number, and send the rewritten tasks through one plan review before coding.
- [ ] 1.4 Add a Gantt-scoped Profiler counter and repeat the 500-row trace so table commits and Gantt commits/time are separate. Record the scoped share in `verify.md`; only then keep or drop Gantt isolation/windowing. The completed Sol and Gemini plan reviews block implementation until this evidence is folded.

## 2. Fixes (rewritten from the section 1 traces; scoped Gantt attribution pending)

- [ ] 2.1 Stop publishing raw `scrollTop`/`scrollLeft` as React state. Publish only changed row/column windows, coalesced once per animation frame, so compositor motion inside the mounted windows causes no commit. A controlled 120-input Profiler test must flush each frame and name the expected initial/window commits; restoring raw-offset state must restore the fan-out. Positive controls must cross a row boundary, cross a column boundary, and resize the frame while preserving the anchored-row proof.
- [ ] 2.2 Conditional on 1.4: if Gantt commits meet the 5% cutoff, isolate the complete subtree from table-window commits with a dedicated Profiler proof and stable props or window state localized below the panel. Removing the boundary must restore the measured fan-out, while changing a real chart input must still commit and redraw it. If below cutoff, record the number and drop this task.
- [ ] 2.3 Give the table and Gantt matching reachable terminal row/fraction positions despite the table frame's 13rem picker allowance. A deterministic 50-row test must drive each face in both directions through both clamped ends without driver rollback and expose zero mismatched samples; removing the matched terminal extent must restore the measured divergence.
- [ ] 2.4 Keep the current linear `placeRows` and immediate height readings: each measured below 5% of 2,000-row task time. Reconsider them only with new traces above the cutoff. Decide complete Gantt rendering only from 1.4.

## 3. Close

- [ ] 3.1 Re-run 1.2 and 1.3 at all three sizes; stability and pairing green; before/after numbers in `verify.md`.
- [ ] 3.2 Gate with `bin/h2puni-gate.sh <sha>`; Dany checks his own large plan on dev.
