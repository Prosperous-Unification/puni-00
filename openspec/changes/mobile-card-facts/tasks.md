<!--
Ordered TDD slices. There is no separate plan.md in this schema — this file
absorbed it.

Only `- [ ]` checkboxes are tracked by the apply phase.
-->

## 1. Slack joins the fact line

- [x] 1.1 `cardSlackOf(row, showDay)` in `plan-cards.tsx`: `critical` and the
      table's own title where `row.schedule.critical`, else `{n}d slack` and
      the table's own singular/plural title off `row.schedule.float`. Tests:
      `says how many days a row can slip, in the table's own word`, `keeps the
      singular where a row can slip exactly one workday`, `says a row on the
      critical path has none, in the table's own word`.

**No new guard.** A read of two fields already on the row into a string; the
three tests are ordinary assertions, the lighter contract's own rule for copy.

## 2. The `o·r·p` trio becomes a tappable detail

- [x] 2.1 `cardTrioOf(row, roleId, showDay)`: the three points off
      `row.estimates[roleId]`, `No estimate yet` where none is set, `Final {n}
      days` where `row.finalDays[roleId]` exists — `folded-role-card.tsx`'s own
      words, not a second vocabulary. Rendered as a `<details>`/`<summary>` per
      phase, closed at rest. Tests: `says nothing has been estimated, in the
      words the hover card already prints`, `reads the trio and the final off
      the row, in the same words folded-role-card.tsx prints on hover`, `opens
      on a tap and stays shut until one`.

## 3. The record

- [x] 3.1 `proposal.md`, this file, the delta spec, `verify.md`. **No
      `design.md`** — PoC-mode contract, 2026-08-14.
