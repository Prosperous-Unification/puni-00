No slice is complete. Test names below are acceptance targets; partial local evidence is
recorded in verify.md. Execute each slice RED → GREEN → watched safety-check omission → restored GREEN;
record the exact source fault and assertion in verify.md and adjacent production Proof comments.
Keep pure transition rules in Twilight Burokrat and external effects behind mounted adapters.

## 1. Authority and exact requests

- [ ] 1.1 Define and validate bootstrap configuration and canonical request identities — tests:
      `bootstrap refuses unavailable authority` and `request binds repository head base and trust`;
      negatives F1/F2/F3 remove each validation in turn, including distinct absent/unreadable/
      malformed state, wrong issuer, local-cooperative relabel and equal-tree changed identities.
      Select the concrete provider/store adapters without inventing credentials.
      Bind typed PR/merge-group/protected-revision subjects and qualified target refs in the
      canonical hash, current-request validation and receipt/descriptor contract. Tests:
      `same commits do not alias different PR subjects`,
      `PR and protected revision cannot share approval`,
      `retargeting the same base changes admission`,
      `ordered group members bind the request`, and
      `old request schema cannot acquire default authority`. F3 omits each discriminator,
      subject member, ordered-member binding or target-ref join separately; test both canonical
      identity and installed current-request refusal so a hashing-only check cannot mask a
      missing admission comparison.
- [ ] 1.2 Add durable request stages, compare-and-swap ownership and automatic event/timer
      reconciliation — tests: `duplicate and lost events converge`, `expired worker is fenced`;
      negatives F10/F11 bypass request-key, stage and lease comparisons while two workers race.
      Prove both eligible PR discovery and supersession after head/base movement.
      Mount ingestion/reconciliation and durable effects for
      `webhook and polling converge on one request`,
      `conflicting delivery reuse is refused`,
      `delayed events cannot supersede another subject`, and
      `returning candidate never revives its old worker`. Keep authenticated delivery/run/time
      metadata outside request identity. F10 separately removes payload-digest conflict refusal,
      logical-subject scoping, authoritative current-state reconciliation and durable generation
      advancement for A → B → A; F11 removes the obsolete worker's effect fence. Assert durable
      records and publication/merge call counts, not only pure planner return values.
      Persist per-subject high-water generation and closed-subject tombstones independently
      of the active pointer. Tests: `close and reopen retain generation history`,
      `current request separates authority and audit generation`, and
      `older source response refetches after subject advancement`. F3/F10 omit each independent
      authority/generation comparison, reset history on close, or accept an unfenced external
      read. Mount overlapping provider reads with two durable store owners; do not hold a SQLite
      transaction across the provider await. Define guarded transition and obligation/effect
      storage contracts here; unimplemented later-stage proof paths must refuse advancement.

### First installed-provider increment within 1.2

