## ADDED Requirements

### Requirement: The Depends on cell offers a visible way to add

Every Depends on cell SHALL carry a small always-visible button that starts
the add flow. "Always visible" is the requirement and not a paraphrase of
one: it SHALL NOT be revealed by a row hover, a cell hover or a focus the
way the ⋯ actions button and the drag handle are, because what it exists to
fix is that nothing in a rested cell says a dependency can be added at all.
A cell that rests showing `010 ✕ 030 ✕` shows two removals and no addition,
and the control that starts one is an unlabelled remainder of `<input>`
behind the chips — as narrow as the crowd leaves it since the cell was
clamped to one line.

The button SHALL be the **first** item on the strip the chips and the box
share, before every chip. The strip clips its right edge and fades the last
14px of it (`deps-single-line`), so a trailing affordance would be cut out
of sight in exactly the crowded cell that needs it most, and the box's
`width: 100%` claim would have pushed it past that edge on an empty cell
too. The head of a clipping `nowrap` line is the one place on it that is
never cut. This is a layout fact and SHALL be proven in a browser against a
cell whose chips really are being clipped, never in jsdom, which lays
nothing out.

It SHALL cost the row nothing at rest: no taller than a chip, which is what
sets the strip's line box and so the 28px row. It SHALL NOT shrink when the
line is crowded — a squeezed cell clips chips, and the affordance is what
the clipping is for.

Pressing it SHALL focus the cell's own dependency box, and the picker SHALL
open from that focus — the box's existing behaviour, reached without
knowing the box is there. There SHALL be no second path into the picker:
one path to the box is the whole of what this adds.

The press SHALL be cancelled and the click SHALL NOT be. Without cancelling
the `mousedown` the button takes the focus, and a button taking the focus
from this cell's own box is a blur — which closes the picker and drops what
was typed into it, so a search half-typed before reaching for the affordance
beside it would be eaten by the control that means "search". The action
SHALL sit on the click rather than on the press for two reasons: a
`mousedown` handler that re-renders before the browser performs its default
action is a fault this repository has shipped three times (R5 #12, #14,
#15), and an assistive technology's activation dispatches a click with no
`mousedown` at all.

The button SHALL NOT be in the sequential tab order, at rest or with the
picker open — where the chips' remove buttons flip between the two states.
The keyboard already has this exact path and reaches it first: Tab into the
cell lands on the box, and the box's focus is what opens the picker. A stop
here would add one Tab per row to every walk through the plan and offer
nothing at the end of it that the next Tab does not already do. It stays a
`<button>` carrying its own accessible name, so a reader's element walk
still finds it and can still activate it; what it does not do is stand in
the sequential order. This is the same conclusion `deps-single-line` reached
about the chips at rest, from a different premise — there, a focus nobody
can see; here, a duplicate of the stop beside it.

Its accessible name SHALL NOT be the box's. Two controls in one cell
answering to `Add a dependency to 020` is a reader told the same thing twice
with no way to tell which is which, and it would make every existing query
for that box ambiguous.

Its hover SHALL NOT be the chips' hover. A chip goes `--destructive` under
the pointer because the ✕ is saying what the click will do; an "add" that
turned red would be promising a removal.

#### Scenario: the affordance is on the cell at rest

- **WHEN** a Depends on cell rests, with chips or without
- **THEN** a small button stands at the head of its strip, before every
  chip, under its own accessible name, and nothing about a hover or a focus
  decides whether it is there

#### Scenario: the crowded cell keeps it

- **WHEN** a row waits on seven others in a browser, so the strip is
  clipping what overruns it
- **THEN** the last chip answers no hit test at its own centre and the add
  button answers one at its own, laid out with real area and no taller than
  a chip

#### Scenario: the press starts the flow

- **WHEN** the button is clicked
- **THEN** the cell's dependency box holds the focus and the picker is open
  on it, ready to be typed into

#### Scenario: the press leaves a half-typed search alone

- **WHEN** a search has been typed into the box and the button is pressed
- **THEN** the press is cancelled, the box keeps the focus and the typed
  text, and the picker stays open

#### Scenario: the keyboard walks past it

- **WHEN** sequential Tab reaches the cell, at rest or with the picker open
- **THEN** the add button takes no focus and the box is the stop, while the
  chips keep the tab order `deps-single-line` gave them
