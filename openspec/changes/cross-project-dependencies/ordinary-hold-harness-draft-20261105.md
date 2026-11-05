# Unimplemented ordinary HOLD harness draft

Subsequent [static decisions](ordinary-hold-static-decisions-20261105.md) resolve
the image, scanner, admission and projection choices below. This preserved report
retains its original draft attribution; the decisions do not qualify executable
HOLD containment or complete UC2.

Published to preserve the independent architecture preparation. The following
report proposes future work; its GO is limited to static preparation. It does
not mark these choices adopted, completed or execution-qualified. The current
owner core stays unwired. Outstanding image/admission/census decisions and
all full UC2 acceptance obligations remain open.

Original report SHA256:
`c55e29e643f76226d052ff7e2a3a6bb5575f77aeeedaee2bd6ca912cf8d8bc64`.

# UC2 ordinary finite HOLD harness — independent architecture preparation

**GO for static implementation/preparation within the materialized eight-path scope. NO-GO for actual HOLD execution or publication of enrolled storage/complete behavior until the image, admission and finite retirement stages below are independently accepted.** This report is a concrete new ordinary protocol, not a grant to execute it. The historical private three-constructor grant remains consumed. Full UC2 remains required and unchecked.

## Source basis and material gaps

Read the dated capsule plan and superseding corrections in `openspec/changes/cross-project-dependencies/original-handoff-design.md`, the twelve UNKNOWN groups and finite-fixture requirement in its delta spec, the latest core review, actual owner/storage/complete callers, historical fixture, genuine Graph/SQLite/snapshot identities, canonical locks, serialization-sensitive scanner, and affected test/routing definitions.

Fresh initial hashes matched:

- `edge-ownership.ts`: `8c711e6d2daa0c6e23c185fb569698ec83cc0db287645d8fb1696c2f056298b5`.
- `edge-ownership.test.ts`: `bc740e75549bc99c5abe7254aac1862c1708fbcc3b7fd7d07b3ec893a66d1e5d`.
- `dependency-activation-storage.ts`: `e8ac098736b6cc538693437ae9c923819f5783fb8df61285d4f217a0f1b2154a`.
- `complete-dependency-exclusion.ts`: `ab7766c66a8a53fb84f11f3e0262802295ad823854b1cb4df13899bfddd2b798`.
- `dependency-owner-custody.ts`: `50281b36a01665b83062e7bb7d065361037182581fb791a89e1b049d65cf4b04`.

After Root's mutation-lease notice, the frozen reader copies and `pins.json` under `/tmp/puni-uc2-core-frozen-reader-20261105/` became the authority for core design. No repository code or copied source was imported/executed. No tests, helper, host or Git action ran. Only this report was written; earlier commands read text, decoded historical string literals as text, and hashed files.

Material facts:

1. Storage and complete currently do not enroll the new capsule. No genuine successful storage/context integration is established by the nine core controls.
2. The historical helper's `retireTerminalFixture` explicitly requires `custody.operation === 'terminal'` and rejects any production timers. Its entry awaits that terminal operation; its source mapper rejects owner timer calls. It cannot qualify corrected permanent HOLD. Leave its original full prefix, constants, source pins, exported function, admission, three titles and bodies byte-identical.
3. Descriptor terminal dispatch now lives in owner `closeOriginal`, not only storage. Watching storage close imports alone misses production cleanup.
4. `scanMigrationArtifact` dynamically imports filesystem functions inside the function serialized by `migrationScannerProgram()` using `.toString()`. A global filesystem redirect or rewritten scanner body changes the image probe. That approach is invalid.
5. Genuine SQLite pre-return failure requires observing the native client before initialization/wrapping. A wrapper around a successful `openReadOnlyConnection` return is too late. Genuine snapshot and Graph errors must come from their actual boundaries; invoking an issuer or manufacturing marker-like objects is not an alternative.
6. Existing `anchor-close` and `operation-two-cleanups` become intentionally nonreturning after integration. Their current timed bodies cannot survive unchanged. Missing-evidence's unconditional late `held.evidence.close()` becomes a double-close hazard.
7. A production HOLD Promise cannot both remain permanently pending and be joined to settlement. Root explicitly confirmed the distinction below. Never claim that it was joined.

