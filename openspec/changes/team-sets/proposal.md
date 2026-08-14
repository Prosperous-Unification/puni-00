<!--
INTENT. Hard cap: 400 words excluding these comments.

This file is named proposal.md because the OpenSpec CLI hardcodes that filename
(item-discovery, archive, change commands). It holds the intent artifact.

If you cannot state the intent in 400 words, the change is too big. Split it.
Alternatives go in an ADR. Approach detail goes in design.md, if at all.
-->

## Why

Dany, 2026-08-13: _"I want to separate team vs service in each of the work item;
can be several teams and several services per work item"_. A work item carries
**one** team today — `work_item.service_team_id`, a nullable column — and one
column cannot hold several of anything.

R2-1 is the first of six changes for that request
(`notes/wbs-brief-2026-08-13-r2-team-service.md` §6). It changes **arity, and
nothing else**: the store learns to hold a set, every read learns to read one,
and the write path goes on writing at most one. So production sets stay ≤ 1 and
no date, sentence or pixel moves — which is the whole point of doing it first,
and what the oracle differential is here to prove.

## What Changes

**A join table.** `work_item_team(work_item_id, team_id)`, both columns
cascading, seeded one row per work item that carries a non-null
`service_team_id`.

**`effectiveTeamOf` becomes `effectiveTeamsOf`.** `libs/domain`'s one reading of
"most-specific wins" answers a **set** per row: a row's own non-empty set, else
the nearest ancestor's non-empty set, whole. Empty is _unstated_ and inherits,
exactly as `null` does today. The export is renamed and the old shape deleted, so
every one of the six call sites is a compile error rather than a silent
first-member read.

**Every read goes through the join** — the scheduler's adapter, directory-usage,
the tree payload's new `teamIds`, the table cell, the cards' chip, the export's
`Team` column, the Teams dialog.

**Every write keeps writing at most one, and dual-writes both.** The patch
payload still takes `serviceTeamId`; the repository writes the column and the
join row in one transaction, and a duplicated or restored subtree carries its
labels through the join as well as the column.

## Non-goals

The engine (`poolIds`, the joint window search — R2-2). Multi-team UI and writes
(R2-3, R2-4). The `service` label dimension (R2-5). Dropping
`work_item.service_team_id` or renaming `service_team` (R2-6). Filtering by
either dimension (R10).
