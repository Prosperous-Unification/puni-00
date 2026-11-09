## Delivery boundary

This is the implementation plan. Checkboxes record independently reviewed slices;
live readiness still requires the final activation and verification receipts. Read [the design](design.md) and [requirements](specs/registry-storage-lifecycle/spec.md)
before implementation. New filenames below are proposed ownership boundaries;
read each existing caller and its tests before changing behavior. No live deletion
is permitted merely because planning validation passes.

## 1. Policy and durable ownership

- [x] 1.1 Implement pure budget and retention planning in new
      `tools/tool-fleet/src/registry-policy.ts` and `registry-policy.test.ts`.
      Inputs: validated capacity/inodes, publication envelopes, release bundles,
      protections and receipt times. Output: admission/refusal or an exact retirement
      plan with retained reasons, estimated reclaimable unique bytes and unmet capacity.
      Tests: `rejects publication crossing ninety percent`, `keeps ten complete bundles`,
      `preserves older environment rollback`, `waits seven days after abandonment`,
      `does not count shared blobs twice`; negatives: missing/NaN capacity, malformed
      timestamp, unknown owner and all-protected exhaustion. Remove each guard and
      observe the production-path refusal test fail before adding its adjacent `Proof:`.
- [x] 1.2 Add `registry-journal.ts` and `registry-journal.test.ts` beside that policy.
      Persist versioned protection ownership, complete bundles, reservations and
      recoverable operation phases with atomic durable acknowledgements. Provide
      acquire/release protection, reserve/finish publication and begin/advance/recover
      maintenance interfaces through one authenticated host command boundary. Tests:
      `survives crash before acknowledgement`, `rejects stale revision`,
      `serializes two publishers`, `does not expire an unresolved upload`,
      `refuses a full journal`; negatives: missing file, permission denied, corrupt
      journal, fsync failure and stale operation token on actual command paths.

## 2. Physical boundary and admission

- [x] 2.1 Add bounded storage provisioning and startup verification to
      `infra/ansible/playbooks/registry.yml`, a dedicated `registry_storage` role,
      `infra/platform/registry/production/` and the private fleet manifests.
      Provision retained block-backed registry and journal filesystems; verify exact
      mounts and capacity rather than PVC declarations. Keep the current production
      source pin and unrelated Flux holds. Extend `infra/ansible/tests/registry-hosts.test.ts`
      and add an isolated real-filesystem rehearsal. Tests: `saturation leaves root
reserve intact`, `missing mount cannot write root`, `wrong filesystem refuses
startup`, `second convergence changes nothing`; negatives: replace mount with
      directory, remove capacity enforcement and fill the disposable volume. Never
      perform exhaustion tests on the live root filesystem.
- [x] 2.2 Add synchronous byte/inode admission and durable pressure fencing to new
      `registry-capacity.ts` with paired tests. Wire startup to the journal's persistent
      fence so service restart and Flux reconciliation cannot reopen writes. Tests:
      `refuses oversized publication before upload`, `requires low water to resume`,
      `restart preserves pressure fence`, `unknown or stale measurement refuses`,
      `inode pressure blocks despite free bytes`; negatives: stale measurement,
      pressure checker death and removed startup fence. Bound journal and scratch
      accounting independently and prove the failure receipt can still be written.

## 3. Publication and consumer integration

Historical checkmarks 3.1/3.2 describe integrated prototypes and receipts retained at
`e347fbf7adf555e75259ad520ffe7eef25e2a1b4`. Source staging withdraws their default
routing. Coordinated publication and consumer activation remain outstanding; the
checkmarks do not establish current managed command routing.

- [ ] 3.0 Reactivate and requalify coordinated 3.1/3.2 routing after all installed
      native/provider, owning-history, isolation, budget, recovery and delivery obligations pass.

- [x] 3.1 Integrate admission and candidate protection into
      `tools/tool-dagger/src/main.ts`, `src/lib/publish.ts`, every tier publish entrypoint,
      `bin/publish-release.sh` and `tools/tool-fleet/src/platform-registry.ts` copy.
      Establish a bounded OCI export/size envelope before direct upload; preserve
      existing digest verification and return a complete durable publication receipt.
      Preserve compatibility for existing registries until their explicit enrollment.
      Tests in Dagger publish tests and `platform-registry.test.ts`: `partial tier
failure retains candidate ownership`, `no release success before bundle receipt`,
      `copy refuses admission before POST`, `single-tier publication is not a complete
multi-tier release`; negatives: fail the third upload, exceed reservation and
      remove the admission call from the production publisher.
