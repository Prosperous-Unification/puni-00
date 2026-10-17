# A pressed toggle looks pressed, and the settings modal speaks the app's control vocabulary

## Why

The round-5b eye review of main 3e06eb5a4 (puni-plan `ui-review/findings.md`, F-116 to F-123)
found the header's Plan / Board selector drawing both buttons as the same filled primary, so only
`aria-pressed` said which view was shown (F-116). In Project settings, the section tabs wore the
platform's 2 px button border (F-117); a step's locked `workdays / minutes` radios gave their
reason only in a hover title and drew checked and unchecked as two greys 1.44:1 (light) and
2.43:1 (dark) apart (F-118); the Optimization radios read `Pri` and `Time` (F-119) under the
only section heading of the six (F-122); the priority ladder had no visible column header (F-120)
and its copy said "Prio column" (F-121); and at 1024×768 a scrolling section ended its last line
on the box's edge (F-123).

## What Changes

- Every `aria-pressed="true"` button is drawn filled in the primary, whatever its variant. The
  header selector, the toolbar's Gantt toggle and the Gantt strip's toggles all follow it; the
  selector's buttons are `outline` when not pressed.
- The settings tabs draw no border. A locked unit shows "fixed by N estimates" under its radios,
  as the group's description. A disabled radio is drawn by the palette, so checked and unchecked
  differ by at least 3:1.
- The Optimization radios read `Fast · Priority-first · Finish-first`, and Optimization has no
  heading of its own. The ladder has a visible, aria-hidden header row `Band · Starts at · Holds ·
Writes`, and its copy says "Priority column". The section box ends with 24 px of padding.

## Non-goals

- The optimization cue's pill keeps `Pri` and `Time` (Dany, 2026-09-08); only the settings
  radios change.
- No change to which controls are disabled, to be-01, or to the settings commit model.

## Impact

`apps/wbs/fe-01`: `components/ui/button.tsx`, `components/wbs/{project-page,gantt-panel,
project-settings-modal,steps-panel,priorities-panel,optimization-settings,optimization-words}`,
`styles.css`, the tests beside them, `e2e/header.spec.ts`, `e2e/settings-vocabulary.spec.ts`,
`e2e/project-settings.spec.ts`.
