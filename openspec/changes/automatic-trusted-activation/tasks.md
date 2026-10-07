All slices are unimplemented. Test names below are planned acceptance names, not observed
passes. Execute each slice RED → GREEN → watched safety-check omission → restored GREEN;
record the exact source fault and assertion in verify.md and adjacent production Proof comments.
Keep pure transition rules in Twilight Burokrat and external effects behind mounted adapters.

## 1. Authority and exact requests

- [ ] 1.1 Define and validate bootstrap configuration and canonical request identities — tests:
      `bootstrap refuses unavailable authority` and `request binds repository head base and trust`;
      negatives F1/F2/F3 remove each validation in turn, including distinct absent/unreadable/
      malformed state, wrong issuer, local-cooperative relabel and equal-tree changed identities.
      Select the concrete provider/store adapters without inventing credentials.
- [ ] 1.2 Add durable request stages, compare-and-swap ownership and automatic event/timer
      reconciliation — tests: `duplicate and lost events converge`, `expired worker is fenced`;
      negatives F10/F11 bypass request-key, stage and lease comparisons while two workers race.
      Prove both eligible PR discovery and supersession after head/base movement.

## 2. Independent execution and evidence

- [ ] 2.1 Mount the external cold/informed reviewer and authenticated journal verifier through the
      existing review protocol — test: `installed reviewer proves the exact invocation`;
      negatives F2/F4 substitute nonexistent invocation, wrong executor/obligation, reordered
      phases, absent reads/raw response/telemetry and unresolved findings. Cover absence and
      unreadability separately where the provider distinguishes them. Local mocked evidence
      cannot satisfy the final external-provider acceptance.
- [ ] 2.2 Run selected commands in isolated workers and authenticate measured receipts — tests:
      `installed checks preserve failed and skipped outcomes`,
      `candidate cannot read publisher or mutate journal`; negatives F5/F6 suppress exit/skip
      validation and deliberately expose a harmless sentinel credential/journal capability.
      The sandbox test must observe access denied in production configuration and fail when
      isolation is weakened; do not expose a real credential for fault injection.
- [ ] 2.3 Mount trusted preparation and production launcher self-certification — test:
      `prepared candidate passes production admission`; negatives F7 alter each role binding,
      runtime closure and extraction/descriptor containment guard. Retain existing archive
      and toolkit-release checks; do not execute candidate-owned preparer code with authority.

## 3. Immutable publication and required admission

- [ ] 3.1 Publish authenticated candidate-addressed descriptors and archives — tests:
      `concurrent candidates resolve independently`, `lost publish response resumes exact bytes`;
      negatives F3/F7/F8 remove request/issuer/digest checks and immutable conflict refusal.
      Kill the publisher after the external write and before its durable acknowledgement.
- [ ] 3.2 Wire the production trusted-wiki workflow and host resolver to the trusted selection
      source — test: `required workflow rejects unbound green status`; negatives F7/F9 replace
      the authentic descriptor with a candidate-provided URL, forged App status or changed
      workflow admission output. Preserve the organization-required workflow and verify its
      actual configured identity; a YAML snapshot assertion alone is insufficient.
- [ ] 3.3 Implement bounded retry and crash reconciliation across publication and admission —
      tests: `retry exhaustion stays failed`, `unreadable state never becomes absent`;
      negatives F1/F10/F11 remove attempt/time bounds, swallow read failure and allow stale
      worker advancement. Required diagnostics and immutable evidence survive recovery.

## 4. Merge, merged revision and host

- [ ] 4.1 Coordinate protected automatic merge with exact head precondition and enforced base
      freshness — tests: `head and base races refuse stale merge`,
      `merge-group recomposition requires new evidence`; negatives F12 remove each check
      separately. Prove existing required checks still block merge and crash recovery reads
      actual PR disposition before another merge request.
- [ ] 4.2 Certify the actual merged SHA before downstream admission — test:
      `merged revision cannot borrow PR certificate`; negatives F13 replace the actual SHA
      with PR head, merge-group SHA, ancestor and equal-tree commit in turn. Keep the existing
      `emitIntegrationBinding` sole-parent refusal; ordinary GitHub merge certification must
      not weaken that separate contract.
- [ ] 4.3 Install the same authenticated archive atomically on the host and retain referenced
      evidence — tests: `host consumes CI archive`, `live admission prevents early deletion`;
      negatives F14 remove archive/revision joins and retention-root checks. Missing, unreadable,
      partial and corrupt host installations refuse use and recover from the trusted store.

## 5. Bootstrap and operational closure

- [ ] 5.1 Implement and test the serialized migration through the existing archive route —
      test: `bootstrap transition never admits partial variables`; negatives F15 allow
      admission during a partial three-variable write, incompatible workflow transition or
      unverified read-back. Rollback restores an implementation pin and recertifies current
      candidates; it never substitutes a previous certificate.
- [ ] 5.2 Provision the independently controlled runtime/provider, journal verifier, issuer,
      storage, least-privilege identities and protection through authorized administration.
      This is one-time bootstrap, not a per-PR procedure. Test: authenticated installed-provider
      invocation and real required-workflow refusal/pass at exact SHAs; negative F1/F2/F9 with
      revoked test authority or forged test receipt. Record unavailable access explicitly;
      do not check this box from local fixtures or the presence of variable names.
- [ ] 5.3 Observe an unattended real PR from ready event through review, publication, required
      workflow, protected merge, actual merged-SHA certification and host consumption. Test:
      `ready PR completes without operator intervention`; exercise another concurrent
      candidate and one recoverable interruption. F16: intentionally omit the external
      provider/merged-SHA/host stage and show closure refuses the incomplete evidence.
- [ ] 5.4 Update `docs/runbook-tool-wiki-activation.md`, consumer documentation/template and
      historical `trusted-activation-relocation` / `wiki-release` operator-task ledgers to
      reference the installed automatic path and its exact evidence, without retroactively
      marking their historical commands executed. Refresh the live WBS revision before writing
      030.6 completion; test: `closure requires complete current evidence`, negative F16
      removes the evidence/revision condition. The latest observed inventory has no other
      blocked WBS entries; separate npm-release prerequisites stay separate.
- [ ] 5.5 Run touched tests, source lint/typecheck, OpenSpec validation, independent exact-SHA
      review and `bin/h2puni-gate.sh <sha>` before completion. Record printed running SHA,
      format/test/lint/typecheck/build and OpenSpec outputs, CI-only checks, every accepted
      R5 mutation, restored GREEN and any disqualified trial. Missing tools block the check.
