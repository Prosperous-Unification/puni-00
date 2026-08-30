<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

C1 (`capacity-engine`, #48) shipped the schema and the engine for two facts —
how many of a team may be at work at once, and how many of them may be on one
work item — and **no way to state either**. `serviceTeam.size` is written as
`null` by the one path that creates a team; `workItem.maxParallel` is written as
`1` by the one path that creates a work item. Nothing else can move them.

This change is **C2 of five**: the write paths, their validation, and what a
size write has to tell. It carries no pixel — the directory input and the
In-parallel column are C3.

## What Changes

**Validation, and it is load-bearing.** Both fields take a whole number of 1 to
1000; `0`, negatives, fractions, non-numbers, `1e999` and `1001` are refused 400. The floor is not tidiness: the engine's duration is `effort / width`, so a
stored 0 is a plan of `Infinity` dates. `null` resets `maxParallel` to 1 and
clears a team's size to unstated. `maxParallel` on a row with children is
refused — a parent has no slices, so the number would decide nothing.

**Undo comes with it.** `maxParallel` joins `WorkItemPatch`, so it rides the
existing compensating command and its stale-revision refusal.

**A size write tells every project the team labels work in**, through the
`directory_changed` and `TouchedProjects` that already exist — inheritance
included, because a project holding an inheriting leaf holds the labelled
ancestor too.

**Removing a sized team says what it takes.** The confirmation gains a
`capacity_released` effect on every row whose _effective_ team is the one going,
inherited descendants included, read through the same `effectiveTeamOf` the
scheduler uses.

**The engine refuses a width below one** at its own boundary — the open P2 of
#48's cross-review, so that validation is not the sole guard.

## Non-goals

The directory input, the In-parallel column, cards, export and Gantt words (C3);
the delta spec's priority edit (C4). A per-project team allocation. Undo for the
directory, which is not journalled at all today.
