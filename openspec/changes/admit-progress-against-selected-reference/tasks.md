## 1. Bound receipt and producer

- [x] 1.1 Add schema 2 receipt with digest binding while preserving schema 1 decoding/conversion.
- [x] 1.2 Add explicit Dash record-progress-v2 production.

## 2. Selected reference admission

- [x] 2.1 Add strict admit-progress CLI with both reference digest comparisons and existing consistency before exclusive output.
- [x] 2.2 Exercise real v9 blockedAt-only export divergence and required refusal cases through production paths.
- [x] 2.3 Observe guard mutations fail, add adjacent Proof comments and record focused verification and limits.

## 3. Exact-head review correction

- [x] 3.1 Enforce schema 2 receipt/reference digest equality in the shared consistency checker, preserving schema 1.
- [x] 3.2 Prove both production CLI consumers refuse real blockedAt-only A/B substitution without output, then observe the removed guard fail both negatives and restore it.
- [x] 3.3 Record focused verification and publish the corrected exact head for review.
