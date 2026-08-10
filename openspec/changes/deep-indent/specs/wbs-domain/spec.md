## ADDED Requirements

### Requirement: A row's depth is visible past the Number column's cap

A row's indent SHALL resolve as two named quantities from one step size: the
**number indent**, capped at a stated deepest level so the Number column's
declared width can never be outgrown, and the **hierarchy indent**, one step
per level with no cap. Every surface that draws the outline SHALL state which
of the two it takes, on the symbol that takes it.

In the table, the Number cell SHALL keep the capped indent and the Name cell
SHALL additionally carry the difference between the two — zero until the cap,
one step per level past it — so that the outline a reader's eye adds up across
the two cells is the hierarchy indent at every depth. No single element's edge
moves at every level: the Number cell's share is flat past the cap and the
Name cell's share is zero below it, so the quantity that is measured SHALL be
the **sum** of the two shares, strictly increasing to at least depth 6, in a
browser.

The Gantt panel's label rail SHALL take the hierarchy indent whole: its labels
are not width-capped by the Number column.

The mobile cards SHALL take a stated cap of their own, deeper than the Number
column's — `min(depth, 6)` at the cards' step — because a 390px card cannot
spend an unbounded margin. The cap is recorded on the symbol, not discovered
at a viewport.

The Number column's display envelope, width and clipping bargain are
untouched: its existing browser proof SHALL stay green, unchanged.

#### Scenario: two levels past the cap, in the table

- **WHEN** a plan is nested six levels deep and drawn in a browser
- **THEN** the sum of the Number cell's indent and the Name box's offset from
  its own cell's edge is strictly greater at every level than at the level
  above, depth 5 and 6 included

#### Scenario: the Number column never outgrows its width

- **WHEN** a row sits deeper than the stated deepest indent level
- **THEN** its Number cell's indent equals the deepest level's, flat, and the
  envelope measurement of the Number column is unchanged

#### Scenario: the label rail steps at every level

- **WHEN** rows at depth 4, 5 and 6 are drawn on the Gantt panel's label rail
- **THEN** each label's indent is one step deeper than the level above —
  uncapped, where the capped indent drew all three flush

#### Scenario: a card stops at the cards' own cap

- **WHEN** rows at depth 5, 6 and 7 are drawn as mobile cards
- **THEN** the depth-6 card is one step deeper than the depth-5 card, and the
  depth-7 card draws at the depth-6 margin
