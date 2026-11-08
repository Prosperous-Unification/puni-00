# UC2 ordinary harness — adopted static decisions

**GO for the inert two-file slice in the existing custody fixture and owner test. Adopt the decisions below; they resolve the draft's image-map, scanner, selection and final-projection choices. No helper/native/HOLD execution is included. Full UC2 requirements remain mandatory.** No dependency on producer-P evidence is introduced.

Source authority is published d8f9c6837 in 1b31. After notice of Matrix's writer lease, source reads used `git show d8f9c6837:<path>`; this report does not review mutable implementation. Read actual owner/storage/complete, historical fixture mapper/admission, storage fault consumers, scanner, SQLite initializer, backup, and both canonical/leaf argv producers. No tests, module execution, native/helper work, source edits or Git mutation performed.

## 1. Static slice: exact deliverable

Append new ordinary V1 definitions after the entire historical fixture prefix. Preserve that prefix byte-for-byte, including historical constants, source maps, admission, private function and terminal-only retirement. Do not refactor it for reuse. New ordinary names must not use its global mutable custody/parent state or private three-constructor protocol.

Implement only inert closed case metadata, source-map planning/transformation, admission planning and observation-packet decoders. Their inputs are supplied strings/bytes/records; they perform no filesystem reads, build, runtime imports, FFI, timer or helper entry. Tests in owner exercise those pure functions on supplied inert values. Do not add a successful stub `prepareOrdinaryDependencyHoldV1`, empty observation map or fake prepared/context success. The actual preparer is a later implementation, not an option silently disabled in an executable one.

Use a closed typed result for admission:

```text
OrdinaryHoldPlanV1 =
  { mode: 'prepare'; profile: 'storage-leaf' | 'canonical-remote' | 'local-exact';
    caseIds: readonly OrdinaryHoldCaseId[]; imageDigest: string; titleDigest: string }
  | { mode: 'not-selected'; profile: 'local-exact'; caseIds: readonly [] }
```

Malformed/unsupported input throws a named refusal; it does not become not-selected. A supplied actual observation is never created by this planner. Use a fresh invocation identity in the later controller and packet, so one case's packet or previous process's map cannot satisfy another callback.

The static roster is the draft's 37 new literal expanded rows plus the two existing migrated title/ID pairs. Freeze every expansion, uniqueness and digest; do not register new storage tests yet or set the CI census to 106 by arithmetic. The eventual actual registered storage census includes the existing 69, any independently added cases, and migrations that preserve existing counts. Owner's inert checks are ordinary rest-owned tests.

## 2. Image map: adopt a closed owned image, with one canonical module per classifier

Use an absolute canonical-path keyed map rooted in the admitted repository; source root may differ between a local worktree and hosted CI, but every relative module identity, exact input hash, cut count and output hash is reviewed. No historical /tmp Graph input or 681e source substitution belongs to this protocol. Never dynamically refresh expected hashes from whatever happens to be on disk. The inert current-source plan is not an admission pin for later integrated source; that epoch requires a new reviewed manifest.

Each map entry declares one of `transform`, `pinned-pass-through`, or `external-unchanged`. A transform has a closed ordered list of literal cuts, each exact expected cardinality, and its expected output digest. Require exact roster equality: missing/extra/duplicate/near-name paths refuse. Default loading for modules outside this closed map remains unchanged. A file at a similar basename is not a map hit. Each generated forwarding port also has a fixed digest and explicit exports; avoid the known ambiguous re-export chain. A transform must not import its own forwarding port back through itself.

Adopt these precise transformed modules/boundaries:

