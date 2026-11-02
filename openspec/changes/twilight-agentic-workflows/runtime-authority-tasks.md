# Durable runtime authority history implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Root dispatches one coherent persistence task, independent task review and whole-branch review. Checkboxes record local scope only; final cohesive sender/host acceptance remains separate.

**Goal:** Persist exact authority intents and verified retained acceptance without confusing local ownership with receiver grants.

**Architecture:** Extend existing RunStore with scope history, shared pure planning and memory/SQLite conformance. Reuse WBS canonical requests, complete asynchronous receipt schema and correspondence. Preserve0001; bootstrap complete schema2 with additive0002 and explicit old-format rejection.

**Tech Stack:** Bun, Nx, TypeScript, ArkType, existing SQLite/ArtifactStore and @wbs/contracts.

**Spec:** [runtime authority design](runtime-authority-design.md), [run coordination](specs/twilight/run-coordination/spec.md), [WBS bridge](specs/twilight/wbs-run-bridge/spec.md), [ADR0060](../../../docs/adr/0060-run-store-formats-bootstrap-complete-bundles.md).

## Global Constraints

- Base3fdc85cdcffa41e57936764c8de62a2557cf166b in native de55/feat/agentic-durable-execution. Parent PR660/current host/CI retain that exact head. One source implementer; no main/user checkout changes. Bun/Nx only including scripts, login:false.
- Root owns all Git/index/HEAD, tracked intent/spec/design/tasks/verify/CONTEXT/ADRs, reviews, commits, publication and gates. Worker owns only listed source/tests and its ignored evidence. No staging/commits/branch mutation/subagents. Report exact cause/path before expanding scope.
- Use existing owner/clock/transaction/ArtifactStore mechanisms and complete RuntimeScope. Local owner labels and receiver owner labels may differ; local epoch is not receiver generation. Staging/receipt content grants no dispatch permission, authentic transport, live lease or current receiver authority.
- Authority-only history before any run; no claim/write dispatch, worker/executor launch, CLI, credential/provider/spend/CTT/tenant policy/activation implementation. Keep one pending command per scope and no clear/supersede/TTL API. Bare404/later refusal/timeout cannot settle ambiguity.
- Existing portable records and all0001/WBS SQL/down bytes remain unchanged. New records version1, adapter schema2, additive0002-runtime-authority/down pair. Old format1 rejects incompatible without modification; no implicit upgrade/repair or invented legacy subsystem. Complete named bundle and empty physical schema are pinned.
- Current live owner validation precedes raw target/duplicate lookup; exact duplicates preserve original replies before old revision checks. Complete immutable local provenance survives takeover; old-epoch acceptance cannot refresh a new epoch's grant. Every effective scope event increments its independent revision; no run/attempt/capacity change.
- Verified artifact operations snapshot before awaits, reuse validateSchema/lookupRuntimeReceipt/matchesRuntimeReceipt, and run outside SQLite transactions. Raw persistence/read contracts disclose verified-artifact preconditions. No duplicate public wire decoder/schema or authentication promise.
- Every genuinely new/changed check/dependency needs an observed isolated production-path negative, exact restoration and truthful adjacent Proof. Reused unchanged guards are not blanket recertified. Preserve failed/masked trials, warning/skip and documentary limits. New invocation metadata uses distinct .meta.json names.
- Finish one complete RunStore test suite after final edits/proofs/formatting, with before/after all-tracked source hashes/modes, HEAD, full status and complete staged mode/blob/path identity. Record raw index hashes separately; a cache-byte change is not a semantic staging change. Root holds source/index/HEAD during that window. No full WBS SQLite/Dash/host/browser overlap or repeated broad suite without a named concern.
- No independent PR/host gate for this internal slice. Continue durable preparation/locator/claim/turn/outcome composition in the durable branch; final cohesive release needs its own full review, printed-SHA canonical gate/applicable CI. S0/S7a, governance and activation remain open.

### Task 1: Retain exact authority request and acceptance history

**Create production files:**

