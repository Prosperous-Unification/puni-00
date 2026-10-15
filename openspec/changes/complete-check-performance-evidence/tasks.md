## 1. Complete check CLI slice

- [x] 1.1 Add source and built executable tests for complete evidence checks, absent/missing/malformed/wrong-candidate/wrong-policy evidence and duplicate/unknown/unrelated-rule flags; watch the positive fail before implementation.
- [x] 1.2 Parse each optional flag once and document evidence in help; preserve existing forms and non-certifying verdicts.
- [x] 1.3 Watch forwarding, binding and flag/selection mutations fail their production-path tests, record adjacent Proof comments and verify.md.
- [ ] 1.4 Run focused Nx test, lint, typecheck, test:package and OpenSpec validation, then commit and push with normal hooks.