## Separate function, admission and ownership

Append a narrowly named `prepareOrdinaryDependencyHoldV1` to the existing fixture. Use a separate protocol discriminator `dependency-owner-ordinary-hold`, version1. Do not call `prepareDependencyOwnerCustody`, reuse its mutable parent singleton, reinterpret its metadata, or loosen its source/timer prohibition. Independent fixed literals may repeat a useful technique; factoring historical bodies is out of scope.

Proposed fixture interface, using immutable closed records rather than arbitrary callback input:

```ts
// Test-only exports in the existing fixture; symbols have no production authority.
type OrdinaryHoldOwner = 'storage';
interface OrdinaryHoldImageV1 {
  readonly format: 'dependency-owner-ordinary-hold-image';
  readonly version: 1;
  readonly sourcePins: readonly SourcePin[];
  readonly sourceRoot: string;
  readonly sourceIdentity: string;
  readonly mappingDigest: string;
  readonly titleDigest: string;
}
interface OrdinaryHoldObservationV1 {
  readonly format: 'dependency-owner-ordinary-hold';
  readonly version: 1;
  readonly caseId: OrdinaryHoldCaseId; // exact literal union below
  readonly title: string;             // must equal that ID's fixed literal title
  readonly production: 'known-refusal' | 'known-prepared' | 'runtime-hold' | 'outer-hold';
  readonly retirement: 'known-originals-closed';
  readonly failures: readonly string[]; // closed sanitized oracle codes
  readonly evidenceDigest: string;
}
prepareOrdinaryDependencyHoldV1(
  image: OrdinaryHoldImageV1,
  admission: OrdinaryHoldAdmissionV1,
): Promise<ReadonlyMap<OrdinaryHoldCaseId, OrdinaryHoldObservationV1>>;
```

The actual image/admission decoders must close all fields and reject unknown versions, source aliases, missing/duplicate maps, changed executable/cwd/pins/title census and ambiguous selection **before build or helper entry**. The caller supplies neither a scenario function nor cleanup action, arbitrary command, timeout extension, expected success boolean or production issuer. Source pins are a newly reviewed ordinary image manifest, not a refresh of the historical private pins. Root's final integrated source hashes must replace the current core-only basis through a new review; do not quietly accept either epoch.

Put full genuine-composition HOLD cases in the storage owning test only; owner test retains core/known and harmless harness-image/admission checks. This avoids running the same expensive native case in both rest and storage leaves. Either test may import inert definitions; importing the fixture itself must perform no build, native acquisition, timer or private entry.

Preparation runs before registration of timed HOLD assertion callbacks. Each callback only validates its same-invocation terminal observation and exact title. There is no cached successful packet, earlier-run reuse or skipped HOLD body. Default published storage execution must prepare the full registered ordinary set. A local filter must not accidentally prepare every HOLD scenario: freeze admission for the exact canonical unfiltered storage argv/environment, plus separately reviewed explicit finite local selections. Reject other selection modes before helper acquisition. The existing leaf already rejects `BUN_OPTIONS`, `BUN_TEST_*`, unapproved bunfig and pin drift. Public argv alone is not proof that Bun consumed no hidden selection; qualify the actual owning invocation/outer census and do not claim more from the admission parser. No workflow change, private-entry routing or generic test launcher is proposed. If safe selected preparation cannot be expressed and qualified inside the two owners/fixture, stop for a specific routing amendment; do not silently execute all HOLD helpers under an unrelated filtered command.

## Genuine composition and production contract

The case controller uses `participantActivationFixture(['prod'])`, its real migrated prod/dev SQLite files, actual generated artifact/source fixtures, genuine `withDependencyOwner`, and the real `prepareInitialDependencyHandoffUnderOwner` (or named restoration/fenced controls). Keep the existing modeled external Docker/systemd/Caddy observations only at their established fixture ports. Preserve real local namespace/emitter/collector children at their owned-child seams and independently join them. No fake storage packet, graph, prepared/context, observer-ready result or substituted successful callback is introduced. Missing-evidence is the narrowly retained existing negative: hide a field only after the real storage packet exists and is bound privately.

