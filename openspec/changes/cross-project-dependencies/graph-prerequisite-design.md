# Shared INITIAL graph validation design

Private implementation contract under the existing original-handoff V3 design; no new public protocol or owner authority.

## Decision and exact writable scope

Recommend **three existing paths**, leased together after review:

1. `tools/tool-remote-scripts/src/lib/initial-handoff-graph.ts`
2. `tools/tool-remote-scripts/src/lib/initial-handoff-graph.test.ts`
3. `tools/tool-remote-scripts/src/fixtures/initial-handoff.ts`

The fixture amendment is deliberate: its current `paths` map overwrites repeated activation labels across selected environments, and its only phases publish terminal state. Retaining the authored byte roster and adding an explicitly seeded plan-only mode is a smaller, clearer test change than duplicating its roughly 700-line graph authoring logic in the test or reconstructing a purported producer from directory scanning. Existing H6/H7/H8 fixture behavior must remain unchanged. No new file is required.

`edge-policy.ts` and `edge-policy.test.ts` remain **read-only**. Their contemplated amendment is unnecessary: the existing `GraphFiles` already owns bounded streaming reads and retained parent/file identities. Widening `captureEdgeRecord` to raw manifests, archives, arbitrary limits or arbitrary paths would add a second boundary without resolving semantic reuse. Its dedicated solver-ready reread remains intact in the existing disk reader.

All other Original47, Successor74, publisher, storage, source, owner, directory and fixture paths are read-only in this prerequisite. This is an explicit shared graph amendment alongside Original47, not a claim that Original47 already included these paths. Root owns the contract documentation and any later scope numbering. A worker needing another file returns the exact proposed amendment before editing it.

## Proposed exports — internal observation and content operations

Names below are proposed, not existing exports. Keep the existing `captureInitialHandoff` and `InitialHandoffGraph` signatures unchanged. No new CLI, package export, request wire version or owner API is introduced.

### A. `validateInitialHandoffPlan(plan, deadline): void`

Export `InitialHandoffPlan` and the function in the existing graph module. This is a synchronous, side-effect-free content validator using the existing deadline contract; it may read the monotonic clock through the existing request decoder, but performs no filesystem reads/writes, project execution, locks or callbacks. It returns `void`, not a validated/ready token or `InitialHandoffGraph`.

The exact closed input consists of:

| Field                     | Content and role                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `edgeState`               | Canonical edge-state namespace to which the intended active policy binds. It is a string comparison input, not a path the validator opens.                                                                                                             |
| `pending`                 | Original `EdgeRecordSnapshot`, with exact pending string including LF and original file/parent metadata. Its path is the exact pending basename in `edgeState`. This structural snapshot is evidence input, not authenticated authority.               |
| `handoff`                 | Exact planned `{name,sha256}` root reference in the handoff-complete family.                                                                                                                                                                           |
| `records`                 | Finite readonly array of `{name,contents}` containing precisely the reachable owner-envelope closure, including already-retained original records and all five intended new handoff/exposure records. No arbitrary resolver function or fallback read. |
| `manifests`               | Exact `{writers:{name,contents},source:{name,contents}}`, with the two accepted raw families and exact supplied strings, without normalization.                                                                                                        |
| `fences`                  | Exactly eight ordered `{environment,name,snapshot}` entries using the existing `FENCES` order. Each snapshot names the original fixed fence path and preserves actual original bytes and file/parent identity.                                         |
| `artifacts`               | `InitialHandoffArtifactContents` from the raw observer below: migration manifest text plus selected raw capture texts and observed backup size/hash projections. It carries no binary DB body or authority.                                            |
| `policyContents`          | Exact intended active policy bytes, bounded to4096.                                                                                                                                                                                                    |
| `preparedPointerContents` | Exact intended prepared pointer bytes, bounded to4096.                                                                                                                                                                                                 |
| `completePointerContents` | Exact intended complete pointer bytes, bounded to4096; it differs from the prepared pointer only in its accepted phase.                                                                                                                                |

