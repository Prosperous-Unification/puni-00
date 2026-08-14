<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

Two of C3's (`capacity-ui`, #57) six recorded-not-applied P3s, taken under the
2026-08-14 PoC-mode contract. `commitRename` turned out to already be fixed;
the `∥` cell's per-row muting had not been.

**`commitRename` dropping an unsent capacity draft — refuted, no code.** The
finding was about `directory-page.tsx`'s single `forgetDraft` clearing both a
name draft and a size draft on commit. `capacity-per-project` (#58,
2026-08-13, merged before this P3 was ever recorded stale) moved the size box
out of the directory entirely, into `teams-dialog.tsx`'s own `typed` state —
a different component, keyed by team id, with no name draft beside it.
`forgetDraft` and `forgetNameDraft` in `directory-page.tsx` are now identical
functions over the page's one remaining draft; `forgetSizeDraft` was deleted
in `db73f54`, call sites and all. Nothing to fix.

**The `∥` cell mutes per row where be-01 collapses per slice — fixed.**
`work-item.service.ts`'s `widthFor` reads a **role's own** assignee (falling
back to the row's single assumed one only when exactly one role total is
named) and pins that slice to width 1. The cell's muting leaned on
`doesEveryPhase` alone, which is `null` the instant a *second* role gets its
own explicit name — so a leaf with two roles on two different people showed
an editable, un-muted number that did nothing on either slice.

## What Changes

The `∥` cell's muting reads **every one of a leaf's estimated roles**, not the
row's single assumed one: it is inert wherever each role's own assignee (or
the row's one assumed assignee, where exactly one role is named at all) is
non-null. Both readings already live on `TreeRow` — `assignees`, `estimates`,
`doesEveryPhase` — so this is a local computation, not a payload change.

`docs/capacity.md`'s "still open" paragraph is corrected: the table now
matches the chart's per-bar reading; the cards (`plan-cards.tsx`, another
agent's file this session) still read per row and stay open.

## Non-goals

The cards' own per-row muting — same class of bug, different file, out of
scope this branch. The over-bar team-size clamp and label P3s — already
answered in `chart-clamp-words` (#63). The team-size (`slots`) half of
`widthFor`'s clamp: this change is the **named-person** reading only: a row
whose team is sized to fewer than its `maxParallel` is a separate, already
recorded gap in the chart's own words, not this cell's muting.
