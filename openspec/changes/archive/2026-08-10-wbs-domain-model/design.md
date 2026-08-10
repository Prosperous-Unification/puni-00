# Design

Server authority and the plain-integer position both come from
[ADR 0003](../../../docs/adr/0003-the-work-breakdown-lives-on-the-server.md) and are not
re-argued here.

## Tables

```
project     id, name, owner_id, restricted, created_at
work_item   id, project_id, parent_id, position, name, notes, frozen_number
role        id, project_id, name
estimate    work_item_id, role_id, optimistic, realistic, pessimistic
```

`work_item.frozen_number` is nullable and is the whole of the freeze mechanism: null means
derive, set means report as stored. `estimate` is keyed by work item and role rather than
holding three columns on `work_item`, so roles can be added without a migration.

All four are new tables, so the blue/green constraint — two be-01 processes sharing one
SQLite file mid-swap — is satisfied by construction: the old process never reads them.

## Deriving numbers

One pure function, `deriveNumbers(tree): Map<WorkItemId, string>`, walking each sibling
group in position order. It is the riskiest code in the change and the reason this file
exists.

Per sibling group, in order:

1. Width is `String(childCount).length` — one digit up to nine children, two up to
   ninety-nine. Roots differ only in shape, not in rule: they take the `0n0` form, three
   characters up to ninety-nine roots, so `010` sorts before `100`. A hundredth root widens
   every root to four, `0010` through `1000`. Verified by sort: unwidened, `1000` sorts
   before `990`.
2. Walk the group in position order, assigning each unfrozen work item the next available
   label at that width, skipping any label a frozen sibling already holds.
3. When an unfrozen work item falls between two adjacent frozen labels with nothing free
   between them, append a digit: between `010` and `011` comes `0105`. This is why the
   scheme never runs out, and it is verified by sort, not by argument.
4. A frozen work item keeps `frozen_number` verbatim, including the width it was frozen at,
   so a partially frozen group can hold mixed widths.

The function takes the whole project and returns every number. It never reads a number it
previously wrote, so any bug in it is repaired by running it again — which is the property
that makes the delete-and-readjust rule safe.

## Layering

Unchanged from the house shape: controller validates and authorises, service holds the
rules above, repository touches Drizzle. `deriveNumbers` lives in the service layer as a
free function over data the repository returned, so its tests need no database.

Validation schemas live in `shared-lib-01` and are imported by both tiers. fe-01 shows the
error as you type; be-01 rejects the same input on write. Neither can drift, because there
is one schema.

## Broadcast

be-01 already has `EventSequencer` and `PushClient`; gw-01 already has `SubscriptionMap`
and a resume protocol. This change adds a subscription naming convention — `project:<id>` —
and a format check at subscribe, nothing more.

Two payload shapes on that subscription:

- `work_items_changed` — a list of work items with their recalculated ancestors. Emitted
  for name, notes and estimate writes.
- `tree_replaced` — the project's full tree. Emitted for create, move, delete, freeze and
  unfreeze.

The split exists because a structural change can renumber a large slice of the project, and
computing the minimal set is fiddly code that would be wrong in rare cases. A work breakdown
is hundreds of rows; structural edits are rare. Sending the tree is the cheaper mistake.
