# UC2 prospective image and known-composition controller — next source decision

Decision: GO for the bounded source implementation below after Root materializes its R4 delta. This is the next substantial implementation slice, not another inventory exercise. It implements a real coupled-image entry and known-composition controller. It does not apply the production patch, register executable HOLD tests, import an image, run a helper, or grant native execution. The user-delegated architecture decision needs no additional human permission ritual.

The accepted compiler-only checkpoint is recorded in `/tmp/puni-ordinary-input-closure-build-actual-review-20261105.md`. Its closure evidence applies to the old, uncoupled epoch. It is not inherited automatically by the proposed image.

## Source scope and authority

Use the existing `tools/tool-remote-scripts/src/fixtures/dependency-owner-custody.ts` and `tools/tool-remote-scripts/src/lib/edge-ownership.test.ts`, plus Root-owned inert reviewed patch/manifest/expectation data and R4 documents. Preserve the entire historical 95,701-byte prefix and its first ordinary import marker. No repository production file, storage test registration, CI runner or workflow changes in this slice.

The only production overlay is revision 2 under `/tmp/puni-coupled-uc2-prospective-patch-20261105/revision-2`: source.patch SHA256 `2d9fdbb243080b724eef49b2791e89bc4b306101e75af06716c1be7f98d5185a`, manifest `ea42aed5edff42f2dc0e4198a3b7282815b82ff52977ceb2d95df1c67835b846`. Its exact three proposed file hashes are:

- edge-ownership.ts: `7e900fbd23ec048f677154f8659bfe8137af810c1309f534aa9b5a9ad7962de3`.
- dependency-activation-storage.ts: `02bcd70bc6312065bd2978821b8d36e86c87bc9257866f08dee0d2251d7d96f0`.
- complete-dependency-exclusion.ts: `8ba74d629156382f53b9eb7440714fbdb8255e6e1a616cc961a9a50eebbeee25`.

Introduce a distinct literal epoch `ordinary-uc2-coupled-r2-v1`. A dedicated prospective planner accepts only this epoch and the fixed patch authority. It must not silently admit either old or proposed hashes. The physical repository's three baseline bytes remain independently checked by the filesystem closure ledger. Their logical compiler inputs come from the exact proposed bytes, followed by the fixed instrumentation transformations. Record all three layers: physical base, proposed production, rendered compiler bytes.

If the archive contains patches rather than full proposed copies, use a pure strict applicator: exact three path allowlist, exact base hashes, exact hunk context/positions/counts, no fuzz/offset search, no extra files/hunks, exact resulting hashes, and reverse reconstruction of the base. This is in-memory text processing, never `git apply` or evaluation. A caller-provided adjacent digest confers no authority. Pin the reviewed raw patch/manifest in the fixture just as the current independent load packet is pinned.

The 17 module roles remain; three source tuples change in the prospective epoch. Do not label old 44-return/284-input receipts as new observations. Independently reconstruct the new load expectation packet, including all new ports/cuts, and seal the next exact compiler closure before execution. Fail on set expansion; investigate new inputs and issue a new reviewed packet. The current setup46 and closure1936 budgets belong to the current image. Any additional setup observation must use an explicitly named key/count amendment, not disappear from custody or silently enlarge a cap.

## Fixed observation additions

Keep the existing six owner observation cuts, re-derived against the proposed bytes. They already retain the actual composition body, actual projection, runtime action/entry, resource operations, original resources and keeper references. Do not substitute new resolved Promises or duplicate fake body/projection events.

Add exactly one enrollment association cut immediately after the actual sequence:

    preparations.set(preparation, record);
    ownership.preparations.add(record);
    ownership.composition = record;

and before `return preparation`. Insert `capturePreparation(preparation, record)`. The generated ledger retains the actual branded object and actual internal record in a private WeakMap plus a strong per-helper frame. This tap is nonthrowing: failure retains references and sets sticky STOP; it must not replace a production result. One known-controller invocation admits one owner and one preparation. A second preparation is refused by the fixture controller before starting it; do not pretend the existing eight-owner limit counts distinct preparations.

Add a fixed `complete-acceptance` port. Remove only `assertPreparationCompletion` from complete's existing named owner import and import that name from this port. The port imports the same canonical owner module and ledger. It reserves the single completion-control record before calling the genuine method, records its exact returned original and immediate observer, and returns that SAME original. It is non-async. Receiver/arguments and any synchronous throw are preserved. Resolve preparation identity through `capturePreparation`; never find a record by phase or latest-event heuristics.