Complete owns enrollment before its first asynchronous preflight/acquisition, the original body/projection separation, scope association, storage/context association and final acceptance. Storage owns immediate per-original attachment, operation/close attribution and genuine-error recording before safe projection. Owner owns actual close dispatch, transfer, joining, sticky revocation and both guards. Use the existing capsule API; add no public parameter or generic callback registry.

The new fixture observes the exact originals of: complete composition body; post-body projection; storage/evidence/stores/consume/context operation; runtime entry and runtime action; outer owner call; each immediate fulfillment/rejection observer. Where core retains an internal observer, a narrowly fixed nonthrowing observation tap in the **owned test image** may retain that same reference after its assignment. A new `.then()` in the test is an additional observer, never a substitute labeled as the core observer. Capture original returns without an `async` forwarding wrapper that manufactures another Promise. Calls needing post-return inspection attach a separate observer and return the original unchanged.

The complete caller must invoke `assertPreparationCompletion` from the projection after the genuine body settles, never from that body and never by enrolling the projection as an operation it then joins. Prepared/context binding compares the actual retained scanner, storage, owner and purpose. All real native/operation acquisition boundaries remain before fallible observation. Successful evidence transfer leaves state/evidence/Graph/scanner usable after normal runtime exit. Demonstrate the runtime contender can acquire at that stage while five outer contenders remain blocked; then consume/inspect through the real context and close once on explicit release or owner return.

## Exact test-image mapping policy

Freeze an absolute-path keyed map with exact input hashes, replacement match counts, output hashes and imported-module identities before any helper starts. Default loading is untouched. Reject duplicate/missing/near-name maps; no basename-only selection, process-global fs replacement, global Promise patch or arbitrary source rewriting. Keep the generated scanner/collector/namespace/Node program bytes and production lock/FFI behavior unchanged.

| Exact boundary                                  | Permitted fixture observation/injection                                                                                                         | Required invariant                                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| owner `node:fs` close import                    | Delegate to retained real close; ledger attribution and selected before/after fault                                                             | Owner dispatcher is covered; every other fs export is its original function, with original arguments/receiver semantics.                                    |
| owner keeper creation/clear                     | Lexical forwarding of `setInterval`/`clearInterval`; capture actual callback,60000ms,return handle/ref state and clear attempt                  | Exactly one **production** passive interval per owner; callback unchanged, no polling/work, no fake timer, no timer-generated settlement.                   |
| owner settlement assignments/HOLD entry         | Fixed taps retaining exact Promise/observer/keeper references and a bounded event after actual HOLD entry                                       | Read-only observation; do not alter private membership, outcomes, return values or guard predicates. No injected continuation.                              |
| storage fs imports                              | Actual opens/close/read boundaries and exact resource-generation selection                                                                      | Cover both existing fs imports, use owner dispatcher for enrolled close; no blanket hook across unrelated modules.                                          |
| complete storage/record/scanner call boundaries | Forward actual calls; retain exact originals, packet/method receiver; inject only named existing fault                                          | Preserve original Promise where it exists; scanner function/serialized body stays untouched.                                                                |
| lock fs import in owned image                   | Real open/close ledger only                                                                                                                     | Unchanged `withCanonicalLock`, `withExistingCanonicalLock`, holder record and actual flock/FFI. No alternate lock implementation or forced return.          |
| Graph fs and directory-file imports             | Real descriptor/Dir acquisitions and selected close faults after a genuine returned graph                                                       | One resolved Graph module/WeakSet shared by owner, storage and classifier observation. Actual relative open/FFI delegates unchanged. No constructor replay. |
| returned SQLite database/connection close       | Retain actual object and saved real close, observe/delegate with its actual receiver/arguments                                                  | No structural fake connection; wrapper close and underlying native client are separate linked records, not duplicate native obligations.                    |
| actual SQLite pre-return initialization         | Narrow **owned-image** native-client retention immediately after real construction, before initialize/wrap; selected real operation/close fault | Same actual native Database object and real initialization/cleanup/classifier bodies. Never call `createSqliteCleanupFailure` from the fixture.             |
| bounded snapshot boundary                       | Exact backup module fs boundary forwarding for acquired descriptor first-close fault; same actual snapshot and classifier module                | No fake snapshot result/error; no adapter algorithm or limits changed.                                                                                      |
| six historical setup fixture modules            | Separately reviewed fixed async fs/Bun.write/migration-call forwarding and existing owned-child seams                                           | Return original Promise, retain observer, receiver/arguments/cause; no new arbitrary caller-defined label.                                                  |

