## Why

The WBS table exposes step progress but lacks a board for seeing planning done
while implementation continues. A board based on scheduled slices would omit
held or unestimated work and could misrepresent progress as readiness.

## What Changes

Add a read-only Board view beside the selected project's existing plan surface.
Each leaf × project step appears once, under Unknown, In progress or Done, with
its work-item status shown separately. Existing plan reads remain authoritative.

The coordinator adopts the recommended defaults under the user's standing
2026-10-06 delegation. The combined brainstorming, grilling and domain-modeling
decisions and counterexamples are recorded in design.md. This fulfills the
bounded design sequence for WBS 010.3.07 → .08 → .09 → .10; no richer step-status
interview outcome is claimed.

## Non-Goals

Board writes, drag/drop, lanes, parent cards, filtering, a new progress state,
scheduler changes, Backlog cutover, new API/storage, persistent view preference,
and automatic agent admission.

## Constraints

Reuse step-node identity and the selected project runtime; keep tree and steps
from one delivered plan. Legitimate absent progress means Unknown; failed reads
must render failure. Preserve the table and existing authorization boundaries.

## Capabilities

### New Capabilities

- `step-progress-board`: read-only project board with stable step-node cards.

### Modified Capabilities

None.

## Domain Terms

Board card, board column, board lane, suspended unsent draft — root CONTEXT.md.

## Decisions Recorded

[ADR 0035](../../../docs/adr/0035-board-cards-project-step-progress.md).

## Impact

WBS frontend project page, a board projection and renderer, an opt-in Plan editing
boundary for draft-preserving view switches, and mounted/browser tests.
No migration, backend change or new runtime dependency.