- [x] 3.2 Integrate image protection into `tools/tool-deploy/src/k8s/release.ts`,
      its journal and tests, and the Compose executor plus remote swap scripts found
      through `docs/runbook-prod-deploy.md`. Provide registered adapters for desired
      Flux revisions, scaled-to-zero workloads, active/idle colours, solver images,
      recovery journals and private product publishing. Tests: `protects before desired
revision changes`, `crashed deploy retains both releases`, `recovery-required is
not a released protection`, `retiring environment does not release another owner`;
      negatives: unavailable/malformed consumer inventory, missing rollback digest and
      removed protect-before-reference call. Website/other private adapters must pass
      their companion checks before their registry adoption is marked complete.

## 4. Retirement and recovery

- [x] 4.1 Implement complete manifest census and dependency closure in new
      `registry-inventory.ts` and tests, reusing verified transport from
      `platform-registry.ts`. Bind plans to journal revision, storage identity and
      binary digest. Tests: `keeps untagged child of protected index`, `retains shared
layer across repositories`, `unknown stored revision blocks retirement`,
      `unsupported referrer blocks retirement`, `stale plan cannot execute`;
      negatives: omitted child manifest, truncated pagination, unreadable revision
      tree, corrupt blob and changed protection after planning. Use actual registry
      fixtures for API/storage-layout behavior, not only a fake catalog.
- [ ] 4.2 Refactor `backup-registry.ts` and the units under
      `infra/systemd/registry-backup/` to share the operation authority with new
      `retire-registry.ts`; retain existing fresh root/platform Flux barrier proofs.
      Implement verified pre-delete backup, isolated API deletion, offline GC,
      retained-content verification and durable failure recovery. Tests:
      `backup cannot overlap retirement`, `publisher cannot overlap deletion`,
      `Flux cannot revive writer`, `crash after deletion stays fenced`,
      `failed retained pull prevents reopening`, `restore reconciles protections`;
      negatives: stale Flux acknowledgement, surviving writer, killed GC, corrupted
      backup, missing lock acquisition and unconditional finally-reopen mutation.
      Preserve the last verified store and never test destruction against live images.
      Client pull installation must provision the separate byte/inode-bounded,
      root-owned pool with verified canonical journal storage before enrolling
      pinned client-worker/Crane artifacts. Verify the installed physical/tool
      profile before grants; retain explicit unenrolled compatibility. Run the
      uncached pull-storage rehearsal and real Ansible refusal/idempotency proofs.
      Before changing the guard, write a failing actual-authority interleaving
      where a commit before checksum leaves a matching final permission. Prove that
      compatible updates need one sample, while commits after checksum with
      nonmatching final permission retry at most three times. Preserve stable-mismatch,
      checksum-status, final-read, metadata, boot, revocation and expiry refusals;
      observe stale-initial-permission and fourth-attempt mutations fail before the
      native regression. Keep the full remaining lifecycle scope above.
      Accept a valid empty process mount view only after proving restricted
      filesystem/task isolation; keep malformed and unreadable observations fatal.
      Add `registry-writers-chroot.native.ts` with its real-kernel child fixture.
      Prove harmless chroot admission and hidden root/cwd, proc magic-link,
      directory/ancestor-descriptor, writable-descriptor, shared-mapping and
      independent-task refusals with actual writes. Remove each guard and observe
      false writer absence before recording the adjacent production proof. This
      regression does not complete the remaining installed lifecycle scope.
      Include same-inode root/cwd through different bind mounts and retained
      effective/permitted filesystem-changing capabilities in the actual-write
      negatives. Prove full path identity and the accepted privilege profile;
      UID equality or device/inode equality alone cannot establish confinement.
      Validate complete initial/final privilege samples and classify retained
      descriptor authority before filtering by storage device. Cover namespace,
      anonymous-inode and current/legacy PID descriptors, malformed observations
      and confirmed disappearance. Complete the remaining authority review and
      native proofs before claiming full isolation or installed readiness.