- owner: its fs import for actual direct-close dispatch; lexical production timer forwarding; fixed post-assignment Promise/observer/keeper taps and actual HOLD-entry taps. Guard conditions, membership, outcomes and callbacks are untouched.
- storage: both actual fs imports; SQLite call forwarding; actual Graph capture forwarding; immediate operation-return and safe-failure observation seams. A wrapper returns the original Promise unchanged and retains its own observer separately.
- complete: fixed original composition/projection/acceptance-return taps, scanner call forwarding, and the existing record-capture fault boundary needed by operation-two-cleanups. Do not rewrite scanner source or any serialized child program.
- lock: fs import forwarding for real open/close ledger only. Keep actual flock, canonical checks, callback/finally and holder records unchanged.
- Graph: fs and directory-file forwarding for native originals, preserving all real Graph algorithms and the same Graph module/classifier instance.
- SQLite db: fixed readonly-construction retention and selected initialization fault cuts described below; backup: its fs import forwarding for actual snapshot originals. No adapter source file is edited.
- the six existing setup fixture paths: independently specified current-source forwarding for async fs, Bun.write, migrations and the four owned-child seams. Preserve each original Promise/receiver/argument/cause and explicitly list any test-owned emitter cancellation substitution. No claim of byte identity for that substituted child ownership path.

Pin directory-file/FFI dependencies, SQLite cleanup classifier, backup classifier and relevant other dependencies even where unchanged. Alias and relative imports of db/backup/sqlite-cleanup/Graph must resolve to one canonical module each inside the owned image. The Graph wrapper imports that canonical Graph module, not a copied second class/WeakSet. Owner, storage and observer classifiers therefore see the same genuine identity. Resolve this statically in the build map; later harmless build inspection confirms it. Reject duplicate bundled/external instances rather than accepting equivalent-looking errors.

No generic user-defined hook registry is introduced. Cut IDs, ports, role selections and observer events are fixed unions. The test image may retain originals and selected faults; it may not manufacture success packets or invoke a private error issuer.

## 3. Scanner equivalence: keep it external and opaque

Adopt **external-unchanged** for the exact canonical `dependency-migration-artifact-scanner.ts`. All image references to that module resolve to that same external absolute source file. Do not bundle/reprint/minify its function; do not redirect its dynamic `node:fs` import or change `performance.now` inside it. `migrationScannerProgram()` serializes that function with `.toString()`, so unchanged input text alone is insufficient if a bundler rewrites it.

At complete's call boundary, a fixed non-async forwarding function calls the actual scanner, retains the exact returned Promise and a separately retained observer, and returns the original Promise. On fulfillment, its observer registers the genuine returned monitor and saves the actual monitor.close with its receiver before the caller continuation can expose it. The observer must settle and any observation failure must refuse/retain custody; no detached rejection may disappear. Later positive integration must verify this ordering using the actual caller.

Wrap only that genuine monitor's close for selected scanner rows. Before-native means the saved original method has not been called and may receive exactly one fixture first-call after quiescence. After-native-return means the saved method returned and is never repeated. A throw from the actual saved scanner method is unresolved; do not reverse-engineer/retry its internal reverse-close list. The scanner is one opaque owned obligation, not a fabricated per-fd proof. Its construction/internal-close UNKNOWN requirements remain real and separately open where the ordinary route cannot qualify them.

Harmless qualification later compares actual generated `migrationScannerProgram()` bytes from the unchanged source loader and the built image's external reference, using the admitted same Bun executable/version, without evaluating the generated scanner or calling scanMigrationArtifact. Also prove the image resolver cannot silently bundle a second scanner. STATIC only represents/checks the external policy and supplied digests; it does not execute those imports.

## 4. SQLite and snapshot: adopt the narrow ordinary mappings

Readonly db construction currently returns a real native client immediately before `initializeDatabase(client, ...)` in db.ts. In the owned image, reserve a fixed ledger slot immediately before that exact `new Database(...)`, attach the actual returned client immediately after construction and before initializeDatabase. Retain the saved native close and receiver at that point. A constructor entered without a returned client is UNKNOWN and cannot be claimed retired. No fake Database class or subclass, constructor-private replay, or application db algorithm change.

