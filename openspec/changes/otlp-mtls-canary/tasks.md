# Ordered TDD slices

- [ ] 1. Write production-validator negatives for insecure TLS, hostname bypass, absent client trust, unbounded sessions, changed queue identity, plaintext canary target and signing-key mounts. Watch them fail, implement native TLS manifests and enforcement, then remove enforcement and observe failures again.
- [ ] 2. Write certificate graph and readiness negatives. Install worker cert-manager-only controllers, separate issuers/leaves and external signing/trust declarations. Prove missing dependencies and readiness mutations are rejected.
- [ ] 3. Exercise pinned Collector authentication, missing/unreadable material, renewal, overlap rollover and existing-session expiry; record exact evidence and limits.
- [ ] 4. Attempt two-cluster k3d rehearsal under the shared lock with unchanged memory guards. Prove plaintext isolation, queue recovery and expected-worker alert or record the exact resource refusal, leaving activation pending.
- [ ] 5. Document cutover and rollback. Run scoped tests/lint/typecheck, OpenSpec validation, normal hooks and exact-SHA host gate before claiming completion.