- [ ] 4.3 Implement separate backup budgeting and retention in
      `backup-registry.ts` with paired tests, using verified restic snapshot identities
      and complete object-size accounting. Apply seven daily/four weekly coverage,
      recovery pins and a separately configured 100 GiB admission budget, counting
      stored files, object versions and uploaded multipart parts, with additions
      and prune coexistence reserved before writes. Provider billing overhead and
      minimum billable object sizes do not count or block admission. Tests:
      `file budget does not require billing evidence`, `reserved additions exceed file budget`,
      `last verified snapshot survives`, `protected backups exceeding budget block`,
      `noncurrent versions count`, `prune has bounded workspace`, `failed backup keeps
prior receipt`; negatives: missing object listing page, undercounted versions,
      unknown prune envelope and removal of last-verified protection. Restore a kept
      snapshot after pruning in an isolated repository.
      Implemented prerequisite: signed bounded S3 versions/markers/uploads/parts
      census and root exact-version raw-lock recovery adapter, with controlled
      transport tests and guard/dependency fault observations. Read-only complete
      snapshot catalogue/retention inspection is wired into root preflight and
      snapshot creation with required durable root recovery pins, stable exact
      provider bookends, last-verified journal checks and incomplete-coverage
      preservation. Snapshot requests now carry bounded raw source observations
      after writer stop, with separate inspection/snapshot admission, required
      source limits, immutable source binding and last-moment reobservation. Raw
      metadata remains explicitly separate from encoded/provider allowances.
      Additional reviewed prerequisite: bounded root-owned effect state beside
      captured contents; phase/current canonical attempt binding, one-use consumption
      before every restic command and exact-version recovery deletion, durable
      execution settlement, replay/crash refusal and canonical journal headroom.
      Explicit fresh-backing enrollment never resets established missing state.
      Production physical admission stays closed; installed access/native proof,
      funding and physical liability release/retry/recycling remain incomplete.
      Implemented staged retry-profile prerequisite: pin one MinIO request attempt in each actual S3
      child, bind the same fixed descriptor into the effect fingerprint, and observe
      two committed/lost replies through the real store and pinned child. Omission
      moved retries back into the SDK and failed the completed outer-retry
      observation; ordinary caller fixtures persist independent S3/local fingerprints
      and refuse drift without replacing history. Preserve local-file commands, outer retries, all deadlines and
      closed physical admission. This does not complete the remaining profile.
      Complete file accounting with new-content/prune envelopes, durable effect
      authorization, actual protected reclamation and retained post-prune restore
      remain incomplete; a current payload census alone never grants admission.
      The user's 2026-11-04 file-size budget clarification removes provider billing
      evidence from this task; it does not remove the remaining lifecycle proofs.

## 5. Operational adoption

- [ ] 5.1 Add minute pressure checks, nightly retirement, status and alert wiring
      under `infra/systemd/registry-maintenance/` and the host configuration.
      Reuse the configured external monitoring destination without activating unrelated
      suspended platform stages. Tests: `warning reaches destination`, `cutoff reaches
destination`, `missed check alerts after five minutes`, `failed cleanup reports
protected owners`; negatives: dead monitor, rejected notification, full alert
      spool and stale success receipt. Record actual delivery evidence; stdout alone
      cannot satisfy notification tests.
      Reviewed local reporting prerequisite: capture the actual ten-second
      observation without changing healthy canonical history; publish bounded
      volatile reports; read complete canonical status with age, reservation totals,
      original backup lineage and explicit unavailable dimensions. Reviewed source
      delivery prerequisite: capture pressure and durable maintenance incidents;
      validate explicitly enrolled bounded state; preserve finite attempts and
      uncertainty; stage the conditional sender and prove real producer/sender
      processes through an owned local HTTP receiver. The replacement protocol
      retains pre-existing refusal evidence through commit-critical IO. These local
      prerequisites have scoped review and affected-path fault evidence.
      The actual configured destination, independent authenticated source path,
      five-minute missed-source delivery, installed/native storage and credential
      boundaries, complete protected-owner evidence and final real delivery
      receipts remain required before completion.
- [ ] 5.2 Run the complete lifecycle rehearsal on disposable enforced storage:
      concurrent publication, successful and partial releases, old protected rollback,
      untagged multi-platform images, safe retirement, uncached pulls, inode/byte
      exhaustion, killed maintenance and independent restore. Add a non-cached Nx
      rehearsal target in `tools/tool-fleet/project.json`. Repeat with each safety
      dependency removed; record observed failures and adjacent production `Proof:`
      comments. Run affected Nx tests/lint/typecheck, strict OpenSpec validation and
      the exact-revision full host gate before deployment. Stage production adoption
      as in `design.md`; replace proposed status in runbooks only after live receipts
      exist. Keep product migration separate and preserve the old PVC until verified
      rollback/recovery no longer needs it.
      Reviewed precise-contract restoration covers canonical receipt and
      persisted-evidence chronology across accepted ISO year formats, with failing
      actual-command/read tests, numeric comparisons and independently observed
      predicate-removal proofs. The broader lifecycle and installed checks remain open.

