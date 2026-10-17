# Verify

Runs 2026-10-17 in `/home/df/wd/puni/ui-settings-escape` (branch `ui-review/settings-escape` from
main e8894d014), Chromium on Linux, `E2E_PORT_SHIFT=1750`, every command under
`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

## Commands and results

- `bunx nx run-many -t lint:fast typecheck -p wbs-fe-01 --skip-nx-cache`: passed, exit 0.
- `TZ=UTC bunx vitest run` on `project-settings-modal`, `settings-busy`, `priorities-panel`,
  `estimating-panel`, `steps-panel`, `teams-panel`, `use-settings-section`, `plan-cards` and
  `optimization-settings` tests: 9 files / 306 tests passed. The full fe-01 Vitest suites are left
  to CI.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: 249 of 249 valid (231 changes,
  18 specs), exit 0.
- `bunx prettier --check` on the touched files: clean.
- Playwright `settings-layout, settings-vocabulary, project-settings, mobile`: 63 passed (3.1 min),
  exit 0; `settings-vocabulary` again after a lint fix: 13 passed, exit 0.

## R5 proofs (observed failures)

Unit cases were run against e8894d014's `src` (this change's panel and modal edits absent); e2e
cases against e8894d014's `src` with this change's spec. The observed text is also in the adjacent
`Proof:` comment.

- F-110 `priorities-panel.test.tsx` `Escape while the ladder travels…`: `expected 'Critical' to be
'Blocker'`; `estimating-panel.test.tsx` `Escape while the weights travel…`: `expected '4' to be '1'`.
- F-111 `project-settings-modal.test.tsx` `Escape in a box whose ladder travels…` and `a refused
ladder sent again…`: `expected 'Priorities has an unsaved edit. Finis…' to be undefined`.
- F-112 `project-settings-modal.test.tsx` `Escape in one section’s box puts it back there…`:
  `toHaveAttribute("aria-selected", "true")` failed for Timezone.
- F-148 `settings-vocabulary.spec.ts` `on a phone every band names its own numbers`: `Expected:
false Received: true` (the header shown).
- F-157 `settings-vocabulary.spec.ts` `…is the floor’s 22px`: received `13x22` ×4 and `15x22` ×2
  (three reaches, three roundings).
- F-158 `settings-vocabulary.spec.ts` `a locked radio is drawn as a live one is`: dark `Expected:
< 1.1 Received: 1.799…`; light `Expected: > 4.76… Received: 1`. With `outline: none` injected
  into the radio rule, both palettes failed on `Expected: not "none"`.

## Review round (#563, 2026-10-18)

- Blocking 1 `project-settings-modal.test.tsx` `Escape in a refused box after a waiting ✕ puts it
back and keeps the modal`: on 511740151 `expected null not to be null` (the modal closed).
- F-162 `steps-panel.test.tsx` `Escape in a Steps box forgets what was typed there`: on 511740151
  `expected 'Review' to be 'QA'`.
- F-164: the `onEscapeKeyDown` Proof now names the fault its F-111 half needs (both the handler and
  the quiet branch's `leaving &&` guard reverted).
- Runs after the fixes are listed in the lane record and the PR.
