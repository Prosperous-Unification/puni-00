## 1. Lane stacks (F-101)

- [x] 1.1 Failing Vitest: a laned row writes one stack label over its band; `stackText` words and fitting
- [x] 1.2 Failing e2e on a seeded plan: the number once per row, no two labels' glyphs touching
- [x] 1.3 `labelBandOf`, `laneStacksOf`, `stackText` and the stack label, live and in the SVG export
- [x] 1.4 Stack labels joined to the contrast and overlap e2e checks
- [x] 1.5 Failing Vitest and e2e for a ten-day estimated bar laned with a placeholder (F-138), then `LaneStack.spill` and `barLabelPlaceOf`, live and in the SVG export
- [x] 1.6 Pin the F-101 e2e counts (F-142)
- [x] 1.7 Amend `gantt-legibility`'s per-lane label rule, scenario, tasks and verify in place (F-140)

## 2. Directory load line (F-102)

- [x] 2.1 Failing e2e in light and dark: the line's colour is `--foreground`, at 4.5:1 or better
- [x] 2.2 `LINK_CLASS` at regular weight on the load link

## 3. Cheat sheet (F-105)

- [x] 3.1 Failing Vitest: a key chip's column is a `COLUMN_LABELS` header
- [x] 3.2 `Enter in Priority`

## 4. Picker meta (F-107)

- [x] 4.1 Failing e2e at 1024: every option's date is inside the meta's clipped edge
- [x] 4.2 `entryMeta` date first; the unit tests that spell the meta move with it
