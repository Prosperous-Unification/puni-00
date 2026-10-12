## 1. Accept padded aliases before emitting them

- [x] 1.1 Extend the existing step-reference parser to accept leading zeroes on positive ordinal aliases while retaining the existing zero, unsafe-integer, reserved-code and ordinal/code mismatch refusals. Keep code-only canonical output. Existing regression suites: `libs/wbs/domain/domain/src/step-reference.test.ts` and `apps/wbs/be-01/src/controller/work-item.controller.test.ts` (CI). The new padded input has no direct test in this slice because the user did not request adding or running tests.

## 2. Record rollout state

- [ ] 2.1 Validate the OpenSpec delta, record CI results and the requirement that the parser release reach production before emitting padded canonical references. Evidence: OpenSpec validation and PR checks.
