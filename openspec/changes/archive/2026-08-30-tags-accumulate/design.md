<!--
Only where the technical shape is non-trivial. It is here: the walk forks and
the answer changes shape, and both of those reach every reader.
-->

## D0 — Three dimensions, three inheritance rules

Teams and services **override**, tags **accumulate**, and types (ADR 0009,
decided a day after this) inherit **neither way**. Three answers to one question
is the shape this repo normally treats as a smell, which is why both ADRs write
it down rather than leave it to be found in three walks.

The line is whether a statement stays true as you descend. A tag's does — `Risk`
said of a parent is said of the work under it — so union is the only rule that
keeps the sentence true. A team's does not survive a nearer statement, because
one owner is a decision. A type's does not survive the descent at all, because a
hierarchy exists so a row and its children are different things. Copying this
change's rule onto the type dimension is the specific mistake ADR 0009 exists to
stop.

## D1 — The walk forks; it does not grow a flag

`effective-label.ts` holds one overriding walk that three dimensions were one
line over. Tags leave it. `effective-tag.ts` gets its own walk and
`effectiveTeamsOf` / `effectiveServicesOf` keep the shared one, untouched.

The alternative — one walk taking a `union: boolean` — was rejected because the
two rules answer different questions and only one of them can move a date. A team
decides which pool the scheduler spends; a tag decides nothing. A flag puts both
rules under one hand, and the fault it invites is a change to the tag rule that
silently re-pools a plan. Two files cannot do that, and the sibling JSDoc says so
in both directions.

The cost is a second memoising walk. It is bounded: the accumulating one is the
same shape climbed twice — up to the nearest settled ancestor collecting the
chain, then back down folding — because a union has to know the whole chain above
a row before it knows the row's answer, where an override can stop at the first
statement it meets.

## D2 — The answer is a list of `{ tagId, fromId }`

`EffectiveTags` was `{ tagIds, fromId }`: one set, one stating row. That shape is
exactly as expressive as override. A row stating `Ready`, carrying `Risk` from
`010` and `Review` from `010.2` has three answers to "who said so" in one cell,
and one `fromId` can name at most one of them.

So the map's value becomes `readonly TagInForce[]`, own entries first (in the
row's stored order), then each ancestor's, nearest first. Two properties fall out
of that order and are relied on by the faces:

- `fromId === rowId` is the whole test for "this row states it", and therefore
  the whole test for "this chip gets a ✕".
- Everything a face draws is already sorted; no surface sorts again, so no two
  surfaces can sort differently.

Absence still spells "no tags anywhere above this row": the returned map holds no
empty entries. The memo needs empties, so it is a second map inside the function
and the returned one is built from it — which also preserves the object-identity
memoisation that the existing `resolves a chain of untagged rows once` test
asserts, because a row that states nothing returns the array it was handed.

## D3 — `TagLabel` stops being a discriminated union

`ServiceTeamLabel` and `ServiceLabel` stay `none | named | inherited [|
unresolved]`, which is honest for an overriding dimension: the arms are exclusive
because one row states the answer.

`TagLabel` becomes `{ own: string[]; inherited: { id, name, fromRow }[] }`. There
is no `none` arm — two empty lists already say it, and a discriminant repeating it
is a second spelling every reader has to handle. `inherited` carries the tag's
`id` so the cell can key a chip and the sheet can pass it through, which makes it
structurally an `InheritedReferenceEntry` and saves a second directory lookup
that could disagree with the first.

This is why `plan-cards.tsx`'s `CardSetField` splits into `CardServiceField` and
`CardTagsField`: it drew both set dimensions off one `kind` while both overrode,
and there is no shared discriminant left.

## D4 — Inherited tags are chips, not a placeholder

The Team cell says inheritance in the search box's placeholder ink with a leading
`↳`. That works because a placeholder is only visible on an **empty** box, and
under override a row that states a team carries none of its ancestor's.

Under accumulation the cell is not empty in the case the report is about. So the
Tags cell draws inherited tags as chips after the row's own, in
`ReferenceSetStrip`, behind a new adapter field `inheritedEntries`. The existing
`inheritedLabel` stays for the two overriding dimensions and no adapter passes
both — drawing both is what stood the Tags column three lines tall on 2026-08-29.

An inherited chip is outlined, muted, `↳`-prefixed and carries **no ✕**: a tag
comes off where it was written, and a ✕ here would have to either edit an ancestor
from a descendant's cell or do nothing.

The `wrapping` rule stays `editing && own.length > 0` — deliberately not counting
inherited chips. The wrap exists to put a ✕ back in reach, and an inherited chip
has none, so a cell that only carries inherited tags has nothing hiding behind the
clip that anybody could act on. Its height is a browser's claim and is measured in
`e2e/reference-cells.spec.ts`.

**The number of inherited chips is unbounded by depth**, which is new: the stated
set is capped at `MOST_TAGS_ON_ONE_ITEM` on the write path, and nothing caps a
union. Nothing in the cell needs to know — it clips one line whatever it holds —
but the export and the facet now see cells that grow with the tree, and neither
may assume a short one.

**A layout negative here was expected to be unfalsifiable, and is not.** Since
`reference-cell-popover` the strip leaves the flow while edited and `CELL` clips
the `<td>` with `overflow: clip`, so injecting `flex-wrap: wrap` on the resting
strip looked as though it would change nothing observable at the row. Injecting
it says otherwise: the existing height check fails on `Expected: <= 27.1875 /
Received: 68.1875`. A `scrollWidth > clientWidth` guard written for the
theoretical gap could not be watched failing — the height fires first, and it is
not this change's to reorder — so it was deleted rather than shipped as a claim.
The browser assertions this change adds are about **what is drawn**: one own
chip, two inherited chips, one Remove button, and both the own chip and the `+`
hit-testable.

## D5 — Per-name provenance in the export and the hover text

`labelCell` in `plan-export.ts` prints one `(inherited from 010 X)` for the whole
cell, which is right for one stating row. `tagCell` stops sharing it and prints
per name — `Ready; Risk (inherited from 010 Compliance)` — keeping `; ` as the
separator, which is the rule R3's import matches names by and the one thing about
that cell that must not fork. `tagWords` in `gantt-panel.tsx` does the same in the
hover text, with `(inherited from …)` after each borrowed name.