- `apps/twilight-structure/twilight-dash/cli/src/runs/runtime-records.ts`: exact design types and provenance/permission JSDoc.
- `apps/twilight-structure/twilight-dash/cli/src/runs/runtime-codecs.ts`: strict boundary snapshots/canonical request and retained-record validation; no caller mutation or unsafe casts.
- `apps/twilight-structure/twilight-dash/cli/src/runs/plan-runtime.ts`: shared pure pin/stage/accept/replay and complete scope-history rules.
- `apps/twilight-structure/twilight-dash/cli/src/runs/runtime-history.ts`: verified acceptRuntimeReceipt/readRuntimeHistory application operations.
- `apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/format.ts`: ordered complete migration registry/version/hash; preserve existing0001 constant values through schema facade.
- `apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/read-runtime.ts`: exact owned rows, marker counts, keys/links and complete history audits.
- `apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/runtime-store.ts`: private row-level writes/counters inside existing provider transactions.
- `apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/migrations/0002-runtime-authority/migration.sql`
- `apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/migrations/0002-runtime-authority/down.sql`

**Modify production/policy:**

- `apps/twilight-structure/twilight-dash/cli/src/runs/run-store.ts`: the four exact methods and trusted-operation JSDoc.
- `apps/twilight-structure/twilight-dash/cli/src/runs/testing/memory-stores.ts`: same planners, explicit runtime maps/counters and deep detached replies.
- `apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/run-store.ts`: four methods, existing owner/clock/queue/transaction integration only.
- `apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/schema.ts`: full bundle/format/physical/runtime audit; reexport old constants unchanged.
- `apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/open-stores.ts`: complete schema2 bootstrap, old-format read-only compatibility inspection before mode changes, coherent current-format validation and existing failure classes/contention.
- `apps/twilight-structure/twilight-dash/eslint.product.mjs`: @wbs/contracts only at the four exact design consumers.
- `tools/tool-devsync/src/eslint-boundaries.test.ts`: effective positive/negative/parser/source-consumption cases for those exact consumers; no peer exception.
- `tools/tool-devsync/src/workspace-projects.test.ts`: only the exact twilight-dash/wbs-contracts ALLOWED_DASH_EDGES fixture and truthful adjacent real-graph evidence; source-file restrictions remain independently pinned by effective ESLint tests.

**Create tests:**

- `apps/twilight-structure/twilight-dash/cli/src/runs/testing/runtime-history-contract.ts`: one semantic suite and narrowly needed authority fixtures shared by real providers.
- `apps/twilight-structure/twilight-dash/cli/src/runs/runtime-history.test.ts`: memory suite plus verified-artifact behavior.
- `apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/runtime-history.db.test.ts`: SQLite suite plus trusted row/catalog/empty-schema/down/old-format integrity.
- `apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/runtime-races.db.test.ts`: actual separate-process staging/acceptance/commit boundaries.

**Additionally permitted existing fixtures only:** `runs/open-stores.test.ts` (all four runtime operations in the complete close fixture, and exact path-specific portable type dependency audit), `runs/sqlite/open-stores.db.test.ts`,
`runs/sqlite/run-store.db.test.ts`, and `runs/testing/fixtures.ts` under the same CLI source.
Correct only precise format-version/physical-catalog expectations or shared fixture
construction made stale by schema2. Do not weaken invariants, assertions or timeouts.
Any additional caller fixture needs exact path/cause before editing. No edit to0001
or any WBS SQL, existing record layouts, authority/activation stores or other products.

**Interfaces:** Implement exactly the design's RuntimePin/Guard/Intent/AcceptanceInput/
Acceptance/Grant/ScopeSnapshot, four RunStore methods and two verified application
functions. Reuse permitsMutation/isCurrentOwner/assertClock/addInteger and existing
provider transaction patterns. No public generic transaction/patch callback. Authority
request owner label stays independent of localOwner provenance. No raw HTTP client.

- [x] 1.1 Read actual callers/tests/schema/ownership and shared HTTP validators before
      behavior edits. Add failing semantic cases in the shared suite, not a second
      memory domain implementation. Test never-pinned scope before any run; immutable
      pin/ledger conflict; strict canonical authority bytes; unsupported claim/write;
      global command collision; exact duplicate after revision advance; one pending
      command; stale/expired/foreign owner before corrupt targets; scope/ledger mismatch;
      no run/attempt/reservation effects; caller mutation and detached replies. Record
      setup/compile failures separately from semantic RED.
- [x] 1.2 Implement memory and SQLite using the same pure rules. Prove current owner A
      stages with a differently named receiver owner, B takes over, B records A's exact
      acceptance as history with grant null, B stages/accepts its own acquisition and
      maps only B's epoch. Replay A's intent/acceptance with old revisions returns the
      original immutable replies and leaves B's grant/current revision unchanged.
      Different evidence, local provenance, canonical bytes or cross-scope identity
      refuses without history mutation. Missing links/gaps/reordered events, wrong
      keys/digests/generation progression and marker-count loss throw before absence.
      Compare current-epoch intent labels with the same admitted OwnershipStatus;
      prove real read/reopen corruption refusal while retaining valid receiver/local
      label differences, expiry and takeover. Older labels have no independent ledger.
