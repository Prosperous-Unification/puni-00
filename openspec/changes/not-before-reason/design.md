# design — `not-before-reason`

Prod mode: the diff opens with a migration and it touches `libs/domain`. What
follows is the six decisions that were not obvious, each with what it costs.

## P1 — A column, not a table

`start_no_earlier_than_reason` sits on `work_item` beside the date it explains,
rather than in a table of its own keyed on the work item.

A table would buy a history (who wrote which reason when) and a grain (per role,
as `actual` and `role_progress` are). Neither is wanted. **The reason has exactly
the grain the date has**, and the date is a column: a not-before is a fact about
the work item, not about one role's work on it, so a per-role reason would be
words about a floor that role does not have. And the history already exists —
`plan_event` records the `patch` command that wrote the words, which is H1's
seam, and a second history for one string is a table nobody reads.

**Cost:** a reason cannot be attributed to a person without reading the journal.
Accepted: so cannot the date.

## P2 — The pair rule lives at the write boundary, not in the schema

The invariant is *a reason may not be held without a date*. There are three
places it could live: a `CHECK` on the table, the service, or the store's own
transaction. It is in the store's transaction, and the `CHECK` is refused.

**Why not a `CHECK`.** `role_progress` put its closed set in a `CHECK` one
migration ago and the argument was explicit: the outgoing release has never heard
of that table and never writes to it, so blue cannot reach the constraint. That
argument does not survive being carried over here. `work_item` is a table blue
`UPDATE`s on every edit, and `UPDATE work_item SET start_no_earlier_than = NULL`
— clearing a not-before — is a statement blue runs today. Against a row green has
explained, it would fail a constraint blue cannot see and answer **500 for the
length of the swap window**, on a request whose only fault is being served by the
old colour. `migrate.test.ts`'s `lets the outgoing release keep clearing a
not-before date the new one has explained` is that case, and the injected `CHECK`
is what it was watched failing under.

**Why not the service.** Same reason `unknown_team` is not decided there: a
service-level precheck followed by an update is two statements with a concurrent
write's worth of gap between them, and another patch clearing the date inside
that gap leaves exactly the pair this refuses.

**Cost, stated rather than glossed:** a hand-edit, or a future writer that
bypasses `WorkItemRepository`, can put a reason on a dateless row. What that row
does is **nothing visible** — no bar is floored by a date that is not there, so
no floor sentence carries the words, and the cell prints them beside an empty
date. Invisible text is a smaller fault than a 500 mid-swap, and that is the
trade.

## P3 — Refused, never cascaded

Clearing the date on an explained row is a 400, not a silent clear of the words
beside it.

The alternative reads tidier — the reason is meaningless without the date, so let
the date take it — and it is wrong for one reason: **the words are somebody's
sentence.** A write that deletes text a person typed, on their behalf, in
response to a request that did not mention it, is a data loss nobody can see
happening. The 400 names the field and the client sends both nulls.

This is the one place this change puts work on a caller, so it is written into
the OpenAPI description, the `WorkItemPatch` JSDoc, the `WorkItemRefusal` JSDoc
and the spec delta — four places a reader of the wrong one still finds it.

**Cost:** a client that forgets meets a refusal. That is the point; the owed
`wbs-table.tsx` edit is where it is met, and the proposal names it.

## P4 — Merged, not read off the patch

The rule is asked against the row **as it will stand** — the stored pair merged
with the patch's — and not against the request alone.

It has to be. A patch carrying only a reason is legal on a row that already has a
date and illegal on one that does not, and the patch cannot tell which. Read off
the request either way round, the check would refuse the ordinary case of adding
words to an existing floor, or accept the orphan it exists to prevent.
`mergedNotBefore` in `repository/work-item.ts` is that merge, named rather than
inlined because it is the subtle half.

The extra `SELECT` is taken **only when the patch names one of the two fields**,
so a rename, a priority or a label costs exactly what it cost before this change
— which is also this change's compatibility claim, and `lets a patch that names
neither half of the pair through a dateless row` is where it is asserted rather
than assumed.

## P5 — The inverse names both halves, which is why undo cannot be refused

`revertTo` restores `before`'s value for **every field the forward patch named**,
and this change adds the reason to that list beside the date.

That is what keeps every inverse legal against P2's rule, and the argument is
worth writing down because it is the kind of thing a later change breaks by
accident. An inverse names exactly the fields the forward named and restores
`before`'s value for each; the fields it does not name were not touched by the
forward either, so they still hold `before`'s value too. **So an inverse always
lands the row back on a pair it was already in** — and every pair it was in was
one the store accepted. There is no undo this rule can refuse.

Delete the reason from `revertTo` and the inverse of a cleared pair names the
date alone: the undo reports done, the floor comes back, and the sentence that
said why it was there is gone. That is F8.

## P6 — The chart appends, and only where the floor binds

The sentence is `Held by its start-no-earlier-than date — waiting on client
sign-off`: the existing sentence, an em-dash, the words as typed.

**Appended and not substituted**, because the date is still what holds the bar
and the reason is an aside on a floor that reads identically without it. A
replacement sentence would be a second vocabulary for one bar, which is the
`blocked` argument arriving through the back door.

**Only on the `notBefore` arm of `floorWordsOf`**, because the reason belongs to
the floor rather than to the row: a bar of the same work item that is waiting on
a dependency has a sentence about the dependency, and appending a not-before's
reason to it would be the chart naming one cause and explaining another. Watched:
the append moved out of the `notBefore` arm, and `leaves the words off a bar
something else is holding` failed.

**In the em-dash voice of `personFloorWords` and `capacityFloorWords`** rather
than a third register, so a reader moving between bars does not have to notice
which kind they are hovering.

The row's field is `notBeforeReason?: string | null` — **optional**, because
`wbs-table.tsx` builds these rows and was another agent's file. A required field
would have made a missing line a build nobody can run rather than a feature
nobody can see. The proposal names the three owed edits; `GanttRow.notBeforeReason`
and `ExportRow.startNoEarlierThanReason` each name their own.

## What this change deliberately does not decide

- **Whether a passed not-before should stop showing its reason.** It already
  does, in effect: a date in the past binds nothing, so no bar is floored by it
  and no sentence carries the words. Nothing was written to make that true.
- **Whether the reason should be searchable or a filter facet.** R10's seven
  facets are settled (2026-08-17) and `status` was refused among them; a
  free-text axis is the same question and is not this change's.
- **Anything about `blocked`.** It was refused twice. This is the substitute, and
  it is deliberately not a smaller version of the thing that was refused.
