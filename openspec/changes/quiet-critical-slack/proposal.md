<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Dany, on a real screen, 2026-08-31: **a critical row's slack must stop being
red.** Grey, or at least much quieter.

The Slack column prints a number for every row that has one and the word
`critical` for a row that has none. That word is set as a tag in
`--destructive` ink on a `--destructive`-tinted ground — the same red the grid
uses for an armed delete and an invalid cell. Being on the critical path is not
an error, it is the commonest fact in any plan of dependent work: in a chain of
three rows, three of them are critical. A column of red tags reads as a column
of faults, and the two things the palette's red actually means — this will
destroy something, this value was refused — lose the only ink that said them.

## What Changes

- The critical tag keeps its shape (a small, bold, rounded tag inside a 56px
  cell) and loses its hue: neutral ink on a neutral ground, drawn from the same
  `--muted-foreground` the ordinary slack figures beside it are printed in.
- It stays a tag rather than becoming a plain word, because it is still not a
  number and must not be read down the column as one.

## Non-goals

- The Gantt's `data-critical` on a **bar** is not touched. Dany asked about the
  slack cell, and a bar in a chart of a hundred bars is the one place a hue
  earns its keep.
- No change to which rows are critical, to the word, or to the export.
- The mobile card's `data-card-slack[data-critical]` carries no paint today and
  gains none.

## Constraints

- jsdom computes no colours, so the oracle is Chromium in both palettes
  (R5 #14/#15/#17).
- The tag has to stay legible where it now sits: quieter is not fainter than
  the column it stands in.
