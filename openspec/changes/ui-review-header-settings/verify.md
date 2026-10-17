# Verify

Runs 2026-10-16 in `/home/df/wd/puni/ui-header-settings` (branch `ui-review/header-settings` from main
3e06eb5a4), Chromium on Linux, `E2E_PORT_SHIFT=2500`, every command under
`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

## Commands and results

- `bunx nx run-many -t lint:fast typecheck test:unit test -p wbs-fe-01 --skip-nx-cache --parallel=1`:
  all five tasks succeeded, exit 0.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: 215 of 215 valid (197 changes, 18 specs).
- Playwright `settings-vocabulary, settings-layout, project-settings, header, toolbar-panels, mobile,
dark-mode, gantt-legibility, gantt-detail, optimization-cue`: 117 passed (14.0 min), exit 0.
- Playwright `sign-in, gantt, steps`: 69 passed, 1 skipped (8.7 min), exit 0.

## R5 proofs (observed failures)

- F-116 `header.spec.ts` (light, dark): on 3e06eb5a4 `Expected: >= 3 Received: 1` / `1.175…`; with the
  selector `outline` and `PRESSED` removed from `buttonVariants`, `Received: 1` in both palettes.
- F-117 `settings-vocabulary.spec.ts`: without `border-0` on the tabs, six `"2px"` against `"0px"`.
- F-118 `steps-panel.test.tsx`: on 3e06eb5a4 `Unable to find an element with the text: fixed by 2
estimates`. `settings-vocabulary.spec.ts`: with the disabled-radio rule disabled, `Received: 1.437…`
  (light) and `2.431…` (dark).
- F-119 `optimization-settings.test.tsx`: `expected [ 'Fast', 'Pri', 'Time' ] to deeply equal [ 'Fast',
'Priority-first', 'Finish-first' ]`; the e2e disc check with the rule disabled: `1.437…` / `2.431…`.
- F-120 `priorities-panel.test.tsx`: `expected null not to be null`; e2e at 1440 and 375: `Received: null`.
- F-121 `priorities-panel.test.tsx`: `Unable to find an element with the text: /in the Priority column
puts on a row/`.
- F-122 `project-settings-modal.test.tsx`: `expected [ 'Schedule optimization' ] to deeply equal []`.
- F-123 `settings-vocabulary.spec.ts`: `Expected: >= 23 Received: 0`.