## Planning validation — 2026-10-25

This validates the design documents only. `verify.md` is intentionally deferred
until implementation, as required by the schema's verify instructions. The change
was not ready to archive at design handoff: all eleven implementation slices were
open, and the delta spec had not been synced into the implemented main specs.

- `openspec validate bound-registry-storage --strict --json`: one change valid,
  no issues. The first run rejected five oversized requirement paragraphs; they
  were split or shortened and the final strict run passed.
- `openspec validate --all --json`: 284 items, 284 passed, zero failed.
- `bunx nx format:check --all`: exit 0, no formatting differences printed.
- Explicit Prettier check of all nine changed Markdown files: exit 0,
  `All matched files use Prettier code style!`.
- Relative file link check: 64 targets exist; intent is 313 words; no implementation
  checkbox is checked. `git diff --check`: exit 0.
- Self-review covered all requirements against task boundaries, shared-layer and
  untagged-image protection, stalled/crashed operations, missing inventory,
  oversize protected sets, storage startup, backup accounting and alert delivery.
- Not run: runtime tests, injected-fault proofs, full test/lint/typecheck/build host
  gate, storage provisioning, image retirement, product migration or live safeguard
  activation. This delivery changes documentation only. The earlier registry
  activation gate does not prove the newly designed safeguards.

### Pending failure-proof coverage

These are planned faults, not observed runtime evidence. During implementation,
record each actual production-path negative and guard-removal failure in
`verify.md`, with the corresponding adjacent `Proof:` comment in production code.

| Safety boundary                    | Planned injected fault and observing test                                                                                                      | Evidence now |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Physical bound and startup         | Missing mount / disabled limit; `missing mount cannot write root`, `saturation leaves root reserve intact`                                     | Not run      |
| Admission and pressure             | Oversized envelope / stale measurement / removed fence; `refuses oversized publication before upload`, `restart preserves pressure fence`      | Not run      |
| Journal authority                  | Missing/unreadable/corrupt journal / failed fsync / competing owners; `serializes two publishers`, `survives crash before acknowledgement`     | Not run      |
| Release protection                 | Crashed swap / missing inventory / omitted protection call; `crashed deploy retains both releases`, `protects before desired revision changes` | Not run      |
| Complete image closure             | Untagged child / shared layer / corrupt blob / stale plan; `keeps untagged child of protected index`, `stale plan cannot execute`              | Not run      |
| Maintenance exclusion and recovery | Live writer / stale Flux ack / killed GC; `Flux cannot revive writer`, `crash after deletion stays fenced`                                     | Not run      |
| Backup preservation and budget     | Missing listing page / noncurrent versions / last-copy deletion; `last verified snapshot survives`, `noncurrent versions count`                | Not run      |
| Monitoring                         | Dead monitor / rejected notification; `missed check alerts after five minutes`, `cutoff reaches destination`                                   | Not run      |

## Source staging — 2026-11-08

- [x] S1 Preserve main delivery callers and active render; prove legacy compatibility
      with no lifecycle installation and production-patch closure fault.
- [x] S2 Separate dormant managed copy, Compose plan and ownership-aware state APIs.
- [x] S3 Extract common/managed Kubernetes parsers without a second coordinator;
      retain version, binding, genesis, sealed transfer and owner-file refusal proofs.
- [ ] S4 Audit defaults, preserve all retained additions and newer main behavior;
      run owning tests/lint/typecheck/build, frozen install, format, OpenSpec, secrets,
      migrations and required exact-candidate source CI. Independent parent review
      precedes publication. Host gate remains open before deployment/adoption.

Original managed executeRelease/startCutover, runSwaps and recovery integration
assertions remain activation acceptance obligations with retained source/evidence at
`e347fbf7adf555e75259ad520ffe7eef25e2a1b4`; current helpers do not claim that routing.
All existing 4.2/4.3/5.1/5.2 obligations remain open without reduced scope.

Coordinated activation also retains the cross-companion first-install acceptance:
private source-owned genesis and A→B recovery lineage must satisfy the pinned public
policy. Source staging changes neither public producer contracts nor that policy;
the known initial recovery-policy gap remains OPEN before managed activation.
