## Follow-on prerequisite: invitation delivery eligibility

This packet is deliberately outside the verification SMTP implementation. PM
selected verification-only scope on 2026-10-16 after independent Astra review
confirmed that invitation acceptance can beat failed-delivery compensation.

### Existing race

`InvitationRepository.accept` does not inspect delivery state. The invitation
row is committed before awaiting `EmailDelivery`, so a real recipient who sees
the code before a lost final SMTP acknowledgement can consume the offer.
`failDelivery` later revokes it but does not remove the membership already
created. The same offer path is used by approved join requests. Verification is
different: `EmailVerificationRepository.confirm` requires delivered state.

### Future contract to review

Newly issued invitations need durable pending/delivered/failed eligibility;
acceptance must require delivered in the same consuming transaction. Mark
success only after final relay acceptance, and retain failure revocation/request
compensation. No schema default may make new or predecessor-written offers
eligible without delivery. A crash between relay ACK and delivery-state commit
must leave a safely unusable offer; do not secretly resend.

A future additive migration and paired down.sql must specify eligibility of
legacy offers without inventing historical delivery evidence (unknown remains
unknown), predecessor writers/readers during blue/green overlap, and
rollback after new pending offers exist. Merely adding a new-reader predicate
cannot protect old acceptance code. Database enforcement or an explicit,
provable deployment fence must cover it. If schema triggers are considered,
prove old consuming UPDATE plus membership insertion rolls back atomically, and
model the older binary's refusal semantics accurately.

### Required independent proofs

- Capture-before-final-ACK cannot consume, grant membership or verify identity.
- Final ACK followed by delivery-state write allows exactly one current verified
  recipient to consume; expiry/revocation/current authority continue to apply.
- Missing ACK, disconnect, timeout, crash and failed state-update leave no usable
  pending offer; compensation and newer-request races remain observable.
- Exact predecessor binary against upgraded schema cannot issue eligible unsent
  offers or consume pending offers; new binary/old writer and overlapping
  processes are exercised.
- Rollback refuses unsafe state or preserves the same consumption barrier;
  watched faults remove each eligibility/compatibility barrier and fail the
  corresponding consuming test.

Until that separately reviewed release is accepted, boot always refuses
invitation-purpose delivery, including join approvals, with zero SMTP traffic.
SMTP verification evidence cannot complete WBS010.5.4 or its invitation tasks.