All fields are required and runtime closed. Use precise readonly types; record bodies remain unknown until the shared existing closed decoder validates them. The allowed record families are exactly those reachable in the existing reader: five handoff/exposure families; solver-restore-intent and solver-restore-complete; activation-participants, activation-capture, activation-backup, activation-intent, activation-committed, activation-participant-restore-intent, activation-participant-ready, activation-participant-policy-intent and activation-participants-restored. This does not admit every filename accepted by `captureEdgeRecord`.

The validator rejects duplicate names, absent refs, conflicting bindings, wrong families, extraneous supplied records, non-predecessor references and invalid ordered activation membership. It computes digests from exact supplied strings itself. It uses the existing owner publication decoder, request decoder, writer/source/migration codecs, receipt decoder, solver restoration decoder, ready grammar and all existing attribution/crosslink comparisons. Preserve local BE/GW attempt UUIDs and the source intent's `hash(JSON.stringify(decodedIntent))` meaning. Never normalize owner bytes or replace them with a parsed/re-serialized owner.

Factor one private semantic traversal and narrow shared raw/fence semantic functions. Both this new input adapter and the existing disk capture path use those same functions. A private finite content index is acceptable; exporting a generic `GraphFiles`, filesystem port, `read(name)` callback, `ready()` callback or a second private producer schema is not. The disk reader still discovers/reads only actual referenced bytes and may ignore unrelated historical records on disk as before; only the caller-supplied plan array must be exact. Do not turn plan-array exactness into a scan/rejection of unrelated files in the edge directory.

H1 supplies planned future completion bytes solely for syntax, attribution, crosslink and serialized-size admission. Their presence in memory says nothing about whether exposure or archival happened. The validator compares planned fence/owner archive descriptions to the supplied original snapshots; it does not assert archive existence, source absence, live participant readiness or final pointer validity. Actual H3–H8 effects/readbacks must match the retained predictions before publication. The producer must keep the exact serialized plan privately and reject later divergence; this prerequisite neither reserves sequence numbers nor publishes those predictions.

Check LF-inclusive UTF-8 size on every ordinary envelope before JSON parsing, writer/source limits before decoding, and policy/pointer limits before parsing. Reuse existing semantic limits: capture4MiB/4096 rows, migration4MiB, source64MiB, writers256KiB, ordinary65536, policy/pointer4096, backup1GiB each/two total2GiB. Reject ill-formed string encodings rather than approving bytes the UTF-8 publisher/readback would change. Shared traversal accounting retains the64-file/128-edge contract and includes eventual fixed executing tuple reads in plan capacity accounting; do not enlarge limits or omit branches to fit.

The structural artifact projection may be constructed by a codec test. Therefore passing this function proves only internal consistency of the supplied intended content. The genuine producer must call the fixed raw observer and close its original observations; accepting a matching caller-supplied hash is not producer provenance.

### B. `captureInitialHandoffArtifacts(request, deadline): InitialHandoffArtifactObservation`

Export the request/contents/observation interfaces and this synchronous fixed read-only operation in the same module. It shares `GraphFiles` and the current artifact capture implementation, with no SQLite open, subprocess, native service call, writer or owner creation.

`InitialHandoffArtifactRequest` is closed and contains:

- `edgeState`: canonical exact edge-state directory.
- `owner`: exact original owner publication string; decode it and compare its plan to `activation.owner`.
- `activation`: existing `CompleteDependencyActivationRequest`; reapply the existing closed decoder/deadline contract at this public module boundary rather than trusting an unchecked cast.
- `databases`: the exact prod/dev ordered database bindings already described by the graph's private `Database` shape (`environment,path,host,directoryIdentity,fileIdentity`). Extract/reuse that existing shape/decoder; require both even when only one is activated.
- `selected`: entries in exact `activation.activate` order, each `{environment,capture:{name,sha256},backup:{name,sha256,bytes,migrations}}`. These are actual parked capture/snapshot outputs at the future producer call site. No committed receipt, participant record, intent or future completion is required here.

