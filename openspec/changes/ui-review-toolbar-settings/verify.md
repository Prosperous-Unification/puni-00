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
