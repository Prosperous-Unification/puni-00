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
