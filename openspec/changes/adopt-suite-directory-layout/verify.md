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

## Slice 3 — every reference follows (author's rehearsal, 2026-09-25)

Baselines on the slice 2 commit were red by design: layout 22·1, workspace-projects 15·2, sync 50·2,
inventory 3·1, targets 17·2, legacy pin 0·1, `twilight-burokrat:typecheck` TS6053. The retired-root
check went red first (1·2, 115 current lines). `s3-edit` matched every count; Prettier reformatted 12
of the 50 touched files. Green: devsync focused files, both typechecks and lints, the build, thirteen
Twilight Burokrat files and two pilot filters all exit 0; the legacy pin moved to `c0a77f33…` at 308.
Faults g1–g7 with their clause-off twins, e1–e3 and r1–r5 behaved as section 8.2 records
(`fault-*.log`). Pending planner verification: whole `tool-devsync:test`, whole
`twilight-burokrat:test`, the pilot suite, `check-indexes committed`, `test:package` and the tarball
listing, the Nx graph, the host gate.
