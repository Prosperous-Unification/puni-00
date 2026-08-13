<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

C1 shipped `serviceTeam.size` as a **global** number and said so: two projects
labelled `Platform` are each told they have all four of them. C1's own D6 quotes
the objection it deferred — _"a global number that gives every project all N is
neither a capacity nor an allocation"_ — and built `slotsOf` as the seam.

Dany, 2026-08-13, verbatim: _"the capacity must be configurable per project"_ and
_"The global number should not matter, only per project capacity configuration
matters."_ That is the second sentence deciding the shape: not a per-project
override in front of a global default, but a per-project number and no global one
at all.

## What Changes

**A team's capacity becomes a fact about a project.** New table
`project_team_capacity(project_id, service_team_id, size)`. The scheduler's slots
come from a lookup keyed on the pair; `serviceTeam.size` is read by nothing after
this change.

**The migration seeds, so no plan moves.** Every existing project gets a row for
every sized team carrying that team's current global number. The pin is an
identity differential against sixteen plans captured from the pre-change engine
before this branch existed: every field of every row and every slice, byte for
byte.

**No fallback.** A pair with no row is _unstated_ and constrains nothing. A team
sized after the migration, and a project created after it, therefore start
unconstrained and the number is typed per project — which is Dany's second
sentence working as asked.

**The size box moves out of the directory and onto the plan.** A `Teams` dialog
in the plan's own toolbar lists the teams this plan's work is labelled with,
effective labels included, and takes one number each. The directory keeps names,
members and removal.

**The column stays.** `serviceTeam.size` is retired from every read path and kept
physically, because blue and green share one SQLite file.

## Non-goals

Dropping `serviceTeam.size` — a later change, once no release reads it. The
delta spec's priority edit (C4). Undo for capacity. Reading a global number as
any kind of default.
