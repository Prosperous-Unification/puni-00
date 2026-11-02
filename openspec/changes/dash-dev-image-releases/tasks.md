## 1. Dash release boundary

- [x] 1.1 Implement explicit plan/run grammar, target selection and adapter execution in `src/ops/release.ts`, with lightweight entrypoint dispatch — test: a real fixture adapter receives main/branch arguments unchanged and plan never runs execution; negative: production `dev-fast`, duplicate/missing/unknown flags and unknown targets never invoke the adapter.
- [x] 1.2 Validate protected dispatch configuration and preserve child outcomes — test: full profile and exit-23 fixture; negative: missing, unreadable, malformed, symlink and group/world-readable configuration refuse before the adapter; watch guard mutations fail these production-path tests and document adjacent Proof comments.

## 2. Website release adapter

- [ ] 2.1 Complete the companion `website-fast-image-releases` change: exact configurable refs, focused/full checks, cache closure and selective compilation/image reuse, provenance, pin/push/reconciliation/verification, with original API writer identity preserved — test: companion local-remote and controlled-command integration scenarios; negative: source, identity, cache, environment and failure injections documented in companion verify.md.

## 3. Verification and merge

- [ ] 3.1 Document commands/profile guarantees and adapter configuration, run focused tests and Nx lint/typecheck/build, validate OpenSpec, record all unavailable checks and mutation proofs in verify.md.
- [ ] 3.2 Review both repository branches, run the exact-SHA host gate and required CI, create PRs and merge the authorized changes without bypassing hooks or required checks.
