# Verification

Entries are appended per slice, newest last. Evidence references are basenames in that
attempt's evidence directory.

## Slice 1 — the suite level (author's rehearsal r2, 2026-09-25)

Rehearsed on `rehearse/suite-move-r2` from main `e93a564a0` with its own frozen install. Baselines:
layout 19·0, policies 15·0, cache 4·0, legacy 1·0, OpenSpec 115. Contract: OpenSpec 116. Red:
layout 20·3, policies 1·2, cache 2·2. Green: layout 23·0, policies 18·0, cache 4·0; legacy pin red on
`551e2a7d…` 308, then 1·0. Faults n1–n6, p1–p3 and c1 each failed its named case (`fault-*.log`).
Pending planner verification: whole `tool-devsync:test`, `check-indexes committed`.
