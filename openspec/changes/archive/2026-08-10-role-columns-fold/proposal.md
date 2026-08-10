# A role's columns fold behind its final figure

## Why

Dany, 2026-08-06, from a screenshot of dev: the table is wider than the screen
— everything from Total days rightward was silently invisible — and his call
was to "group columns to save space for most important info".

Two roles cost ten columns: three estimate points, an assignee and a final
figure, twice over. The final figure is what a plan is _read_ by; the three
numbers it came from and who does the work matter while the plan is being
_written_, which is a burst, not a state. Ten always-on columns priced the
reading table at the writing table's width.

## What Changes

**Each role is one column until it is asked to be more**

- At rest, a role shows a single column: its name as a fold toggle (`Dev ▸`)
  and each row's final days. Clicking unfolds the trio (headers `optimistic /
realistic / pessimistic` — the role's name is on the group column, and
  repeating it three times is how the headers came to set the table's width)
  and the assignee (`by`), to the toggle's right. The toggle column never
  moves, so nothing jumps.
- Folded by default, per role, local to the browser: my unfolding must not
  reshuffle anyone else's table.
- **A folded role cannot hide a complaint.** A typed trio that saves nothing
  marks the final figure red with `!` and the reason in its title; unfolding
  shows the boxes at fault as before.
- **Estimate drafts survive the fold**, because they live in the table's state
  rather than in the inputs. Fold, unfold, and the typed `5` is still there,
  still unsent.

## Non-Goals

- **No persistence of fold state.** Session-local component state; remembering
  it per project is a later nicety.
- **No folding of the schedule columns.** Dates are the reading half; hiding
  them would fight the point.
- **No sticky columns / horizontal scroll affordance.** May still be wanted on
  small screens; separate change if the fold alone is not enough.

## A cost, named

Toggling rebuilds the column set, which remounts every cell. Text typed into a
Name or Notes cell and not yet committed is reset to the server's value by
that remount. The fold is an explicit click and estimate drafts are immune,
but a half-typed name does not survive it. Accepted rather than engineered
around: committing on unmount would write things nobody finished deciding on.
