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

**It SHALL cost the row nothing open either, on a cell with no chips.** The
strip wraps while the picker owns the cell so the chips can reflow; a cell
with no chips has nothing to reflow, and it SHALL NOT wrap there. The box
claims `width: 100%`, so under a wrap its hypothetical size is the whole
strip and it can share a flex line with nothing at all — the affordance
beside it pushed it onto a second line, and an empty cell grew by a line the
moment somebody clicked into it, taking the list they had just opened down
the page with it. Measured in a browser against the deployed change: 26px at
rest, 44.98px open, the listbox 21px lower. The affordance SHALL NOT be
removed while the picker is open to buy that height back: always visible is
what it is for, and the cell somebody is typing into is where "another one"
has most to say. The crowded cell's open state is unchanged — chips still
wrap onto as many lines as they need. Row height is layout, so this SHALL be
proven in a browser and not in jsdom.

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
for that box ambiguous. **It SHALL carry no `title` either.** A tooltip is a
second name in everything but the accessibility tree: a control whose
tooltip reads one thing and whose announced name reads another is under two
names again, by the attribute that was meant to explain the first.

Its hover SHALL NOT be the chips' hover. A chip goes `--destructive` under
the pointer because the ✕ is saying what the click will do; an "add" that
turned red would be promising a removal.

**Its hover SHALL be darker than the row it sits on in the light palette and
lighter in the dark one** — the row's own ink, at the row's own dose, mixed
into whatever surface that row is currently painted, never an absolute
colour. An absolute one cannot answer for two themes and did not: the paint
was `--accent`, `oklch(0.968)`, against a hovered row's `oklch(0.939)`, so
on a light page the affordance came out lighter than the row and read as a
hole punched through it to the page behind — an inverted affordance, exactly
where the pointer says something is about to happen. On a dependency-lit row
it was four thousandths from the row's own colour and all but vanished. This
is the per-surface rule `--card-dep-lit` established, one layer further in:
the surface here is not the page but the row, and the row is already a mix.
Direction against the surface is the claim, so it SHALL be proven in both
palettes — light alone cannot tell "darker than the row" from "an absolute
colour that happens to be darker here".

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

#### Scenario: an empty cell is no taller open than shut

- **WHEN** a Depends on cell that waits for nothing is clicked into, by the
  cell or by the add button, and its picker opens
- **THEN** the row is the height it rested at, the box is still on the add
  button's own line rather than under it, the add button is still there, and
  the list hangs at the same place whichever of the two was clicked

#### Scenario: the affordance darkens into the row under the pointer

- **WHEN** the add button is hovered on a row that is itself under the
  pointer, in the light palette and then in the dark one
- **THEN** its background differs from the row's and moves the way that
  palette's ink runs — darker than the row on a light page, lighter on a
  dark one — rather than toward the page behind the row

#### Scenario: the keyboard walks past it

- **WHEN** sequential Tab reaches the cell, at rest or with the picker open
- **THEN** the add button takes no focus and the box is the stop, while the
  chips keep the tab order `deps-single-line` gave them
