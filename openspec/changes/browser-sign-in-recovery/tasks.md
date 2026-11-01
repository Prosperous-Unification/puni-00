## Task 1: Local browser cookie reset

- [x] 1.1 Add the shared reset shape, dependency-free backend binding and composition coverage using TDD. Tests: `expires only the three browser session cookies on explicit same-origin reset`, `reset leaves durable sessions and revocations unchanged`, and `password validation is reachable after resetting a stale cookie jar`. Verify both native and OIDC route tables and update the organization route inventory for the new control route.
- [x] 1.2 Prove reset admission on its mounted production path. Tests: `refuses reset without the exact Origin`, `refuses API carriers without clearing browser cookies`, and `refuses reset bodies, queries and unsupported methods`. Remove each new policy/carrier guard independently, watch its negative fail, restore it, and add adjacent observed Proof comments. Run the existing contract, mounting and auth endpoint tests.

## Task 2: State-bound SSO recovery

- [x] 2.1 Write and observe the failing mounted test `redirects a bound callback with an unverifiable predecessor to browser recovery`, then consume/check the login transaction before predecessor admission and implement the fixed recovery redirect. Assert no code exchange, account resolution, revocation or access/correlation/organization cookie clearing. Preserve successful native/OIDC predecessor retirement tests.
- [x] 2.2 Prove `a forged callback cannot trigger browser recovery or consume an honest transaction` and `predecessor-store failure remains a server failure`. Inject bypassed state/binding admission and an unavailable proof store on the real callback path, observe negatives fail, restore checks and record Proof comments. Cover missing/expired binding, mismatched/duplicate state and HEAD alongside the existing concurrent-tab tests.

## Task 3: Sign-in recovery interaction

- [x] 3.1 Add failing API/client and sign-in-card tests for explicit reset after password refusal and the SSO recovery redirect, then implement shared-client reset and its UI. Tests: `offers reset for an unverifiable saved session`, `successful reset invites a fresh login without authenticating`, `reset prevents duplicate requests`, and `reset failure remains visible and retryable`. Cover refusal, network failure, malformed response and unrelated login/provider errors; prove the success-response check by breaking the reset response and observing that no success message appears.
- [x] 3.2 Update the auth integration runbook with the observed symptom and the distinction between local recovery and durable logout. Run an HTTPS browser regression with a fresh diagnostic cookie jar containing stale credentials: follow SSO recovery, reset, then verify a fresh sign-in reaches ordinary credential validation. Credentialed Auth0 acceptance remains explicitly unverified unless a user completes it.

## Task 4: Verification and review

- [ ] 4.1 Run affected backend, frontend and contract test/lint/typecheck/build targets, `bunx nx format:check --all`, and locked OpenSpec validation. Run the required canonical host gate on an isolated h2 or h4 gate tree for the committed SHA, preserving the printed running SHA and any queued-lock outcome. Record commands, results and every observed failure proof in verify.md after implementation; list every skipped or unavailable check.
- [ ] 4.2 Request read-only review of the final diff, resolve material findings, and merge the approved fix after required checks. Verify dev bootCommit and public stale-cookie recovery after merge.
