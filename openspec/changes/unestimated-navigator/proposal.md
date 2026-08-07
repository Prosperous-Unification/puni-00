# Is this plan ready?

## Why

Both UX reviewers put this in their top five, and Codex framed it in a way that
decides the whole shape: this is **plan-completeness validation, not a filter**.
The question is "is this plan ready?" asked the day before a review, not "show
me only the unestimated rows".

Today a leaf with no estimate contributes zero days in silence. Its own row
says `?` beside a finish date, and that is the only sign — the totals above it,
the critical path and every date downstream are simply wrong by however long
that work takes, and nothing on the screen says how many rows are like it.

## What Changes

**A readiness badge in the toolbar**

- Reads `3 unestimated`: the number of **leaf work items** missing at least one
  role's estimate. Its title breaks that down per role — `1 missing Dev,
2 missing QA`.
- **Absent entirely when the plan is complete.** No tick, no "all estimated".
  A badge that is always there is a badge that stops being read; this one has
  to be noticed on the day it appears.
- Counts work items, not role-sized holes. One row missing both roles is one
  row to go and fix, and a bigger number than there are rows to visit would be
  a number nobody could act on.
- Never counts a parent. Its figures are rolled up from its children, so a gap
  reported against it has nothing to type into and double-counts the child that
  is the real gap.
- **Per required role.** A leaf costed for Dev and not for QA is incomplete —
  the release it plans has no testing in it.

**Clicking it walks the plan**

- Each click puts the focus in the next incomplete leaf's estimate cell — the
  cell of the **first role that leaf is missing**, which is the folded role
  column's combined cell (`combined-trio-entry`) or the optimistic box while
  the role is unfolded.
- The walk wraps. A leaf inside a collapsed branch has its ancestors opened
  first: a navigator that focuses an invisible cell is a lie.
- It is an ordinary button, so Enter and Space activate it. No new shortcut.

## Non-Goals

- **No filtering, hiding or sorting.** The tree stays as it is; only the focus
  moves.
- **No "estimate required" flag per row.** Every leaf needs every role, which
  is what the roles list already means.
- **No writing.** The badge never sets, clears or defaults an estimate.
- **No second badge for other kinds of incompleteness** — no owner, no dates,
  no notes. Estimates only.
