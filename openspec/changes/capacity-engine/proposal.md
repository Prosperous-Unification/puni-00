<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

Dany, verbatim: _"On the basic lvl I want to input how many ppl can work on
this in parallel. Or people per team."_

The engine today runs every work item one person at a time and bounds nothing
by headcount. A team of two shows six of its items running at once, and an
item three people could finish in two days is planned for six.

Two facts answer it: **how many of a team may be at work at once**
(`serviceTeam.size`), and **how many of them may be on one item at once**
(`workItem.maxParallel`). This change is the **engine and its schema** — the
first of five (C1 of the capacity plan). It carries no write path, no
validation, and no pixel.

## What Changes

**Schema.** Two additive migrations: `service_team.size` nullable with no
default (null is _unstated_, and constrains nothing), `work_item.max_parallel`
`NOT NULL DEFAULT 1` (1 and unset are one fact). Both with `down.sql`, and a
rollback test that walks back in reverse order and reads the result.

**Inheritance.** `effectiveTeamOf` in `libs/domain`: a leaf's own team label,
or the nearest ancestor's — most-specific wins. One reading, shared; no write
copies a label down. The scheduler is its first consumer; the table, cards,
Gantt and export follow in C3.

**Engine.** A slice gains `width` and `poolId`, both resolved by the adapter.
Duration becomes `effort / width`, one indivisible block. Per pool, a usage
profile of deltas **aggregated by timestamp**; a block takes the earliest
window where its slots are free for its **whole** duration, or it waits — it
never runs narrow and widens later. A new `capacity` floor, ordered after
`person`. Float carries the **whole blocking set**, not one edge, so no row is
ever reported movable when it is not.

**Identity is the bar.** A plan that sets neither field schedules byte for
byte as it did: a thousand seeded plans and the captured live plan, every
field of every slice and every projection.

## Non-goals

Validation and undo (C2), the directory input, the In-parallel column, cards,
export and Gantt words (C3), the delta spec's priority edit (C4). Per-project
team allocation — the seam is built, the table is not.
