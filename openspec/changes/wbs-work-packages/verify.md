# Verify: wbs-work-packages

## Slice 1 — task 1.1, the rename tool (2026-10-25)

Worktree `feat/wbs-work-packages-1`, base `origin/main` (`830e774d2`). Laptop run, every Bun
test under `env -u CLAUDECODE`; the h2puni gate was not run (CI carries the full suites).
`apply` ran only on scratch repositories inside the tests, never over this tree (task 1.4).

### Commands and results

| Command                                                                                     | Result                                                                                              |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `env -u CLAUDECODE bunx nx run tool-rename-work-package:test --skip-nx-cache`               | exit 0; 37 pass, 0 fail across 4 files                                                              |
| `env -u CLAUDECODE bunx nx run tool-rename-work-package:lint --skip-nx-cache`               | exit 0                                                                                              |
| `env -u CLAUDECODE bunx nx run tool-rename-work-package:typecheck --skip-nx-cache`          | exit 0                                                                                              |
| `env -u CLAUDECODE bunx nx run tool-devsync:test --skip-nx-cache`                           | exit 0; 921 pass, 0 fail across 49 files (tool-devsync not edited; run because a project was added) |
| `bun apps/twilight-structure/twilight-burokrat/cli/src/cli.ts check-indexes working . HEAD` | exit 0; the tool README is not a module index (tools carry none but tool-dagger's)                  |
| `bunx prettier --check` on every touched file                                               | exit 0                                                                                              |
| `bun tools/tool-rename-work-package/src/cli.ts report`                                      | exit 0; table below                                                                                 |
| `bun tools/tool-rename-work-package/src/cli.ts check`                                       | exit 1 as expected before 1.4: 25,836 residuals in 1,520 files, 85 of them path names               |

`report` on `830e774d2` (schema from the 93 migrations applied in memory; routes from the
document `emit-openapi-cli.ts` writes):

| Surface                                | Count |
| -------------------------------------- | ----: |
| tables named project                   |     9 |
| columns named project                  |    19 |
| project_id columns                     |    19 |
| indexes named project                  |    16 |
| automatic indexes of project tables    |     9 |
| indexes whose definition names project |     3 |
| triggers named project                 |     9 |
| triggers whose body names project      |    16 |
| paths with a projects segment          |    33 |
| paths naming project in a segment      |    34 |
| operationIds containing Project        |    40 |
| tracked paths apply would move         |    85 |

The design's 25 indexes are the 16 named ones plus the 9 automatic indexes, which SQLite
renames with their table.

### Failure proofs

Each fault was injected into the tool's production code, the named test watched failing, and
the code restored; the adjacent `Proof:` comments carry the same.

| Guard                                       | Fault injected                                                              | Test that observed it                                                                              | Result          |
| ------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------- |
| `check` reports a residual outside          | `{ glob: '**' }` prepended to `EXCLUDED_PATHS` (matches every path)         | cli `check exits 1 listing an injected residual…`, `reports a path that still names the word`      | 2 pass, 3 fail  |
| `apply` is idempotent                       | plural path target `work-packages` respelled `work-projects`                | cli `apply equals itself run twice…`: second run printed `rewrote 1 files`                         | 4 pass, 1 fail  |
| new-sense line `client projects`            | pattern removed from `PROTECTED_LINES`                                      | allow-list `leaves every new-sense witness line…`; cli `check exits 0 … on a protected line`       | 6 pass, 2 fail  |
| new-sense line `[PROJECT-ASSIGNMENT-READS]` | pattern removed from `PROTECTED_LINES`                                      | allow-list witness case (`requested project` became `requested work package`); the respelling case | 26 pass, 2 fail |
| line patterns are held to the tree          | a `\bprojectType\b` pattern whose lines sit only in excluded `project.json` | allow-list `holds every line pattern to at least one line…` named it; the pattern was dropped      | observed        |
| targets collide with nothing in scope       | dated `docs/wbs/research` record in scope                                   | rename-map `collides with no identifier…` named `work_package` lines of the authorization research | observed        |

Not run: tasks.md's `ScopeChain` fault (pattern removed, `apply` makes a second
`workPackageId`, typecheck fails). `ScopeChain` and the other `wbs-permissions` identifiers have
not landed on `main`, so no pattern exists to remove; `allow-list.ts` records that their slices
add the patterns, and the allow-list test then holds them to the code.

## Slice 1 — task 1.2, verified local window controls (2026-11-11)

Implemented the report-mode producer/readonly verifier, Bun host gate and four exact future-window waivers. The report remains exactly eight fields; observed artifact locations are separately returned and printed on stderr. The new wrapper never deletes stages or failure reports, because pathname rechecking cannot authorize identity-conditional deletion. See [ADR0084](../../../docs/adr/0084-retain-window-backup-artifacts-without-pathname-deletion.md) and [window runbook](../../../docs/runbook-work-package-windows.md). No-flag snapshot behavior and lower snapshot ownership/cleanup are unchanged.

The durable barrier remains stopped services plus paused poller and the host-wide lock. Checkpoint busy0 proves completed truncation/empty WAL, not absence of idle connections. Source-only immutable readonly acquisition requires that barrier and physical WAL checks; snapshots remain ordinary readonly. The host verifies exact stopped-container identity/name, selected readonly artifact mounts and pinned candidate image, invokes Bun explicitly, then rechecks state. Fake Docker proves argv/control flow only.

Exact argv/status/log SHA+bytes and fault recipes are in [verification-1.2.json](verification-1.2.json). All nine final commands ran sequentially against frozen32 source paths with before/after drift checks:

- Affected13-file regression:437 passed,0 failed,2679 assertions,138.20s; includes legacy snapshot, capture and rollback paths.
- Actual import-policy tests:4/0/79,5.38s.
- Existing source conformance:84/0/7703,70.32s; this is not standalone window certification.
- Six solution roots freshly compiled with --force:0; explicit bin project nonincremental compile:0.
- Exact owned TypeScript/JavaScript lint:0; supported-extension format:0; OpenSpec all:343/343; gitdiffcheck:0. The five SQL lint fixtures have no supported Prettier parser and were explicitly excluded from format.

R5:144 unique comprehensive faults/192 named RED→GREEN pairs, plus14 separately reviewed retention faults/15 pairs =158 canonical faults/207 named pairs. Six comprehensive attempts are excluded and fully retained. All144 current recipes reproduce exact archived mutants; all source/log SHA+bytes and complete32-file post-GREEN restoration checks (includingfinalrow) passed. Nine independently reproduced executable equalities bridge annotations/formatting only. Astra independently audited the archive/source/comment epoch; it ran no tests.

Qualifications: SHA+bytes physical tuples count once, with no independent byte-comparison claim; grouped checkpoint settlement distinguishes actual closed-writer admission failure from post-close ordering. Native prerequisite failures, explicit diagnostics, structural policy options and actual resolvableNx refusal are classified separately. StrictJSON alias proof comments live beside the actual compiler consumer. The noncanonical singleton pilot and six unqualified comprehensive attempts are not counted. Initial wrong matcher/selector, parse-only and masked-host attempts remain in the JSON, along with earlier failed/partial/unverified worker receipts. No permissive production fallback was added.

The baseline inventory is110 ledger identities,13 project-named tables,28 columns,23 named indexes,13 named triggers and one allocator view; the dated task1.1 survey above is historical. The five full SQL fixtures test lint shape only; no future semantic migration was created. Actual rename/view/allocator migration and permission new-project positives remain task1.3+ later work. No live Docker/mount certification, h2/h4 gate, maintenance window, deployment or remote publication was run. No remote publication occurred; no alternate route was used, and further publication remains blocked pending approval. Both rejected push attempts are preserved in the evidence.

## Local preparation for tasks1.3–1.6 (2026-11-11)

This is the exact parent preparation for the later mechanical application. Tasks1.3–1.6 stay unchecked; no application reader, compatibility, deployment or whole-goal closure is implied. Root published only explicitly approved b0d2df4e. The local1.2 commit8c997 and this preparation have not been pushed.

[Preparation receipts](verification-1.3-preparation.json) retain25 source hashes, exact commands/statuses/log SHA+bytes and41 span proofs with three excluded oracle attempts. Astra independently reconstructed all41 exact mutants,176 source/log records,475 archived inputs and five executable bridges; each canonical test has its own RED/restored GREEN and adjacent Proof link. Scope is32 behavior,4 named-diagnostic-only,1 inventory,1 selector dependency,2 corpus structural and1 parser-field absence. None is migration omission evidence.

Fresh bounded span/producer group155/0/1259, forced tool+contracts+SQLite3solutions0, lint0, format0 and OpenSpec343/0. After actual migration implementation, native33/0/464 proves mapped tree/code/grant preservation, saved body10/header/hash retention, every schema object/column, real allocator, four equality triggers, audit append-only/vocabulary preservation, owned-command conversion, twelve duplicate-key cases and malformed/late-FK whole-owner rollback. Fresh forcedSQLite0, testlint0, fixtureformat0 and exact migrationlint0 precede the final two added native controls; final repeated quality follows in the preparation record.

The first migration2/12 failed trigger extraction and wrapper-diagnostic assertions; schema17/2 failed exact token/activation preconditions; duplicate-key0/12 actually admitted corrupt history. All attempts/preimages remain retained. Scoped uniqueness now rejects SQLite-first/JSON.parse-last ambiguity only at owned structural fields; no blanket user-JSON rewrite or duplicate rejection was introduced. Deepest native errors are asserted rather than SQL excerpts. Historical constraint labels are exact tokens, including unquoted grammar; two exact initial-offer catalogue JSON literals remain in their existing trigger. No writable_schema or broad SQL-line exemption.

The migration is a stopped-writer window operation and down refuses before effects, requiring the verified window snapshot. Current-codec readiness remains coupled: stored published10→fresh11, historical schedule1/2→freshplain3/connected4, document11→12, scheduler18→19, explicit frozen solver mappings and immutable runtime protocol codecs. Old realtime buffers stay under their old namespace; current streams require fresh anchored reads. Per WP14 the migration omission experiments and full reader scenarios follow task1.4; these have not been credited yet.

## Runtime-command identity boundary (2026-11-11)

[Runtime receipts](verification-1.6-runtime.json) record a bounded current/legacy codec slice, not coupled rename completion. Current canonical request, accepted envelope, receipt and state use version2; operation body1, ledger marker1 and positional rb1 remain unchanged. Genuine outgoing110 SQLite history is migrated through111 without changing original canonical strings, digests, receipts, nonce or counters. Old authority/claim/write retries explicitly encode into the retained format and return original receipt1; new writers and both adapters accept only2. Current permission denial and changed-command conflicts still precede returning history. The exact native schema comparator remains strict.

Fresh final regression:503 passed,0 failed,2242 assertions across26 files in158.26s, including all changed tests and actual cold contracts boot-memory. Eight solution roots compiled with --force:0;39 TypeScript lint paths:0;45 supported format paths:0; OpenSpec343/343; gitdiffcheck0. All52 frozen boundary/dependency hashes remained exact after every quality command. Eleven Bun-erased byte equalities bridge only adjacent Proof annotations. Astra independently cleared source/API, exact archives and the comment bridge; final command receipt reconciliation is pending.

R5:28 unique canonical recipes and32 exact named RED→restored GREEN pairs, with3 oracle-only attempts excluded and retained. All4 runs archive all52 inputs, while selected-test archives contain each run's actual subset (8 unique files overall). Current-emission faults expose producer/schema inconsistency; shared claim/write emission reaches claim first and is not an independent write-emission proof. Original-format dispatch and schema dependency failures are qualified separately from admission bypass. Every canonical fault has adjacent exact ID/test links.

The first broad runtime attempt344/22, first forced-type/test-fixture failure, initial lint29, and subsequent diagnostic/syntax repair attempts remain visible. Current111 rollback refuses with whole schema/runtime/ledger unchanged. Historical down.sql is tested separately in one real native transaction, and genuine historical-prefix rollback/reinstall uses only that schema's native reader. Mounted pin changes use explicitly destructive test-only reconstruction of all current runtime tables/indexes/triggers plus the original fresh-marker INSERT, preserving the complete migration ledger; this is not operator rollback or recovery guidance.

Published document11/12 readers remain frozen; renamed current exports are13/14 (the earlier preparation paragraph's11→12 allocation is superseded). Resource-use projections and ordered resource-runtime identities, old/new WebSocket cursor reset, current Navigator12–14, remaining migration omission proofs and whole entity verification remain pending. No later commit/push/PR update, host gate, live Docker, maintenance window or deployment is claimed.

### 2026-11-11 — resource persisted identities and observations (bounded1.6)

[verification-1.6-resource.json](verification-1.6-resource.json) records the exact20 source/dependency hashes, genuine outgoing13-source/110-ledger captures,38 canonical mutation recipes with52 exact named RED→GREEN pairs,152 source/log hash+byte records, zero excluded mutation attempts, four exact Bun-emitted comment bridges and six final command receipts.

Historical untagged admission/event/declaration strings and manual positional fingerprints remain exact. New private records use tagged2 even for unlinked host jobs. Retried current requests are encoded in the retained format with property order and optional absence preserved; snapshots retain observed names/state/revision/attribution. Terminal and provider readers validate complete original identities and extract only consumed proof/display fields. Corrupt trusted terminal state throws; missing/mismatched incoming proof remains400/409. Actual credential, grants, sequence, infrastructure exceptions and transaction ownership are unchanged.

Final coherent frozen checks: six controller files472pass/0fail/3438 assertions,350.87s; eight forced roots0;12TS scoped lint0;16 supported files format0; all OpenSpec validation0; diff check0. All20 frozen hashes remained exact after every final check. Archive-only and source/comment bridge reviews independently cleared the38/52 records and4/4 executable equalities; this tracked record presents their exact current evidence for final reconciliation.

NativeBLOB and missing-proof cases are contextual-error proofs; provider-kind uses the native provider port, and current malformed snapshot validation is proved by committed-effect refusal even when response validation also returns500. Producer/schema and required-decoder failures retain their precise classification. The earlier300-second timeout is unverified, completed447/2 failed broad run and earlier470/0 pre-final epoch are retained, along with TDD/type/lint/preparation failures. None count as additional formal mutants. Genuine capture key rotation keeps the same credential identity; it does not prove wholeDB byte preservation after secret/audit setup. The earlier failed terminal capture acquired no verified artifact and claims no cleanup completion.

Only this bounded resource boundary is complete in code/proofs. Tasks1.3–1.6 stay unchecked pending remaining migration/codec/residual/composition obligations, actual live-client/gateway namespace reset and Navigator12–14 support; task1.8 still reconciles stale proposal versions/non-goals. No whole-suite/browser/host gate, live Docker/window, deployment, publication or whole-goal closure is claimed. Existing staged mechanical work is preserved; no new commit/push/PR action occurred.

### 2026-11-11 — current work-package transport namespace (bounded1.4)

[verification-1.4-ws.json](verification-1.4-ws.json) records the exact43 source/dependency inputs,12 owned source paths,11 canonical counterfactuals and17 exact named RED→restored GREEN pairs. The gateway now accepts the live `work-package:` prefix. Historical `project:` and accidental `workPackage:` prefixes are refused on subscribe and resume before admission/registration effects. Current principal/readable admission remains mandatory.

The genuine outgoing110→111 SQLite test retains nonempty old sequence0 frames, complete raw old cache/sequencer rows and old ranges, while actual current publication independently starts at0 then1. Plan-event IDs/counts remain; their owned command bodies are covered by the separate migration conversion, not claimed byte-identical. Actual composed backend isolated/shared reads use current anchors and deny old aliases. Live page/composition tests coexist with obsolete stored project cursors, use covered empty/positive anchors, and keep old frame0 separate from current0. Failed denied-resume HTTP refetch preserves stale/error state and acknowledgment; connected transport alone does not recover state. The extra-request mutation proves that old frames trigger an unwanted current HTTP read, not independently installed coverage or direct application of old payload.

Final frozen checks: 112pass/0fail/800 assertions across9 gateway/backend/native files (16.36s); client stream10/0; selected actual page3/0 with110 unselected tests; eight forced roots0; exact12-file lint/format0; OpenSpec343/343; staged and unstaged diff checks0. All43 input hashes remained exact after every final command. These are layered actual gateway sockets with controlled backend/access ports, real composed backend/native SQLite, and actual client/page with controlled HTTP/socket IO; no all-live browser/server or complete page-suite claim. Generic SubscriptionTracker remains unchanged and unused by this chain.

R5:11 unique recipes/17 own named RED→GREEN, zero excluded mutation attempts. Five initial proof-comment bridges have exact Bun-emitted equality. A later one-comment correction is also exact; two required import sorts preserve parsed emitted executable bodies and exact imports/bindings while changing import order, and are separately reviewed rather than called whole-JS byte-equal. Two checker-only controls prove installed Vitest assertion RED plus independent file-hook error and malformed suite counts are rejected; neither counts among the11 production recipes. All canonical selected tests retain their fault-era bytes.

Prior actual TDD REDs, fixture/precondition mistakes, failed lint/type attempts, the105/7 preflight and two-import-sort final lint failure remain retained. Seven test-owned spelling corruptions were restored against exact7b preparation, preserving current native additions; these repairs are not formal counterfactual credit. Source/proof review ran no reviewer tests. The prior resource20 source hashes and its tracked proof record stay unchanged; this section is appended after its unchanged appendix, so the historical22-file document manifest is explicitly a prior epoch.

This closes only the bounded transport slice. Historical shared-people/rank backup authority codecs are next, before Navigator12–14/PlanTasks3. Remaining migration omission proofs, OpenAPI/tool91, full renamed regressions, exact mechanical-plus-semantic composition and task1.8 version/non-goal reconciliation remain open. Tasks1.3–1.6 and the whole entity goal are not complete. No staging, commit, push/PR update, live Docker, host gate, maintenance window or deployment occurred.

## 2026-11-11 — bounded recovery backup identity after rename

Strict historical shared-save1 and project-rank-save1 keep their original owner spelling, canonical bytes and digest. New saves emit shared-save2 and work-package-rank-save2. A separate complete projection feeds current rows after validation; genuine outgoing110 pending/completed approval, operation, receipt and consumption evidence survives actual111. Equivalent current2 facts cannot retarget an old1 approval, and cold retry returns original receipt facts without replay. The separately archived supervisor repair maps current frame.workPackageId into the existing external wbs-project-id label.

The independent proof review accepted **42 distinct recipes / 61 named RED→GREEN pairs** across three immutable archives. All44 attempts remain retained: two earlier oracle wording failures (three named observations) are excluded without retroactive credit.176 source/log hash-and-byte records, three complete40-input captures and27 selected-test copies reconcile. Grouped closed-generation reaches version3 once; rank organizationId is diagnostic-only; native standalone root admission returned5; approved-facts reaches committed position7→8 after receipt equality. First-property limits and exact test names are indexed in [verification-1.6-backup.json](verification-1.6-backup.json).

Seven annotated TypeScript files have exact complete Bun-erased executable byte equality with the fault epoch. Three separate scoped project commands sum to: **173pass,0fail,878 assertions,2 opt-in Docker skips**. SQLite uses its declared cwd/30-second budget/coverage flags, backend its cwd/10-second budget/coverage flags, and the scoped supervisor command uses its canonical scratch preload/10-second budget. This is not one173-suite or fullproject/CI run. Fresh nine forced type roots,21-file lint,29 supported source/input formatting paths, exact two Nx/CLI controls,343 OpenSpec items and both diff checks passed with no drift. The actual local-daemon Docker controls separately passed **2/0/44 assertions** against a cached immutable image; unchanged host test bytes and comment executable bridges carry that earlier body epoch. These separate runs are not reported as a synthetic175-test group or deployment certification. Two gzip fixtures are intentionally outside Prettier. Closing document checks cover31 supported paths including these two docs.

Resource18 runtime/fixture paths plus its verification and WS12 runtime paths plus its verification stay exact. Resource's historical20-input epoch also included design/spec already amended by the authorized backup intent; that old documentation equality is not claimed. This shared verification file preserves its entire preceding prefix and appends only this section. Earlier failed wire/native fixture/type/lint/timeout and checker attempts remain referenced honestly; the closing scoped run initially omitted the declared backend10-second budget and failed at Bun default5 seconds, then reran unchanged at the checked-in budget. The intermediate global10-second authoring success is also retained; final counts come from three project-specific commands rather than that mixed-budget run. No reviewer reran tests.

Parent tasks1.3–1.6 and the whole entity goal remain open: Navigator3/private-capsule reconciliation, full renamed coupling/CI, residual/OpenAPI/tool91 and proposal/task1.8 reconciliation are still pending. No broad dirty-tree commit, push, merge, deployment or host-wide gate is claimed.

## Navigator1.7 private implementation candidate (2026-11-11)

The owned private capsule is /tmp/task-698-nav-1.7-capsule-vatNMc/source; capture.json remains SHA aa0828b76312877355757029e10a1f8c1a4cfe51e01422d249dd0ba4a55f7904. It carries the captured current renamed source and independently copied locked dependencies, without a fresh-install, published-commit or live-import claim. No live af5e source/index or live6ce4 source was read or written for this implementation. Only immutable1816f5848e11c40786f7919388f98abeb330ebeb Git objects supplied frozen connected12 history. Genuine mounted12 bytes retain SHA d5d58dc017a9cabca1ae712f052c79ee6a4f5313e1dfd6c9fb561db2c29ba123. Current13/14 fixtures come from actual detached exporter methods and are regenerated by an executable fixture test.

Task1.7 now allocates PlanTasks3 for12–14, with local leaf receipt targets and complete authored document-level edges. Frozen12 fully validates old project spelling/history before explicit external identity/display projection; current13/14 reuse the public raw declaration through one selected strict requestSchema union. Original export bytes remain digest-bound. Historical7–11 output-byte pins match their pre-task hashes. Reference/task pairs are6/7→1,8–11→2,12–14→3;15+ refuses. Existing receipt schemas and local command destinations remain unchanged.

Two necessary strictness refinements were recorded before their reader changes: public responseSchema deliberately tolerates undeclared fields, so a lazily cached strict current requestSchema is required; raw ArkType frozen12 admitted array-valued dictionaries, so selected12 likewise uses descriptor-backed requestSchema plus public validateSchema. The production12 dictionary negative was observed exit0 before this correction and all12/13/14 cases refused afterward. No hand-written validator or SchemaShape cast was added. Historical7–11 readers remain unchanged in behavior.

Observed scoped checks, with distinct commands/epochs retained under the capsule evidence directory:

- navigator-release-candidate: declared twilight-navigator:test Nx target, existing scratch preload and30s case allowance,178pass/0fail across8 source files (71.98s). This includes exact7–11 output bytes and direct native14 plan-reference/conversion/admission.
- contracts-final: affected Burokrat task/receipt/reference, complete frozen12 and genuine current exporter fixtures,165pass/0fail across6 files (37.96s).
- dash-progress-final: existing native progress suite plus12–14/schema3 bound receipts,73pass/0fail (231.92s). This is the scoped progress suite, not the complete Dash test target.
- wbs-wire-final: schema helpers, connected response and public contracts boot,20pass/0fail (3.44s). The final observed boot increment was470MB under the500MB bound; prior epochs374MB and378MB are separately retained.
- frozen-types-final: forced Navigator, Burokrat and WBS contracts roots, exit0. Broad Dash typechecking remains failed:648 diagnostics across75 unchanged captured caller files; this hash observation alone does not establish diagnostic causality or a passing baseline.
- final-quality: fresh private Nx graph, active module-boundary lint, owned format check and OpenSpec validate --all, exit0. OpenSpec warnings remain reported by its output.

The selected-decoder profile is in evidence/decoder-profiles.json. Import constructs neither historical nor strict-current graph. Current13 first selection compiled one strict graph, reused by14/13;12 constructs one frozen11 body and one complete12 graph, reused on the next12 read. In the navigator-release-candidate epoch,12 first selection was294.1ms with RSS466.9→532.5MB and166.8MB heap; reuse was3.6ms. Current13 first selection was281.3ms with RSS482.9→523.2MB;14 reuse was5.3ms. Earlier larger RSS readings remain in their separate logs. These are CLI selection costs, separate from the public boot bound.

The parent assigned one adjacent mechanical test repair: plan-document-connected-shapes.test.ts's missing-field list used the absent name work_packages; it now removes the actual workPackages field. The exact one-field hunk and before/after hashes are in evidence/adjacent-current-shapes-repair.json. The original wire-check run had19pass/1fail; the corrected run has20pass/0fail. No production declaration was weakened.

Authoring/precondition failures remain retained and excluded from formal R5 credit: an initial fixture-relative-path error; a root-script alias invocation; the tsc executable-name attempt; generated-dist collection by a root-directory test invocation; managed-sandbox native pipe EPERM (resolved by native qualification); raw5s rather than declared30s test invocation; a live-namespace mock recursion/timeouts; a wrong12 reuse-count oracle; a missing native-helper import; obsolete future12 tests; and the adjacent test-field residual. Every corrected native potentially stalled run used the existing independent Performance process owner, a finite outer deadline and awaited stop/reap; outer stdout/stderr shared one exclusive numeric FD. Inner CLI channel captures remain separate where assertions distinguish stdout and stderr.

This is implementation/positive-quality evidence before independent source/finite-plan review. No formal source mutants or newly claimed Proof comments have been executed/added. The finite proposed recipes and exact source/input/API packet live under the private evidence directory. Task1.7, parent slices and the whole goal remain open pending independent review, approved counterfactuals, root composition and required qualification. No full Dash typecheck success, complete Nx gate, build/installed qualification, h2/h4 gate, staging, commit, push, publication or deployment is claimed.

Final test-only numeric case names distinguish document12/13/14 and connected12/14 for later exact counterfactual selection. The resulting named-final-controls run passed82/82 across the three changed test files (26.30s), after the separately retained178-case run. No production behavior changed in that naming pass. Independent review is requested under requesting-code-review; the parent owns reviewer dispatch, per the explicit no-spawn instruction.

The final named-final-controls-blockages epoch added explicit valid nonempty negative-instant facts on done leaves for12/13/14 and passed85/85 across the same three source files (26.20s). Each case also proves facts change exportDigest while preserving tasks. These are positive controls for the proposed blockage-call counterfactual, not source-mutant credit. An incidental report-script path error was corrected; metadata/orchestration failures remain excluded from behavioral proof.

### Navigator1.7 accepted proofs and private closing (2026-11-12)

[verification-1.7-navigator.json](verification-1.7-navigator.json) carries the accepted private proof selection: **27 observations from27 distinct source mutants**, **32 failed-name/restored-pass joins** across29 distinct failed names, and hashes/lengths for all81 raw native logs. Healthy and restored phases each contain60 passing occurrences; RED has28 passing controls. Those counts do not create additional source proofs. Astra's independent actual review accepted27/rejected0 after reconstructing all literal faults and checking290 referenced artifacts. All290 references were rehashed after the comment-only closure and remain exact; the old19,262-input/source32 manifest remains the immutable proof epoch, not a claim that comment-modified current files retain their old hashes.

Every accepted recipe has ordinary healthy0/RED1/restoredGREEN0, exact own test names and source assertions, no signal, unhandled/setup/no-match/timeout credit, and settled process ownership. F17A/B credit only the reached fault=owner case, including both current13/14 named failures for the shared call. F10 credits receipt→producer at mode=convert; F11 credits producer→selected at mode=selected. F12 stops before the later collision case. F15/F16 reach import counters before reuse assertions and prove no selected-memory ceiling. D01 is diagnostic-only: future15 still refuses. F19/F20 replace throws with terminating bounded breaks; neither uses a timeout. S01 groups three samples of one deep persisted-schema boundary; S04 first admits each valid labeled endpoint before checking missing stepName. The JSON retains every narrower first-property qualification.

The parent authorized adjacent Proof notes only after actual acceptance. Eight comment/JSDoc-modified TS files have exact before/after Bun-emitted JavaScript bytes, archived separately under evidence/closing/comment-bridges.json; no production behavior changed. The two fault-era test assertion labels and all other tests remain unchanged. Three formerly frozen input files are now owned solely for those comments: shared validate-progress-receipt.ts, Navigator admit-progress.ts and current plan-document-connected-shapes.ts. Final manifests distinguish their captured preimages, accepted proof preimages and final bytes/modes.

Fresh closing checks are separate groups, all captured through the existing Performance process owner with one exclusive numeric FD for outer stdout/stderr and awaited stop/reap:

- Declared twilight-navigator:test, existing scratch preload and30s allowance:181pass/0fail/1091 assertions across8 source files,73.07s. Includes exact7–11 output pins and all current native read/conversion/admission cases.
- Focused persisted PlanTasks3, complete frozen12 and genuine exporter fixture:35pass/0fail/85 assertions across3 files,3.42s; scratch preload and60s allowance.
- Only actual Dash schema3 producer cases:3pass/0fail/15 assertions,70 filtered,31.85s; declared60s allowance, both format4/format5 lifetime preloads and trusted dependency root. Existing loop names print the same literal %s; this is a positive loop check, not a new formal name join. The earlier full73-case progress epoch remains separate and was not replayed solely for comments.
- WBS descriptor/current connected/boot checks:20pass/0fail/67 assertions across3 files,3.45s; existing10s contract allowance. Public boot load370MB under its500MB bound.
- Forced Navigator, Burokrat and WBS contracts type roots:exit0. Broad Dash root remains failed648/75 in this capsule and was not rerun or suppressed; parent live coupling reconciliation is outside this proof epoch.
- Fresh private Nx graph with ordinary graph caching enabled, followed by exact28-TS owned ESLint:exit0. Format/OpenSpec/diff checks and final input settlement are retained in the closing packet.

The final Navigator positive run measured current13 first selection230.0ms, RSS441.6→571.8MB and121.7MB heap;14 reuse2.9ms. Frozen12 first selection285.8ms, RSS465.9→533.3MB and169.5MB heap; reuse3.1ms. All three profiles import with zero historical/current decoder counters, then reuse only the selected graphs. These selected-runtime observations remain distinct from the public boot bound, prior epochs and the narrowly accepted import-counter counterfactuals. Strictness is not weakened to meet an unclaimed selected-memory ceiling.

Four OpenSpec preimages were reconstructed and verified against the original captured hashes. Navigator task/design/spec/verify changes are supplied as bounded replacement/additive deltas for later composition; the old capsule documents must not replace later live Runtime/Backup/WS prefixes or the queued root-private13 documentation. Task1.7 remains unchecked pending actual integrated validation. No coherent Git index was fabricated; index-dependent checks, complete Dash coupling, full build/installed qualification, host gate and whole-goal closure remain pending. No live import, staging, commit, push, publication or deployment occurred. Two closing preparation-script shape/path mistakes were corrected before source edits and remain authoring-only failures, with no R5 credit.

The181/178 Navigator count difference predates closing: raw name-multiset comparison retains178 common occurrences after the earlier numeric-name repair and identifies only the three document12/13/14 valid-negative-blockage/done-leaf positives already recorded in the85-case preflight epoch. All proof-era owned tests retain exact hashes/modes. Closing quality initially exited1 after successful format/OpenSpec because its wrapper expected the wrong no-index diff status. A separate diff classifier then found Bun synchronous receipts omit signalCode; neither authoring failure receives behavior/proof credit. Final native diff qualification uses the existing asynchronous capture contract and separate same/clean/whitespace/missing-input controls, with no Git index.

### Actual Navigator integration and task1.7 closure

The reviewed private Navigator36 packet was imported after all36 live preconditions passed, without index/stage operations. The actual integrated source/check record is indexed by `verification-1.7-navigator.json` under `actualIntegration`; the prior27 canonical proofs, private source epoch and historical648/75 diagnostics remain unchanged. Root authorized only task1.7 closure after independent closing review `51584cab59bb79259bff46ca68e68bf5e6f2ad142394cba25cb15b08eda4c8a9`.

Separate commands passed: declared Navigator181/0/1091 expectations; Burokrat152/0/382; contracts/wire32/0/121 (cold boot373MB); core fixture1/0/4; full Dash progress73/0/410. The first forced six-root build failed only because the new test helper omitted selected C timezone in its typed export metadata. Its minimal correction uses the production connected-tree observation, preserves exact13/14 export bytes, and passed a fresh fixture1/0/4 plus the same six forced roots. Nav/progress tests precede that fixture-only correction; fresh fixture/types follow it. Imported lint28/format36, OpenSpec343/343 and diff checks passed. Native command receipts retain same-FD output, settled/reaped owners and individual timings; these counts are not one aggregate run.

This appendix preserves the previous verify prefix. Later parent-authorized task1.8 metadata candidates update CONTEXT, LLM index, plan-import, measures/budgets and capacity documentation under a separate safe-metadata receipt. They are later document epochs, not claims that old protected documentation hashes remain current. Parent1.3–1.6/1.8, broader runtime/CI coupling, index-dependent checks, host gate and publication remain open.

### Coupled Dash runtime identity: accepted finite record and current closing

[verification-1.6-dash-runtime.json](verification-1.6-dash-runtime.json) indexes all63 distinct attempts across seven immutable private flights:57 canonical recipes/78 named RED→restored GREEN pairs, four separately adjudicated human observations, and two zero-credit survivors. All six automated exclusions remain unchanged. Human14 proves validation order only;54 proves the specific plan-runtime Nx peer;57 proves actual receiver migration-owner admission;58 proves that specific fixture peer lacks Nx while an unrelated lint rule remains. No unsupported-version admission, empty lint response or all-rule bypass is claimed.

The25 UTF-8 fault is inside a schema-valid ledgerId string. The60/61 actual fault-era frame is recovery-evidence.ts153, not the historical static prediction154. Grouped schema/owner guards count once; native changed-command mutants first expose success versus refusal, while restored controls reach exact409 bodies and no-effects. Survivor19 is the selected asynchronous wrapper's explicit ignore override; survivor41 still deletes both targets through the work-item cascade. Neither earns failing-check credit or causes a new production guard.

The original19253-entry source union (19113 regular files,8 symlinks,132 known absences),40 tooling entries, all source archives and raw63 receipts remain immutable. Closing adds adjacent bounded notes with19 exact whole Bun-emitted JavaScript byte equalities after formatting. The three reviewed test overlays were already live and unchanged; target JSON files are unchanged, with their eight omission proofs beside the owning input tests. Original source/capture/API records independently pin the outgoing Dash6 physical store and WBS110→111 migration, original1 canonical/digests/receipts/artifacts/tuples, cold reopen/deleted references, current write-permission fences, and fresh2 insertion counters. No new historical capture or changed authority predicate is inferred from comments.

Current checks are separate commands, using declared budgets/preloads and the existing owner with identical numeric stdout/stderr FD plus awaited stop/reap/close:

- The two repaired helper/reader files: 32pass/0fail/36 printed Bun expectations; both format4/5 preloads and60s per-test budget.
- The two repaired SQLite/native files: 308pass/0fail/745 printed Bun expectations; same declared preloads/budget.
- Public runtime contracts6:122pass/0fail/218 printed Bun expectations, coverage and10s budget.
- Exact current policy and three owning-input cases:8pass/0fail/158 printed Bun expectations,140 filtered, scratch preload/30s; fresh active live Nx graph, no skipped-rule credit.
- Six affected strict type roots, lint22, formatter23:exit0. The four later test repairs have separate fresh named2/named5, two scoped lint2 commands, a strict Dash build and final formatting receipts. Node assertion checks are exercised separately from Bun's printed expectation counter.

The first17-file command remains808pass/2fail: two old tests injected now-valid state2 as an invalid schema. After its native companion settled, only those two fault literals changed to unsupported3. Their old preimages, failed own rejects and new two-file outcome remain separate; the unchanged15 files are carried from the original command, not labeled a new17-file GREEN. The initial native11 command remains608pass/4fail: four historical setups sent current2 to the genuine old format4 parser. Reviewed test-only selections now load original helpers from the same verified owner-retained archive; state1 remains typed1 and current setup is unchanged. Four historical cases plus the current held sibling first reached reopen/down/no-effects assertions, followed by both complete affected native files. The other nine native files are unchanged; no full11-file repeat or aggregate GREEN is invented. The initial type/graph package-entry invocation failures also remain excluded; corrected installed executables passed. No predicate or original fault archive was changed to obtain GREEN.

Only the five matched Dash local/receipt/state/current-API/native task clauses close here. Their design constraints retain immutable local scope1/pin1/snapshots1–3 and physical keys, original public1|2 bytes before projection, live state2-only, complete raw recovery body.value, fresh envelope2/body1 and current authorization. Historical637/73 and other earlier broad diagnostic epochs stay recorded; current affected strict roots pass without claiming the whole Dash target. Parent1.3–1.6/1.8, remaining renamed-suite/CI/residual coupling, index-dependent checks, combined CLI deployment/build, host gate and publication remain open. Queued guide/auth/UI/activation/ADR/CI repairs were not mixed into this slice.

## Bun frontend reporter integration (2026-11-12)

The reviewed test setup routes Bun host errors through cancelable jsdom events before React captures reporting, retains the original Error identity and forwards uncanceled errors to the captured host reporter. Per-file cleanup restores that reporter. [The bounded proof record](verification-fe-reporter.json) records six recipes/seven named RED→GREEN pairs and 28 settled native receipts. Five recipes/six pairs qualified automatically; the installation pair is separately reviewed raw evidence. Its actual TSX975 assertion failed and restored command passed, while the frozen checker expected a .ts filename. The original automaticfalse, FIRST_UNQUALIFIED_STOP and transport exit1 remain unchanged; no native retry or retrospective automatic promotion occurred. Synthetic host selection is not actual Node compatibility; the API guard is grouped once and restoration earns only its first own afterAll assertion.

The candidate and annotated whole-setup Bun emissions are byte-identical. Normal live setup/type/lint/integration checks are pending in this authoring epoch. This closes no parent task, full DOM target, activation or whole goal. Original calibration/setup failures and historical proof records remain unchanged.

The initial live DOM10 invocation passed 220 tests in ten files with exit0/null and clean owned FD/subprocess cleanup. Its owning typecheck exited2 on TS4111: Bun is an index-signature property here. A bounded compatibility repair uses the same static key through bracket access; the complete emitted module differs only at that one property-access syntax. This is a separately recorded semantic bridge, not comment-only emission equality for the final source. The original source/receipt epochs remain immutable. Initial format exit1 identified one extra newline only in this appended section; the preexisting verification prefix is unchanged. Fresh compatibility checks remain pending.

The live compatibility checks passed: the complete modal file reports 54/0 after bracket access, the owning forced frontend TypeScript build exits0/null, and uncached setup lint exits0/null with empty output after one import-group separator. That separator preserves the complete emitted JavaScript and import order. The earlier ten-file220/0 run is a separate pre-compatibility epoch, carried through the exact static-key syntax bridge; these are not274 distinct tests or a full DOM target. The actual graph has55 nodes, the exact wbs-fe-01 root and no cache errors. OpenSpec reports343 valid/0failed with786WARNING and29INFO (14 owning-change issues); warnings remain unresolved. Initial type2, format1 and import-sort lint1 are retained with their exact causes. Final documentation formatting and full closing review are recorded separately. No parent checkbox, activation, host gate, installed-product or whole-goal completion is claimed.

## Organization activation stored namespaces — ordinary implementation (2026-11-12)

Organization activation now inventories exact retained `project:<id>` and current
`work-package:<id>` storage keys against the same current ownership table. Explicit
cleanup selects only known keys whose physical work package is absent. The outer
transaction, exact-key deletes, CLI flag/readiness guards and gateway authority are
unchanged. Complete logical snapshots include schema, every declared table (including
`sqlite_sequence` and the migration ledger), raw transport rows and durable plan history.

Owning TDD used the existing native budgets and no preload. The two literal inventory
cases first failed their ordinary conflict equality assertions (0 pass / 2 fail), then
passed (2 / 0) after the ownership SQL union. The explicit six-orphan preservation case
first failed its rollback-only rehearsal success assertion (0 / 1), then passed (1 / 0)
after the prune selector correction. Three independent unknown spellings and a late
live unmapped owner passed with whole-store rollback (4 / 0). These ordinary bug failures
are not formal R5 observations. The two restored 2026-10-20 historical project quotations
remain historical; their comment-only restoration has identical whole-module emissions.

Final source checks observed:

- Store: from `libs/wbs/adapters/store-sqlite`, `bun test --coverage --coverage-reporter=lcov --timeout=30000 src/organization-reconciliation.db.test.ts src/organization-legacy-activation.db.test.ts`: 35 pass, 0 fail, 61 assertions.
- CLI: from `apps/wbs/be-01`, `bun test --coverage --coverage-reporter=lcov --timeout=10000 src/organization-activation-cli.db.test.ts`: 31 pass, 0 fail, 192 assertions. The pre-existing `setDefaultTimeout(30_000)` remains in force; this is not a newly enforced 10-second per-case budget. The extended pruning case took 10784.89 ms in the final run and passed under that existing source default.
- Gateway: from `apps/wbs/gw-01`, `bun test --coverage --coverage-reporter=lcov --timeout=10000 src/fan-out.integration.test.ts --test-name-pattern '^real gateway refuses (?:project|workPackage) subscribe and resume while current namespace remains readable$'`: 2 pass, 0 fail, 22 assertions; other 8 cases filtered out.
- Strict roots: `bun node_modules/.bin/tsc --build --force libs/wbs/adapters/store-sqlite/tsconfig.json apps/wbs/be-01/tsconfig.json`: exit 0 after final test changes.
- Actual Nx graph: `bun node_modules/nx/dist/bin/nx.js graph --file=/tmp/puni-activation-task1-v1/current2.graph.json`: exit 0, 55 nodes. No graph/workspace/cache/root override remained in the protected runner environment.
- Uncached lint: `bun node_modules/eslint/bin/eslint.js` with exactly the two changed production modules and three changed tests: exit 0 after the fresh graph.
- OpenSpec before this append: `bun node_modules/@fission-ai/openspec/bin/openspec.js validate --all --json`: 343 passed, 0 failed; 787 warnings reported. Final ten-path format and all-OpenSpec checks run after this append and are recorded in the linked task report and immutable native receipts.

The first inventory selector matched no tests because Bun includes the describe prefix;
its receipt is retained without RED credit. The first full CLI run failed only the new
usage assertion's literal terminal prefix under existing `FORCE_COLOR=1`; actual output
was captured, and the final test compares the exact diagnostic after standard terminal
code removal while also requiring the unused WBS path to remain absent. Production CLI
code was not changed. Original failed epochs remain immutable.

Every native phase froze literal argv, source/tool pins and budgets before launch, used
one exclusively created numeric output FD shared by stdout/stderr, immediately observed
the original exit, and settled one memoized awaited owner stop/reap followed by one
parent descriptor close. Original outcomes and cleanup outcomes remain separate.

Full preimages, current hashes, complete ten-file patch, native command packets/receipts,
raw logs, protected-input comparison and self-review are in
`/tmp/puni-activation-task1-v1` and
`.superpowers/sdd/puni-wbs-activation-namespace-plan-v2/task-1-report.md`.
The design preserves the exact later 410-byte runtime-closing suffix; all previous
checkbox states and this verify file's accepted prefix remain exact. The new activation
task stays unchecked. No formal mutant, new Proof comment, staging, commit, push, host
activation, full Nx gate, full gateway target or whole-goal closure is claimed. A separate
non-GO finite recipe proposal awaits root/Astra review before any fault execution.

## Organization activation namespaces — accepted finite proofs and comment closing (2026-11-12)

Root and SAME Astra accepted exactly nine ordered production-path RED/restored-GREEN
pairs in `verification-activation-namespaces.json`. The immutable actual packet is
`f732c1cb2ec503bd086d7e38b983b6bb36043b10f2b97ba51e5e6b9087fb5b99`;
root acceptance is `be9fb75a3d8cc1979c2e9c48866e09ffd75fdfed24eda9f71adc981724df2f99`.
All18 original native receipts independently record RED1/null or restored GREEN0/null,
shared numeric output FD, stopped/reaped owner, closed descriptor, and no primary or
cleanup failure. The direct launcher ran once, exit0; its signal is UNAVAILABLE, not
inferred null. All27 actual source captures restore the exact acquired healthy module.
The54 input observations retain the expected1286 healthy/single-mutant descriptors,
54 known rename absences,36 ambient absences and57-directory/111-migration-folder guard.
The mutant/native lease is closed; there were no retries or STOP overrides.

The exact first-own scopes are bounded. `inventory-retained` and `inventory-current`
fail empty inventory equality at254:35 (RED1/restored GREEN2 assertions,27 filtered).
`prune-project` and `prune-work-package` fail rollback-only rehearsal success/report at
185:39 with their namespace's three orphan keys (RED4/restored GREEN10,6 filtered).
The two `preserve-live-*` recipes first fail that rehearsal's prunedStreams report with
one live key; later physical/live-row assertions are unreached in RED. The three
unknown-prefix widenings first fail the refusal outcome at213:40 (RED2/restored GREEN3,
6 filtered); later whole-store rollback equality is unreached in RED. Restored GREEN
reaches those later assertions. No broader or independent per-field proof is inferred.

Four adjacent comment groups now name the exact nine accepted faults and owning tests.
Both complete Bun module emissions are byte-identical before and after the comments;
the two historical pre-rename quoted blocks remain exact. Runtime tests are not repeated
for this comment-only closing. The compact record retains immutable evidence/review/
acceptance hashes, nine actual rows, eighteen native receipt/transcript identities,
source/emission bridges and explicit limits. Giant private evidence stays outside repo.

Required closing commands are the forced SQLite strict root, uncached ESLint on the two
annotated modules using the freshly readable genuine cached graph's exact
`wbs-store-sqlite` key/root with no errors, Prettier on the exact five closing paths and
`openspec validate --all --json`. Actual closing command receipts, failures/warnings,
final prefix/checkbox/unchanged-file checks and whole emission archives are retained in
`/tmp/puni-activation-closing-v1/closing-report.md` and its closing packet. The activation
checkbox changes only after those required checks pass; all other checkbox lines and
parent obligations remain unchanged. No further mutant, native test, behavior, spec,
design, runbook, Git/index, commit, push, host or whole-goal change is authorized here.

Closing check observations: forced SQLite strict `bun node_modules/.bin/tsc --build --force libs/wbs/adapters/store-sqlite/tsconfig.json`, uncached two-module ESLint, exact five-path Prettier and all OpenSpec each recorded original0/null with clean owned settlement. OpenSpec reported343 passed/0failed and787WARNING. The exact activation checkbox on line386 was then changed from unchecked to checked; every other task line remains byte-identical. The final metadata-format/OpenSpec receipts and final closing review are separate closing artifacts. The parent obligations and whole goal remain open.

## Invitation audit and initial-role repair — 2026-11-12

The inline invitation stamp now satisfies the unchanged source scanner. The initial-role reader again expects project kind for project-contributor/project-viewer while granting at organization scope; this is a separately archived E12 existing-spec semantic repair. Ordinary successor checks passed 103 tests / 383 assertions, both scoped typecheck roots, lint and format. Earlier failures remain archived.

The actual audit omission failed its first scanner missing-list equality at audit.test.ts:315:21 and restored GREEN passed. Omitting only the strict stored-kind guard failed the actual invitation test at readRejection’s Error-rejection contract (1196:11, caller400:19); root and SAME manually accepted that narrow first-own evidence. The automated kind row and flight remain STOP because the frozen renderer expected a cause line and different helper column. RED had no expect footer (null/absent), no cause value or resolution claim, no later message/HTTP/no-offer assertion credit, and no completed mutant post-native freeze. Exact restoration and all four original native settlements were independently accepted. No retry or grammar change occurred.

[Compact evidence](verification-invitation-audit-initial-role.json) pins ordinary and actual packets, source epochs, original receipts/raw logs, SAME review and root acceptance. Adjacent Proof notes preserve historical blocks; the audit note is outside the scanned insert statement. Closing source comments preserve whole-file Bun emissions and the actual audited statement. Runtime/fault tests are not repeated for emitted-identical comments.

Closing commands: forced SQLite tsc build; uncached ESLint for the two affected TypeScript files with the genuine current project graph; exact four-file Prettier check; openspec validate --all --json. Closing command outcomes, raw receipts, whole emissions, full patch and prefix preservation evidence: /tmp/puni-audit-role-closing-v1/packet.json. Task checkboxes and parents remain unchanged; the whole goal stays ACTIVE.

### Shared snapshot membership fixture repair (2026-11-12)

The after-admission snapshot case no longer treats the compatibility membership role label as authority. Its original focused run failed (expected 500, received 200); the repaired case renames the selected membership identity column and observes the real SQL failure as HTTP 500. A separate control changes the compatibility label to owner, confirms that the hook ran and the stored label changed, and still receives the correct schedule. Production readers and authorization checks are unchanged; this does not claim catalogue enforcement in the snapshot or close permissions 3.2.

After the required import ordering, the focused shared-snapshot authorization group passed: 8 pass, 0 fail, 13 expectations, 66 filtered, with each test retaining its 10-second budget. The configured backend native TypeScript build, targeted ESLint autofix/check and Prettier check passed. Deliberate corrupt-state cases retain their expected error diagnostics. The first compiler launch used an absent legacy package path; the subsequent configured native compiler command passed. The whole controller target and host gate were not run for this fixture-only change. No new production R5 proof or parent task closure is claimed. Private execution record: /tmp/puni-root-snapshot-membership-fixture-accepted-v1.json, SHA c3e643f17e77231ad929e4e519a8bffbeca3072a73e33e6e85bd442aa096469a.

### Current smoke work-package protocol repair (2026-11-12)

The current authenticated-read smoke now calls /api/work-packages and requires the workPackages collection. The backend-hop smoke sends the work-package: namespace in both forward and resume envelopes, matching the current gateway shape and access-unavailable wording. Updated contract tests first failed on both old protocol callers (0 pass, 2 fail, 3 expectations, 22 filtered); after repair both complete test files passed (24 pass, 0 fail, 39 expectations) with their existing 10-second test budgets. The exact sent envelopes are asserted.

The configured smoke TypeScript build, targeted four-file lint and formatting passed. Required formatting and a test-only unknown JSON boundary have whole-module emitted-JavaScript equality against the passing source. Existing authority predicates, credential minting, socket ownership, drain/deadlines and dated historical Proof records are unchanged; this is no new safety-guard proof. These controlled fetch/socket tests do not certify real deployed authentication, gateway/backend/Caddy reachability, a live host, installed PUNI embedding or parent completion. The accepted frontend capsule retains its earlier capture epoch. Private execution record: /tmp/puni-root-smoke-work-package-repair-accepted-v1.json, SHA b9b2b5d0ca57007a65d6826a6348e2092a291e3352ea62563ec7914b079a1445.

### Current Kubernetes work-package smoke caller — 2026-11-12

- Scope: generated smoke Job now reads /api/work-packages; anonymousProjectsStatus→anonymousWorkPackagesStatus and EXPECT_ANONYMOUS_PROJECTS→EXPECT_ANONYMOUS_WORK_PACKAGES through all12current first-party callers. Only these identifiers and two execute.ts route/JSDoc literals changed in existing sources; no lab create/schema/rollback or retry/auth/status guard change. Existing dated Proof groups remain byte-identical.
- New smoke-script.test.ts evaluates the actual smokeJob-generated command/env using node:vm and real controlled loopback HTTP. Both local200/OIDC401 pass; missing current endpoint is refused despite obsolete-route200, and OIDC401 expectation rejects200. Sleep and process-exit are explicit adapters, so this is in-process generated-JS behavior, not a native Kubernetes Job or host result. Retry cases observe15attempts/2000ms requested sleeps without physical30second waits.
- Qualified RED: bun test tools/tool-deploy/src/k8s/smoke-script.test.ts, original1/null,0pass4fail on actual old-route behavior. Initial sandbox EPERM/listen and the prepatch run after EROFS are preserved and excluded. Successful source edit was verified against all12exact expected bodies before GREEN.
- GREEN: bun test tools/tool-deploy/src/k8s/smoke-script.test.ts tools/tool-deploy/src/k8s/deploy-k3s.test.ts tools/tool-deploy/src/k8s/cutover-cli.test.ts, original0/null,40pass0fail. Final test harness satisfies typed lint without disables; its last formatter pass did not change bytes.
- Configured typecheck: bun node_modules/.bin/tsc --build --force tools/tool-deploy/tsconfig.json, original0/null, empty diagnostics; target resolves @typescript/native. Earlier directtypescript/bin/tsc6 checks were supplementary and are not configured-target credit.
- Targeted ESLint and Prettier --check on all13changed/new paths: original0/null; logs/receipts retain exact argv and clean protected-owner/descriptor settlement. No host/fullgate/new formalR5fault claim.
- Private source preimages/after bodies/diff, all actual commands/logs/receipts and excluded failures: /tmp/puni-k8s-work-package-smoke-v1/evidence.json. This slice left verify.md unchanged at61016bytes/137105df0036c4a8276254ca0de0403092228e93aa0294df0f5d1990ce906e16 for root append.

Root accepted this bounded source/verification epoch in /tmp/puni-root-k8s-smoke-accepted-v1.json (SHA f2e082652a7727297922ebb8737730c86549564ebf44e7e8feabaae9a64201a6). The 40 passing tests made 74 expectations; no parent task checkbox changes follow.

### Engagement-kind spans and assignment scenario IDs — ordinary verification, 2026-11-12

- Added only three exact path/declaration/member protections: typed appendGrantAudit scopeId parent, readInitialRolePermissionsIn catalogue-kind fallback, listMembers response members/effectiveRole/via/scopeKind token. All three actual source witnesses remain byte-identical. Neighboring legacy fields/prose remain renameable; missing/duplicate/malformed/wrong ownership refuses. Shared character spans still feed actual apply/check and collision interpretation.
- Replaced PROJECT-ASSIGNMENT-READS whole-line exemption with closed001/002/003 token intervals. Current003title now says requested work package; old historical Proof accounts remain literal. Unallocated/lookalike IDs have no protected interval, even though the unchanged uppercase-hyphen spelling rule may independently retain their rendered bytes. Positive interval+adjacent-negative controls qualify this distinction.
- Qualified ordinary REDs before implementation:34then36cases failed on own missing-protection/whole-line behavior. Final ordinary GREEN90cases/323expects across4files;21existingrespelling/new-sense witnesses; actual current003core scenario1pass/127filtered under10000ms. Disposable apply/check roots use ordinary existing Git fixture contract, never AF5E metadata writes.
- Configured bun node_modules/.bin/tsc --build --force tools/tool-rename-work-package/tsconfig.json passed; targeted ESLint/Prettier7paths passed. Genuine AF5E graph, NX_DAEMON=false/NX_ISOLATE_PLUGINS=false; no graph/cache/root override/reset. Original static/expectation failures remain in private evidence, not final-pass credit.
- Additional root-authorized solver test-only repair: actual full fixed.push projectId:workPackageId anchor exactlyonce, unchanged-current positive, derived shorthand fixture differs, required preexisting diagnostic observed. Production solver/protection functions and frozen producer were not changed. Core title's required import ordering has exact binding/body correspondence apart from intended title text.
- Complete preimages/after bodies/diffs, original receipts/logs and finite PROPOSED R5 inventory/probes: /tmp/puni-engagement-protection-v1/final-v2/evidence-final.json. No formal source fault or new Proof comment has run. Independent Astra/root source/API and finite plan review is required before any R5 authorization. Existing verify.md63590/368009... was left untouched for root append.

### Ordinary current cutover SQLite report repair — 2026-11-12

Current SQLITE_REPORT_SCRIPT reads work_package names; --known diagnostics use work-package names. The real-migrations fixture seeds required users/organization and current work_package ownership; current synthetic cutover-replay and first-start fixtures use work_package without changing their replay/version/image/descriptor or historical activation-ledger identities. Dynamic all-table counts and generic historical report keys remain unchanged.

Ordinary RED: the valid current-migrations fixture reached the actual report and failed SQLiteError no such table: project; the actual CLI returned old project-name wording (0pass2fail1expect). The stale first-start synthetic positive control independently failed expected0/received1 before its table spelling was repaired. No new guard/mutant/Proof was added.

Final affected tools command (cwd tools/tool-deploy): bun test --preload ../test/scratch/preload.ts --timeout=10000 src/k8s/cutover.test.ts src/k8s/cutover-cli.test.ts src/k8s/cutover-replay.test.ts src/k8s/first-start-adapter.test.ts — actual0,126pass0fail295expects. Existing explicit60s integration-case budget retained. Configured native tool-deploy TypeScript via genuine Nx/default graph/cache paths passed uncached; targeted six-file uncached ESLint and Prettier check passed.

All historical Proof groups and original CLI generic count/replay controls are byte-equal; no safety-condition/schema/ledger/hash inference or rewrite. Evidence/report/complete six-file patch: /tmp/puni-af5e-cutover-report-repair-v1. This is ordinary precise-spec caller/fixture repair, not a new R5 guard certificate or deployment/lab/whole-goal completion.

### Current-image native lab work-package callers and SQLite evidence — ordinary verification

- Scope: `tools/tool-deploy/src/k8s/{lab.ts,lab-migration.test.ts,backup-lab.ts,cutover-rehearsal.ts}` only. Current API calls use `/api/work-packages`; lab evidence reads `work_package ORDER BY id` into `workPackages`, with the existing exact full-row comparison. Export count uses `work_package`. AUTH_MODE=local, Compose PROJECT ownership, guard predicates, limits and all 20 historical Proof groups are preserved.
- Ordinary TDD RED: configured `bun test --preload ../test/scratch/preload.ts --timeout=10000 src/k8s/lab-migration.test.ts` from tools/tool-deploy returned original 1/null (7 pass/6 fail). The exported actual old script selected a distinct project-table decoy; current sentinel negatives were wrongly accepted by the old projects-only comparator. Only the export/JSDoc test seam preceded this RED. No missing-export/setup or formal source-fault credit.
- Final GREEN: the same configured test command targeting lab-migration, lab-diagnostics, lab-registry, backup-lab and mcp-manifest returned original 0/null (48 pass, 122 expectations). The exported script runs in-process through node:vm against real owned Bun SQLite with exact test-only fixed-path mapping; complete columns, name/hash ledger, tables and sorted current sentinels are checked. Missing/replaced/name-changed/reordered sentinels are refused; unmodified evidence is accepted. Existing local TLS/loopback fixtures are controlled tests, not real infrastructure.
- Final configured `bun x --no-install tsc --build --force tools/tool-deploy/tsconfig.json`, normal targeted ESLint on the four files and Prettier --check returned original 0/null. Initial lint's three test-only diagnostics are preserved; exact corrections and final reruns are recorded separately. No graph/root/cache override or new Proof comment.
- Full source/preimages, 14 original native receipts/raw logs, literal commands/environments/deadlines, exact production-body reconstruction and unchanged frozen-seven/verify pins: `/tmp/puni-current-labs-v1/evidence.json`; readable report and full patch are adjacent. All receipts settled with null signal and clean owner/FD closure; the four private diffs' original 1 means differences as required by diff's contract.
- Not run: real Docker/k3d/native lab/rehearsal, host activation, full gate, install, external registry/dependency acquisition or frontend producer. This is ordinary current-contract repair verification, not a new R5 source mutation claim.

### Live module inventory and stable identities — ordinary repair, 2026-11-12

- Updated31 current mapping path values, two display names and two current boundary selectors; retained all stable module/boundary IDs, predecessors, sourceRevision/sourceSelector, original baseline tuples and attestations. Both current README IDs now agree with their registrations. The DI label follows the current directory, application.work-package; the existing test carries exactly two stable-identity expectations while preserving current labels, singleton/reverse ownership, UNSEALED and shim checks. The pilot fixture roster changes only its two current README paths.
- Test-first source reproduced3pass/3fail/8expects naming the actual label, README IDs and selectors; restored ordinary labels6/0/9, frontend graph11/0/11 and core module acquisition/behavior7/0/9. Configured forced core and tool-devsync strict roots passed0/null; targeted3TS lint and7file format passed0/null. Initial core2/null consisted only4403 TS5033 read-only-output errors; the writable-context run passed. Initial policy-format refusal and its correction remain distinct tool observations.
- SAME Astra source/evidence review and root acceptance: /tmp/puni-root-live-inventory-accepted-v1.json. All58 historical Proof groups are byte-identical; no formal source fault/new Proof or trust activation. The partial pilot fixture cannot qualify a broad dirty rename; complete-candidate pilot integration, actual working index check, exact residual-ID protection and full gates remain open. No parent task is closed.

### Current repair evidence and remaining boundaries — 2026-11-12

- Root acceptance records are /tmp/puni-root-cutover-report-accepted-v1.json (six report/fixture paths), /tmp/puni-root-current-labs-accepted-v1.json (four lab paths), and /tmp/puni-root-live-inventory-accepted-v1.json (seven inventory paths). Each retains the actual commands, complete source correspondence, original failures and bounded GREEN results. The cutover tool transport supplies no original signal field; those signals remain unavailable rather than inferred null. Its scratch return trace proves its preload contract only. The lab/inventory protected-native receipts retain their own actual outcomes and cleanup scope; these are separate executions.
- SAME Astra reviewed the three new engagement protections: source/API clear in /tmp/puni-engagement-protection-astra-review.md; the finite fault proposal is not execution-ready. More exact ordinary ownership/diagnostic/raw-spelling negatives and literal execution bindings are required before source mutants. Decoded TypeScript string text and raw token spelling differ; the raw-token check is necessary. The earlier90-test epoch remains historical; root separately authorized a test-only successor to engagement-protection.test.ts. No formal source fault, new Proof or parent closure follows from this ordinary repair.
- Current smoke documentation and UI/test comments use work-package terms. Three TypeScript/TSX modules emit identical complete Bun JavaScript before/after; four-file formatting passed. Two historical endpoint descriptions remain literal. Evidence: /tmp/puni-root-current-wording-repair-v2/evidence.json. Three stale current kind-inventory paths now name actual work-package services; all56 inventory targets are regular current files and one-file formatting passed. All other kind-inventory fields are unchanged. Evidence: /tmp/puni-root-kind-paths-v1/evidence.json. Runtime tests were skipped for these comment/document-only edits; selected-candidate F1/index checks remain open.
- Full tracked/untracked residual and collision coverage, coherent candidate/index/pilot integration, full targets and host gates, installed frontend producer, real infrastructure rehearsals and activation remain open. The credential-bearing frontend setup and elevated C35 formal CLI fault sequence remain rejected before process creation, with their separate direct-user approval requests pending. The old b0d2df4 push/PR917 approval has already been fulfilled and does not authorize either blocked workflow. No P2/main/poller activation before permissions6.4 writer quiescence and old authorization HTTP/WebSocket retirement with read continuity.

### Current wording, projection names and protection prerequisites — 2026-11-12

- The kinds inventory received 21 current WBS wording corrections across 17 entries. Its 56 source paths, identities, kinds and review date were preserved. The docs-only epoch passed targeted Prettier; no runtime test was needed. Exact patch and correspondence: /tmp/puni-kinds-current-wording-v1/evidence.json. That immutable epoch precedes the following source rename.
- The connected display projection is now deriveConnectedOptimizationView; its declaration, import, call, inventory reference and leading JSDoc agree. Its function body and signatures remained exact; emitted JavaScript is equal after the required identifier substitution. Existing two-file core tests passed 99 tests/470 expectations; configured native core TypeScript and targeted ESLint/Prettier passed. Evidence: /tmp/puni-connected-view-name-v1/evidence.json.
- Saved comparison's private projection is now deriveComparisonSide, with a Summarize JSDoc. Three test-title literals now say presents, expanding to four executed names through the existing hold/step table. Bodies, assertions, case order and five historical Proof groups were preserved. A separately observed baseline formatting failure justified newline-only formatting; emitted JavaScript remained identical across that formatter step. Existing four-file core tests passed 135 tests/860 expectations; configured native core TypeScript and targeted Prettier passed. These totals include the preceding 99 cases and must not be summed. Evidence: /tmp/puni-comparison-projection-name-v1/evidence.json.
- Comparison lint remains unresolved: @typescript-eslint/no-unnecessary-condition on the unchanged schemaVersion clause. The actual original source, supplied through the genuine stdin filename/configuration, produced the identical lint diagnostic. Astra traced validated producers and recommended removing only the redundant version clause; automatic approval review rejected the edit before mutation. A direct user approval request is pending. The complete clause remains in production; no alternative write or changed-code GREEN occurred. Separate unchanged-source stored-codec controls passed 7 tests/57 expectations, and versioned-reader controls passed 20 tests/102 expectations, including future-version refusal. Evidence: /tmp/puni-comparison-redundant-version-v1/evidence.json; review: /tmp/puni-saved-comparison-lint-semantics-astra-review.md.
- Engagement protection retains the parsed factory/call/exactly-one-argument guard and uses its established argument-zero invariant. Sixteen natural-source negatives and an exact raw interval positive are present. Current ordinary four-file tests passed 107 tests/411 expectations; witness tests passed 21/22 and core scenario 003 passed 1/2 separately. Configured native renamer TypeScript and targeted lint/format passed. Twenty-six selected ordinary commands covered 29 named cases/123 expectations; these are selection observations, not additional full-target or R5 totals. Evidence: /tmp/puni-engagement-protection-readiness-v1/manifest.json.
- Astra cleared that source/API and the finite semantic plan. Root independently checked 118 readiness pins, five directory memberships, 19 guard spans, and reconstructed/transpiled 25 literal proposals and their owning assertion spans. No candidate was written or executed; no new Proof credit exists. Formal harness/context/classifier preparation remains separate. Review: /tmp/puni-engagement-protection-readiness-astra-review.md; root check: /tmp/puni-root-current-protection-and-comparison-accepted-v1.json.

These are bounded ordinary observations. Native receipt outcomes and transport limitations remain in their exact packets; no full Nx gate, F1/index/full residual, frontend producer, deployment, or whole-goal completion is claimed. The separately rejected C35 fault workflow and frontend setup remain pending direct approval. Parent task checkboxes remain open.

### Projection comment corrections

Five comment/JSDoc verb corrections repair mechanical uses such as “then work package” without changing test names, assertions, guards or historical Proof text. Whole Bun-emitted JavaScript is byte-identical for every file; targeted Prettier passed. Runtime tests were unnecessary and not run for these comment-only changes. Exact preimages, final hashes and emission correspondence: /tmp/puni-root-projection-comments-v1/evidence.json; format observation: checks.json beside it. This is not a full wording/residual sweep or task completion.

### Engagement-project migration increment — ordinary SQL verification

Added paired add_project and widen_organization_audit_projects migrations under the exact reserved names, with two owning database test files. From the explicitly renamed-store baseline, populated organizations receive one ordinary Migrated work packages project; empty organizations receive none. Work packages acquire mandatory parents and creators, preserving existing creators and filling only missing creators from historical owners. Existing rows, columns/defaults, historical CHECK labels, grants, abbreviations and schema objects are preserved apart from the intended removed owner column/FK. Same-organization checks cover both insertion orders, the legacy bridge, package reassignment and parent-organization updates. Audit vocabulary expands while preserving rows, indexes and append-only behavior. Both down scripts refuse snapshot-only rollback.

Sealed ordinary predecessor: /tmp/puni-engagement-project-migration-v1/sealed-v2/evidence.json (c159eeffb8133f79f2ceb8c57d11b6dda9743a3d4e1e51024431dd33c0d95649). Its 11 tests/76 expectations, configured TypeScript, targeted lint/format and four SQL lint checks passed; failed development epochs remain preserved. Root inspected all six source files and independently checked 182 pin visits, 28 original native receipt settlements and six new-file patch reconstructions (/tmp/puni-root-project-migration-ordinary-inspected-v1.json). Astra cleared the bounded SQL/source increment: /tmp/puni-engagement-project-migration-astra-review.md (382103519f8bef78f13a05bd92dc5e13a434b34e94bd787feb8c45d66208eb14).

Astra's audit-only FK readiness gap was addressed in a test-only successor: complete add_project first, then introduce invalid audit ownership and run only the audit widening. Refusal preserves complete schema, all table rows and the ledger, independently of add_project's FK check. Direct `bun test --timeout=30000 src/add-project.db.test.ts src/widen-organization-audit-projects.db.test.ts` from the SQLite adapter passed 12 tests/79 expectations; raw output /tmp/puni-project-migration-audit-fk-successor-v1.log. Configured writable SQLite TypeScript and targeted lint passed. Formatter changed no emitted JavaScript. Tool transport exposes no native signal/global descendant evidence for this direct successor; the predecessor's owned receipts retain their own exact observations.

Current schema/store/API ownership declarations and canonical input12 are still unintegrated with the new SQL. No full bootstrap, store conformance, full Nx gate, formal omission, new Proof, deployment or activation is claimed. The proposed R5 boundary inventory is not an executable finite plan. Task3.1 and the complete project increment remain open.

### Memory rename fixture repair — configured full target

Six test/conformance files now use current workPackages inventory keys, current runtime receipt/acceptance2 fixtures, the workPackage case label, work-package subscription namespace, actual dependency diagnostic and current export version13. Historical document11 remains the import input. Signed complete conformance failure records retain every existing field and value in current sort order; one event record now also asserts its complete step/user/work-item metadata. Historical Proof comments and all three frozen runtime production/history files compare exact. The read1|2 union, ledger1, legacy insertion refusals and raw receipt identities are unchanged.

The actual configured command NX_DAEMON=false NX_ISOLATE_PLUGINS=false bun x --no-install nx run wbs-store-memory:test --skip-nx-cache passed274 tests/0fail/7167expectations across16files, with configured coverage and10000ms per-case timeout. Raw output: /tmp/puni-memory-fixture-full-target-v2.log. Its predecessor failed273/1 because a shared contract still expected exported version11; only that expected output literal changed to13. Authored input11, budgets, trios, factor and export equality assertions remain exact. Earlier four-file87/728 and conformance84/5999 results overlap the complete target and are not summed.

Configured memory TypeScript passed before the final test-only expected literal correction. Final six-file uncached ESLint and Prettier checks passed. Exact six preimages/current hashes, read-only patch, frozen-runtime correspondence and raw logs: /tmp/puni-root-memory-and-poller-ordinary-v1/memory.json (dbb39a22dcfdc0dc02c4e3ac5efdd681714d18682fbd87fe5a3ff5637b3ccb62). Earlier setup, compile, formatter/import-order and stale rendering failures remain recorded in /tmp/puni-memory-fixture-repair-v1; none is represented as a passing epoch. Transport does not expose original native signals or global descendant absence.

These are fixture repairs and ordinary configured-target observations. No production safety check, new Proof, formal omission, full-workspace gate, deployment or parent-task completion follows.

### Engagement protection unchanged health and execution refusal

The reviewed V2 unchanged-source health ran24 owned selected commands covering26cases/111expectations. Every original actor exited0 with its recorded null signal, exactly one scoped stop and shared-FD close, and empty owned scratch before/after. Root independently checked79 artifact pins and26 memberships: /tmp/puni-engagement-protection-healthy-context-accepted-v2.json (b291260db7fe935321133da886e749f075f193cf9aac141026fabe00089b7828). Its original source FD was opened, verified and closed without writing. This does not demonstrate source restoration, global process absence or future actor termination.

The separately reviewed25-case formal driver was rejected by automatic approval review before CreateProcess. Only its FS-only prestart completed; no actor, recipe, source mutation or formal RED/GREEN ran. Source and test hashes/modes remain exact; flight contains only prestart.json and empty scratch: /tmp/puni-protection-formal-execution-refusal-v2/evidence.json. Direct user approval is pending, and the exclusive lease remains active. No new Proof or task closure was added.

### Engagement-project administration — initial owner and row-decoder successor

The project-only ProjectStore now creates, finds and lists engagement projects independently of borrowed PlanTransactionalStores. Its explicit human creation act retains identities and instant before queueing. One immediate SQLite owner writes project, creator project-manager grant with creation origin, project_created and access_granted, rolling back modeled grant refusals before returning them. Exact organization/name collision checks run inside that turn; unknown storage failures throw. The stateful memory twin stages the corresponding actual rows before publication. Shared conformance checks grant/audit atomicity, same-organization names, ordering and creator access loss after membership removal. Public adapter tests passed20/78 SQLite and16/54 memory in the initial14-file epoch; configured core/conformance/SQLite TypeScript and targeted14-file lint/format passed. The memory compiler's then-existing13 fixture diagnostics were repaired separately; the later full memory target above is its own epoch.

Initial sealed increment: /tmp/puni-project-store-first-slice-v1/evidence.json (d803db0b673a06d693f8d7762a79d6b9f17d0362facdb164386820eda2100b68). Its actual implementation review found SQLite's non-STRICT values could escape Drizzle's declared number/string types. The two-file F1 successor adds a local seven-field unknown-valued row decoder to find/list after organization filtering and INSERT RETURNING inside the same owner. Revision requires a nonnegative safe integer; timestamps allow signed safe integers and migrated creator/update metadata stays nullable. No coercion, default, arbitrary epoch restriction or creator-based authority was added.

Real SQL text/fractional/unsafe values, negative revisions and BLOB names produced22 own expected-Error assertion failures, with2 scope/historical positives. Final owning SQL tests passed44/0/170, including all original20 cases, under the unchanged30000ms budget. Configured SQLite TypeScript, targeted two-file lint and format passed. Nine saved original receipts retain their actual exits/signals and owned cleanup. Production formatter emission stayed exact; the test emission's object wrapping changed and is not claimed identical. Other12 predecessor source paths stayed exact. Root inspected the full patch/decoder and rechecked actual live/snapshot hashes and original receipt correspondence: /tmp/puni-root-memory-and-poller-ordinary-v1/project-store.json (3827becd53e14317066dd4aefaa0d63a7bb5690bcd125447df91aadd73c9c8d3). Successor f8cc18fa835baabe72fe91f678f85f25a0e6bef11fd4a4a7e5274820153a4748 and bounded SAME review /tmp/puni-project-store-row-decoder-astra-v1.md (4c517a5993f67682f69668cc8576f9b07f901f2581d84f3e9ad625b310eb7414) preserve all earlier failed epochs and limits.

The original plan50bd and implementation reviewea710 are separate identities; their publication-path collision was recovered byte-exact and recorded at /tmp/puni-project-store-review-artifact-recovery-v1.json. No prior packet is silently repinned. Remaining decoder negatives for identity/creator/empty-string arms, independently attributable RETURNING rollback and finite R5 plans remain open. No new Proof, combined first package, project rename/delete/move/count API, package-parent/owner/current-input12 integration, full gate or deployment follows. Task3.2 stays unchecked.

### Published-owner and parent-provenance contract correction

Actual published document13/14 responses include ownerId, contrary to E40's earlier no-owner sentence. The design, ordered tasks and delta spec now require their complete independent historical schema closure before ownerless ordinary15/connected16. New full exports require workPackage.projectId and informational project.id/name from one scoped capture, with matching identities. Writable imports may omit read-only metadata; their outer projectId selects the destination. Explicit13/14 classifier support remains when current constants advance; connected12/14/16 remain distinct.

Fresh saved input12 requires a captured nonempty parent and excludes owner/creator audit metadata. Older1–11 reads retain unrecorded parent provenance after original byte/hash/header/schedule-link validation; they cannot become fabricated raw12 or obtain parent/creator from current rows. The internal comparison view retains only actually captured retired owners, compares owner only on both sides and parent only when both recorded it, and preserves independent pre10 dependency uncertainty and every other authored fact. Two review refinements explicitly preserve other differences and require both saved captures to exist before live parent/creator deletion.

Astra design350b31bd5e215220753fb53eb8c037b65e366a59e7e391369d68ef716a63c9ec and adoption review7782f94d7b92c0d5676143e39021d2a6420802b70c99f3816d883866c86b448f are retained at /tmp/puni-parent-owner-input12-astra-design-v1.md and /tmp/puni-parent-owner-contract-adoption-astra-v1.md. Final three-file hashes, exact refinement correspondence, format0 and valid OpenSpec result are /tmp/puni-parent-owner-contract-adoption-v1/final.json (20facde4356b2d6c7e07c8ff69bbfde931b0705db349734cb6607b8f9dcdbb7e). Validation has15 long-requirement warnings and no errors; those warnings are not hidden. This records a normative correction, not the future12/15/16 implementation or consumer readiness; all relevant task checkboxes remain unchanged.

### Published input11 and document13/14 dependency freeze

Eight files now keep the actual published owner-bearing13/14 response closure and strict input11 grammar/semantics independent of mutable current package/canonical definitions. Current producer versions remain11/13/14. Existing current exports actively call the historical factories; no unused response graph is eagerly constructed. The input reader retains original declared-version checks, frozen through10 decoding/explicit rename upgrade and original semantic validation order. Writable request versus full additive response policy stays unchanged. No parent or creator interpretation is added.

Final affected direct tests passed277/0/743 across12files; contracts boot measured384MB below its existing500MB bound. Configured domain/contracts TypeScript, targeted8-file lint and format passed. Source-free preimage/current comparison retains all30 public document exports,15 schema/wrapper descriptors,4282 identical freshly constructed input11 bytes and4 exact public error contracts. Original document11/12 and input9/10 repository captures remain exact; new11/13/14 controls are explicitly constructed current-epoch fixtures, not authenticated historical release captures. Initial missing-module RED and lint failures remain recorded with no behavioral/R5 credit.

Packet /tmp/puni-historical-shape-freeze-v1/manifest.json (1f9ce7c82888864d4f7b5c662286d99476ffb098ad623b968636817b759e63a3), complete patch c54f59988f8cec2b7d9738589843d82614dccb0078e40304d75869741dec3cee. Astra source/API review /tmp/puni-historical-shape-freeze-astra-v1.md (cdba1ab007d50af9e3d838b95606a48e1d43f0b1c4bf3dc448d03c5169b26c2d) reconstructs all8 patches. Its JSON supplements the packet's incomplete31-entry historical-comment map with all65 matching complete Proof groups:64 archived origins and1 current-observed former scalar helper. Those retain their old epochs; no new physical-fault proof is claimed. The separate provenance-v2 correction preserves the original packet. Root checked all74 packet artifacts and8 live pins; /tmp/puni-root-memory-and-poller-ordinary-v1/historical-freeze.json records bounded acceptance. Signals/native owner/FD settlement remain unavailable for this command transport.

Future12/15/16 must still capture real parents, preserve explicit13/14 classifier support and connected12/14/16 selection, validate original hashes before comparison projection, update all consumers and keep historical parent provenance unrecorded. No whole target/gate, current parent/creator integration, formal omission, new Proof or task3.4/3.5 completion follows.

### Project counts, rename and deletion — reviewed administration successor

Seven source owners now derive actual project summary counts and one-observation detail entries, rename with revision/update stamp and audit, and delete only empty projects. Deletion removes only that exact organization's direct grants at the project scope, records actual cascade revokes plus project_deleted, and checks CP14 in the same owner, including zero-grant cascades. Only LastSuperAdmin becomes last_super_admin after rollback; unknown/aggregate errors propagate. Memory stages actual child/grant/audit state before publication. Raw all-child administration facts are internal, not an authorized public read projection.

Final SQLite owning tests63/0/279 with30000ms per-case budget; genuine configured Nx memory target292/0/7264 across16files with coverage/10000ms/cache skipped. Four sequential configured core/conformance/SQLite/memory compilers and targeted7-file lint/format passed. These are separate final epochs from older63/1/277 SQL and293/7265 memory. The unsupported absent-audit-actor-FK assumption was corrected by removing the newly introduced memory-only lookup/test, preserving actual creation FKs, act grammar and CP14, and strengthening real-user retained cascade actor/time/origin assertions. No SQL account lookup was invented as authorization. Earlier count-correlation, fixture-role, availability and lint failures remain retained.

Packet /tmp/puni-project-store-administration-v1/evidence.json (4ca246ac956143f414f4a9aa950a6106b416787a0a703f146a72420a598eeaf4); bounded SAME review /tmp/puni-project-store-administration-astra-v1.md (347ebed6a2bac8a3ea4256df3e813fd67c8b04977d2d4d547b5cbf49389b75d5) and separate final-compiler addendum preserve the original report epoch. Root read the report, review and full SQLite implementation, rechecked107 artifact pins,7 live/snapshot pairs and31 original native receipts: /tmp/puni-root-current-admin-settings-owner-v1/project.json. Final receipts report original0/null and clean owned settlement. All38 historical Proof groups and complete Project/retainProjectCreation/F1 decoder declarations remain exact. No new Proof or formal omission was executed.

Fresh authenticated current-context/permission admission inside the eventual project write owner remains required; a retained user-shaped audit act proves no authority. Public shell/readable projections, combined creation, moves, parent/owner/input12 and actual package-adapter compatibility remain open. E16/task3.2/3.3 now explicitly retain existing CP14 rollback semantics for project deletion. No HTTP/activation/full-gate/task3.2 closure follows.

### Pure settings catalogue and captured resolution — ordinary offline increment

Four new domain files define the five-key catalogue and typed pure resolver over one captured ScopeChain snapshot. Nearest values validate all supplied raw rows before choosing a winner, including otherwise masked corrupt ancestors, illegal levels, duplicate scope/key and unknown/additive keys. Explicit empty allowed-type sets win. PERT retains existing nonnegative coefficients with finite positive sum; defaults/overrides/provenance detach. Calendar point values add across all real chain levels, preserve equal payloads with distinct IDs, reject duplicate global IDs and sort by date/createdAt/UTF8-binary ID, with one provenance per point.

Final direct tests50/0/326 across2files include200 generated nearest cases inside one test, not200 named tests. Configured domain TypeScript, targeted4 lint and format exited0 as directly observed by Root; command chunks/exits/logs are /tmp/puni-settings-catalogue-root-v1/commands.json. Source packet /tmp/puni-settings-catalogue-root-v1/evidence.json (59bc2aa712394b33ebe764004208c15aac5719de24f4aeb94c428481f880843a), source review /tmp/puni-settings-catalogue-astra-review-v1.md (e129df862bbe99ed7e5cf36804851b48de31d2b28818619da0a082f4256c4163). Compiler/lint empty logs alone are not exit evidence; actual Root tool outcomes are retained. Native signals/owner/FD evidence remain unavailable. Initial missing-module0/2/2 is setup only; earlier48/312 and one import-sort lint failure remain separate.

The three minor notation/grammar nits were fixed without changing source: keyed settingCatalogue, third snapshot argument and core-owned capture/domain-pure composition. The space/PERT refusal scenario now supplies a valid object, and E18 preserves existing zero components. Final four-artifact Prettier and targeted OpenSpec validation passed, with15 long-requirement warnings and no errors. The requested key/chain/scope are typed admitted inputs; the future core capture must establish entity existence, same organization, coherence and authority. Public barrel/current consumers, persistence/migrations/clear writes, type checks/fanout, settings endpoints and saved input13 remain unwired. No new Proof, task4.1 prerequisite/watched-fault closure or deployment readiness.

### Settings public exports

The public domain barrel now exports settingCatalogue and resolveSetting; the preceding four source bodies remain exact. Its two observed baseline export-sort errors and formatting failure justified mandatory sort/format on that touched file. All390 existing runtime bindings remain identical in the current-origin source-free preimage comparison, with exactly2 additions, and all107 comment groups are preserved. Initialization order changes are explicit; no whole emitted-JS or archived binary equality is claimed.

Existing settings plus contracts boot tests passed52/0/333 across3files, including the preceding50settings cases; these totals overlap. Contracts load measured386MB below500MB. Configured domain/contracts compiler roots and targeted barrel lint/format passed. Exact preimages, source hash and actual command outcomes: /tmp/puni-settings-public-exports-v1/evidence.json. Public exports complete only this library step; admitted entity capture, settings storage/API/migration/fanout and task4.1 proof/prerequisite obligations remain open.

### Package creator-grant prerequisite ordinary evidence

The scoped package creator-grant prerequisite and its25-file integration/quality evidence are recorded in [the permissions verification ledger](../wbs-permissions/verify.md#scoped-package-creation-retained-creator-grants-and-atomic-audit-prerequisite). This is explicit pre-parent SQL/backend evidence; mandatory-parent/ownerless/current-input integration and formal proofs remain open, with no WBS3.2 task closure.

### Borrowed project operations and current-authority writer capability

The existing offline ProjectRepository now delegates to adapter-local borrowed project operations while retaining its exact entry validation/detachment, writeImmediately owner and post-settlement modeled-refusal catches. Three mutation callback bodies, seven moved declarations, the list query and whole wrapper inverse match their original ASTs under only declared helper/export/receiver adjustments; all19 original non-import test statements remain. Two real async-owner controls verify create/await/rename with exact grant+three audits and BEGIN/COMMIT, or late sentinel rollback with exact pre/post project/grant/audit snapshots and BEGIN/ROLLBACK. Native transaction-wrapper observation0 is qualified as wrapper creation only, not every owner. Final selected project.db.test.ts65pass/0fail/291expects, configuredSQLite lib/spec root0, targeted3lint0/format0. No new safety predicate, source fault or Proof. Packet: /tmp/puni-project-borrowed-operations-v1/manifest.json; SAME /tmp/puni-project-borrowed-operations-astra-v1.md (SHA25660441f33a00cef3c2a0a0f47e43cf54b7cffdd3e0dad78eff0b9d373cdd35a57), CLEAR.

New ProjectAdministration accepts full authenticated scoped human-arm CommandCaller (including machine/consent), actor-free payload and explicit IDs/time. It retains everything before queueing and checks write scope. Existing runSecurityTransaction owns current CommandAccess resolution, current organization.create_project authorization and borrowed mutations on the same source db/gate; resolved access selects organization and audit actor. No expected scope, creator metadata, account-only principal or optional context grants authority. Post-insert ProjectGrantRefused and post-cascade LastSuperAdmin leave through rollback before modeled translation. The required resolver must be composed with the real browser and non-owning credential reader over that same database; these tests use that real composition, without claiming arbitrary resolver types establish it.

Final selected project-administration.db.test.ts34pass/0fail/84expects at30000ms covers queued A-to-B changes while membership/grants in both remain, queued grant/member removal, retained evidence/payload/act, actual credential binding/revocation/contributor cap, success/cascade, late-audit rollback and modeled grant/CP14 rollback. Core andSQLite configured forced roots0, exact3lint0/format-check0. Real pre-activation with scoped expected evidence returns organization_context_changed at the existing kind comparison; the adapter's defensive legacy arm and project-specific paired rollback fault have no new direct proof. Current credential checks do not establish verifier/delegation/rotated-secret expiry.

Preserved history: missing-module setup0pass/1fail/1error is excluded; first32/2/80 identified only wrong test premises (existing creation updatedAt stamp20, permanent activation). Corrected tests use that unchanged audit convention and a genuine separate pre-activation fixture. Initial lint11 and remaining domain-bind false positive are retained; one adjacent test-only annotation applies to a bound domain method, preserving production SQL rules. The interrupted agent's exact17507B/e1b307ab... accidental new test in the original workspace was hash-verified and removed by Root; recovery record explicitly names project-administration.db.test.ts. No unrelated files or Git/index state changed.

Authority packet /tmp/puni-project-current-authority-v1/root-evidence.json (15556d9e518dd9476d1578314df58480b88a9a3b37ed1f848cebe8b82f8a2f14) contains47 artifact descriptors and3 live/archive pairs; borrowed packet contains49 plus3 pairs. Root checked these pins and read both complete reports/reviews. SAME authority review /tmp/puni-project-current-authority-astra-v1.md (dd392feed7f9f7614c20213e8fb4f0a736bd6677b77b81173f9a0bfbbf4b07a9) is CLEAR and corrects the earlier unrelated artifact filename observation. Exact command/status/tool-chunk records and raw streams are retained. Outer signal/FD settlement is unavailable rather than inferred. Root acceptance: /tmp/puni-root-project-foundations-acceptance-v1.json.

These are storage/authorized-writer capabilities, without Source/boot/barrel/HTTP wiring. Project-only native tests apply the three-pass schema through engagement parent and audit widening but write no packages. Combined creation, mandatory-parent/ownerless package producers, current-input12, public project read/shell filtering, final project.manage_settings hierarchy cutover, settings/moves and default integration remain open. No new formal R5/Proof, task3.2/3.3 checkbox, whole-library gate, activation or whole-goal completion is claimed.

### Historical migration identities, rollback preflight and certificate restoration

The actual old activation ledger identity now reaches before-first-down rollback admission. Applied rename-ledger membership selects strict historical or unchanged current inspection; namespace membership validates that selection and rejects mixed/missing/opposite layouts. The historical leaf contains inspection only and uses the same frozen receipt1 parser. It grants no startup or activation fallback. Existing complete selected-name/hash validation, enabled/retained-edge refusals and snapshot-only rename down remain intact.

Unchanged-source owning negatives showed four target/capture enabled-empty/missing-marker cases losing the actual later optimization-boundary table/index/ledger row before SQL refused; corrected real-disk closed-native dispatch also failed its own expected-throw assertion. The initial memory/WAL setup failure is excluded. Repaired final owning59pass/0fail/143expects, separate existing filtered rollback13/0/36 with78filtered, configuredSQLite lib/spec0 and exact3lint/format0. The genuine historical dormant positive restores the exact captured set; current dormant admission still refuses snapshot-only reversal. Current duplicate-rename control proves its diagnostic, while guard necessity remains unproved because the following layout check would also refuse. Copied8 historical and retained3 rollback Proof starts remain dated evidence, with no new formalR5/Proof claim. Packet /tmp/puni-dependency-rollback-repair-v1/manifest.json (cdfd51ff6afb987b52fa8e20b4d7fd3e14670cd969d0e81d626aba6921570add); SAME /tmp/puni-dependency-rollback-repair-astra-v1.md (86ce82b75b8b6e1693d9f6ade99d35db2279837b5cb0b197180cd44eaf93aa4b), CLEAR.

Historical migration tests now use the exact1816f parent assertions/SQL/immutable identities on each fixture's explicit110-folder historical copy, ending20261103110000_add_initial_access_offers. All71 original cases remain byte-identical after reversing only the declared profile plumbing; an independent Astra in-memory inverse reconstructs the entire228134-byte parent exactly. Original24 Proof-containing comment tokens remain exact. The added premise verifies literal membership and every copied forward/down hash. A separate full-current control applies every current migration, checks the complete name/hash ledger, mandatory package parent/creator and absent owner_id, then verifies exact snapshot-only audit-down refusal with schema/ledger unchanged.

Actual selected initial73/0/273; final five affected files129/0/1390, configuredSQLite0 and two-file lint0/format0. The earlier65/62/1172 remains an immutable failed epoch, whose historical fixture mismatches are corrected without weakening current guards. One new fixture cleanup cause lint issue was corrected while preserving errors[setup,cleanup]; the double-failure setup-cleanup branch has no separate native fault control. Packet /tmp/puni-historical-migration-test-repair-v1/evidence.json (f1a5fff2b462f122d20c4c5855dafacb0f0014ce9a04e9e4b489cf157a23736a); SAME /tmp/puni-historical-migration-test-implementation-astra-v1.md (64de30101c6ce42a66fffaf8568307e05d1586ebef23cda6e7723554e06baf33), CLEAR. These129 selected cases are not the full SQLite target.

The separate direct bootstrap certifier restores exactly two historical delayed migration IDs and the retained694-byte dependency SQL (SHA256b9b22317105b8562d53f9547a1401a28409c4a4735b591de8c04f0e02e7a9aba). Original103 canonical68eb1ad31c377b493d20da473c6d3d18d842914f8d9179c4888f1f2b1e0123b1 and original-historydc311f3427af09351bf67673a43bcca065a2dc385185a95b85e04faf995c937a certificate pins remain; the incorrect105-set is not rebased into authority. Current marker-prefix detection and public boot/runtime/strict inspector remain unchanged.

Original SQL-hash and corrected-fixture canonical103 certifier refusal supply ordinary regression RED; the initial three-FK expectation is excluded because the later historical audit migration adds the actual fourth FK. Final direct certifier22/0/157, configuredSQLite0 and exact3lint/format0. Actual source schema/all tables/ledger stay equal through success and each refusal; historical non-cascade and canonical cascade shapes are distinguished. Eight original saved native phases include2 nonzero original-source outcomes and6 success0/null, with recorded settled/reaped owners/closed output descriptors; these properties are receipt observations, not universal cleanup proof. Packet /tmp/puni-bootstrap-certificate-restoration-v1/evidence.json (4cf2bf77a139e9b720338dfe22a63d7bf57186c74e98ce168b68f3c216c8e250); SAME /tmp/puni-bootstrap-certificate-restoration-astra-review-v1.md (2b37cfdc785d49181dfb2bb718a586397d453339c83a4647daf856b5dcf6ce1d), CLEAR.

Root read the reports/reviews and relevant actual source/test bodies; checked rollback69artifact/3source pairs, historical35artifact/6external/2pairs, direct-certifier36artifact/3live/5held/226migration pins and all8 original receipt bindings, including exact SQL/down membership. The226SQL/down files are113 pairs; the earlier230 inventory included other files. Root acceptance /tmp/puni-root-migration-restorations-acceptance-v1.json. A first private verifier assumed the wrong manifest field/mode representation and failed before acceptance; corrected schema handling is private metadata-only, with no behavior/R5 credit.

All three increments remain ordinary bounded evidence. Historical renamer protection, already-authoritative pre-rename boot transition, default/current-parent package operations, broader SQL/HTTP/image/upgrade integration and new formalR5 remain open. No legacy rollback inspector is reused for live admission; no source leases, blocked workflows, SQL/down bytes, gates, task checkboxes or whole-goal status were changed.

### Published dependency V1 runtime identities restored

The ten runtime owners again advertise the published opaque identities `cross-project-dependencies-v1` and `wbs.cross-project-dependencies.v1`. Current work-package host/UI/path names remain current. Protocol versions, complete shapes, key/role/duplicate validation, receipt parsing, digests and independent decoders/OpenAPI remain unchanged. No renamed alias or authority fallback is admitted. The exact32-file change includes independent full parser/CLI/Gateway/HTTP controls, one separately reviewed fixed expected-operation order repair and six mandatory import sorts. All136 historical Proof-bearing comment groups remain byte-identical; the overlapping17 order/59 import-sort groups are not additive. Import evaluation order may change; emitted-JS identity is not claimed.

Ordinary five-file regression RED53pass/8fail/105expects became61/0/151 with the same command. Final post-sort direct consumers136/0/381, SQLite capability13/0/16, whole ordered machine-token19/0/123 and independent coordinator11/0/8 (26filtered) passed. The coordinator runs three actual DB-free Bun role CLIs and cross-role refusals; Docker is modeled. Final two-file frontend selection133tests passed; earlier three-file143 is a separate epoch. React act/Vite warnings remain. Six configured roots, backend module prerequisite, ten frontend module checks and exact32-path uncached lint/format exited0/null in their saved original receipts. These are bounded selections, not full root gates.

Five nonzero original phases remain: the initial regression RED, stale expected order, lint import order and current parent/owner integration failures. The latter still report missing work_package.owner_id. MCP first receives backend500 then missing ready.grant; cleanup joins backend.exited with explicit143, while nested signal/artifact path/composed-resource closure remain unavailable. A misfiltered machine test missing its activation prerequisite supplies no credit; its whole owning file separately passed. A formatter overlapping a still-running sorter is excluded; actual-settled replacement and final checks supply the recorded final-order observations. Private patch transport rejection and Root verifier's incorrect guessed phase names/relative argv assumption are preserved metadata/setup failures, without product or R5 credit.

Packet /tmp/puni-dependency-runtime-v1-restoration-v1/evidence.json (acff7ccd0b964836f05102e466b9ff067965fa34c1d003043ccfdb77ae3e78c8), exact patch9658879c0b1d3992955b7a6b729b4817b8dd3cb6a36058c0b6e58fa09fe03f05. Bounded Astra review /tmp/puni-dependency-runtime-v1-restoration-astra-review-v1.md (836cf01a1290db250c2b0f0aa92d3871ebf1d0ea6efc316c7af9c969d8e48417) is CLEAR and releases all32 read holds. Root fully read author/review reports, checked243 artifact pins,32 live/snapshot/preimage triples, six independent sources,39 original native receipt/transcript bindings, exact final quality coverage and226 unchanged migration/down pins: /tmp/puni-root-dependency-v1-restoration-acceptance-v1.json. Saved outer receipts expose settled/reaped owners and closed output descriptors; this supplies no missing nested or universal cleanup property.

No new Proof/formal fault, full boot/parent/MCP/consumer pass, image/host/optimizer/Dash worker qualification, task checkbox, deployment or whole-goal completion follows. ProjectRead may intentionally change Source in a new independently verified epoch; these compiler results do not transfer to that successor. Four previously rejected flows remain untouched.

### Entity-window admission, recovery and child-privacy contracts aligned

Eight Markdown contracts/runbooks now require authenticated immutable-snapshot read handoff before live-store shutdown, an explicitly admitted stopped one-off under the permissions6.4 owner, exact candidate/store/full-baseline-ledger binding and expected post-ledger/current-schema validation before normal startup. Ordinary current boot keeps its strict current-authority refusal; raw migrate-cli, backup verifier, path or candidate image supplies no permit. The exact final merged candidate SHA must pass the canonical gate, repeating it when merging changes the SHA. Old HTTP/WS authorizers retire before upgraded grant/write exposure. Unknown transition prevents startup/poller resumption.

Astra found and Root corrected the cross-contract recovery conflict: ordinary reversible additions still reverse exactly captured additions and compare the full baseline name/hash ledger with nonrepresentable-offer refusal. Only an explicitly reviewed snapshot-only entity window selected before migration restores its verified pre-window snapshot to the bound store family, validates pinned pre-window schema/full ledger and restores exact compatible code. Failed additive down cannot select a snapshot fallback. Both paths preserve authenticated reads, writer exclusion and prepared deadlines. Possible/unknown upgraded exposure, unknown ownership/retirement, failed validation or expiry retains recovery-required state/manual completion, without automatic old-role restoration.

Public child counts/entries and not_empty refusal IDs are the readable actual subset in the same current-authority snapshot/write owner; all actual children still prevent deletion, including not_empty with[]. Raw offline administration facts remain complete. This wording does not expand project visibility or give future visibility-only shells counts/revision.

Original five-file V1 and spacing/link successor V2 packets remain preserved. The final eight-file packet /tmp/puni-recovery-contract-amendment-v1/evidence.json (bef5aaa041ec39197cfa19ceda5d2641a50070021f785a3c9fe4aa9fe55f61ab) binds original preimages, snapshots, full26931-byte patch and validation JSON. Fresh changed-five Prettier write0 plus prior unchanged-three check0 cover final formatting; no fresh eight-path check is claimed. Installed target OpenSpec validation exited0 for WBS (0errors/15long-requirement warnings) and permissions (0errors/24warnings). WBS43 and permissions33 task identifiers/checkbox states remain unchanged. Actual Root chunks and earlier failed display/anchor observations remain preserved.

Bounded Astra successor /tmp/puni-recovery-contract-amendment-astra-v1.md (83c21c22deb98f5554974dbd008689b6f3f9ef6c3ce51cbcfd35b1964a276d5e) is CLEAR; initial F1/F2/F3 findings and addendum remain history. Root read both complete reviews, checked final eight live/snapshot/preimage pins and patch/review bindings. No runtime/SQL/host/one-off/recovery implementation, positive transition, native signal/FD qualification, new formalR5, task1.9/3.8/4.9/6.4 closure or deployment follows. Required owner/read bridge, old-authority no-effect boot controls, old/current migration correspondence and reached recovery remain open.

### Project read snapshots and public writer child privacy

ProjectRead and Source.createProjectRead now retain complete caller evidence and use the existing dedicated committed read pool. Actual organization/context/credential/grant/project/child reads share that connection. Explicit decoded metadata and readable child entries/counts detach; list has one readable-ID observation and one batched actual-child query. E41 member metadata visibility remains; final project.read/P3 shell and parent grant inheritance are later work. Pool construction is lazy; close blocks new loans and closes idle loans, while already lent observations finish then close on release. BEGIN DEFERRED pins on first SQL, not arrival/acquisition.

Reader ordinary full32/0/70 precedes a test-only presence-narrowing successor; final affected retention3/0/4 with29filtered uses identical production3. Configured core/SQLite roots and exact4 lint/format passed before the separate writer epoch. Existing pool7/0/24 and contracts boot2/0/7,384MB below500MB passed. Actual pinned WAL frames were83log/81checkpointed, then83/83 after release; busy0 alone earns no claim. The affected Source command remains FAILED13pass/13fail: all13 Source capability cases pass, all13 claim-observation fixtures fail at old owner_id setup before their own observations. Initial missing-module setup,21/11 fixture/oracle failures, UUID-trigger corrections, one import-sort error and four optional-evidence type diagnostics remain preserved. No cap-removal, defensive legacy-arm, production browser or global FD proof is claimed.

Reader manifest /tmp/puni-project-read-v1/manifest.json (0fc318b6299e4365493fc4eab0b520cc36069264434cd432706632726b31d11a) binds80 artifacts/4source pins. Astra /tmp/puni-project-read-astra-v1.md (302c64fda7ad168a88934731657d52f7c624d8c8c1d4f74d9e7b09524a30e95a) is CLEAR. The first391261 manifest was replaced during review by metadata-only epoch qualification; Astra stopped adoption, then verified the exact archived first seal and source-unchanged ancestry. Both original bodies remain under epochs/first-seal. No source/log/helper repin occurred. Its only R2 correction is a separately retained three-site private copyProjectView rename with exact inverse, one native list/detail control1/0/3 (31filtered), lint0/format0: /tmp/puni-project-read-helper-name-v1/evidence.json. That mechanical successor does not relabel earlier compiler/full-test epochs.

The authorized writer's distinct3-file successor copies actual empty creation count0, projects rename counts from validated actual children and current readable IDs inside its existing owner, and filters only not_empty refusal IDs while all actual children still prevent deletion. Raw borrowed operations/offline port/security owner stay exact, including CP14/cascades. Public success variants preserve all refusal alternatives. Ordinary baseline35/7/94 reaches six real hidden-count/ID regressions plus missing expected late UnknownPermissionRow; same full command then42/0/99. Natural AFTERUPDATE permission corruption now throws exact UnknownPermissionRow and rolls project/grant/audit/catalogue state back. Final8/0/15 with34filtered follows style/type-only corrections. Configured core0, finalSQLite0, exact3 uncached lint0/format0; initial one-sort lint1 and four test widened-kind diagnostics remain. Existing async return adopts promises: no independent literal return-await necessity is claimed.

Writer evidence /tmp/puni-project-writer-privacy-v1/evidence.json (b961f5606b44169a8e3ce9762bb9291081b425b73858163f5ea91684506bb88c); Astra /tmp/puni-project-writer-privacy-astra-v1.md (6cb69281e917416b67e315feb057995573e216b32c1e77c5d0ae4e6a41afeedc) is CLEAR with command supplement500df717 and addendum882225aa closing exact final argv/path correspondence. All31 original nonimport statements executing34 tests remain byte-exact. A separate one-test successor naturally deletes the just-renamed row in an AFTERUPDATE trigger, then observes the exact missing-row diagnostic and complete rollback: final1/0/3 with42filtered, lint0/format0, production unchanged. Its initial Bun assertion await lint1 and prematurely hardcoded lint0 provisional metadata are explicitly INVALID/preserved; explicit operation await and inspected final tool outcomes correct them. Final packet /tmp/puni-project-writer-missing-row-successor-v1/evidence-final-v2.json (29cd4dbdefa5e895e6a99e0b9cac98e093b60c0adbb84de9a6e996f3601f2633). No new full43 invocation or compiler replay after that test-only successor/ongoing parent integration is claimed.

Root fully read reports/reviews and verified80reader/16writer artifact pins, all archived source pairs, intentional helper/test successor ancestry and unchanged raw owners: /tmp/puni-root-project-read-writer-acceptance-v1.json. Native signal/FD custody remains unavailable. No formal source omission/new Proof, public route/browser wiring, parent/ownerless/capture/export integration, whole-library gate, task3.2/3.3/3.5 closure or deployment follows. Required independently attributable R5 work remains open; parent integration and project HTTP composition are the next product work.

### Explicit parents and ownerless legacy maintenance policy

The three normative WBS artifacts now require supplied nonempty parent IDs for every current create/import, including explicit legacy internal callers. The queued owner resolves that parent in the actual scoped or preactivation legacy organization; no first/migrated/automatic/document-derived parent is selected. Existing preactivation usability and activated-unbound/delegation refusals remain, without opening legacy project CRUD. Frozen document13/14 and input1–11 validation/bytes/hashes/Proof history stay immutable; retired owner is comparison evidence only.

Legacy saved-plan maintenance retains only the saved plan's nonnull createdById identity right, never package.createdBy/display/old owner. Explicit actor/context is retained before queueing; actual current preactivation and current saved-plan author are rechecked inside the touch owner. Separate principals reads/request double-resolution do not substitute. Queued activation or current-author mismatch refuses without effects; header-only/snapshot_busy and scoped package.write plus saved-author-or-package.manage_settings remain. Full memory Source models real source-owned current activation, including actual queued transitions and staging that cannot overwrite newer mode; legacy-organization flags identify mapping only. Missing modeled state throws; caller/env/absent-state defaults and isolated fixtures establish no parity.

V1 /tmp/puni-parent-owner-policy-amendment-v1/manifest.json (f419fef4a4f420840ad2dc784da4accc0d169188a807033787e46d40b59b4a0b) and V2 /tmp/puni-parent-owner-policy-amendment-v2/manifest.json (2bb339b4b5ee3316af63cd2033f1194415b03daf918d599aaa6711dab85a47e4) remain distinct preserved packets. All43 checkbox lines stay byte-exact. Each normal installed target OpenSpec validation exited0 with15warnings/0errors; V2 formatting3 exited0. V1's unrequested strict1 with the same warnings is preserved, not called success. These checks establish contract structure/format only; native signal/FD facts are unavailable.

Root read both full reports/patches and Astra policy reviews: V1 22dbd04d0bfa69381c33f5fe025693e7a7641e4ecad0308b8423a7592e2905b9 identified the two owner-time gaps; V2 /tmp/puni-parent-owner-policy-astra-v2.md (53a0d52f7bcfaf8dd9352044e4d0a1736bccc8c55e66f4f837dfd6a76a661c46) is CLEAR and releases all3 holds. Actual parent producers/legacy touch/memory mode are under implementation; no runtime/R5/task/parent closure or blocked comparison authorization follows from this amendment.

### Legacy ordinary-edit owner authority retired explicitly

Astra's actual closure review found direct legacy resource calls, injected raw graphs/compatibility services and a further SQLite resource-use owner_id projection. The normative successor makes ordinary preactivation legacy edits unrestricted-only, with existing modeled forbidden for restricted packages regardless of creator/former owner. Current scoped grant/credential/P5 paths remain; admitted creation/import may author restricted packages, while legacy saved-plan author-only header maintenance and reading/navigation remain distinct. No new legacy scoped-principal synthesis or import grant shim is introduced. The domain/injection names are canEditLegacyWorkPackage and LEGACY_EDIT_ADMISSION; frozen input11/document13/14 remain independent historical facts. E44 now names the actual dedicated shared parent classifier, preserving generic PATCH/retry classification.

Exactly3 documents changed with all43 checkbox lines preserved. Final installed target validation exited0 (50ff5e),0errors/15warnings, and exact3 formatting check0 (321e8e). Source/preimages/fullpatch: /tmp/puni-ownerless-legacy-edit-contract-v1/manifest.json (c8598e5447a5011a3a10151c8a58a20d55defca6e6657eef8a46a96837a4b2ea); exact command supplement83665f31e5f71b3cd5db751286635131284310f63faa381028aeac5fd532e922 supplies the sealed report's pending chunk placeholder without rewriting its first body. Root read the source-policy review5978411717d4aa068b1917641ad58c40ebd79f19fe88a8c887e1e293dba9a041 and final contract review /tmp/puni-ownerless-legacy-edit-contract-astra-v1.md, and checked3 final live/snapshot/preimage triples. Contract review is CLEAR; actual edit-admission/caller/resource-use implementation remains in its separately observed epoch. No runtime, new Proof, caller-complete/typecheck/task or activation claim follows from the prose amendment.

### Current input12 and required complete export integration

Current input12 has an independent strict lazy grammar and required actual projectId, without owner. Its writer replaces the current11 writer; frozen original1–11 readers/bytes stay separate. The constructed input11 local/connected controls were captured before retirement; they are explicit test controls, not released production captures. The original normalizer retains ceiling9. Source/review packet /tmp/puni-input12-codec-review-v1/manifest.json (eb26d7d5046f0ea95444f704905b599e0e374bba48fa7f12ab78f74508e1f198) binds17 paths and24 evidence artifacts. Astra /tmp/puni-input12-codec-astra-v1.md (c7bbd112bdde5c5d01b36622fb15c5c786721d19b336cef9373b59573379953d) is CLEAR for that bounded source epoch. Ordinary eight-file codec/domain selection148/0/618, final configured domain0, exact17 lint0 and format0 are separate receipts; three core paths were outside that lint selection. No new12 formal R5 or all-caller claim follows.

Purpose export now requires PlanExportReader through WorkItemService, routes, services and boot. Every successful export uses complete source-owned local/shared/connected facts with actual parent metadata; independent asynchronous exporter IO and late route fallback retire. Scoped target package.read is checked before topology, and every retained shared-chain/component member must be readable by the same principal in the same observation. An invisible member produces opaque existing not_found for JSON and Markdown; no trimmed/rehashed/rescheduled document is emitted. Memory uses actual persisted fixed built-in roles/grants and retained access, never creator identity or membership alone. Its existing isolated planning scope remains explicit. Actual pre_activation permits mapped nonlegacy organizations; organization.legacy is not a read-admission condition.

Adapter seven-path freeze81cccb148c5dd8001971456f8e986972323fa0a421b3c5d59355e0e13e029f9a and delivery57-path freeze39f3a5519fa05e77e4b7744af70860d151d82484c19a1b8082b5f31b25eba5c8 remain immutable. Delivery report /tmp/puni-plan-export-delivery-v1/report.md (083fee8eda238445a382f0975ce0c61b37f30a1dd3dac82fa39ab85129b689a9), manifest325729583853822774378dbb5f0c8d7a14b52cb896c0f55a09d988cca389550a and peer registration addendum34cdfa73c71a0d809939db064482b6107b6f72c8cb6cbd14a26f11ba144dd939 retain precise provider epochs. Ordinary observations are SQL11/0/27, memory13/0/40, each real import registration39/0/204, five pure core files109/0/286, Navigator3/0/13, earlier-provider memory HTTP56/0/259 and latest-provider mounted opacity3/0/41. These are separate commands, not an aggregate full-target pass. Initial duplicate-member setup, wrong shared-influence premise, old version/oracle errors, temporary import-contract truncation and exact restoration remain disclosed in those packets. Astra /tmp/puni-plan-export-adapters-delivery-astra-v1.md (e73a28fd9c7d16db9cf92204af9865989054ecfd77e6b9b255e66e72c9ec99ef) is CLEAR; Root fully read it. No new formal check or permission-inheritance credit is inherited from old Proof text.

The first coherent six configured compiler roots were run serially through their actual configured bunx tsc --build --force commands: domain0, contracts0, core2, SQLite2, memory2, backend2. /tmp/puni-bc-six-root-types-v1/receipts.json records actual0/2 exits and null signals; all2063 selected source/config pins remain unchanged across that invocation. The failing logs contain65/105/47/79 diagnostic lines respectively, including repeated referenced-root errors: stale current owner fields, absent explicit parents, saved-touch caller contexts and the unfinished comparison ABI. They are not unique-defect totals. Core/backend and adapter/conformance callers now have distinct successors under repair. No compiler pass is claimed for them.

Generic current saved capture still needs actual parent/mapping validation separately from purpose export. /tmp/puni-current-saved-capture-parent-plan-v1.md (46605c7ce2014d6b96b5b3642f823855fa5063c129f296ed897398a9c1e4fe88) traces actual save owners and limits the correction to borrowed SQL and existing detached memory epochs. Actual SQL missing-mapping testing already reaches an existing abbreviation-namespace refusal, qualifying the earlier source-only null-path concern; it earns no new guard credit. Parent-row and memory mapping negatives remain their own implementation work.

### Generation-aware comparison projection in progress

The detached projection separates common authored facts from required parent evidence, optional actually recorded retired owner (null remains recorded), and dependency provenance based on original version. Original1–11 parent evidence stays unrecorded; pre10 dependencies stay unrecorded despite their validated11 projection. PlanSide requires this evidence. Domain diff includes parent, retired-owner and dependency facts only when both captures recorded the corresponding fact, with reparented and retired-field categories; ordinary field and schedule coverage stay value-derived. Current and verified stored sides use this same projection, and core schedule normalization preserves evidence.

Owning projection tests initially fail5/5 against a decoding-only baseline, then pass5/0/19. The new diff tests first contain a wrong independent name literal/incomplete test history (preserved), then corrected complete fixtures produce2/3/8 against old behavior. Final six-file domain command116/0/239 passes. Core meaning initially drops evidence and fails0/2; the actual current service test fails0/1/1 before projection. Two owned core/module files then reach11/1/27 solely on an obsolete current input9 oracle; that exact correction yields12/0/30, preserving historical allowance assertions. No blocked candidate was run. /tmp/puni-comparison-projection-review-v1/packet.json (a238ff665e98abedf2de789553f3d50da8ee8576b48300a451e1d17752997f03) binds14 source snapshots, test logs and preimages for independent Astra review, pending at this entry.

Configured domain initially reports seven missing-evidence fixture diagnostics in two sparse-fact tests. Three exact side factories now call the projection; successor /tmp/puni-comparison-domain-types-v2 records0/null with249 unchanged domain/config pins. Exact nine-path domain lint0 follows two import-sort-only failures. Core types/type-aware lint and final HTTP/FE comparison consumers remain pending. The unchanged live saved-plan-comparison.ts remains bc8f37fb31390177432e22f68f99ed4b28a5504be871636af352f25c78f85ab0. Its complete private replacement candidate f3e0496d7f75de79032dcd4d620f2ad6141aef6c7ca465c3b11389bf3949db4d uses explicit evidence and required parent summaries; it is prepared only, not applied/imported/executed. Three owning summary tests against the original fail0/3/3. Prior automatic approval rejection remains in force; static review and a concrete direct approval are required before any replacement.

Root fully read A64 caller review /tmp/puni-current-package-types-astra-v1.md (2e09146511d3e5a755008fd8bb11c94b470031744c3a277e5687e624ca432b71). Its real restricted-unrestrict composition finding is corrected separately with an actual unrestricted second package, retaining both restricted denials: /tmp/puni-current-package-composed-save-v1/report.md (37a85fbbc236d31b05e693e991030d26b82899700cf68f0a3d9347727f648d62), actual1/0/9. Do not classify all original41/6 composition failures as codec failures. The old benchmark's plain Git HEAD/status calls lack index-byte continuity evidence; no no-Git-metadata-write claim is made. Project60 Astra review22ec85ab086124984aab9d9de2289bab20afa580a1d3d434f2908b5b376972f3 is independently CLEAR for its frozen epoch, not current all-caller quality.

Normal installed OpenSpec validation after authority/legacy-marker clarification exits0 with0 errors/15 warnings. No task checkbox changed in this entry; Step Catalogue's separately qualified resolver remains only task1.4. New source guards still need independently attributable production-path omission proofs; full integration lint/types, HTTP/FE/CLI, settings/spaces/catalogue, permissions activation and canonical host gates remain open. No Root Git/index/remote/host/deploy or blocked-flow retry occurred in this continuation.

### Comparison HTTP and frontend consumer successor

Root fully read Astra comparison projection review /tmp/puni-comparison-projection-astra-v1.md (59743b6a2df5e82dc22414b99ff9cfc7b5daba957bede2de5c3bcad263f03927): live14 source/API CLEAR, complete private summary candidate statically CLEAR only. The required connected-summary test migration is now separately reviewed: /tmp/puni-comparison-connected-fixture-astra-v1.md (0a84133dfe3f47aa7f203cb5f3660c1dfec68358d91525f1fb8c5100c325b1a9), exact successor test72b910bb52878c339fd2add23d62f460d182758619ceeff5dc920c3544002dae. Existing stage bytes/positions, objective outcomes, missing-label and detachment assertions remain, with actual original9/constructed11 fixtures and explicit evidence mutators. Its original live-summary command reaches0/16/13, with no setup grammar error; candidate was never run. The direct user approval question now identifies the complete f3e0496d replacement and its historical-validation risk. No answer has arrived; the old automatic-review rejection remains in force and live source staysbc8f37fb31390177432e22f68f99ed4b28a5504be871636af352f25c78f85ab0.

The HTTP side schema now requires parent evidence on both sides, even when the diff is empty: unrecorded or recorded with a nonempty projectId. Only retired-field is added to the known category enum; unknown categories still refuse against otherwise complete valid replies. Ordinary schema suite6/3/38→9/0/46. Configured contracts first fails2 on one widened raw-wire test literal; explicit validateSchema<unknown> at that test boundary preserves the production validator, and final configured root0 has462 before/after pins unchanged (/tmp/puni-contracts-type-successor-v4). Exact two-path lint0. No core or FE configured type success is inferred.

Frontend FrozenProvenance renders captured parent identity or its explicit unrecorded state without fetching current metadata. An impossible post-decoder parent kind reaches the actual Error Boundary. Retired-field ranks deliberately between ownership and service assignment, while the old unknown-category fallback stays unchanged. Ten existing side fixtures now carry explicit parents; original assertions remain. Configured node grouping12/1→13pass. The API file requested in that node command was excluded by its actual tier and is not counted there; its separate configured view command passes16. Three comparison/panel view files pass61. Parent rendering and impossible-parent owning assertions each fail against the previous renderer before implementation. Existing Vite future-config-loader warnings remain visible; no runner, timeout, worker or warning-suppression config changed.

Root fully read /tmp/puni-comparison-http-fe-astra-v1.md (0d5a5c6c1251033dc4da63cb45a47e5e8e77d15285089399475969b94b0f4788): exact9 source/API CLEAR, holds released. Its packet256cd24abbcc42f85cde6483d481edab4ce5b30c09d900cd03d1e349235c8289 binds source snapshots/preimages. Three prospective omission boundaries are recorded but unexecuted: shared parent presence, parent value validation and impossible-parent Error Boundary. Ordinary loop failures establish only their first reached witness; no new formal Proof or exhaustive per-clause credit is assigned. This HTTP-client-to-panel fixture is not a mounted server running the blocked summary candidate.

Root's current-plan SQLite fixture now seeds an actual named organization/parent and checks complete projected facts/evidence against stored input12, including required parent and absent owner. Its full10/0/23 command passes at the unchanged backend10000 budget; capture connection-lifetime assertions remain. Independent connected-history/current-body integrity suites use current12 with a separate retained constructed11/schedule1 control: full37/0/123. Three original header/hash/schedule-header controls pass3/0/11,4filtered; the projected-schedule impossible-shape control passes1/0/4,19filtered. These selections do not qualify the still-blocked summary or an unexecuted whole comparison suite. A new local test variable shadowing its historical fixture reader was caught by source inspection and renamed before consumer execution; no setup-failure credit is claimed.

Core/backend and adapter/conformance caller successors remain active under their separate owners. Generic capture parent corrections have author-reported owning SQL/memory outcomes pending Root's sealed report review. The current SQLite creator-grant integration test is explicitly moving from its obsolete pre-parent fixture profile to unchanged full current migrations with an actual parent; its previous profile and full preimage remain archived, with no historical compatibility or SQL-edit claim. No whole-library quality, task closure, activation, host gate, commit or release follows.

### Current caller handoff and invalid validator-flight dispatch

A/B caller59 successor is sealed: /tmp/puni-ab-caller-types-v1/report.md46539817a2b4d3eb6003a8920019b0d74aba418e033bdf76c397e94243a7b72c, freeze91598959924e09a42fe6af488a353ce52457070b748d6057249321fe32569be0. Root fully read the report. It preserves all original comments and18 Proof tokens. Ordinary arithmetic193/0/439 and focused core45/0/180 pass. Backend143/1/513 retains the blocked connected-summary failure. Initial controller92/36/1/1122 preserves six pre-checkpoint timeouts,25 transfer/two address raw owner-column setup failures, quoting errors and the actual counter500. Final six selected backend cases6/0/368 with511filtered qualify only their selected corrections. Restored constructed document12 projectId/projectName fields remain historical wire fields, not current host names. A separate erased-type correction uses actual LegacyDocumentDependency12[] and preserves raw JSON bytes: /tmp/puni-ab-historical12-type-v1/manifest.json191860f1597c796487bc7e37daede43059bcfb917f9f9f87156224d6688c67d6. No full native/compiler/lint success is inferred.

Generic capture C4 report50575c7cb9d0ad471b17c08d37fc45e1dfc5b73df493754d0fba50396d36a453 and freeze babe9f4bacd19a158eb385d4e935b9c91537d6a7545a6bc3b64139e6830fe24e remain immutable. Astra /tmp/puni-current-saved-capture-astra-v1.mdac115d8f0e91d8d91349ae2e29d38001ccbf882d5f504a2cdf571b71ece0634c found one real empty memory-organization identity gap; other source paths were coherent. The natural typed legacy fixture creates a real empty-id organization, account and parent, and reaches an accepted capture before its own expected rejection fails0/1/2. Exactly one empty-string guard arm fixes it; final memory6/0/15. Separate /tmp/puni-current-saved-capture-empty-org-v1/evidence.json89076f9590adf392b31fc44dd6f65dc0e1b82e3d8e97da473eba5b364b45749c is reviewed CLEAR by Astra e1e3192e (full Root read), with prior five cases and all other production bytes exact. No formal omission or new Proof is inherited.

Serial configured-root v2 /tmp/puni-bc-six-root-types-v2 completes against2069 unchanged selected pins: domain0/contracts0/core2/SQLite2/memory2/backend2, with11/68/36/10 diagnostic lines including repeated referenced errors. Core errors are the deliberately unchanged blocked summary/new parent ABI; backend has that plus the historical12 endpoint type fixed separately above. Fifteen adapter/conformance files and new capture-test assertions/query types account for the remaining caller work. The complete49 fixture successor is now frozen at /tmp/puni-parent-fixtures-final15-v1/source-freeze-v1.jsonb3694b7f0759eb67f0b7feb7c4745ef28f7a7cc2934d72cc34fe17f1c31e83c4; separate capture-test type corrections are in /tmp/puni-current-saved-capture-test-types-v1/report.md945da0e99e4c3aad398c1306c17fe7825d1b230fb84a819522830f5007f12171. Their final15 ordinary replay and current raw-owner SQL/migration-profile counterparts remain explicitly pending. No benchmark was executed in that successor. A fresh serial v3 is currently running; no result is claimed here.

Root reproduced counter exhaustion returning500: the actual unchanged trigger message is work_package abbreviation exhausted, while the adapter compared the space-separated spelling. Exact literal matching restores the existing modeled409; the original mounted create/import rollback case changes0/1/1 to1/0/4 at the unchanged backend budget. /tmp/puni-counter-exhaustion-diagnosis-v1 retains raw failure with the actual nested SQLite error, exact production preimage and GREEN. The adjacent Proof names only the first creation assertion actually reached in RED. SQL migrations/down files and broad unexpected-error behavior were not changed. Types/lint for this one-file fix remain part of the next coherent quality handoff. Source inspection also found stale raw owner_id/current-profile assumptions in work-package-abbreviation-migration.db.test.ts; that file has not been repaired or claimed passing here.

Contracts startup after the schema/public exports passes2/0/7, observed370MB below500MB (/tmp/puni-comparison-http-v1/boot-memory.log); this is not a controlled memory delta. The mounted response-schema parent/retired-category selection passes1/0/5 with100filtered, logging the three expected invalid-response500s. It uses the current real mount with a stubbed producer, not the blocked private candidate. The sole old inline PlanSide in that controller now uses the original-version projector; historical10/2 helper bytes remain unchanged.

The NEW endpoint-validator dependency experiment is distinct from the old blocked source guard. Astra634083fa approved its bounded design as one outer-validator dependency fault with two first-own witnesses, not each parent clause. V1 preparation failed on an absent optional bunfig before dispatch; V2/V3 were prepare-only. Static V3 reviewfee009bf required exclusive evidence and exact first-own diagnostic blocks; V5 static review13ec3640 considered those corrected. No execution credit follows from those reviews.

V5 execution was INVALID: putting --preload before the Bun test subcommand selected root package.test instead of the built-in runner. Original direct child1901189 timed out after12s with SIGKILL/null exit; its receipt binds36,319 stdout bytes and269 stderr bytes. Output declared55 Nx projects plus four prerequisite tasks. No dependency-broken/healthy-after phase ran. Original core/app imports, repository/index effects and broader output effects cannot be excluded. Ten declared input hashes/modes remain exact; that is not a full-tree preservation statement. Root stopped further native launches briefly, scanned the host for the unique inherited flight marker, found orphan1901224, revalidated that marker and sent SIGTERM; its process entry disappeared. A fresh snapshot checked151 readable same-user process environments with no matching tag; nine EACCES environments remain unverified. This is bounded containment, not global descendant/descriptor cleanup or index continuity. Full original logs, scans and stop record stay under /tmp/puni-comparison-validator-fault-v5/flight. No private comparison candidate was dispatched; its approval block remains.

A safe private-directory built-in/preload probe passes1/0/1. V6 puts test first, preserves budgets and rejects unexpected Nx output; Astra ca4bdc7d reviews that narrow correction and acknowledges the missed V5 dispatch hazard. Its actual healthy child returns0 and the two named tests pass2/0/9, but the expected process-exit trace is absent, so the driver stops with ENOENT before any fault/recovery phase. V6 therefore also earns no dependency-proof credit; actual hook consumption and the exit-callback premise remain unverified. Raw receipt/streams are preserved under /tmp/puni-comparison-validator-fault-v6/flight. Dispatch-environment hashes describe supplied child entries, not a separately measured complete post-startup runtime environment. A later trace mechanism needs its own concrete review and a distinct fresh epoch; no classifier is broadened here.

The direct user question for complete summary candidatef3e0496d remains unanswered. Live saved-plan-comparison.ts staysbc8f37fb31390177432e22f68f99ed4b28a5504be871636af352f25c78f85ab0. None of the consumer fixes, review releases, driver attempts or elapsed time authorize its replacement. No task/goal closure, canonical host gate, commit, push or release follows.

### Qualified validator dependency fault and current fixture successors

The distinct V7 validator flight completes healthy-before2/0/9, accepting-dependency0/2/3, and fresh-healthy-after2/0/9. The actual outer StandardSchema validator for compareSavedPlans is the single injected dependency; first owning failures are missing left.parent and null right.parent. Later loop branches are not independent omission witnesses. afterAll records actual hook consumption9/3/9; the original synchronous receipts preserve signal as unreported and timeout/maxBuffer as false. Evidence /tmp/puni-comparison-validator-fault-v7/evidence.json has SHA ca2fad2642a62da3a2b9a7549a143e5fef73a8a65128b9181cb157a92249514f. Root fully read the actual artifacts and Astra /tmp/puni-comparison-validator-proof-astra-v7.md (CLEAR); the accurately bounded adjacent Proof comment is separately published under /tmp/puni-comparison-validator-proof-comment-v1. Invalid V5 dispatch and V6 trace absence remain preserved, including the disclosed containment and unknown repository/index effects. No FE exhaustiveness, mounted blocked producer or per-clause proof follows.

All serial v3 compilers have settled. Following two exact test-type corrections, the distinct adapter-v4 SQLite and memory checks each exit2 with only the unchanged blocked saved-plan-comparison dependencyHistory diagnostic. Their2069 declared source/config pins stay unchanged. Core/backend still require the pending complete comparison-summary replacement; no whole-root pass is claimed.

Final51 fixture source is frozen at /tmp/puni-parent-final-ordinary-v1/source-freeze-final.json (c73651b75b44963f7ec719bd3961e15f293488f59f66e547836faf3cdbd26a75). Current WorkPackage37/0/89, SavedPlan23/0/66, audit9/0/18 and the separately listed UoW, fault-control, current solution/calendar/memory and two conformance selections pass. Exact51 formatting first reports30 layout files, then format0/check0; saved AST/literal/comment comparisons match. Fifteen emitted files differ in layout, so no emitted-byte identity is claimed. All347 historical Proof groups remain unchanged without new qualification. Root fully read the report, owning raw logs and Astra /tmp/puni-final-caller-fixtures-astra-v1.md (a59a31d66614bcba5f153d724fea8def8a7d128fb7c5459769acfd3d6286fb13), CLEAR for API59 plus fixture51 and the recorded historical12 type successor. Unselected historical calendar rollback and five queued external variants remain unverified.

The sole unsupported solution-reference full-current rollback case is replaced by solution-reference-history.db.test.ts using unchanged original migration/down bytes through OIDC, then only add_solution_ref. Exact historical row/baseline ledger restoration and stable forward/reapply name/hash/UTC identities pass1/0/17. Review strengthening first exposed an incorrect numeric-folder timestamp oracle0/1/10; the installed Drizzle contract uses UTC milliseconds, and its corrected independent Date.UTC oracle passes1/0/17. Complete preimage and removed giant case remain under /tmp/puni-solution-reference-history-v1 and /tmp/puni-history-review-fix-v1. No current restore-window guard or historical SQL changed. Astra /tmp/puni-solution-history-counter-astra-fix-v1.md is CLEAR; the counter Proof now accurately names the old adapter matcher rather than misdescribing the actual unchanged trigger.

The abbreviation migration test separately splits current allocator/storage/writer fixtures from the original project_abbreviations historical prefix. Explicit current parents replace obsolete owner SQL; the historical case retains original table/migration names and every applied name/hash/UTC identity. Final15/0/57 passes under30000ms, with actual two-writer60-row controls. Test-only cleanup owns acquired children and immediately records closed observation outcomes; failure observations retain unknown settlement and the private directory. Its healthy run does not qualify failure branches. Report /tmp/puni-abbreviation-fixture-v2/report.md and Astra /tmp/puni-abbreviation-fixture-astra-v2.md (d28169a882601084a7b8ea821494ea555a7a6487a58ebf0983fb7c6ba706b2fd) are fully read; source CLEAR and all226 migration/down pins remain unchanged. Compiler/type-aware lint for this new test remains pending.

### Frontend parent-flow integration in progress

Creator metadata now uses createdByName through the current picker, hover-card creation row, API subset and current fixture counterparts. Owning tests first8pass/3fail, then all11 picker cases pass. The combined boundary selection has45pass/1fail: its malformed-created-response test stops earlier at the genuinely missing required project, so it remains failed and its original fake_invalid_response assertion is preserved for the parent-flow successor.

The first configured frontend root and all ten module checks complete serially under3227 unchanged source/config pins: root exits2 with43 diagnostic lines; modules exit1 with3–5 lines each. These are repeated parent-envelope/parser/refusal diagnostics, plus the stated current direct callers and two missing comparison-side mock parents. A driver preparation assumed a nonexistent eslint.config.mjs and failed before any compiler; the corrected driver pins actual eslint.config.js. Raw receipts and every diagnostic remain in /tmp/puni-fe-configured-types-v2. No frontend type pass is claimed.

Six new modeled missing/unavailable-parent and import-envelope wording cases first fail beside17 existing passes; the unchanged configured View command then passes all23. Current create code extraction and user-facing sentences now handle those typed arms. The archival JSON parser independently fails its new owning valid-file case0/1, then passes1/0 with85filtered after selecting the existing public planDocumentRequest schema instead of the HTTP destination envelope. Raw-document unit/e2e validation helpers use that same descriptor; the required import HTTP envelope is unchanged. Existing Vite future-loader warnings remain visible. Packets /tmp/puni-parent-refusal-v1 and /tmp/puni-archival-parser-v1 preserve preimages and tool observations. These ordinary frontend successors have not yet received final formatting, lint, whole-family/browser or renewed R5 qualification.

The approved first frontend vertical slice is existing-project creation/import with explicit parent-first arguments, real catalog project listing, a shared unselected destination picker and retained async lifetime boundaries. It selects no first/sole/migrated/document-derived parent. Combined project+first-package creation and engagement moves still require actual backend owners before their UI. No checkbox, deployment, canonical gate, commit or PR update follows. The direct question for complete summary candidate f3e0496d remains pending; the live summary stays bc8f37fb31390177432e22f68f99ed4b28a5504be871636af352f25c78f85ab0.

### Parent-flow and atomic-create integration successor (2026-11-13)

The prior queued-external gap now has its actual focused replay: six mounted revocation, expiry, membership, demotion, credential and SSO cases pass6/0/54 with60 filtered. The source hash is unchanged across `/tmp/puni-queued-external-replay-v1`; native signal is not reported by that collector and is not inferred. This is ordinary coverage, without renewed guard-omission credit.

Root's exact11 current files pass scoped lint and format checks after a normal Nx graph refresh removes the obsolete dynamic edge from an erased type import. No graph reset or cache override was used. The separate111 caller/fixture paths pass type-aware lint, and113 paths pass formatting/checking in `/tmp/puni-callers-fixtures-quality-v2`. Five semantic test cleanup fixes retain chronological primary/restoration failures outside finally; actual memory6/0/20, SQL28/0/129 and orphan1/0/3 controls pass. Astra25009b54f4b9f239e705ab9a7629094c44f6b132396f12008f3d7e37a4745536 is clear for that bounded successor. Root's three controller selections pass3/0/30. Adapter configured roots v5 still exit2 solely on the unchanged blocked comparison summary dependencyHistory diagnostic, with2501 unchanged program pins. The later atomic-create source changes require fresh coordinated roots; no whole-workspace type pass is asserted.

The first explicit-parent frontend slice is frozen in `/tmp/puni-fe-existing-project-v1/report.md` (6086453b573ac3335a96831d27837d375a84124e775bc9956218d28fbf84128a). It adds actual scoped project listing, an initially unselected shared parent picker, parent-first create/import calls, explicit DTO parents and catalog-tagged async state. It retains the selected parent before FileReader and suppresses stale create publications, reloads, selections, renames and errors after catalog replacement. No first, sole, migrated or document-derived parent is selected. API90, fake43, fake API13, catalog2 and picker/import5 cases pass in their separate recorded commands. Earlier malformed-response tests first stopped at missing parent; corrected premises now reach their original assertions. The old archival document literal/helper and all historical Proof text remain preserved; constructed controls are not represented as genuine historical exporter captures.

The full eleven-file View command remains an observed385pass/9fail result. All nine failures reach mismatched link keys: emitters/tests use workPackage while four production reader/emitter sites used work_package. Root's exact four-file successor `/tmp/puni-root-url-repair-v1/publication.json` changes only those literal query keys and the copy-link oracle, retaining old Proof text. The affected Page124 and plan-cells157 tests now pass281/0 under the same View configuration, UTC, one worker and30000ms case/hook budgets. The receipt reports native0/null, stopped-and-reaped owner and closed owned descriptor. Existing React act warnings and the intentional missing-minute-charge Error Boundary diagnostic remain visible. Four-file formatting and syntax checks pass with unchanged hashes. Astra reviewad055789fb8653269c12b42a7755c77333da21c6424b62d27cb8c92aa07d1557 is clear within that scope. Its JSDoc nit is corrected separately in `/tmp/puni-root-api-jsdoc-v1`: unchanged text now directly documents WorkPackageApi; Bun emitted code is identical. Configured frontend types, final integrated lint, real browser/E2E, visual review and formal R5 remain open.

Atomic project plus optional first work-package creation is implemented in a separate frozen25-file packet `/tmp/puni-combined-create-implementation-v1/report.md` (04ee82b2a187abf73e82bf7ce319714c1bf9c85ead7d80b790e6ed601eefdf5d). CREATE accepts the optional named child and returns correlated empty/complete variants; PATCH retains its contract. SQL borrows insertion under the existing outer owner and repeats actual current organization.create_project authorization after the real parent/grant. Modeled late refusal crosses rollback as a closed exception; paired rollback failure remains AggregateError. Memory stages the actual shared parent/package/grant/audit tables once. Ordinary final commands separately pass SQL19/0/56, current administration51/0/118, SQL project/creator75/0/328, memory50/0/213, core25/0/65, mounted14/0/86 and contracts10/0/78. Contract loading measures365MB below the unchanged500MB bound. Astra12263d1a85505b90d51496a6936078d0fe760a588863f14dbdb08836166f2e73 independently clears source/API and binds the original19 native actors. The mounted machine-cap test is EARLY403 only: no parent, grant, trigger or second decision is reached. Its title is being corrected in a separate successor. The human SQL post-grant authority-removal control genuinely reaches the second check. Individual duplicate-ID, wrong-step-owner and mismatched-instant controls, configured roots/lint and formal R5 remain required; no combined task closure follows.

The current consumer contract amendment in design/tasks/spec preserves all43 original checkbox lines and every frozen capture. Current15/16 consumers are an ordered open3.4 sub-slice: freeze13/14 validators separately, enforce parent correspondence and selected workPackage.id, retain tasks3/reference1/receipt2 and exact document pairing. Three-document format check passes. Normal OpenSpec validation exits0 with0 errors and16 long-requirement warnings. A nested-list formatter instability was reproduced privately, then corrected to stable CommonMark indentation; no validation policy was relaxed. The provider implementation remains in progress in `/tmp/puni-document-consumers-v1`; its actual producer boundary must qualify before installed delivery is claimed.

Real ordinary E2E still needs a coherent actual current-organization/authentication/explicit-parent fixture. The existing ordinary legacy server cannot supply project CRUD or a usable project picker by inventing a parent. The separate activated browser fixture provides real grants/selection but currently has no real gateway URL/server for full three-tier acceptance. No placeholder parent, fake scoped project success, legacy CRUD admission or production authority switch has been introduced. No Root Git/index/remote/host/deploy action or rejected-action retry occurred. The complete comparison candidate f3e0496d remains pending and unapplied; live bc8f remains unchanged. Settings/spaces, moves, Step Catalogue, installed Bun CLI cutover, permission activation, canonical gates and publication remain open.

### Current document consumers, move review and cohort prerequisites (2026-11-13)

The current document producer now omits optional internal row.createdAt metadata
before serialization. The reproduced source was a constructed connected read, not
an actual SQLite audit-column leak. The actual presenter/serializer strict15/16
controls fail twice before the fix and then pass5/0/27. Astra33165e12 clears that
bounded plan. Frozen historical grammars/captures remain unchanged.

The 69-file quality successor has an actual 67-clean/two-finding lint epoch,
followed by a separate exact-two-file clean lint epoch; it is not one 69-file green
invocation. Formatting/checking passes. Focused configured frontend tests pass16
and43 in separate View/Node commands. SQL three-case and core one-case retention
selections pass separately. The latter collector does not report native signals.
All11 frontend configured type checks run again: ten modules pass, while the root
retains six actual E2E missing-parent sites. Three affected backend/core/SQLite
roots still exit2 solely on the unchanged blocked summary ABI. No integrated
typecheck or gate pass follows. Packets: `/tmp/puni-parent-combined-lint-v2`,
`/tmp/puni-parent-last-lint-v1`, `/tmp/puni-fe-configured-types-v4` and
`/tmp/puni-parent-postfix-types-v1`.

Combined-create readiness adds three natural malformed birth/ownership/instant
controls; the first attempt's unsupported BEGIN logger oracle is preserved. The
corrected controls pass3/0/21, and a later exact typed successor passes the owning
SQL file22/0/77. Two subsequent test-only lint fixes preserve the paired rollback
assertion and real asynchronous import. The later focused SQL3/core1 commands do
not represent another full22 replay. Readiness and source reviews66e00a70,
b9cb045d and the typed/test-lint publications retain these distinct epochs.

Navigator's current-parent suite passes23/0/83 and its two historical suites
pass94/0/448. The first cross-tool chain command remains24/1/300: its new refusal
test incorrectly expected its input file to be absent because output reused that
path. Two output-basename literals were corrected separately. The anchored case
then passes1/0/12 with24 filtered, reaching both the external-only refusal and the
colliding-ID local command. This is not a full25 replay or installed PUNI delivery
claim. Original receipts record native0/null and settled scoped ownership for the
successful successors. Consumer-wide formatting/types/lint/review and formal R5
remain open. The prefix/wrapper/sandbox incident is recorded in the findings
catalogue under “Reused native evidence prefix and wrapper exit status”.

The offline nine-path move implementation first fails on the missing operation,
then passes one actual SQL positive1/0/10. Astraa02d3f11 requires memory map-key/row
identity checks and safer partial-acquisition cleanup in the native test. Five
natural identity negatives fail before correction, and empty selected ownership
fails separately; the narrow memory successor passes13/0/91 with complete table
snapshots unchanged on refusal. These are ordinary controls, with no omission or
new Proof credit. SQL cleanup/trusted-state successors, broad conformance, current
HTTP authorization and all move UI remain open. The memory fixture has no complete
work-item endpoint context and does not prove full Source parity. Reports remain
in `/tmp/puni-offline-project-move-v1` and
`/tmp/puni-offline-project-move-fix-v1/memory-phase-v1`.

The reviewed move/current-browser normative amendment preserves all43 checkbox
lines. Exact three-document formatting and normal installed OpenSpec validation
pass, with0 errors and18 long-requirement warnings. E45 specifies actual move
authority/order and revision/audit/blocker behavior; E50 and open3.6 retain real
solver/native organization/gateway composition, explicit parents, run-bound state,
separate local quiet loading and unchanged Performance budgets. The finite cohort
roster now names29 paths, including the local config and the real developer-server
caller. Its first configured composition test fails as expected on old main.ts,
health readiness and reuseExistingServer:true. A real backend startup/Project
authority test is published but unrun; no fixture implementation, browser result
or optimizer result is claimed by that test preparation.

No task checkbox, goal completion, activation, Git/index, remote, host or deploy
action follows. The exact comparison replacement remains pending direct approval;
live saved-plan-comparison.ts staysbc8f37fb31390177432e22f68f99ed4b28a5504be871636af352f25c78f85ab0.

### Approved comparison replacement and integration progress (2026-11-13)

The user explicitly approved the complete saved-plan summary candidate and its
tests. Root applied exactly f3e0496d7f75de79032dcd4d620f2ad6141aef6c7ca465c3b11389bf3949db4d
after verifying and saving the unchanged bc8f37fb preimage. This supersedes the
pending-approval state in earlier entries; their failure observations remain.
The summary now consumes validated original-version dependency evidence and
retains recorded/unrecorded parent evidence. The original-version decoder and
frozen historical grammars are unchanged by this replacement.

The two owning comparison files pass19/0/34, including connected boundaries,
variant outcomes, missing-label refusals, current12 parent evidence and historical
11/9 provenance. Three-file lint first reports one test import-order error; an
import-only correction then passes the same scoped check. Configured core and
Dash TypeScript builds each exit0, resolving their previously observed summary
shape diagnostics. All four successful native receipts record original0/null,
settled scoped ownership, closed output descriptor, no primary failure and empty
cleanup failures. Source/config pins are unchanged within each command. These
are bounded checks, not a whole-workspace gate or renewed historical R5 proof.
Original receipts and preimages: /tmp/puni-summary-approved-v1.

The consumer successor uses actual constructed current15/16 wire captures through
the WBS presenter and serializer, with strict public reads in Navigator and Dash;
CLI tests no longer import WBS implementation across product boundaries. The
21-file packet has separately observed exact17-TypeScript-file lint0, Navigator
and Burokrat configured types0, parent/lazy tests30/0/116 and current Dash document
cases5/0/25 with70 filtered. The earlier Dash type failure remains its own epoch;
the later approved-summary build above passes. Final packet review, installed
PUNI delivery and new formal guard proofs remain open. The complete parser-token
inventory corrects the old flat-scanner count66 to133 preserved Proof-containing
comment tokens/markers (119 contiguous blocks); all133 bytes/order are preserved.
This is an inventory correction, not133 independent checks or fresh proof credit.
See /tmp/puni-provider-proof-parser-audit-v3/report.md.

The offline move successor separately passes SQL29/0/150, memory60/0/328, three
project partitions totaling78/0/381, and compatible local dependency12/0/43.
Seven appended current-schema cases pass7/0/73 with29 filtered. Corruptors restore
schema, triggers and FK/CHECK enforcement before production reads; all corruptor
cases temporarily disable FKs, including those whose rows retain valid references.
The WAL test observes one actual rival atomic local-to-external replacement and
retains the original reader snapshot. Astra41857b8c clears the actual append and
its preserved prefix. Full36 replay, duplicate-key corruption under a restored
UNIQUE index, current move HTTP/UI, configured move quality and formal R5 remain
open. See /tmp/puni-offline-move-strict-current-v1/native-focused-v1.

Ordinary browser fixture implementation now supplies actual native account/org
selection, Project authority, production BE/GW composition and run-bound state
setup. The backend owning positive passes1/0/19; descriptor and four state-path
configuration controls pass separately. Bun-forced Playwright discovery exits0
with654 specs and no report errors while the DB/state paths remain absent. A
private saved-report counter first fails on optional nested suites; a corrected
saved-output-only reader records the count without rerunning discovery. No real
global-setup/browser, websocket or optimizer success follows from discovery.
Astra984395f6 clears bounded setup source; worker wiring and finite failure
controls remain required. The worker baseline actually executes beforeAll/body
markers without context and fails its owning assertion; integration is in progress.

The combined-project API facade passes24 cases. Catalog/refusing/fake controls
pass68 after a retained66/2 epoch exposed a real fixture variable error. The
project-create refusal counterpart passes21 cases after its actual4/17 RED. The
mounted combined-dialog feature baseline fails twice at the missing New project
button; controlled modal/page publication-epoch implementation and race coverage
remain in progress. These are separate commands and source epochs, not a combined
browser or frontend gate. Settings/spaces, remaining Step Catalogue, client CLI
cutover, permission activation and canonical gates remain open. No task checkbox,
goal completion, Git/index/remote or deployment action follows this record.

### Current frontend integration and owned Bun frontend dispatch (2026-11-13)

The combined dialog's focused page/modal command passes35, followed by a separate
full Page151/picker5 command passing156. Astra81bdef62 then finds a real error
boundary issue: both reconciliation and its outer initial caller mislabeled
preference/publication failures as GET-refresh failures. The initial mounted
control fails at the real Error Boundary not receiving the failure; later
assertions are unreached in that RED. The narrow successor passes3 cases for
initial/retry exact cause identity and a held-GET replacement-runtime positive.
Astra f4aee063 clears that source correction. Earlier35/156 results are not
relabeled as post-correction full regressions.

Exact15 formatting passes with a byte-stable second pass. Type-aware lint first
reports24 findings; the five-file successor preserves both response-field guards
and parent correspondence through precise aliases, fixes event/callback types
and layout syntax, and preserves historical Proof text. The later21-file lint
reports only four import-order findings in Root's integration files. A separate
layout-only fix passes those four with outside-import bytes, comments and binding
sets preserved. A subsequent23-file lint reports only the two new frontend-leaf
findings; its exact two-file successor passes scoped lint. These are distinct
commands, not an invented single23-file lint result.

The actual configured frontend root build passes0 after explicit real project
IDs in the six typed browser birth sites, expected-organization transport in the
fixture client, complete refusal-test payloads, the read-only API stub and the
installed Bun types in only the E2E program. The earlier12 printed diagnostics
include one repeated plan-fixture diagnostic; a later two-diagnostic epoch lacks
Bun runtime declarations before that narrow registration. The successful root
build covers app/spec/E2E references, not fresh isolated module targets or a full
Nx gate. Later grouping tests and the leaf's final test-only receipt change are
separate source epochs. Receipts: `/tmp/puni-summary-approved-v1/dialog-*`.

The ordinary worker's natural missing-check baseline actually writes both
beforeAll/body markers without context. After67 module-only rewrites plus one
required automatic worker fixture, all6 owning controls pass: missing/stale/
malformed/private state refuse before both effects, matching constructed state
reaches them, and discovery reads no state/effects. Inner and outer original
receipts settle cleanly; constructed protocol state proves no browser/native
credential or grant. The complete source69 packet remains in
`/tmp/puni-ordinary-worker-implementation-v1`; later Home/Chrome/fixture changes
are distinct explicit-parent successors.

Performance's actual declaration-key and stale independent tuple controls first
fail0/2/3, then pass11/0/32 with nine independent rejection variants. Its current
setup/storage-path controls first pass1/fail5, then pass6 after required canonical
DB/global setup/cookie wiring. Workers, retries, denominator and120s budget are
unchanged. The owned frontend producer and independently literal checker now
name `bun ordinary-browser-frontend.ts`; the script uses fixed installed Vite
argv under Bun. Separate source findings preserve operation-primary versus
cleanup failures and freeze pre-cleanup evidence before cleanup; Astra e029dfab
clears their correction. Descriptor selection passes one case; the initial
lifecycle attempt selects none and provides no evidence (see the findings
catalogue). Fresh individual failed-build and build-before-preview controls then
pass, observing actual leaf7 and0 respectively before outer cleanup against the
fixed controlled dependency. This is not actual Vite, browser or full Performance
readiness. Remaining cancellation/PORT cases, driver Bun dispatch/database
propagation, real cohort/GW/optimizer and installed PUNI remain open.

Project-grouped navigation has a proper mounted11-case RED against unchanged
production: missing accessible groups, raw versus grouped/typing order and
same-ID hover geometry reach their own assertions. Some later assertions remain
unreached. Implementation follows the reviewed five-path plan with one shared
option order, visible unresolved presentation and child-owned remeasurement;
no current grouping GREEN or task3.6 closure is claimed. No checkbox, goal,
activation, shared repository/index, remote or deployment action follows.

## 2026-11-13 continued Bun dispatch and mounted move baseline

The six controlled frontend-leaf lifecycle cases now pass individually at source
00a08515/873a6461: failed build7 never previews; successful build0 precedes
preview0; cancellation during build/preview retains original143 with no late
preview; missing and empty PORT refuse1 before Vite. Every outer original was
0/null with selected inner exit observed before cleanup, one settled stop, closed
descriptors and empty cleanup failures. These use controlled installed-Vite
fixtures, not actual Vite/browser evidence. Final retained packet:
/tmp/puni-ordinary-browser-frontend-v1/final-controls-v1/.

Project grouping actual ordinary epochs are helper17/0, focused View11/0 with
154 filtered, then complete Page165 + ProjectPicker5 + combined dialog8 =178/0.
All originals0/null, stopped/reaped owner, closed descriptors, no cleanup failure.
Astra source review f90073aa was clear with the heading-text omission limitation.
The exact five-file formatter successor preserves semantic AST, import bindings
and all parser-position comment bytes; second pass stable, final check0. Root's
first lint found one optional-chain error and two hook warnings. The narrow Page
successor stabilizes visible choices and captures the existing layout signature
in its opaque memo token. Exact five-file lint-v2 passes0 with no warnings;
current configured types and post-change owning View remain separate checks.

Performance's first six-phase baseline failed at missing node during discovery,
before the intended oracle. A separately reviewed private node-name symlink to
pinned Bun allowed the old runner to reach its owning argv assertion:0/1 with
66 filtered, actual [Bun,sh,sh,sh,node,node]. This is a Bun compatibility alias,
not Node runtime evidence. After Astra-reviewed literal Bun service vectors,
explicit fixture argument tuples, generated database forwarding and current BE
readiness URL, the same-basis case passes1/0/23. Setup has no run database; all
five later actual spawn/runtime markers share the one generated database despite
injected conflicting extras. Evidence selection remains exactly CI/shift.
Without the alias, separate existing normal-positive, failed-readiness and
threshold-failure cases each pass1/0 (12,7,14 assertions respectively). Every
original0/null, settled owner/descriptors, empty cleanup failures; original source
pins remained unchanged during each command. These are private synthetic fixture
repositories, not a real-stack/browser result. Source-only tuple-inference and
stale test-variable corrections are recorded, not hidden. Retained packets:
/tmp/puni-summary-approved-v1/performance-runtime-tdd/ and
/tmp/puni-summary-approved-v1/performance-bun-dispatch-v1/.

Current client/refusal/fixture regressions pass76/0 under the actual Node Vitest
config (49+21+6), followed separately by facade24/0 under View. Each original is
0/null with settled owner/descriptors, empty cleanup and unchanged declared pins.
Vite native-config compatibility warnings remain in raw output. No browser or
formal R5 credit follows from these ordinary checks.

The first actual mounted admitted-move baseline creates real source/target
projects and a package, checks persisted creator grants, reads and both revision0
prerequisites, then fails exactly expected200/actual404 at the missing endpoint.
Outer original1/null,0/1/10 assertions. The selected actual OrganizationHarness
close was captured after acquisition, attempted once and settled; primary
assertion is retained, both unknown flags false and cleanup empty. Later success
assertions were unreached. Source-only implementation proceeds within the
Astra-reviewed sixteen-file scope; no production or formal-fault success claimed.
Retained packet: /tmp/puni-work-package-move-admission-v1/first-mounted-baseline-native-v1/.

No new task checkbox, formal omission proof, whole FE/tool gate, real browser,
canonical host gate, coherent commit, PR update or operational activation is
claimed by this entry. Three unrelated rejected-operation leases remain untouched.

## 2026-11-13 actual current browser and configured quality successor

One existing actual Chromium case passes with the complete current Bun/Vite stack:
work-package-picker's closed-picker caret/search scenario,1 passed in17.3s.
The actual installed Vite8.2.2 build transforms1203 modules and completes in1.01s,
then previews on6100. Setup performs native login, actual organization selection,
API parent create/readback and run-bound worker validation; the case uses explicit
captured parent selection, real package create/rename and browser focus/caret/
search assertions. No scenario interception, fake acceptance or solver request.
Root inspected original receipt and all2501 raw transcript bytes; original0/null,
primary null, cleanup empty, owner stopped/reaped, descriptor closed. The7 declared
application pins stay unchanged. Astra independently verifies30 combined source/
tool/browser pins,12 dotenv absences and exact public metadata linkage. Cookies
were not read, hashed or printed. Private DB/WAL/SHM and0700/0600 state remain at
/tmp/puni-current-browser-smoke-v1-NSVsuV/. The reviewed current Playwright teardown
force-kills service groups: no application graceful-close, leaf finally, store
cleanup or global process-absence credit. No explicit WebSocket assertion,
optimizer execution, full cohort, Performance budget or canonical gate claim.

Post-quality grouping11/0+154 filtered passes with Pagec7884331; source5 lint-v2
passes0 without warnings. Actual configured FE app/spec/E2E tsc --build --force
passes0/null with empty diagnostics and unchanged declared pins. The Performance
five-file lint-v3 and actual configured tool-devsync TypeScript build likewise
pass0/null with empty diagnostics; its current declaration and independent actual
producer admission/refusal suite passes11/0/32 assertions. Test-only void callback,
trace JSON typing and interface style fixes preserve the owning assertions; all
original failing lint epochs remain retained. These are scoped checks, not fresh
ten-module/full-repository gates or renewed formal omission proofs.

## 2026-11-13 admitted move and current browser caller checks

After the recorded mounted404 baseline, the existing mounted admitted-move test
passes1/0/17 assertions: actual HTTP200, package/source/target revision increments,
one audit row, and unchanged physical tables outside project/work_package/audit.
The retained harness close is attempted once and settles. Separate owning checks
pass resource1/0/3, route-forwarding4/0/11, contract3/0/24, and MCP derivation1/0/4.
The initial unrun MCP selector was corrected before launch to match its nested
describe title; it is not a zero-test success. These scoped checks do not assert
the complete MCP document/tool count or real machine authentication at the route
forwarding seam. Original receipts/raw are retained beneath
/tmp/puni-work-package-move-admission-v1/.

The complete admitted SQLite move file passes35/0/183 with timeout30000. Actual
queued organization/membership/grant/restriction changes, current-parent changes,
machine/consent credential revocation and account binding, malformed trusted
mapping/content, all four write failures, rollback failure/recovery, incoming and
outgoing active/held dependency blockers, unreadable counterparts and permitted
local/destination dependencies reach their owning assertions. The final SQL test
is be1261d1 after separately audited imports and formatting. Root independently
read receipt/stdout/stderr from sql35-native-v3: original0/null, no cleanup failure,
one settled owner stop and both acquired descriptors closed. Synthetic dependency
storage authority establishes test storage only, without operational activation.
This is ordinary negative coverage; no new formal R5 omission proof is claimed.

Five configured backend TypeScript roots (core, SQLite, contracts, BE and MCP)
pass0 after adding the move operation to three explicit route inventories/body
fixtures. Final nineteen-file lint passes0 without warnings; exact six import-only
fixes preserve non-import statements, comments and import bindings. Formatting
changes only SQL-test layout, preserves semantic AST and parser-position comments,
is stable on the second pass, and checks0. Actual existing mount-policy tests then
pass2/0/407 with12 filtered, and the organization-mutation inventory passes1/0/299
with7 filtered. Each original0/null, settled owner/descriptors and no cleanup
failure; declared source bytes remain unchanged. The first inventory launcher
stopped before native execution because some context records omit mode metadata;
bytes/hashes were unchanged. Its corrected launcher records actual modes and
compares those before/after. Retained output: /tmp/puni-summary-approved-v1/
move-app-inventory-v1.* and move-org-inventory-v1.*.

The Astra-reviewed current browser caller26 publication is frozen in
/tmp/puni-e2e-current-callers-v1/implementation-v1/live-publication-v1/source-freeze.json.
It includes explicit parents, scoped headers, lazy response-body handoff and the
native API logout control. UI sign-out remains deliberately local: the earlier
browser-cookie-revocation premise failed before its later assertions and is not
credited as a missing-feature baseline. The actual protected-transport baseline
separately failed at the missing expected headers after successful creation.

The first eight response-handoff browser controls run exactly8 cases with one
worker/retry0, using the real1203-module frontend build and private test database.
All8 fail at the final handle-disposal message assertion: expected /disposed/,
actual "evaluate: Target page, context or browser has been closed". Each preceding
response classification and pull/cancel count assertion is reached, but the tests
are not green. Original1/null, settled owner/descriptors and empty cleanup are
retained at /tmp/puni-e2e-current-callers-v1/lazy-owning8-v1/; raw transcript hash
57815e145e69373bb12c9a121ab9104f0ebab38a9ac02ad65ea78a6b40da5732.
The installed Playwright disposal contract and independent page/handle liveness
controls are under investigation. Protected/exempt/query/native-logout controls,
current26 quality, full browser cohort, formal R5, canonical gate, coherent commit,
PR delivery and operational activation remain unverified by this entry. No task
checkbox or unrelated rejected-operation lease changes.

### Current caller browser and quality successors

The actual protected/exempt/query browser controls pass3/0 against the real stack,
one worker and no retries. Requests reach the current service: protected package
creation preserves expected organization, dependency claim, caller trace and
validated body; the exempt account read has no dependency claim; listing query
values arrive unchanged. Original0/null, settled owner/descriptors and no cleanup;
all65 declared pins unchanged. Raw2727 bytes hash
ee768aa0d3cc1de24b4a7002fc07952bfb75db0fb50d95313d3e4ce514c56524
at /tmp/puni-e2e-current-callers-v1/transport3-v1/.

Astra review6eb50289 traces installed Playwright549070af: releasing a JSHandle
removes its dispatcher; evaluating that removed handle raises TargetClosedError
with the observed target-closed text. The test-only successor316de880 retains
required response-handle rejection and adds actual same-page and independent
retained-handle evaluations before and after. Genuine page/context closure cannot
pass those positive controls. The exact one-region inverse returns67545766;
production helper, semantic assertions and cleanup remain unchanged. Publication
132afc65 is retained with the review. The corrected owning eight cases pass8/0;
original0/null, settled owner/descriptors, no cleanup, all65 pins unchanged. Raw3316
bytes hash55e195c6ba7316fbccbe60edf7a4b381dc2d5f5bd1db032f2d5abaf30da02b4c
at /tmp/puni-e2e-current-callers-v1/lazy-owning8-v2/. This proves observed disposal
occurrence, without an independently measured exactly-once count or formal R5.
The original eight failures remain immutable.

Current26 configured FE app/spec/E2E tsc --build --force passes0/null without
diagnostics. Exact26 uncached lint then fails37 errors/0 warnings: primarily
import ordering, with explicit cleanup-cause, zero-dependency Playwright fixture,
intentional pending promise, callback-state narrowing and cookie-index guards.
No guard is removed on the strength of a type-flow diagnostic. Private precise
successors are under review; lint is not green. Original packets:
/tmp/puni-summary-approved-v1/current-callers-v1-{types,lint}.*.

The separate native server-logout control fails0/1: actual subject account200 and
logout204/empty succeed, then the same bearer account read returns200 rather than
the test's expected401. The saved-session survivor assertion is unreached. Raw4397
bytes hash2a2f15f8eb3d7c62d5af87093d8757bd189e28d30519be2a23ecdaef2deeaeec
at /tmp/puni-e2e-current-callers-v1/native-logout-v1/; original1/null, settled
owner/descriptors, no cleanup and unchanged65 pins. Source tracing finds the
account reader authenticates the native JWT/account directly; current organization
selection checks durable browser revocation. Existing boot-browser-session tests
instead assert old organization-bound resource403/no_active_organization and
membership/selection401/unauthenticated. A revised actual access-boundary control
is under investigation, not an authentication production change or a green result.
The six existing local UI sign-out cases remain unchanged. No full browser cohort,
current26 final quality, formal R5, canonical gate or task closure follows.

### Final caller quality, native session isolation and move no-op

The corrected native organization-session oracle passes1/0 (13.8s). Actual
subject account identity and protected list200 precede sole-Bearer/Origin logout
204/empty in a separate empty API context. The SAME subject browser cookie pair
then receives403/no_active_organization; the independent saved jar still receives
a schema-valid protected200. No cookie rewriting or production authentication
change. Astra source reviewb8e5eaa8 and publicationcb21c03d bindc839a679; original
0/null, settled owner/descriptors and no cleanup at native-logout-v2, raw2440
bytes/5b01d53016fe954c6b85368344a9ddc5618e5c90cb3deba71c8eaa337d655d18.
The earlier account401 premise failure stays uncredited.

Astra4b058614 clears five precise body-quality successors. Tagged cleanup retains
primary/cleanup causes including thrown undefined; all six same-site cancellation
guards and both flag assignments remain; the native cookie alias keeps cardinality,
undefined and empty-value validation. One test-only zero-dependency fixture lint
exception names Playwright's actual parser requirement. The pending executor gains
only an explanatory comment. These do not provide fresh omission-proof credit.
Publication: /tmp/puni-e2e-current-callers-v1/lint-body-v1/publication.json.

Import-only fixing changes25 of26 files and preserves every non-import statement,
parser-position comment and import binding. Formatting changes21 layouts, preserving
semantic AST/bindings/comment bytes and physical NUL counts; second pass is byte-
stable and final check0. Current26 configured FE app/spec/E2E TypeScript and exact26
uncached lint both pass0/null with empty diagnostics/no warnings and unchanged
declared pins. Source manifest is current-caller-quality-v2-source.json,
SHAe6cc49f8559fc805e7760bb723731b7c1b1f0096bcbda7ed89ec7d4d5e1594d9.
Root then runs the three transport, eight response-handoff and one native-session
cases together against that final source:12/0 (22.6s), original0/null, settled
owner/descriptors, no cleanup and unchanged72 pins. Full raw3912 bytes hash
c9aeee9ae35ebef6e837cb589537be5d80ec66689962c9da6fd7a6c5e0627e83,
/tmp/puni-e2e-current-callers-v1/post-quality12-v1/.

The existing real one-row header case separately FAILS0/1: actual85px at1280px
versus its unchanged56px maximum. Setup/package creation succeeds; later widths
are unreached. Original1/null, scoped settlement clean, raw5078 bytes hash
bc244a2f4191b9a85b7d18987abea84ace1fde84da41c3ce95c77a03371367d4,
header-one-row-baseline-v1/. The screenshot shows wrapped destination controls and
overlapping organization chrome. A bounded disclosure/layout correction is planned;
no passing geometry/UI-eye, phone, later-width or whole-cohort claim follows.

The expanded mounted-move sourcecb39c804 is published only after Astra full review
37eab500 and exact successor13629e22. Its original9415 positive prefix remains
byte-exact. The first private positive graph accidentally formed a cycle; the
unexecuted successor changes only counterpart→moving to counterpart→local, retaining
both cross-package directions and one local edge with an acyclic graph. Those
private predecessors remain preserved. Publication/readback19:56:07.563Z records
all other18 source and41 context pins unchanged;24 titles were static, not observed
passes. Only the named same-parent case then runs:1/0/19 assertions,23 filtered,
original0/null, selected stop1 settled, descriptors closed and no cleanup failures.
The fixture retains its DB, has no acquisition/custody/helper unknown flags, and
full before/after physical snapshots are byte-identical across120 tables. Maximal
safe revisions and an actual incident blocker coexist with unchanged200/no audit.
Packet: /tmp/puni-work-package-move-mounted-same-parent-native-v1/. Other newly
authored mounted negatives, final expanded-backend quality, new formal R5, full
browser profiles, canonical gate and delivery remain unverified by this entry.

### Mounted refusal groups and preserved visibility-premise failure

Separate bounded mounted groups pass malformed1/0/37 assertions, visibility and
permission7/0/103, held-owner5/0/71, and actual machine/consent4/0/54. Each original
is0/null with settled selected owner/descriptors, empty cleanup and unchanged19+41
pins atcb39c804. The malformed case reaches eight schema inputs plus raw malformed
JSON; Root independently compares all nine120-table before/after pairs byte-exact.
All seven visibility/permission custodys settle once; Root independently checks
their ten complete unchanged physical pairs. These observe absence/foreign/hidden
selected-package opacity, destination-before-permission order, organization-create
before content, and restricted creator/write refusal without inherited authority.

The five held-owner cases change exactly membership, direct grant, restriction,
current parent or durable browser revocation after actual request resolution.
Root independently verifies each complete post-change120-table snapshot remains
byte-identical after the owning result; only the intended fixture table changes
between pre-change and post-change baselines. The earlier holder-entry witness is
not independently observed move enqueueing. All five custodys settle once without
unknown acquisition/helper/custody. Machine/consent cases use actual issued and
verified credentials; all120 tables enter the post-authentication baseline. Machine
last-used and token-issue audit effects and consent's two consumed delegation rows
are retained, not excluded. Current-row revocation is observed separately from the
earlier contributor-cap organization-create refusal. No later package-write or
successful machine mutation is established. Packets are the named group-native-v1
directories beneath /tmp/puni-work-package-move-mounted-*.

The dependency/allowed group FAILS overall:4 passed/1 failed/101 assertions,19
filtered. Three ordinary incoming/outgoing/held blockers pass; the acyclic allowed
move passes its full expected120-table and audit assertions. The incoming-held
case fails its prerequisite first: generic package GET expected404 but receives200
with a restricted counterpart. Its move is never invoked and it has no post-auth
move snapshot; no hidden-counterpart409 credit follows. Original1/null, selected
owner/descriptors settle, all five Harness closes settle once and retain their
databases without unknown custody. Root independently reads those custodys and the
three reached unchanged negative pairs. Packet:
/tmp/puni-work-package-move-mounted-dependencies-allowed-5-native-v1/.

Source tracing explains the incorrect witness: general readWithin/find scopes by
organization and is intentionally unchanged by task3.4. The new project-detail
reader independently filters children/count using actual package.read authority.
A private test successor will observe the persisted restricted counterpart omitted
from that actual project response while the moving package remains present. No
production general-read policy change, fake permission result, changed grant setup
or weakened expected move body is proposed. The failed generic-GET premise remains
preserved. Configured five-root backend TypeScript on expandedcb39 fails only nine
TS4111 index-signature property accesses in the new test; original2/null, diagnostics
retained in admitted-move-v4-types.log. Precise bracket-access corrections are
separate private edits, with no cast or guard removal.

The test-only header disclosure5098 publication preserves the original208988-byte
Page-test prefix. Its one focused View case reaches actual fixture metadata then
FAILS at visible destination expected null/actual inline select,0/1 with165 skipped.
Later disclosure/select/Escape assertions are unreached. Original1/null, stopped/
reaped owner and closed descriptors, no cleanup,38 source hashes unchanged; raw
16942 bytes hash060161126951918b8a91e916faa6b01c70ad019aeca48480ee5af9e70db8e4c0.
The private header implementation remains unpublished. Astra source reviewd947a5cf
requires a four-entry navigation-height oracle and actual modal-close autofocus;
prefocusing the summary does not suffice with installed Radix. No source review,
ordinary negative or preserved historical Proof establishes formal R5, complete
browser/HTTP coverage, canonical gate, delivery or task closure here.

### Mounted move: corrected witness and final coherent 24-case run

The test-only successor retains the failed generic-GET prerequisite unchanged in
its earlier evidence. It instead observes the actual current project-detail reader:
source project200 contains only the moving package, count1, while the restricted
counterpart remains persisted at that parent. Initial retry13e70ad8 fails another
fixture prerequisite before moving: updatedAt expected null but actual creation
sets it to the creation clock. Source tracing of auditOnCreate confirms this rule.
Astra4de7b0ed and exact acknowledgementcf1b8be7 review the successor; only that
expected field changes to world.clock.at in735b95fa. The owning incoming-held case
then passes1/0/22 assertions,23 filtered, original0/null and settled cleanup. Its
exact409 is reached; Root independently compares the complete120-table before/after
physical snapshots byte-identical. Earlier failed prerequisites receive no move or
privacy credit. Packets: /tmp/puni-mounted-counterpart-incoming-held-native-v2/
and /tmp/puni-mounted-counterpart-incoming-held-native-v3/.

Nine TS4111 accesses receive bracket syntax only. Two test lint fixes retain all
failure causes: MoveFailure becomes an interface, and the selected close observation
runs after catch-only primary tagging rather than throwing from finally. All modeled
outcomes still pass through that observation; thrown undefined remains represented.
Configured core/SQLite/contracts/backend/MCP roots then pass0/null with no diagnostics.
Formatting changes only controller layout, preserves semantic AST/bindings/comment
bytes, and stabilizes on the second pass with check0. Final controller hash is
27e4da4b60e0ac752dbf21c915b315ad5391197c443479b512dc01ed644425e2.
Exact19 uncached lint passes0/null with no diagnostics/warnings. Context19+41 is
move-mounted-final-context-v6.json, SHAeb0c426d7dc681a1d494f337342ef87e042e0b86da0bbf72cccb57dc611404e1.

The whole mounted file runs together at that final source:24 passed,0 failed,
406 assertions,21.11s, original0/null and clean selected ownership/descriptors.
Root reads the complete original transcript and all24 fixture custodys and rechecks
all60 source pins. The23 added fixtures retain their databases; the original
positive fixture deliberately removes its database through its existing composition
close. This is not a global process/descriptor or operational cleanup proof.
Packet: /tmp/puni-mounted-final-24-native-v6/. No formal mutation-proof, full browser,
canonical host gate, delivery or parent task closure follows from this scoped run.

### Header implementation publication and closed-details oracle failure

Astra source review1bb0a4b clears the11-path implementation after the four-navigation
height oracle correction and actual Radix close-autofocus callback. Focus restoration
checks the exact opening token, current catalog/publication epoch and connected
summary. Publication08473634 records10 changed paths and the unchanged picker test.
No geometry threshold,144px picker floor or900px breakpoint is weakened.

The first focused View attempt on the published source still fails its first query:
1 failed,170 skipped; original1/null, settled owner/descriptors and empty cleanup.
It receives the new styled select from queryByRole although the disclosure is closed.
Later open/select/Escape assertions remain unreached. Raw17691 bytes hash
caff8d7c8876c3b15ab011a0011fb8126d8ac3113e90792abd1dce3be8e8d434,
/tmp/puni-current-header-parent-layout-disclosure-green-v3/.

Root reads the installed role helpers and visibility matcher, then runs a minimal
actual-library probe: closed native details yields open:false, foundByRole:true,
visible:false; opening gives true/true/true; closing again false/true/false. The
role-query implementation checks hidden/aria-hidden/computed CSS but has no details
rule; jest-dom explicitly checks a details ancestor's open attribute. The test-only
successor will require native closed/open state and actual visibility, preserving
true absence assertions elsewhere. No production aria-hidden workaround, passing
focused successor, modal/focus group, later-width/phone geometry or UI-eye closure
is claimed in this entry.

### Disclosure oracle successor and complete owning View files

Astra c756e78b clears the test-only successor22d33259. Root's first publication
inverse guard refuses before writing because Root treated character offsets as byte
offsets; the corrected character-unit check reconstructs the full582ddcdb preimage.
No application failure or feature proof comes from that preflight refusal. The
published successor changes only the three new disclosure/modal/outside cases,
requiring native details open/closed state and actual select visibility before
interaction. All genuine loading/refusal absence assertions remain unchanged.

The eight focused cases then pass8/0 with182 skipped,9.36s, original0/null,
settled selected ownership/descriptors, empty cleanup and all38 pins unchanged.
Raw1448 bytes hash9211fbffcd288a086014d0c487120c799e0ce32229950e991e96500f4cae95ca,
/tmp/puni-current-header-parent-layout-focused8-v5/. This reaches real dismissal,
retained explicit selection, actual modal close and the three focus-ownership
controls; it is not independent necessity evidence for each focus predicate.

Configured frontend TypeScript passes0/null without diagnostics. Exact11 lint
fails5 errors/0 warnings: one import ordering error, two preserve-caught-error
reports in the existing trusted fixture helper and two void callback expressions.
A body-only successor adds precisely scoped exceptions retaining opaque credential
JSON parse errors and ordered primary-login/cleanup causes, and braces the two
matcher callbacks. It leaves guards, error bodies and cause order unchanged.
Current helper e81b847c and Page test39e52ee9 are published; imports/format and final
lint remain pending at this epoch. Packets: current-ui11-v1-types/lint beneath
/tmp/puni-summary-approved-v1/ and /tmp/puni-current-header-body-quality-v3/.

The four complete owning View files pass195/0,32.67s: Page171, NewProjectDialog9,
ProjectPicker5 and OrganizationGate10. Original0/null, settled scoped owner and
descriptors, empty cleanup and all38 pins unchanged. The raw73171-byte transcript,
SHAedbf48547a6f4e65e3f28933d3fb0d24f73db3474b9c5765c1fd02fe050c8c53,
retains React act warnings and the expected Error Boundary diagnostics from the
identity-preserving failure cases. Root reads the complete nonrepeated output and
counts the exact repeated warning template separately; no zero-diagnostic claim.
Packet: /tmp/puni-current-ui11-full-view-v1/.

### Real header width: improved height, still failing 900px overlap

The existing one-row browser case runs on the new UI against the real ordinary
stack. All three heights satisfy the unchanged56px bound and all three widths
have one row. Outer overflow is0 at1280 and1024, but18px at900, so the case fails
0/1 at its final geometry comparison. Original1/null, scoped ownership/descriptors
settled, cleanup empty and all80 declared pins unchanged. Root views the actual
900px screenshot: organization/account chrome overlaps New/Saved controls. This
is not fixed by reducing outer overflow alone. Raw5307 bytes hash
ce062f96e33971c5655ba2f9d38d5c5dd2a1f502fe26726350f43c0615204269,
/tmp/puni-current-header-real-one-row-v4/.

Astra's bounded successor plan2a0e81c3 groups existing Rename/New into the single
page-owned actions disclosure, leaves the rename input and Saved plans in their
existing locations, and first adds actual visible-leaf allocation/overlap checks.
A phone-only Plan-actions slot cannot fix900 and is absent on empty/Board screens;
nesting Saved plans would also require changing the existing ancestor-dismiss
contract. Neither alternative is silently implemented. No new geometry, phone,
long-name, keyboard/browser-completion or UI-eye success is claimed here.

### Local-only browser routing: two owning REDs before production

Only the two reviewed test sources are published: confige8c5c610 and workflow400601f0.
All eight before-states and190 declared runtime/context pins are checked before any
write; both readbacks/modes and the remaining source states match. Configv2 restores
E2E_PORT_SHIFT and E2E_TEST_DATABASE as well as the regular-channel flag, including
absence; Astra c756e78b clears that exact correction. Publication is
/tmp/puni-e2e-local-profile-test-publication-v1/publication.json.

The registered Node/Vitest routing case, explicitly run with Bun and a canonical
run database path, fails its first intended assertion: quiet-load exclusion is
false, expected true;1 failed/37 skipped. It imports only the existing config and
reaches no absent-module failure. Original1/null, settled selected ownership and
empty cleanup; raw5073 bytes hashe0e739fd19c7b543603d6e67ff78458ec0d14214db93c61bf725099990e26f06.
The separate actual-YAML workflow case fails its first intended assertion:0 exact
local target steps, expected1;0 passed/1 failed/11 filtered/1 assertion. Scratch
cleanup returns and original1/null settles cleanly; raw1061 bytes hash
e6e5d992861ea6b547c85508f0bf613a436268d4b11070d7955c2cb48464eb9a.
Packets: /tmp/puni-e2e-local-profile-config-red-v1/ and
/tmp/puni-e2e-local-profile-workflow-red-v1/. Later workflow arithmetic/artifact
assertions are not reached by that selected RED. Production local profile remains
private/unpublished, and no local runtime/noise/feature-off success follows.

### Measured header allocation and nested-hook test-first controls

The appended test-only header e5a491b0 preserves the complete52761-byte fa28 prefix.
Astra6537a334 clears the13 exact current leaf selectors and top-level real fixture.
Its actual browser run fails0/1 at the intended allocation assertion, original1/null,
settled selected ownership/descriptors, empty cleanup and all87 pins unchanged.
Project actions ends648.890625 while its allocated group ends635.28125. Before
assertions, real numerical output records319.15625px allocated versus601.59375px
content and five positive-area intersections with organization/account chrome.
Raw9293 bytes hash22ab6499f36cd4ee32a841d96ba530a359b17a0204ecb9addd6d54824d710493,
/tmp/puni-header-900-leaf-red-v1/. Later assertions are not claimed reached.

Measured Rename/New widths plus gaps save only127.375px, insufficient for the
282.4375px overdraw even with a shorter summary. Root therefore does not implement
that known-insufficient predecessor. Astra v3 plan8aeb03af groups Saved plans too,
uses one72px Actions summary with full accessible name,96px organization bound and
8px header gaps, retaining all existing height/picker/breakpoint limits. Its predicted
margin is not browser success. A single shelf at all widths requires deterministic
nested native disclosure behavior rather than an unreviewed extra panel instance.

Root publishes eight hook tests0569592e preserving the original5218-byte prefix,
with production a4511cbb unchanged. Actual new-suite run is3 passed/5 failed/9
skipped. Reached failures cover rapid ancestor close, queued child close, inner
Escape closing the ancestor, body-origin Escape closing the ancestor, and Tab into
the outer losing that outer. Inside/outside pointer and Tab outside controls pass.
Original1/null, settled selected ownership, empty cleanup and40 pins unchanged;
raw6461 bytes hasha904cd84dd270346b157889deddb0c03fec71dc7f90a23468aa4329fa2edebf0,
/tmp/puni-nested-disclosure-red-v1/. Unreached later assertions receive no credit.

A separate natural hidden-branch case e0d53134 preserves that entire11159-byte
predecessor. Actual native outer-summary close leaves the inner open attribute
behind; visible outer/hidden inner/focus prerequisites pass. Body Escape then
emits one inner-focus event, expected zero, so1 failed/17 skipped at its owning
assertion. Original1/null, scoped settlement clean and40 pins unchanged; raw3374
bytes hashfe3ba14ff21b77f950c07c0bee25f635e1ec039138eb888c3607e05b5399f39d,
/tmp/puni-nested-hidden-branch-red-v1/. Hook production remains unchanged in these
RED epochs. The private correction must treat an open ancestor/descendant chain as
one branch, prioritize eligible inner Escape and exclude hidden open descendants.
No source mutation/omission or new adjacent Proof is claimed by these ordinary REDs.

### Local profile publication, configured quality and complete owning checks

After Astra73c26736 source clearance, seven exact bodies are published; the eighth
workflow test is unchanged. All before-states/context and all readbacks match.
The real-main startup wrapper owns fresh retained DB allocation; discovery has no
DB allocation, ordinary activation, global setup or storage state. Actual main keeps
optimizer/version/supervisor ownership. Publication:
/tmp/puni-e2e-local-profile-live-v1/publication.json.

Configured frontend/backend types pass0/null. Initial six-TypeScript lint fails6
errors/0 warnings: import ordering3, dynamic delete, array-index absence guard and
ESLint project-service registration for the local config. Transitive compiler
reachability alone is insufficient for that service. A precise successor checks
Reflect.deleteProperty during test cleanup, uses .at(0) retaining the undefined
refusal, and explicitly includes the local config in tsconfig.spec.json. This
necessary ninth path follows the actual tool failure; no application policy changes.

Root's import-only pass covers six scoped TypeScript files and the shared ordinary
helper:4 change, all non-import statement bytes/parser comments/import bindings stay
exact. Format10 (quiet9 plus helper) changes4 layouts; second pass is byte-stable and
check passes0. TypeScript semantic AST/comments, JSON structures and workflow YAML
bytes remain exact. Final configured frontend/backend types and seven-file uncached
lint both pass0/null with empty diagnostics and settled scoped ownership. Final10
source freeze1dc61a9ab8616c7ae9d9dec746a2fe0eaefee6b1cfb9ece870f866cfc32e50e8 is
/tmp/puni-summary-approved-v1/quiet-quality-v2-source.json. Helper is3b0f86ad.

The first full44 Node file fails43/1 because Root supplies a /tmp database while
its existing default-path case requires workspace tmp. This runner-input failure
remains preserved at /tmp/puni-e2e-local-profile-node-owning-v2/, raw5654 bytes hash
1b46f77216f0ec5030053cb7ccff704b6c8202a5d66b8714e91b6f691abdcba8.
No assertion/source is changed. A fresh canonical workspace-tmp input then passes
all44 in20.24s, original0/null, clean scoped settlement and all10+48 pins unchanged;
raw1698 bytes hash9831f1769b28f046ea0a6ca6e6c34fb17e4e77073d3c78ac1d2aded7577af048,
/tmp/puni-e2e-local-profile-node-owning-v3/. Vite future-loader warnings remain.

The complete actual-YAML workflow file passes12/0/148 assertions, including all
shard budget/artifact oracles and the required unsharded local target. Original0/null,
clean scoped settlement, scratch hook returns1ms and all10+48 pins unchanged;
raw1554 bytes hashd03ba59ac74554b80e7ed6f86d30f72f2fca2ed537a973498f015a7f5cf67061,
/tmp/puni-e2e-local-profile-workflow-owning-v2/.

The real installed Playwright collector independently lists exactly the three
quiet-load titles, chromium only, errors empty and executed result arrays empty.
Its owned TMPDIR stays empty, with no pinned startup-wrapper allocation prefix.
Original0/null, clean scoped settlement and unchanged pins; raw3700 bytes hash
2b9f5f059f1fbadd8ebbe5d37a0017765e1f2552824205678cbbbcfe6ba684cc,
/tmp/puni-e2e-local-profile-local-list-v2/. This is collection evidence, not three
browser passes or global database/process absence. Real local runtime/noise, further
collector profiles, formal R5, canonical gate and whole-goal closure remain open.

### Real local profile and Project reachability regression

The first actual local three-page browser run finishes 2 passed/1 failed in23s,
original1/null with scoped ownership settled and all105 source/context pins stable.
All three real session responses reach200, strict-schema validation, local-dev and
both reported feature flags false. Organization and Spaces pass; Home fails the
unchanged noise oracle on GET /api/projects403 plus the browser resource error.
No collector is suppressed, backend policy relaxed or empty success manufactured.
Raw5585 bytes hashc5960d19d937d6a8bced47e5a4514cea82ef7fa45eb8e9c508e87207e35073f5
is /tmp/puni-e2e-local-profile-real3-v1/native.log. Real backend/Gateway/Vite run;
the private retained database receives metadata-only inspection. Forced service
termination provides no graceful database cleanup or global descriptor proof.

Source tracing identifies Page's unconditional project-list effect. The existing
validated SessionFeaturesProvider and useFeatureReachable preserve requests for
older backends without features, and explicitly reported false must make Project
actions unavailable without blocking ordinary package navigation. Astra's bounded
four-file plan is /tmp/puni-project-feature-off-astra-plan-v1.md, hashceb75453.
It requires distinct availability identities across true/false/true, composing all
existing catalog/publication/attempt/import/modal guards; an old dispatched write
may commit and is never described as cancelled or rolled back.

Test-only Page258c02cd composes the provider import and one appended regression
onto8582057b, preserving the Saved-summary readiness wait and all earlier bodies.
Publication /tmp/puni-project-feature-off-v2/publication.json is recovered and its
live readback matches. The literal owning View case then fails1/173 skipped at the
first intended assertion: after real Page package-list and picker prerequisites,
listProjects is called once, expected zero. Original1/null, scoped settlement clean,
all49 pins unchanged. Raw17540 bytes hash30562914747080c00568eb8d2cd86217f9f79b99ae011355176ccaa5828e589c
is /tmp/puni-project-feature-off-red-v1/native.log. Later inactive/disabled/navigation
assertions remain unreached. Production remains unchanged at this RED epoch; this
ordinary regression supplies no per-guard R5 proof.

### Grouped actions publication and observed geometry

The reviewed17-path V3 source freeze9259708b and complete patch466770f6 publish14
changed bodies with all17 before/readback observations matching. Production Page is
62047b68, AppHeader0daa65b8, dismissal hook903221d1, OrganizationGatea455cd5a.
One native Actions branch contains Project actions and the single Saved shelf;
Rename input and view controls stay outside. Nested disclosures form branches,
Escape prioritizes eligible visible descendants and hidden native-open descendants
do not receive focus. Historical Proof comments are preserved, not newly proved.
Publication is /tmp/puni-header-branch-grouping-live-v3/publication.json.

The initial source review missed two Playwright summary role selectors. Root read
the installed implicit-role map: native SUMMARY has no implicit button role there.
Correction review4cc22664 and exact bridge2e777af4 replace only those two browser
selectors with banner-scoped native summary locators. No production role is added;
Astra acknowledges the corrected V3 freeze. No isolated browser probe is claimed.

All18 owning dismissal-hook tests pass, original0/null and48 pins stable. The full
four-file View run reaches196 passed/1 failed out of197 in33.10s. The sole new
resize-shelf case inspects before asynchronous runtime opening has joined. The
exact test-only successor adds the same actual Saved-summary wait used by its
neighbor, preserving count and node-identity assertions. That focused case passes
1/172 skipped, original0/null and48 pins stable. This does not turn the preceding
full197 run into an all-green run. Evidence directories are
/tmp/puni-header-branch-grouping-full-view-v3/ and
/tmp/puni-saved-shelf-readiness-green-v1/. Expected React act warnings and two
ErrorBoundary diagnostics remain recorded.

The actual six-check real-browser run finishes4 passed/2 failed in39.1s,
original1/null with95 pins stable. Laptop1280/1024/900 stays one row and within56px;
picker/roster checks pass; all ten closed900px leaves are visible inside their
allocated groups with zero intersections. Observed900px header height41, package
group343.15625, picker151.09375, Actions72 and Organization96. Phone navigation
touch targets also pass. At375px, Plan height149 exceeds104 and Directory101 exceeds56.
Both screenshots show account/organization/presence taking an extra row. Later
assertions after each failed height receive no credit. Raw11511 bytes hash
ec2dda1ac798dfa0e9b1fc47db2a2b5206ff0efec3b05f0bc7675e54cf30b51e is
/tmp/puni-header-geometry-six-v3/native.log. Phone compact presentation is still a
private reviewed-plan task; no threshold, navigation target or geometry limit is
weakened. Newer Header source configured types/lint/format, full owning successors,
quiet three-page replay, formal R5 and canonical gates remain unverified.

### Parent-authority baseline and current header quality

The private foundation fixture V3 is published test-only, hashf1a776ad. The seed
uses three real current projects and current created_by/project_id columns while
retaining all earlier package IDs, mappings, memberships and restrictions. The
second database connection now uses returned openConnection.close; a local reverse
acquisition stack attempts all selected cleanup, consumes attempts once and keeps
the primary plus cleanup failures. This owns returned acquisitions only: internal
API failure before return and injected cleanup failures remain unproved. No new
Proof comment, global FD closure or production permission change is claimed.

The first actual literal SQL case reaches its intended aggregate failure after
current migrations, seed, real parent rows and no-grant prerequisites succeed:
the actual project grant gives null detail permissions/provenance and an empty
listing, expected the two actual children. Sibling/foreign outcomes remain empty.
Original1/null, scoped settlement clean,241 named/migration pins stable; raw1389
bytes hash7d65c916e913ac0146357dcf73e492fc2b421889f7590d2b0f1a231fc7976885
is /tmp/puni-parent-foundation-red-v1/native.log.

The complete owning file then executes50 cases: all47 existing interim cases pass,
all3 new foundation cases fail,279 assertions,27.69s. The parent-budget case reaches
reads true and edits false but budget permission/provenance false. The membership
case actually removes membership and retains its grant; after-state is null/empty,
but the required before-state is already unreadable. It therefore supplies no new
membership-guard necessity proof. Original1/null, clean scoped settlement,241 pins
stable; raw10292 bytes hashfef6a158afdfe06c761ca59ba3d8d130047cccbbec64dbea15d1bf5cdcd90f64
is /tmp/puni-parent-foundation-owning-v1/native.log. The existing interim-policy
expectations remain deliberately unchanged until a coordinated successor.

At Header17 plus the test-only Page258 and foundationf1 epoch, configured frontend
and backend typecheck passes0/null with empty diagnostics and289 pins stable:
/tmp/puni-current-header-quality-v1/types.receipt.json. Uncached18-file lint then
fails9 errors/0 warnings: six import-order findings, two unnecessary textContent
optional chains in the browser geometry test, and one test-fixture void-arrow
style finding. Root applies only braces to that cleanup arrow, preserving all
seed/test/Proof bodies; current fixture976d9d4d then passes its single owning
uncached lint0/null, /tmp/puni-parent-fixture-lint-v1/. Full18 lint is still open;
this does not claim a type or50-test rerun at976.

Astra's first foundation roster91aaa6bc identifies actual parent construction and
strict scoped reads; fixing test-facing packageTargetOf alone is insufficient.
Public read projection, queued create/import/move, current-parent budget/replay and
memory authority remain coupled before final cutover. The ten-path phone plan and
caller census are reviewed clear at5db71152, requiring synchronous registration
deactivation including all old callbacks and pending Tab work before passive
cleanup. Test-first preparation is private; no phone implementation or fit is yet
claimed. Operational leases and whole-scope completion remain unchanged.

### Project reachability source and real local successor

Root reads the complete production2 patch04d23191 and all write, reconciliation,
retry, finalization, import and focus contexts. Astra745b43fc clears the exact
Page/Picker source boundary, with lifecycle controls and quality still pending.
Two exact bodies publish at /tmp/puni-project-feature-off-first-green-v1/publication.json:
Pagedd2b096e and Picker1e6f2b7d. Existing test258 is unchanged. The original known-false
case passes1/173 skipped in5.84s, original0/null, clean scoped settlement and289
pins unchanged. It reaches no project dispatch, explicit unavailable/no empty or
retry state, disabled creation, and actual existing package navigation. Raw6508
bytes hasha80af17b74f86b03df5665e2e2106c4ee6fa7e5e080fd565ba760f8334191b47
is /tmp/puni-project-feature-off-first-green-v1/native.log. React act warnings remain.

The unchanged actual local profile then passes all3 pages in20.6s: Home,
Organization and Spaces. Each retains real session200/schema/local-dev/false-feature
assertions and the exhaustive refused-request/browser-console collectors. Real
backend/Gateway/Vite build1203 modules and serve the pages. Original0/null, scoped
settlement clean;373 selected source/context pins match before/after. Raw2892 bytes
hashff72fe400028e393ca0803c7bb196d47fc865b230a29d348e4d3ecb97d3c1b32 is
/tmp/puni-e2e-local-profile-real3-v2/native.log. Four reviewed source changes from
the first failed epoch are explicit; no timeout/channel/install or collector changes.

The first HTML/JUnit nodes are retained by exact same-device/inode renames at
tmp/puni-local-browser-reports-first-failure-v1, with metadata receipt in
/tmp/puni-e2e-local-profile-real3-request-v2/artifact-retention.json. The new run
uses a fresh private TMPDIR/database and its own test-results; configured reporters
remain active. New4096-byte0644 database remains readable in its private0700
startup directory. Only path/type/mode/readability metadata is inspected: no DB,
cookie, storage-state or browser-profile contents/hashes. Server-process warnings
remain in raw output; no solver request, graceful application cleanup or global
process/FD absence is claimed.

All four existing frontend owning files subsequently pass198/0 in33.54s:
Page174, NewProjectDialog9, ProjectPicker5, OrganizationGate10. Original0/null,
clean scoped settlement and289 pins stable; raw78220 bytes hash
643e529bc56ee3c501d965b6399862a7c4bb8e23c018643def98ff16cb5a8b74 is
/tmp/puni-project-feature-off-owning198-v1/native.log. Root counts the exact
repeated act-warning template by component and reads all27980 remaining bytes,
including both expected ErrorBoundary publication-failure controls. No warning-free
claim is made. The17 additional availability Page controls and one inactive Picker
control remain private/unrun at this epoch; later test publication cannot inherit
this198-pass result. Configured quality after production2 remains open.

### Phone dismissal registration owning negatives

Nine append-only hook controls preserve the old18-case prefix. Astra b89cc4a6
clears the immediate connected-node probe after the real callback ref(null),
before returning to React. A narrow queued-Tab custody successor always attempts
cleanup and real-clock restoration, preserves tagged primary including undefined,
and retains all cleanup failures; Astra89491728 clears that exact correction.
Test16eba0d4 publishes while production903221d1 stays unchanged.

All9 new cases fail at their intended owning observations,18 skipped: peer
activation finds the wide node still marked and closes it; Escape closes it and
steals outside focus; outside pointer closes it; old toggle/summary dismiss peers;
Tab schedules1 check rather than0; already queued Tab closes wide content; reentry
and StrictMode retain stale markers. Later assertions after those marker failures
remain unreached. Original1/null, clean scoped settlement and289 pins stable;
raw11321 bytes hash5c277dfe08503f95721e52a4a356e6e3ff972a7bd56864ad6a3db80a8f0c2193
is /tmp/puni-phone-dismissal-red-v1/native.log. The unawaited-act warning is retained;
these ordinary REDs provide no individual guard-omission/R5 credit.

The private phone10 implementation is source-reviewed at9fe9429d. Production
callback disposal and persistent account subtree are coherent. Its new phone
geometry test needs a precise census correction: compact Plan/Board controls live
outside the banner, so the header has7 measured leaves, not9. Desktop900 retains
all10. No production relocation or weaker original geometry limit is proposed.
Phone source publication,38 owning controls, actual geometry and configured quality
remain pending. Parent foundation is also private: Root reads its full13-path
patch, then finds additional required move/conformance and backend type callers.
The author seals a20-path successor; no parent policy is yet published or activated.

## Integration continuation, 2026-11-14: parent authority and responsive UI

These are successive source epochs. Earlier failures, raw logs, historical Proof
comments, frozen formats and their hashes remain evidence; later green results do
not erase them or establish the remaining entity/CLI/activation scope.

### Availability and phone integration

The previously private seventeen Page availability controls and one inactive Picker
control publish separately and pass18/0,179 skipped, in9.80s. Raw1357 bytes SHA
63be4eac62ed763da859418148f61d0825a02b0e1d11b4b95f6c07cc179e1eff
is `/tmp/puni-project-feature-off-controls18-v1/native.log`. The actual namespace
spies exercise stale list, dialog, create and FileReader/import continuations;
Picker's extra test establishes inactive presentation only.

The reviewed phone implementation publishes9 changed paths with10 readbacks in
`/tmp/puni-phone-header-owning38-v1/publication.json`. Account and organization
content keeps one subtree, behind a44px summary below768px and open/unregistered
above it. Callback-ref disposal removes registration synchronously. The compact
header census correction excludes Plan/Board controls outside the banner; existing
desktop900 ten-leaf assertions and104px/56px phone height limits stay exact.
The owning38 pass in4.88s. Raw1640 bytes SHA
f8534c73afaef398fb9224fd436594f8242182e3aaf1e1efa1e699f323f04ae4
is `/tmp/puni-phone-header-owning38-v1/native.log`.

The actual browser nine pass in45.3s. Raw13746 bytes SHA
cacfce6ba34c29699c544e37a58b2a34563d3da852b97fe290255a1739931624
is `/tmp/puni-phone-header-browser9-v1/native.log`. Phone Plan/Board measure101px,
Directory53px; all7/5 measured leaves have44px targets, remain in allocated groups,
and have no intersections. At900px the header is41px and the Project picker is
151.09375px, above144px. Laptop1280/1024/900 and the1440 readability roster pass.
Real nested organization/account controls and two successive Escape focus returns
pass on Plan, Board and Directory. Root views both passing phone screenshots in
that run's `test-results` directory. The selected empty package body is not an
empty-home or whole compact/mobile cohort proof. No graceful application/store
cleanup or global process/descriptor absence is inferred from process teardown.

An import-only correction changes6 of25 selected paths while preserving other
statements, bindings and comments. Thirteen test void-arrow fixes add braces.
Formatting24 UI paths first trips the strict semantic oracle on one native
OrganizationGate paragraph's Tailwind class-token permutation. Root reviews that
exact permutation; a bounded path/literal exception admits only the same token
multiset there. Changed-class, added-class and other-path private controls refuse.
The second formatting write is byte-stable and its check passes. These oracle
controls confer no UI production R5 credit. Parent test preimage976d9d4d is excluded
from this UI formatting epoch. `/tmp/puni-ui-final-quality-v1/final-source.json`
b540c28694558825b4a705be69248c843bdcad11194c4cd80683cf7bc81721b6
binds configured FE/BE typecheck0 and25-path uncached lint0.

At that source epoch the seven owning UI files pass254/0 in39.35s; raw61497 bytes
SHA0d70b787c027709e9c3974f1bbdded96aa80f3e057645ddd9c5b01344f2ffc52
is `/tmp/puni-ui-composed254-v1/native.log`. Root reads the complete output after
counting the exact repeated React act-warning template. Expected ErrorBoundary
diagnostics and the unawaited-act warning remain recorded.

Necessity review identifies nine redundant active fences and one redundant
nonnull focus term. Root and Astra review their exact removal before publication
in `/tmp/puni-phone-lean-owning38-v1/publication.json`. All38 unchanged tests pass
in4.75s, raw1640 bytes SHA
8b0ba49b9bf95c1b2c628ee808437e95f623430005342d88fafe4539bc40dd1f.
The browser nine and b540 quality above precede this lean source; they are not
silently relabeled as later-source results.

### Current-parent permission foundation

Root reviews the original13-path patch, all7 required caller additions, then the
explicit real-parent backend fixture successor. The20 paths publish together in
`/tmp/puni-parent-foundation-first-green-v1/publication.json`, from the roster
`/tmp/puni-parent-foundation-implementation-v3/source-candidates.json`. Core targets
require the actual WorkPackageChain. SQL detail and listing acquire matching actual
parent grants together; strict package/map/parent observations validate selected
trusted state before authority. Valid foreign mappings are concealed before foreign
content decoding. Raw move, retry and capture callers forward the actual parent.
Purpose-export memory authority recognizes matching built-in project grants; this
does not establish a general full-memory authorization adapter. No migration,
frozen document, saved bytes/hash, journal or wire format changes in this foundation.

The original project-grant foundation case changes from its retained RED to1PASS,
54 filtered,4 assertions in3.12s; raw316 bytes SHA
b0d6680983611f85c2ba7e720a0198e1b4e775b83cd2b6f293f189f38a134abc.
The first complete55 run passes54 and fails1,296 assertions in30.27s; raw8687
bytes SHAa60a76cb0faa861e172e20688df7ef71971ef56f28a54ccecee7b727fd220c56
is `/tmp/puni-parent-foundation-owning55-v1/native.log`. Its sole failure occurs
before the owning read: the test's corrupting UPDATE is rejected by the existing
project-organization update trigger. This is a setup failure, not a reached decoder
negative. The successor test transactionally retains the exact trigger SQL, drops
only that trigger, installs the invalid foreign parent, and restores the trigger.
Complete schema equality, enabled foreign keys and an empty foreign-key check are
asserted before production readers run. The corrected single case passes7 assertions
in3.12s, raw315 bytes SHA
4d05d6adfd60cb4991e5cbc2cfa2192058be0abdc6bcfd3f95e682db771d4296
in `/tmp/puni-parent-foreign-corruptor-v1/native.log`.

Configured types then expose three test-only widened permission-array errors. An
explicit domain Permission array annotation fixes that fixture; it changes no
assertion values. A fresh complete run subsequently passes all55,303 assertions
in30.28s; raw7755 bytes SHA
1672615fbec89233a9f296bde23a60f1a6bf5d0966010797fe1ca00edcb6fb09
is `/tmp/puni-parent-quality-access55-v1/native.log`. Core authorization and memory
plan export pass22/0,60 assertions in2.48s; raw2301 bytes SHA
9200a298dd7b01d77f4c4d471e13e29db586ce2a461bc05a7d666604b84aa032.
Organization authorization passes33/0,69 assertions in18.81s; raw3866 bytes SHA
85ec160d3d9b3c30a1b195517c4c120367009a46b3f6a6b280040d03335819ab.
Their logs are under `/tmp/puni-parent-quality-core-memory-v1` and
`/tmp/puni-parent-quality-org-sql-v1`. All originals have null signals and clean
scoped settlement;378 pinned source bytes/modes remain stable per run. This is not
public P3 policy, queued-write/budget-replay completion or operational cutover.

### Reviewed Page cleanup and one independently observed disclosure fault

The four redundant Page predicates are removed only after Root/Astra source review.
All availability identities, updater ownership and attempt/publication guards stay.
Four tests add old POST settlement before any replacement dialog and actual initial
and retry storage writes throwing undefined through the owned runtime and real
FaultBoundary. Private V1's incorrect empty-ready combobox expectation is corrected
before any execution: the real empty Picker has status plus Refresh, no combobox.
V2 holds delivery of an actual restored GET response captured before the old POST
commits; that makes invalidation of the fresh metadata epoch observable. Source
review4ec590f6 distinguishes this prospective witness from masked publication
observations. Publication is `/tmp/puni-parent-page-publication-v1/publication.json`.
All seven owning UI files then pass258/0 in39.98s, including195 Page tests.
Raw61360 bytes SHA635cdebf531c56200bd696eee20357cbbd1d5c878d7d256e2c8184a08e687806
is `/tmp/puni-parent-page-owning258-v1/native.log`. Root counts110 exact repeated
act-warning blocks and reads all20101 remaining bytes, including four expected
ErrorBoundary diagnostics. This ordinary run is not Page guard-omission proof.

For disclosure marker removal, Root and Astra review the finite proposal in
`/tmp/puni-phone-marker-flight-v1`. One private source copy omits only the unique
`panel.removeAttribute(DISMISSIBLE)` line; a Vite load overlay returns those bytes
under the exact production module ID, preserving relative imports. Live source
remains50a32dab throughout. The selected connected-node deactivation test passes
canonically1/26 skipped, then fails1/26 skipped at its first owning observation:
the retired connected panel remains registered and an unrelated active peer closes
it. The actual load receipt binds the production module ID and private8dc7b2ec
source. The fresh canonical rerun passes1/26 skipped. Raw hashes are
edf567168f7a2e185b3b85d749cc9f1aea79b724929cf505df9de40f952b002c,
329773a2aa904a654f7df2d126ea73511b0a173720ef1543006ec6e46f9ba389,
and65fd49e357722f2f1547fe5b8b61a3ca546c423d7c44f5864f005a765e9cf8f0.
Each original settles cleanly with all35 selected closure pins/modes unchanged.
The408-byte overlay receipt SHA598c35e3fcd70964225e0256ca0b9ee18d8681586a43e2daa3f2b1f8ff553227
is unchanged across the final canonical run. Root records manual adjudication and
an adjacent comment-only Proof in `/tmp/puni-phone-marker-proof-comment-v1`.
This proves that marker-removal obligation in the owning hook path; it does not
prove every listener/timer disposal, all responsive guards or browser behavior.

The first24-path lint run reports31 errors: import order, optional-chain forms,
void Bun expectation typing, missing-await wrappers and the intentional test-only
undefined throw. Original output and clean scoped settlement are retained in
`/tmp/puni-parent-page-lint-v1`. Corrections and subsequent quality evidence belong
to their own successor epoch; this result is not a green lint claim. General public
project visibility, final queued permissions, current-parent budget replay,
settings/spaces, the complete Step Catalogue, CLI installed/client-script inventory,
exact committed host gates and authorized activation windows remain open.

### Scoped quality successor

The precise lint successor sorts imports, uses equivalent optional-chain forms,
removes six awaits of Bun's void-typed rejection matchers, adds four void-arrow
braces, and returns explicit Promises from the two synchronous helpers. The memory
clone remains inside its coordinator callback, with the same outer awaited owner
and failure propagation. An adjacent test-only lint exception names the deliberate
external-storage undefined fault; production failure handling is unchanged.
Root reads all candidate diffs before publication in
`/tmp/puni-parent-quality-fixes-v2/publication.json`.

Formatting24 paths changes18; exact AST, import/export bindings and every comment
match the reviewed pre-format source in `/tmp/puni-parent-final-format-v1/audit.json`.
At this successor, the six configured TypeScript roots (FE, BE, core, SQLite, memory,
conformance) pass0 with empty output;24-path uncached lint passes0 with empty output;
and24-path Prettier check passes0. Original receipts and source bindings are under
`/tmp/puni-parent-current-types-v2`, `/tmp/puni-parent-current-lint-v2`, and
`/tmp/puni-parent-current-format-v2`. Their378 source pins remain unchanged, with
clean scoped settlement. The fresh core/memory22 pass60 assertions in2.43s after
the Promise/assertion syntax changes; raw2300 bytes SHA
f7e19d30335424eeefa77b7f8c89933b63179cd34c7284132a8fc505b61307fb
is `/tmp/puni-parent-current-core-memory-v2/native.log`. Earlier55-SQL and258-UI
runtime evidence retains its actual source epoch; format-only equivalence does not
relabel those runs. No host-wide gate, full backend/CLI target, merge or activation
is claimed by these scoped checks.

### Public project visibility first RED and local availability necessity

Root and Astra review the concrete18-path P3 read plan and append-only mounted
regression in `/tmp/puni-project-p3-read-plan-v1`; reviewd3b063d6 is
`/tmp/puni-project-p3-read-plan-astra-v1.md`. The settled shell is LIST-only id/name.
Detail for that shell refuses403 naming project.read; absent/invisible/foreign
remains404. Full write replies remain separate. The public forbidden descriptor
must keep the whole permission catalogue, even when this route's actual missing
permission is project.read. Settings4.3 and final queued write/budget policy remain
open. The379 selected RED pins do not enumerate every direct P3 producer; private
implementation preimages outside that set are fresh authoring observations, not
invented historical RED source pins.

Only the new mounted test publishes before implementation. Existing21743 bytes
remain an exact prefix; candidate7dc3e230 appends one real activated-Harness case.
Actual combined POST201, the two creator grants, explicit restricted sibling parent
and mapping, Reader's sole persisted package-viewer grant, absence of member grants,
and Creator's full count2/detail succeed. The intended first failure is exact Reader
LIST equality at line611: current E41 returns full parent metadata and another
ungranted project instead of one id/name shell. Original1/null,0pass1fail14filtered,
8 assertions in3.47s; all379 selected pins stable and scoped settlement clean.
Raw1545 bytes SHA3eebe7758af4093ae7c6126314fd6914523baaa8b1224d5e3a376ed221f38ed1
is `/tmp/puni-project-p3-first-red-v1/native.log`. Later403/404 assertions are
unreached, not credited. Private implementation starts after this observed RED;
there is no public-policy success or task completion at this epoch.

The separate Page availability omission receives source reviewff03b88c in
`/tmp/puni-project-post-availability-flight-astra-v1.md`. A private exact-ID Vite
overlay removes only the local creation attempt's availability equality. The
canonical Pagea53ae2b7 and complete195-case test02bbacc5 stay unchanged throughout
the three phases. Canonical baseline passes1/194 skipped in5.48s; the private
omission fails1/194 skipped in5.89s at actual line6228: Loading projects remains
after delivery of the actual restored GET response. The obsolete successful POST
illegally rotates the publication epoch; the retained committed guard stops an
extra GET but cannot repair the already-dispatched read. The fresh canonical rerun
passes1/194 skipped in5.67s. Raw hashes are
1bf104f5d77ec0059545978dfa833fde4ce64f13bffa7f0af0c6794e9d75adbb,
9e4af24927ad6917c19ed9f03abbab8b2d3b6a808c09764d4ca20c2bf8026bf6,
and401597d2899c3b017774453d4470a33f2bb6a3cd25e5e33d02865fe07aa6d9e2
under `/tmp/puni-project-post-availability-flight-v1/{baseline,fault,restored}`.
Every original settles cleanly with402 selected source/tool pins and modes stable.
The actual581-byte load receipt binds the production Page ID and private7aa2dd67
bytes; its SHA36fae0f6a54cdcf94c1461cf164a8655355398b4602f78890acc18b919a526a1
remains exact across the final canonical load. Root records adjudication and adds
an adjacent comment-only Proof, Pagea53ae2b7→18451267, with a byte-exact inverse
in `/tmp/puni-project-post-availability-proof-comment-v1/publication.json`.
This qualifies only that local availability comparison on obsolete successful POST
continuation. Rejection/finally, other conjuncts, focus, fatal causes, updater checks
and browser behavior receive no independent credit from it.

### Project read projections and Bun browser dispatch — 2026-11-14

These are scoped implementation observations, not whole-change acceptance or an activation receipt. The public project list returns full metadata/counts only with `project.read`, an exact `{ id, name }` navigation shell when only a child is readable, and no entry otherwise. Shells apply only to the list: visible child-only detail refuses with `project.read`; missing, foreign and invisible detail share the same 404. Child counts and detail entries use actual package visibility. The SQLite projection filters the actual child's organization map before decoding child fields; malformed owned mappings still throw.

The mounted regression first failed with leaked full metadata and an extra project (`/tmp/puni-project-p3-first-red-v1/native.log`, SHA256 `3eebe7758af4093ae7c6126314fd6914523baaa8b1224d5e3a376ed221f38ed1`). After the reviewed eight-path production publication, the same actual HTTP case passed: 1 pass, 14 filtered, 12 expects, 3.61s; transcript SHA256 `da6ab0addf1e2999117a2bdfb24d969686f784c820b3c4f09f210221f76aef4f`. This ordinary red/green does not independently prove each new safety predicate.

The final 19-path private review and 11-test publication preserve prior Proof comments and historical controls. The map corruption controls restore the exact altered triggers/constraints before exercising the reader; foreign name and ID stay opaque while an owned missing map throws. The focused three cases passed with 40 expects in 4.17s (`/tmp/puni-project-p3-map-controls-v1/native.log`, SHA256 `b447cd4b29dad04f0d761e1f78b768f2f5362320e43e19b13f9928474d290b3e`). Broader scoped results before the later test-only move-fixture correction:

| Command scope                                                                                                            | Observed outcome                      | Transcript SHA256                                                  |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ------------------------------------------------------------------ |
| Bun SQL access-decisions and project-read files, per-case timeout 30000                                                  | 111 pass, 0 fail, 495 expects, 60.66s | `75ade1bd1aba1c51519aa720d34ed81d0745e09d6175c38b2c1e4b0dc900e793` |
| Bun project Resource/routes/contracts files, timeout 10000                                                               | 36 pass, 0 fail, 232 expects, 2.50s   | `ae2431e39e292b829be14734dfcebcdf790b1f53b3095db93ff195691c7abeb8` |
| Mounted project and move files, timeout 10000                                                                            | 38 pass, 1 fail, 508 expects, 32.13s  | `0295b5ca4ee9b7612cdc044eb22d929cbc34dbe99211a443a4bbf1f43d44de9c` |
| Vitest view config: page, project picker, required project API; one worker, no file parallelism, 30000 test/hook budgets | 229 pass, 0 fail, 34.03s              | `b015c829831f2c85244f738aa1014c83fd96727e500d5bbdc17cd32dc88ccf8e` |

The mounted failure retained a real current-parent project-manager creation grant after deleting the direct package grant. The new parent inheritance correctly admitted the move; the old refusal fixture no longer represented absent write authority. The reviewed test-only successor explicitly revokes and verifies the current-parent grant for the negative, and adds a noncreator positive with only current-parent project-manager grants, including revocation/restoration and same-parent/real move assertions. Its two focused cases passed with 39 expects in 4.35s (SHA256 `25ada0f3275a53762a54c4fec04e1b07a6f5b05661320f1f81529ffa7a1f5f25`). The complete move file then passed all 25 cases, 435 expects, 22.05s (`/tmp/puni-project-p3-move25-v1/native.log`, SHA256 `5b1025053a1bb92e439135f05fb1ad155d266c124e9f577fa2a6b89f3b8c8356`). These are separate observations; the earlier mixed run remains a recorded failure.

The pure grouping test uses the Node Vitest config, not the DOM tier. After the move-test publication it passed all 18 cases in 114ms (`/tmp/puni-project-p3-node-v1/native.log`, SHA256 `301adafb6933e25a04fd5bc9b0d662703b47f999bba6f60e159d4d34859d5beb`). Vite emitted four native-config-loader migration warnings. The 229-case DOM run emitted 110 React act warning blocks and the expected Error Boundary diagnostics; the separate nonrepeated transcript was read in full. Neither result is warning-free or a browser cohort.

The browser-level collector now invokes the current Bun executable for its two first-party launch stages. The actual Bun build/installed Playwright discovery/execution/reporting/publication case first failed at its exact executable-vector assertion, then passed: 1 pass/15 filtered/12 expects/2.52s, SHA256 `b385f95f1c29af0346a6071f548e9f40cccd97dd827e503ff3ce57044207405d`. The owning 16-case file passed with 110 expects in 3.64s, SHA256 `43a97111bea3725c94fd3801a59b48a430648242025dddc70360d2873b23e5b9`. This case uses a real Playwright API test with no Page/Browser fixture or Chromium launch. Its private node-named Bun symlink bridges the old executable baseline; it does not prove an installation lacking every node-named executable. Git initialization/commits/worktrees belong only to its private scratch fixture. No shared index/remote/default activation changed.

The browser quality check initially reported two test-only errors for a redundant Bun-presence condition. Removing that test condition and formatting changed no production behavior; the uncached two-file lint then exited 0. The seven configured TypeScript roots (FE, BE, application core, SQLite, memory, conformance and tool-devsync) exited 0 with an empty transcript before the 11-test publication, and again after that publication and the move-fixture correction (`/tmp/puni-project-p3-types-v2/native.receipt.json`). The 21-path uncached lint at this latter epoch found one import-sort error in `work-package-picker.test.ts`. The error remained open in that earlier source epoch; the later23-path and four-path checks below record its correction.

The SQL guard-fault preparations have preserved setup failures, with no R5 credit from them. M1 V1 refused in its combined callback metadata check before loading the omission or reaching the owning assertion. A subsequent metadata-only canonical probe observed only the exact canonical `path` field, then Bun rejected its undefined onLoad return (`onLoad() expects an object returned`; transcript SHA256 `0c2669a431e7c25998a169c763f17cb709142f3de8378a2ae389fb618ba59351`). A canonical-source-copy successor returned the exact 7138-byte source, hash `2cc46770ef44463b24a37cfa4a5f39e34d7cad695ed2beb81ab83e8971687a16`, with explicit TypeScript loader and unchanged module ID. Its owning SQL case passed 1/44 filtered/16 expects/3.18s, SHA256 `c6b7fba3896573f0927abfdf17330a543aaec081520e79878aa4fa3d858bad93`; the wrapper still failed because its selected relative-resolution receipt was absent. That wrapper failure does not erase the original passing native receipt or establish resolution metadata. The revised fault design must use actual canonical-load and SQL assertion evidence without inventing importer/resolveDir observations.

The subsequent independently reviewed onLoad-only experiments used canonical source, one exact omitted predicate, then canonical source again at the original module ID, with explicit TypeScript loader and no resolver hook. Each actual module receipt and owning SQL failure was read before the next phase. Source bytes/modes remained unchanged throughout.

| Predicate                                           | Healthy / fault / healthy                                                   | First actual fault                                                                                   | Fault raw SHA256                                                   |
| --------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| LIST actual-child mapping organization (M1 v2)      | 1 pass/16 expects; 1 fail/10 expects; 1 pass/16 expects, always 44 filtered | first LIST test778, child-ID decoder at canonical module line74 after the single removed source line | `ceaca58cd85e267cc3f73b142517c87ccb698136857d0130b8206d0f8d44cc26` |
| Full-detail actual-child mapping organization (M2)  | 1 pass/13 expects; 1 fail/8 expects; 1 pass/13 expects, always 44 filtered  | initial LIST passed; first DETAIL test779, entry decoder88                                           | `6c91997997713d4cea61376ddaff847856975dad4ac4614632c9d68fbedb1238` |
| Shell-detail actual-child mapping organization (M3) | 1 pass/16 expects; 1 fail/14 expects; 1 pass/16 expects, always 44 filtered | full LIST/DETAIL and shell LIST passed; shell DETAIL test785, child-ID decoder112                    | `15876e644b29a714497e6bb71e65d28ae43b55e743374ccca401a0ca45a3024f` |

The M1 root adjudication is `/tmp/puni-project-p3-map-m1-flight-v2/root-adjudication.json`, with all415 pins independently stable. M2 and M3 each have their own corresponding `root-adjudication.json` under `/tmp/puni-project-p3-map-m{2,3}-flight-v1`, with all421 pins independently stable. They qualify only their respective mapping predicate. No missing-map guard, other safety predicate, all-relative-dependency or global cleanup credit follows. M2's preserved proposal incorrectly predicted14 expects; the actual unchanged NAME case has seven fixture expects and six reader/snapshot expects,13 total. Its actual one-case title, load witness, first failure and canonical rerun establish the row; the count typo remains recorded.

The separately reviewed private current-parent budget controls were exercised as an exact canonical-test-module overlay, with no live test or production rewrite. `/tmp/puni-current-parent-budget-first-v2/native.log` records 1 pass/1 fail/401 filtered/38 expects/4.75s, SHA256 `84ddcde223d2499049a93d99e9e49319e782fdef5ba15ae7e2d4dbe772bbbb55`, original1/null/settled and all397 pins unchanged. Actual restricted parent-budget writes without package.write and the separate generic replay admission403 passed. The second case made a real HTTP project/package move, retained the old-parent grant, supplied package.write for replay and the actual new-parent budget grant, then its intended undo200 returned403 `project.manage_budgets`. Later restamp/redo/undo/revocation assertions were unreached. Source tracing identifies the redundant organization-target check after the actual current-package/P5 verdict; the correction was then reviewed separately before the publication and actual Greens recorded below.

The old organization-target-only budget spy was also checked unchanged before any correction: `/tmp/puni-current-parent-budget-old-oracle-v1/native.log` records 1 pass/1 fail/399 filtered/4 expects/4.67s, original1/null/settled and all394 pins unchanged. Its write case now receives200 because live writes use the package chain; its replay case still receives403 through the obsolete extra organization check. This is a recorded obsolete oracle premise, not evidence that project budget grants should require organization authority. Its current-chain test successor must deny only the named budget permission while preserving generic package.write and historical Proof text.

The separately reviewed replay correction now evaluates every immutable requirement once through `authorizePackage` on the actual addressed package/current parent. The accidental additional organization-target prerequisite is removed. Generic package.write admission, P5, actor coherence, credential cap, strict historical parsing and journal bytes remain intact. Three old Proof strings remain exact, with only the former organization-target proof explicitly marked historical. The old spy's current counterpart removes only the named budget permission from a real package verdict while asserting package.write remains true.

The reviewed test/production candidates first passed through exact canonical-module overlays: 4 pass,399 filtered,81 expects,6.59s. After publication, the same four cases passed directly against live source without overlays: 4 pass,399 filtered,81 expects,6.61s (`/tmp/puni-project-p3-budget-live4-current-v2/native.receipt.json`). The broader `budget|replay|provenance` selection passed37 cases,366 filtered,201 expects,36.12s (`/tmp/puni-current-parent-budget-broader-v1/native.receipt.json`). Its expected malformed-provenance error logs were read in full and do not mean warning-free output. Actual move/current-parent grant, neighboring precondition restamp, undo/redo/undo/older undo, repeated immutable id/payload/inverse/authorization checks and re-revocation all reached their assertions in these ordinary Greens.

Post-publication configured TypeScript checking of seven roots exited0 with an empty transcript before the final two style-only corrections. The23-path uncached lint initially found three optional-chain preferences in the new test helper and an import-sort error in the replay module. The exact successor changes only those three modeled nullable test observations and import order; their role/null truth table and import bindings/body invariants were checked, and both full diffs were read. The same23-path uncached lint then exited0 with an empty transcript; the23-path format check reported all matched files use Prettier style. These current receipts are under `/tmp/puni-project-p3-{types-current-v1,lint23-current-v1,lint23-current-v2,format23-current-v2}`. The failed lint epoch remains recorded; the typecheck is qualified to its pre-style-correction bytes.

Twelve further independent provider-boundary faults now have complete canonical/fault/canonical observations. P1–P10 retain the395-source basis plus eight exact experiment inputs (403pins each); P11/P12 add the unchanged51dd test overlay and require separate actual test and production load receipts (406pins each). All original transcripts, module-load identities, source hashes/modes and first owning frames were read before successors and independently rechecked. The complete actual scope table follows in this entry; no omission was combined with another.

The current-parent requirement refusal also has an independent proof: canonical1pass/402filtered/60expects, fault0pass/1fail/402filtered/21expects, canonical1pass/402filtered/60expects. Under the sole final-refusal omission, actual package.write admission and real move/current-parent/write=true/budget=false prerequisites passed, then the first missing-new-parent undo at test3416 returned200 instead of expected403. Later grant/restamp/revocation assertions were unreached under this fault. Its adjudication is `/tmp/puni-current-parent-budget-refusal-flight-v2/root-adjudication.json`; fault raw SHA256 `3b9c07f5ec9ce15ed36079935b8076edd84528aca14fe616f494b9f9bd6c6157`. Canonical source bytes/mode stayed unchanged, with402 experiment pins stable.

The two actual new SQL selection controls first passed as an exact canonical-test-only overlay: 2pass/66filtered/8expects/3.67s,398pins stable (`/tmp/puni-project-p3-batch-selection-controls-ordinary-v1`). One proves current own membership beside an actual foreign organization grant; the other proves a valid project-grant result beside a schema-permitted but nonreaching malformed package permission. Their identical test body was retained in every P11/P12 phase. After all experiments, the formatted two-case append preserves the complete original54123-byte live test prefix. Thirteen additional adjacent Proof comments record only the actually exercised boundaries. `/tmp/puni-project-p3-observed-proofs-publication-v2/publication.json` records that four-file publication; production executable bodies are unchanged.

Astra independently read all17 actual fault logs and verified51 native receipts/transcript hashes/production loads plus the six P11/P12 test loads. Its evidence review is `/tmp/puni-project-p3-observed-evidence-astra-v1.md`, SHA256 `00de025a0e259721141ef83526af17e9fc5490eca77a5399238ea89acae65934`. That clears these named scopes only. New public shell optional-never closure, typed-forbidden adapter/HTTP forwarding and bounded local strict-decoder forwarding remain explicit evidence gaps; the current malformed list also lacks an isolated updatedAt entry. This is not whole-P3 or parent-task R5 closure.

All reported native outcomes use the fixed protected helper and original receipts with null signals, known settlement and corresponding unchanged source-pin checks. Those custody checks establish only the helper's scoped process/descriptor settlement. They do not establish global process, descriptor, fixture, browser, socket or graceful application cleanup. Installed CLI composition, remaining entity/read/settings/catalogue slices and activation/host gates remain incomplete.

### Remaining observed provider fault rows

M4 independently completed canonical1pass/65filtered/3expects, fault0pass/1fail/65filtered, canonical1pass/65filtered/3expects. The sole whole compound-target guard omission made the BLOB-ID read resolve; `rejectionOf` at218, called1254, failed before the later Error/message/no-effects assertions. Fault transcript SHA256 `232a2844abc141c02dd2b3f679d8c36358488ff3a101e2f3ddabaf5a1a8bf04c`; all421 experiment pins stayed unchanged. This is one malformed-ID guard witness, not individual empty-ID or organization-mismatch proof.

| Row | Actual first owning fault and qualification                                                                                                                                                                                                                                                                                           | Original fault transcript SHA256                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| P1  | First LIST equality test633 exposed full Alpha fields and invisible Beta; fault0PASS1FAIL44filtered1expect3.19s. Canonical before/after each1PASS44filtered5expects.                                                                                                                                                                  | `18e612611e01abd4ab5176359485e8cd2ab68beeab499692648af6ca35c38ca4` |
| P2  | After lazy-construction counters pass, LIST test220 exposes inaccessible Alpha/Beta shells; fault0PASS1FAIL44filtered2expects3.23s. Canonical before/after each1PASS44filtered4expects.                                                                                                                                               | `51e9fce9c229a2948d8254cac129ef777f6bb20011c2fa7284c3239a03f48d45` |
| P3  | Exact shell LIST passed, then Alpha DETAIL test637 exposed full metadata instead of typed forbidden/project.read; fault0PASS1FAIL44filtered2expects3.13s. Canonical before/after each1PASS44filtered5expects.                                                                                                                         | `7ee3b4218c8daf64fe4c50b9896a105cca6e6dca540941d931b0c8d56299bb91` |
| P4  | Exact shell LIST and Alpha typed forbidden passed; Beta DETAIL test642 reveals existence with typed forbidden instead of null. Fault0PASS1FAIL44filtered3expects3.21s; canonical each1PASS44filtered5expects. Whole child-ID validation/string term retained.                                                                         | `cbdbae68f237586c6fbc3e0591f0b09bfb31a374777b5183f21f1146192fe58a` |
| P5  | After lazy-construction counter passes, LIST220 exposes Alpha/Beta because unreadable children contribute to shell counts. Fault0PASS1FAIL44filtered2expects3.17s; canonical each1PASS44filtered4expects. Inherited count predicate new privacy use only.                                                                             | `f38effeb0f736465c996cd9e9a0de037a7edf89adcd99873ca40284b05049fc5` |
| P6  | Key assertion passed; second DETAIL299 leaks restricted SECRET and count2 instead of only OPEN/count1. Fault0PASS1FAIL44filtered2expects3.14s; canonical each1PASS44filtered3expects. Privacy filter necessity only, not detachment.                                                                                                  | `be84460e327e393d28da76e299c241eb39ad96e5b86312c6909cfdc5c30cbb80` |
| P7  | Ada first batch/detail equality1203 gains proj-two although her real grant names only proj; fault0PASS1FAIL65filtered1expect3.04s. Canonical each1PASS65filtered7expects. Whole per-target grant filter only.                                                                                                                         | `c096faf70d9fd5cfbb039e9b758147f1a427e59719f200da71bb4e529386fb60` |
| P8  | Ada first batch/detail equality1203 gains invisible proj-two despite the retained per-target grant filter. Fault0PASS1FAIL65filtered1expect3.15s; canonical each1PASS65filtered7expects. Whole visibility condition only; no cap-conjunct claim.                                                                                      | `c23dca8f2b5b2dd2122cd220bcc04eefb260fa3e835a6e8de76f1f8fa6f96b3d` |
| P9  | Initial14-project/one-statement assertions pass, then membership deletion at1224 still yields14 IDs at1227. Fault0PASS1FAIL65filtered4expects3.14s; canonical each1PASS65filtered5expects. Local membership invocation only.                                                                                                          | `1d08abacc6abff0056b9ed562440b33d112e57d5bf102bed5768e4862baeb2b7` |
| P10 | First batch await at1203 rejects because a valid foreign project reaches the unchanged organization guard at private368. Fault0PASS1FAIL65filtered3.28s with no expect calls reported; canonical each1PASS65filtered7expects. Scoped-target selection availability only, not leakage or another M4 conjunct.                          | `baa09a0a3d44676d0c94b3d7b9492d80edeb3164308bcb6cc47e3586e5547e2a` |
| P11 | Actual Ada own membership and sole org-b grant prerequisites pass; third new-case batch equality leaks proj/proj-two instead of empty. Fault0PASS1FAIL67filtered3expects3.15s; same51dd test everyphase, canonical each1PASS67filtered4expects.                                                                                       | `0ad9830a26ce442f35eb84b01177730501da2d36059b218f1fa83ba1e0a9d662` |
| P12 | Actual project batch and nonreaching malformed-permission prerequisites pass; second batch selects package.teleport and throws UnknownPermissionRow at reachingGrantsOf567 before JS filtering. Fault0PASS1FAIL67filtered2expects3.16s; same51dd test everyphase; canonical each1PASS67filtered4expects. Selection availability only. | `5691486185c17485a2301e0f26f87d8ca4acf2ab751b02360dd7be91146e2ce1` |

Every row has its own `root-adjudication.json` beside the baseline/fault/canonical requests and original raw/native/module receipts. P3/P4 are direct SQL typed-refusal observations, not observed HTTP status responses. P11/P12 retain the same reviewed51dd test overlay at the canonical test ID in all three phases; the displayed on-disk source excerpt is not that overlay body. Earlier setup failures are not repurposed as fault credit.

Current source check `sql2`: original0/null/settled,395pins stable; receipt `/tmp/puni-project-p3-observed-sql2-v1/native.receipt.json`, transcript SHA256 `766b0a1176550cd3edb73ffd8e9fa73296490806d5633b74b8c301c03582e72b`.

Current source check `lint4`: original0/null/settled,395pins stable; receipt `/tmp/puni-project-p3-observed-lint4-v1/native.receipt.json`, transcript SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

Current source check `format4`: original0/null/settled,395pins stable; receipt `/tmp/puni-project-p3-observed-format4-v1/native.receipt.json`, transcript SHA256 `17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20`.

Current source check `sqlite-types`: original0/null/settled,395pins stable; receipt `/tmp/puni-project-p3-observed-sqlite-types-v1/native.receipt.json`, transcript SHA256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

The live two-case SQL run passed2/66filtered/8expects/3.62s without a test overlay. Four-path uncached lint and configured SQLite typechecking returned empty transcripts; four-path format reported all matched files use Prettier style. These follow only evidence comments and the two appended controls, not a new production authorization implementation. Full renamed-scope gates, remaining P3 forwarding/contract proofs, all later entity slices and operational activation remain open.

### Ordinary package observations and remaining P3 boundaries — 2026-11-14

The five previously named P3 contract/forwarding gaps have the bounded observations below. Each used canonical source, one reviewed omission/dependency fault, then canonical source at the same module ID; original outcomes were 0 / 1 / 0 with known settlement and unchanged source/modes. The contract row proves its composite optional-never closure, not seven independent fields.

| Boundary                                 | First actual fault; scope limit                                                                                                                                                                                                                               | Fault transcript SHA256                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Composite shell metadata closure         | Whole block omitted; runtime issues assertion failed after 3 expects. The partial-revision arm is inferred from unchanged source order, not a separate raw property witness. Canonical: 1 pass / 13 filtered / 16 expects; fault: 1 fail / 3 expects.         | `21025efe947faa12ac62099cc6f4ddfe197487d4e75bcd97e2b9192f2efa6489` |
| Adapter forbidden forwarding, R1         | Shell LIST passed; first DETAIL received ok: true / value wrapping forbidden instead of flat refusal. Canonical: 1 pass / 45 filtered / 5 expects; fault: 1 fail / 2 expects. No later revocation claim.                                                      | `f9673482326834aa00ff7335fada224a9c34398acc7206b9932ad422c4814803` |
| HTTP forbidden projection, R2            | Actual child-only shell passed; DETAIL expected 403/project.read but received 500/undeclared refusal. Canonical: 1 pass / 14 filtered / 12 expects; fault: 1 fail / 9 expects. HTTP projection only.                                                          | `06fcefc2696b3e6b02359d1cee541d875f451d36ec35fdb93ac0e431d415986f` |
| Local strict selected-row forwarding, R3 | Skipping selected project-scope/organization-kind rows made the read resolve beside sufficient organization authority; rejectionOf failed. Canonical: 1 pass / 67 filtered / 3 expects; fault: 1 fail, no expects count reported. Not shared-codec necessity. | `a7ef46e040d30caf074b3b39afd120f2c057c623db790f62be3314bbada3eec4` |
| Whole shell-name guard, R4               | Initial real shell passed, actual BLOB name installed, then list resolved without the guard. Canonical: 1 pass / 45 filtered / 5 expects; fault: 1 fail / 1 expect. No id/org/subclause or later diagnostic/state proof.                                      | `ef0a6e61a826b7216b94867b0065a3012c010774ab364616539324de7dbeb477` |

Original requests, literal commands, native/module receipts and adjudications: `/tmp/puni-project-shell-closure-flight-v1/root-adjudication.json` and `/tmp/puni-project-p3-boundary-flights-v2/root-completed.json` (links the four row journals). Astra's five-comment audit is `/tmp/puni-project-p3-boundary-observed-comments-astra-v3.md`, SHA256 `a00daa964a1d973f89488383ca5ae6867bf892559a74b1085248a58c57f521dd`. Exactly five adjacent two-line Proof comments record those scopes; all old Proof text/order survives. No whole-P3, per-property, cap or privacy-admission proof follows.

The next ordinary HTTP LIST/GET implementation adds required WorkPackageObservation on the existing concrete SQLite source/read pool. Complete CommandCaller/expected access is retained before acquisition; current mode, credential, selection, membership, parent/P5/grants and rows share one committed observation. Scoped detail checks map/organization before private DTOs, keeps valid foreign mappings opaque, and throws for selected owned corrupt mapping/parent. LIST batches readable IDs once and SQL-filters private decoding with one bound JSON array; no guessed driver limit or truncation. Raw helper/open/export policy, generic Source and memory authority remain separate.

The two actual composed tests first failed after real parent creation/grant/auth prerequisites: human restrictedGET and credential-otherGET exposed 200 private DTOs instead of the same absent 404. Original: 0 pass / 2 fail / 18 expects / 4.14 s: `/tmp/puni-work-package-visibility-first-red-v1/native.receipt.json`, rawSHA `5081d03f1a3dcc9e9c791411d581e04a86053c95df5fbcca00259d240de4d997`. Later assertions were then unreached. Publication `/tmp/puni-work-package-observation-publication-v1/publication.json` records the 47-path implementation roster plus five P3 comment paths: 52 considered, 51 writes/one unchanged forwarding fixture, 442 pins. First mounted GREEN: 2 pass / 23 expects / 4.41 s has rawSHA `e9f066726f9effbae87beb44537e42879e57aa8b98c8a5f85dc2f449d03d6ee4`; first SQL: 14 pass / 62 expects / 10.25 s has rawSHA `a5634c2cc0280314552a50be6e0669fa1247fca6b90a7715c597b4ac81217ca9`, with receipts `/tmp/puni-work-package-observation-first-green-v1/native.receipt.json` and `/tmp/puni-work-package-observation-sql14-v1/native.receipt.json`.

The SQL controls cover actual preactivation/current transitions, current member/credential context, machine/consent own grants, hidden malformed private rows, selected map/parent corruption, current parent authority, one/two-ID constant-bind projection, retained caller and rival snapshot coherence. Ordinary controls are not independent observer-guard necessity proofs. The later three observer waves below establish only their ten named scopes; ordinary controls do not become independent proofs of other branches.

Quality failures remain preserved: lint53 exited 1 with eight findings; format53 named the unformatted mounted test; types7 exited 2 for two missing composed-image script registrations (one repeated diagnostic). The seven-file successor used the actual concrete pool/selection in those scripts, precise test types/error causes and one clone at observer entry, producing 444 pins. Lint55 then exposed require-await in an unknown-cause async rethrow; hand-wrapped visibility still failed format. The then-rethrow preserves unknown/undefined with one later microtask; Root's actual configured private formatter supplied visibility and later paging layout. The six-case paging predecessor additionally lacked its own source pin; its fresh 445-pin request failed 0/6 at actual 422 project_required, earning no feature credit. Its separate fixture now uses actual combined 201 with correlated parent/package IDs and the canonical list URI, preserving all six original assertions. Final three-test publication: `/tmp/puni-work-package-observation-final-quality-publication-v3/publication.json`, 445 pins. Failed original receipts: `/tmp/puni-work-package-observation-lint53-v1/native.receipt.json`, `/tmp/puni-work-package-observation-format53-v1/native.receipt.json`, `/tmp/puni-work-package-observation-types7-v1/native.receipt.json`, `/tmp/puni-work-package-observation-quality-dispatch-v1/lint55/native.receipt.json`, `/tmp/puni-work-package-observation-quality-dispatch-v1/format55/native.receipt.json`, and `/tmp/puni-work-package-observation-paging-predecessor-v2/native.receipt.json`.

All following current-source checks exited 0/null/settled with 445 pins stable. Exact literal argv/cwd/deadlines are in each `request.json` beside its original `native.receipt.json` and `native.log` under `/tmp/puni-work-package-observation-final-three-v4/checks/<row>`. The executable is `/home/df/.bun/bin/bun`; cwd is the AF5E worktree. Lint56 invokes configured ESLint over its exact 56 named paths; format56 invokes configured Prettier --check over that same roster. Types7 is `bun x --no-install tsc --build --force` on BE, GW, MCP, core, SQLite, contracts and Dash's seven explicit tsconfigs. These are bounded configured checks, not full Nx/host gates.

| Row        | Exact owning file / command tail                                                                    | Outcome; transcript SHA256                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| lint56     | Literal 56-path argv in request                                                                     | Empty diagnostics; `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`              |
| format56   | --check, same 56 paths                                                                              | Matched style; `17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20`                  |
| types7     | Seven configured roots above                                                                        | Empty diagnostics; `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`              |
| mounted2   | test ./apps/wbs/be-01/src/controller/visibility.controller.db.test.ts --timeout=10000               | 2 pass / 23 expects / 4.20 s; `de499b3e208eedbee8da9e2693554ce1d7904319491d8d44a1955c21e4331451`   |
| sql14      | test ./libs/wbs/adapters/store-sqlite/src/work-package-observation.db.test.ts --timeout=30000       | 14 pass / 62 expects / 10.19 s; `5e969b63312c3e148c497c7aece2f1a321811b540a32862f094a0f0e08274125` |
| core-route | test ./libs/wbs/application/core/src/http/work-package.routes.test.ts --timeout=10000               | 2 pass / 10 expects / 2.39 s; `8751cdbba66e98588e39ca5ca2bb2e23cae50a93270244285350dda93f8ffce8`   |
| paging6    | test ./apps/wbs/be-01/src/controller/work-package-list-paging.controller.db.test.ts --timeout=10000 | 6 pass / 17 expects / 6.24 s; `5eae8ecee7c01a7c609700d72d56c0c43d8d15e9ffe0bec549cdbe39651f70c5`   |

Native custody here is only the protected helper's stopped/reaped owner and closed descriptor with known original outcome, not global process/fixture/graceful shutdown proof. No task 3.x checkbox is closed. Solution-slug, gateway/open, spaces/rank/person/load/startable and other read owners, all-verb/memory parity, installed CLI composition and operational activation remain separate work. The new private solution tests are unrun and earn no coverage here.

### Ten bounded ordinary-observer necessity scopes — 2026-11-14

Root dispatched each reviewed canonical / single-effect fault / canonical phase separately, reading its complete original raw and native/module/validation records before the next GO. All ten rows have actual original exits 0 / 1 / 0, signal null, primary null, empty cleanup failures and known helper-scoped owner/descriptor settlement. SQL rows select one case with 13 filtered; mounted O2/O9 select one with 1 filtered. Budgets remain SQL 30000 ms, mounted 10000 ms and outer 180000 ms. Exact commands/source pins/load hashes are in each retained request and receipt under /tmp/puni-work-package-observation-flights-v2/. No resolver or test overlay was used.

| Row | Actual first fault                                                                                                                              | Expects before / fault / restored | Qualified scope                                                                                                                                                          | Fault raw SHA256                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| O1  | SQL test488:20 expected captured package open, received organization_context_changed refusal after mutable caller/expected evidence edits.      | 2 / 1 / 2                         | Complete-caller retention at consolidated observation entry; no separate per-field or resolver-clone necessity.                                                          | `1569a5079934abe2f41bc012c4557a082c9a318522f6b9c3dac00a1da673d457` |
| O2  | Mounted test124:7 restricted equality expected absent404, received200 private package/steps after visible-open and absent prerequisites.        | 11 / 8 / 11                       | Local package.read denial-to-absence forwarding; later grant/removal assertions unreached in fault.                                                                      | `15b57de401f8886eea6119f265502957428568f8fc13478665abc96cd238277d` |
| O3  | Shared target decoder445 threw foreign package abroad missing-parent error from SQL test432 before expected null.                               | 5 / 3 / 5                         | Foreign-map early opacity before parent validation; no private-settings decoder or shared parent-validator necessity.                                                    | `08d0a020dadda0c6a20df829705c4d6a751c9e6e5f5adda96301f421549811b2` |
| O4  | expectRejection292:20 from SQL test456 expected rejected=true receivedfalse after local mapping decoder bypass.                                 | 5 / 2 / 5                         | Local addressed mapping-validation dependency forwarding; raw absent joined mapping is SQL null; later list/diagnostic assertions unreached.                             | `0131e19ffdb679d7d0b65ea7dbd83f1f42e16c787b3f101f36a2f22be05885c9` |
| O5  | expectRejection292:20 from SQL test456 expected rejected=true receivedfalse after mapping LEFT JOIN became INNER JOIN.                          | 5 / 2 / 5                         | Addressed missing-mapping row preservation only, distinct from local decoder forwarding; no later list/diagnostic credit.                                                | `437bb6dcbae273b04615f4058a218e25ec4d60aa1f53115898fea928f8eaa23b` |
| O6  | expectRejection292:20 from SQL test462 expected rejected=true receivedfalse after parent LEFT JOIN became INNER JOIN.                           | 7 / 4 / 7                         | Addressed owned missing-parent row preservation only; restored foreign_keys ON does not imply global FK-consistent fixture.                                              | `0cf2e31418d9aefc136fd8654879137bb6f862e2fccf02168c8cfe69d3343864` |
| O7  | SQL test367:41 initial no-grant LIST expected[], received all three own-organization package DTOs.                                              | 6 / 2 / 6                         | Authority-selected ID SQL predicate only; later malformed hidden settings assertions unreached, no independent private-decode ordering proof.                            | `34009b43ed3da59c66d535eaf2c41f372ef995210a4538f80f45997d7d95b252` |
| O8  | TypeError access.kind at observer59 from SQL test538 after current removed-membership refusal was not forwarded; no expect-count line reported. | 2 / unreported / 2                | Local current resolver-refusal forwarding only; later selection/credential and shared resolver implementation are separate.                                              | `65b23b88837a9934cf86dbaafa447d69f1f6b9e37bbb92b1a333a81e0f4105f7` |
| O9  | Mounted test121:20 absent-ID expected404/not_found received500/Internal Server Error; logged TypeError row.organization_id at observer72.       | 11 / 7 / 11                       | Addressed target-query absence handling only, distinct from denied-detail concealment; later restricted/grant/list assertions unreached in fault.                        | `4547d39d22c110792d0e68cf7da2fb150c6fdc817d0bb7dc66510b03a0404a5a` |
| O10 | SQL test526:20 expected captured old SECRET/alpha/Dev projection, received ok:true/value:null after rival commit and fresh projection loan.     | 2 / 1 / 2                         | Same committed observation forwarding to authorization/projection only; no independent private-column, shared transaction-helper or global/each-loan lifetime necessity. | `21b41942f498ca242b4633dcd8fac4cfbfee2c825647ffd3010ef28c26672799` |

O4's absent LEFT JOIN mapping is SQL NULL. O5/O6 are addressed-row preservation, not extra shared-decoder proofs; the O6 fixture's restored foreign_keys ON does not make its intentional orphan globally FK-consistent. O3 stops at parent validation and O7 at the initial no-grant LIST, so their later private-setting assertions receive no independent necessity credit. O8's missing fault expect-count line is unreported, not zero. O9's actual logged row.organization_id TypeError belongs to absent target handling, separate from O2 denial concealment. O10's deliberate fresh projection loan changes the captured result to null after rival authority/parent/private mutation; this proves original-observation forwarding only, not each private column, shared transaction/pool internals or per-loan/global lifetime necessity.

Independent full evidence audits: /tmp/puni-observer-wave1-observed-astra-v1.md (62a551d1), /tmp/puni-observer-wave2-observed-astra-v1.md (3bc0cab6), and final /tmp/puni-observer-ten-observed-astra-v1.md (139ad58f88fd6d784541468d47c3952e7e03c2ec83291e2ba98b32d8a3c59da0). The immutable root-completed.json, three wave records and ten row root-adjudication.json files index all 30 original transcripts/receipts/load/validation witnesses. Ten adjacent Proof-marker starts record these observed scopes only: nine on the concrete observer, one on the repository selected-ID predicate. Both join notes are JS comments outside the SQL template, whose bytes remain unchanged.

The source/comment-only successor preserves all preexisting executable, SQL-literal and historical Proof bytes; it does not rerun runtime or configured quality. The earlier final 445-pin quality/ordinary receipts above predate these comments and this append. Full current branches, LIST-before-private-decoding ordering beyond O7, HTTP recheck/retention timing, legacy nullable dependencies, other read verbs/memory parity, task 3.x closure and the whole goal remain open. Helper settlement is scoped original custody, not global process/fixture/graceful shutdown proof. Solution tests remain separate and unrun in this checkpoint; no source/default/host or operational activation claim follows.

### Solution-slug admission and route retention — 2026-11-14

This checkpoint adds current solution-slug admission to the existing required WorkPackageObservation, preserving non-zoned work-package/steps replies. Scoped slug selection, duplicate detection, strict current parent/restriction, package.read and private projection share the retained caller's committed observation. Preactivation keeps legacy-column-only lookup; scoped lookup matches the scoped table or retained legacy column. Valid foreign maps are excluded before LIMIT2; actual own parent evidence attributes missing/malformed mapping for validation, never repairs ownership or grants authority. Ordinary zoned GET/LIST and their historical proofs remain unchanged. No Source/DI capability, settings policy, schema/migration, memory authority or operational activation is introduced.

Root's first actual mounted two-case feature RED at /tmp/puni-solution-visibility-first-red-v5/first-red/ has0pass/2fail/28expects, original1/null with scoped helper settlement. Actual explicit parent/grant/readable/absent prerequisites reached before restricted-human and unrelated-credential solution responses returned200 instead of404. Actual formatted nine-file publication produced selected447 basis a90a5ca7; mounted4 and SQL30 then passed. These are ordinary outcomes, not inherited safety-check necessity.

| Retained original owner                              | Outcome                                          | Original custody | Raw SHA256                                                         |
| ---------------------------------------------------- | ------------------------------------------------ | ---------------- | ------------------------------------------------------------------ |
| /tmp/puni-solution-visibility-first-red-v5/first-red | 0 pass / 2 fail / 28 expects                     | 1/null/settled   | `2258e78aafe50469a9d352eeb5d5daf992681ae96f2ed1a92781a46f96a6b4f6` |
| /tmp/puni-solution-observation-mounted4-v1           | 4 pass / 0 fail / 52 expects                     | 0/null/settled   | `dc75ded9db0ed4f7ef43caea2427d1593571f3213422083877476ddec634b0b1` |
| /tmp/puni-solution-observation-sql30-v1              | 30 pass / 0 fail / 160 expects                   | 0/null/settled   | `22c7037794f2f6fa5b1ce5cbe6ecd75b75ff1715a7b11105878ec8369a0be35d` |
| /tmp/puni-solution-observation-core7-v1              | 6 pass / 1 fail / 22 expects                     | 1/null/settled   | `232392d3b59465a963348874da1e75a470abefd86be16f3622e2207830ef4649` |
| /tmp/puni-solution-retention-core7-v1                | 7 pass / 0 fail / 22 expects                     | 0/null/settled   | `ba9d15ce380daeeb603edfc9788df91b3252c7f4c8294ffd03ff72b3a11d0e9d` |
| /tmp/puni-solution-retention-lint9-v1                | exit0; empty diagnostics                         | 0/null/settled   | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| /tmp/puni-solution-retention-format9-v1              | exit0; all matched                               | 0/null/settled   | `17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20` |
| /tmp/puni-solution-retention-types7-v1               | exit0; seven configured roots, empty diagnostics | 0/null/settled   | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

The first core7 run's6pass/1fail was an exact expected-object fixture defect: bind installs organizationOperation read/absent before the route. It was not a production clone failure. More importantly, the initial test assigned top-level principal fields after bind had shallow-copied them, masking a proposed clone omission. Review correction /tmp/puni-solution-route-retention-review-correction-v1.md (4363473cc5ad6f34edb6ecfd37ad02c3e5b4cbfaf8887f12d7fb470d120d8801) preserves/retracts that earlier assessment; the source successor /tmp/puni-solution-route-retention-successor-astra-v1.md (61a57cf456d1789793a853d32952d7ccd51ec9fa6bbc207a67023600d97db27e) retains separately owned authentication/scopes references, mutates their contents and expects the binding's actual operation. The current corrected7/22 and lint9/format9/types7 outcomes above follow the exact three-file test/type-import successor and actual a18dd57bb4a06886b79f443e4f34b86ac64ce48ca3801b3a38a2d3d5822aa244 selected447 publication. Mounted4/SQL30 remain their earlier a90a source epoch; the later changes are one test premise and type-only import order, so they were not silently relabeled reruns. Exact commands and unchanged case/outer budgets are retained in the original receipts.

### Eleven bounded solution boundary necessity scopes — 2026-11-14

Root separately authorized every canonical / single-effect fault / canonical request and read the original raw, receipt, actual canonical-file onLoad witness and validation before any successor. All eleven rows have actual original0/1/0, null signal, primarynull, cleanup[] and known scoped owner stopped/reaped plus closed transcript descriptor. Each SQL row selects1 with29 filtered; each route row1 with4 filtered. Budgets remain SQL30000ms, route10000ms, outer180000ms. Canonical physical source bytes were not changed by the load overlays; current447 remained a18dd57b. Exact variant/request/load/hash/TS-loader/custody witnesses are under /tmp/puni-solution-boundary-flights-v1/, indexed by root-completed.json and the eleven row root-adjudication.json files. Printed source excerpts under a load overlay are not used as variant-source evidence.

| Scope | Healthy / fault / canonical expects | Actual first owning fault                                                                                                                                            | Bounded attribution                                                                                                                                                          | Fault raw SHA256                                                   |
| ----- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Q1    | 11 / 4 / 11                         | First foreign-only slug read at test828 throws the duplicate invariant after two foreign rows and matches=2, instead of null.                                        | Whole pre-LIMIT ownership filter availability only; later one/two-owned assertions and private decoding unreached, no per-SQL-term claim.                                    | `0b8553109ef90b44828b90e5a9ec47dfe19320f9626dc5622737965888bb577b` |
| Q2    | 4 / 3 / 4                           | After valid foreign map and owned-parent readback, expected-null solution read at test864 instead throws parent validation at access-decisions445.                   | Local foreign-under-owned-parent candidate exclusion only; no private estimate decoding or shared parent-validator necessity credit.                                         | `981285f8f6e74a72b3b189db7fd71f6bc9f2f5fdfb13739676df4c38fc50376a` |
| Q3    | 6 / 5 / 6                           | After trigger restoration and missing-map/owned-parent readbacks, omission resolves instead of rejecting; expectRejection292 from test887 receives rejected=false.   | Whole owned-parent attribution arm on missing mapping only; no separate empty/BLOB SQL term or shared mapping decoder necessity credit.                                      | `479c0dcd26c68927e2999295fdc700e0470c7634f2c9764a4506a561f45e137c` |
| Q4    | 7 / 6 / 7                           | After FK restoration and own-map readback, omitted mapped-owner selection resolves instead of rejecting; expectRejection292 from test944 receives rejected=false.    | Owned-map selection arm retains an absent parent for validation only; FK ON is not global integrity and shared parent decoder is not re-proved.                              | `343015d66ad4dc8374462df68e475100f1d9e27da2a184711cc9dd499dc869cb` |
| Q5    | 6 / 5 / 6                           | After readable solution and independently hidden package controls, duplicate omission resolves instead of rejecting; expectRejection292 from test810 receives false. | Duplicate guard only; no claim which unordered candidate was chosen or whether resolution returned DTO or null.                                                              | `f8d33ffe71b53a971fa75662262812005d1abb5fa531c40b1139b2d9904b794a` |
| Q6    | 7 / 6 / 7                           | After non-zoned detached positives, final missing slug read test761 throws row.package_id TypeError at shared decoder433 instead of null.                            | Local missing-slug forwarding only; shared decoder guard necessity and other absence paths are not proved.                                                                   | `549cce6fe51e6416c4f4b35c11366c97826f0b345c9718cccb048923b5eb3999` |
| Q7    | 4 / 1 / 4                           | First unreadable malformed-estimate solution read test968 throws private decoder work-package-row251 after local denial-return omission.                             | Local permission-denial concealment before private projection only; later granted-corruption assertion unreached and authorizePackage internals not re-proved.               | `33fdfc096644f206b181249b1e8923b525241912f3d4be65e6562f735fbbf3a4` |
| Q8    | 4 / 2 / 4                           | After rival commit and held settlement, captured assertion1094 receives Changed old package/beta with old Dev step instead of SECRET/alpha.                          | One package-projection observation forwarding witness only; later fresh-read assertions unreached, no separate per-column/slug/grant/steps/helper-lifetime proof.            | `17401a9fc5e4708af6d4182a7d1b3be2d810d9d6927f85cce6501823a84e96cf` |
| R1    | 2 / 2 / 2                           | Absent404 still passes; exact observer caller assertion180 receives authentication.issuedAt99 and scopes[editor] instead of1 and[read,write].                        | Nested authentication/scopes route retention only; bind preserves top-level id so that mutation has no necessity credit, no browser/verifier or reused observer clone proof. | `4d83d1ac881c0730b742a195c19c4fd0b011958359cdaa6eab20593ba5fe8bbd` |
| R2    | 2 / 2 / 2                           | Absent404 passes, then exact observer caller assertion180 receives legacy expectedAccess instead of actual scoped principal/scope.                                   | Route argument protocol only using explicit unit observer; no SQL credential or authorization policy proof.                                                                  | `4587232f2648f67cfc4cc8e61254d7f6abbeb68dfc722140c86a4439938eb77a` |
| R3    | 4 / 3 / 4                           | Initial not_a_member403 and calls0 pass; later direct endpoint assertion202 receives200/oktrue/bodyundefined instead of409 organization_context_changed.             | Direct modeled-refusal projection only; no mounted500 or actual credential-policy evidence.                                                                                  | `e5feb01c42c4f62636f68e115b18e57c68e2ab345be3fbcc2f38165a01cdaf44` |

Q1 stops at the first foreign-only duplicate refusal; later one/two-owned assertions and private decoding were unreached. Q2 stops at parent validation, not malformed estimate decoding. Q3 proves whole parent-attribution forwarding on a missing map, not each empty/BLOB/typeof/BINARY term. Q4 retains a missing-parent candidate; restored FK ON is not a claim of globally consistent intentional orphan fixtures. Q5 records resolution instead of rejection, with unordered candidate identity and DTO-versus-null unobserved. Q6 is local missing-slug dispatch, not shared-decoder necessity. Q7 proves the local denial return before private projection; later granted-corruption and authorizePackage/cap internals were not re-proved. Q8 changes one package projection to a fresh observation and obtains Changed old package/beta with old Dev; later fresh-read assertions and separate slug/grant/step/field/helper-lifetime checks receive no independent proof.

R1 is the now-observed nested authentication.issuedAt/scopes retention failure after the absent404 still passes. Top-level ID remains reader through bind's shallow copy and earns no clone necessity credit; no browser/verifier or reused observer clone follows. R2 is exact expectedAccess forwarding to an explicit unit observer, not SQL credential policy. R3 is direct modeled-refusal projection: initial403/calls0 still passes, later409 becomes200/bodyundefined. It is not a mounted500 or credential-revocation proof. The preceding masked test and old failed canonical assessment remain intact as history.

Independent observed audits: /tmp/puni-solution-observed-q1-q3-astra-v1.md (0fdd391d456e8edd08d5a5cd436027dda5fdad927e141e7a5dbb789776577e5a), /tmp/puni-solution-observed-q4-q6-astra-v1.md (f69331c521f9d2e86692dc672d770564b07816de92c6ebcc84c4e06a5876cbf9), and final /tmp/puni-solution-eleven-observed-astra-v1.md (9a4cf91998dff0ad42b0089da0de0b51fe214d348b2e5a3e1b129fd9f0eed003). Final audit /tmp/puni-solution-eleven-observed-astra-audit-v1.json (220b21390c99849b72036febb3ecc65457bed1f4e6a990709386e147364cd28a) reconciles all33 originals and693 distinct retained pins; that is the independent audit's bounded selection, not a whole transitive graph or global process assertion.

The private comment/doc successor adds exactly11 independent Proof-marker starts—eight on the concrete observer and three on the solution binding. Q1–Q4 are JS comments before the addressed solution query call, outside its SQL literal. All preexisting source bytes reconstruct exactly by removing the inserted comments; both SQL template bodies are byte exact. The original WBS verification prefix is285675bytes, SHAe47c8fd94e607ddcbb8cef9f31a2edd05dd75815d1c7d3d81f56c132b16fe8c3, preserved exactly. These comments/append are unformatted, unpublished and have no post-comment quality result at preparation. Earlier ordinary/type/lint/format results predate them.

This closes only the named observed local scopes. It does not close all solution policy branches, general read surfaces, memory parity, decoder/lifecycle/transaction-helper necessity, every SQL conjunct, task3.1 or the whole goal. OPEN/gateway/rank/spaces/person-load/history and other owners remain separate; the accepted next OPEN plan is read-only and has no feature RED or implementation here. No new source/default/host/deploy or operational activation claim follows.

## Current-parent OPEN: admitted writer and thirty bounded necessity scopes (2026-11-14)

The first owning mounted test recorded18 expect calls in total, including the failing hidden-response assertion. Before that failure it reached actual current combined birth, readable viewer OPEN204 with access stamps and no plan revision change, and absent404 with full post-auth no-effect comparison. Its restricted target then returned204/null instead of the exact absent404 (`/tmp/puni-work-package-open-first-red-v1/native`). The later hidden no-effect assertion was unreached. This was a real feature RED, not an absent-only or setup failure.

The implemented OPEN purpose retains the complete caller/expected access and one actor/instant before writer acquisition, resolves current authority on that writer, and borrows its store for addressed target validation, actual package.read and access-row upsert. It adds no package.write permission requirement, private read projection, event, journal or plan revision. The legacy branch remains explicit; the memory fixture refuses unsupported current authority. Ordinary controls cover current parent grants, earlier-writer grant/member/restriction/parent and credential changes, access-only writes, real trigger failures and error custody. These are named ordinary controls, not evidence for every internal guard or all entity permissions.

### Ordinary and quality epochs

Initial production-body checks included failures in the reachability fixture (its deliberately refusing export reader was reached), lint18/type1, and then only two require-await diagnostics. The fixture was narrowly corrected to allow the actual absent export target while preserving its spaces/access-decision UoW proxy and actual OPEN store; no policy/refusal was weakened. Receiver forwarding/import/type and exact unknown-rejection continuations were corrected in separate preserved successors. Those failed originals remain under `/tmp/puni-work-package-open-{reachability2,lint16,types7}-v1` and `/tmp/puni-work-package-open-quality-lint16-v1`; they are not converted into feature or necessity credit.

| Owner/check                  | Actual outcome             | Source epoch qualification                                                                      | Original prefix                                               |
| ---------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Original mounted feature RED | 0 pass/1 fail/18 expects   | pre-implementation; hidden204 rather than absent404 after the named readable/absent controls    | `/tmp/puni-work-package-open-first-red-v1/native`             |
| Legacy controller5           | 5 pass/0 fail/19 expects   | 9c4f prior epoch; same production bodies except later receiver-forwarding closure               | `/tmp/puni-work-package-open-legacy5-v1/native`               |
| Mounted visibility15         | 15 pass/0 fail/163 expects | e179 epoch; later2 test-only callback fixes leave these runtime bodies and production unchanged | `/tmp/puni-work-package-open-quality-mounted15-v1/native`     |
| SQL repository51             | 51 pass/0 fail/149 expects | e179 epoch; later2 test-only callback fixes leave these runtime bodies and production unchanged | `/tmp/puni-work-package-open-quality-sql51-v1/native`         |
| App reachability2            | 2 pass/0 fail/1346 expects | e179 epoch; actual absence-only export fixture and spaces/access-decision proxy retained        | `/tmp/puni-work-package-open-quality-reachability2-v1/native` |
| Core owner/route13           | 13 pass/0 fail/79 expects  | current6d86 epoch after explicit Promise continuation fixes                                     | `/tmp/puni-work-package-open-rejection-core13-v1/native`      |
| Configured lint16            | exit0, empty raw           | current6d86 epoch                                                                               | `/tmp/puni-work-package-open-rejection-lint16-v1/native`      |
| Configured format16          | exit0, matched formatting  | current6d86 epoch                                                                               | `/tmp/puni-work-package-open-rejection-format16-v1/native`    |
| Configured types7            | exit0, empty raw           | current6d86 epoch                                                                               | `/tmp/puni-work-package-open-rejection-types7-v1/native`      |

The final configured types command covered BE, GW, MCP, core, SQLite, contracts and Twilight Dash CLI, with original exit0 and empty diagnostics. Runtime results at e179/9c4f are explicitly qualified prior epochs, not silently relabeled as reruns at6d86. The final two changes were test-only rejection continuations; the affected core13 was rerun at6d86. All current production bodies remained identical. `/tmp/puni-work-package-open-rejection-root-adjudication-v1.json` records that convergence; its then-prospective R5 wording remains historical and is superseded only by the actual rows below.

### Actual single-effect flights

Root executed each baseline, physical single-effect fault and exact restored canonical separately. All30 triples have actual original exit0/1/0, signal null and settled custody; no unobserved automatic sequence is inferred. Original raw/receipts/adjudications are under `/tmp/puni-work-package-open-physical-flight-v1/{F1–F9,M1,H1–H4}` and `/tmp/puni-work-package-open-sql-physical-flight-v1/{S1–S11,P1–P4,B1}`. Root reconciled all30 row journals and90 original transcript hashes in `/tmp/puni-work-package-open-thirty-root-adjudication-v1.json` (`6b5d4676`). Every restored checkpoint records exact canonical454 `6d86ce4026fe9449e86a6933869264e080d78b2058a0247f017d341ba9a6fa76`. Each raw, receipt and source effect is pinned in the private combined comment packet; exact test titles remain in adjacent Proof comments and its observed-evidence.json. Repeated test titles own distinct mutations, not additional test cases.

Counts are pass/fail/printed-expects in baseline → fault → restored order. No expect count is inferred from missing output: F5, S1, S4, S10 and P1 faults remain unreported even where immutable journal prose inferred zero.

| Scope | Actual first owning fault                                               | Counts                         | Bounded limit                                                                           |
| ----- | ----------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------- |
| F1    | Shared caller/access values differ at the captured equality.            | 1/0/8 → 0/1/4 → 1/0/8          | Whole caller/access retention; not each field.                                          |
| F2    | ok:true replaces insufficient_scope.                                    | 1/0/4 → 0/1/1 → 1/0/4          | Direct scope refusal; later no-writer checks unreached.                                 |
| F3    | Held stamp mutation reaches the later admitted-authority error.         | 1/0/8 → 0/1/2 → 1/0/8          | Whole stamp retention; later equality unreached.                                        |
| F4    | The early stamp error becomes a later authority error.                  | 1/0/4 → 0/1/2 → 1/0/4          | Early diagnostic distinction only.                                                      |
| F5    | access.kind TypeError before the first outcome assertion.               | 1/0/3 → 0/1/unreported → 1/0/3 | Local refusal forwarding only.                                                          |
| F6    | The first kind mismatch resolves instead of rejecting.                  | 1/0/16 → 0/1/1 → 1/0/16        | Compound through first kind arm only.                                                   |
| F7    | begin/commit replaces begin/rollback.                                   | 1/0/6 → 0/1/2 → 1/0/6          | Purpose decision, not SQLite rollback.                                                  |
| F8    | Two recorded legacy writes rather than one.                             | 1/0/5 → 0/1/5 → 1/0/5          | Legacy absent-target guard only.                                                        |
| F9    | Immediate local calls[] rather than[begin].                             | 1/0/8 → 0/1/1 → 1/0/8          | Local invocation ordering, not enqueue/snapshot.                                        |
| M1    | Unsupported memory call resolves false; rejected=false.                 | 1/0/2 → 0/1/1 → 1/0/2          | Explicit unsupported behavior; no memory parity.                                        |
| H1    | Nested caller evidence differs after204; ID stays unchanged.            | 1/0/2 → 0/1/2 → 1/0/2          | Nested retention; endpoint already copies top-level ID.                                 |
| H2    | Captured legacy access rather than the expected scoped access.          | 1/0/2 → 0/1/2 → 1/0/2          | HTTP forwarding, not DB authority.                                                      |
| H3    | First not_a_member403 becomes not_found404.                             | 1/0/10 → 0/1/1 → 1/0/10        | First refusal only; later arms unreached.                                               |
| H4    | insufficient_scope403 becomes404 after four refusal assertions.         | 1/0/10 → 0/1/5 → 1/0/10        | Scope reply only; hidden/unknown arms unreached.                                        |
| S1    | Changed-account/99 UPSERT fails its foreign key before row assertions.  | 1/0/2 → 0/1/unreported → 1/0/2 | Whole stamp copy; count unreported.                                                     |
| S2    | Held principal mutation produces false instead of true.                 | 1/0/2 → 0/1/1 → 1/0/2          | Whole principal; no issuedAt-specific claim.                                            |
| S3    | UPSERT foreign-key diagnostic replaces the early mismatch.              | 1/0/3 → 0/1/1 → 1/0/3          | Early diagnostic; later no-Gate/write checks unreached.                                 |
| S4    | First absent arm throws row.organization_id TypeError.                  | 1/0/6 → 0/1/unreported → 1/0/6 | Absent boundary; count unreported.                                                      |
| S5    | Raw joined SQL NULL resolves as foreign instead of rejecting.           | 1/0/3 → 0/1/2 → 1/0/3          | Validation forwarding; later state assertion unreached.                                 |
| S6    | Foreign-map bypass reaches the parent diagnostic before false.          | 1/0/7 → 0/1/5 → 1/0/7          | Foreign-before-parent ordering; no restriction/private-field claim.                     |
| S7    | Mapping INNER JOIN filters corruption; call resolves without rejection. | 1/0/3 → 0/1/2 → 1/0/3          | Local mapping join, not shared decoder reproof.                                         |
| S8    | Parent INNER JOIN filters corruption; call resolves without rejection.  | 1/0/5 → 0/1/4 → 1/0/5          | Parent join; deliberate relationship corruption remains.                                |
| S9    | Hidden OPEN204/null instead of absent404 after real positives.          | 1/0/19 → 0/1/18 → 1/0/19       | Local permission refusal; later hidden state check unreached.                           |
| S10   | Supplied borrowed Gate throws before the awaited true.                  | 1/0/3 → 0/1/unreported → 1/0/3 | Borrowed bypass; manual outer rollback; count unreported.                               |
| S11   | Paired failure ceases to be AggregateError after rejected=true.         | 1/0/7 → 0/1/1 → 1/0/7          | Paired-error retention; fixture manual repair; later ordered causes unreached.          |
| P1    | The actual operation settles before its supplied Gate entry.            | 1/0/2 → 0/1/unreported → 1/0/2 | Supplied Gate binding; count unreported; no enqueue claim.                              |
| P2    | COMMIT then ROLLBACK report no active transaction.                      | 1/0/6 → 0/1/1 → 1/0/6          | BEGIN protocol; UPSERT may autocommit; later snapshots unreached.                       |
| P3    | Independent access-row query is[] after method true.                    | 1/0/6 → 0/1/3 → 1/0/6          | Commit visibility; fixed query-only close; later restamp checks unreached.              |
| P4    | Missing rollback invocation loses the injected paired failure.          | 1/0/7 → 0/1/1 → 1/0/7          | Rollback invocation/error path; fixture manual repair; no earlier-write rollback claim. |
| B1    | Legacy app delegation returns hidden204/null rather than absent404.     | 1/0/19 → 0/1/18 → 1/0/19       | App forwarding; no same-writer timing or later hidden-state claim.                      |

F4/S3 own the exact early diagnostic boundary; F6 owns the compound check through its first kind arm, not each conjunction. S7/S8 comments sit outside the SQL template and preserve literal query bytes. P2 may leave its disposable UPSERT autocommitted before COMMIT/ROLLBACK fail, so this does not prove no-write or staged rollback. P3 owns independent publication visibility under the already accepted fixed query-only selected-close contract; the original fault reported the assertion alone, with no close failure, and later restamp assertions were unreached. S10 manually rolls back its outer fixture transaction. S11 and P4 restore db.run and manually repair their transaction before rethrow; the faults stop before later ordered cause/error comparisons. No repair is invented by this verification append.

For S9/B1 all six actual mounted fixture custody records show one captured closeComposed attempt settled, no unknown acquisition/settlement and no cleanup errors. Their returned DBs are removed by composed close; retained JSON/snapshot evidence is not a retained-DB claim. Every native receipt records its owned child stopped/reaped and descriptors closed. These are scoped custody facts, not global process/FD absence, generic lifecycle correctness, or operational activation evidence. Direct unit/route rows do not claim DB authority. Local mapping/parent checks do not reprove shared decoder/grant algebra. No whole OPEN policy/R5 completion, other read-purpose closure, task checkbox completion, release/deploy or host result is claimed.

The new source candidates add only30 adjacent comments over saved canonical copies; the sealed OPEN14 candidate bytes and historical Proof bodies remain unchanged. This append preserves the complete300,544-byte `048cb5eb` verify prefix. No mutable worktree source was read, and no new app/test/compiler/lint/formatter or publication ran while preparing these notes. Post-comment formatting/quality and publication remain pending Root review. The separately prepared history first2 proposal remains unrun; OPEN evidence does not transfer to it.

Observed reviews: OPEN14 `/tmp/puni-work-package-open-fourteen-comments-astra-v1.md` (`bec5d518`) and SQL16 `/tmp/puni-work-package-open-sql-sixteen-observed-astra-v1.md` (`2a73ec99`) independently qualify the same named scopes and custody limits. Earlier SQL16 source/binding reports505656/918364 remain distinct from that observed audit. Root's printed-count addendum `/tmp/puni-work-package-open-printed-count-qualification-v1.json` preserves old journals while qualifying their inferred zeros.

## History observation implementation and observed local boundaries — 2026-11-14

The required `WorkPackageObservation.readHistory(caller,id,filter)` now owns complete-caller/current-mode admission, current package authority and event projection in one committed observation. Scoped lookup keeps mapping/parent corruption visible for validation before private event JSON; valid foreign or denied packages stay absent. Legacy retains its same-snapshot raw package-existence distinction. The route retains the caller and filter before initial resolution, forwards actual expected access and models later refusals/null. Fixture closure passes the actual shared history service; unused collaborators reject. No new Source capability or optional authority fallback was introduced.

The original human and issued-credential mounted selections each failed after real setup and readable/absent/protected-read controls: hidden history returned200/private events instead of404 (19 and29 printed expects; each0PASS/1FAIL/16filtered). Original receipt hashes are `b2d2cf10043dffd77ee0d25e3b7861f7ec3bd4c0ebb9673d4be7cb8fb820f336` and `64e75ea532cce71d8fde36dad370858a7d44e3b1faecb462e45d0c2335f1163e`; their source454 epoch remains historical.

### Coherent19 predecessor and one-test oracle correction

Actual19 publication expanded454 to458 existing paths. The first eleven groups recorded ten PASS and one failed backend group at source192435. All full original commands/receipts/raw/validations and Root journals are retained; the original backend failure is not relabeled.

| Original group   | Observed outcome            | Original receipt SHA256                                            |
| ---------------- | --------------------------- | ------------------------------------------------------------------ |
| mounted17        | 17PASS/0FAIL; 211 expects   | `2c15370b1433ba0e11aea146f851adf142c7be50cac979116c8b835d2df257b8` |
| sql45            | 45PASS/0FAIL; 251 expects   | `c7aad5d1ac35c5e7c7f3d88386eed3592de522f1a8aeca83c732f8e98b55da06` |
| types7           | exit0                       | `048eb1054b1c8b15a3a88b2bf75ef17eb23d939078574dd3d76c6450b21a958f` |
| corehistory5     | 5PASS/0FAIL; 22 expects     | `da933c2b893c6fb93c4be089a6583f24b57e55f0868dec10feb386bf321a4c07` |
| historyHTTP8     | 8PASS/0FAIL; 15 expects     | `d4200d1b29d55a26a98a9a27a370ec2aa4c6f9911cf6aa00ff1b3c4673e9903c` |
| reachability2    | 2PASS/0FAIL; 1346 expects   | `a4f1d1542109b6cc1e9e6cab1521dd71a930edefb533e280d8434394abeb2631` |
| fixture-backend  | 235PASS/1FAIL; 1380 expects | `b702999ccc37694b64b75cf1911bb47dca37997a167fcdb49692e20b66adb097` |
| fixture-core9    | 9PASS/0FAIL; 34 expects     | `95c5b9291ebd7096a6876de258ac9424ea0414f6ec7ff430a78a1aeb8dea743d` |
| fixture-generic2 | 2PASS/0FAIL; 8 expects      | `44b354a79b5a8fc2a5d7609f5c06ef3a7ba698fe47aaed622eaaab0e040fe8be` |
| lint18           | exit0                       | `cbf159374cb85d11767b7f947a2ba91ed5784b25913ad2ccedae34acc1503ddc` |
| format19         | exit0                       | `ebd4f0b8822df607867880e2a192bd30c05005ba8bae20fa6b5a99f6f3de802e` |

The sole backend failure was its old restricted-legacy creator deadline200 expectation receiving403. Existing LEGACY_EDIT_ADMISSION is `!restricted`; creator metadata grants no exemption. Exactly one existing test case was corrected, retaining the unrestricted stranger200 suffix; no production policy changed. Fresh c1c7c0a7 source458 checks then passed: exact whole backend vector236PASS/1387expects, BE configured types empty0, lint1 empty0, format1 matched0. Their receipt hashes, complete command vectors and original failure ancestry are in `/tmp/puni-history-observed-comments-three-v1/observations.json`; Root aggregates are `/tmp/puni-history-eleven-root-adjudication-v1.json` and `/tmp/puni-history-successor-four-root-adjudication-v1.json`. Prior other ten groups remain qualified to the unchanged production predecessor, not rerun under a new label.

### Fourteen independent physical production-path negatives

Each row used a fresh canonical baseline, one exact local physical source variant, manual archived restoration, and fresh restored canonical, with original exits0/1/0. H rows ran `bun test ./libs/wbs/adapters/store-sqlite/src/work-package-observation.db.test.ts --test-name-pattern <literal-suffix> --timeout=30000` (1selected/44filtered). R rows used `bun test ./libs/wbs/application/core/src/http/history.routes.test.ts --test-name-pattern <literal-suffix> --timeout=10000` (1selected/4filtered). Cwd was AF5E and each outer deadline180000ms. These command schemas summarize actual literal argv: all42 exact vectors/suffixes, original receipt/raw hashes, validations, manual custody and accepted reviews are bound in `/tmp/puni-history-observed-comments-three-v1/observations.json` and `/tmp/puni-history-physical-flight-v2/index.json`. No shell substitution, build/loader instrumentation or automatic succession was used.

| Scope | Printed expects baseline/fault/restored | First observed fault                                                    |
| ----- | --------------------------------------- | ----------------------------------------------------------------------- |
| H1    | 4/3/4                                   | Filter alias captured[] instead of retained batch.                      |
| H2    | 6/4/6                                   | Missing legacy ID returned[] instead ofnull after event/empty controls. |
| H3    | 4/1/4                                   | Missing read threw at row.organization_id before its expect.            |
| H4    | 5/4/5                                   | Bypassed mapping reader resolved; concrete payload unobserved.          |
| H5    | 5/4/5                                   | Mapping INNER JOIN resolved missing-map case; payload unobserved.       |
| H6    | 6/5/6                                   | Parent INNER JOIN resolved missing-parent case; payload unobserved.     |
| H7    | 7/6/7                                   | Foreign mapping reached parent invariant before null expect.            |
| H8    | 5/1/5                                   | Denied read parsed malformed event JSON before null expect.             |
| H9    | 5/2/5                                   | Fresh event projection returned new epoch/label under old decisions.    |
| R1    | 2/2/2                                   | Aliased nested caller changed captured auth/scopes/binding.             |
| R2    | 2/2/2                                   | Delayed parsing captured mutated query; caller stayed retained.         |
| R3    | 2/2/2                                   | Captured expected access became legacy instead of scoped.               |
| R4    | 4/3/4                                   | Later refusal became direct200/events undefined instead of409.          |
| R5    | 1/1/1                                   | Observed-null became direct200/events null instead of404.               |

H3/H7/H8 throw before the expected-null assertion: fault counts1/6/1 belong respectively to an earlier empty positive, six fixture premises and a seeded event-row check. They include no failed expect. Other fault totals include the first failed expect. H4-H6 prove resolution instead of rejection without a concrete payload; H4 forwarding and H5 candidate retention are separate. H9 proves only one event-projection loan, not individual fields/shared observation lifetime. R1 is composite nested retention; endpoint shallow copying masks top-level ID mutation. R2 is declaration timing, R3 forwarding rather than fresh authority, R4 a direct typed-refusal reply, and R5 a protocol-double null mapping rather than repository absence/historical raw-service evidence. Later unreached controls and shared decoder/permission/parser/helper internals receive no borrowed credit.

Every native phase verified458 source pins and413 static supports; apply/restore custody plans verified358 support entries. `/tmp/puni-history-custody-support-count-qualification-v1.json` corrects early prose without rewriting originals. Root read every original and independently verified archive/readbacks, unchanged non-target paths, stopped/reaped scoped owner, closed descriptors and empty cleanup; this does not establish global process absence, compiler byte consumption, OS/native-flush behavior or generic helper lifetime. The complete Root aggregate `/tmp/puni-history-fourteen-root-adjudication-v1.json` and all14 accepted observed Astra reports bound by this packet delimit the claims. V1 Buffer-object manifest preparation failed before any actor and remains preserved; only corrected V2 flights ran. No whole read-surface/permissions/task-checkbox or gate closure is claimed.

## Gateway current-read admission: observed ordinary and necessity checkpoint

The two native mounted feature baselines are retained in [Root's first-two adjudication](/tmp/puni-gateway-first-two-root-adjudication-v1.json): current hidden package access and valid resume reached their final privacy failures after real creation, selection, grants and readable controls. They are feature RED evidence, distinct from the direct protocol and SQLite omission tests below.

The coherent 13-path publication used selected source b2acef72. Eight original groups passed: visibility21, SQL58, internal15, Elysia4, core fixtures14, backend fixtures236, reachability2 and format13. Configured types7 failed on a widened test refusal literal; lint13 failed on five Bun matcher assignments and two import orders. Original receipts and failures remain in [ordinary observations](/tmp/puni-gateway-proof-notes-v1/observations.json). The three-file correction changed only the refusal literal typing, matcher-to-unknown assignments and import order; [its publication](/tmp/puni-gateway-quality-correction-v1/publication.json) and [explicit source bridge](/tmp/puni-gateway-read-source-variants-v2/rebase-bridge.json) retain that transition.

At selected source 011542be, the [five actual successor groups](/tmp/puni-gateway-quality-successor-checks-prep-v1/root-five-adjudication.json) passed: visibility21 (21 pass, 307 expects), internal15 (15 pass, 99 expects), configured types7, lint13 and format13 (all exit 0). The earlier SQL58, Elysia4, fixture and reachability passes remain qualified to b2acef72; they were not rerun as fresh whole suites after the three-file correction. This records configured checks, not a whole dependency graph or gate.

Each of the 25 rows below has separate actual baseline/fault/manual-restore/canonical decisions. All 75 native originals exited 0/1/0 by row, selected one case, and retained their exact receipts, transcripts and validations. SQL cases printed 57 filtered; direct protocol cases printed 14 filtered. Printed expect counts include the failing expect when reached and are not prerequisite counts. [Root's aggregate](/tmp/puni-gateway-twenty-five-root-adjudication-v1.json) and [Astra's aggregate observed audit](/tmp/puni-gateway-twenty-five-observed-astra-v1.md) cover only these named local scopes. The [25-row observations](/tmp/puni-gateway-proof-notes-v1/observations.json) bind exact owning titles, commands, original hashes, first failures, local limits and the 15 individual observed reviews.

| Scope | Printed expects baseline/fault/canonical | Actual first fault and bounded meaning                                                                                                                                                                 |
| ----- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C1    | 5/3/5                                    | Missing legacy ID returned true, expected false; two corrupt-but-present positives passed. Presence result only; later activation checks were unreached.                                               |
| C2    | 5/3/5                                    | Missing legacy ID returned true, expected false; two present positives passed. Addressed legacy predicate only; later activation checks were unreached.                                                |
| C3    | 8/2/8                                    | Missing scoped ID returned true after open positive; later controls unreached. Scoped ID predicate only; later foreign/restricted/private controls were unreached.                                     |
| C4    | 8/1/8                                    | Missing row threw before its expect; fault count1 is the earlier open positive. The sole fault expect was the earlier open positive; local absence handling only.                                      |
| C5    | 5/4/5                                    | Missing-map helper observed rejected=false; resolved payload unobserved. Joined SQL NULL forwarding only; resolved payload and shared decoder were unobserved.                                         |
| C6    | 5/4/5                                    | Missing-map helper observed rejected=false after trigger/parent/map premises. Candidate preservation, distinct from C5; no payload or shared-decoder proof.                                            |
| C7    | 6/5/6                                    | Missing-parent helper observed rejected=false after restoration/FK ON premises. Candidate preservation only; FK ON is not global integrity and payload was unobserved.                                 |
| C8    | 8/7/8                                    | Valid foreign map reached malformed parent and threw; false expect unreached. Seven fixture expects ran; false-result and private-decoding assertions were unreached.                                  |
| C9    | 6/5/6                                    | Target-reader bypass resolved instead of rejecting; downstream did not mask it. Whole local dependency only; no individual decoder clause or concrete payload proof.                                   |
| C10   | 8/4/8                                    | Denied restricted package returned true; open/missing/foreign controls passed. Final result enforcement only; authorizePackage still ran and later private/grant controls were unreached.              |
| C11   | 4/1/4                                    | Fresh target/grant loan returned false after rival move/revocation, expected held true. One combined target/grant loan boundary only; later parent/denial/repair checks were unreached.                |
| B1    | 3/3/3                                    | Captured browser caller mutated after healthy204 and original resolver capture. Composite caller only; 204/resolver capture passed, ID stayed original; no SQL/transport proof.                        |
| B2    | 3/3/3                                    | Captured browser ID changed; healthy204/resolver capture and full caller retained. Primitive ID timing only; complete caller stayed retained; no SQL/transport proof.                                  |
| B3    | 3/3/3                                    | Browser captured expectedAccess legacy after both true204/false404 controls. Argument forwarding only; controlled true204/false404 passed, no provider/SQL proof.                                      |
| B4    | 4/3/4                                    | Browser late409 became404; initial403 and zero observation calls passed. Direct late-reply mapping only; initial403/zero calls passed, final count was unreached.                                      |
| B5    | 3/2/3                                    | Browser false admission returned204; true204 passed, call equality unreached. Direct false-to404 mapping only; true204 passed, final captured calls were unreached.                                    |
| D1    | 3/3/3                                    | Captured delegation caller mutated after healthy204 and original resolver capture. Composite caller only; 204/resolver capture passed and ID stayed original; no SQL/transport proof.                  |
| D2    | 3/3/3                                    | Captured delegation ID changed after healthy204/resolver capture; caller retained. Primitive ID timing only; complete caller stayed retained; no SQL/transport proof.                                  |
| D3    | 3/3/3                                    | Delegation captured expectedAccess legacy after true204/false404 controls. Argument forwarding only; controlled true204/false404 passed, no provider/SQL proof.                                        |
| D4    | 4/3/4                                    | Delegation late409 became404; initial403 and zero calls passed. Direct late-reply mapping only; initial403/zero calls passed, final count was unreached.                                               |
| D5    | 3/2/3                                    | Delegation false admission returned204; true204 passed, call equality unreached. Direct false-to404 mapping only; true204 passed, final captured calls were unreached.                                 |
| U1    | 4/3/4                                    | Resume observed caller mutated after healthy200/resolver capture; replay equality unreached. Composite caller only; original cursor ID stayed retained and replay equality was unreached.              |
| U2    | 4/3/4                                    | Resume observed additional injected ID with full caller retained; replay equality unreached. Injected-key observation only; numeric replay equality was unreached, not a numeric-value proof.          |
| U3    | 3/2/3                                    | Resume observed expectedAccess legacy after correct reply; replay equality unreached. Argument forwarding only; reply passed, replay-map equality was unreached; no parser/SQL proof.                  |
| U4    | 3/1/3                                    | First reply lost hidden DENIED; visible replay and invalid-namespace denials remained. One composite gate only; visible replay/invalid denials remained, later calls/replay assertions were unreached. |

The new adjacent notes name the actual owning test beside each omitted operation. C5/C6/C7/C9 observed resolution instead of rejection; their concrete resolved payload was not asserted. C8's fault count belongs to fixture/enforcement premises before the false-result assertion. C11 varies one combined target-and-grants observation loan, not independent field or generic lifetime checks. Browser/delegation protocol cases prove caller/ID retention and direct reply forwarding using controlled observation; they do not independently prove SQL authority or network transport. U2 proves the injected subscription key reached observation, not that numeric replay values 99/-9 were replayed. U3 stops at expected-access capture. U4 proves the whole admission gate through the missing hidden DENIED reply entry; it is not an independent proof of each conjunct or of hidden event replay.

The original selected commands and budgets are retained in every phase receipt; examples:

- C1 example: `/home/df/.bun/bin/bun test ./libs/wbs/adapters/store-sqlite/src/work-package-observation.db.test.ts --test-name-pattern 'keeps legacy read admission to narrow existence and refuses it after actual activation$' --timeout=30000` (outer 180000 ms).
- B1 example: `/home/df/.bun/bin/bun test ./libs/wbs/application/core/src/http/internal.routes.test.ts --test-name-pattern 'direct browser gateway retains nested caller and primitive package ID before initial resolution waits$' --timeout=10000` (outer 180000 ms).

All rows restored the entire selected canonical 462-path snapshot and retained actual normal native settlement, reaping and descriptor closure; these are scoped receipts, not global process absence or compiler-consumption evidence. Root read each original before its successor. Existing Proof text, SQL literals and all executable bytes are preserved by exact whole-file removal of the 25 new known comment strings. This private comment/document preparation ran no application, tests, formatter or quality command and supplies no post-comment quality result. It does not close saved/current-capture, all read policy, activation, lifecycle or the user's whole goal.

### Saved-shelf current admission: observed incremental slice (2026-11-14)

The shelf list now admits the complete current caller and narrow addressed target before reading detached saved headers on the existing borrowed observation. It does not verify saved bodies or grant admission to saved detail, comparison or current capture. Existing historical Proof text remains unchanged. This records the first shelf slice, not a parent task checkbox, the whole saved/current scope, or a host/full gate.

The actual mounted case `conceals a real saved shelf as absent after its selected reader loses the actual parent grant` first printed 0 pass/1 fail/21 filtered/25 expects: final shelf equality received 200 with the named persisted shelf instead of the independently established absent 404. Real birth, save/bytes/hash, readable and removed-grant/member premises preceded it. Its unchanged selected successor printed 1 pass/0 fail/21 filtered/25 expects. [RED receipt](/tmp/puni-saved-shelf-first-run-v1/native.receipt.json) SHA-256 `261a00012c55c7ff1bb8c86b387412790d0ffe477f7302960789a31c4d69fbad`; [GREEN receipt](/tmp/puni-saved-shelf-first-green-v1/native.receipt.json) SHA-256 `f9dd060f263a7b959138b18139a4d3d7472ed528701e00fe899eefa8840915f7`. Both used:

```text
/home/df/.bun/bin/bun test ./apps/wbs/be-01/src/controller/visibility.controller.db.test.ts --test-name-pattern 'conceals a real saved shelf as absent after its selected reader loses the actual parent grant$' --timeout=10000
```

Outer deadline was 180000 ms in AF5E; each original retains the raw transcript, validation and captured fixture custody. This is human shelf visibility evidence, without broader detail/compare or generic cleanup credit.

The [15-original ordinary aggregate](/tmp/puni-saved-shelf-ordinary-root-aggregate-v1.json) SHA-256 `1629837db7d04c7b4fad4d7b7f28eeb65ea11aec6db1a0635e04b806855a35c1` retains exact commands, raw/receipt/validation pins and source epochs. The table reports pass/fail/printed expects for tests, otherwise exit status; directory labels such as core21 do not override actual collection.

| Source   | Original group                                 | Actual     | Receipt hash (link to full command)                                                     |
| -------- | ---------------------------------------------- | ---------- | --------------------------------------------------------------------------------------- |
| 4d3fda04 | puni-saved-shelf-ordinary-v1/core21            | 20/0/90    | [8b7095dec9e0](/tmp/puni-saved-shelf-ordinary-v1/core21/native.receipt.json)            |
| 4d3fda04 | puni-saved-shelf-ordinary-v1/sql65             | 65/0/365   | [d7b77e9c0fc3](/tmp/puni-saved-shelf-ordinary-v1/sql65/native.receipt.json)             |
| 4d3fda04 | puni-saved-shelf-ordinary-v1/visibility22      | 22/0/332   | [e29f202ccc0f](/tmp/puni-saved-shelf-ordinary-v1/visibility22/native.receipt.json)      |
| 4d3fda04 | puni-saved-shelf-ordinary-v1/saved-routes      | 98/16/547  | [77b3813fc118](/tmp/puni-saved-shelf-ordinary-v1/saved-routes/native.receipt.json)      |
| 4d3fda04 | puni-saved-shelf-ordinary-v1/saved-repository  | 30/0/73    | [a1caf0caab64](/tmp/puni-saved-shelf-ordinary-v1/saved-repository/native.receipt.json)  |
| 4d3fda04 | puni-saved-shelf-ordinary-v1/backend236        | 236/0/1387 | [50ab63851abd](/tmp/puni-saved-shelf-ordinary-v1/backend236/native.receipt.json)        |
| 4d3fda04 | puni-saved-shelf-ordinary-v1/types7            | exit 0     | [263e2a2f4abf](/tmp/puni-saved-shelf-ordinary-v1/types7/native.receipt.json)            |
| 4d3fda04 | puni-saved-shelf-ordinary-v1/lint14            | exit 1     | [2feef148c923](/tmp/puni-saved-shelf-ordinary-v1/lint14/native.receipt.json)            |
| 4d3fda04 | puni-saved-shelf-ordinary-v1/format14          | exit 0     | [aa92a7523f83](/tmp/puni-saved-shelf-ordinary-v1/format14/native.receipt.json)          |
| 683163af | puni-saved-shelf-repair-checks-v1/saved-routes | 112/2/612  | [50e0b7d5b9a3](/tmp/puni-saved-shelf-repair-checks-v1/saved-routes/native.receipt.json) |
| 683163af | puni-saved-shelf-repair-checks-v1/types7       | exit 0     | [dd5204962b22](/tmp/puni-saved-shelf-repair-checks-v1/types7/native.receipt.json)       |
| 545ed00c | puni-saved-shelf-final-ordinary-v1/connected2  | 2/0/106    | [72e799c25204](/tmp/puni-saved-shelf-final-ordinary-v1/connected2/native.receipt.json)  |
| 545ed00c | puni-saved-shelf-final-ordinary-v1/types7      | exit 0     | [11aaab8088fd](/tmp/puni-saved-shelf-final-ordinary-v1/types7/native.receipt.json)      |
| 545ed00c | puni-saved-shelf-final-ordinary-v1/lint16      | exit 0     | [f07341d5d8fd](/tmp/puni-saved-shelf-final-ordinary-v1/lint16/native.receipt.json)      |
| 545ed00c | puni-saved-shelf-final-ordinary-v1/format16    | exit 0     | [815887d6a4f2](/tmp/puni-saved-shelf-final-ordinary-v1/format16/native.receipt.json)    |

The explicit bridges are 466 selected paths at `4d3fda04` → 468 at `683163af` (three fixture/test repairs plus two import-only orders) → `545ed00c` (one connected synthetic wire5 scope-key correction). The first 98/16 saved-route run and later 112/2 run remain failures. The final two owning connected cases actually passed 2/0/106; no fresh single 114/0 run is claimed. The first publication's five writes completed before its evidence loop rejected changed live preimages; its read-only recovery verified archives, candidates and all 468/371 pins rather than relabeling that publication clean. Earlier core20, SQL65, visibility22, repository30 and backend236 passes retain their 4d3 epoch. Current types7/lint16/format16 passed at 545; old lint14's two import-order failures remain recorded. No suites are silently replayed or promoted across epochs.

Twenty finite single-effect experiments then each observed one selected baseline pass, one fault failure, exact source restoration and one canonical pass. The [Root aggregate](/tmp/puni-saved-shelf-twenty-root-adjudication-v1.json) SHA-256 `f50fa1f4519e3c123a65173bce6f2a4e38442766bfb10adb080fc62857f7477b` binds all 60 originals and manual first-failure decisions. [Astra's accepted observed audit](/tmp/puni-saved-shelf-twenty-observed-astra-v1.md) SHA-256 `aee2d74ab49e24d818abe0683f121dba0c12414a91b34dd8d2c9bdbd7ddbbf40` records the narrow limits. [Exact command/evidence inventory](/tmp/puni-saved-shelf-observed-comments-four-v2/observations.json) retains every original full argv, receipt/raw/validation hash, count, Root claim and qualified limit; full hashes are not replaced by the table abbreviations. Printed expects include a failing expect when reached, not a count of passed prerequisites.

| Local scope                                                                   | Printed expects baseline/fault/canonical | Actual first fault and limits                                                                                                                         |
| ----------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| [S1](/tmp/puni-saved-shelf-finite-runner-v2/runs/S1/root-adjudication.json)   | 7/7/7                                    | Forced legacy admission exposed three revoked-grant headers; earlier ordered, empty and absent controls passed. Local dispatch only.                  |
| [S2](/tmp/puni-saved-shelf-finite-runner-v2/runs/S2/root-adjudication.json)   | 4/3/4                                    | Absent legacy address became empty after two present positives. Later activation refusal unreached.                                                   |
| [S3](/tmp/puni-saved-shelf-finite-runner-v2/runs/S3/root-adjudication.json)   | 7/5/7                                    | Absent scoped address threw on row.organization_id during await; null equality and revoked-grant control unreached.                                   |
| [S4](/tmp/puni-saved-shelf-finite-runner-v2/runs/S4/root-adjudication.json)   | 9/2/9                                    | Owned missing map resolved; helper rejected=false. Payload and later parent/foreign controls unobserved; local mapping-reader forwarding only.        |
| [S5](/tmp/puni-saved-shelf-finite-runner-v2/runs/S5/root-adjudication.json)   | 6/4/6                                    | Valid foreign mapping reached own-parent validation and threw. Null equality unreached; local opacity only.                                           |
| [S6](/tmp/puni-saved-shelf-finite-runner-v2/runs/S6/root-adjudication.json)   | 7/7/7                                    | Ignored permission refusal exposed three revoked-grant headers. Actual decision enforcement, not shared authentication/cap/decoder proof.             |
| [S7](/tmp/puni-saved-shelf-finite-runner-v2/runs/S7/root-adjudication.json)   | 7/2/7                                    | First ordered equality included other-package and foreign-package headers. Later assertions unreached; no body/codec proof.                           |
| [S8](/tmp/puni-saved-shelf-finite-runner-v2/runs/S8/root-adjudication.json)   | 3/1/3                                    | Fresh header connection returned Changed, expected held Captured. Header dependency only; unchanged authority callback, later controls unreached.     |
| [S9](/tmp/puni-saved-shelf-finite-runner-v2/runs/S9/root-adjudication.json)   | 4/3/4                                    | Legacy predicate omission made missing address empty, distinct from S2. Later activation refusal unreached.                                           |
| [S10](/tmp/puni-saved-shelf-finite-runner-v2/runs/S10/root-adjudication.json) | 11/11/11                                 | Scoped predicate omission made missing address empty after four owned/readable positives and mapping/parent/FK premises; no row-order assumption.     |
| [S11](/tmp/puni-saved-shelf-finite-runner-v2/runs/S11/root-adjudication.json) | 9/2/9                                    | INNER mapping join discarded corrupt owned candidate; helper rejected=false. Payload and later controls unobserved.                                   |
| [S12](/tmp/puni-saved-shelf-finite-runner-v2/runs/S12/root-adjudication.json) | 9/7/9                                    | INNER parent join discarded corrupt owned candidate after missing-map rejection; helper rejected=false. Payload and final foreign control unobserved. |
| [S13](/tmp/puni-saved-shelf-finite-runner-v2/runs/S13/root-adjudication.json) | 9/7/9                                    | Whole local target-reader bypass preserved missing-map rejection but let missing-parent read resolve. No per-field/shared-codec credit.               |
| [R1](/tmp/puni-saved-shelf-finite-runner-v2/runs/R1/root-adjudication.json)   | 3/2/3                                    | Healthy 200 then nested observer caller mismatch. Top-level ID retained by endpoint binding; resolver equality unreached.                             |
| [R2](/tmp/puni-saved-shelf-finite-runner-v2/runs/R2/root-adjudication.json)   | 3/2/3                                    | Healthy 200 then captured ID changed; nested caller exact. Later resolver equality unreached.                                                         |
| [R3](/tmp/puni-saved-shelf-finite-runner-v2/runs/R3/root-adjudication.json)   | 4/1/4                                    | Initial 403/not_a_member became late 409/context_changed. Zero-call and late-refusal controls unreached.                                              |
| [R4](/tmp/puni-saved-shelf-finite-runner-v2/runs/R4/root-adjudication.json)   | 3/3/3                                    | Final resolver input mutated after healthy 200 and exact retained observer caller/ID passed. Argument forwarding only.                                |
| [R5](/tmp/puni-saved-shelf-finite-runner-v2/runs/R5/root-adjudication.json)   | 3/2/3                                    | Healthy 200 then expected scoped context became legacy. Not current grant authority; final resolver capture unreached.                                |
| [R6](/tmp/puni-saved-shelf-finite-runner-v2/runs/R6/root-adjudication.json)   | 4/2/4                                    | Initial 403/zero calls passed; late refusal became rows projection TypeError. Late 409 equality and final count unreached.                            |
| [R7](/tmp/puni-saved-shelf-finite-runner-v2/runs/R7/root-adjudication.json)   | 7/2/7                                    | Populated/empty projections passed, then null rows.map threw. 404 equality, selected caller captures and old-service noninvocation unreached.         |

SQL selected commands used `bun test ./libs/wbs/adapters/store-sqlite/src/work-package-observation.db.test.ts --test-name-pattern '<exact title>$' --timeout=30000` (one selected, 64 filtered); direct routes used `bun test ./libs/wbs/application/core/src/http/saved-plan.routes.test.ts --test-name-pattern '<exact title>$' --timeout=10000` (one selected, five filtered). All used the pinned Bun executable, AF5E cwd and 180000 ms outer deadline. Example exact vectors:

```text
/home/df/.bun/bin/bun test ./libs/wbs/adapters/store-sqlite/src/work-package-observation.db.test.ts --test-name-pattern 'lists saved headers after current admission in repository order without body or package projection$' --timeout=30000
/home/df/.bun/bin/bun test ./libs/wbs/application/core/src/http/saved-plan.routes.test.ts --test-name-pattern 'direct shelf retains nested caller and primitive ID before held initial resolution$' --timeout=10000
```

Every phase verified the truthful selected 468-path canonical or single-file fault projection, static 371 supports and pinned evidence. Native originals were settled, stopped/reaped, descriptors closed and primary/cleanup empty; the single active mutation marker was absent after restoration. Root read each original before adjudication. These are finite owned-process/source-restoration observations, not global process absence, compiler-internal byte-consumption or generic SQL lifetime proof. Header rows legitimately lacked saved bodies; their list was header-only. Shared mode/authentication/target/codec internals and individual compound subclauses were not independently reproved.

S4/S11/S12/S13 observed failure to reject; their concrete resolved payloads were not asserted. S8 changes only the header query loan, leaving the authority callback intact. Route expectedAccess forwarding is not current grant authority; the retained nested caller and primitive ID controls are separate. R7's immutable Root journal incorrectly names later unknown-error checks: the accepted Astra qualification identifies the actual selected tail as the 404 expectation, caller-ID/caller captures and old list/workPackageRead noninvocation, all unreached in that fault; unknown-error checks belong to another test. The original journal/aggregate remain immutable.

The 20 new adjacent comments identify only these observations. Removing their known insertion groups restores all three complete old TS byte streams, including every prior Proof; S10–S12 are one original-position query insertion group. This appendix preserves the entire prior 336590-byte verify prefix. Its note-publication basis is the later one-test bridge `545ed00c` → `a76ea5e7`: only visibility.controller.db.test.ts acquired the next two detail/compare cases, whose separate outcomes are outside this shelf appendix, while all four note targets remained exact. Those new cases receive no result or implementation credit here. The formal observations remain bound to 545, not retrospectively rerun on a76. This private FS/text preparation ran no formatter, application, compiler, lint or test and supplies no post-comment quality result.

## Private settings/project checkpoint — 2026-11-15

The reviewed V17 settings/UI/project cohort contains 158 source rows (156 changed), index `ddaf9820`. These checks ran in a disposable source tree while the historical canonical 475 remained pinned to `de908443`. [Commands, native hashes and custody](verification-settings-project-20261115.json) record:

| V17 check                           | Actual outcome                                                  |
| ----------------------------------- | --------------------------------------------------------------- |
| Project repository + administration | 129 pass, 0 fail, 1063 expects; 70.67s                          |
| Configured Prettier                 | 154 paths matched; exit 0                                       |
| Configured ESLint                   | 149 distinct reports; 0 errors/warnings/fatals/messages; exit 0 |
| Configured types                    | Seven roots, `--build --force`; exit 0, empty diagnostics       |

The six prior child-privacy failures came from a retained creator project-manager grant legitimately granting package.read. The fixture verifies/removes that exact grant, retains current organization.create_project admission plus project.read, and proves no package.read and an empty real readable set before direct child grants. All original zero/one assertions and queued grant removal remain; corruption rollback and all-readable controls also pass. Production permission policy is unchanged by this repair.

Earlier constituents retain their own epochs: V14 UI 36 pass and settings conformance 8 pass/270 expects; V16 calendar/space/storage 17 pass/139 expects. They are not fresh V17 whole-suite reruns. Every cited native receipt settled normally with no primary/cleanup failure, closed descriptors, and matching source/support/evidence validation.

Root subsequently applied the reviewed 156 writes across 158 rows locally in isolated AF5E: [publication record](verification-settings-project-20261115.json) `0f4f4837`, new current WBS 584 `c0a02d96`; all 584 and 371 supports matched. The archived final forward/inverse were independently reconstructed; inherited V16 patch fields remain ancestry. No Git staging, commit or push occurred.

A subsequent live-AF5E selected settings run at source584 passed 120/0/792 expects across11 exact files (26.89s), with post584/support/evidence checks true. Its command and hashes are in the same JSON record; the preceding dist-JS collection-error attempt receives no GREEN credit.

The required catalogue dependency has its separate [report/preflight record](../wbs-step-catalogue/verify.md). Remaining work includes final document 17/18, settings UI/events, the permission matrix, catalogue apply/history/APIs/UI, script migration and combined gates. No task, commit, host gate or deployment completion is claimed.

## Read-only project-managed budget display — 2026-11-15

The selected package's existing validated LIST value now reaches General settings
through the existing catalog/generalSettings chain. Budget factor is read-only and
labelled Managed at project level. An absent optional value is visibly unavailable;
no factor1, provenance claim, stronger project request or write is introduced.

The actual-client tests first failed at the missing Budget factor group after the
wire/tree, enabled trigger, dialog/General and abbreviation prerequisites. The final
formatted implementation passed **56 tests across two files** (54 existing modal
cases plus the two budget cases), the normal frontend TypeScript build root, five
ESLint inputs without diagnostics and five Prettier inputs. The unchanged54-case
baseline and final run emitted the same 21 TimezonePanel act warnings; the run
is not warning-free. The existing Vite config-loader warning also remains.
Exact commands, source identities, raw hashes and limits are in the
[budget UI verification record](./verification-budget-ui-20261115.json).

Task4.8 remains open: true provenance, clear override, typed refusals, previews,
project/space settings, setting-event refresh and browser/by-eye checks are still
required. These checks do not establish the full entity scope or a repository gate.

## People and service-team space memberships — 2026-11-21

Task4.6.1–4.6.3 now expose bodyless POST/DELETE membership paths for people and
service teams. Space reads carry sorted `personIds` and `serviceTeamIds` from one
detached contents observation. Public SQLite reads use the existing committed read
pool in both Source modes; borrowed writes see their own staged memberships. Memory
now distinguishes person and service-team identities. Writes recheck current
`organization.manage_spaces` after admission and change no package/hash/grant/event
state. Duplicate adds are idempotent; missing removals and foreign/wrong-kind IDs
answer404; virtual-space writes answer409.

The [verification record](verification-space-memberships-20261121.json) pins commands,
source identities, receipts and qualifications. Final core:2124/0 across171 files;
Memory:802/0 across51 files; organization/space/membership API plus SQLite owners:46/0
across four actual files; final Memory plus SQLite:810/0 across52 files. Contracts,
OpenAPI and MCP:69/0 across four files, including the generated99 tools and required
path-only membership inputs. Contract shape load was378MB under the500MB bound.
Compiler321 entries, affected ESLint16 files and final two changed test files pass.

Twelve independent guard omissions fail actual production-path tests, with exact
byte/mode restoration after each fault: closed-write entry, closed-read continuation,
both identity kinds, committed public SQLite ownership, ordinary Memory/SQLite loan
expiry, all three repair owners, current membership authority and virtual-space
refusal. An actual SQLite `RAISE(IGNORE)` revision fault first exposed204 with a
retained link; the new exact-row-count check returns500 and rolls back that link.
Adjacent Proof comments identify these observations. Formatting/type-only changes
after the fault epochs are pinned separately and the final passing runs follow them.

Early fixture, compiler and lint failures receive no passing credit. Bun silently
skipped a nonexistent organization filename in an initial regression command; the
final46/0 command verifies four existing paths and includes all19 organization cases.
The expected native-failure API case logs its500; the run is not log-free.

Parent4.6 and4.6.4–4.6.5 remain open: actual named-space membership management UI,
project-folded reads/UI/rollups, directory deletion/cascade membership and revision
parity, and Astra review are required. Astra remains unavailable until the previously
recorded2026-11-22 10:09AM, timezone unspecified. Original nine requirements and all15
historical guarantees stay open. No browser/build/secrets/migration/full host gate,
public commit/push/PR/merge/deploy or activation is claimed. The old empty SQL Source
certificate custody remains unresolved; no whole Source SQL actor was restarted.

## Directory deletion and surviving spaces — 2026-11-21

Current person/team directory writers now remove their named-space memberships and
advance each affected surviving space once within the same owner. SQLite captures
membership IDs before the parent foreign-key cascade and uses the shared exact-count
revision update; ignoring the second space update rolls back the earlier successful
revision, root deletion and cascades. Memory updates its actual staged/committed graph
and clears identity ownership mappings. Refusal and rollback preserve memberships.

Memory team removal also honors existing member/label consent, supplies the complete
affected package trees and current step labels in usage, and clears confirmed primary
and secondary labels, capacity and owned service links while retaining unrelated state.
The [verification record](verification-space-directory-20261121.json) pins source,
commands, native receipts, nine omission controls and their exact restoration.

Final core:2124/0 across171 files; Memory:818/0 across52 files; current SQLite directory,
contents and membership API cohort:55/0 across four files. The original13 directory
repository cases pass13/0 with their bodies preserved modulo the author identifier
and formatting. Their initial13 failures occurred in ordinary-migrator setup; the
fixture now uses the actual approved catalogue bootstrap, current Dev/QA bindings and
Source-owned teardown. No migration guard was weakened and no case was skipped.
Compiler325 entries, affected ESLint8 files and the6095-file retired-consumer audit pass.

Each omission was tested independently: person/team membership cleanup, unrelated-space
revision filtering, member/label consent, service/capacity cleanup, native revision count
and current value validation. Usage and removal have separate configured missing-value
owners, both observed failing when validation was bypassed. An empty effective catalogue
requires zero value rows; those controls bind an actual step before deleting one value.
Fault failures credit only reached assertions; later state tails receive no inferred proof.

Parent4.6/UI/project folding and formal Astra review remain open. Raw Memory/SQLite
WorkItemStore.patch revision baselines differ; the deletion check asserts one additional
revision from each actual baseline. Broader Directory expiry and committed read ownership
remain for the complete Source audit. This slice changes the current DirectoryStore
writer, not arbitrary raw SQL, and introduces no migration or trigger. Original nine
requirements and all15 historical guarantees remain open. No browser/build/secrets/
migration/full host gate, public release, install or protected PAX execution occurred.
The older empty whole-Source SQL certificate custody is still unresolved and no actor
was blindly restarted. Astra remains unavailable until the previously recorded deadline.

## 2026-11-21 — committed project-grouped Space reader (partial4.6)

Implemented the required Source observation for actual project rows, including empty projects admitted by project.read and exact parent-name shells for package-only readers. Current credentials, grants, contents and child DTOs share one committed snapshot. Existing HTTP/browser flat reads and project-folded roll-ups still need integration; parent tasks remain open.

Evidence: [verification-space-project-read-20261121.json](verification-space-project-read-20261121.json).

| Check                                                        | Observed                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| Explicit source core                                         | 2124 pass,0 fail;171 files;13072 assertions                                                            |
| Actual Source reader/project reader/contents/membership HTTP | 87 pass,0 fail;4 files;830 assertions (27+46+8+6 cases)                                                |
| Compiler / lint                                              | 331 explicit roots /7 changed TypeScript files, exit0                                                  |
| Retired-consumer audit                                       | 6098 current TS/TSX files;0 retired shared consumers; unowned/frontend pins preserved                  |
| Existing project tests                                       | 30 case definitions preserved by AST, except current full metadata key additions;46 runtime cases pass |
| R5                                                           | 13 independent faults failed and restored; mutation state inactive                                     |

Faults: retained caller, resolver refusal, legacy ownership, absent/foreign space, project admission, readable package selection, project owner, foreign membership omission, named membership, project header decoding, management grant, virtual write authority and committed snapshot. Typed-refusal/foreign-member faults prove availability behavior; no unreached assertion is counted. The healthy restricted-child control fails before its private-corruption tail. Each production branch carries its adjacent observed Proof.

The initial test-only activation reversal was refused by the permanent marker; the corrected fixture starts before activation and retains the trigger. Existing project tests now migrate the actual current schema. An overbroad Bun filter collected compiled dist copies; the explicit source command above is authoritative. Expected HTTP native-failure logging appears in the passing membership run.

No browser, build, secrets scan, migration lint, full host gate, installed CLI proof or delivery was completed here. Astra remains unavailable until the recorded2026-11-22 10:09AM (timezone unspecified); formal review is outstanding. All nine original requirements, all13 fact families and all15 historical guarantees remain open. No install, protected PAX execution or whole-Source SQL restart; original inputs remain exact.

## 2026-11-21 — grouped space HTTP and browser integration (partial4.6)

The actual production/harness compositions require the committed Source SpaceRead. GET now exposes project groups and rejects obsolete flat rows. The browser renders empty/admitted projects with one control set each and readable package links/figures beneath. Complete nested caller evidence survives initial resolution; current Source membership loss refuses. See [verification-space-groups-http-ui-20261121.json](verification-space-groups-http-ui-20261121.json).

| Check                                 | Observed                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| Explicit source core                  | 2124 pass,0 fail;171 files;13039 assertions                                                 |
| Mounted/API/contracts/MCP/performance | 72 pass,0 fail;8 files;550 assertions                                                       |
| Component tests                       | 51 pass,0 fail;3 files                                                                      |
| Compiler                              | 348 backend,6 frontend and4 browser roots, exit0                                            |
| Retired-consumer source audit         | 6101 TS/TSX files;0 retired shared consumers; unowned source/frontend/E2E pins exact        |
| MCP                                   | Generated document equals declarations;99 independently named tools                         |
| Performance                           | 30 packages ×300 rows; space40.4ms under120; warm15.4ms under400; cold1292.8ms printed only |
| R5                                    | 8 independent faults failed and restored, including4 count and9 private-field negatives     |

Faults cover deep principal retention, Source refusal forwarding, foreign-space404 forwarding, obsolete flat replies, project counts, exact parent shells, viewer controls and empty-project candidate admission. The first principal control proved only bind's existing shallow copy; real stored machine evidence and nested delegation mutation corrected that blind spot. The production guard archives and comment-free AST bridge are retained. Refusal faults prove typed response behavior only; no unreached assertion is credited.

All14 existing space-page cases remain plus the new empty/grouped case;7 spaces-page,23 scoped-settings case definitions and13 organization HTTP cases remain. Four project fixtures gain required nullable membership metadata; the independent MCP manifest adds the4 existing membership operations. Browser drawing fixtures use current groups/project paths. Their real-browser layout checks are not run. Expected native HTTP failure and Vite compatibility warning appear in successful logs.

The performance fixture had obsolete role-label authority, raw import body and space/package paths. It now uses explicit org-admin grants, real engagement projects, current coded import with explicit defineMissing:true, project membership and composed cleanup. The workload, all leaf assertions and timing bounds remain.

OpenSpec parents4.6/4.6.4/4.6.5 remain open: per-project folded roll-up API/UI, people/team management UI and Astra review are required. Astra remains unavailable until recorded2026-11-22 10:09AM timezone unspecified. Full builds, secrets/migration checks, exact-SHA host gate and delivery are not claimed. All9 original requirements,13 fact families and15 historical guarantees remain open; original captures and protected archive remain exact.

## 2026-11-21 — coherent project rollup Source (partial4.6)

The bound Source captures complete authority, requested projects, readable package inputs/cache choices and live metadata on one committed loan. Local scheduling and canonical presentation finish after release. Actual project shells, readable children and ordered groups survive; absent/invisible/out-of-space projects or a required hidden endpoint refuse the whole query. Empty and unavailable aggregates are explicit. Dates span children only without child schedule errors; effort/status/leaf/wait counts fold. No invented engine, revision or sequence. Evidence: [verification-space-project-rollup-20261121.json](verification-space-project-rollup-20261121.json).

| Check                                 | Observed                                                                                                    |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Core                                  | 2124 pass,0 fail;171 files;13068 assertions                                                                 |
| Actual Source/grouped HTTP regression | 46 pass,0 fail;3 files;743 assertions                                                                       |
| Domain                                | 1911 pass,3 skip,1 fail;127 files;69798 assertions; identity blocker below                                  |
| Type/lint                             | 351 explicit compiler roots and10 changed TS owners, exit0                                                  |
| Source audit                          | 6104 TS/TSX files,0 retired shared consumers; unowned Source/frontend/E2E pins exact                        |
| R5                                    | 17 independent production-path faults failed and restored; native owners stopped/reaped, descriptors closed |
| OpenSpec                              | 343 items valid;15/48 tasks complete;4.6/4.6.4/4.6.5 remain open                                            |

Source cases cover literal20-day totals, exact package-only shells, empty projects, unavailable engines, actual stored cycles, isolated/shared connected FS dates, shared singleton capture, snapshot rivalry, caller/request retention, loan release/expiry, Source closure and trusted-state failure recovery. Fault archives retain executable-statement/import-binding bridges; final lint changed only imports and a type alias to an interface in addition to Proof comments. Availability-only forwarding proofs and success-only expiry are qualified in the JSON.

The first broad domain run found three stale connected ownership error regexes plus the frozen scheduler digest failure. Reverting only this turn domain implementation to captured V104 bytes reproduced all4 failures before exact restoration. Only three stale hyphen/camel spellings were corrected; all case definitions and production refusals remain. The surviving v4 identity expects f0145c81759486b5 but observes c1be35cb07f30c57. A diagnostic mapping workPackageStart back to projectStart recovers the exact frozen digest, identifying the serialized-label rename while leaving placement unchanged. No pin, algorithm ID or historical golden was changed. A reviewed versioned current/historical identity repair is still required; domain/full gate are not green.

HTTP/projectIds descriptors, production factory composition, parent/child browser figures and warm-cache/performance checks are next. Current endpoint/UI remain on their old rollup surface; no user-facing completion claim. Member-management UI, all13 fact/all15 history closure, complete PUNI CLI/Bun inventory, real Chromium and exact-SHA host gates/delivery remain. Astra unavailable until recorded2026-11-22 10:09AM timezone unspecified. No new agents/install/PAX/public release or blind older whole-Source restart. All9 full original requirements remain exact.

## 2026-11-21 — project rollup HTTP and browser integration (partial4.6)

The production projectIds route now returns each project shell, position, folded figures and complete readable child DTOs/figures from one observation. Production factory creation follows scheduling/optimizer binding. The browser publishes coherent project groups, preserves ready figures during refresh, invalidates whole older groups after cross-chunk moves and withdraws on modeled membership loss. Retired flat queries/replies are refused. Evidence: [verification-space-project-rollup-http-20261121.json](verification-space-project-rollup-http-20261121.json).

| Check                                | Observed                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Source/API/contracts                 | 56 pass,0 fail;6 files;522 assertions                                                                      |
| Restored Source + isolated aggregate | 32 pass,0 fail;2 files;613 assertions                                                                      |
| Connected / person load              | 26 /24 pass,0 fail                                                                                         |
| UI + routing                         | 69 pass,0 fail;4 files;real Chromium not run                                                               |
| OpenAPI/MCP                          | Generated current document;99 tools;62 tests pass,561 assertions                                           |
| Types/lint/format                    | Backend/frontend/browser roots compile;34 changed TS owners lint and format pass                           |
| Source inventory                     | 6106 TS/TSX;0 retired shared step-shape consumers;unowned pins exact                                       |
| New R5                               | 5 independent cache/component faults fail and restore;other new API/UI guards still need full sweep/review |
| Performance                          | FAIL: warm725.8ms exceeds400ms;30x300 workload and120/400 bounds retained                                  |

A bounded cache follows full current capture and stores only detached child projections. Complete captured evidence invalidates same-revision changes; both copy boundaries prevent returned replies poisoning held entries. One snapshot reuses a connected component. Faults independently remove lookup, captured evidence, read-copy, write-copy and component reuse; all sources restore. Existing subject scheduling assertions consume a validated test-only projection of actual grouped replies, never a production fallback.

The profiling pass retains all real calls: warm854.8ms, including540.4ms full input capture,80.0ms metadata and163.5ms cached detached finishing. Canonical presentation counts20 cold/0warm and leaf/equality/scan assertions pass. The warm limit remains a blocker; do not weaken authority, capture, workload or timing to obtain green.

The broad74-case scheduling suite reached its180-second native deadline and remains incomplete. Its receipt records SIGTERM, original observation, stopped/reaped owner and closed descriptors, with settled=false. Duplicate grant, comparison/current-contract and optimizer-publication failures need diagnosis; no automatic blind restart. The prior frozen scheduler v4 identity mismatch also remains. No history golden, identity pin or production safety fallback was changed.

Parents4.6/4.6.4/4.6.5 stay open, including people/team management UI, complete guard sweep, warm performance and Astra review. Astra remains unavailable until recorded2026-11-22 10:09AM timezone unspecified. All9 original requirements,13 fact families and15 historical guarantees remain; full Source/core/domain/browser/build/secrets/migration/host-gate/delivery completion is not claimed. No new agents/install/PAX/public release occurred.

## 2026-11-21 — current scheduling fixture integration

The retained scheduling suite now constructs current cache publications and comparisons, finishes real catalogue-edit work before enabling optimization, and settles held launcher stand-ins during composed shutdown. No production implementation or historical identity was changed. Evidence: [verification-current-scheduling-fixtures-20261121.json](verification-current-scheduling-fixtures-20261121.json).

| Check                        | Observed                                                             |
| ---------------------------- | -------------------------------------------------------------------- |
| Complete scheduling suite    | 74 pass,0 fail;408 assertions;1 file                                 |
| Earlier selected regressions | 8 pass and5 pass,0 fail after their respective repairs               |
| Types/lint/format            | 353 explicit backend roots compile;one changed fixture lints/formats |
| Source inventory             | 6106 TS/TSX;0 retired shared consumers;all unowned pins exact        |
| Performance                  | Still blocked;all production candidates restored exactly             |

Current18-version literals became the actual installed contract; comparison sides assert recorded project identity and local provenance. Creator authority is asserted instead of inserted twice. Explicit cursor upserts coexist with generated catalogue events; the no-write check preserves the complete pre-read ledger. Catalogue edits drain while optimization is disabled. Launcher handoffs stay pending during assertions and receive a terminal EOF/exit1 fixture child during cleanup; no external child is created, and this is not a successful-solver proof. All original case definitions remain.

Performance experiments retained30x300 rows,chunk20 and120/400ms bounds. Native serialization, tuple transport and a materialized metadata-pair census measured warm802.8,716.9 and779.1ms, respectively; none met400ms. The census candidate passed42 cases but was discarded, and both production files match V106 bytes/modes. The duplicate-spy recursion and missing CPU profile are explicitly excluded as timing evidence. Current capture/memo architecture needs review; no authority/fact/history guard was weakened.

Earlier full scheduling diagnostics reached their180s native deadline and remain separately recorded as incomplete, with SIGTERM/original observation/stopped-reaped owner/closed descriptors. The fresh full run above supersedes neither their original records nor any other missing whole-Source certificate.

The full goal stays active. Warm rollup performance, scheduler identity/history repair, API/UI guard sweep, people/team management, all13 fact/all15 historical guarantees, complete catalogue/entity/settings scope, PUNI aliases/Bun client inventory/installed checks, Astra review and release gates/delivery remain. Astra is unavailable until recorded2026-11-22 10:09AM timezone unspecified. Broad core/domain/Memory/Source/browser/build/secrets/migration/host gates were not run in this slice. No new agents,install,PAX or public delivery.

## 2026-11-21 — people and teams on named spaces (partial4.6)

Named active-organization spaces now show separate People and Teams sections with current directory names. Writable spaces add and remove belonging through the existing bodyless routes and reread the authoritative space. Viewers retain the lists. Virtual all has no belonging controls; legacy named spaces explain organization selection. Loading, directory failure, changed membership and current access loss have explicit states. Superseded directory observations and retired editors cannot withdraw their successors.

Evidence: [verification-space-member-ui-20261121.json](verification-space-member-ui-20261121.json).

| Check                  | Observed                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| UI and routing         | 83 pass,0 fail;5 files,including14 new membership cases                                     |
| Chromium               | 4 pass,0 fail;375/1280px,both themes;real frontend with API fixtures                        |
| Frontend/browser types | 8 frontend and5 browser roots compile                                                       |
| Lint                   | 4 changed TypeScript owners pass after browser import/title fixes                           |
| R5                     | 9 independent UI faults plus1 real mobile sizing fault fail as expected and restore exactly |

The browser covers both add/remove kinds, captured organization headers, bodyless transport, kit dimensions and long-name overflow. The bounded runner substitutes only the browser spec's two imports to run without ordinary-stack metadata; it starts the actual Vite frontend and stops its owned server. It does not prove the real backend, ordinary full-stack gate or installed PUNI process ownership. Expected Steps503 remains visibly rendered. Mobile dark and desktop light captures were inspected.

The first browser attempt could not listen inside the sandbox. A subsequent Bun-direct Playwright invocation could not load the temporary test; the installed runner was invoked through Bun afterward. The first rendered fixture selected legacy mode; correcting its actual onboarding observation exposed the new panels. Exact control labels resolved a later test-locator ambiguity. These failed attempts remain diagnostic evidence, not passes. The final restored browser run passes all4 cases without retries.

Source inventory also found27 existing TypeScript files omitted by the earlier scoped6106-file census: bin,infrastructure,experiments,Storybook and evidence scripts. The expanded inventory compares their bytes to the saved staged tree and records current mode pins; it does not invent prior full-mode evidence or extend the old retired-consumer scan to those files. The complete script inventory and Bun/CLI embedding remain open.

Tasks4.6/4.6.4/4.6.5 remain open. These ten fault observations do not certify every ownership/error branch or the complete API/UI guard matrix. Warm rollup performance,scheduler historical identity,all13 fact families/all15 history guarantees,catalogue/settings/entity closure,PUNI aliases and installed checks,formal Astra review and exact-SHA host gates/delivery remain. Astra remains unavailable until recorded2026-11-22 10:09AM,timezone unspecified. No full backend/domain/Memory/Source/build/secrets/migration/host gate or public delivery was run in this UI slice. The full original goal remains active.

## 2026-11-21 — Memory project revision parity and complete Source files (partial3.2)

The Memory project twin now validates admitted raw revisions before rename conflicts or nonempty deletion outcomes. Previously -1, null and a small positive fraction could become valid-looking integers when incremented. The writer now throws before effects; foreign/absent concealment, ordinary conflict/nonempty outcomes, CP14 and valid-maximum overflow precedence remain. Twenty new cases cover malformed values, ordering, exact full-state preservation and valid boundaries.

Evidence: [verification-memory-project-revisions-20261121.json](verification-memory-project-revisions-20261121.json).

| Check                                              | Observed                                                                                                       |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Final Memory project + complete Memory Source file | 195 pass,0 fail;2 files;12,763 assertions                                                                      |
| Complete Memory Source alone                       | 115 pass,0 fail;12,339 assertions;221 certified cases,zero exclusions,three genuinely absent optional families |
| Complete SQLite Source file                        | 129 pass,0 fail;13,990 assertions;351.14s;224 certified cases,zero exclusions or absent families               |
| R5                                                 | Six independent omissions/order changes fail;exact source restored after each native owner settles             |
| Types/lint                                         | 356 compiler roots and both changed Memory owners pass                                                         |
| Broader three-file project cohort                  | 272 pass,1 fail;the SQLite combined-create fixture stops before required119 catalogue metadata                 |

The prior Memory84/2 observation is superseded by the fresh complete115-test file. The older SQLite180-second incomplete run remains historically incomplete; the fresh run uses the existing660-second owner and normal30-second test budget, retaining the certificate's explicit600-second allowance. Its original process finishes normally, reaps and closes descriptors. This is fresh whole-file evidence, not a timeout reinterpreted as success.

The six current proof controls separately remove integer admission, nonnegative admission, each actual call site and each validation ordering requirement. Tests explicitly await the real operation, then assert rejection and unchanged full tables. The first corrected proof pass stopped because its driver still expected the old matcher's diagnostic; the native fault had correctly failed on rejected=false. Completion reuses that terminal receipt and executes only the five remaining faults. No valid native proof is blindly repeated. Final production adds only adjacent Proof/JSDoc comments and formatting relative to the exercised guard code.

The SQLite project combined-create failure is separately reproduced on the final state: its fixture ceiling is20261110120100, while current birth requires actual119 retirement metadata. Shared first-package assertions also retain an authored legacy Research step. A current fixture must exercise real catalogue/window authoring and the corresponding Memory twin contract; do not erase the assertion, fabricate a ledger header, bypass retirement validation or call this case a gap. This remains task3.2 work. The final green195-test Memory cohort does not certify that separate SQLite project file.

These complete Source files certify their actual registered cases, including explicit optional-port absences in Memory. They do not prove every Source owner, all13 fact families/all15 history guarantees, full API/UI/product behavior or required Astra review. The Memory standalone project twin is not a claim of new current Source project/directory capabilities. All original entity/settings/catalogue,performance,PUNI/Bun inventory/installed,host gate and authorized delivery obligations remain. No frozen identity,signed history,protected archive,default profile or activation changed. No new agent,install,public commit/push/PR/merge/deploy or host gate ran. Astra remains unavailable until recorded2026-11-22 10:09AM,timezone unspecified.

## 2026-11-21 — combined project birth uses the current catalogue (partial3.2)

Combined birth now materializes the reached catalogue union and returns its explicit values
inside the existing project/package/grant/audit owner. The standalone Memory twin shares
the Source materializer using actual scope/type/catalogue maps; protected catalogue writes
still require complete fact evidence. SQL no longer inserts retained legacy drafts into
the retired step table. Historical producers and stored identities remain unchanged.

Evidence: [verification-combined-project-catalogue-20261121.json](verification-combined-project-catalogue-20261121.json).

| Check                                            | Observed                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Memory project/catalogue and complete Source     | 293 pass,0 fail;4 files;15,548 assertions                                                                                |
| SQLite project/catalogue/current birth/atomicity | 197 pass,0 fail;5 files;3,909 assertions                                                                                 |
| Complete SQLite Source after writer retirement   | 129 pass,0 fail;13,990 assertions;388.22s                                                                                |
| Source certificates                              | Memory221 cases,zero exclusions,three genuinely absent optional families;SQLite224 cases,zero exclusions/absent families |
| Types/lint                                       | 365 explicit compiler roots and14 changed TypeScript owners pass                                                         |
| Finite fault observations                        | Eight behavior faults and eight fixture custody faults across24 native observations;all sources restored                 |
| Inventory                                        | 6138 TypeScript files;12 named existing source changes,two additions;685 curated pins                                    |

Both SQL project fixtures now use actual116/report/verified-backup/private117/additive118/119
storage. The shared Research case authors a current Research identity with minutes/25%
defaults, deliberately distinct from its retained legacy draft, and checks a separate
committed read. An additional empty-catalogue case preserves both grants and all three
audits. Memory also covers typed-only zero-leaf union, a genuinely queued catalogue edit,
invalid defaults, retired/foreign bindings, complete rollback and earlier explicit values
surviving changed defaults. Offline SQL Dev/QA tests preserve every authority and constituent
rollback assertion; their late step fault now reaches the second work_package_step insert.

The first genuine119 Research run found the retired SQL INSERT. Removing that current
writer fixes the actual storage failure. An initial104/1 cohort then counted the two real
catalogue setup transactions together with the request; resetting observation immediately
before the request preserves its one-BEGIN/one-COMMIT/no-savepoint assertion. Its final
complete suites pass above. No catalogue ledger header, retirement guard or Research
assertion was weakened, and the old failure receipts remain diagnostic evidence.

Behavior controls omit materialization, committed-value publication, current reply mapping,
legacy-row retirement, queue-time capture, retirement admission, preservation of prior
values and SQL writer retirement. Materialization and the SQL INSERT faults prove only
their reached availability failure; later assertions receive no fault credit. Fixture
controls inject uncertainty after real private migrations, a known close or before a
connection acquisition. Required retained-file and acquisition-count oracles fail when
their guards are omitted; a Bun exit alone does not distinguish every paired fixture arm.
These are controlled uncertainty observations, not claims of actual leaked native owners.

Each fault's original process stops and reaps and descriptors close before exact byte/mode
restoration. Final executable-token bridges exclude only comments/whitespace from the
exercised preimages. Three driver refinements corrected two diagnostic spellings and one
formatting anchor, reusing existing terminal receipts rather than repeating native faults.
Initial bare OpenSpec attempts did not launch because its executable was absent from PATH;
the locked local tool runs through bunx --no-install. Final source code is frozen throughout
all ordinary tests, compiler and lint observations.

The expanded inventory retains all preceding6136 TypeScript paths and adds only the two
declared Memory helpers. Eleven newly owned paths extend curation from674 to685. This
does not expand the older6106-path retired-consumer scan or establish the exhaustive client
script inventory. Generated MCP bytes and the protected packaging archive remain exact.

Task3.2 and broader parents remain open. Standalone Memory project birth does not add current
Source project/directory capabilities or complete move/delete catalogue consequences/SC17.
Formal Astra source/proof review remains pending until its recorded2026-11-22 10:09AM
availability,timezone unspecified; no retry,substitute or new agent occurred. The full nine
original requirements,all13 fact families/all15 historical guarantees,warm400ms rollup
performance,frozen scheduler identity,documents17/18,entity/settings/catalogue/API/UI guard
closure,PUNI aliases/exhaustive Bun client inventory/installed ownership,full builds,secrets,
migration checks,exact-SHA clean h2/h4 gates and authorized delivery remain. No public
commit,push,PR update,merge,deploy,host gate,activation or historical rewrite is claimed.

### V113 — native rollup memoization feasibility, production still failing

[Evidence,commands and qualifications](verification-rollup-epoch-investigation-20261121.json)
retain all nine original requirements and the preceding V112 source audit. All6139runtime
source paths and692curated inputs matched before these documentation-only edits.

The unchanged ordinary native test fails935.9ms against400ms. Space18.6ms passes120ms;
cold1191.9ms is printed only. Bun accepted CPU flags but produced no named profile,so no
CPU attribution is claimed. The private complete-input memo experiment fails432.4ms; its
original wrapper expected0 and observed1,so it has a terminal failure receipt and no success
validation. Its successor adds a retained input fingerprint and passes326.4ms once. Both
retain30packages×300rows,chunk20,reply equality,leaf counts and20cold/0warm presentations.
The private pass does not fix or qualify production performance.

The native snapshot diagnostic passes8cases; its immutable expanded successor passes11.
The extra cases reproduce actual TEMP shadowing on readonly-main media,including after
pooled release/reuse. The main version/schema/row-change triple remains identical while
the read changes. Consequently the prototype stamp cannot be installed as-is. TEMP schema,
physical identity,attachment behavior,fresh settings,current clock liveness,configured read
seams,clone isolation and lifetime ownership are explicit implementation/proof obligations
in design.md and the evidence. No production check changes; these counterexamples claim
no R5 production omission proof.

All parent tasks remain open. No installed PUNI/full client inventory/four Nx client/full
WBS/catalogue/history/Source/build/secrets/migration/host-gate or delivery closure is
established. No new agent or Astra retry occurs before its recorded2026-11-22 10:09AM
availability,timezone unspecified. No historical/default/PAX/activation rewrite occurs.

### V114 — production current-row memo and native rollup pass

[Evidence](verification-current-input-memo-20261121.json) preserves the full nine requirements.
Final catalogue-aware/native suites pass65/0 with510assertions across3files; seven roots
typecheck and lint. Actual unchanged30packages×300rows,chunk20: space19ms,
warm328.6ms below120/400ms; cold1241.3ms is printed only. Equality,
leaf/scan controls and20cold/0warm canonical presentations remain. This is local native
evidence,not installed/full-stack/browser/coverage or exact-SHA h2/h4 acceptance.

Eighteen finite own-oracle omissions cover native prerequisites/decoding,TEMP/rival
invalidation,both clones,row/settings fingerprints,publication consistency,package/encoded-
byte retention bounds and the existing lifetime guard. The first driver stops on a false
green duplicate assertion after16 valid negatives. Removing the duplicate preserves the
original guard; omitting that actual guard produces five late SQL reads before the caller
throws. The extra byte-bound proof retains the count limit. Native processes stop/reap and
close descriptors before exact restoration. Final production bridges ignore comments and
whitespace only. A nested directory-spy stack diagnostic recursed and is excluded.

The first broad199-test cohort has61pass138fail: the one new bad TEMP view column is fixed;
untouched work-package-observation/saved-plan fixtures still encounter the explicit117
apply-owner migration guard before capture. Those fixtures require proper catalogue setup
and fresh reruns. The guard is unchanged. Their failures are not accepted as passing or
independently certified old-source baselines. Earlier type/lint failures are diagnostic;
final checks pass. Broader Source,all13facts/all15history,clock-only liveness,TEMP-DML and
physical-collision consumers,configured seams,full entity/settings/catalogue/API/UI/docs,
installed PUNI/client inventory/four Nx clients,Astra/build/secrets/migration/host gates and
authorized delivery remain open. No parent task is ticked; no public delivery or activation
is performed.

### V115 — current catalogue capture fixtures and non-zoned projection

[Commands,receipts,source bridges and limitations](verification-current-capture-fixtures-20261121.json)
preserve all nine requirements. The observation/capture fixtures now use actual116,
report/E37/private117 and additive118/119,shared definitions/bindings and explicit package
values. The ordinary117 guard is unchanged. Retention/constructor controls preserve files
after reported lower-owner uncertainty; they claim no actual native leak or close-failure
classification. No legacy step table is recreated.

The fixtures exposed a real regression: the non-zoned WorkPackage projection validated an
unrequested timezone. Its same-statement SQL now excludes only known timezone rows; the
mapper returns PERT/budget fields. Full zoned reads still reject malformed timezone,and
unknown keys still reach validation. Two real projection controls and three fixture-only
uncertainty omissions fail their own selected assertions and restore exact source after
native settlement. Source bridges normalize comments/formatting only.

Final204/0,1249assertions,5files includes110observation/29capture/65native-memo-database
cases; three touched roots typecheck/lint. The initial137-case diagnostic had27/110,
including invalid uppercase fixture codes and one unsupported setting key. Its139-case
successor had130/9: timezone projection defects,a stale shared-name expectation and six
post-transition metadata expectations. Supported estimate method/rounding remain owned
columns; timezone uses setting_value. Newly authored saved rows correctly return catalogue
metadata with no aliases while exact opaque bodies,headers,hash strings and future schema99
remain unchanged. One newly captured current connected input expects actual13 instead of12;
no historical stored bytes,hashes or frozen formats are repinned.

The unchanged real performance fixture is variable: plain477.8ms fails400ms,profile350.4ms
passes,and the latest plain read is329.2ms (exit0). Each retains
30packages×300rows,chunk20,120/400ms bounds,reply/leaf/scan assertions and20cold/0warm
presentations. The successful profile observes no warm full-input recapture; its wrapper
expected1 but observed0 and has no success validation. No failure is discarded,and no
coverage/browser/calibrated host performance closure follows. Robust margin remains owed.

The original18selected builder interruption hooks are preserved,not an exhaustive current
SQL inventory. All Source/fact/history/settings/SC17/API/UI/document and CLI/client-inventory/
installed-artifact/four-Nx obligations remain. No parent task is ticked. No full WBS web-app
rebrand is newly implemented or certified. Astra remains unavailable until its recorded
2026-11-22 10:09AM,timezone unspecified; no retry or substitute occurs. Full builds,secrets,
migration checks,exact-SHA clean h2/h4 gates and authorized delivery remain unproven.

### V120 — current storage/core regressions and mounted/browser fixture repair

[Commands, native receipts, source identities, finite faults and current limits](verification-browser-source-regression-20261121.json)
record fresh Memory115/0/12339assertions, SQLite129/0/13990 and core2124/0/12936
across171inventoried source files. Memory certifies221offered cases and explicitly
declares three absent optional ports; SQLite certifies224with no exclusions/absences.
These supersede old Memory84/2, incomplete SQLite and failing core diagnostics, not
the remaining original contract/authority obligations. Production backend, frontend,
gateway and MCP compiler scopes pass; the backend's missing spaceRead fixture is repaired.

The mounted lifecycle initially fails all12cases at the ordinary pending117 guard.
Its fixture now uses actual116, report/E37/private117 and additive118/119 through the
existing catalogue fixture owner. The production migration guard and shared migration
helper are unchanged. Seven authorized package probes then expose the old deliberately
refusing reader. A real SQLite observation reader now resolves selection and authority
from its own snapshot; no fake grants or legacy observation adapter are substituted.
The final mounted suite passes13/0/117assertions, including real two-process logout/refresh
races. An actual connection close followed by an injected failed acknowledgment latches
uncertainty and retains the SQLite namespace. Independent retention-predicate and lower
close-latch omissions fail their named assertions and pass after exact restoration.

The frontend Node tier initially fails8of1205tests. Current field names/order, the
work-package deadline phrase, the omitted step-value boundary file and browser-only
undo/redo tier placement are corrected. The configured-origin probe runs the actual
Bun test fixture under Bun's test runner, joins its source cleanup and requires an
explicit status record; a deliberate wrong production app origin returns403instead of401.
The first corrected run reaches actual401but fails on Bun's stdout banner; the explicit
record removes that transport ambiguity. The deadline phrase also has an independently
failing/restored control. Final complete Node passes1191tests across95files.

The UTC View run expires at its660souter observer, exit143, with the original native
owner stopped/reaped and descriptors closed. Its receipt remains unsettled/unsuccessful;
no full-View total is claimed. A subsequent host process check finds no surviving View
runner/proposal descendant. A bounded seven-file reproduction gives315pass/12fail/327.
Current user-facing names, organization permission and membership responses, and the
package-value settings expectation are repaired. Six files pass308/0; layout plus actual
HTTP writer tests pass108/0. The hostile-error accessor case remains an observed failure
and its production implementation/assertions stay unchanged. Remaining View files, root
Unit/Auckland, real WBS browser/performance/four Nx clients and manual review are still owed.

One mistaken `bun --cwd ... test` invocation dispatches the root Nx script. The exact
owned Nx child receivesTERM and the native owner exits130with cleanup complete; this is
cancelled diagnostic work and never gate evidence. The first core inventory launcher
cannot findrg in its restricted native PATH; the corrected171-path roster is independently
matched with Bun.Glob before the successful direct run. Initial scoped frontend type
errors are missing matcher augmentation in the private compiler fixture; including the
existing vitest.setup.ts restores the actual test environment. Initial lint reports two
import-order errors, repaired without behavior changes.

Final changed-source lint, scoped backend/frontend test types and formatting pass.
All343OpenSpec entries validate (323changes and20specifications); the exact committed
host gate remains separate.

All nine original requirements remain. Prior V119 CLI package/installer/alias evidence
is a controlled local-fixture cohort, not a newly qualified production artifact. Complete
Bun embedding/inventory, actual resource authority/history/fact/UI closure, formal Astra
review, full build/secrets/migration checks, exact-SHA clean h2/h4 gates and
authorized delivery remain open. Astra remains unavailable until recorded2026-11-22
10:09AM,timezone unspecified; no retry/substitute/new agent occurs. No public commit,
push, PR update, merge, deploy, activation or parent task completion follows from V120.

### V121 — complete frontend inventory and remaining semantic failures

[Native receipts, source identities, complete coverage audit and scope limits](verification-frontend-inventory-20261121.json)
record all 176 UTC View files in four disjoint groups, independently matched against
Bun's file inventory and the configured Node/zoned exclusions. Exact executed-file
sets match the groups. Their complete pre-repair totals are 4,245 passed and 18 failed
out of 4,263 tests. Every group has a terminal native exit1; the expected-zero wrapper
validations are absent and no passing whole-View claim follows. Each actual log joins
its native receipt's digest/byte count; adding one LF to copied raw bytes is refused
in all four controls without modifying original evidence.

The shared Bun/browser reporter shim incorrectly tried to install in two explicitly
DOM-free root suites. Selecting the browser host before accessing window restores
their real Vite/configuration probes:21/0. Omitting only that predicate reproduces both
collection failures; exact restoration passes21again. The required browser API guards
stay intact. A separate fresh process launched with Pacific/Auckland passes5tests in
four files; the timezone is set before launch, not inside the test body.

Current membership fixtures now include effectiveRole/grantCount, limits refusals carry
actual organization.read, and agent-pool refusals distinguish that limits read from
organization.manage_directory. Public labels follow Work package and the agreed All
projects view. A page consent-reset case sometimes reached the synchronous assertion
before its table import control mounted; it now awaits that actual control. All its
original consent assertions remain and the whole202-case page file passes.

The fixed export probe proves that CSV, Markdown and the bundled document differ only
in their single Project→Work package header; standalone Mermaid is byte-identical.
The test now asserts current fingerprints and still asserts every original fingerprint
after reversing only those exact header prefixes. No historical stored document or hash
is rewritten. An actual LF appended in the production CSV writer fails the current
fingerprint, then both fingerprint sets pass after exact restoration. Two equivalent
LF flights were unnecessarily run after escaped tool output was misread; raw character
codes prove both inject one LF, and they are not independent guards.

Final affected View files pass298/0 across8files; nine changed roots typecheck/lint and
format. All343OpenSpec entries validate (323changes and20specifications). A separate
current two-file run remains24pass/2fail/26tests. The original
retained-destination case fails because projectId currently owns both import publication
and definition-consent lifetimes. The candidate direction separates the captured
publication/admission owner from the selected project's consent owner, preserving old
setter, withdrawal, one-read, busy and cleanup protections; it is not implemented here.

The error-boundary trace reaches caught-object-report-json's stack-presence helper.
Within the exact Bun/Vitest/jsdom context, hasOwnProperty, Reflect.has, in and own-key
enumeration each invoke the hostile message getter. A descriptor lookup of message
does not. Plain Bun, a plain VM context and explicit global stack-hook variants do not
reproduce it. This narrows the environment interaction; it does not establish a safe
dependency fix. The original selector, reporter, import hook and both failing assertions
stay unchanged. Formal Astra review of these tricky choices remains pending until its
recorded availability; no retry, substitute or new agent occurs.

All nine original requirements remain active. Complete View execution and these owning
repairs do not establish real WBS browser/performance/current authority, four actual Nx
clients, full entity/settings/spaces/catalogue/fact/history/API/UI closure, complete Bun
embedding/script census, formal review, full builds/secrets/migrations, exact-SHA clean
h2/h4 gates or authorized delivery. V120's green storage/core evidence remains current
for its unchanged source. V119's CLI artifact remains a controlled local integration
fixture. No public commit, push, PR update, merge, deploy, activation or parent/goal
completion follows.

### V122 — captured import intent and publication ownership

[Native checks, fifteen finite fault pairs and source identities](verification-import-lifetimes-20261121.json)
record the import lifetime repair. An admitted upload retains its captured project
and definition consent when the visible destination changes. The new choice starts
unchecked, retired choice callbacks cannot read or change consent, and the publication
retains one busy admission until settlement. Catalog/callback replacement, withdrawn
currentness and unmount still retire publication effects. An obsolete attempt cannot
clear a newer admission on the same input element.

The original retained-parent failure and the added captured-consent/busy cases fail
before the repair. Final owning picker, hook and page files pass all220tests across
three files. Production frontend types, changed test roots, scoped lint/format and
all OpenSpec entries pass. Fifteen qualified production-hook fault variants each fail
their own assertion, then pass after exact byte/mode restoration. The malformed
file-admission edit and the surviving older page cleanup witness are retained and
excluded; the direct same-hook/same-input cleanup case supplies the qualifying
negative. Source structure including operators/declaration flags matches the observed
beforeimages after adding proof comments and formatting.

These are controlled FileReader/API hook tests, not real-browser or server-grant
proofs. The hostile error-message accessor case remains unresolved and unchanged.
Standalone Bun, VM and jsdom reporter probes do not reproduce the exact Vitest
interaction. Formal Astra review remains pending; task3.6d stays open. V120's owning
storage/core evidence remains current for unchanged source, and V119's CLI artifact
remains a controlled fixture. All nine original requirements, full checks and clean
exact-SHA host gates, complete client-script/Bun embedding, and authorized delivery
remain open. No public commit, push, PR update, merge, deployment, activation or goal
completion follows from this checkpoint.

### V137 — frontend execution during delivery repairs

The actual configured Node/Vitest View run passes all4,270tests across176files
with `maxWorkers:4` in the shared configuration. Assertions and deadlines are
unchanged. The preceding unbounded-worker run completed with4,028passing and
242failing tests, including216deadline failures. The isolated78-case estimates
owner and13previously failing fold cases already passed with four workers before
the complete rerun. This bounds host contention rather than extending deadlines.

The unchanged19-case application-fault owner also passes through the configured
Node/Vitest launcher. The earlier custom Bun worker/reporter interaction remains
unqualified; it does not establish a defect in the application reporter.

Native command receipts, logs and source identities are recorded in
[frontend delivery verification](verification-frontend-delivery-20261122.json).
These checks establish the View tier only. Browser execution, the remaining
backend/current-catalogue fixture repairs, normal commit hooks, current-main
integration, CI, exact-SHA host gates and formal Astra review remain open. No
push, merge, live migration or completion of the original broad goal follows.

### V141 — bounded delivery repairs and saved-plan observation

Mounted saved-plan creation now admits the saving actor and captures complete
current evidence on one Source read loan. Required foreign evidence fails before
any persistence. The loan expires before serialization/writing, and the existing
writer independently rechecks authority. Four finite omission tests reach their
intended failures and pass after exact restoration. Expiry evidence establishes
diagnostic ordering only; the later released-pool guard still blocks SQL.

The connected fixture/caller owner passes 35 tests, the current SQLite fixture
owner passes 49, and Source conformance passes 257. Full backend typechecking
passes; the remaining backend runtime suite is not claimed. Actual frontend
Node execution passes 1,191 tests across 95 owners. Six native worker wrappers
now let their existing 10-second native and 25-second outer deadlines settle
inside a 30-second test deadline. The original refusal, effect and custody
assertions and both native bounds remain. A correct private-state refusal took
6.5 seconds during the preceding full run, exceeding the old five-second test
default. The local E2E target oracle now includes its existing quiet-output env.

[Commands, native custody, source identities and limits](verification-delivery-repairs-20261122.json)
record these checks. Known legacy permission and historical frontend producer
fixtures, operational PUNI provisioning, normal hooks, current-main integration,
CI, exact-SHA host gates and formal Astra review remain outstanding. This is
delivery preparation; no push, merge or live migration has occurred.
