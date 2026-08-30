## MODIFIED Requirements

### Requirement: A deep row's number reads as its own number

A row whose number has four dotted segments SHALL show that number **whole**
in the Number column, and its child — five segments — SHALL show strictly
more of its own number than the whole of its parent's. **The same holds one
level deeper: a row with five dotted segments SHALL show that number whole,
and its child — six segments — SHALL show strictly more of its own number
than the whole of its parent's.** Whatever the column clips, what it still
draws SHALL tell two such rows apart without a hover, and it SHALL tell them
apart by the segments the deeper row adds rather than by where two clips
happened to land.

The six-segment number itself is NOT undertaken to be whole: it loses glyphs
to the clip and carries them in the `title`, which is the bargain the
column's declared width makes at every depth past its envelope. **Past six
segments this requirement does NOT hold** — a seven-segment row and its
six-segment parent MAY read as the same number, because a work item number
has no bound on how many segments it grows past a frozen anchor, and a
fixed-width column always has a next depth that overruns it.

The whole number SHALL still be carried for a hover at every depth. The
Number column SHALL keep the declared width it has: the reclaimed indent
steps SHALL be carried by the Name cell instead, so that the outline a reader
adds up across the two cells is what it was at every depth.

#### Scenario: a row and its child at depth 4

- **GIVEN** a plan with rows numbered `030.1.1.1` and `030.1.1.1.1`
- **WHEN** their Number cells are read
- **THEN** the first shows `030.1.1.1` whole, the second shows more than that of its own number, and each carries its whole number for a hover

#### Scenario: a row and its child at depth 5

- **GIVEN** a plan with rows numbered `030.1.1.1.1` and `030.1.1.1.1.1`
- **WHEN** their Number cells are read
- **THEN** the first shows `030.1.1.1.1` whole, the second shows more than that of its own number, and each carries its whole number for a hover

#### Scenario: the guarantee does not extend to depth 6 and 7

- **GIVEN** a plan with rows numbered `030.1.1.1.1.1` and `030.1.1.1.1.1.1`
- **WHEN** their Number cells are read
- **THEN** they MAY draw the same visible prefix, and this is not a defect this
  requirement covers

#### Scenario: the outline across the two cells

- **GIVEN** a row deeper than the Number column's indent cap
- **WHEN** its Number indent and its Name indent are added
- **THEN** the sum is one step greater than the same sum for its parent
