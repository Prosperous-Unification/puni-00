## Why

Dany finds the Build chat needlessly cluttered (2026-11-22): a repeated tagline, a status badge row, a label on every message, a permanent counter and keyboard hint, two stacked text buttons, a large labelled brief card, and the attribution footer pinned beside the composer. The conversation itself is a minority of the screen.

## What Changes

- Build's thread starts with the conversation: no tagline row and no conversation-level `Simulated` row. `[ Start over ]` remains the only control above the thread.
- Visitor messages are a soft unlabelled bubble. Only the first PUNI reply carries the `PUNI · AI` disclosure; in demo mode every reply keeps its `Simulated` label.
- The composer drops the keyboard hint; the remaining-message count appears only when two or fewer remain.
- `Send my request now` and `Add references or edit brief` share one row.
- The request editor and legacy proposal card drop the bracket heading and visible field labels (kept for assistive technology) and shorten their lead copy.
- The DB-IP credit and Privacy choices move below the full-height conversation, reached by scrolling past the thread.

## Non-Goals

Changing conversation behaviour, limits, routes, copy of replies, the Home page or the private site; removing the AI disclosure, the Simulated label, Start over, privacy links or the DB-IP credit.

## Constraints

Keep 44 px targets, the 320 px layout, the liquid-glass composer, `Enter` to send, the existing Start over, disabled and paused requirements, and the DB-IP visible-link requirement. Every assertion of removed chrome is updated, not deleted, so the tests now prove its absence.

## Capabilities

### New Capabilities

- `build-chat-presentation`: what Build shows around the conversation.

### Modified Capabilities

None. `build-chat-harness` (change build-ai-chat-harness) keeps its requirements; its demo rule "label the conversation and every reply" is met by every reply's label.
