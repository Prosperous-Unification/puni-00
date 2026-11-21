Every refusal and omission ships with a production-path negative watched red with the
check removed, then an adjacent `Proof:` comment (R5). Runs after `wbs-work-packages`
slices 1–3a (#723) and the set membership of #724, and replaces `wbs-work-packages` slice
3b. The 2026-11-09 instruction to implement the complete entity scope authorizes
continuing the settled catalogue design; fingerprinted merge rules and activation receipts
remain concrete operator inputs, never inferred from implementation authorization.

## 0. Decisions

- [x] 0.1 Q1–Q5 settled 2026-10-25 (Q1a, Q4, Q5 by Dany; Q1b, Q2, Q3 and SC11, SC12, SC14 by
      adopting the recommendations, Dany, 2026-10-25: "go with your best assumptions"). SC1–SC24 stand, overrulable by id.

## 1. Catalogue, bindings, resolution, migration

- [ ] 1.1 `step-catalogue-cli.ts report` and `apply --merge-rules=<file>` (SC23) and
      migration `add_step_migration_report` — test: `step-catalogue-report.db.test.ts` on a
      dev-shaped fixture: one row per `shared_code_identical`, `shared_code`, `uncoded`,
      `name_clash`,
      `divergent_project_set`, `type_conflict_leaf`, `foreign_package_fact`, and no other
      table changed; `apply` refuses a missing, unreadable, malformed and stale file, each
      separately; negatives: drop the fingerprint comparison and a stale file applies; drop
      the uncoded confirmation and a derived code lands silently; make one field (the
      allowance) of an identical pair differ and the automatic merge stops and reports
      `shared_code`; watched.
- [ ] 1.2 Migration `add_step_catalogue` (SC11, SC12, SC14, SC15) under the E14 window with
      its lint waiver — test: `step-catalogue-migration.db.test.ts`: every unmerged step keeps
      its id and every fact answers unchanged; journal, saved-plan, `plan_event` and cache
      bytes are byte-identical; a ruled merge re-points all fifteen current columns (one fixture
      fact per column, including both external-dependency endpoints) and keeps each package's unit, allowance and `allowance_revision`;
      the six recreated triggers refuse a step without a row for the work item's package;
      `down.sql` reverses an unmerged database and refuses after a merge or an authored
      binding; negatives: drop one re-point (`step_parallel`) and the orphan guard
      refuses naming it; drop the divergent-set refusal and W1 silently gains `qa`; a rules file carrying an
      unknown `projects` key is refused as malformed; drop a
      recreated trigger and a cross-package claim inserts; watched.
- [ ] 1.3 History readers (SC13): saved-plan input and schedule, journal payload, inverse
      and preconditions (`step:<id>`, `estimateUnits`, `moveProgress`), `plan_event`,
      `optimized_schedule_cache`, `event_log` replay — test: production readers on a merged
      fixture, plus a tampered body that still fails its hash; negatives: drop translation
      and the saved plan read throws naming the loser; write translated bytes back and the
      byte-identity assertion fails; a live write naming the loser is `404`; watched.
- [x] 1.4 `@wbs/domain` `resolveSteps(chain, typeState, bindings)` (SC2, SC3, SC18, SC19)
      — test: property over random chains and bindings (union, dedupe, every-type reaches
      every type, typed only its type, conflict resolves nothing, order total and stable
      under input permutation); negatives: drop the type predicate and a `story` step
      resolves for a `spike`; drop the binding-id tiebreak and a permutation reorders;
      watched.
- [ ] 1.5 `StepCatalogue` port, `step_binding` with `type_key` uniqueness and the
      same-organization trigger, `work_package_step` rows of SC21 on both stores through
      conformance — test: an empty package gets the union rows; a binding add, a package
      move and a space change add rows; unbinding keeps them; a missing row throws
      `WorkPackageStepMissing`; negatives: drop `type_key` from the index and a mounted
      duplicate every-type write succeeds; skip the write on move and the read throws;
      watched.
- [ ] 1.5.1 Current creation response cutover: first regress actual Memory/SQLite Source services with empty and authored catalogues, then a real post-publication catalogue edit. Add required same-owner `createWithSteps` without a legacy step seed; capture the prepared Memory state or current SQLite transaction before success, and remove generated Dev/QA from current direct/combined service preparation. Verify combined project birth returns actual inherited organization steps. Preserve retained input, public/ordinary/repair lifetimes, exact refusal/rollback and creator grant/audit behavior; explicit legacy table fixtures cannot synthesize current catalogue authority. Observe independent response-order/coherence, absence, queue and lifetime negatives; run relevant checks and Astra review before closing.

      Current creation services and combined SQLite project birth now return the actual same-owner inherited catalogue snapshot, including an explicit empty catalogue. Generated Dev/QA identities are removed. The required port, actual ordinary/repair loan fences, retained queue input and rollback behavior have local evidence in [the birth record](verification-current-birth-20261119.json). Keep this task open for remaining product/API verification and unavailable Astra review.

- [x] 1.5.2 Memory Source reference closure: restore the existing capacity/priority port contract using actual package/team tables at the same public-coordinator or borrowed writer owner. First regress missing references including null clears, an actual engagement-project address, public/borrowed writes and team deletion before queued admission. Preserve standalone map fixtures. Remove the two census exclusions only after actual assertions pass; run full current Source certification, scoped regressions and independent guard omissions. Optional port declarations are reconciled separately; this does not close full Source/fact/access/lifetime behavior.

- [x] 1.5.3 Memory Source space declaration: first fail an offered/executed assertion against the stale absent declaration. Register the existing actual Source space store with actual organization setup, run its shared create/find/foreign-scope/remove round trip and complete census. Preserve exact remaining absent-family declarations and verify the real foreign-scope check can fail. This registration does not certify full space settings, membership, permissions or lifecycle behavior.

- [x] 1.5.4 Restore the intended current Memory safety test boundaries: real organization/project/catalogue/package setup, explicit successful writes, fixture-only stored-column corruption and settled targeted-read assertions. Retain both standalone legacy cascade tests; add actual current parallelism preview/apply and retirement protection. Exercise complete queued current birth inputs and the real final subtree stage. Watch independent dependency faults and run the complete source-only adapter inventory. This closes these fixture regressions, not full Source authority/epoch/lifetime, optional ports or genuine historical producers.

[Current Memory safety contract evidence](verification-current-memory-contracts-20261121.json)
records all nine prior adapter failures resolved. The complete 49-file source inventory now
passes 763 tests with 23,040 assertions; 14 independently observed faults restore exactly.
The native compiler covers 294 entries and seven changed files pass lint. The prior core
run remains 2,118 pass and 13 fail; all 15 genuine historical scenarios remain open.

[Memory references and space census evidence](verification-memory-references-20261121.json)
records actual public/borrowed reference checks, null clears, engagement-project rejection
and team removal before queued admission. Standalone Map fixtures remain unchanged.
The existing real space port now executes its shared round trip. Four independent guard
omissions fail and restore. Current Memory certification has 221 offered cases, zero
exclusions and three actually absent optional ports observed on public/ordinary/repair
owners. The 221 cases are not all Source functionality: the current selected four-file
cohort passes 220 native tests, while the complete 48-source-file adapter run has 715 pass
and 40 failures also observed against actual V89 source blobs. The first broad directory
selector additionally collected 38 compiled-output module errors; corrected explicit source
inventory supersedes that diagnostic. Core remains 2118 pass/13 fail with matched names
and primary diagnostics. Full adapter/import/historical work, all fifteen genuine old
producer guarantees, remaining Source owners and the entire PUNI/Bun scope stay open.

- [ ] 1.6 SC17 invariant in every applicability-changing path and fact writer — test: one
      case per protected fact (thirteen tables, both dependency endpoint directions) against an unbind, plus retype, type deletion, leaf
      and package move, space change and deletion, undo/restore, copy and leaf-to-parent,
      and two concurrent writers (one admits a fact, one unbinds) of which exactly one wins;
      the refusal's `pairs` and `count` on a 201-pair fixture (200 listed); `dryRun: true`
      on each applicability-changing write answering the list from a rolled-back
      transaction; negatives: drop the attempt-issued clause and a counter-only node
      vanishes; drop the check from `setStepBlocked` and a blockage lands on an unresolved
      pair; drop the dry-run rollback and a retype persists after a preview; drop the
      `pairs` query and the refusal lists nothing with `count: 1`; watched.

- [ ] 1.6.1 Current claim observations carry required per-leaf resolved order from the same actual Source observation. First test both actual adapters with two types whose bindings order the same definitions oppositely, nullable subtree claims, zero-step leaves and missing/corrupt metadata. Migrate existing claim-display fixtures to actual catalogue authoring. Implement synchronous metadata capture and core sorting without a package-union fallback; preserve access rechecks, snapshots, public payloads and stored claims. Observe separate order/fact/absence/lifetime negatives, run relevant products and Astra review before closure.

      Current readers, core ordering, actual fixtures and Source/ordinary/repair lifetimes are implemented with local evidence in [the claim record](verification-current-claims-20261119.json). The actual full SQLite certificate also passes its bounded healthy measurement; its normal budget follows [the measured policy](../../../docs/test-budgets.md#sqlite-source-certificate-2026-11-19). Keep this task open for full product/API verification and unavailable Astra review. The organization-limits controller now authors current catalogue steps and scoped package births through an actual Source; [its HTTP record](verification-current-organization-http-20261119.json) covers this selected suite, not every organization/controller fixture. Other HTTP fixtures still write legacy step storage. The separate creation-response defect recorded there is repaired by task1.5.1, with its own birth evidence.

- [ ] 1.6.2 Historical parent-progress integration audit: establish a genuine pre-catalogue producer or admitted persisted-state owner and its report/apply acceptance before choosing a repair. Current ordinary point ports remain leaf-only (SC17); accepted history must retain its actual bytes through an explicit historical read/restore owner (SC13), without a fixture-only port override or newly legal current parent writes. The original three work-item and four command-runner parent arrangements now have genuine predecessor owners or the explicit live-parent migration refusal; current tests no longer manufacture their history through an invalid parent-point write. Preserve all seven named guarantees and distinguish early revision refusal from independent late snapshot/prelude protection. Also audit the now-unreachable first-child hand-down branch in the non-first-child service constructor: its dated old fault proofs are not current atomic-writer proofs. The replacement current writer propagation/applicability scenarios pass, but do not certify those old guards. Record the actual producer/reader and negative proofs before closing.

- [ ] 1.6.2a Genuine parent-progress producer/admission: retain all original7scenarios (3work-item,4command-runner); execute an immutable actual pre-catalogue producer and its real report/apply acceptance or precise refusal before choosing current history read/restore policy. Current leaf-only writers remain unchanged.
- [ ] 1.6.2b Genuine legacy move-journal producer/admission: the actual application cutover exposes6more command scenarios whose setup moves under retained destination progress/blockage. Produce their original frozen journal/input bytes through the actual older producer, preserve state/time/missing snapshot drift, preceding hand-up rollback and rename/progress laundering guards, then test accepted replay on the current actual writer. Current SC17 success is not a valid producer for these histories; do not fake their rows or add a current point-write exception.
- [x] 1.6.2b.1 Genuine Memory laundering owner: capture both actual old Memory arrangements with account, scoped package/step metadata and original stored events as well as facts/journals. Decode pinned archives once, author and verify actual current catalogue/package/leaf facts, then restore only the genuine journal/event rows through the existing Source fixture's serialized owner. First observe the missing fixture capability; implement retained input, current package/scope checks, empty-history protection, staged publication and closure. Regress actual current move undo, peer progress, preceding rename/progress undo/redo and stale move redo; preserve original body values and recorded events. Watch each new guard/dependency fail and run actual complete Memory/core cohorts. This fixture operation grants no current parent-point authority and is not SQLite migration admission or a general runtime checkpoint API.

  [Current Memory history evidence](verification-genuine-memory-history-20261121.json) records a new actual predecessor capture with real scoped metadata, coded steps and stored events; original bare-project V3 captures remain unchanged. Both current laundering sequences and original final runner/borrowed checkpoints refuse stale progress while preserving facts/events. Thirty fixture/replay controls and nineteen independent faults cover current target/scope/account, existing history, identity/sequence, queued ownership, closure, late rollback, archive/codec and cross-package ID dependencies. Full core now2124/0/171files and complete Memory793/0/50files; native compiler300, lint4 and6088-file audit pass. Parent1.6.2a-c remain open: this does not certify generic uncoded migration, independent late/prelude SQL guards, all historical translation/Source matrices, full products or unavailable Astra review.

- [ ] 1.6.2c Historical exact restore variants: retain admitted historical equivalents of both old standalone move progress-restore cases (with/without destination blockage, including exact timestamps). Their current counterparts now correctly test SC17 refusal with unchanged incoming/destination facts. These2historical variants remain required alongside7parent-progress and6legacy-command variants:15named scenarios total, without rewriting frozen source/history bytes or asserting report acceptance from a hand-built fixture.

  Current genuine move progress: [two admitted predecessor variants](verification-genuine-move-history-20261121.json) archive the actual old SQLite database, producer capture and successful old replay control for each variant. Ordinary110→116, real report/backup/private117 and118/119 retain the complete ledger and original journal/event strings, allowing only the structural package header rename. Both current runner and borrowed owners support undo/redo/undo: moving progress retains11, destination statements use the replay clock1000/1002 under the existing state-only recipe, and blockage times remain exact. Six state/time/missing native drift controls refuse before redo clears facts, preserve persistence and succeed after exact fault restoration. Combined18/0/361, native compiler and lint pass; six independent dependency/guard faults fail and restore. This resolves the timestamp interpretation for these two variants, not all15 guarantees, the13 unchanged core failures, complete Source ownership or unavailable Astra review. Keep1.6.2a-c open.

  Current genuine replay cutover: [nine additional predecessor profiles](verification-genuine-replay-cutover-20261121.json) add eighteen actual runner/borrowed cases after normal migration, report, backup and private catalogue apply. They preserve current facts and immutable history, check exact stale/protected-parent outcomes, and verify the runner's stale-entry repair separately from borrowed rollback. Seven obsolete command setups move to these actual histories; three work-item cases now test lawful current behavior beside their genuine predecessor owners. Current hand-up uses an actually empty destination, and batch rollback must fail at command1. The full171-file core improves from2118/13 to2122/2; only the original two Memory laundering setups remain failing. Final historical cohort36/0/811, native compiler298, lint4 and6086-file source audit pass. Two archive faults fail independently; omitting revisions changes the precise stale diagnostic but later safeguards still refuse. Keep all15 guarantees open as an aggregate: actual Memory laundering admission/replay, independent late snapshot/prelude proofs, full product/Source and Astra review remain required.

  Genuine producer progress: [legacy producer/admission evidence](verification-legacy-parent-admission-20261120.json) records an isolated immutable old checkout, actual SQLite Source journals for all 15 arrangements, 13 completed old SQLite replay checkpoints and two precise prior-command undo refusals. Separate actual old Memory producers reach both remaining laundering checkpoints and retain their genuine journal values. Before repair, all 15 SQLite databases passed actual report/apply with catalogue journal JSON unchanged; current probes returned eight revision-stale refusals, two successful restores, one protected-point refusal and two throws; the two incomplete SQLite checkpoints were not replayed. These are bounded observations, not closure of the original guarantees. Actual old state-only progress recipes omit the original timestamp. Report/rules/apply now refuse unsupported live parent points without changing persistence, preserving allocator/null-claim exceptions and tree-refusal precedence. Four new tests and the full 123-test report/apply cohort pass; three independent fault removals fail and restore exactly. Historical read/restore policy, original seven failing integration setups, exact timestamp semantics and requested Astra review remain open.

  Historical deletion runtime progress: [genuine deletion undo](verification-historical-parent-undo-20261120.json) replaces the ordinary parent-point write in an old restore recipe with an early modeled stale refusal. Actual old parent-progress and lawful leaf-only SQLite producers are admitted through the real migration/report/apply path. Runner and borrowed controls check refusal before native restore writes, full rollback/stale-entry repair and unchanged immutable history; the lawful old recipe replays undo/redo/undo with exact recorded time. Missing required current values still throws and retains the journal. Three independent production faults remove the guard, move it after insertion or refuse empty snapshots; their intended oracles fail and restore exactly. Selected 16 tests pass; a fresh 168-file core run remains 2060 pass/31 fail with the same failure identities. This resolves one thrown legacy runtime path, not all 15 original historical guarantees or the original seven fixtures; no parent task is closed pending historical read/projection work and requested review.

- [ ] 1.6.3 Actual move-to-parent applicability: real catalogue fixtures expose four sparse-policy integration cases where moving another row under an estimated leaf strands its estimate on a parent and the current full reader throws. Establish the exact SC17 destination policy for all13 protected families on the actual Memory/SQLite move writer before mutation, including independent source/loan ownership, concurrent admission, current refusal count/pairs and preview, rollback, undo/redo and unchanged publication. The moved row is existing other work; do not infer fresh-child transfer authority or silently clear/merge destination values. Ordinary current readers remain leaf-only. Preserve the four failing arrangements until replaced by actual writer-level refusal/positive coverage, and obtain Astra review before closure.

- [ ] 1.6.3a Shared move topology comparison: first exercise loss of each actual node fact kind, explicit allocator reservation retention, descendant endpoints, own direct types, unrelated facts, exact count/order/cap, unchanged input and malformed prechange trees. Add a pure projectMoveStepUsage using the complete before snapshot and the proposed within-package parent change; reuse the established protected-pair validation/order instead of a second fact registry or early cap. Component tests do not certify actual Source writers; observe independent finite faults and retain all existing projector tests.
- [ ] 1.6.3b Actual atomic move writers: first make both actual Sources refuse an estimated destination leaf before any statement/progress/blockage/demand clear, renumbering or publication. Deepen the store-owned transition to capture all13families and candidate topology on its actual writer, then apply the lawful nonpoint structural work together. Return an explicit typed outcome through public/ordinary/repair lifetimes. A guard only on today's final WorkItemStore.move is insufficient: current service clears facts before reaching it. Preserve other work in a loan that catches a refusal; no service preview or fresh-child transfer capability substitutes for this writer boundary.
      Partial actual-writer evidence: [current owned move](verification-current-owned-move-20261119.json) adds required SubtreeStore.writeMove with real Memory clone/publication and SQLite local savepoint ownership. Actual move38cases plus4retained first-child cases pass42/0/1171, selected catalogue/usage190/0/7351; nine actual operation faults fail their intended oracles and restore exactly. Public/ordinary/repair expiry, queue retention, late failure and outer rollback have selected coverage. The retained-plan wrapper compiles and refreshes only written outcomes, but is not yet exercised through an application move. Existing raw workItems.move remains a bypass; application/replay/preview are not cut over. Candidate endpoint invalidity currently throws before mutation. All13 isolation, complete scalar/owner/lifetime/cleanup negatives and requested review remain open; do not close1.6.3b from these selected cases.

- [ ] 1.6.3c Service, retained-plan, command and replay cutover: route ordinary moves, undo/redo and dryRun through that same actual transition; propagate precise current refusal pairs/count and refresh only successful writes. Preserve caller authority, missing/auth/cycle precedence, existing incident receipts and exact rollback/no-journal/no-fanout. Replace the four old estimated-destination success arrangements only with actual SC17 refusal plus separately lawful empty-destination positive cases; do not clear their estimates just to hide a missing writer guard.
      Partial application evidence: [current service/replay](verification-current-move-service-20261120.json) routes ordinary and compensating moves through the actual owned transition. Current forward recipes have no independent destination clears; inverse nonpoint values come from the writer; both prior watched identities and current touched identities survive replay. A late live protected conflict retains its journal and precise undo/redo count/pairs. Native selected148/0/2057 and focused7/0/38 have4overlapping cases; full core2060/31/9448 across2091tests168source files remains failed. Four sparse move failures are replaced by protected/refused and separately seeded lawful empty variants. Six current-policy/old-hook exposures are fixed;6old command producer cases remain, with original historical scope preserved under1.6.2a-c. Preview/raw Source retirement/all13/full scoped authority/compound rollback/review remain incomplete; keep this task open.

- [ ] 1.6.3d Complete move integration: all13families on both actual adapters, both relationship endpoint directions, nullable claim/allocator boundaries, scalar/owner corruption, separate callers racing fact/config admission, closed and suspended source/ordinary/repair operations, retained public queue input and savepoint rollback failure. Observe each changed guard's production-path negative, restore exactly, run relevant type/lint/format/product checks and requested Astra review before closing parent1.6.3.

- [ ] 1.6.4 Current command admission must distinguish owned unresolved/type-conflict leaves from absent/foreign identities after real configuration edits. Regress pair and encoded-node forms, lawful resolved writes and parent clears, and atomic rollback of earlier commands. Use the actual Source target and retained package values; each new dispatch/refusal guard needs an independent negative. All 15 pair/node point kinds plus leaf assignSubtree now share structural current-target dispatch; package allowance remains package-scoped and parent aggregation is preserved. [Current evidence](verification-all-point-command-admission-20261120.json) records 170 API/MCP tests, a final 103-case after-control, four runtime faults and a typed complete fixture omission. Keep this slice open for direct service/native writer closure, aggregate mixed-type and other caller/replay paths, full all-family proofs and unavailable Astra review; no full SC17 closure is inferred.

- [ ] 1.7a SC25 retirement tests first: actual current Source in both adapters defines one
      organization step, materializes two packages, authors distinct units/allowances and
      revisions, safely unbinds and retires. Observe active catalogue absence while the
      original definition and every explicit package row remain exact; bound, foreign,
      repeated, reserved code/name and attempted rebind outcomes preserve state. An actual
      borrowed UoW rollback restores retirement and catalogue visibility together. A missing
      required operation is scaffolding RED only; later assertions require independent observation.
- [ ] 1.7b SC25 historical survivor owner first: load the genuinely migrated merged117
      artifact with pinned database/logical state and full ledger, apply only required later
      migrations, remove its live protected claim through the actual Source and safely unbind.
      Retire the survivor through the required current port; retain its physical definition,
      aliases, unused package rows and immutable runtime/resource history. Observe the real
      historical identity reader before/after. Saved-plan input/schedule hash and translated
      body coverage additionally requires an actual saved-plan producer/reader owner; the
      resource fixture alone does not establish it.
- [ ] 1.7c Required additive retirement relation with paired down migration, actual current
      Source implementation and active/historical read split. Same-writer zero-binding
      admission, definition ownership, binding INSERT/UPDATE guards and atomic Memory staging
      or SQL savepoint preserve original identities; no missing-relation/default fallback.
      Empty forward/down restores the complete name/hash ledger; nonempty down refuses named
      retirements rather than silently reactivating. Qualify blue/green and runtime capability
      behavior before permitting mixed-version deployment.
- [ ] 1.7d Current lifetime/queue and concurrency owners: retained payloads, Source closure,
      ordinary/repair loan expiry, binding-versus-retirement serialization, a late native fault,
      and a caught borrowed refusal followed by independent outer COMMIT. Each new or changed
      guard needs its own production-path negative and observed finite omission; add adjacent
      Proof comments only after exact restore and healthy after-control. Corrupt retirement
      ownership/orphans/scalars and bindings to retired identities must throw, not disappear.
- [ ] 1.7e SC25 import/replay tests first: a retired reserved code answers named
      `retired_step_codes` even with `defineMissing`; current journal restore/write cannot
      reactivate a retired identity and uses its existing modeled stale/applicability refusal.
      Frozen history is translated only in the reader and original bodies/hashes/signatures
      remain exact. Preserve unknown-code and active-code behavior with actual sibling controls.
- [ ] 1.7f Complete SC20/SC25 mounted definition retirement and active catalogue listing,
      API/MCP generated surfaces and organization/space/project settings UI; explain retained
      code/name reservation and render modeled conflicts. Keep task2.1, task2.2 and task4.1
      open until their full binding/reorder/preview/import/client scope and final gate are verified.

## 2. Routes, commands, documents

- [ ] 2.1 `@wbs/contracts` shapes and be-01 routes of design.md "Routes" with SC20
      authorization at the scope id; removal of `postApiProjectsByIdSteps`,
      `patchApiProjectsByIdStepsByStepId`, `deleteApiProjectsByIdStepsByStepId` and their
      mcp-01 tools (README count asserted, SC24) — test: route tests per refusal,
      `defineAndBindStep` atomicity, cross-organization and sibling-project negatives,
      `reorder` with a stale list, `step-nodes-in-use` pairs; `contracts-boot-memory.test.ts`
      under 500 MB; negative: check the permission at the organization instead of the project
      id and the sibling manager binds; watched.
      Current mounted entity integration: [verification](verification-mounted-entity-api-20261121.json) records the ten-file baseline, real catalogue migration as the default for fresh organization and booted-browser fixtures, retained custom migration boundaries, combined creation with empty and authored catalogues, and timezone persistence in scoped settings under an actual parent project. The last broad cohort still has obsolete creation/space/export arrangements; this does not close route, Source, historical, browser, CLI or review requirements.
      [Current organization and space evidence](verification-current-organization-space-20261121.json) migrates all19 organization-isolation and13 space cases to real parent/project membership and configured catalogue steps, preserves legitimate creation audits and native retry rollback, and observes destructive-detach and missing-refresh faults on actual runtime owners. Final affected cohort32/0; actual ten-file cohort176/5 retains every failing Memory HTTP creation/export case, including the uncoded-history safety investigation. These space cases cover project membership and flattened package reads; actual people/team membership endpoints and project-folded UI remain separate requirements.
      [Current Memory HTTP evidence](verification-current-memory-http-20261121.json) repairs four catalogue/projection arrangements and adds configured direct creation/read coverage, improving that file51/5 to56/1. The uncoded HTTP guarantee remains failing in its unsupported current birth arrangement; the actual unchanged predecessor HTTP case and both current serializer guard cases pass, and omitting the current guard fails both before exact restoration. This is separate historical/serializer evidence, not a completed current historical observation owner. Current document step-node spelling still uses the package union; document17/18 and full per-leaf portability remain required.
- [ ] 2.2 Tree and work package reads carry resolved steps with every matching binding
      (SC9); plan document +1 and saved-plan input +1 with converters; import
      reconciliation (SC24) — tests: `plan-document-shapes.test.ts`,
      `canonical-plan-input.test.ts`, `plan-reference.test.ts`, a document round trip, an
      import with an existing, an unbound and an unknown code; negatives: drop the converter
      and the previous fixture fails `unsupported_version`; drop the unknown-code refusal
      and a definition appears without `defineMissing`; watched.
      Current local address evidence: [leaf references and revisions](verification-current-leaf-addresses-20261120.json) wires tree step nodes and local reference resolution to the actual leaf inventory, including empty/conflicting leaves, opposite orders, leaf-count padding and direct type changes that preserve the package union. Current local callers require every leaf list and use ar2; explicit uniform construction preserves legacy ar1 descriptions. Fourteen faults and the current API/MCP cohort have bounded evidence. Qualified address search now has [current capture and reference evidence](verification-current-qualified-addresses-20261120.json), including actual per-leaf capture inside its read-only admission transaction, matching descendant selectors, own ordinals/count, stale tokens/cursors and bounded header discovery. Keep the parent task open: the older qualified HTTP fixture still needs migration; [current leaf-label evidence](verification-current-leaf-labels-20261120.json) records future attempt-history labels and the detached connected projector using own leaf order/count, with recorded event rows preserved. Activation-backed connected HTTP label evidence is still required because the actual current fixture rejects external edge insertion as `external_dependencies_inactive`; full owner capture, scheduler/readings/resources/UI, document/input versions, import and historical guarantees remain required. The older 109-case HTTP fixture still refuses package birth through a raw owner; exact prior address/resource production bytes reproduce the same failures, so its migration and guarantees are retained.
      Partial current tree evidence: [leaf metadata and Source controls](verification-current-step-tree-20261120.json) records a separate tree-row purpose over actual Memory maps and SQLite transactions, consumed by isolated reads and captured live metadata. Current leaves carry explicit resolved steps and all matching provenance; untyped zero-step and retained conflicting leaves carry empty lists, with original type IDs retained. Ordinary stored-row/history reads keep their prior shape. Actual mounted isolated/shared controls, owner expiry, explicit-value corruption and a second-connection epoch race have bounded evidence and sixteen independent fault failures. Keep 2.2 open: whole-tree fact/access capture, connected/current Source certification, per-leaf addresses/readings/resources/slices, document/input versions and converters, import reconciliation, full UI and unavailable Astra review remain required. This metadata projection does not make the package-union scheduler leaf-aware.
      Saved-reader progress: [input13 codec and integration evidence](verification-input13-20261120.json) records required target/member own inventories, strict root-version dispatch, six serialized point collections, local/connected schedule membership, selector/graph completeness and comparison/step-identity projection. Current local/connected writers select13 and live/captured/shared/connected preparation uses required own inventories. Actual Memory/SQLite local save/read/current comparison and live preparation preserve distinct sets, opposite orders and an empty leaf. Keep 2.2 and 3.1 open: actual proposed-edit cycle capture remains unfinished; current execution progress is recorded below; document17/18, historical replay/converters, import reconciliation, activated connected integration, full settings/UI, Source/fact/history matrices and Astra review remain required. A constructed codec fixture is not a genuine predecessor or Source certificate.
      [Current writer13 evidence](verification-current-writer13-20261120.json) records actual local Source save/read/current comparison and live/captured preparation, explicit original/current comparison meaning, ten separately qualified faults and final compiler/API/core checks. It does not close activated connected HTTP, complete Source ownership, cycle/readings/resources, document/import or historical guarantees.

- [ ] 2.3 Step manifest route and `twib validate workflow-binding --manifest <file>`
      (SC22), coordinated with #601's task — test: every type and code pair and the default
      mapping validate offline; another revision refuses; negative: skip the per-type check
      and `story.research` passes; watched.

- [ ] 2.3.1 Make actual organization type-set changes invalidate every affected project manifest revision atomically, including empty projects. Test real directory create/remove, idempotence, refusal, rollback and foreign-project exclusion. Preserve explicit package values and existing scoped permissions. Required before claiming the SC22 producer complete.

- [ ] 2.3.2 Add strict version2 offline binding/manifest decoding, per-type and whole-default validation with project/revision identity, zero-step support and canonical schema2 acceptance. Retain exact version1 behavior and digest compatibility. Tests first; each changed guard needs a bounded omission.
- [ ] 2.3.3 Wire actual offline `--manifest` file handling into Burokrat and final PUNI aliases/help, retaining `--steps` compatibility, strict grammar-before-IO, existing YAML/prompt boundaries and named manifest file failures. Test actual commands without network.
- [ ] 2.3.4 Complete schema2 descriptor reconstruction/digest integrity and real legacy acceptance/RunStore compatibility checks; run compiler/format/relevant products and Astra review before closing parent2.3.

- [ ] 2.2.1 SC24 catalogue reconciliation: first regress actual Memory/SQLite imports
      for reused, unresolved, unknown, typed-only, retired and name-conflicting codes,
      actual independent package values, complete source rollback and empty imports.
      Implement same-writer active catalogue/default-manifest capture, code mapping,
      append-only any-type project bindings and explicit defineMissing. Preserve
      inherited definitions/defaults, other package values and complete outer rollback.
- [ ] 2.2.2 SC24 actual import graph: first distinguish own-order cycles and false
      uniform cycles on actual imports, including legacy-only relationships. Make
      preparation interpretation explicit; defer current binding-dependent cycles
      and reserved-code birth to the real catalogue owner. Insert actual direct
      types with rows and validate the resulting own graph before commit. Retain
      archived descriptors and all current endpoint/foreign-owner protections.
- [ ] 2.2.3 SC24 authority and client surface: add optional defineMissing and named
      unknown_step_codes to the closed HTTP/MCP contracts. Test real project settings
      permission, omission, malformed flags, foreign/sibling scope, queued revocation,
      after-read loan expiry, final rollback and buffered catalogue refreshes. Preserve
      exact caller evidence and dormant external behavior; generate OpenAPI and run
      relevant clients, R5 omissions and full required gates before closing2.2.

- [ ] 2.2.4 Browser import choice: first regress explicit request forwarding, default false, both entry points, captured opt-in, busy/no-project disablement, settlement and owner-change resets, and ordered unknown/retired/settings-permission messages. Then implement without changing authority or automatic retries; preserve existing lifecycle tests and run DOM/API/compiler/lint/format plus watched safety faults. Browser/host gates remain required.

- [x] 2.2.5 Register readRetiredCodes in the authoritative shared Source census: actual own/foreign/absent owners, active exclusion, sorted detached and retained arrays, reader purity, writer/public snapshot separation, commit/refusal/throw rollback, ordinary/repair expiry and Source close. Exercise actual Memory and SQLite, watch read/loan faults, and rerun complete certification before expanding its current count.

- [ ] 2.2.6 Current shared import Source contracts: first expose successful-import preconditions and preserve omitted/false definition refusal in the real generic harness. Add explicit consent only at creation scenarios. Observe actual createWithSteps/late writer ownership; keep one real service clock across repeated imports where required. Replace obsolete package-local identity/order assumptions with actual catalogue/global-identity and own-project order assertions, retaining exact portable facts and full rollback/publication checks. Exercise actual Memory and SQLite through genuine catalogue migrations and obtain required review before closing the import parent.

[Shared import Source evidence](verification-shared-import-source-20261121.json) now records
all43 shared import cases passing on each actual adapter, explicit creation consent,
global definition reuse, current binding order and complete rollback/publication assertions.
The real Memory commit now publishes directory ownership, and its export captures resolved
leaf metadata. Both changes have observed failing predecessors. Actual SQLite setup uses
report/backup/private117 apply and ordinary118/119 migrations. Held-stage omission faults
fail promptly and restore. The final selected Memory run is265/0; the complete49-file
Memory adapter improves from715/40 to750/9. The full core remains2118/13 with the same
failure names. This is current Source contract progress, not closure of2.2.6 or its import
parent: remaining actual authority/queue/epoch/fact matrices, historical guarantees,
requested review and full gates are still required.

SC24 progress: [actual import and retirement evidence](verification-catalogue-import-20261121.json)
records current code reuse, project binding/definition admission, independent package values,
own-order graph checks, rank compaction and complete late-failure rollback. The last full
core run remains 2118 pass and thirteen historical failures; it was not repeated in the
browser slice.

[Browser choice and Source census evidence](verification-catalogue-browser-20261121.json)
adds one-attempt definition consent in both import entry points, explicit browser/catalog
request forwarding, ordered unknown/retired-code messages and accurate settings-permission
guidance. All seven selected Vitest suites pass 383 tests; twelve selected faults fail and
restore. The new retirement read now has two actual shared registrations, with ordinary,
repair and Source-close coverage. 165 catalogue/manifest tests pass. The full Memory Source
file passes 114 tests and 218 offered cases, retaining two exclusions and four absent families.
SQLite's exact terminal certificate passes all 224 declared cases without declared gaps.
This closes bounded 2.2.5, not full Source closure. The initial ENOSPC attempts and corrected
RAM-filesystem reruns are retained; the successful certificate is not the full SQLite file.
Browser/host gates, actual remaining permission/queue/epoch/fact matrices, all fifteen
genuine historical guarantees and unavailable Astra review remain. Keep 2.2.1–2.2.4 and
their parent tasks open.

## 3. Scheduler

- [ ] 3.1 Per-leaf slices, zero-step boundary and descendant-step over matching
      descendants (SC16) in `slicesOf` and `slice-edges.ts` — tests: the spec's mixed
      subtree and no-match scenarios, a cycle through per-leaf graphs, a saved plan
      scheduled through SC13, Fast and solver agreement on the mixed fixture; negatives:
      keep the package-wide order and the spike leaf gains a `qa` slice; drop the boundary
      slice and a whole dependency on a zero-step leaf has no endpoint; watched.

  Kernel progress adds explicit per-leaf/uniform slicing, matching descendant expansion
  and held reduction over original matching leaves. Contract20 excludes18/19 cache
  evidence; existing Fast/quantum corpus values stay intact beside the mixed fixture.
  Current live/captured/shared/connected preparation and saved-store writers use own
  inventories/input13. Actual CP-SAT and complete Source ownership remain required.

  [Resolved capture evidence](verification-resolved-plan-capture-20261120.json) records
  actual Memory/SQLite own inventories beside ordinary rows, same-epoch/rival-write
  controls and Source admission/first-await/final-delivery checks. Original12 bodies
  remain exact. Registered Source certificates do not close the full fact/access owner contract.

  [Current node projection evidence](verification-current-node-projection-20261120.json)
  records actual Memory/SQLite tree node readings/resources over opposite orders,
  distinct sets, empty leaves and held work. The shared graph requires explicit
  interpretation, including its own-order cycle control. Keep3.1 open: current
  proposed-edit cycle snapshots still explicitly use uniform interpretation until
  actual candidate tree/type inventories are captured.
  Document17/18, import/converters, activated connected integration, full Source/fact/
  history matrices, actual CP-SAT, fake/UI/browser scope and Astra review remain required.

  [Current execution evidence](verification-current-execution-20261120.json) adds own
  inventories to SQLite execution and the local fallback, startable work, claim targets
  and by-person ordering. Actual Memory/SQLite cases cover distinct sets, opposite
  orders, empty leaves and transactional scoped claims; missing consumer metadata and
  unresolved live facts have separately qualified fault evidence. This does not close
  prospective cycle admission, every status writer, historical replay, actual activated
  connected HTTP, full Source/fact/access ownership, UI/CLI or Astra review.

  [Current status evidence](verification-current-status-20261120.json) adds own-step
  first/reopen/done recipes, empty-scope refusal, parent selection, actual current
  status undo/redo and SC19 status/claim refusals. Forty actual status cases and six
  actual claim-conflict cases extend the existing cohort. Eleven final faults are
  separately qualified; missing metadata is tested at the collected status consumer,
  so a later broadcast cannot conceal a fallback. This does not complete proposed
  cycle capture, historical guarantees, all Source owners, browser/CLI or Astra review.

- [ ] 3.1.1 Required candidate-order observation: first test both actual Sources for
      current/opposite orders, a former parent becoming a leaf, fresh/restore explicit
      types, missing/duplicate/foreign type evidence, ownership, missing values, ancestry,
      detached input/output and public/ordinary/repair lifetimes. Implement the required
      WorkItemStore purpose and shared validation on each same-observation adapter;
      record independent production negatives and guard/dependency faults.
- [ ] 3.1.2 Use that observation in every connected graph member, remove current
      interpretation bypasses and wire explicit new/restored type evidence through
      create/copy/first-child/restore/undo/redo. Preserve old recipe absence semantics,
      reached-owner admission, both incident directions, lifetime checks and step-removal
      projection. Add actual own-order cycle/no-cycle and direct-type edit consumers,
      including atomic refusals; run relevant products, strict checks and Astra before
      closing3.1. Pure synthetic fixtures author their interpretation explicitly and
      never impersonate Source capture.

Candidate-cycle progress: [verification](verification-current-candidate-cycle-20261120.json)
records the required actual Source projection, current connected-reader cutover,
explicit fresh/copy/restore type declarations, type-edit batch cycle checks and
complete-usage first-child inspection before prospective graph slicing. Tasks
`3.1.1`, `3.1.2` and `3.1` stay open: complete structural/type-edit/replay matrices,
all Source owners/epochs/cancellation, historical guarantees and requested Astra
review still require evidence. Selected current creation/undo/redo is not
old-producer certification.

Core regression follow-up: [verification](verification-core-closure-20261120.json)
closes ten previously recorded failures using exact restored Navigator13/14 source
bytes, actual catalogue authoring/person binding in current fixtures and the renamed
Fast floor vocabulary while retaining its original golden hash. Fourteen core failures
remain: thirteen historical parent/move cases and actual import reconciliation. No
production guard changed, no old history was fabricated, and the parent tasks remain
open. Import still requires the complete SC24 code/permission/definition/binding contract.

## 4. fe-01

- [ ] 4.1 Settings → Steps at organization, space and project: definitions, bindings per
      type with provenance, "add step here" (`defineAndBindStep`), binding reorder, refused
      unbind listing the pairs from `step-nodes-in-use`; the work item type picker warns
      before a type change that would refuse (SC17); conflict leaves render flagged; the
      estimates table shows only resolved steps per leaf — Playwright scenarios; rendered
      states for loading, empty and query failure.

- [ ] 4.1.1 Add typed organization definition and define-and-bind management to the existing read panel. Use its actual resource context and current catalogue endpoints; preserve loading, empty, query failure, newer-read and access-loss behavior. Verify defaults affect future materialization and editing/retirement preserves names, codes and archived values as specified. Do not infer write authority from a display membership role.
      Organization definition management now uses the actual scoped browser client for atomic define-and-bind, metadata edits and confirmed retirement. Thirteen editor tests plus real undo/redo refusal tests have local evidence in [the UI record](verification-step-definition-ui-20261120.json). Existing loading/empty/retry/newer-read/access-loss behavior is retained. Keep this task open for remaining binding/settings integration, actual Playwright/product checks and unavailable Astra review. The later 4.1.4 records cover package definition control retirement.

- [ ] 4.1.2 Reuse catalogue management at the actual space/project settings owners with explicit scope identity, real type choices and binding provenance. Identify existing owner/entry points first; bind writes to server-read owner identities and expose no free-form scope IDs. The recorded inventory finds no existing project settings page: implement the explicit settings route in design.md, reached through an observed project selection and admitted by readProject, rather than treating a URL or list shell as authority.
- [ ] 4.1.2a Reuse the definition editor for explicit organization/space/project creation scopes and actual type choices, preserving global edit/retire authority, exact allowance handling and draft/write/read lifetimes. Tests first; no local role-derived permission.
- [ ] 4.1.2b Attach scoped steps to server-read named SpacePage owners and exclude the virtual all space. Withdraw all page content on credential/membership loss. Verify exact space target, type choice, missing metadata and request lifetimes.
- [ ] 4.1.2c Add the explicitly designed project settings route and actual observed-picker link. Read and validate the real project under its resource context before mounting settings, including empty projects, 403/404, owner replacement and metadata identity faults. Render typed/untyped current project resolution with all provenance, keeping inherited bindings read-only.

- [ ] 4.1.3 Complete scoped binding add/remove/reorder and current preview/refusal lists, including stale reorder, per-type groups, count/cap and named affected rows. Real Source permissions and facts decide; a browser heuristic supplies no admission proof.
      Organization binding management now uses actual directory choices, explicit preview/apply bodies, complete scope reorder censuses across types, bounded protected-row display and stale/refusal states. The reusable owner mechanism has scope/type/lifetime negatives and103selected browser regression tests; see [binding UI evidence](verification-step-binding-ui-20261120.json). Keep4.1.2/4.1.3 open: real space/project settings attachment and inherited resolved provenance, broader product/Playwright checks and requested Astra review are still required.

- [ ] 4.1.4 Retire the browser's package-level definition API, command-facade methods and Steps-panel add/rename/remove controls after the corresponding catalogue flows exist. Preserve package unit/allowance editing and busy/unsaved/refusal behavior; update fake/demo/test surfaces and then deliberately remove unused legacy HTTP models. Current mounted backend, MCP and browser exclude those operation identities; retained history guarantees and final review/verification remain required.
- [ ] 4.1.4a Before removing obsolete package-definition methods, move retained `refusingApi.setStepUnit` and `setStepAllowance` boundaries to `patchWorkPackageStepValues`. Require facade unit even though HTTP fields are optional; convert exact allowance percentage to request basis points before the stated mutation; preserve the existing Step DTO response projection and modeled estimate-count conflict. Regress invalid/missing inputs before mutation, malformed responses and retained settings owners; prove independent boundary omissions before closing.
- [ ] 4.1.4b Remove current browser package definition methods end to end: API and PlanCommands, toolbar and StepsPanel, fake/refusing answers and demo/test arrangements. Keep names read-only and local allowance/unit/reach/layout controls, dirty and busy lifetimes, protected unit changes and refused refresh. Replace removed definition UI scenarios with current scoped-settings coverage; preserve peer-delivery/draft/column scenarios using explicit response fixtures, never obsolete mutation APIs or catalogue authority fabricated from a list. Verify no current client exposes retired methods and replay retained safety negatives.
- [ ] 4.1.4c Migrate every current E2E consumer, including generated SDK aliases (initially seven audited files; rendering and board callers found later), to genuine scoped catalogue setup/current package-value requests and current read-only-name/allowance/settings selectors. Preserve Step DTO compatibility and current command/history activation tests when retiring unused shared add/rename/remove shapes, unmounted HTTP adapters and obsolete route cases. Verify actual mounted refusals/authority, contracts/MCP and Playwright; do not revive package definition routes or rewrite frozen/history bytes.
      Shared package-definition request exports and unmounted adapters are now retired with two core admission tests preserved, thirteen current history cases added, and response compatibility retained. See [shared/history evidence](verification-shared-step-history-retirement-20261120.json). Keep 4.1.4c open: the byte-identical mixed SQLite controller still needs complete first/last-child, removed-step and old-producer guarantee mapping; broader current structural replay remains inactive and core has 27 retained failures.

- [ ] 4.1.5 Finish per-leaf resolved-step rendering, type-conflict states and actual preflight warnings, then exercise organization/space/project flows with Playwright, current generated contracts, product checks and requested review. Do not close parent4.1 from read-only settings or package-value tests.

## 5. Verify

- [ ] 5.1 `verify.md`: commands, outputs, R5 proofs; dev window: `report`, rule every row,
      `apply` under the heavy lock with a backup (E14), restore drill from that backup,
      confirm every work package's trios unchanged.
