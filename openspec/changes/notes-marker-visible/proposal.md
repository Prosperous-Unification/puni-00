<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

## Why

The notes marker is an 11px muted glyph in the Name cell's corner — invisible
at arm's length, and it is the only sign a row has notes now that the cell
shows the name alone. An affordance nobody sees marks nothing.

This change began as `marker-and-date-polish`, whose second half — calendar
dates fattening every row by wrapping inside the 52px Start and End columns —
landed independently from another session's `compact-columns` while this was
in flight (`short-date.ts`, one-line printed days, the full date in the
title). That half is superseded and dropped; the marker half is what ships
here.

## What Changes

**Notes marker**

- From: 11px, muted, top-right of the Name cell; a click on it dies
- To: 15px bold ink with a padded hit area; a press on it lands the caret in
  the name box it sits on
- Impact: non-breaking

## Non-Goals

- The marker stays no control: no focus of its own, no tab stop, no place in
  the keyboard grid.
- No date-column work — `compact-columns` owns it.

## Constraints

- The marker's hover area stays its own box, so a click aimed at the name
  lands there everywhere else.
- The hover preview's trigger rules (`instant-hovers`) are untouched.

## Capabilities

### New Capabilities

none

### Modified Capabilities

- `wbs-domain`: the notes marker is legible and a press on it reaches the name

## Domain Terms

none new — Notes marker is in CONTEXT.md

## Decisions Recorded

none

## Impact

- `apps/fe-01` only: the marker's style and press in `wbs-table.tsx`, its
  assertions in `wbs-table.test.tsx`.
