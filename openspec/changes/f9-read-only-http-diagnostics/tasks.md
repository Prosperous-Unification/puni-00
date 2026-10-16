## 1. Bounded HTTP evidence

- [x] 1.1 Add observer with first-response identity and bounded stream — tests: response identity, denial/missing root, missing headers/body, oversized/redirected responses; negatives: remove response/body/deadline guards.
- [x] 1.2 Enforce loopback origin and finite bounds — test: invalid request boundaries; negatives: remove origin and bound guards.

## 2. Independent later observations

- [x] 2.1 Record immediate and later verdicts separately through GET-only CLI — tests: denied-then-success, permanent denial; negative: replace initial verdict with later success.
- [x] 2.2 Connect first-failure evidence to checker — test: checker CLI first response failure records evidence before mutation; negative: restore opaque checker failure.

## 3. Scoped validation

- [x] 3.1 Record watched fault injections, focused tests, scoped Nx lint/typecheck/build, formatting and OpenSpec validation in verify.md.

## 4. Review repairs

- [x] 4.1 Refuse ingress credit for transport, deadline and body-limit output from the real checker — test: production checker transport deadline and body-limit failures never earn ingress credit; negatives: route each failure back into the accepted response prefix independently.
- [x] 4.2 Retain streamed root-marker evidence within the body cap — tests: split marker then hang/reset, allowed oversized-chunk prefix; negative: remove incremental marker detection and watch each test fail.
- [x] 4.3 Prove convergence's remaining-window clamps — test: slow initial/final requests and oversized pause; negatives: independently remove initial deadline, final deadline and pause clamps.
- [x] 4.4 Record fresh focused tests, scoped Nx checks, formatting and OpenSpec validation for the review child.
