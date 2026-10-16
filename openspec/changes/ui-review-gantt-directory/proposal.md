<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

The round-5 UI review (2026-10-16, findings F-101, F-102, F-105, F-107) found four places where the
WBS app draws something a reader cannot read whole, or in a colour no token names:

- **F-101.** A leaf whose steps are unestimated except one short step is drawn in lanes at one
  instant. Each lane wrote its own label in half the bar's height, so two 9px lines with no leading
  between them read as one overprinted line (`010.3.06` over `010.3.06`, `010.3.08 …` over
  `010.3.08 · no estimate`).
- **F-102.** The Directory's `0 d booked, 0 d overlapping` link kept the browser's own link blue
  (`rgb(0, 0, 238)` light, `rgb(158, 158, 255)` dark).
- **F-105.** The keyboard cheat sheet's `Enter in Prio` chip was its only abbreviation.
- **F-107.** At 1024px the project picker clipped every option's meta to `(local-dev …`, losing the
  date that tells twins apart.

## What Changes

- Bars that share a band in lanes write no label of their own. Their **lane stack** writes one
  label across the band, `010.3.06 · 3 steps · 2 no estimate`, or `· no estimate` when nobody
  estimated any of them. It sits on a patch of the page's ground in the page's ink. One estimated
  bar that runs past the placeholders keeps its own words there, on its own fill (F-138). The
  exported SVG writes the same. `gantt-legibility`'s F-012 rule that each label takes its lane is
  amended in place (F-140).
- The Directory's load line uses the app's link classes (`LINK_CLASS`) at regular weight.
- The cheat sheet says `Enter in Priority`, the column's header.
- A project's meta reads date first, `(16 Oct · local-dev)`, in the picker and on its hover card.

## Non-goals

- The picker listbox's width and wrapping (F-086, lane `sheet-picker`). F-107 touches only the
  meta text (`entryMeta`).
- Omitting the owner when it is the reader. The project page is not handed the reader's name.
- Hover cards and the scheduler: a stack's bars keep their own lanes, hit areas and cards.
