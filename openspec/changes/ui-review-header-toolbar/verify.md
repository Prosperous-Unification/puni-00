# Verify

All runs 2026-10-13 in `/home/df/wd/puni/ui-header-toolbar`, Chromium on Linux,
`E2E_PORT_SHIFT=550` (500 collided with another lane's gw-01 on 4700).

## Commands and results

- `bunx nx run wbs-fe-01:test --skip-nx-cache` — 74 + 193 + 4 test files passed.
- `bunx nx run wbs-fe-01:test:unit` — 74 files passed.
- `bunx nx run wbs-fe-01:typecheck`, `lint:fast` — passed. `bunx prettier --check` on touched files — clean.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json` — 187/187 valid.
- Playwright: `header, home, toolbar-panels, project-settings, optimization-cue, mobile,
dark-mode, project-picker, plan-import, import-with-ai, name-markdown, tailwind, hints,
directory, spaces, status, plan-surface, keyboard, reference-cell-panel, live-caret,
organization` — 154 passed, 3 failed on the first run (a native `title`, a brand-click
  helper, a focus race in the new F-007 case), each fixed and re-run green (35 passed);
  `layout, gantt, attempts, steps, deadline` — 126 passed, 1 skipped.

## R5 proofs (observed failures)

Each new browser case was run against `origin/main` (worktree `ui-header-toolbar-base`) or
with the named fault injected; the observed text is the adjacent `Proof:` comment:

- F-028 all five panels `open=true focused=false`; unit: `expected true to be false`, and
  the `defaultPrevented` guard dropped `expected false to be true`.
- F-030 `Columns is clipped by 162px`; cue `Received string: "scroll"`.
- F-004 `Expected: 1 · Received: 2`; F-031 seven bordered items listed.
- F-005 `planWith: 85, resetTop: 85` against Starts 49.
- F-016 Undo moved `876.09375` → `950.609375`. F-007 `element(s) not found`.
- F-011 `1024: picker 53px`, `900: picker 26px`, no ellipsis at 1280/1024/900.
- F-010/F-041 heights `[32, 32, 32]`; F-047 header `101`.
- F-017 `lit: false`; `border: "2px"` with `border-0` dropped.
- F-018 `Unable to find … heading … "Offline"`; presence slot `expected [ …(3) ] to deeply equal []`.
- F-019/F-027 `Unable to find role="region" and name "No project open"` (Vitest and browser).
- F-024 `expected null not to be null`.
- Toolbar pins re-pinned to 1332.5 / 1630, itemised child by child against origin/main
  (Export +45.41, icons −18, schedule group ±0). An extra `Squad` button failed both
  pins at the earlier figures (`Received: 1406.1875`, `1703.59375`).

## After the Fable review (2026-10-13)

- Merged `origin/ui-review/phone` (#399); the toolbar's fragments now serve both
  faces: the Find count sits in the box on the desktop bar and on its own line in the
  sheet; the schedule group is the desktop return's; square icon buttons are desktop
  only; the sheet's in-place panels drop the window cap and the scroll shadow.
- F-011 test now measures the roster's own section (it measured the Saved plans
  shelf). With the collapse back at `xl` it failed on `1280: cut local-dev (you)`;
  the roster now collapses below 1440 and wraps whole names.
- Escape after Tab-out: a panel closes when the focus leaves it (unit: `expected true
to be false` without the listener; browser: `Expected: false · Received: true`).
  One panel at a time: without the toggle listener the keyboard case listed both
  `Filters` and `Views`.
- The focusout close first closed on the event's `relatedTarget`; in the phone sheet a
  tick-box label click passed the focus through the sheet's surface and `mobile.spec.ts`
  `makes the row of a tick box the tick box` crashed the tab (3/3). It now judges where
  the focus landed a task later; mobile, toolbar-panels and import-with-ai: 39 passed.
- Sheet panels: with the sheet rule's reset taken out, `Received: "640px"`.
- Import JSON from the No project open card opens the imported project
  (`e2e/home.spec.ts`).
