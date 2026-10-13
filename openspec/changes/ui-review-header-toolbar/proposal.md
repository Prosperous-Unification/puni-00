# The header, the plan toolbar and the empty home, after the UI review

## Why

The UI review of 2026-10-13 (puni-plan `ui-review/findings.md`) found the app's
chrome breaking at ordinary widths and leaving readers on a blank page: the
project picker shrank to `PUN` at 1024 and to nothing at 900, the roster clipped
to one letter, a phone spent three header rows before the plan, the toolbar's
popovers ignored Escape, and a reader with two projects and a fresh browser got
an empty page on every load (F-004, F-005, F-007, F-010, F-011, F-016, F-017,
F-018, F-019, F-024, F-027, F-028, F-030, F-031, F-041, F-047).

## What Changes

- The header is one row from 900px and two rows below (pages and account, then
  the project). The picker has a 9rem floor with an ellipsis; below `xl` the
  project buttons read `Rename` and `New project` and the roster collapses to a
  dot and a count; below `lg` the brand is visually hidden. Phone project
  controls are 44px tall. The roster reads Online or Offline.
- Every toolbar popover closes on Escape and returns the focus to its summary.
  Tall popovers fit the window and show a scroll shadow where more follows.
- Export / Import is one line and lists plain menu items.
- Starts, Plan with and Reset layout are one group at the end of the bar. The
  start day reads `19 Sep 2026` over the native date field. The Find count sits
  inside the Find box. The unestimated badge announces where it moved the caret.
- With no project open, the page offers the account's projects (most recently
  opened first), Create new project and Import JSON.

## Non-goals

- No automatic opening of a project nobody chose in this browser: choosing among
  several stays the reader's, as `project-page.tsx` has always held.
- No per-account browser memory: the remembered project stays per browser and is
  validated against this account's list, as it was.

## Impact

`apps/wbs/fe-01` only: `components/chrome/*`, `components/presence/presence-panel.tsx`,
`components/wbs/{plan-toolbar,project-page,no-project-open,close-on-dismiss,wbs-table,use-plan-keyboard,short-date,import-with-ai-help}`,
`components/ui/button.tsx`, `styles.css`. Two toolbar width pins in
`e2e/project-settings.spec.ts` and `e2e/optimization-cue.spec.ts` move by 33px.
