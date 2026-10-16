## 1. Bounded cancellable sweeps

- [ ] 1.1 Add core tests for batch size, ordered progress, cancellation before commit and unexpected failure; implement the bounded sweep and modeled DNS error boundary.
- [ ] 1.2 Preserve repository snapshot currentness and mounted warning/suspension/manual recovery tests; prove currentness by removing its guard.

## 2. Scheduled lifecycle

- [ ] 2.1 Add injected clock worker tests for immediate sweep, fixed delay, no overlap, bounded eventual progress, cancellation/join and surfaced failure; implement the loop.
- [ ] 2.2 Wire configured authoritative DNS scheduling into boot after schema admission and dispose it before storage. Prove removed startup, overlap and disposal guards fail their production-path tests.

## 3. Review and verification

- [ ] 3.1 Record focused commands and R5 mutations; validate OpenSpec and obtain exact Astra review before pushing.