The completion original is a control-chain record, not a generic resource-operation record: production completion must never join the projection waiting on it, and the controller must never put its own join Promise into its join set. Composition, projection and completion can remain parked at the real keeper in later HOLD cases. A pending flag alone is not a keeper-dependency proof.

Add four closed, one-shot controller Promise labels in the generated ledger: `fixture`, `owner-action`, `outer-owner`, `completion`. Each reserves before entry, retains the actual original and immediate fulfillment/rejection observer, and preserves exact identity. Existing body/projection/runtime records stay in their existing graph. No arbitrary callback registration, label strings, caller-supplied success markers or synthetic join authority. The controller's own completion Promise is not a captured dependency of itself.

## Real scanner monitor and fixture layouts

Complete currently calls `scanMigrationArtifact` twice without retain in `inspectSourceArtifact` (source and installed artifacts), and once with literal `true` for `restorationArtifact`. The canonical scanner's finally closes nonretained scans before fulfillment. Never enroll or close those already-closed results.

Extend the fixed scanner port to retain the original call Promise as today and, for the exact retained call, attach the genuine returned monitor before the complete continuation can enroll it. Reserve one opaque scanner obligation before invoking that retained call; one composition has one retained scanner. Capture the exact returned object, its real close function and receiver. Return the same scan Promise and same monitor object; replacing only the monitor's close method with a fixed forwarding wrapper is allowed. The observing reaction must be attached before returning the original, so association is installed before the caller's await continuation. Observation failure is retained and STOPs; it does not manufacture a monitor.

Add an explicit scanner variant to the private wrapper association used by `captureOriginal`. It owns an opaque close obligation, not invented fd tickets. Preserve exact receiver/arguments/return/throw and one native delegation. Before-delegation injected refusal may permit the later first genuine close after quiescence; returned native close is never repeated; a real delegated throw is UNKNOWN and cannot be retired by retry. Nonretained scan rejection or retained construction rejection cannot establish internal-descriptor closure merely because the Promise settled. Keep that internal uncertainty explicit. Do not rewrite the canonical scanner function, program serializer, filesystem imports or internal close loop.

Add fixed `graph-layout` port and redirect only Graph's exact `import { envLayout, type EnvName } from './env'`. Its one-shot binding comes from the actual returned `participantActivationFixture(['prod'])` object before owner admission; freeze a copy of the genuine layouts. The port serves the literal prod/dev requests used by Graph, rejects use before binding and rejects rebinding/other names. Preserve EnvName as a type. This reproduces the existing storage control's independent fixture-layout binding without global environment mocking or fabricated layouts. Other modules' environment resolution is unchanged. No additional transformed production module is needed.

Together with a generated `controller` module below, these are three new fixed virtual ports beyond the existing 28: prospective roster 31. Exact source cut cardinalities must be emitted and independently reviewed from the implementation; do not guess a new cut count. No new resolver wildcard is allowed.

## Implement the genuine known controller now

Generate `ordinary-hold-v1:controller` with fixed imports of the actual participant fixture, owner, complete API and generated ledger/layout ports. It exports `runOrdinaryKnownComposition(caseId)` for a closed two-value union:

    'known-initial-prepared-release' | 'known-preawait-manifest-refusal'

It performs no work at module top level and is not automatically called by tests or the image's export-only entry. No callable `prepareOrdinaryDependencyHoldV1` stub is introduced. The 39 HOLD cases retain their existing identities and remain ineligible for this known-controller function.

The first branch calls the real `participantActivationFixture(['prod'])`, binds its actual layouts, sets the owned process's edge-state path, and calls genuine `withDependencyOwner`. Its action calls genuine `prepareInitialDependencyHandoffUnderOwner` with the existing 180000 allocation, then `consumePreparedDependencyActivation`, exercises genuine context/evidence inspection, and synchronously requests `releasePreparedDependencyActivation` in finally. It checks genuine purpose, selected prod artifact, durable attempt/pending associations and the existing evidence hash relations; use the existing successful owning test as the oracle source, not a fabricated context. Await actual outer completion and actual original observers before accepting known cleanup.

The second branch uses the same genuine fixture and owner, but changes only `request.authorities.writerManifestContents` to 262145 ASCII bytes. This reaches the actual pre-await limit. Require exact original body-cause identity through completion and projection, retained body/projection/acceptance originals and observers, no orphan rejection, known outer cleanup, no prepared/context exposure, and zero _composition storage_ acquisition after the enrolled baseline. Do not claim zero whole-helper native work: fixture preparation and owner locks are real work. No generic rejection is an acceptable replacement for this exact branch.

Keep the existing production cap/clock behavior. Deadline-crossing between enrollment and binding remains a separate named later control; do not approximate it by wall-clock sleep or claim this oversize control covers it.

