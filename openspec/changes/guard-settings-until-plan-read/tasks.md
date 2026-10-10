## 1. Initial-read boundary

- [x] 1.1 Guard settings until authoritative priority bands arrive — test: deterministic held-GET browser regression and settings-control unit regression; negative: run the held-GET browser regression against the unguarded production trigger and observe failure, then add the guard and observe success.
- [x] 1.2 Preserve mounted editor drafts — test: existing project-settings unit/browser draft and five-section navigation coverage.

## 2. Verification and integration

- [x] 2.1 Run focused frontend checks and OpenSpec validation, record R5 proof in verify.md, and obtain independent review.
- [ ] 2.2 Push the follow-up PR, pass substantive CI and the exact-head canonical host gate, then merge normally and verify resulting main.
