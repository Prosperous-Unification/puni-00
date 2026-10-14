# The settings modal while a write travels, and one spelling of a saved moment

## Why

Round 3 of the UI review (puni-plan `ui-review/findings.md`, 2026-10-14) found the commit model
of decision D7 losing the reader's place: every box was `disabled` while its write travelled, so
Enter — the main commit gesture — dropped the focus onto the dialog (F-066); a zone typed while
the zone list loaded could not be applied (F-069); the modal's Undo promised a reach the
toolbar's ↶ does not have, because project settings are not journalled (F-068); the closing
line pushed the tabs down 36px; on a phone the Plan actions sheet showed under a short modal
(F-054); and Saved plans spelt one instant three ways (F-067).

## What Changes

- While a section's write travels its text boxes are read-only and keep the focus; the section's
  panel is `aria-busy`. A control that was disabled gets the focus back once the write is over.
- The Timezone box takes typing while the zone list loads; leaving it or Enter then waits, says
  so, and applies once the list lands (or once Try again succeeds).
- Decision D8: the modal's group revert is named **Put back**, not Undo, and says that the
  toolbar's undo does not reach project settings. Settings writes stay out of the command journal.
- The modal's saving and refusal lines sit at its foot, where they move neither title nor tabs.
- Below 768px the settings modal fills the screen.
- Saved plans say a moment once, as `14 Oct 2026, 06:41`: a plan named by be-01 after its time
  shows that time as its name and no second time on its meta line; the save status names the plan.

## Non-goals

- No change to be-01, the command journal, or the stored default name (assumption A-1).
- No new busy styling beyond the read-only boxes and the section's unsaved-edit dot.

## Impact

`apps/wbs/fe-01`: `components/wbs/{use-settings-section,priorities-panel,estimating-panel,
teams-panel,steps-panel,timezone-panel,project-settings-modal,saved-plan-list,saved-plans-panel,
saved-plan-compare}.tsx`, `short-date.ts`; the `@wbs/domain/saved-plan-default-name` leaf alias in
the fe-01 tsconfigs, `vite.config.ts`, `vitest.config.ts` and `tsconfig.base.json`.
