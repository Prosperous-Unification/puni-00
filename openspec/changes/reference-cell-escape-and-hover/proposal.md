<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Three faults in the four reference cells — Teams, Tags, Services, Types —
reported by Dany from real Chrome on 2026-08-31, all invisible to jsdom.

**The add popover cannot be left.** _"i can add the tags, but i cannot focus
out of the adding mini window"_. A take starts a write, the write disables the
search box, and the browser takes the focus off a disabled control onto
`<body>` **inside React's commit of the very update that disabled it** — where
React never runs the `onBlur`. The strip reads its panel's open state off that
`onBlur`, so the panel stays out of the flow over the rows below with no focus
left for a click or an Escape to take away. Escape could not help either: with
the list already shut, the next press did nothing at all.

**A reference cell has no hover card.** _"cannot hover over tags cell to see
the list of tags"_. The rest line is one clipped line by design, and the only
way to read what was cut was to open the panel that would not close. The
Depends-on cell has had a card for exactly this since `dep-hover-highlights`.

**The Types cell cannot be typed into.** _"for types - i need to be able to
type same as tags, services, teams"_. `type` never joined `POPOVER_COLUMNS`, so
its `<td>` still clips: the list is drawn inside a 26px cell, and every line of
it is painted where the next row's own box takes the pointer.

## What Changes

- A picker's box is read-only while a write is in flight, never disabled, so
  the focus and the caret survive a take.
- Escape closes the list; Escape again leaves the box, which closes the panel.
- `ReferenceSetStrip` opens a `HoverCard` with the whole set on it — stated
  members first, carried ones naming the row they were written on.
- `type` joins `POPOVER_COLUMNS`, which its list and its new card both need.

## Non-goals

- The panel is unchanged: it still leaves the flow and wraps its chips.
- Nothing changes about what a cell stores, or about inheritance.

## Constraints

- jsdom sees none of this: no dropped focus, no clip, no layout. Chromium is
  the oracle for every claim but the line-builder's.
- One fix per fault, in the shared home — never four that agree until one is
  edited.
