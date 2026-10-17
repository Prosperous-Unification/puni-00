# Verify

Runs 2026-10-14 in `/home/df/wd/puni/ui-settings-flow` (branch `ui-review/settings-flow` from
`ui-review/integration-2` 85849d1f3), Chromium on Linux, `E2E_PORT_SHIFT=1700`, every command under
`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

## Commands and results

- `bunx nx run-many -t lint:fast typecheck -p wbs-fe-01 --skip-nx-cache` — passed.
- `bunx prettier --check` on touched files — clean.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json` — 200 of 200 valid (182 changes, 18
  specs), exit 0.
- Playwright `settings-layout, toolbar-panels, mobile, keyboard, project-settings, attempts, steps,
hints` — 95 passed, 2 failed in `mobile.spec.ts` (`keeps the focus and the half-typed word when
somebody else edits another card`, `reads every priority band chip on a card at 4.5:1`); both
  fail the same way on the branch base 85849d1f3 with this change's source stashed, so they are
  not this change's.
- `bunx nx run wbs-fe-01:test` on the final head — the UTC run 74 files / 935 tests and the
  `TZ=Pacific/Auckland` run 205 files / 4028 tests, all passed (results recorded here by
  `ui-review-settings-busy`, F-084, from the lane record).

## R5 proofs (observed failures)

Each case below was run against 85849d1f3 (this change's source stashed) or with the named fault
injected; the observed text is in the adjacent `Proof:` comment.

- F-066 `settings-layout.spec.ts` `Enter in a band keeps the caret in the box`: `toBeFocused()
failed … Received: inactive` (the disabled band gave the focus away and did not get it back).
- F-066 `settings-busy.test.tsx`: four boxes `expected true to be false` for `:disabled`; the
  focus return removed: `expected <body> to be <button>`; the steps one-write guard removed:
  `expected "vi.fn()" to be called 1 times, but got 2 times`.
- F-069 `settings-busy.test.tsx`: `expected true to be false` (box disabled while loading) and
  `Unable to find a label with the text of: Timezone` (failed list took the box away);
  `settings-layout.spec.ts`: `locator.fill: Test timeout of 60000ms exceeded`, `element is not enabled`.
- F-068 `priorities-panel.test.tsx`: `Unable to find an accessible element with the role "button"
and name "Put back the previous ladder"`.
- Review nit `settings-layout.spec.ts`: `Expected: 150, Received: 186` (tab list y while saving).
- F-054 `settings-layout.spec.ts`: `{ top: 41, bottom: 455 }` against `{ top: 0, bottom: 812 }`.
- F-067 `saved-plan-list.test.tsx`: `expected 'before the re-plan9/4/2026, 6:00:00 A…' to contain
'4 Sep 2026, 06:00 saved by ada'`; `saved-plans-panel.test.tsx`: `expected 'Saved before the
re-plan at 9/4/2026,…' to be 'Saved “before the re-plan”.'`.