- [x] 1.3 Build schema2 from unchanged0001 plus additive0002. Pin complete ordered
      name/forward/down bundle with FORMAT_HASH and required run_format counts. Derive
      full physical schema, including empty new tables. Build a genuine format1 fixture
      from original0001 and first hashes; open must reject before mode changes and leave
      complete bytes/schema/records unchanged. Current format absent/unreadable/malformed,
      changed first/bundle hash and altered empty declarations retain precise failures.
      Both bootstrap and physical reference consume trimmed complete forwardStatements
      fail-fast; intermediate SQL failure leaves no published target or staging.
      Unused new down restores exact original schema/records; any pin/history/counter or
      partial loss refuses under a prevalidated full-format, explicit-transaction,
      fail-fast trimmed-statement caller. Required schema2 run_meta is checked before
      DROP. Whole-script Bun execution is not this contract. Real transaction abort and separate-process before/after
      COMMIT/reopen must prove atomic row/revision/count changes. No power-loss claim.
- [x] 1.4 Implement verified artifact acceptance/read. Snapshot guard/intent/ref before
      awaits, use actual ArtifactStore bytes, strict UTF-8/JSON and complete shared schema,
      then complete shared correspondence with independent SHA256. Reject absence,
      unreadability/corruption, malformed known fields/dependent-order wire bodies and valid
      wrong scope/ledger/command/digest/authority/kind without local acceptance. Verify
      every historical evidence link on reads. Preserve the public response schema
      ignoring added wire fields with a positive real-artifact compatibility case;
      local retained records remain strict. No async validation inside SQLite or new
      authentication/current-authority inference. Keep raw port preconditions explicit.
- [x] 1.5 From restored green, observe isolated faults for each genuinely changed
      safety check/dependency: new owner gate, identity/duplicate comparison, pending
      serialization, scope revision/reconstruction/marker/keys, old-epoch mapping,
      artifact-read/schema/matcher consumption, full-format/empty-schema validation,
      rollback guards and exact public-contract policy. Choose otherwise-valid fixture
      fields and actual mounted persistence/verified operations so duplicate backstops
      do not mask proof. Record actual failure strength, original/mutant/restored hashes,
      raw logs and failed driver trials; restore exactly in finally and add adjacent
      truthful Proof. Do not claim every existing reused predicate newly certified.
- [x] 1.6 Prepare real Nx graph with payload/metadata paths distinct. Run policy files
      module-labels/eslint-boundaries/product-constraints/workspace-projects, relevant
      uncached twilight-dash/tool-devsync typecheck/lint, focused new shared/artifact/
      format/race cases plus existing affected RunStore coverage, exact changed-file
      formatting/diff/RunStore migration lint and scoped normal OpenSpec. Finally run
      all tests under CLI src/runs exactly once with the agreed immutable source/HEAD/
      status/staged-tree window. No broad package/gate/browser repetition. Report all
      argv/exits/counts/durations/failures/warnings/skips and protected/final hashes;
      self-review and explicitly release source hold. Root owns commits/reviews and
      later cohesive publication/gate/CI; no local acceptance box implies S0/S7a done.

**Exact validation commands:** Run `bun test` with cwd `apps/twilight-structure/twilight-dash/cli/src/runs` for the complete source RunStore suite and preserve the explicit source-file inventory. The original root bare-path pattern also collected compiled `dist` tests after required typecheck; retain its failed invocation separately. A corrected final run is authorized only after the named fixture and discovery failures are repaired. Do not move or delete build outputs to hide them. Run the new migration pair through `bun run tools/tool-git-hooks/src/hooks/migration-lint.ts apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/migrations/0002-runtime-authority/migration.sql apps/twilight-structure/twilight-dash/cli/src/runs/sqlite/migrations/0002-runtime-authority/down.sql`. Inspect actual Nx project targets before selecting relevant uncached typecheck/lint commands; preserve full graph payload and separate invocation metadata.

**Report:** `.superpowers/sdd/runtime-authority-tasks/task-1-report.md`, evidence
`task-1-evidence/` with distinct `.meta.json` invocation metadata. No worker commits,
Git/index/HEAD/branch mutations, subagents or tracked metadata edits. Return DONE or
concerns with compact checks and explicit source-hold release. Root freezes source/
index/HEAD during each fault and final suite window. Current PR660 remains immutable.
