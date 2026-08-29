<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

A plan row stands for work that also exists somewhere else — a Jira issue, a
GitHub PR, a Confluence page, a Slack thread. Today the only place to put that
is the name or the notes, where nothing can find it, nothing can follow it, and
a reader scanning the plan cannot see which rows are wired up at all.

## What Changes

**A work item carries a list of external refs**, each `{ type, url }`. The type
is a name from a stored, growing vocabulary — the same bargain tags make: the
known systems are seeded, and naming a new one saves it.

**The type is derived from the URL when a ref is added in the app.** A pasted
GitHub pull-request URL types itself `github-pr`; Jira, Confluence and Slack
likewise. No match leaves the type to be typed. The derived type is **stored**,
never re-derived on read, so a ref keeps the type it was given when the rule
later changes.

**A dot column, immediately after `#`.** Fixed and narrow: one coloured dot per
distinct system the row links to, never one per ref. Jira blue, Confluence a
blue ring, GitHub near-neutral, Slack green, anything else a neutral ring. A row
with no refs is blank — not a dash. The dots never change the row's height or
the column's width.

**The cell opens a modal.** Clicking it opens the ref list: follow, add, edit,
remove. Hovering it shows the same list read-only, with each ref followable —
the anchored-card family `DependsCard` already established.

**Colour is never the only channel.** Each dot carries an accessible name, and
the two Atlassian blues differ by fill as well as by hue, because "blue and
darker blue" is the pair colour vision fails on first.

## Non-Goals

- Fetching anything. No PR status, no issue state, no titles. A ref is a link.
- Any write to an external system.
- Per-project ref vocabularies. Directory-wide, like tags.
- Ordering refs by hand beyond the order they were added.

## Capabilities

### Modified Capabilities

- `wbs-domain`: what a work item records about the work it stands for elsewhere.

## Domain Terms

External ref (new); External system (new); Ref dot (new).

## Impact

Two tables (additive, with `down.sql`); the URL→type rules in `libs/domain`;
`patchWorkItem`; the plan payload; a fixed 40px column and its dots; a modal
editor; the hover card; the export.