Implement the finite known-completion join inside the generated ledger, over its private records. It joins actual setup/resource-operation originals and observers, actual child exit/readers/pumps, and the four new control originals/observers plus body/projection/runtime observations. It checks production resource outcomes after actual outer completion. It does not first-close leaked resources and report known success. A genuine delegated native/opaque close throw, missing observer, unresolved required original, unseen acquisition, STOP or unknown child state prevents a success packet. Preserve the actual primary and cleanup causes, including undefined; never rewrite failed semantic assertions as cleanup success.

The generated bootstrap is source only in this slice. It owns a passive keeper before dynamically importing the full image, retains the actual import original/observer, obtains the one ledger instance exported by that image, and only then invokes the fixed known controller. Do not import a second copy of the ledger into the bootstrap. Full image import can enter directory-file's dlopen boundary; it is not a harmless import. Actual bootstrap/import/native execution needs the later exact finite protocol, not this source decision. The source must not resolve production keepers, kill/cancel children, cancel readers, unref unknown obligations, retry native closes, or use timeout/process disappearance as closure.

No parent launcher invokes this generated source yet. Parent-helper transport will use the reviewed actual-reader custody mechanism with a separately explicit one-helper/two-reader budget; it is not an unrecorded subprocess or an automatic increase of the current 32 child allowance.

## Test-first source sequence and proof boundaries

1. Pure prospective-epoch tests: exact patch applies to exact bases; reverse recovers them; wrong base, altered hunk/context, extra path and wrong proposed hash refuse. Test physical-base identity separately from proposed compiler identity. No production import.
2. Test the actual generated import-free ledger additions with inert originals: one preparation association; foreign/missing/repeated association; exact original Promise return; first/duplicate completion capture; independent rejected original and observer retention; deferred originals cannot yield known completion. Every provider is finite, and tests explicitly settle and join their retained originals.
3. Inert scanner controls use a real test object with sentinel close, never pretend to be a successful production scanner. Verify same object/function receiver, nonretained result not enrolled, one retained monitor, before-entry versus returned versus throwing close, no retry, independent cleanup after STOP, and preserved primary close cause. These prove only generated forwarding/custody logic.
4. Inert graph-layout tests exercise absent binding, exact prod/dev projection, repeated binding and rejection of foreign names. Assert the generated Graph cut changes only the specified import and that reverse reconstruction is exact.
5. Pure generated-source assertions verify genuine fixture/owner/preparation/consume/release calls, exact completion forwarding, enrollment-tap ordering and no top-level execution. These are structural checks, not genuine-composition success evidence. Compile/typecheck the generated modules without importing them.
6. Freeze source and independently review the exact new cut/port/epoch/load/closure packet. Then prepare one compiler-only protocol and separately review its driver. A future known native protocol must explicitly admit the bootstrap, actual module side effects, fixture children, native resources and both selected controls. Do not combine that future execution into this lease.

Physical omission pairs may target isolated inert guards after their finite consumers and source are frozen. Retain same-consumer before/fault/restored originals and streams. No blanket Proof credit for controller integration, actual native custody or all guards; distinguish structural checks, inert runtime checks, compiler observations and genuine production behavior.

## Required continuation and publication boundary

This slice ends with substantive inert source capable of constructing the reviewed prospective image and expressing the two genuine known paths, not a claimed completed HOLD preparer. All 39 accepted HOLD rows remain required (37 new plus two existing migrations). The first later HOLD wave is the genuine anchor-close and operation-two-cleanups migrations, preserving their safe failure/commit/lock/native-count assertions at actual recorded boundaries. Missing-evidence retains its genuine packet and replaces the old unsafe unconditional fallback with exact first-close accounting. The remaining actual family faults, expired/drop/release/pending-operation controls and source-driven R5 proofs follow; none are skipped or reclassified as known success.

Before executable production application/publication: accepted finite containment for every affected existing case, actual pre-registration runner selection, actual expanded registration census, routing/receipt amendment, complete39/Graph228 preservation, private-three exclusion, existing budgets, owning tests and required gates. A draft PR runs storage and supplies no containment. The three proposed production files remain unapplied throughout this source slice. Full UC2, external native/scanner/transport uncertainty, runtime inputs, hosted capacity and architecture/main/deploy holds remain open. Keep all seven unqualification strings until each is explicitly narrowed by new actual evidence.

All reviewer source reads have ended. This packet used immutable proposal/current-source snapshots and read-only unchanged supporting modules. No compiler, image, scanner, native operation, helper or test was executed by the reviewer.
