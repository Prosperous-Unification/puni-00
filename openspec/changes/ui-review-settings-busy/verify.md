# Verify

Runs 2026-10-16 in `/home/df/wd/puni/ui-settings-busy` (branch `ui-review/settings-busy` from main
3e06eb5a4), Chromium on Linux, `E2E_PORT_SHIFT=750`, every command under
`env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

## Commands and results

- `bunx nx run-many -t lint:fast typecheck -p wbs-fe-01 --skip-nx-cache`: passed, exit 0.
- `bunx nx run wbs-fe-01:test:unit --skip-nx-cache`: 75 files / 940 tests passed, exit 0.
- `bunx nx run wbs-fe-01:test --skip-nx-cache`: the UTC run passed 75 files / 940 tests, the
  `TZ=Pacific/Auckland` run 208 files / 4129 tests and the last run 4 files / 5 tests, exit 0.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: 215 of 215 valid (197 changes,
  18 specs), exit 0.
- `bunx prettier --check` on the touched files: clean.
- `TZ=<zone> bunx vitest run saved-plan-list.test.tsx saved-plans-panel.test.tsx` under
  Europe/Kyiv, UTC, Pacific/Auckland and America/Los_Angeles: 35 of 35 passed in each.
- Playwright `settings-layout, project-settings, steps, attempts, mobile, layout`: 115 passed (15.4 min), exit 0.

## R5 proofs (observed failures)

Each case was run against 3e06eb5a4, with this change's `project-settings-modal.tsx`,
`timezone-panel.tsx` and `styles.css` reverted, or with the named part removed. The observed text
is also in the adjacent `Proof:` comment.

- F-080 `project-settings-modal.test.tsx` `typing after an Escape put a field back raises no
refusal`: `expected <p role="alert" …(2)></p> to be null`.
- F-081 `project-settings-modal.test.tsx` `says, politely, which section is saving`: `expected
undefined to be 'status'`. `settings-layout.spec.ts` (light and dark): `expect(locator).toBeVisible()
failed … element(s) not found` for `Saving Priorities…`. With the status in place and the busy
  style removed, the same case failed on `Expected: "progress" Received: "text"`.
- F-082 `settings-busy.test.tsx` `stops waiting when a peer saves the very zone that was typed`:
  `Unable to find an element with the text: Saved as Europe/Kyiv.`
- F-083 under `TZ=Europe/Kyiv`, before the change: `expected 'before the re-plan4 Sep 2026, 09:00
s…' to contain '4 Sep 2026, 06:00 saved by ada'` and `expected 'Saved 4 Sep 2026, 09:00.' to be
'Saved 4 Sep 2026, 06:00.'`.