The observer derives all paths internally: `edgeState/dependency-activation-<original attempt>/<env>.capture.json`, `<env>.before.sqlite`, and `edgeState/dependency-artifacts/<selected manifest hash>/manifest.json`. It accepts no arbitrary filename/path, fd, maximum, image, candidate or callback from the caller. Names in `selected` must equal those fixed basenames; candidates, capture targets and attempt suffixes derive from activation, database bindings and original owner. Directory membership must equal precisely the selected capture/backup pairs. No unselected evidence is invented or required. Check the activation request's raw writer/source string byte limits before invoking their existing decoders, so an oversized request is not decoded before bounded admission.

Before opening/allocating from a claimed size, reject malformed/zero/over-limit backup sizes and combined bound. Stream complete bytes with chunks<=1MiB, independently compute hash/size, keep binary bodies out of memory and preserve original descriptor/path/parent identities. Reuse exact migration manifest codec, complete applied-ledger/hash comparison, raw capture closed grammar and4096-row bound. Keep the existing mode/ownership/link requirements; do not silently broaden them or invent a different archive/backup policy.

Return `{contents, verifyClosure, assertStable, closeFiles}`. `contents` is an immutable ordinary projection: exact `migrationManifestContents` and ordered `selected` entries containing `environment`, exact `captureContents`, and observed backup `{name,sha256,bytes}`. Keep original descriptors, identities, expected roster and original strings privately until close. `verifyClosure` independently reopens/re-hashes all selected artifact bytes under the original deadline; `assertStable` checks original baselines; `closeFiles` releases this observer's descriptors only. Using either observation method after close must refuse, so an emptied map cannot masquerade as a stable observation. Partial construction closes only its own opened descriptors before throwing.

Extract a private capture-into-existing-GraphFiles core. The existing H6/H7/H8 reader calls it using its current graph lifetime, retaining all raw reads within that SAME graph's closure and total budget; it does not create an independently closed observation or silently drop raw files from later checks. The exported raw observer uses its own instance. The subsequent shared semantic traversal still verifies every post-DML activation intent/capture/backup/commit/restored receipt crosslink. The raw-only observer cannot establish any receipt or activation effect.

This API supports the future storage full-handoff mode before DML because parked raw evidence already exists then. Wiring it at that location requires an explicit later storage/preparation scope. Calling it only at H1 would be too late to satisfy the accepted pre-DML requirement.

## Preservation conditions and caller map

Existing production chain remains `solver-active-admission -> captureInitialHandoff -> shared semantics + actual disk checks`. Before returning its `InitialHandoffGraph`, disk capture still requires all of: exact opening policy snapshot; active policy and matching prepared/complete pointer; exact owner layout/source bytes; dedicated actual solver-ready reread; eight actual archive identities and original fence absences; existing pending/archive phase matrix; all actual raw artifact reads; original closure/stability. `retainExecutingFile` remains bound to the four exact solver tuple files. No caller-selectable `phase='plan'` is added to this API.

Future genuine original chain is `actual parked preparation -> captureInitialHandoffArtifacts -> actual DML/restoration/policy closing -> genuine private continuation -> validateInitialHandoffPlan -> actual H1/H2/H3... -> captureInitialHandoff at H6/H7/H8`. The producer builds all references from retained returns and original observations. It must not harvest seeded files, reconstruct authority, use a public fixture accessor, or equate validation with H2 eligibility. No production caller is wired in this three-path prerequisite.

The existing publishers stay live-owner-only. `captureEdgeRecord`, solver-ready capture, ordinary controller admission, original owner guards, no-replace rename and all existing restoration defaults remain unchanged. There is no new public hard-to-reverse domain decision: this is an internal factoring of already accepted V3 prepublication validation. Public reusable graph protocols, opaque validation grants, alternate persisted schemas, arbitrary layout/reader ports or changing consumer wire semantics would be new decisions and remain open, not implicitly approved here.

## Required safety refinements

