# Verification

Entries are appended per slice, newest last. Evidence references are basenames in that
attempt's evidence directory.

## Slice 1 — the suite level (author's rehearsal, 2026-09-25)

Rehearsed by the packet author on `rehearse/suite-move-r1` from `ad0451da9`. Baselines: layout 19·0,
policies 15·0, cache 4·0, OpenSpec 114·114·0. Contract: OpenSpec 115·115·0. Red: layout 20·3,
policies 0·2, cache 2·2. Green: layout 23·0, policies 17·0, cache 4·0, legacy pin red on
`551e2a7d…` 308 then green. Faults n1–n6, p1, p2, c1 each failed its named case
(`fault-*.log`). Pending planner verification: whole `tool-devsync:test`, `check-indexes committed`.

## Slice 2 — the move (author's rehearsal, 2026-09-25)

`s2-move` moved 127 files; `s2-check` found every file byte-identical to its source but
`cli/tsconfig.json`, whose `extends` line alone changed (`s2-tsconfig.diff`). Pending planner
verification: the commit's rename summary; whole `tool-devsync:test` is red at this commit by
design (slice 3 repairs it).
