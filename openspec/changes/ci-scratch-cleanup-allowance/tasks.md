## Implementation

- [x] Add actual-preload cleanup/remover regression tests and observe the inherited deadline fail.
- [x] Give only the cleanup hook a 30-second allowance.
- [x] Verify success, inherited/reduced hook failures, ordinary hangs and physical removal; observe allowance omission fail.
- [x] Run focused lint, typecheck, classification and OpenSpec validation.
- [x] Obtain peer review and complete normal commit hooks.

## Hosted overrun follow-up

- [x] Update the fast exact-budget regression for 60 seconds and observe it fail against the unchanged 30-second hook. Preserve the existing actual callback, inherited/reduced deadline failures and ordinary 20ms hangs.
- [x] Give only the global scratch cleanup hook 60 seconds and update its budget documentation/adjacent proof. Keep remover behavior, named-test, job and phase limits unchanged.
- [x] Reuse the independently captured 31-second old-hook failure; run the actual revised preload/remover with the same finite latency once, verify physical absence, and retain commands/identities/output/timings outside the default fast suite. Watch a directly covering changed-budget/dependency fault fail and restore it; do not replay unrelated tests.
- [x] Run focused scratch tests, configured lint/typecheck/classification and strict OpenSpec/format checks.
- [ ] Obtain scoped independent review, complete normal commit hooks and record hosted verification separately.
