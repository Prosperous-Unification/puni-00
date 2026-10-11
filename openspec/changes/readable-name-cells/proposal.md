## Why

In the table, the notes preview marker can cover the end of a work item's title. Completed
items also strike through the whole title, making longer names harder to read. Both effects
obscure the text people scan to find work in a plan.

## What Changes

- A work item with notes keeps its title clear of the notes marker, both while reading the
  rendered name and while editing its source text.
- A completed work item strikes through its number only. DONE status adds no strike or muted ink
  to its title; the title retains its own Markdown formatting.

## Non-Goals

- No change to how the notes preview opens, where its card appears, or what it contains.
- No change to work item status, numbering, or saved names and notes.

## Constraints

- The Name cell has separate rendered markdown and source-text faces; their text must occupy
  the same horizontal space when a row has notes.
- The notes marker remains at the cell's right edge and remains the preview trigger.

## Capabilities

### Modified Capabilities

- `wbs-domain`: readable Name cells and completed-row styling.

## Domain Terms

None.

## Decisions Recorded

None.

## Impact

WBS frontend Name cell, table styles, status explanation, and WBS domain presentation spec.