The SQLite and snapshot rows are **new ordinary image-map proposals requiring explicit static acceptance**, not existing qualified mappings or edits to adapter source files. They are implemented only inside the existing fixture's owned image builder. If preserving actual adapter/native identity requires altering adapter algorithms or production files, that exceeds this eight-path plan and must stop for a precise amendment. Prefer a fixed post-construction retention tap over replacing the Database class with a fake/subclass. Native construction returns before registration; reserve the ledger slot before entry, attach the returned native object before the next initialization call, and retain an entered/unreturned constructor as UNKNOWN. Do not claim that constructor-internal acquisitions before return have newly been repaired.

For scanner terminal before/after faults, wrap only the **actual returned monitor's** `.close` with the saved method and receiver. Before means zero calls to that saved close; retirement may call it once. After means the saved close returned normally and is never retried. An unexpected throw from the saved scanner close is UNKNOWN and forbids retirement; the scanner's reverse-close internals are not repaired or selectively retried. Treat that actual monitor as an opaque owned obligation, not an invented per-descriptor ledger. Any requirement for independent per-descriptor scanner closure needs a separate design, because rewriting its serialized function is forbidden here.

Similarly, distinguish Graph object's `closeFiles` call from its native per-original ledger. For a genuine Graph identity case, inject at an actual underlying Graph original close and catch the actual generated GraphCleanupFailure from that same module. A plain throw after the whole Graph close returns proves direct close uncertainty, not genuine inherited Graph identity.

The historical four owned-child mappings (source Git, namespace, emitter, collector) and six setup maps are useful source references, not automatically valid bytes at the new epoch. Re-freeze exact current text, operation caps, streams, join contracts and absence recovery. The historical emitter removes its fixture cancellation path in its owned image; the new image must explicitly document the same test-only ownership substitution, not silently claim byte identity. No child is killed to retire UNKNOWN. Production transports/supervision remain unchanged.

## Resource and close ledger

Preallocate a bounded record before entering each tracked native acquisition; attach the actual returned original immediately. Key by fresh generation/token, never fd alone. A returned numeric descriptor reused by the OS gets a new generation. Ledger fields include exact acquisition label, original function/receiver/arguments, phase, acquired object/fd, immediately observed dev:ino where applicable, saved close, selected role/environment, production attempts, native entries, native normal returns, original thrown value, fixture close attempt and ownership parent. Acquisition or observer failure does not drop the partial record.

Fixed families derived from current source:

- storage parent anchor; every main reopen; initial `readCapture`; backup reopen; backup finalizer; state directory; evidence directory;
- actual authority and backup read-only database; actual authority connection and its underlying native client when visible;
- returned raw Graph and its real retained/reopened descriptor/Dir originals;
- returned restoration scanner monitor; genuine inherited Graph/SQLite/snapshot error plus corresponding retained native records;
- five outer canonical lock descriptions and entered solver-runtime description;
- fixture-owned independent SQL observations, setup/native children, contender children, original stdout/stderr readers, exact timers and original async operations.

Never infer delegation from an exception message, errno, EBADF, `fstat` failure, process disappearance, an fd scan or a new wrapper. Distinguish `not-entered`, `entered`, `returned`, `threw/unknown`. For an injected after-return error the **native** state is returned, while production correctly remains UNKNOWN. Before-native injection records production attempted but native not-entered. Preserve the exact cause objects independently of outward sanitized errors and mutable diagnostics.

