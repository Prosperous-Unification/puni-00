## ADDED Requirements

### Requirement: The Depends on cell rests on one line

At rest — while its picker is closed — the Depends on cell SHALL be one line
tall: the chips and the box SHALL sit in an inner strip that does not wrap
(`nowrap`) and clips what overruns it (`overflow: hidden`), so a row waiting
on seven others is the height of a row waiting on none. The wrapper around
that strip SHALL remain the positioned ancestor that decides where the
dependency listbox and the hover card open, and both popovers SHALL stay
outside the strip — the strip is a clipper, and a popover inside it could
never escape. The `<td>`'s popover clip exemption is untouched.

The truncation cue SHALL be a CSS edge fade on the strip, applied at rest —
whenever the picker is closed, whether or not anything is clipped. The rest
condition is the picker's state and SHALL NOT be a measurement: "fade only
when clipped" needs a `scrollWidth` read, and that is the door this
requirement keeps shut. The fade SHALL be absent while the picker owns the
cell: the strip wraps then, nothing is clipped, and the box spans the full
width, so a fade there would dim the focus ring, the caret and the typed
text. One cosmetic cost at rest is known and accepted pending eyes on dev:
the box claims `width: 100%`, so a short row's placeholder tail sits under
the fade. The fade assumes a physical right edge, and the strip SHALL pin
`direction: ltr` to keep that true (the app is LTR-only today; a
logical-direction mask is not portable gradient syntax). There SHALL be no
`+N` marker and no measurement: nothing counts the hidden chips.

While the picker owns the cell, the strip SHALL wrap as the cell always did,
so nothing about typing, the open list, or the keyboard changes.

At rest the chips' remove buttons SHALL be out of the tab order
(`tabIndex -1`): a clipped chip is a native button a sequential Tab or a
reader's focus walk would otherwise reach, invisible, and the browser may
scroll the clipping strip to show what it focused — shifting the rested
layout. With the picker open — the strip wrapped, every chip on screen —
they SHALL be focusable again. The keyboard path to removal is unchanged:
Tab enters the cell at the box, the picker opens on the focus, and the chips
are visible and focusable.

The full list SHALL stay readable where it already lives: the `DependsCard`
hover and the box's sr-only `Waiting for …` description.

This supersedes two recorded requirements, by name:

1. the deps wrapper's `whiteSpace: 'normal'` rationale recorded in
   `wbs-table.tsx` — "An uneven row height is a cost worth paying; a
   dependency nobody can see is not" — reversed: the row height is now the
   cost not worth paying, because the card and the description carry the list;
2. `table-geometry-and-tab-order`'s "The dependency cell's wrapper wraps its
   chips onto a second line rather than clipping them" (task 2.1, archived at
   `openspec/changes/archive/2026-08-10-table-geometry-and-tab-order/`) —
   the chips are now clipped by the strip, and the containment that
   requirement was really after is strengthened by it: at rest nothing in the
   cell paints outside the cell.

#### Scenario: seven chips, one line

- **WHEN** a row waits for seven others and the table is at rest in a browser
- **THEN** that row is the height of a row that waits for nothing

#### Scenario: a clipped chip is invisible at rest

- **WHEN** the chips overrun the strip at rest
- **THEN** the last chip — laid out with real area — lies past the strip's
  visible edge, and a hit test at its centre answers something other than the
  chip, while the same probe on an unclipped chip answers the chip itself

#### Scenario: the fade belongs to rest

- **WHEN** the cell rests, with or without anything clipped
- **THEN** the edge fade is declared on the strip, and nothing measures
  whether it was needed

#### Scenario: the fade leaves with the picker

- **WHEN** the picker owns the cell
- **THEN** no fade is declared on the strip — the strip has wrapped, and the
  box's focus ring, caret and typed text are undimmed

#### Scenario: a clipped chip cannot take the focus

- **WHEN** the cell rests and Tab or a reader's focus walk passes it
- **THEN** no chip remove button takes the focus, and with the picker open —
  every chip on screen — the same buttons are focusable again

#### Scenario: the popovers stay outside the clipper

- **WHEN** the picker is open, or the card is shown
- **THEN** the listbox and the card are children of the positioned wrapper,
  not of the strip, and the listbox still opens over the rows below

#### Scenario: the full list is still reachable

- **WHEN** a pointer rests on a rested cell with chips, or a reader reaches
  the box with no pointer
- **THEN** the card names every dependency, and the box's description says
  `Waiting for …` with every one of them