### P2-1: Give all external content an explicit early bound

The proposal explicitly bounds ordinary envelopes/manifests/policy/pointers, but `pending.contents`, each original fence snapshot's `contents`, and the raw request's standalone `owner` string are not ordinary envelopes. Its existing disk counterparts are bounded to65536 before decoding (`captureOwnerArchive` at755, `captureFences` at770). `decodeDependencyOwnerPublication` itself supplies no serialized-byte bound.

Add this exact obligation: before JSON parsing, hashing, cloning a supplied roster, or constructing the finite content index, require well-formed UTF-8-representable strings and1..65536 encoded bytes for standalone owner/pending/eight fence strings. Keep exact bytes including existing LF; do not canonicalize them. Require a numeric maximum for the supplied record-array length before enumerating entries: at most64 is a safe preliminary ceiling, followed by the stricter existing aggregate64-file accounting including raw files, archives, fixed policy/pointer and four eventual executing files. Validate exact two manifests/eight fences/two database bindings/one-or-two selected entries before mapping them. Preserve each existing narrower content limit.

This avoids approving an oversized original snapshot that the actual H6–H8 reader cannot open, or doing unbounded preliminary work on an array whose reachable subset is small. The new boundary should reject oversized unused entries too. Add ordinary negatives for oversized standalone owner, pending and fence content, early record cardinality, malformed surrogate strings, and no normalization of a valid exact owner string. These are additional precision for G1/G2/G5, not permission to widen disk acceptance or claim an independently reachable64/128 omission.

### P2-2: State final deadline assertions and close semantics explicitly

`decodeCompleteDependencyActivationRequest` checks the deadline at entry and its600000ms upper ceiling; it does not guarantee a final check after the entire graph validation. `GraphFiles.assertDeadline` guards I/O but is not automatically inherited by a new pure traversal. A call that starts before expiry must not return successful validation after expiry merely because its last clock check occurred while decoding admission.

Require both exports to check the same original finite deadline at entry, between bounded traversal/codec stages, and immediately before successful return; raw closing/stability methods keep that original deadline too. A final check after expensive hashing/decoding is mandatory. No renewed budget or success-after-expiry. Cleanup must still be available after deadline expiry. Define closeFiles as cleanup of this instance only, with an explicit repeat-close policy (idempotent is suitable for compatibility with current GraphFiles cleanup); verifyClosure/assertStable after close always refuse. A failed public observation construction releases all descriptors it acquired; it never closes a caller's descriptor.

Add a validation-expiry case that reaches semantic work before expiration and then refuses at the closing deadline boundary, plus expired cleanup and repeated-close coverage appropriate to the chosen policy. Retain the proposed chunk-read expiry and post-close tests. This does not authorize controlled-clock execution or change existing request/admission deadlines.

### P2-3: Make immutable custody and pure canonicality executable requirements

The proposed readonly types do not themselves detach caller arrays or freeze nested values. Define the raw observer's retained closure as depending only on its own captured primitives, descriptor identities and copied rosters. Detach `databases`, `selected`, nested refs and migration-name arrays at admission; keep the existing activation decoder's detachment. Deep-freeze the returned content projection, or return a fresh detached projection whose mutation cannot affect retained observations; a shallow freeze is insufficient. No returned request/projection object may alias private expected baselines. Test mutation of original selected/database inputs and attempted nested output mutation after successful capture, then independently change the actual file and require refusal against the original baseline.

For the pure plan adapter, canonical namespace validation means absolute, normalized, NUL-free lexical spelling and exact expected fixed basename/layout bindings. It cannot certify realpath, filesystem ownership, existence, readability or custody without I/O. State that distinction in JSDoc. Use the already exported `decodeEdgePolicy` for the intended active policy, plus the shared pointer decoder/checks; explicitly require active phase, exact edgeState/owner/root binding and identical decoded prepared/complete fields except phase. Preserve exact strings for policy hash checks. Snapshot identity fields must use the existing canonical decimal grammar and mode0600; compare to archive declarations without inventing ctime equality across rename.

