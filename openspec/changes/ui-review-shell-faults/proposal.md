<!--
INTENT. Hard cap: 400 words excluding these comments.
-->

# The shell when a tier is down, and the drop cue, after the UI review

## Why

The UI review's round-4 fault probes (puni-plan `ui-review/findings.md`, 2026-10-15) stopped gw-01 and
be-01 under an open page and found the shell telling the reader things it did not know:

- F-079: a reload while be-01 is down (502 on `GET /api/auth/me`) drew the sign-in form under "The
  server returned an unexpected response" — an outage presented as a sign-in problem.
- F-078: with be-01 down and gw-01 up, a write said "The server could not complete that change" while
  the header pill said `● Online`.
- F-077: with gw-01 down, the header read `● Offline  Nobody yet.`, a roster it could not know.
- F-076: a dragged row's drop position (above, below, inside) was drawn in a grey too faint to read
  (2.6:1 on the lit row) and "inside" only as a tint the pointed row shares.

## What Changes

- The session gate draws the sign-in form only when the session read says there is no session (200
  with no user, a refusal, or a 401 the contract does not model). No connection, a 5xx or a reply
  that is not the contract's draws **Server unavailable**: the sentence, a note that signing in will
  not help, and Try again, which reads the session again. No credential boxes.
- Decision D9: the header pill is the **live link** (the plan's stream through gw-01). It reads `Live`
  or `Reconnecting`, never `Online` or `Offline`. Whether be-01 takes a change is the write's own
  sentence and Retry, as before.
- While reconnecting the pill shows no names, no count and no "Nobody yet."; it says who else is here
  is not known until the link is back.
- The drop position draws a 2px `--primary` edge above or below the target, and a 2px outline for
  inside, on top of the tint.

## Non-goals

- No change to be-01, gw-01 or the session contract; no merged "server reachable" signal (D9's reverse
  path).
- No drop cue on the phone: its card renderer has no reorder handle.

## Reverse path (D9)

Pill for both tiers (`Server unreachable` after a failed write): puni-plan `ui-review/DECISIONS.md` D9.

## Impact

`apps/wbs/fe-01` only: `app.tsx`, `components/presence/presence-panel.tsx`, `styles.css`; tests in
`app.test.tsx`, `presence-panel.test.tsx`, `e2e/shell-faults.spec.ts`; `e2e/header.spec.ts` follows
the new pill words. The `ui-review-header-toolbar` change's roster sentence now names `Live` and
`Reconnecting`.
