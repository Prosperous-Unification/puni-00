<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

# Sign-in edges, one signed-out anchor, Full's scroll and the drop cue, after the UI review

## Why

The UI review's round 5b (puni-plan `ui-review/findings.md`, 2026-10-16, on 3e06eb5a4) found:

- F-124: the sign-in page's Continue with SSO is an `outline` button that paints no border (1.08:1
  light, 1.01:1 dark against the card), and the app's other outline buttons draw a 1.2:1 hairline.
- F-125: the word mark stands 96px lower on Server unavailable than on Sign in at every width, so a
  Try again that succeeds jumps the page's one landmark.
- F-126: Gantt › Full drops the chart's horizontal scroll on the way in and again on the way out.
- F-128: the `below` drop line spans the whole row, so the gap under a last child reads the same for
  "last child of 010" and "before 020".
- F-129: after a drop, a tool hint's wait ring stands beside the handle the drag began on, and its
  card opens there two seconds later.

## What Changes

- Every `outline` control draws a 1px edge at 3:1 or more on what it stands on and on its own fill,
  in both palettes (`--control-edge`); `buttonVariants` merges its classes for every caller.
- Decision D11: one top anchor for every signed-out card (sign-in, server unavailable, access
  refused): the word mark never moves between them. Shorter cards stand higher than true centre.
- Full carries the chart's horizontal offset into the new box and back out; the caption still names
  the month of the box on screen.
- The `above` and `below` line starts at the outline's leading edge for the depth the drop lands at.
- From a drag's start until the pointer really moves (or a key is pressed after the drop), the hint
  layer ignores the pointer's stale position and the focus the drop hands back to the moved row.

## Non-goals

- `--input` (text boxes' hairline) is unchanged; whether text boxes need a 3:1 boundary is a separate
  question.
- No drop cue on the phone (no reorder handle there).

## Reverse path (D11)

Per-card centring (each card padded by half its own height), accepting a 96px jump on Try again:
puni-plan `ui-review/DECISIONS.md` D11.

## Impact

`apps/wbs/fe-01` only: `components/ui/button.tsx`, `styles.css`, `app.tsx`, `components/wbs/
gantt-panel.tsx`, `drag-drop.ts`, `wbs-table.tsx`, `hint.tsx`. The `ui-review-shell-faults` outage
scenario now asks for the shared anchor instead of 48px of vertical centre.
