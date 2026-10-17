# The settings modal says when it is saving, and a refusal ends with its hold

## Why

The Fable review of #465 (puni-plan `ui-review/findings.md`, round 4) found two defects in the
settings modal's commit model (decision D7) and three small debts. After Escape put a dirty field
back, the modal's refused flag stayed set, so the next keystroke anywhere showed the red "has an
unsaved edit" sentence while the reader was only typing (F-080). While a write travelled, a
read-only box drew exactly like an editable one and dropped keystrokes with no cue, and the busy
state was never announced (F-081). A peer saving the very zone typed while the zone list loaded
left a stale "applies once the list of zones is read" line (F-082). Two F-067 tests passed only
under `TZ=UTC` (F-083), and `ui-review-settings-flow/verify.md` deferred two results (F-084).

## What Changes

- The modal's refusal ends when the last held section lets go: Escape-revert, then typing, shows
  no refusal.
- A text box in a section whose write travels draws muted (muted fill, quiet ink at 4.5:1 or
  more, progress cursor, no caret); its focus ring stays.
- The modal's foot holds one polite status region for its whole life. It reads `Saving
  <Section>…` while a section's write travels, the closing sentence while a close waits, and
  nothing otherwise, taking no room when empty.
- The Timezone panel drops a wait when there is nothing left to send.
- The two F-067 tests use a local-time instant; the settings-flow verify records its numbers.

## Non-goals

- No change to be-01, the commit model, or which controls are disabled versus read-only.

## Impact

`apps/wbs/fe-01`: `components/wbs/{project-settings-modal,timezone-panel}.tsx`, `styles.css`,
the tests beside them, `e2e/settings-layout.spec.ts`.
