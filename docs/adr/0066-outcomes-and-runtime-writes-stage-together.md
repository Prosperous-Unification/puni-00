---
status: accepted
---

# Outcomes and runtime writes stage together

Retain a caller-validated business outcome, its exact canonical WBS write request and its
write obligation in one local transaction. Retain verified receiver acceptance, terminal
acknowledgement and obligation closure in one later transaction. This connects the durable
sender and uncertain-reply recovery path without deciding autonomous business policy in the
same packet. The owner directed continuation after this recommendation on 2026-11-01;
architectural main merge, operator-store migration and production remain separately held.

## Considered options

Separate completion and staging operations require another recoverable intermediate state
and complete cross-history rules; sequencing the writes alone leaves a crash gap. Delivering
the automatic business mapper together would also require decisions about attempt budgets,
success/failure/cancellation evidence and ordered release policy. The selected explicit
producer boundary keeps those requirements visible for their own implementation.

## Consequences

Existing determinate completion still releases local capacity; receiver receipt retention and
remote claim release remain separate facts. Historical generic outboxes confer no permission
to send a WBS request. Fresh staging acknowledgement elects an initial sender; after restart,
an absent ordinary lookup does not prove the request was never sent. A later dominating
receiver fence can establish nonacceptance, leaving an explicit unsendable obligation that
blocks replacement while preserving the preceding capacity status. Automatic continuation
and operator resolution remain required follow-up work, rather than implicit retries.

New stored contracts require explicit preserving migration, genuine predecessor-writer
proofs and refusal of unsafe downgrade. [Journaled recovery](0064-uncertain-runtime-requests-use-journaled-recovery.md)
and [private identity encoding](0065-workflow-ids-use-json-private-keys.md) retain their boundaries.
