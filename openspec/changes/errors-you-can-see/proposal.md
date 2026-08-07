# Errors you can see

## Why

Both UX reviewers rated these two MUST, 2026-08-06.

The table reports everything through one `error` string in a `<p role="alert">`
above the grid. On a plan of any size it scrolls out of sight, the next failure
overwrites the last, and `run` clears it before every request — so the reason a
rename was refused disappears the moment anything else works.

And when a refetch fails after somebody else's edit, the catch is empty. Keeping
the last good tree on screen is the right call; not saying it may no longer be
current is not.

## What Changes

**Events go to a toast stack, states stay banners**

- An event happened once — a refused request, a cancelled drag — and belongs in
  the corner. A state is true until something changes it — the dependency cycle,
  the dropped socket, a tree that may be stale — and belongs in a banner, where
  it can be read for as long as it holds. The cycle banner and the reconnecting
  line are unchanged.
- Bottom right, newest on top. **An error stays until its ✕ is pressed**: a
  required failure that fades is one the reader can miss. An info message —
  today only "the table changed while you were dragging", which refuses nothing
  and loses nothing — takes itself off after five seconds.
- **Five visible; the rest counted as `+N more`.** The reviewers killed a toast
  per change for being noise, and twenty stacked boxes over the table is that
  failure by another door. The collapsed ones are held, not dropped.
- **The same message twice is one toast, moved back to the top.** A held
  Alt+arrow on a frozen row fires its refusal once per key repeat.
- A typed dependency list is one gesture, so its refusals are one toast.
- The top-of-page error line goes, and `run`'s clear-before-every-request with
  it.

**A stale tree says so, and offers the way back**

- A refetch that fails — the socket's, an edit's reread, the retry's own —
  raises a persistent banner with a Retry. Any refetch that lands clears it,
  whichever path asked for it.
- A refused action and a stale tree are different facts, and both show when both
  are true.

## Non-Goals

- **`project-page.tsx` is untouched.** Its own error line covers load, create
  and rename on a different surface; folding it in is a follow-up.
- No toast for anybody's edit landing. That is the noise the reviewers killed.
- No persistence, no undo, no stacking preference, no animation.
- The first load failing stays a toast, not the banner: there is no tree yet for
  "may be out of date" to be about.

## Constraints

fe-01 only, no API change. `columns` still depends on `roles` and
`unfoldedRoles` alone — anything else remounts every cell and eats the focus.

## Domain Terms

`Toast`, `Stale tree`.

## Decisions Recorded

none — reversible, and the alternatives were not close.

## Impact

`apps/fe-01/src/components/wbs/toasts.tsx` (new), `wbs-table.tsx`, `CONTEXT.md`.
