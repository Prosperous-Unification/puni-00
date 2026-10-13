## 1. Labels (F-012, F-037)

- [x] 1.1 Failing component test: one label per bar, inside its own lane, none overlapping; placeholder reads `no estimate`
- [x] 1.2 `labelLaneOf` and the placeholder words; browser overlap check

## 2. Contrast (F-038)

- [x] 2.1 Failing palette unit test (5:1) and browser contrast spec (4.5:1, light and dark)
- [x] 2.2 Palette lightness, stronger-ink `inkOn`, opaque done bars

## 3. Axis and fill (F-023, F-026)

- [x] 3.1 Failing tests: month names at Weeks/Months; calendar to the panel edge; 4px floor
- [x] 3.2 `axisMonthWords`, month boundaries, filled horizon, `MIN_MARK_PX` at every rung

## 4. Strip (F-013)

- [x] 4.1 Failing browser test: an off toggle is neither struck nor dashed, and pressed differs from off
- [x] 4.2 Plain off state and filled pressed state at the strip's existing metrics
- [ ] 4.3 The toolbar's 32px size for the strip: open decision (scroll-stability and marker-rule gates)
