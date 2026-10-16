# Verify

All runs from the worktree root on `ui-review/shell-a11y` (from origin/main 3e06eb5a4), `E2E_PORT_SHIFT=2900`,
Vitest under `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

## R5 proofs (each watched failing on 3e06eb5a4 or with the named fault)

| Finding | Test                                                                                                                          | Observed failure                                                                                                                                                                                                          |
| ------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-095   | `app.test.tsx` access-refused `.each` (unexpected_status 403, invalid_response 403)                                           | `Unable to find role="heading" and name "Access refused"`; the form drawn under "The server returned an unexpected response. Try again."                                                                                  |
| F-095   | `app.test.tsx` `says you are not signed in above the form for a 401 with no challenge`                                        | `expected 'The server returned an unexpected res…' to be 'You are not signed in.'`                                                                                                                                        |
| F-095   | `e2e/shell-faults.spec.ts` `draws the access-refused state, in the sign-in column, with no form` (403 HTML on `/api/auth/me`) | `getByRole('heading', { name: 'Access refused' })` element(s) not found                                                                                                                                                   |
| F-096   | `presence-panel.test.tsx` roster fact and `says what Live means while nobody has arrived`                                     | `expected 'Live: kat (you), sam' to be 'Live: edits by other people and who i…'`; `expected 'Live: nobody yet' …`; the `data-fact-lead` checks `expected null to be 'Reconnecting'`                                       |
| F-097   | `e2e/shell-faults.spec.ts` `tells Live from Reconnecting by the dot’s shape` (base with only `data-link-dot` added)           | `the reconnecting dot is a filled disc · Expected: false · Received: true`                                                                                                                                                |
| F-094   | `e2e/toolbar-panels.spec.ts` `names the bar and its end groups to a screen reader`                                            | `getByRole('toolbar', { name: 'Plan' })` element(s) not found                                                                                                                                                             |
| F-094   | `e2e/toolbar-controls.ts` count, with the named groups in place and Redo removed                                              | new count: `project-settings.spec.ts` `the toolbar lost controls beyond the three · Expected: >= 17 · Received: 16`; the old count (summing the `group` role) **passed** at 18 — the padding the #466 review warned about |
| F-091   | `e2e/plan-table-review.spec.ts` `the o/r/p shorthand on the band`                                                             | light `Received: 1.9651204134404305`, dark `Received: 2.3547112956191176` (≥ 4.5 expected)                                                                                                                                |

## Commands

- `bunx nx run-many -t lint:fast typecheck -p wbs-fe-01 --skip-nx-cache`: Successfully ran.
- `bunx nx run-many -t test:unit test -p wbs-fe-01 --skip-nx-cache`: 75 files / 940 tests, 208 files / 4130 tests, 4 files / 5 tests passed.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: 215 of 215 passed.
- `bunx prettier --check` on the touched files: clean.
- Playwright, `E2E_PORT_SHIFT=2900`: shell-faults, header, toolbar-panels, plan-table-review, sign-in, mobile, project-settings, optimization-cue: **98 passed (11.2m)**.

## Console

The fixed surfaces log nothing of the app's own. The F-095 captures log Chromium's own `Failed to load resource … 403 (Forbidden)` / `401 (Unauthorized)` for the injected session-read answers, which is the fault itself.

## Not verified

Firefox and WebKit; the h2puni gate (orchestrator); a real screen reader (the roles and names are read from Playwright's accessibility snapshot).
