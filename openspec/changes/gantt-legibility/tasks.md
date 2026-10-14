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

## 5. Full screen fills its width (F-062)

- [x] 5.1 Failing browser test: full screen at Days, Weeks and Months, 1440 and 1024, the last axis column within one column and the pad of the edge, no sideways scroll, and the panel filled again after Escape
- [x] 5.2 The measuring observers follow the scroll box into and out of the overlay; a month name with no room before the axis ends is not drawn
