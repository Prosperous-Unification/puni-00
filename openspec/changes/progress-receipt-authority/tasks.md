## 1. Design packet

- [ ] 1.1 Obtain Astra review of the exact design-only commit; verify that no production schema, crypto, issuer selection, global allocation, code or activation changed.
- [ ] 1.2 Resolve the owner decisions in design.md: issuer scope, custody/invocation, protected policy selection, rotation/revocation, accepted-plan publisher/freshness and publication/replay. Record approved answers without treating this draft as approval.

## 2. Implementation gate

- [ ] 2.1 After owner decisions and architecture review, amend this change or create a separately reviewed implementation change with its exact wire/authority boundaries. Replace this gate with ordered TDD slices naming actual production entry points and watched negatives; do not dispatch implementation from the current tasks.
- [ ] 2.2 Require focused production-path proofs for candidate-controlled trust substitution, altered assertions, unauthorized issuer/scope, forged verifier success and missing/unreadable policy; extend for approved rotation/revocation semantics. Observe each enforcement-path fault before recording adjacent `Proof:` evidence. Preserve legacy schemas and command behavior in regression tests.
- [ ] 2.3 Specify and prove execution truth, current planning authority and atomic publication/replay separately before making those claims. Attribution tests alone cannot close them or WBS080.25.

## 3. Acceptance

- [ ] 3.1 For the future implementation, record exact-head scoped checks, independent review, hosted CI and canonical host gate evidence; distinguish fixture verification from protected installation and live issuer acceptance.
- [ ] 3.2 Reconcile the live WBS only with evidence for the acceptance actually delivered. Keep external trust enrollment, held publication and missing live authority visible.
