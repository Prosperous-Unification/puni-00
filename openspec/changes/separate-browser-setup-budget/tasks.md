## 1. Bounded browser validation

- [x] 1.1 Add a production-workflow budget contract to `pixels-workflow.test.ts`, observe red on the old workflow, then declare job/setup/layout/organization limits of 50/15/25/5 minutes. Preserve all existing scope and execution contracts. Negative: remove each phase allowance and the whole-job allowance, and restore the old 25-minute job cap; observe the real-YAML contract fail for every fault, restore green, then add truthful adjacent Proof comments. Run focused workflow tests, affected lint/typecheck and formatting.
- [x] 1.2 Prove deadline enforcement on an isolated, manually dispatched Actions proof branch derived from the candidate declarations. Use shortened test-only bounds and bounded delayed dependencies for job/setup/layout/organization controls; verify deadlines stop work and later validation markers stay absent. Remove each bound in paired controls and observe the deadline-expected oracle fail when the same delay completes. Retain a fast green control, exact branch/run/job identities and timings. Do not modify main, settings, secrets, test selection or deploy anything.

## 2. Review and final verification

- [x] 2.1 Record commands, original three timeouts, declaration mutations, Actions faults/controls and limitations in `verify.md`; obtain one scoped review and address blocking findings. Validate OpenSpec and normal commit hooks. Finish the local implementation and proof record before publication.

Final acceptance follows publication: publish the correction once with the delivery PR, obtain actual complete browser and required gate verdicts on the final head, and retain the external receipt on the PR without an evidence-only source commit. Merged under the 2026-10-24 goal; deployment stays outside this change.