Capture five outer locks from actual opens: `<edge>/edge.lock`, dev state `poll.lock`, dev state `devsync.lock`, prod state `deploy.lock`, dev state `deploy.lock`. Runtime is `<edge>/solver-runtime.lock`, only after actual entered acquisition. Record actual path arguments and open descriptions before fault, not reconstructed fd numbers after it. Immediate real contenders use `withExistingCanonicalLock` against those exact existing canonical inodes and expected held error prefix; any other error is not exclusion. The later outer-only cases require runtime acquisition success and outer exclusion, rather than pretending a released runtime remains held.

Pre-open the two independent fixture SQL observation connections and retain their originals before the chosen fault. Read actual DISABLED/null or committed prod ENABLED/dev DISABLED prefix through those originals at the named barrier. No after-failure resource discovery or fresh database acquisition is needed to reconstruct custody. A test may observe through its already owned independent oracle; production work after poison must remain refused.

## Controller, windows and finite retirement

Each admitted row gets one helper process and a closed fixed controller. The helper entry awaits only that finite controller. It retains the real `withDependencyOwner`/preparation operation in the background with immediate observers; it does not leave an unresolved top-level await that Bun could convert to exit13. The controller never supplies a replacement runtime/body Promise.

Distinguish three classes:

1. Native/setup/operation work that can complete: retain original plus observer and actually join both. All independent children, exits and readers must reach known terminal outcomes. No same-turn pending flag is a native pending proof.
2. Intentionally parked production control-flow: exact owner/runtime/body/projection Promises and their observers remain pending when their actual dependency chain reaches permanent HOLD. Retain them strongly and record this fact. **Do not await their settlement to qualify retirement and never call them joined.** Reject any unexplained pending Promise with potential future native work. For outer HOLD after synchronous release failure, body/projection/runtime may already be settled; use the actual topology, not a blanket pending expectation.
3. Fixed fixture controller operations: window waits, clock notice and packet writes are separately retained and joined. Expiry never completes class1 or2.

A fixture passive keeper may protect pre-production preparation and STOP; a parent keeper protects unknown helper/readers. These are separately named fixture handles, not extra production keepers or evidence of production custody. Capture exactly one actual production interval created by enrollment and prove it stays referenced throughout HOLD. Do not substitute a fixture handle for it. If the requirement is interpreted as one total interval across parent/fixture/production, that is not compatible with independently retaining unexpected pre-enrollment/parent UNKNOWN; this design asserts one production keeper per owner, with explicit independently owned fixture handles.

Fault event must be emitted synchronously after the chosen original close attempt and its direct attribution; HOLD event must identify actual entry into the production parked branch, not merely a still-pending outer Promise. Retain all resources before those events. Close out legitimate remaining unattempted production originals; a sweep may continue after work expiry without new observations or renewed deadlines.

At actual HOLD entry, freeze the ledger's selected original frame and counters. Start one immediate independent contender process for all six descriptions; capture PID, original exit Promise, independent stdout/stderr readers, each reader.closed original/observer, pumps, EOF and bounded bytes. Join it. Wait one fixed250ms interval with its retained actual timer/settlement, then run/join a second independent contender. No polling/retry loop. Both endpoints plus pending flags/unchanged close counters prove only that finite interval.

For expiry rows, advance only the reviewed owner/storage/complete **work-clock seam** past the original deadline after the known preparation or HOLD event. The controller's monotonic elapsed clock remains real. Do not rewrite serialized scanner programs or globally mock time. Call the actual revoked observation/owner boundary once and require refusal before any observed fs/SQL/transport work. Require no new production acquisition, reclose, runtime reacquisition or budget renewal. Deadline/window expiry is not permission to retire; the following conditions are.

Retirement order:

