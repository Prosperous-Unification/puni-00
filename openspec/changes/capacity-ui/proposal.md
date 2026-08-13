<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

C1 (`capacity-engine`, #48) taught be-01 two facts — how many of a team may be
at work at once, and how many of them may be on one work item — and C2
(`capacity-write-paths`, #53) shipped the ability to write both. Neither
carried a pixel. fe-01 today cannot state either number and does not know the
word `capacity`.

That is not merely a gap. `floorWordsOf`'s `default:` arm throws
`GanttDataError` on a floor it has no words for, and `capacity` became that
floor the day C1 merged; C2 made it reachable in production. **Any plan with a
sized, contended team currently renders an error boundary where its Gantt
should be.** The deploy gate has been armed since C2 merged for exactly this.

## What Changes

**The chart says what a pool did.** A `capacity` floor gets a sentence naming
the team, the slots the bar needed and the finish that freed them, plus the
rest of the blocking set counted rather than listed; a pool wait is drawn from
the display referent. Three malformed-payload refusals guard it.

**The table gains an In-parallel column** — `∥`, 32px, blank at 1 — read-only
on a parent, muted where a named assignee makes it inert. The Service/team cell
shows an inherited label as `↳ Name` in placeholder ink, with the source row in
its `title`.

**The export gains three columns' worth of truth**: Team becomes the effective
team and names where an inherited label was written; `People at once` is what
was asked for; `Ran at` is the widths be-01 actually placed, as a set.

**The cards say both**, because a phone is the only face some readers have.

**The directory gains a size box** per team, empty for _unstated_, and a team
removal's confirmation prints the `capacity_released` effect C2 sends —
inheriting rows included.

**Validation stays at be-01's boundary.** Both boxes send what was typed. The
two things they decide are what an _empty_ box means and that a non-finite
draft cannot be sent, because JSON writes both as `null` and `null` is a reset.

## Non-goals

The delta spec's priority edit (C4). A per-project team allocation. Undo for
the directory, which is not journalled at all. Narrowing any other column.
