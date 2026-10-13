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
- Toolbar pins re-pinned to 1339.5 / 1637; an extra `Squad` button failed both
  (`Received: 1406.1875`, `1703.59375`).
