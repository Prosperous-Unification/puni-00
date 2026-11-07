## Task 1: Bounded Twilight allowance

- [x] 1.1 Update `CI gives the complete uncached gate its chosen finite allowance` in `gate-entrypoints.test.ts` to require Twilight 120 minutes; watch it fail against the production 75-minute workflow, change only that allowance and its factual comment, then run the focused case and the covering workflow suites. Add an adjacent `Proof:` comment and update `docs/findings/ci-gate-duration.md` with the cancelled run and limits of the evidence. Preserve all other workflow behavior.

## Task 2: Verification and integration

- [ ] 2.1 Independently review the exact repair, run formatting and OpenSpec structural validation, and record commands, actual results and the 75-minute production regression proof in `verify.md`. Commit and push with normal hooks. Require successful final-head hosted checks and canonical verification before the authorized merge; retain failed or cancelled historical evidence without crediting it as success.
