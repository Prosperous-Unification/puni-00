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

### Observation tick and uninstalled service after 1.2d

Implement in this order under the [tick contract](design.md#observation-only-tick-and-uninstalled-service-increment).
The locally mounted and independently reviewed 1.2e–1.2h slices are checked below.
Their completion does not close parent task 1.2, external bootstrap or 030.6.

- [x] 1.2e First prove `scheduler initialization never repairs established state` and
      `a second observation process reads nothing while its owner is active`. Add protected
      state/config validation, explicit initialization, additive scheduler storage and one
      process-lock owner covering every production entry path. Mount two real local processes,
      crash/reopen and migration/rollback. F10-T1/T2 independently remove lock acquisition,
      early-release prevention, state existence/schema/binding guards and attempt persistence.
- [x] 1.2f First prove `cancelled current response cannot commit after shutdown`,
      `whole tick deadline survives synchronous work` and `database closes only after tick settles`.
      Implement `observation-tick.ts` composition with finite workload/tick/cleanup budgets,
      source-to-controller cancellation and transactional observation fence. Retain previous
      valid subject commits while refusing incomplete success. F10-T3/T4 separately omit
      cancellation, expiry, next-read and settle-before-close checks, including an abort-ignoring
      reader. Add `observation-cli.ts` signal/exit mapping; prove zero forbidden-effect calls,
      with F10-T5 observing an independently introduced forbidden dispatch.
- [x] 1.2g First prove `provider cooldown survives restart and clock rollback`,
      `crashed reserved attempt consumes budget` and `exhausted burst stays failed until recovery`.
      Extend the REST failure contract with validated retry timing, then mount durable cooldown
      and bounded recovery probes through the tick. F11-T1/T2 independently omit numeric/date/
      overflow validation, provider minimum, durable attempt reservation, deadline/attempt limits
      and failure-health retention. Keep cancellation distinct from provider failure and ensure
      busy/deferred invocations make no GET or success write.
- [x] 1.2h Add the executable one-tick service composition, an explicit protected configuration
      and optional read credential boundary, uninstalled oneshot/timer templates with a typed
      administrator renderer, and their provisioning runbook under
      `infra/ci/burokrat/observation/`; link from the activation runbook. First prove
      `observation service template requires protected execution and bounded shutdown` and
      `timer artifact cannot grant execution authority`. F1-T1 removes required account/path,
      state confinement, timeout, group-termination or restart constraints independently.
      Verify rendered template syntax where tools are available; label structural proof separately
      from unrun systemd runtime acceptance. No installation/enablement, host edits, secrets,
      provider authority, check execution, activation or WBS update belongs to this task.

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
- [ ] 2.1a Freeze the selected GitHub attestation provider descriptor and explicit versioned
      bootstrap binding before real provider adapters. Start with tests:
      `provider authority has no inferred defaults`, `legacy bootstrap cannot dispatch`, and
      `private journal requires verified Enterprise Cloud entitlement`. Independently remove
      each required immutable repository/workflow/signer/issuer/audience/predicate/model/
      protocol/retrieval/retention/entitlement check (F1/F2); each mounted boundary must fail at
      its intended assertion. Preserve historical pins/records without guessed migration.
      External values and credentials are not fixtures to promote into production. Parent
      1.1/1.2 and 2.1 remain open; no automatic broker fallback or entitlement assumption.
- [ ] 2.1b Mount read-only attestation retrieval/authentication through `verifyReview` and
      `recordReceipt`, reusing existing review types. Tests:
      `attested journal completes only its registered phase`,
      `manifest digest cannot replace canonical source digest`,
      `signed incomplete review refuses`, `foreign retrieval cannot receive credentials`, and
      `held authentication refuses changed authority`. F2/F4/F10 independently remove
      issuer/root/signer/workflow/digest/audience/predicate and exact submission/source/artifact
      joins, raw evidence/cold-link guards, origin/bounds checks and post-await authority fence.
      Cover absent and unreadable artifacts separately; strict verifier output must reject
      valid signatures for foreign semantic evidence. No dispatch is needed for this slice.
      First complete the retrieval-only increment under
      [Journal Resource Protocol v1](design.md#journal-resource-protocol-v1-retrieval-before-authentication):
      fixed digest routes and producer publication order, pinned GitHub candidate lookup with
      one-next bounded pagination, exact credential/redirect policy, streamed and declared
      resource ceilings, digest-checked private staging and cache rehash. Return only typed
      unauthenticated `RetrievedReviewJournal`; require a redacted late-cleanup failure
      observer, bound late response cancellation and recheck the whole deadline/caller abort
      after pending-directory cleanup; enforce fatal UTF-8 for both manifest and GitHub
      listing bytes and recheck a finite late cancellation's monotonic deadline. Do not
      import remote registration, map a
      receipt, write the controller DB or install real origins/credentials. RED/GREEN and
      independently watched F2/F4 negatives must cover origin, redirect, credential crossover,
      pagination truncation/loops, each count/byte/deadline, digest, incomplete staging,
      symlinks, conflicting cache and cancellation. Keep the 2.1d producer implementation
      and full 2.1b authentication/receipt mapping open.
      Continue in two separately reviewed checkpoints; neither alone completes 2.1b.
      **Checkpoint A: authenticated manifest.** First freeze the strict signed predicate v1,
      protected selection resolver and authenticated workflow-metadata response contract from
      design. The selection resolver uses the exact persisted record/key contract below;
      installed checkpoint A depends on 2.1d's preliminary selection producer/freeze slice.
      Do not claim a test-seeded row is an installed selection producer. Tests:
      `signed selection cannot choose its own subject`,
      `predicate cannot authenticate its own signer`, `all candidates precede selection`,
      `equivalent attestations select deterministically`, and `conflicting signed claims refuse`.
      Compose protected staged-file rereads with the actual pinned offline runner and strict
      certificate/predicate joins. F2/F4 independently omit each identity, subject, audience,
      execution/attestor/phase join, staged hash/containment guard, candidate completion and
      conflict check; distinguish filtered unrelated metadata from applicable signed conflict
      and operational failure. Cover foreign workflow metadata, latest-attempt substitution and
      read-capability route leakage. Every nonzero CLI exit refuses in v1; do not classify stderr.
      No cast of fake process output grants trust. Keep receipt rows
      unchanged; record actual crypto fixtures separately from process/semantic fixtures.
      **Checkpoint B: source graph and receipt owner.** First implement retained phase-submission
      resources, strict canonical source projections and exact artifact-role/cardinality rules.
      Test `phase objects bind exact selected source`, `required reads name observed content`,
      `foreign telemetry and cold links refuse`, `cold pass informed failure remains failed`,
      `missing informed evidence cannot synthesize cold terminal`, and
      `held semantic verifier cannot select stale evidence`. F2/F4/F10/F11 independently omit
      submission/source/role digests, required read-set inclusion, subject/input/response/
      telemetry/context/cold cross-links, verdict/finding preservation and post-await owner
      fences. Cover extra/missing/duplicate artifacts and both genuine cold-terminal and
      complete pairs. Mount public `recordReceipt`, including cold-before-informed, unrelated
      check completion, reopen/replay and injected receipt/join rollback with complete row
      snapshots. Retain proofs before selection; no partial DB selection or evidence repair.
      Producer parity tests must derive the same protected selection and exact submission
      bytes from frozen inputs; 2.1d implements the producer contract. Installed independence,
      real signed custom-journal fixtures and external credential/retention acceptance remain
      unverified until observed. Record each exact omission, intended assertion, restoration
      and disqualified/masked attempt in verify with adjacent Proof; no 2.1/WBS completion.
- [ ] 2.1c Implement GitHub dispatch plus authenticated exact-effect registry query/acceptance
      after durable 1.2/3.3 reservation and recovery prerequisites. Tests:
      `lost dispatch reply recovers original invocation`, `duplicate run cannot execute twice`,
      `unavailable registry is not absence`, `changed workflow ref refuses acceptance`, and
      `provider acceptance rechecks live ownership`. F3/F10/F11 independently remove immutable
      payload/target/invocation equality, atomic registry acceptance, authoritative absence,
      owner/epoch/expiry/current-authority checks, deadline/budget and retained-fact fences.
      Exercise reopen, held replies, takeover, expiry without takeover and conflicting replay.
      A workflow run ID alone must not create `ReviewDispatchObservation` acceptance.
      Acceptance and initial execution progress must commit atomically. First mount tests
      `accepted pre-send crash recovers with fenced owner`,
      `accepted row without progress refuses`, and `late worker cannot send after takeover`.
      F3/F10/F11 independently split acceptance/progress commit, omit progress/version/owner/
      epoch/expiry guards, or expose a reusable send permit; observe unchanged durable rows
      and zero stale sends. Prove finite persisted recovery budget/deadline across restart.
- [ ] 2.1d First implement the protected selection producer/freeze prerequisite, before
      installed checkpoint A and before any provider dispatch. Freeze the strict
      `ReviewSelectionRecordV1`, pinned selector closure and exhaustive-plan/content mapping;
      use the specified derived review ID and controller-DB key, never receipt labels.
      Add selection persistence with paired additive migration/rollback, explicitly versioned
      frozen-plan/dispatch bindings, atomic owner-fenced freeze and exact replay. Implement the
      read-only registration-derived resolver. TDD tests:
      `selection row is required independently of signed claims`,
      `partial selection freeze rolls back all references`,
      `reopen preserves exact selection bytes`, `legacy unbound plan requires replanning`,
      `foreign source obligation and selector refuse`, `selected coverage cannot shrink`, and
      `controller and executor derive identical selection`. F2/F4/F10/F11 independently omit
      row/hash/key/pair/source/selector/coverage joins, no-repair/replay checks and post-await
      fences; compare complete durable snapshots. Also test literal expected canonical bytes
      and digest including terminal LF, plus missing-LF/CRLF/duplicate-key/noncanonical refusal
      and unchanged raw response bytes. Removing normalization/refusal guards must fail the
      intended mounted assertions, not merely parsing or setup. Keep old registrations immutable;
      explicitly replan unsupported legacy state rather than infer defaults. Record remaining
      unprovided selector policy/closure as a prerequisite, never an empty-context fallback.
      Then mount the protected Anthropic Messages executor and durable journal/attestation
      writer using administrator-provided model/program/protocol pins. Tests:
      `informed execution waits for durable cold acknowledgement`,
      `journal retains actual reads responses and usage`,
      `interrupted model response cannot become passed review`, and
      `attestation waits for immutable evidence retention`. F2/F4/F11 independently omit
      phase order, observed-evidence checks, credential/tool separation, immutable artifact
      joins and retention-before-signing. Use harmless credential sentinels for isolation;
      no candidate shell execution or permissive ACP prototype policy. Interrupted append/
      signing/reply must recover by exact identity without overwriting prior evidence.
      Persist per-phase/call-ordinal `pre-send -> uncertain -> evidence-retained -> terminal`
      progress, with intent-before-POST in the protected credential-owning send gateway.
      Start with crash tests `committed intent before POST is not replayed`,
      `POST without retained response reaches bounded operational failure`,
      `retained response resumes signing without model replay`,
      `late response cannot reopen terminal execution`, and
      `missing execution evidence cannot synthesize cold terminal`.
      F2/F4/F10/F11 independently remove intent-before-send, same-call replay refusal,
      current-owner/CAS and ordinal-order fences, finite failure deadline, evidence-retention
      joins, terminal immutability and operational-failure/receipt separation. Watch intended
      send-count, exact durable-state and absent-receipt assertions fail, then restore GREEN.
      Include crashes both sides of POST, a held late response through takeover/expiry,
      genuine cold-only failed evidence as a control, and uncertainty with no provider replay
      facility. No automatic new attempt may disguise an uncertain send in this increment.
- [ ] 2.1e Prove installed external acceptance after one-time protected control repository,
      registry, credentials, retention, plan entitlement and trust pins are provisioned.
      Run `installed reviewer proves the exact invocation` with real cold/informed execution,
      read authenticated retained evidence after controller restart, and watch wrong signer/
      candidate-controlled journal substitution refuse. Record API/verifier/program identities,
      immutable evidence locations/digests, exact commands and RED/GREEN outputs in `verify.md`;
      add adjacent Proof comments for every changed guard. Fixture-only or unrun external
      checks remain explicitly unverified. No task here alone completes 2.1, parent 1.1/1.2
      or 030.6; publication/admission/merge/certification/host requirements remain later tasks.
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
