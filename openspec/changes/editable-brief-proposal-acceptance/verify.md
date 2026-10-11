# Verification

## 2026-10-11 (branch `batch-10/website-ops-reconcile`)

Local only; the h2puni gate is the orchestrator's. Bun runs used `env -u CLAUDECODE -u CLAUDE_CODE_ENTRYPOINT`.

- `NX_DAEMON=false bunx nx run-many -t lint,typecheck,test -p website-be-01 website-fe-01`: "Successfully ran targets lint, typecheck, test for 2 projects". Direct `bun test`: fe-01 81 pass, be-01 148 pass, 0 fail.
- `bunx @fission-ai/openspec@1.12.0 validate --all --json`: 171 items, 171 passed.
- Browser, scripted-provider stack with ports offset by 3000 (API 6120, app 7220, site 7320), `OPERATOR_PASSWORD` set and the fixture database named: `PUNI_SCREENS_PORT_OFFSET=3000 bun apps/website/fe-01/browser/proposal-flow.mjs` printed `{"ok":true,...}` with a Build and a manual receipt at 1440, 768, 390 and 320 px. Each width: card edit saved on blur, reload kept it, a real storage fault (an `ABORT` trigger on `proposal_submission`) showed the error and no receipt and stored nothing, a double click stored exactly one submission under one key, the manual brief did the same after Save draft and reload, and the operator inbox listed each request once with the edited brief and its line breaks. The 32 screenshots were reviewed by eye.

## R5 proofs

Each fault was injected into production source, observed, and reverted.

| Check                                 | Fault                                     | Observed                                                                                                                                                     |
| ------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Card saves on blur                    | delete `onBlur`                           | `(fail) an edited brief is saved to the draft when the field loses focus, once per change`; the browser flow timed out waiting for the saved line at 1440 px |
| Saved line only after acceptance      | set saved in the catch                    | `(fail) a brief save the API refuses says the edit is not saved and offers no success`                                                                       |
| Privacy line                          | delete the paragraph                      | `(fail) the card names how the email is used and links the privacy page`                                                                                     |
| Storage failure is not success        | catch the store error and answer 201      | `(fail) a storage failure while submitting ...`: Received "null"                                                                                             |
| Operator password required            | disable the `operator_unconfigured` guard | `(fail) operator sign-in without a configured password ...`: Expected 503, Received 401                                                                      |
| No stale "previous submission" notice | (before the fix)                          | `proposal-flow.mjs`: "manual-1440: the refused submission is announced as a previous one"                                                                    |
| Inbox keeps line breaks               | (before `white-space: pre-line`)          | `proposal-flow.mjs`: "Inbox 1440: the brief lost its line breaks"                                                                                            |
