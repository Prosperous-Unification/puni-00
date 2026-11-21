## ADDED Requirements

### Requirement: Every row says its status at its left edge

Every row of the table SHALL carry `data-row-status` holding its status, and SHALL draw a
status strip at its left edge, before the drag handle, whether or not the Status column is
shown: no strip for `unknown`, the in-progress colour for `in_progress`, the done colour for
`done`. The strip SHALL be painted with `box-shadow` on the drag cell and SHALL move no
pixel of the layout. A row whose status is `done` SHALL additionally be tinted with the done
colour across every cell, pinned cells included, under the band, the hover, the dependency
light and the drop light rather than in place of them. The two colours SHALL be palette
tokens defined for both themes.

#### Scenario: a done row wears the strip and the tint with its column hidden

- **GIVEN** a plan with the Status column hidden and one leaf whose every step says `done`
- **WHEN** the table is rendered
- **THEN** that row carries `data-row-status="done"`, its drag cell paints the strip, every
  cell of it paints the done tint, and the row above it carries `data-row-status="unknown"`
  with no strip and no tint

#### Scenario: an in-progress row wears the strip and no tint

- **GIVEN** a leaf whose `Dev` says `done` and whose `QA` says nothing
- **WHEN** the table is rendered
- **THEN** the row carries `data-row-status="in_progress"`, its drag cell paints the
  in-progress strip, and no cell of it paints the done tint

#### Scenario: the tint lets the lights through

- **GIVEN** a done row that some hovered Depends on cell waits for
- **WHEN** the row is painted
- **THEN** its cells carry the dependency light's `--cell-bg` and the done tint together, and
  the pinned cells paint the same pair as the unpinned ones

### Requirement: Choosing Done opens the completion prompt before anything is written

Choosing `Done` in the Status cell of a row whose status is not `done` SHALL open the
completion prompt and SHALL send nothing until it is confirmed. The prompt SHALL name the
row, show `Started on` and `Finished on`, offer `Cancel` and `Mark done`, and put focus in
the start field. The start opens on the held fact start, else the forecast start, else the
reader's today. The finish opens on the held fact end, else the earlier of the reader's today
and forecast end when a forecast exists, else the reader's today. Each field SHALL explain
the day it currently holds as recorded, forecast, today or typed. If either field is missing
or is not an `IsoDate`, `Mark done` SHALL be disabled and form submission SHALL be blocked.

Confirming SHALL send one `setStatus` with the actual confirmed finish as `on` and the
actual confirmed start as `factStart`, even if the browser's day differs from the server's
day. The fill only writes empty fact fields. After a successful mark, each held fact date
whose confirmed value differs SHALL follow as its own `patchWorkItem` command, with its own
journal entry. No follow-up patch SHALL be sent after a refused mark. Cancel, Escape or a
click outside SHALL dismiss the prompt with nothing sent and leave status unchanged. After
confirmation or dismissal, focus SHALL return to the Status cell that asked when it still
exists. Choosing `Unknown` SHALL open no prompt.

#### Scenario: today is offered and sent

- **GIVEN** a leaf reading `Unknown` with no held dates or forecast, on a browser whose local
  day is `2026-09-13`
- **WHEN** `Done` is chosen and the prompt confirmed unchanged
- **THEN** exactly one command is sent, `setStatus` with `on: '2026-09-13'` and
  `factStart: '2026-09-13'`, and the row reads `Done`

#### Scenario: another day is typed

- **GIVEN** the same leaf
- **WHEN** `Done` is chosen, the start is changed to `2026-09-08`, the finish is changed to
  `2026-09-10`, and the prompt confirmed
- **THEN** `setStatus` carries `on: '2026-09-10'` and `factStart: '2026-09-08'`, and the Fact
  end cell reads the confirmed finish

#### Scenario: a held fact end is offered, and a change to it follows as a patch

- **GIVEN** a leaf reading `In progress` whose held fact start is `2026-09-08` and whose
  held fact end is `2026-09-10`
- **WHEN** `Done` is chosen, the offered finish changed to `2026-09-11`, and the prompt confirmed
- **THEN** `setStatus` with `on: '2026-09-11'` and `factStart: '2026-09-08'` is sent, then
  `patchWorkItem` with `factEnd: '2026-09-11'` follows as a separate journalled command

#### Scenario: cancelling writes nothing

- **GIVEN** a leaf reading `Unknown`
- **WHEN** `Done` is chosen and the prompt dismissed by Cancel, by Escape, or by a click outside
- **THEN** no command is sent, the row still reads `Unknown`, and focus is back in the Status
  cell

