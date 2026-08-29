# design — `work-item-types`

## D1 — it is `tag`'s shape, copied deliberately

```
work_item_type            (id, name)              unique on name
work_item_work_item_type  (work_item_id, type_id) primary key on the pair
```

with `onDelete: 'cascade'` from the work item and from the type, matching
`work_item_tag` exactly. The pair is the primary key because the pair is the
fact.

**Why a second vocabulary rather than tags with a namespace.** A namespaced tag
(`type:bug`) is a convention, and a convention is a rule the database cannot
hold: nothing stops two type-tags on one row _or_ a tag called `type:` on
another, and the filter cannot offer types and tags as two facets without
parsing strings. Two tables is the same amount of code and one of them is
enforceable.

**The name is `work_item_type` and not `type`.** `type` is a reserved-ish word
in enough of the stack — SQL, the wire's discriminated unions, ArkType — that a
column, a field and a TS type all called `type` would collide at least once. The
domain term is **work item type**; the shortest unambiguous name in its scope
(R2) is `workItemType` at the boundary and `types` on a work item, where the
work item is already the subject.

## D2 — set-valued, and the consequence is stated

Dany chose several per work item over one. The consequence worth naming: nothing
downstream may ask "what type is this row" and get an answer. A future colour,
icon or Jira mapping keyed on the type has to decide what a row carrying `Bug`
and `Spike` is, and that decision does not exist yet.

That is fine while the type is a label and nothing reads it — which is why
"a type deciding anything" is a non-goal rather than an omission. When something
does read it, the choice is between a first-listed convention and a real
single-valued field, and this design does not prejudge it.

## D3 — default-hidden, so the width budget does not move

`table-frame.ts` records the folded budget carefully and warns that "a fourth
dimension would have to take a column away rather than add one". That warning
predates `configurable-columns`, which default-hid `team` and `service` and
freed 240px — but the rule it protects is still right: the **default** set is
what the budget is measured over, and it must not grow.

So `type` joins `DEFAULT_HIDDEN_COLUMNS` at 120px, matching its three siblings,
and `foldedTableMinWidth` over the default set answers the same number it
answers today. `table-frame.test.ts` pins that number, so a later change that
quietly shows the column by default fails there rather than in a reader's
scrollbar.

## D4 — no inheritance, unlike Teams

The Teams cell inherits the nearest ancestor's set and shows it in placeholder
ink, because a row's dates were computed against that team's people — the
inheritance is load-bearing.

Nothing computes anything from a type. An inherited `Epic` shown down a whole
subtree would be furniture on every row, and the reader could not tell a row
that _is_ an Epic from one that sits under one. So an unset type is blank, the
way an unset priority is blank.
