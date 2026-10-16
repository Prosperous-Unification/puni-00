## 1. Bounded cancellable sweeps

- [x] 1.1 Add runtime and repository tests for batch size and ordered progress, including failed proofs; bound lookup/commit work after full trusted-state validation. Database reads remain unbounded.
- [ ] 1.2 Add core tests for cancellation before commit and unexpected failure; implement the modeled DNS error boundary. Core cancellation and typed error handling are implemented; adapter subclass wiring awaits review.
- [x] 1.3 Preserve repository snapshot currentness and mounted warning/suspension/manual recovery tests; prove currentness by removing its guard.
- [x] 1.4 Forward cancellation through queued completion, check it at immediate transaction entry and return explicit cancelled counts; repository integration tests prove stop joins, both matching/missing TXT preserve day-fourteen state and already-admitted synchronous commits remain truthful.

## 2. Scheduled lifecycle

- [x] 2.1 Add injected clock worker tests for immediate sweep, fixed delay, no overlap, bounded eventual progress, cancellation/join and surfaced failure; implement the loop.
- [ ] 2.2 Wire configured authoritative DNS scheduling into boot after schema admission and dispose it before storage. Prove removed startup, overlap and disposal guards fail their production-path tests.

## 3. Review and verification

- [ ] 3.1 Record focused commands and R5 mutations; validate OpenSpec and obtain exact Astra review before pushing.