These ordered ordinary-PR slices refine 1.2; completing them does not complete 1.2 or 030.6.
Use the typed ports and boundaries in [design](design.md#bounded-ordinary-pr-observation-increment).

- [ ] 1.2a Mount a read-only provider boundary into `readyCandidates` and `currentCandidate`.
      First prove `ordinary PR provider refuses foreign and malformed responses` and
      `pagination ambiguity never becomes empty discovery`; then implement consumed-field
      validation, exact configured repository/PR/target/head/base joins, explicit source/fork
      policy and bounded same-origin pagination. Remove each independent guard under F10-P1/P2;
      assert no request or closure from the rejected observation. Unsupported subject kinds,
      authentication/rate-limit failure and ambiguous absence refuse, without default authority.
- [ ] 1.2b Mount discovery and current reads into the durable controller's reconciliation tick.
      First prove `timer discovers an ordinary PR without delivery`,
      `current read replaces stale discovery`, `lost close supersedes durable active PR`,
      `draft and ready preserve generation history` and `ambiguous current read preserves state`.
      F10-P3/P4 separately bypass active-subject reconciliation, authoritative refetch and
      confirmed-ineligibility handling. Assert persisted request identity, current flags,
      high-water history and absence of publication/merge capability, not only adapter output.
- [ ] 1.2c Prove held provider reads with two durable owners and crash/reopen:
      `held current response cannot revive an obsolete generation` and
      `provider retry is bounded without a transaction across awaits`. F10-P5/F11-P1 remove
      subject-version/refetch and retry bounds separately. Retain fault output and restored
      GREEN; classify API/authentication/scheduler deployment as unverified by synthetic tests.
      Keep webhook verification, merge groups, protected revisions and live timer installation
      for later 1.2 slices; do not add write credentials, workers, publication or merge here.
- [ ] 1.2d Implement the GET-only GitHub REST reader behind the existing source port.
      First mount fake-HTTP list/current responses through the durable owner, including an
      anonymous public read and an optional trusted token. Require fixed API origin/version,
      JSON accept, redirect/cache refusal, same-origin validated Link metadata with locally
      reconstructed next page, finite page/response-byte/deadline bounds and abort through
      body consumption. A non-200 status, inaccessible PR, malformed body or ambiguous rate
      limit must never become empty discovery or closed state. Watch isolated status, Link
      origin/path/query/page, redirect, body cap, abort and token-leak faults, then restore
      the same mounted tests. Keep live credentials, one-tick service and webhook deployment
      open; this adapter has no write or merge capability.

## 2. Independent execution and evidence

- [ ] 2.1 Mount the external cold/informed reviewer and authenticated journal verifier through the
      existing review protocol — test: `installed reviewer proves the exact invocation`;
      negatives F2/F4 substitute nonexistent invocation, wrong executor/obligation, reordered
      phases, absent reads/raw response/telemetry and unresolved findings. Cover absence and
      unreadability separately where the provider distinguishes them. Local mocked evidence
      cannot satisfy the final external-provider acceptance.
      Execute these bounded components in order; none alone closes 2.1.
      First, freeze stable `reviewId` on exactly one cold/informed pair and define immutable
      `(requestIdentity, reviewId, attempt) -> invocationId` registration. Tests:
      `selected review pair has exactly one phase each`,
      `different reviews cannot borrow cold evidence`,
      `new review attempt retains selection and old evidence`, and
      `legacy obligations cannot acquire guessed pairing`. F3/F4/F10 independently remove
      pair/cardinality, registration conflict, attempt and legacy-refusal guards. Reserve
      registration before any dispatch; a receipt must not create its own authority.
      Second, compose the read-only external-verifier adapter with controller receipt recording,
      using existing review/phase schemas. Tests:
      `one invocation completes only its authenticated phase pair`,
      `phase relabel cannot satisfy the other obligation`,
      `informed completion binds its paired cold artifact`, and
      `missing invocation observations refuse completion`. F2/F4 independently bypass
      exact submission, request/review/obligation/attempt/invocation/phase, issuer/executor,
      protocol/prompt, raw-response/read/telemetry and finding-disposition checks. A fake
      verifier may exercise this composition but cannot establish independent provenance.
      Finally, test the pre-await expectation and post-await transaction together:
      `held verifier refuses changed review registration`,
      `unrelated completion preserves review expectation`, and
      `informed write failure retains only earlier cold evidence`. F10/F11 remove the
      own-attempt/registration fence and split receipt insertion from the later join;
      compare complete affected rows after refusal/rollback, including prior evidence.
      Record each exact mutation, observed assertion and restored GREEN with adjacent Proof.
      Keep `invocationId` out of the immutable selected plan. Version pairing storage explicitly;
      no migration may infer missing pairing from row order or a lone cold obligation.
      Tests: `v2 and v3 unpaired review history remains readable but cannot resume`,
      `paired replanning uses a new request audit generation`, and
      `pairing migration failure preserves old schema and rows`. F1/F3/F10 independently
      permit legacy completion/admission, backfill guessed pair/invocation values, or split
      schema/version writes; watch exact refusal or full version/row snapshots fail.
      Preserve old frozen-plan hashes and evidence; the existing v2-to-v3 attempt migration
      proves no pairing. Execution resumes only through trusted supersession/replanning.
      The local adapter does not require 2.2 dispatch first. Before real 2.1/2.2 dispatch,
      complete durable effect reservation and lease/attempt recovery under 1.2/3.3, and select
      the independently controlled provider/journal transport and authority through bootstrap.
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

- [ ] 2.4 Join independent check/audit obligation completion inside one evaluating phase —
      tests: `checks and audit complete in either order`,
      `incomplete receipt set cannot verify`, and `attempt evidence cannot be replaced`.
      F4/F5 omit one required obligation, accept a wrong-request/kind receipt, replace a failed
      attempt or trust a generic stage command without proof. Exercise simultaneous completions
      with independent attempt versions; an unrelated completion's request-version increment
      cannot discard a valid receipt. Receipt recording, evidence-set identity and transition
      must commit together; retain immutable earlier attempts and prove rollback.

## 3. Immutable publication and required admission

- [ ] 3.1 Publish authenticated candidate-addressed descriptors and archives — tests:
      `concurrent candidates resolve independently`, `lost publish response resumes exact bytes`;
      negatives F3/F7/F8 remove request/issuer/digest checks and immutable conflict refusal.
      Kill the publisher after the external write and before its durable acknowledgement.
      Persist exact effect reservations before dispatch; tests:
      `unreserved effect cannot dispatch` and `foreign acknowledgement cannot advance stage`.
      F8/F10 remove reservation/payload/target checks or split acknowledgement from the local
      transition. Verify immutable remote state before recovery; no exactly-once claim follows
      from SQLite CAS alone.
- [ ] 3.2 Wire the production trusted-wiki workflow and host resolver to the trusted selection
      source — test: `required workflow rejects unbound green status`; negatives F7/F9 replace
      the authentic descriptor with a candidate-provided URL, forged App status or changed
      workflow admission output. Preserve the organization-required workflow and verify its
      actual configured identity; a YAML snapshot assertion alone is insufficient.
      F9 independently permits published → admitted from a posted controller status without
      the required workflow's observed exact-request success and watches durable admission fail.
- [ ] 3.3 Implement bounded retry and crash reconciliation across publication and admission —
      tests: `retry exhaustion stays failed`, `unreadable state never becomes absent`;
      negatives F1/F10/F11 remove attempt/time bounds, swallow read failure and allow stale
      worker advancement. Required diagnostics and immutable evidence survive recovery.
      Test: `in-flight completion after takeover cannot grant admission`; F11 bypasses the
      publisher's new-dispatch authority fence separately from the local acknowledgement fence.
      Preserve observed facts for an operation already sent while authorized; do not claim
      lease expiry revokes that remote operation or discard its effects as if they never happened.

## 4. Merge, merged revision and host

- [ ] 4.1 Coordinate protected automatic merge with exact head precondition and enforced base
      freshness — tests: `head and base races refuse stale merge`,
      `merge-group recomposition requires new evidence`; negatives F12 remove each check
      separately. Prove existing required checks still block merge and crash recovery reads
      actual PR disposition before another merge request.
      Include wrong PR number, wrong subject kind, retargeting to a ref at the same base SHA,
      changed qualified group identity and reordered/member-head-changed group composition.
      Remove subject/target propagation independently at receipt, descriptor, admission and
      merge boundaries; a matching commit alone must never authorize the substituted subject.
      Test: `merge group admission never invokes ordinary PR merge`; F12 routes a group into
      the ordinary merge adapter and observes the forbidden call. Reserve merge effects before
      dispatch and reconcile actual disposition after a lost response.
- [ ] 4.2 Certify the actual merged SHA before downstream admission — test:
      `merged revision cannot borrow PR certificate`; negatives F13 replace the actual SHA
      with PR head, merge-group SHA, ancestor and equal-tree commit in turn. Keep the existing
      `emitIntegrationBinding` sole-parent refusal; ordinary GitHub merge certification must
      not weaken that separate contract.
      Tests: `merge acknowledgement and revision request commit together`,
      `protected revision never recursively merges`, and
      `branch waits for actual merged revision certification`. F10/F13 split acknowledgement
      from child creation, substitute the linked revision, permit a recursive merge or release
      branch coordination before certification. Exercise crash/reopen, duplicate acknowledgement,
      rollback and external branch advancement; incomplete/superseded work is not completion.
- [ ] 4.3 Install the same authenticated archive atomically on the host and retain referenced
      evidence — tests: `host consumes CI archive`, `live admission prevents early deletion`;
      negatives F14 remove archive/revision joins and retention-root checks. Missing, unreadable,
      partial and corrupt host installations refuse use and recover from the trusted store.
      Test: `host-ready requires exact acknowledgement`; F14 advances host-ready without the
      linked protected revision's authenticated archive/revision acknowledgement.

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