1. Require recognized HOLD topology or a genuinely terminal known control. Keep all exact production originals/observers. Join every remaining settleable native/setup/operation observer, fixture wait and child/reader. Verify all prospective production continuations are either already settled or permanently parked on the actual unresolved keeper; no outstanding native future may still acquire/use an original.
2. Emit bounded `PRODUCTION_HOLD_ASSERTED` (or separate known-control frame) containing source/image/case identity, lock-phase distinction and finite oracles. Preserve oracle failures; a safely retired failed test must still fail its callback.
3. Disable only the fixture fault injector. For every non-lock original: native returned => no more delegation; known never-delegated => exactly one saved first actual native close with original receiver/arguments; entered/unreturned/throwing actual close => STOP, preserve originals/handles. Wrapper/underlying aliases must share the native obligation so they are not both closed. Unexpected scanner/Graph internal failure cannot be repaired by calling the aggregate close again.
4. Only after non-lock originals are accounted, retire exact still-open original lock descriptions using their saved real close **because production is permanently parked and cannot reach finally**. A known-control lock must already have closed in production and is never fixture-closed. This is fixture retirement, not production release.
5. Require every declared original's actual fixture/native closure outcome and all external actors/readers joined. Emit `FIXTURE_ORIGINALS_CLOSED`, with distinct production versus fixture close origin/count. Preserve thrown oracle failure for the final packet. No fd census, process exit or timeout substitutes for this ledger.
6. Clear only the exact captured production/fixture timer handles after those conditions. Never resolve keeper.pending, mutate owner membership/capsule states, mark production known, run a production continuation, unref an unknown process, kill a child or retry a delegated close. Finite entry resolves; natural helper exit is then corroboration, not the reason originals count closed.
7. Parent independently joins helper exit and both original readers/closed observers/EOF before accepting its framed packet. Require normal exit0 for an accepted observation transport, bounded complete packet and no unexpected diagnostic stream. A packet with failed oracles produces a failed test despite safe retirement. Parent timer retirement likewise requires its original setup/build/write/helper/reader ledger complete.

A known closed failure in setup can return a bounded refused observation; unknown setup/build result, missing original Promise/observer, truncated pipe, reader rejection, lost child or actual native close uncertainty leaves the parent/helper keeper retained and starts nothing later. An external observer budget may report the unresolved state but does not signal, clean, resolve or certify it. Such a run cannot safely enter normal automatic CI until its finite admission/containment has been independently reviewed.

Proposed inherited bounds: preserve180000ms genuine preparation allocation and240000ms external observer envelope from R4; fixed250ms observation window; existing production deadlines and all CI/default/per-case budgets unchanged. Freeze actual child/setup/stream/cap tables before implementation acceptance. Do not reuse historical caps as measured sufficient. Adding many genuine scenarios might exceed current leaf capacity; no4500s capacity claim follows from this design, and budgets must not be raised to conceal that result.

## Exact proposed acceptance roster

All titles below are literal templates with **closed, explicitly listed variants**. This table defines37 proposed new storage cases; it is not a registered-test census or an execution receipt. The existing two migrated cases and existing missing-evidence/wrong-purpose/physical-finalizer group retain their titles/counts. Freeze an expanded literal list and digest in the actual source before execution; no callback registry accepts arbitrary roles.