For the ordinary inherited-initialization rows, choose the first prod authority-read client at the storage inspectAuthority callsite (receipt absent). Wrap that actual client's initialization `run` only while selected: delegate the same real call with the same receiver/args, then throw the fixed primary fault after its normal return. The real initializeDatabase catch then attempts the saved selected close, generates its genuine registered failure and rethrows. Before/after close injection uses the independently retained real native close; never call createSqliteCleanupFailure yourself. This is genuine initializer cleanup identity with a test-induced operation refusal, not constructor-internal fault proof. Wrapper connection and native client records share one native obligation.

Snapshot rows forward backup.ts's exact fs boundaries. Select the actual verification-acquired file generation by fixed phase/callsite, not a numeric fd or broad first-close count. Fault its real close before delegation or after normal return; retain the actual resulting snapshot error and use the same backup classifier module. Preserve its parent/file dual-original ledger. Missed selection is refusal, never fallback to another original. These source-image proposals are adopted; their concrete literal cuts/output pins and retirement proof still need review before any execution.

## 5. Pre-registration selection: both normal runners remain supported

Use top-level preparation before registering migrated/new HOLD callbacks. Do not prepare all rows merely because the storage module was imported. Compute a closed plan first; only `prepare` may build/start a helper. The pure planner accepts an invocation descriptor supplied by a later thin actual-command reader.

Admit two normal unfiltered profiles from current source: (a) ci-leaf's exact singleton storage child argv/cwd; (b) run-tests canonical's exact DISCOVERY/preload/timeout/Graph-private exclusions, which also includes storage. Both prepare the entire ordinary registered roster. Supporting only singleton storage would gratuitously break the existing canonical runner; no runner/workflow change is needed. Freeze these literal vectors from d8f9c6837, not approximate substrings. Current singleton is project cwd, `test ./src/lib/dependency-activation-storage.test.ts --preload ../test/scratch/preload.ts --timeout=10000`. Canonical is the exact run-tests.ts child vector, including both existing excludes.

For local finite work, allow only exact anchored literal selected-title forms (or separately enumerated exact finite alternations) and an explicit matching ordinary selection discriminator. Decode by equality to compiled approved vectors; do not evaluate arbitrary regex, regex intersection or source substring matching. A selected ordinary HOLD title maps to exactly one fixed row; a reviewed inert/known-only storage title maps to not-selected and starts zero ordinary helpers. Unsupported filters/only/skip/watch/rerun/shard/config/environment selection refuse before preparation. `not-selected` is not a skipped HOLD test: the eventual registration remains present and, if unexpectedly invoked without its same-run packet, fails.

The runtime reader should capture actual executable, cwd, raw kernel argv on Linux and relevant environment/config identity before helper work; it must not assume process.argv preserves all Bun runner options. This read is a distinct later boundary, not part of the pure STATIC functions. Inherit the existing leaf restrictions on BUN_OPTIONS/BUN_TEST_* and configuration; validate the admitted actual runner metadata. Never infer absence of hidden selection solely from public argv. Harmless selection qualification must exercise actual Bun pre-registration behavior: allowed unfiltered/full vectors produce the expected plan; exact local selection prepares only its admitted row; unrelated known-only selection builds/spawns nothing; unsupported selection refuses before acquisition. Final whole-storage outer census is still required and never supplied by preparation packets.

Do not reuse PUNI_UC2_PREFLIGHT/PUNI_UC2_SELECTOR/private epoch metadata or /home/df executable pins. New ordinary discriminator/metadata has its own namespace, portable canonical root and executable/version binding. No private constructor case enters this ordinary roster. Source-matched explicit local vectors are finite test protocols, not a generic launcher.

## 6. Final projection HOLD: choose truthful pending topology, no escaping failure promise

Adopt the corrected original-body / original-projection / fixed completion-check split. The actual projection always passes through fixed completion acceptance after body settlement before exposing a successful packet. If sticky UNKNOWN is discovered, the actual projection/check/outer owner remain permanently pending at the production keeper. The harness observes this actual parked topology; it never expects or fabricates an outer rejection to make the test finish.

