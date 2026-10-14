# Verify

All runs 2026-10-14 in `/home/df/wd/puni/ui-toolbar-settings` (branch `ui-review/toolbar-settings`
from `ui-review/integration-1` abd06e9ad), Chromium on Linux, `E2E_PORT_SHIFT=1300`.

## Commands and results

- `bunx nx run wbs-fe-01:test --skip-nx-cache` — see the lane record for the run on the final head.
- `bunx nx run wbs-fe-01:typecheck`, `lint:fast` — passed. `bunx prettier --check` on touched files — clean.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json` — 193/193 valid.
- Playwright `attempts, project-settings, steps, settings-layout, mobile, layout, header,
toolbar-panels` — 133 passed, 1 failed (`attempts.spec.ts` waited for the removed `Save
timezone`; updated to the hint line, re-run 3/3 green).

## R5 proofs (observed failures)

Each new case was run against the code before this change (files restored from the branch
base) or with the named fault injected; the observed text is the adjacent `Proof:` comment.

- F-059 `toolbar-panels.spec.ts`: `element(s) not found` for `[data-start-day]` on an unset day.
- F-061 `toolbar-panels.spec.ts`: `[data-saved-plans-panel] has no name field`; unit cases:
  no `Name this plan` textbox, no `Compare … with the current plan`, no `Delete saved plan …`;
  the left side not moved after the reader's own delete: `expected 'current' to be 'sp1'`.
- F-060 unit: Teams/Estimating/Priorities footers `expected <button …(2)></button> to be null`;
  Enter sent nothing `expected undefined to be 'Blocker'`; no `Undo the weights`; the modal
  listed `Teams: Done`, `Priorities: Cancel`, `Priorities: Save`, `Estimating: Save weights`,
  `Timezone: Save timezone`; the close-once-clear effect removed: dialog still open after the
  write landed (✕ and Escape cases). Browser (`settings-layout.spec.ts`): the ✕ over a typed
  band left the dialog visible on the old ladder.

## Review fixes (Fable review of #453 @6d4d02f33)

- Blocking 1: sections report a write in flight apart from a draft (`onBusyChange`); leaving
  over writes that are only travelling waits quietly (`Saving Teams. The window closes when it
lands.`) instead of switching section and showing the refusal. `project-settings-modal.test.tsx`
  `leaving over a write in flight says it is saving, not that an edit is unsaved` and the
  reworded `an in-flight write holds the modal open and says it is saving` both failed on
  6d4d02f33 with `expected <p role="alert" …(1)></p> to be null`.
- D: the Saved plans delete question takes the focus on Keep, Escape answers Keep and returns the
  focus to the ✕. Unit case failed on 6d4d02f33 with `expected false to be true` (Escape left
  unhandled); browser case `the Saved plans delete question keeps the keyboard inside the popover`
  failed with `toBeFocused() failed … element(s) not found` (the popover had closed).