| New title template                                                                  | Exact variants and actual selection                                                                                                                                                                                                                                                                        | Count |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----: |
| `UC2 direct ${role} close ${delegation} retains actual runtime custody`             | roles=`anchor-main`, `capture-read`, `backup-read`, `backup-finalizer`, `database-authority`, `database-backup`, `connection-authority`; delegation=`before-native`,`after-native-return`. Select the first matching genuine original at its named storage callsite/environment, never a numeric-fd guess. |    14 |
| `UC2 direct anchor-parent close before-native retains actual runtime custody`       | First prod parent at committed storage anchor-finalizers; existing anchor-close supplies after-native-return coverage.                                                                                                                                                                                     |     1 |
| `UC2 inherited Graph final-close ${delegation} retains actual runtime custody`      | Same two delegation values; first returned raw graph, real primary refusal after actual committed capture inside storage, then fault one actual Graph native original during cleanup. No constructor variant.                                                                                              |     2 |
| `UC2 late ${role} close ${delegation} retains only outer custody`                   | roles=`state`,`evidence`,`graph`,`scanner`; same two delegation values. Genuine prepared/consumed object after normal runtime release, actual release close; Graph uses real final-close identity, scanner only its saved returned-monitor close.                                                          |     8 |
| `UC2 inherited SQLite initialization ${delegation} retains actual runtime custody`  | Same two values; actual readonly native client at storage's first authority-read initialization, selected real initialization refusal plus actual native-close fault; genuine registry error before database assignment.                                                                                   |     2 |
| `UC2 inherited bounded snapshot close ${delegation} retains actual runtime custody` | Same two values; first real bounded backup verification acquired file, genuine snapshot close failure and classifier identity. No fabricated error forwarded into storage.                                                                                                                                 |     2 |
| `UC2 runtime evidence transfer retains originals until outer cleanup`               | Genuine preparation, normal runtime contender success, actual evidence/stores/consume/context checks, known release and outer return.                                                                                                                                                                      |     1 |
| `UC2 swallowed release failure revokes observation before outer return`             | Genuine prepared release after-return fault, catch/discard its safe failure, actual context/owner observation once before outer return, zero downstream-work count.                                                                                                                                        |     1 |
| `UC2 dropped preparation close ${delegation} retains outer custody`                 | Same two values; genuine prepared object deliberately dropped, first evidence original selected by actual owner-return sweep.                                                                                                                                                                              |     2 |
| `UC2 expired preparation cleanup ${outcome} never renews work`                      | outcomes=`known`,`before-native`,`after-native-return`; genuine consumed preparation; move only work clock past its original deadline; known sweep or outer HOLD as applicable.                                                                                                                            |     3 |
| `UC2 genuine storage operation refusal closes originals and releases all locks`     | Same fixed early storage primary refusal with all actual closes healthy; no blanket HOLD.                                                                                                                                                                                                                  |     1 |

Do not promise all current filenames imply runtime reachability: freeze role selection predicates after storage enrollment is authored, with the exact actual callsite, phase, environment and ordinal. For example, `backup-finalizer` is storage's post-snapshot chmod/fsync descriptor (current lines576–589), whereas `backup-read` is inspectPublications' reopen (413–445). `database-backup` is `copied` at603; `database-authority`/`connection-authority` are inspectAuthority at354/364, with connection reached after real receipt. State/evidence late cases require completed transfer first. A missed predicate must refuse the row, never silently fault a different original.

Genuine graph constructor/transient groups already governed by the consumed private grant remain separately pending where no newly admitted ordinary path is proposed. This roster does not retroactively qualify those constructors or every adapter/scanner acquisition. If a source-specific inherited case cannot be safely made reachable under the new ordinary map, retain that full-goal requirement open and refine its concrete plan; do not replace it with a fake classifier call.

## Required migrations before executable publication

Preserve both literal titles `initial preparation anchor-close retains commits and closes directly owned original descriptors` and `initial preparation operation-two-cleanups retains commits and closes directly owned original descriptors`. Move their work into this new pre-registration controller; callbacks assert same-run packets.

Anchor-close keeps saved real close then PRIVATE_ANCHOR_CLOSE at the first prod parent after commit, actual safe storage failure stage `anchor-finalizers`, prod ENABLED/dev DISABLED and immutable commit prefix. Its actual runtime and outer calls stay pending; capture the real sanitized storage refusal at the forwarding boundary before it enters runtime HOLD, without expecting an escaping outer rejection.

Operation-two-cleanups keeps the actual final fenced read refusal plus saved-native-return faults on first exact state and evidence originals, with original argument/path/dev:ino selection and two distinct causes. It occurs after normal runtime exit: runtime contender succeeds, five outer contenders remain excluded. Preserve `assertSafeFailure` semantics and committed prefix. Do not weaken the injection or replace it with a plain operation error. Record actual safe refusal if it escapes prepare; never fabricate one if corrected final completion now parks the projection before returning. In that topology capture the safe failure at the genuine complete-boundary forwarding tap and assert the exact parked projection instead. This source-dependent placement must be frozen with the final integrated caller.

