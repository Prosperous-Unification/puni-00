## 1. Restore the finite workspace allowance

- [x] 1.1 Read the hosted cancellation and step timings; record the incomplete verdict.
- [x] 1.2 Set only the workspace timeout to 90 minutes and link the observed evidence.
- [x] 1.3 Check formatting and parse the workflow to confirm the timeout and unchanged commands.
- [ ] 1.4 Commit through normal hooks and observe the hosted run for the new head.

## 2. Align the production entrypoint regression test

- [x] 2.1 Reproduce the stale 60-minute expectation against the restored 90-minute workflow.
- [x] 2.2 Expect 90 minutes for workspace while preserving the 50-minute Twilight assertion.
- [x] 2.3 Watch the focused test fail after regressing the production workspace value to 60, then restore 90 and pass.
- [ ] 2.4 Commit through normal hooks and require exact-head hosted CI plus the canonical h2puni gate before release acceptance.

## 3. Current 120-minute repair (2026-10-30)

The sections above retain historical 60/90-minute repair evidence, including the historical
50-minute Twilight assertion. Current Twilight is 75 minutes. See [repair plan](repair-tasks.md).

- [x] 3.1 Observe the existing policy test fail against production workspace 90 with expected 120.
- [x] 3.2 Set only workspace to 120, retain Twilight 75, and pass both focused assertions.
- [x] 3.3 Prove complete parsed workflow equivalence except workspace 90 → 120; run scoped ESLint, Prettier, OpenSpec and diff checks.
- [ ] 3.4 Controller: complete independent review, exact-head hosted CI and the canonical host gate before release acceptance.
