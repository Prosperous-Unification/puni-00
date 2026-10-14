<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

The UI review of 2026-10-14 (findings F-057, F-058, F-063) found three problems in the plan table:

- The Depends on cell showed a bare total _before_ its chips (`+ 3 010…`, read as "add 3").
- It cut every PUNI number to `010.…`.
- The Teams picker alone said `search or add` where the other creatable pickers say `search`.

The Tags, Teams, Services and Types strips already rest on whole chips with a `+N` after them (decision D4). The Depends on cell followed an older rule from `deps-single-line`: an edge fade at rest and no `+N`.

## What Changes

- The Depends on strip shares the reference strips' resting line:
  - whole chips, with what does not fit wrapped out of sight;
  - a `+N` after the chips, titled `Also: …`, and nothing when no chip is hidden;
  - no bare total.
- Neither strip draws an edge fade any more. The fade dimmed the last whole chip's ✕ to 1.8:1, and `+N` is the cue (D4 as amended 2026-10-14). This supersedes `deps-single-line`'s fade and its "no `+N`" sentence.
- A dependency chip never ends in an ellipsis:
  - A chip that cannot fit whole is hidden and counted.
  - The Depends on column's default width follows the plan's widest whole-row dependency chip, plain or typed, with an 84px floor.
- Every creatable picker's empty box says `search`.

## Non-goals

- Sizing for node-scoped typed chips: they stay hidden and counted.
- Changing the open (editing) state of either strip.