#### Scenario: a parent's prompt speaks for its leaves

- **GIVEN** a parent reading `In progress`
- **WHEN** `Done` is chosen and the prompt confirmed with start `2026-09-08` and finish `2026-09-12`
- **THEN** one `setStatus` for the parent carries `on: '2026-09-12'` and
  `factStart: '2026-09-08'`, and every leaf beneath it with no fact end reads the confirmed finish

### Requirement: The Status column is one glyph, pinned after the number

The Status column SHALL sit after `#` and before Links, SHALL be a member of the pinned
block between them, and SHALL be 28px wide. Its heading SHALL be the `○` glyph with the
accessible name `Status`. Its cell SHALL show `○` for `unknown`, `◐` for `in_progress` and
`✓` for `done`, coloured as the strip is, its accessible name naming the row (`Status of 010`)
and its fact card saying the status in words, with no browser `title`; the picker SHALL keep
offering `Unknown` and `Done` in words. The status itself SHALL be readable off `data-status-value`. The column SHALL stay
hidden by default and SHALL be offered in the Columns control as `Status`, where it renders —
after `Links` (`status-polish` moved it there from after `Deadline`).

#### Scenario: the pinned block holds Status in its place

- **GIVEN** the Status column shown
- **WHEN** the frame is laid out
- **THEN** the pinned columns are `drag`, `number`, `status`, `refs`, `name` in that order, and
  the `refs` and `name` offsets are 28px further right than with Status hidden

#### Scenario: the cell reads as a glyph and says the word

- **GIVEN** a done leaf `010` with the Status column shown
- **WHEN** its Status cell is read
- **THEN** the cell shows `✓`, its fact begins `Status: Done.`, it has no `title`,
  `data-status-value` is `done`, and opening it lists `Unknown` and `Done`

### Requirement: The Status cell's fact names the status, and its card leaves when the list opens

The Status cell's fact SHALL begin with `Status: <word>.` — `Status: Unknown.`, `Status: In
progress.`, `Status: Done.` — before the sentence about the row. When a hinted mark that is a
combobox expands its list, by click or by keyboard, the hint layer SHALL close that mark's open
card; a click that leaves the mark collapsed SHALL leave the card where it was.

#### Scenario: the card says the word the glyph does not

- **GIVEN** a leaf reading unknown with the Status column shown
- **WHEN** its Status cell's fact is read
- **THEN** it begins `Status: Unknown. `, and `Status: Done. ` once the row is done

#### Scenario: opening the list takes the card down

- **GIVEN** the pointer resting on a Status cell with its fact card open
- **WHEN** the cell is clicked and its list opens
- **THEN** the card is gone while the list is on screen, and a click on a control that opens
  nothing had left the card up

## MODIFIED Requirements

### Requirement: The table shows Status, Fact start and Fact end, and marks a done row

The table SHALL offer three columns, `Status`, `Fact start` and `Fact end`, hidden by default.
The Columns control SHALL offer `Status` after `Links` and `Fact start` and `Fact end` after
`Deadline`, in that order.
The two fact cells SHALL be date cells with the deadline cell's rest and edit states.
On a parent or leaf, the Status cell SHALL show the status glyph with its word in the fact card.
Its picker SHALL offer the eligible choices in the order defined by “The row menu and Status
cell offer every status the row does not read”. Choosing Done SHALL wait for confirmation of
the completion prompt before sending the status change.

A done row SHALL carry `data-row-done`. Its number SHALL read struck through. DONE status
SHALL add no strike or muted ink to its name, which retains its own Markdown formatting on
every stripe and under every row light.

#### Scenario: the Columns control offers the three in order

- **GIVEN** the Columns control open on a two-step plan
- **WHEN** its entries are read
- **THEN** `Status` follows `Links`, `Fact start` and `Fact end` follow `Deadline` in that order,
  and none of the three is on screen until chosen

#### Scenario: choosing Done marks the row and fills the fact end

- **GIVEN** a leaf reading `Unknown` with the three columns shown, no held fact end, and no
  forecast end earlier than the reader's local day
- **WHEN** `Done` is chosen in its Status cell and the completion prompt confirmed unchanged
- **THEN** the row reads `Done`, its number is struck through, its name retains its own Markdown
  and ink without a DONE-applied strike, and its Fact end cell reads today

#### Scenario: a partly done row reads In progress and can still be finished

- **GIVEN** a leaf whose `Dev` says `done` and whose `QA` says nothing
- **WHEN** its Status cell is read and then opened
- **THEN** it shows `◐` with a fact beginning `Status: In progress.`, and its picker offers
  `Done` among the eligible choices and omits its current `In progress`
