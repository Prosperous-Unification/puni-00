# Verify

All runs 2026-10-17 in `/home/df/wd/puni/ui-chrome-edges`, Chromium on Linux,
`E2E_PORT_SHIFT=700`, from `origin/main` e8894d014.

## Commands and results

- Vitest, touched files only (the full suite runs in CI): `app-router`, `styles`,
  `button`, `plan-toolbar`, `project-page`, `directory-page`, `completion-prompt`,
  `account-menu`, `saved-plan-compare`, `company-sign-in-link` — 10 files, 260 tests passed.
- `bunx nx run wbs-fe-01:typecheck`, `lint:fast` — passed. `bunx prettier --check` on touched files — clean.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json` — all valid.
- Playwright `gantt.spec.ts -g "opaque hairline" --repeat-each 2` — 2 passed.
- Playwright `dark-mode header toolbar-panels control-edge mobile layout chrome-frames` — 160 passed.
- Playwright `settings-layout settings-vocabulary project-settings directory home sign-in
spaces steps status gantt hints keyboard` — 154 passed, 1 skipped, 2 failed: `home.spec.ts`
  (another worker's project was opened later by the same account; passed alone) and
  `settings-vocabulary.spec.ts` F-123, whose precondition `Estimating fits at 1024×768` now
  holds because the fieldset lost its groove and padding; its viewport moved to 1024×700 and
  both passed on rerun.

## R5 proofs (observed failures)

Each new case was run against the unchanged source, or with the named fault injected:

- F-152/F-137 `Find: outside · Expected: >= 3 · Received: 1.22…` (light), `1.44…` (dark).
- F-154 home card `section[data-no-project-open] · Top edge in its ink oklch(0.129 0.042 264.695)` (light), `oklch(0.984 0.003 247.858)` (dark).
- F-153 frame reset removed: `button[data-gantt-label] · 2px outset`; labels patched past:
  `button "Close" · 2px outset`; only `fieldset` dropped: `fieldset "A dependency waits for…" · 2px groove`.
- F-155 `Plan is not marked · Expected: >= 3 · Received: 1` (both palettes); `no-underline` removed:
  `page links keep the link underline · Received: ["Plan", "Directory", "Spaces"]`.
- F-160 `Expected: ["14px","14px","14px"] · Received: ["12px","12px","14px"]`.
- F-161 glyph column removed: `Collapse all starts elsewhere · Expected: <= 1 · Received: 22`.

Not re-verified: the F-123 case's own proof at its new 1024×700 viewport.

## Round 2 (review of #564: B1, B2, F-166, F-168, F-171), 2026-10-18

- `chrome-frames.spec.ts` now refuses a control box on the surface line and checks the chrome's 6px
  corner on the Board and onboarding. It also sweeps onboarding (`create_organization`,
  `verification_required`, `join_organization`, mocked) and the phone card's Earliest start,
  Priority and Depends on sheets.
- Proofs observed on 555d6fc25:
  - Board: `button "Return to Plan" radius 0px`.
  - Onboarding: `input "" · Top edge on the surface line`.
  - Card sheet: `input[data-cell] "Earliest start for 010"`, `input "Why 010 may not start earlier"`
    and `button "Save"` · `Top edge on the surface line`.
  - With the onboarding fields fixed and its buttons left bare: `button "Sign out" radius 0px` and
    `button "Create organization" radius 0px`.
- Playwright `chrome-frames mobile step-board organization gantt gantt-attempts header control-edge
dark-mode quiet-load`: 171 passed, 1 skipped.
- Vitest: 16 touched files (onboarding, organization gate, Board, Gantt panel, chart seam, attempt
  panel, chrome, app), 678 passed. `typecheck` and `lint:fast` pass, prettier is clean, and
  `validate --all` passes 249/249.
- Not covered by a browser check: the Gantt marker list (Close mark list, ✓ ✎ ◑ ✕), the fault
  cards' Reload and the marker composer. These are code changes only, covered by their unit tests.
