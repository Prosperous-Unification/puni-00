## 1. Establish and rehearse the enforcement contract

- [ ] 1.1 Capture baseline settings and context producers, verify the existing production reducers, and rehearse the exact rules on a disposable target; tests: head-pinned REST merge requests for missing, cancelled and failed required verdicts; negative: remove the isolated target rule and observe the deliberately failing candidate become mergeable there.
- [ ] 1.2 Verify producer binding on an isolated candidate with no Actions verdicts; test: same-name operator statuses cannot satisfy the pinned checks; negative: remove only the isolated producer binding and observe that candidate merge there. Restore the producer constraint before main activation.

## 2. Activate and qualify the main policy

- [ ] 2.1 Create the reviewed main ruleset and read back effective rules; tests: required gate/pixels contexts from integration 15368, exact main scope, no bypass, zero approvals, non-strict base freshness, unrelated tag rules unchanged; negative: actual harmless main merge requests with missing, cancelled and failed verdicts are refused.
- [ ] 2.2 Merge a passing prose-only candidate through the active policy; tests: immutable selection artifact says docs, runtime and browser leaves are skipped deliberately, aggregates pass, no manual review or second PR test run is required, actual accepted merge and main revision are recorded.

## 3. Retain operational knowledge and evidence

- [ ] 3.1 Record settings, live proof responses, timing and honest limitations in verify.md and the operator runbook; tests: focused document checks, repository format, OpenSpec validation and final API readback. Remove disposable policy and close or identify proof PRs; preserve full main checks and existing affected-module behavior.
