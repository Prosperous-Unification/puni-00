# Starts, Saved plans and the settings modal's commit model, after round 2 of the UI review

## Why

Round 2 of the UI review (puni-plan `ui-review/findings.md`, 2026-10-14) found three
surfaces still speaking a vocabulary of their own: an unset Starts field showed the
browser's `mm/dd/yyyy`, the only US-format date in the app (F-059); the Project settings
modal committed four different ways across six sections — Done, Cancel / Save, live, an
inline Save weights and an inline Save timezone (F-060); and the Saved plans popover was
an unstyled heading, a native button and a bare sentence beside the Views panel (F-061).

## What Changes

- An unset Starts field reads `No start date` in placeholder ink over the native field,
  which stays the click and keyboard target, as the set day already does (F-007).
- The settings modal has one commit model (decision D7 in puni-plan
  `ui-review/DECISIONS.md`): every section applies as its field is left or on Enter; no
  section has Save, Cancel or Done. The priority ladder and the PERT weights still go as
  one request each, when the focus leaves the group, and offer Undo once they land.
  Escape in a field puts that field back. The ✕, a click outside and Escape outside a
  field close the modal, waiting for a write in flight and staying open on a refusal.
- The Saved plans popover takes the Views panel's anatomy: a name field and the primary
  Save, the empty-state line, rows with Compare and a confirmed delete.

## Non-goals

- No change to what be-01 accepts: the optional save name and the delete route exist.
- No draft model for the sections that were already live (Steps, Optimization, the
  rounding): the commit model was chosen to need none (D7).

## Impact

`apps/wbs/fe-01` only: `components/wbs/{plan-toolbar,saved-plans-panel,saved-plan-list,
saved-plan-compare,project-settings-modal,teams-panel,priorities-panel,estimating-panel,
timezone-panel,use-settings-section}.tsx`, `lib/saved-plan-save.ts`,
`modules/saved-plans/*`, `modules/project/composition.ts`. One desktop-density pin in
`e2e/mobile.spec.ts` measures Steps' Add step instead of Teams' Done.