Anchor-close occurs inside storage before runtime release. Observe the genuine safe storage refusal at its actual rejection/recording boundary; runtime then retains it and parks. All six descriptions remain excluded. Operation-two-cleanups occurs after normal runtime return at the real final fenced capture; retain the genuine original safe `exclusion-or-finalizer` failure when complete creates it, before cleanup can replace an outward error. Record both real cleanup failures separately before aggregation. The final completion projection parks; runtime contender succeeds while the five outer descriptions remain held. The safe failure assertion now applies explicitly to the actual retained boundary error, not a falsely claimed returned preparation failure. Preserve committed prefix, prod ENABLED/dev DISABLED, original role/argument/dev:ino and both native-return counts. No recovery of already-overwritten deeper failures is implied.

There is one necessary integration refinement to the current success-only `assertPreparationCompletion`: its **known body-refusal** path must join body/observer/operations, reject UNKNOWN first, require requested known complete cleanup and no exposable prepared/context, then rethrow the retained original body refusal. Do not replace a known safe primary with a generic completion-refused error merely because body.outcome is rejected. The current successful fenced/prepared checks remain unchanged. This is a fixed branch in the existing owner method, not a new callback/API; implement and test it in the later coupled owner/storage/complete slice, not this inert fixture slice. If cleanup is not known closed, refuse/retain according to actual state rather than return success. A body failure projection invokes that method in its rejection branch; it must not return its body failure as a value.

Observe the exact acceptance-call Promise and its observer as well as body/projection/runtime/outer originals in the owned image. Separate settleable actual native work from permanently parked composition chains. Retirement requires all nonparked actual operations and observers joined and each remaining unresolved chain demonstrated to depend on the captured unresolved production keeper at fixed HOLD taps. A pending flag or timeout is not that dependency proof. Never await those parked chains as though they could settle; never resolve them or alter owner membership to finish the helper. Fixture first-close and timer retirement remain the draft's explicit ledger-based procedure after quiescence. No unexpected native delegated throw can be retired by retry.

## 7. Immediate ordered implementation constraints

1. Matrix authors pure closed roster/admission/map/packet functions and owner inert tests only, preserving historical prefix. No source enrollment, storage registrations or callable preparer stub.
2. Review actual source/digests, deterministic cut counts, rejection paths and absence of top-level acquisition. Qualify only harmless commands separately; generated scanner byte equivalence and real Bun selection need their own finite consumer, not claimed by static input tests.
3. Author the later image/controller and coupled production changes as an unpublished/unapplied patch until finite ordinary migrations are executable and accepted. The two migration titles and missing-evidence fallback must move with enrollment; scanner/native and discarded asynchronous cases stay required, not deleted or weakened.
4. Refresh the integrated exact pins and role predicates, then qualify one real known preparation/transfer/consume/release and known-refusal control before any ordinary HOLD row. Observe actual operations/streams, never a cached fixture packet. These are future runs, not granted by this report.
5. Admit the two existing migrations first, then each distinct actual native family. No child kill, constructor-grant reuse, delegated-close retry, fake classifier/error or silently widened timeout. Static image source can be published while inert; executable integrated HOLD cannot be pushed until the finite migrations and actual registration census are coupled and accepted.

The ordinary 37-row proposal does not discharge all twelve UNKNOWN groups. Constructor-internal/transport and scanner internal delegated-close provenance without finite retirement remain explicit full-goal work, with new specific protocols if needed. They do not block this concrete static implementation, and no producer-P proof is a prerequisite. All existing CI routing/budgets, complete39, Graph228 and private-three exclusion remain unchanged; storage census edits require the already identified separate R4 capacity amendment once actual registration is frozen.

## Subsequent standalone refusal correction

A follow-up source review found a concrete early known-refusal control that does
not need runtime/storage enrollment or the new helper. The
[finite recipe](known-body-refusal-recipe-20261105.md) supersedes only the earlier
ordering that deferred this branch until the coupled integration. Root has leased
the precise owner method and existing owner test to Sol after the pure slice.
Actual RED/GREEN and independent review are still required before claiming it
implemented. Image/helper/HOLD execution remains outside this static slice.
