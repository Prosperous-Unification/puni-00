<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Two faults in the Name cell, both found by Dany reading rendered output in
Chrome on 2026-08-30, and both invisible to jsdom.

**A link nobody can follow.** `markdown-work-item-names` drew a link in a name
as a `<span>`, on the reasoning that the cell's own click opens the editor and
an anchor would add a tab stop to the grid's matrix of cells. Half of that
reasoning was wrong: _"can you make the links in markdown of the workitem
clickable - both the title and body links"_. The notes body was worse than the
name — no `a` mapping at all, so its links took the user agent's blue, no
`rel`, and followed in **this** tab, discarding every unsent draft behind them.

**A row sized by text nobody sees.** The Name cell is two boxes and only the
`<textarea>` holding the markdown **source** is in the flow, so it is the
source that decides the row's height. `[The San Juan Mountains are
beautiful](https://en.wikipedia.org/…)` is one short line rendered and two long
ones as source: _"the row is expanded when the rendered markdown does not need
this expansion"_.

## What Changes

- A link in the grid becomes an anchor that a pointer can follow and Tab still
  steps past (`tabIndex={-1}`, `pointer-events: auto` on the anchor alone).
- The hover preview's notes render their links through the same component as
  its title.
- The Name cell's at-rest height is measured from the box being **drawn**, not
  from the source under it.

## Non-goals

- The grid's tab order does not change; a link is not a cell.
- The name is still never composed into a larger markdown document.

## Constraints

- jsdom computes no layout and applies no stylesheet; the oracle is Chromium.
- A non-`http(s)` URL must not become a followable `href`.