Add corresponding malformed metadata/path/policy tests without widening edge-policy.ts. Pure validation remains consistency of supplied evidence, never authentication of those metadata claims.

## Planned private cleanup identity contract — 2026-11-01

The accepted Graph2 component is now composed at private HEAD `7d6f1a47bc562672f25b0573666d337cf6dfebb0`, preserving graph SHA256 `49903143ef5dd30e4573b887bfa46f8a3c88f48268c8a26af0c2332457830e20` and owning-test SHA256 `e327abe9036a62962ac5b055060126425d7676fee6be7ed0fd0549601b2cddbe`. Earlier proposed three-path API scope and accepted ordinary receipts retain their historical meanings. The following is a new planned internal cross-file contract within the [ten-path caller amendment](original-handoff-design.md#planned-private-caller-custody-correction--2026-11-01), not an export already implemented or authorized by Graph2.

Explicitly add `isInitialHandoffCleanupUnknown(cause: unknown): boolean` to the existing graph leaf. Keep `GraphCleanupFailure` private and an `AggregateError`, preserving original `.errors` and custody. Register only actual constructed private cleanup-failure objects in a module-private WeakSet. Exact object membership classifies UNKNOWN; message matching, a `cleanup` property, copied fields, spread objects and copied prototypes cannot classify. The WeakSet returns only a boolean: no owner, resource, decoder, settlement token, diagnostic getter, retry or discharge capability. It is not the strong custody owner.

Classify every outward graph error representing unknown original cleanup, including failed construction before assignment and reopened-file/directory-stream close failures before the terminal sweep. Ordinary malformed/read/deadline refusal with all owned closes known successful remains unclassified. Preserve actual operation and cleanup attribution, attempt-all ordering, expiry cleanup, successful transient-resource retirement, observation revocation and the identical terminal failure on repeat close. Retain transient unknown originals/failures through the final classified terminal outcome while sweeping other unattempted originals once; never retry a throwing native close, including after real delegation.

Leave `AuthorityCleanupUnknown`, supervision and shared lock code unchanged. The new graph classifier supplies private caller information, not proof of descendant custody or permission to unwind a lock. Original owner capsules and active retained state supply strong references and a live passive keeper before safe wrapping/timer clearing. Raw aggregates must never become a cause/property of outward `DependencyActivationFailure` or a log entry; active HOLD uses its existing fixed safe message. [The planned scenarios](specs/cross-project-dependencies/spec.md#requirement-original-unknown-cleanup-retains-actual-caller-custody) and ordered tasks remain unimplemented; no new Proof claim or caller/runtime acceptance is established here.

## Planned explicit full graph test placement — 2026-11-02

### Intent

The focused cleanup-identity checkpoint is committed at Root-supplied published HEAD `b6d72d0207cace4e042c477908ff842e44257c62`. It does not qualify full228, current legacy11 or default CI. The current graph test admits only its focused15 mode while11 historical close callbacks still start native helpers inside timed callbacks. Introduce one test-only command owner and explicit202 ordinary,11 legacy and15 identity invocations, preserving all callbacks, original fixture assertions and25 fresh close-settlement helper executions.

This subsequent five-path test/config scope is an explicit exception to the earlier ten-path prohibition on a new source file and CI/config changes. The first source slice is only the nonfunctional typed launcher scaffold plus eight pure admission tests in the existing CI owner. Observe their legitimate assertion RED before working behavior; later placement/routing work has its own reviewed tests and grants.

No production Graph behavior, native seam, assertion byte program, dependency, CI matrix/leaf/host, scratch policy or budget extension is included. Actual UNKNOWN retains originals and stops. Finite known-outcome fixture qualification does not claim immunity to external CI/OS/interpreter termination; that termination is not a closure receipt.

### Exact subsequent scope and first RED slice

The complete later test/config implementation scope is exactly:

1. `tools/tool-remote-scripts/src/lib/initial-handoff-graph.test.ts`.
2. `tools/tool-remote-scripts/test/run-tests.ts`.
3. `tools/tool-remote-scripts/project.json`.
4. `tools/tool-remote-scripts/test/ci-leaf.ts`.
5. `tools/tool-git-hooks/src/hooks/ci-remote-tests.test.ts`.

The first two-source RED slice may create only `tools/tool-remote-scripts/test/run-tests.ts` and append the reviewed pure callbacks to `tools/tool-git-hooks/src/hooks/ci-remote-tests.test.ts`. It leaves `tools/tool-remote-scripts/src/lib/initial-handoff-graph.test.ts`, `tools/tool-remote-scripts/project.json` and `tools/tool-remote-scripts/test/ci-leaf.ts` read-only. Production `tools/tool-remote-scripts/src/lib/initial-handoff-graph.ts`, global scratch modules, workflow/Nx-global files and every other path remain outside this implementation scope. No sixth path or production API is implied. Preserve all earlier source histories; this is a later reversible test-placement exception, not retroactive authority for their epochs.

Current read-only production is `bdf3da709f70238e073fcc7db1f51870e855959477048645c1fcd46bb3b042ef`; current graph test is `b3f269c9997fd78bf1d26b1a35e4132c61c6ad58f6fbf684ce5cc0e4e7b1725b`. Historical production29b runtime evidence retains its original meaning. Revalidate every current target prefix and the new launcher's absence before materialization. Root supplies checkpoint HEAD and clean/published status; the source-only preparation does not independently run Git.

### Explicit admission, composition and receipts

The launcher owns exactly one public command from `canonical`, `graph`, `graph-ordinary`, `graph-legacy`, `graph-identity`; extra paths/filter/timeout/preload arguments and unsupported selection/configuration refuse before dispatch. It derives the trusted root from its own installed module location and binds the actual graph module and pinned executable. New admission is explicit `partitioned-228-v1`, never an implicit no-flag/full mode or reinterpretation of historical `focused-identity-15-v1`. Bun-consumed selection flags are proven only by the launcher's actual constructed argv, not reconstructed from public child argv.

Every graph invocation checks the same complete228 literal declarations/order/options and SHA256 `9676491473de150ee073672db57973de44ec6707f2e1a5f5f5b75384e4bd2a` before mode selection. The serial disjoint partition is202 original ordinary callbacks,11 original legacy callbacks and15 identity callbacks. Preserve the202 ordinary bodies and options. Legacy uses11 fresh `classify=false` helpers in order `file-before`, `file-after`, `parent-before`, `parent-after`, `multiple`, `raw-read`, `disk-construction`, `transfer`, `verify`, `stream`, `disk-final`, preserving the existing malformed-disk mutation. Identity retains its distinct14-helper `classify=true` roster and exact14-record map. No prior14 receipt can supply legacy11 or multiple; its native totals must be observed rather than guessed.

For legacy and identity, actual native preflights and original process/reader joins complete before registration of timed callbacks and the deferred existing cleanup hook. Those timed callbacks assert their own same-invocation records only: no fixture/build/spawn/native/timer/fallback work. Launch those modes without the early scratch preload, then import the same unchanged cleanup module once after known preflight completion. Its30-second hook remains unchanged and requires an actual later owning check; unsupported deferred-hook behavior stops placement rather than dropping cleanup or widening a budget. Preserve the8056-byte native-seam wire SHA256 `9411c84549db792e46e2faa5d6a86c4dd6d3ce0737d7db9b2f3a8a4f0bd11794` and11916-byte assertion source SHA256 `ad8118c6d1ae0d1b199dd88c1bc506732a5026050218b5d981b913e0c83b2c8e` exactly. No new native shim is required for classify=false.

Success for canonical/rest is reported only after the complete fresh graph composition and actual assigned remainder each qualify. A failed, absent or incomplete graph phase stops later phases and cannot be masked by a successful remainder. Exactly one no-dot exclusion `--path-ignore-patterns=src/lib/initial-handoff-graph.test.ts` preserves near-name/elsewhere collisions and unchanged leaf ownership. The canonical command is `bun run test/run-tests.ts canonical` in existing cwd `tools/tool-remote-scripts`, retaining its inputs and `test:caddy`; all existing leaves, workflow jobs and partitions stay unchanged. A separately identified source/census-bound202/11/15 composite and actual remainder receipts are required; do not synthesize a Bun228-pass summary or substitute nested/old summaries.

Known-closed nonzero test-owner bookkeeping may retire a record only after actual native/child/readers are known, while retaining failure and stopping composition. It never broadens the identity assertion allowlist or turns unrelated infrastructure failure into PASS. Unknown fixture/child/reader outcomes retain actual originals/keeper with no retry, signal or later starts.

### Finite validation boundary

Preserve one45-second start allocation for each native mode,120-second Graph deadline,10-second cases,60-second proposed graph observation alarm, unchanged scratch30-second hook,75-minute CI phase and90-minute job. These are separate invocations, not operation renewal. Finite known-outcome fixture/CI execution does not qualify external CI/OS/interpreter termination as cleanup or prove host-survival immunity. All original UNKNOWN/one-shot/expired-cleanup requirements remain.

The direct first pure RED envelope requires absence of `BUN_OPTIONS`, every `BUN_TEST_*` name, `NODE_OPTIONS`, `PUNI_UC1_PREFLIGHT` and every `PUNI_REMOTE_GRAPH_*` name. Freeze the effective environment, exact eight-title selector `^graph launcher admission `, owning file, existing preload,10-second case/60-second observation bounds and original command/read custody. Missing exports/import/parser failures or unrelated/unknown outcomes are not legitimate RED. After reviewed scope materialization, separately lease the unchanged two-source payload and installed-only statics; then review final actual hashes/argv/environment before one RED. No working GREEN behavior is prepared before accepted actual RED.

Full228, actual legacy11/default CI, deferred cleanup, known-failure bookkeeping and each changed guard's safe necessity proof remain unimplemented/unexecuted by this scope amendment. No held Reader/Source4/native-loss recipe is enrolled. No task, full feature, gate or deployment completion follows.

## Scratch preload entrypoint scope amendment — 2026-11-02

The real Graph placement candidate passed formatting and configured typecheck but failed installed Nx lint: a relative deferred preload crosses a project boundary, and the recognized dynamic scratch-library edge makes existing static consumers invalid. Preserve the unchanged shared scratch implementation and post-join registration timing through declared module entrypoints. This later mechanical scope exception adds only `tsconfig.base.json` and `tools/test/scratch/package.json` to the preceding five implementation paths. The original source epochs and first two-file RED scope retain their historical meaning. No production Graph, scratch implementation, workflow, lockfile, dependency, install, budget or lint-policy change is included.

Keep the existing static `scratchSync` import. Resolve the deferred literal import as `@tools/test-scratch/preload` through an exact alias to `./tools/test/scratch/preload.ts`. The new private package is named `@tools/test-scratch`, declares module type, and exports `.`, `./index` and `./preload` to the existing index/preload source files. Installed Nx secondary-entrypoint parsing ignores the dot export; the explicit `./index` declaration identifies the physical index entrypoint used by existing root imports. This is declared module structure, not a rule exception or computed import. The root has no workspace glob requiring installation. These are source-reviewed expectations awaiting actual qualification.

Capture the existing `tool-test-scratch` Nx project before/after. Require its identity, roots, explicit targets and original tags to remain, permitting only expected private-package/export metadata. Run fresh graph-aware lint on both the Graph owner and existing static consumer `initial-handoff.ts`, configured types and scoped formatting. A separately bounded omission of only `./index` must restore the named lazy-import lint diagnostic; restore exact package bytes and rerun the same check. No application/native execution follows from these static checks. The seven-child harmless hook proof must bind the final scoped import and a fixture-local alias to unchanged copied scratch sources. Its modeled outcomes grant no actual native-join credit.
