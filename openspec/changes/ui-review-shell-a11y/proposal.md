<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

# Shell honesty and accessibility nits, after the UI review

## Why

The round-4 reviews of #466 and #479 (puni-plan `ui-review/findings.md`, 2026-10-15) left five
findings on the shell and the plan table:

- F-095: a 403, or a 401 without a challenge, on the session read drew the sign-in form under "The
  server returned an unexpected response. Try again." — the outage wording on the branch whose way on
  is the form, and a proxy's refusal presented as a sign-in problem.
- F-096: the Live pill's fact card never said what Live means.
- F-097: below 1440 px Live and Reconnecting differed by dot colour alone.
- F-094: the toolbar's grouping was visual only: no `toolbar` role, no named groups.
- F-091: the Estimate cells' `o/r/p` placeholder drew at 1.96:1 (light) / 2.35:1 (dark) on a banded
  row, with no recorded exception.

## What Changes

- A 403 on the session read draws **Access refused** (something in front of the server refused the
  request), with Try again and no credential boxes. A 401 the contract does not model, with no
  challenge, keeps the form under "You are not signed in."
- The Live fact card leads with what Live means: edits by other people and who is here arrive as
  they happen, then who is here now.
- The link dot is a filled disc while Live and a hollow ring while Reconnecting, same size.
- `[data-toolbar]` is `role="toolbar"` named `Plan`; its end is a group `Whole plan` holding a group
  `Schedule`. The e2e control count no longer counts the `group` role.
- The `o/r/p` placeholder draws at full `--quiet-ink`, like every other placeholder (decision D10).

## Non-goals

- Arrow-key roving inside the toolbar: it holds Find and the start date, whose arrows move a caret.
- A visible `Reconnecting` word below 1440 px (it wrapped the phone header, D9).

## Constraints

Text the reader is meant to read clears 4.5:1 as painted; the 1280 toolbar budgets stay green.