For `initial missing-evidence refuses preparation after real storage and closes actual retained evidence`, retain the actual packet/originals before hiding only evidence. Require production cleanup before fallback and rejection of `held.evidence.inspect()`. Remove unconditional late evidence.close. If a production-negative assertion fails, fixture fallback may first-close only a recorded never-delegated native original after preserving that failure; it must never invoke a supposedly idempotent public release to hide the regression. Wrong-purpose and physical-finalizer remain genuine controls. Also scan all existing release/finalizer/spy failures for newly reachable HOLD before publishing; these two named cases are a minimum, not an assumption that no other case can park.

Keep the four exact known drop/release live/expired cases and the known callback-refusal control. Their existing pre-fallback assertions remain essential. They cannot be replaced with helper exit or fixture cleanup success.

## Phases, scope and publication gates

**STATIC:** edit only the existing fixture/new ordinary definitions and owning inert checks first. Preserve historical helper prefix byte-for-byte. Freeze source-image map, genuine caller composition, exact expanded roster, class1/class2 Promise distinction, ledger/caps, private error and lock selections, packet grammar, pre-entry rejection and natural exit design. No actual helper/native/HOLD work during this phase.

**Harmless qualification:** under separately reviewed finite commands, qualify parser/image mismatch and missing/duplicate map rejection before acquisition; same actual forwarded receiver/args/return/throw on harmless local sentinels; read-only source-copy reconstruction; single classifier resolution; unchanged scanner serialized program; build failure retaining original build Promise and observer; bounded packet parsing/truncation; no selector accidentally starting a private or full HOLD body. These are fixture-boundary checks, not native-custody proof. Building an image is not executing it. Import probes must be checked for top-level FFI before being called harmless.

**Known genuine composition:** after new image review and explicit execution boundary, one fresh full known preparation/transfer/consume/release observation with actual originals and joined children, then known operation refusal. Reuse their real resource roster only as a reviewed expected schema, never as a post-fault census or cached outcome. No next scenario if unknown.

**Contained HOLD:** separately freeze exact row/grant/allocation/source image, run only admitted row(s), retain all original streams/evidence, independently review finite retirement. Start with the existing two migration cases, then each distinct native family. This report grants none of these executions. Do not replay the old private max-one entry.

**Integration/R5:** implement storage/complete enrollment and the fixed owner contracts together with qualified migrations. Other Astra owns core regression/physical R5 now; this report does not duplicate or pre-credit them. Each later safety guard still needs its own reachable unchanged-consumer before/fault/exact-restored proof. A fixture omission test establishes only the fixture boundary it physically breaks.

**Census/publication:** the exact source/test support roster remains owner, storage, complete, owner test, storage test, existing custody fixture, `eslint.config.js`, and `tools/tool-devsync/src/eslint-boundaries.test.ts`. No new production file, participant-preparation edit, Graph test/source edit, complete39 edit, lock/FFI change or workflow change. Proposed owned-image copies of other read-only modules live only in the existing fixture mechanism and require the static equivalence review above.

Before editing census, materialize the separate `ci-remote-capacity` R4 exception for `tools/tool-remote-scripts/test/ci-leaf.ts` and actual expectations in `tools/tool-git-hooks/src/hooks/ci-remote-tests.test.ts`. Current exact69 appears in leaf receipt and fixture expectations at approximately99,1048,1133,1852; search again on frozen final source. Derive the new literal count from all actual expanded registrations, including any added harness checks, rather than adding a proposed table count to69. Preserve singleton storage, exact rest exclusion, eight leaves/seven matrix members, private-three exclusion, complete39, Graph228 and all other receipt/budget contracts. No guessed receipt value is prescribed here.

A draft PR triggers ordinary CI. Therefore the first **enrolled executable** publication must already contain the accepted finite migrations, all other newly reachable HOLD containment and exact census amendment. A core-only checkpoint with no storage/complete enrollment has its separately reviewed reachability limits; it is not full UC2. Until the coupled unit is safe, publish only an unapplied reviewed patch artifact through the existing documentation work if needed. Never suppress mandatory tests, disguise HOLD as success, bypass hooks or rely on draft status.

The static design is actionable, but no finite helper/image source has yet been authored or qualified. Native and inherited-error injection reachability, source serialization equivalence, all case receipts and hosted capacity remain unverified. Those are the concrete next decisions; none justifies abandoning the required full UC2 implementation.
