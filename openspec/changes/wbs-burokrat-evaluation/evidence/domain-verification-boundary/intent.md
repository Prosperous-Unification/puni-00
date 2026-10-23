# Domain verification capture boundary

The 847-line SQLite domain claim facade contains a read transaction that captures the verification snapshot before authoritative DNS resolution. Extract that transaction to the sibling `domain-verification.ts` so its activation, membership, scoped lookup and proof validation remain reviewable together.

This is a mechanical extraction. Keep the public repository method and signature, initial microtask yield, transaction lifetime, ordered checks, returned phase fields, refusals, exception text and existing proof comments. Pass the database, organization, actor, claim and policy directory explicitly. The helper stays internal to the adapter and is absent from its barrel. The mounted path remains `domain.routes.ts` → `DomainClaimRepository.readClaimForVerification` → `readVerificationSnapshot`.

No public port, composition, policy cache, memory adapter, DNS behavior or scheduler behavior changes. The scheduler companion at `/tmp/puni-domain-proof-scheduler-types-sol` edits the facade class JSDoc and `finishProofCheck` cancellation; integration must preserve those disjoint edits. WBS090 row `7ad9e8a6-0369-43f0-9711-8d9e687d92a6` remains `blocked_by_proxy`; this extraction does not claim installed F7.
