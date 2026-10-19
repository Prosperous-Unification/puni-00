# Verification

Base: `a82d6fa9b0d87105cdafcaef474ab51a73abebd8`.
Branch: `integration/wbs100-compiler-memory-20261019`.

Design approved before implementation. The historical installed artifact is untouched. The preceding diagnostic receipts are in `/tmp/wbs100-memory-diagnostic-20261019`; they are diagnostic-copy observations, not successor acceptance.

Dependencies use a symlink to `/home/df/.codex/worktrees/e21c/puni-00/node_modules`, whose physical installation was prepared by the coordinator lane. Both lockfiles freshly hash to `e8d77926f9dac4ba4824486143872bdfb123cafd8bed45cca50c44b2e23298a4`. No install in this worktree is claimed.

Scoped checks use a 2 GiB sampled process-tree RSS guard, 360-second deadline and minimum 12 GiB available memory. The ceiling can be overshot between samples. Tests, static checks, fault restoration, packaging, complete surveys and hosted gates remain pending until receipts are recorded below.

## Design amendment before source edits

Independent review found that lazy trusted-package copying can change wildcard roots if configurations are reparsed. Approved reconstruction now retains initial root/options/reference selections, including per-project transitive parsed reference commands. Config-only JSON ASTs are retained because TypeScript's getParsedCommandLine requires them; source Programs, checkers, symbols and source-code ASTs remain forbidden. The shared source-admission loop may be extracted without changing bounded callback order. Root and reference wildcard, nested/cyclic and absent-reference parity are required.

## Initial RED and predecessor controls

The first workload calibration used 80,000 shared ambient interfaces and 24 consumers plus a unique provider, immutable commit afdb525fc13bc5e2b8147f2ab73edbf48a09035c. The real production source CLI was killed at sampled 2,100,544 KiB after 3.041 seconds with no report, under the 2 GiB guard. Ten small semantic/predecessor cases passed before implementation (202,844 KiB, 1.264 seconds); the added lazy-package wildcard control also passed (188,448 KiB, 0.661 seconds). Raw receipts remain in /tmp/wbs100-serial-compiler-20261019 and will be retained with final proofs.

## Resource proof and limits

The workload generator is `typescript-serial.test.fixture.ts`, called with 80,000 declarations and 24 consumer configs, plus the provider config. Its immutable tree is `7249e1b6914cd3c8a0de3ff36216a8e0e0acc116`. [The original commit object](evidence/workload-commit.log), [selection](evidence/workload.json.log), [request](evidence/request.json.log), and [creation command](evidence/create-workload.ts.log) bind the fixture. The retained repository is `/tmp/burokrat-serial-workload-GPtR91`. Reproduction can generate the same files, verify `git write-tree` equals that tree, then import the retained commit object with `git hash-object -t commit -w`.

Every resource invocation ran the production source CLI `extract-relationships committed` against that exact commit and request, with `TOOL_WIKI_TRUSTED_NODE_MODULES=/home/df/.codex/worktrees/e21c/puni-00/node_modules`. The [guard](evidence/guard.py.log) sampled the complete child process tree every 50 ms; the allowed boundary was 2,097,152 KiB and 360 seconds, after requiring 12 GiB available. This is a workload regression, not a universal memory guarantee. The guard's own exit permits child exits 0 or 1, so acceptance also checks the receipt's child exit, absence of stop reason, and complete report oracle.

| Observation                                | Child exit | Peak process-tree KiB | Elapsed seconds | Report                                        |
| ------------------------------------------ | ---------- | --------------------- | --------------- | --------------------------------------------- |
| Original eager path, before implementation | -9         | 2,100,544             | 3.041           | absent, RSS stop                              |
| Serial path                                | 0          | 842,020               | 25.055          | complete                                      |
| Restored eager routing fault               | -9         | 2,098,832             | 2.880           | absent, RSS stop                              |
| Restored serial path                       | 0          | 838,676               | 23.997          | complete and identical to first serial report |

Raw `resource-*` receipts, stdout and stderr are retained in [evidence](evidence/). The [oracle](evidence/resource-oracle.py.log) checks the complete report envelope, immutable selection, literal public declaration, import/reverse-edge families and empty optional families. The [routing fault script](evidence/resource-fault.py.log) restored the original wrapper bytes, observed the same RSS refusal, watched the [oracle fail](evidence/resource-fault-oracle.log), restored serial routing in `finally`, then compared both successful reports for equality.

The extra work is measured as elapsed wall time; user/system CPU seconds were not measured. The predecessor cannot complete this workload within the boundary, so these receipts do not establish a completed predecessor-versus-successor time ratio. No larger ceiling or second workload calibration was needed.

## Semantic and bounded-source proof

Sixteen focused serial cases compare complete reports or exact normalized refusal messages with the unchanged predecessor runner on separate fixtures. They cover sole emitting ownership, unique explicit roots, missing/rootless/ambiguous owners, semantic and ambient closure, reordered configs, empty public families, root and nested-reference wildcards after lazy trusted-package copying, nested/cyclic/absent/malformed references, and conflicting phase failures. The malformed referenced config yields the compiler's composite-setting diagnostic before the later MissingType diagnostic; this observed predecessor behavior is preserved.

Seven [watched fault injections](evidence/semantic-faults.json.log), each restored in `finally`, failed named semantic tests: reparsing instead of reconstructing; deleting the unselected-reference guard; replacing the reference census with undefined; disabling the missing-emitter guard; allowing ambiguous roots; allowing rootless shared emitters; and disabling diagnostic refusal. Raw fault receipts and failure output are retained. Adjacent `Proof:` comments name these observations.

After restoration, `bun test` over `typescript-serial.test.ts`, `typescript-core.test.ts`, `typescript-compiler.test.ts` and `typescript-legacy.test.ts` passed **87 tests / 213 expectations**, with 0 failures, 385,648 KiB peak and 10.177 seconds elapsed. The existing exact-fit and one-unit-short budget cases, namespace admission cases and isolated literal-path registry cases ran unchanged. [Receipt](evidence/focused-final.receipt.json.log), [output](evidence/focused-final.stderr.log).

`typescript-core.ts`, `typescript-imports.ts` and `typescript-declarations.ts` retain their base SHA-256 bytes. The only shared compiler change extracts its existing source-admission loop and calls it at the same point before configuration hashing. Independent review checked the preserved bounded callback sequence and absence of retained Programs/checkers/source ASTs. Config-only JSON ASTs in parsed reference commands remain the explicit design exception.

The independent reviewer cleared the frozen six-file source checkpoint, including test/fixture files, and independently read the restored focused receipt and mutation index. [Exact reviewed hashes and unchanged source hashes](evidence/source-hashes.log). This clearance does not assert installed all-rule acceptance or hosted gate success.

## Broader production and static checks

The existing `relationships.test.ts` production CLI suite passed **53 tests / 671 expectations**, 0 failures, 235.958 seconds elapsed, 2,031,804 KiB peak process-tree RSS, with no guard stop. The original 60-second per-test timeout was unchanged. These real CLI cases cover trusted modules/libraries, admission and symlink faults, JSON and bundled declarations, Nx inputs, identity restoration, semantic closure and public ownership. [Receipt](evidence/production-relationships.receipt.json.log), [output](evidence/production-relationships.stderr.log).

The following scoped commands passed under the same 2 GiB/360-second guard; raw receipts and outputs are retained:

- Fresh Nx graph (`NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx graph --file=...`): exit 0, 212,560 KiB, 0.562 seconds. ESLint therefore had a real workspace graph for boundary checks.
- ESLint on the six changed TypeScript files with `--max-warnings=0`: exit 0, 788,192 KiB, 3.094 seconds. The initial attempt found import order and an optional-chain style issue; both were corrected, and the failed receipt remains retained.
- `bunx tsc --build --force apps/twilight-structure/twilight-burokrat/cli/tsconfig.json`: exit 0, 1,370,100 KiB, 1.229 seconds.
- `BUN_TMPDIR=/tmp OPENSPEC_TELEMETRY=0 bunx @fission-ai/openspec@1.12.0 validate burokrat-serial-legacy-compiler --strict --json`: one valid change, zero issues, exit 0, 107,380 KiB, 0.254 seconds.

The optional-chain edit preserves the reference census refusal for undefined or mismatched arrays; import sorting has no behavior change. The sixteen semantic cases were rerun afterward and passed. Their [receipt](evidence/post-lint-tests.receipt.json.log) and [output](evidence/post-lint-tests.stderr.log) bind the final code.

Full CI, the exact-SHA h2puni gate, separately identified installed successor parity, and complete WBS all-rule base/candidate/fault surveys are not claimed here. The historical installed archive remains immutable. These coordinator obligations keep full WBS acceptance pending.

Readable logs trim trailing whitespace for the repository whitespace check. Exact raw output is preserved in JSON-string text carriers; the [transport map](evidence/gzip-to-utf8-transport.json.txt) binds each carrier and decoded stream to its original compressed Git blob. The historical [integrity record](evidence/raw-log-integrity.log) remains unchanged. Empty outputs are retained as empty files.

Final scoped Prettier check passed on all six TypeScript files and all five OpenSpec documents (exit 0, 162,068 KiB, 0.456 seconds). Git staged whitespace verification is required before the normal-hook commit.

## Reviewed source commit and local installed successor

The subsequent normal-hook commit is
`0e444bcc4ba7e5d7e30b1c220d51e25dd7e5ffc5`. Fresh Git-blob reconciliation
matched all six source hashes in the independent review record to that commit.
The retained [commit receipt](evidence/source-commit-0e444/commit.receipt.json.txt)
records exit 0, 838804 KiB sampled peak and 3.261 seconds. Normal format, lint,
secrets, private-nesting and message hooks passed; Tool Wiki reported inactive
external activation and no certification. The [raw streams](evidence/source-commit-0e444/raw-streams.json.txt)
preserve tool output before display whitespace normalization. This completes 3.3;
it does not claim later successor sources were reviewed by that checkpoint.

The coordinator separately authorized a local installed successor and bounded
compatibility comparison. The [initial installed survey packet](evidence/initial-installed-surveys/README.md)
retains both artifact identities, ten fresh before/after snapshots, unchanged
external policy, five complete JSON reports, resource receipts and the exact
oracle. Historical `ac774f0c…` and initial successor `0e444bcc4…` produced equal
positive and missing-public-entrypoint refusal JSON for the same REL-EXTRACT
fixture. That observed local parity completes 4.1a; the originally planned hosted
lane in 4.1 remains unverified.

All five initial surveys selected fourteen rules. Base and each oversized fault
reported 34 findings, including 29 F7 findings; each recovered source reported
33, including 28 F7 findings. The strict comparison removed only the selected
F7 record for each source and restored it exactly for each committed fault.
Nineteen independently injected comparator faults produced the intended
diagnostics; the pristine comparison passed afterward and original hashes stayed
unchanged. Peak sampled RSS was 2621884 KiB and the longest run was 20.813 seconds,
within the 4 GiB/900-second guard, with no resource stop.

This is preservation evidence, not full compiler acceptance. Every report keeps
`allowed:false`, `certifies:false` and ten identical unevaluated records.
F1, K2–K6 and REL-EXTRACT refuse unresolved `dns-packet`; INV-CLASSIFY refuses
undeclared gzip content; PERF-THRESHOLD refuses changed reviewed config content;
SPEC-SCENARIOS refuses a competing overlay. Exact reasons remain in the reports.
Task 4.2 and full WBS100 acceptance remain open. These observations do not relabel
the historical artifact or establish complete old/new evaluator equivalence.

## DNS-only installed intermediate

A separate installed artifact at source
`7d445c48d471a90e885e3d06069d466b8cb8ac13` supplied one fresh base survey.
Its [receipt and identity packet](evidence/dns-installed-intermediate/README.md)
records executable SHA-256
`2d156cd6ebcb3d764d5ae220df909c068ecaf3e82ddb1f24339b52f2da9ec731`
and toolkit identity
`38796f2b396769ac0a13c207b11680fec8d6cc5366061fe9d366d12dd8cfb81e`.
The same base and policy returned a complete fourteen-rule report in 19.918
seconds at 2612180 KiB sampled peak; exit 1, no resource stop.

The seven compiler-dependent rules now refuse
`nodemailer/lib/smtp-connection` from `email-delivery.ts`. All ten unevaluated
rules remain explicit, with 34 findings, `allowed:false` and `certifies:false`.
No candidate/fault comparison or compiler acceptance is claimed for this
intermediate. A later mail-capable successor must retain its own identity and
fresh evidence; neither this baseline nor the initial five-report packet may be
relabelled as that later run.

## Mail-capable installed baseline resource refusal

The separately identified source `72a7e82d2e8ccf4546cb6fee0c49742d0b42fd06`
and archive `0db4b51fb0efd5a6623709e738472dab94106359ce89bde69a1ed0add996464b`
were installed in `/tmp/wbs100-mail-consumer-20261020`. The
[lossless receipt and identity packet](evidence/mail-installed-resource-refusal/README.md)
retains identical before/after snapshots and the exact all-rule baseline command
using the unchanged external policy. The 4 GiB guard killed that attempt at
52.479 seconds, with sampled process-tree RSS 4208352 KiB against a 4194304 KiB
ceiling: exit -9, `stopReason:rss_limit`. Stdout and stderr are both zero bytes.
No JSON report was produced, so this attempt establishes no rule outcomes or
finding counts. Task 4.2 and full WBS100 acceptance remain pending. Investigation
of the responsible config/phase is separate; no fix is evidenced by this receipt.
The initial five-survey and DNS-only observations retain their original identities
and limited claims.

Separately, the [PR580 post-merge receipt](evidence/pr580-postmerge-2026-10-19/README.md)
records exact dev health at merge commit
`5851eee0c49f03722c77e59d5c4661cf18b20b39` on 2026-10-19T21:47:06Z.
Its post-merge CI run 39330011791 was still in progress at observation. This is
Unit/JUnit onboarding evidence, separate from earlier frontend recovery merges
and from compiler acceptance; no final CI or production claim follows.

## Coordinator documentation checks

Scoped formatting passed for the sixteen mutable Markdown/JSON files. The
required `openspec validate --all --json` passed all 261 entries. An additional
`--all --strict --json` check returned exit 1: all 243 change entries passed,
but six existing main specifications have placeholder-purpose warnings
(`dev-deploy`, `live-plan-snapshot`, `plan-command-registry`, `plan-import`,
`saved-plans`, `scheduler-optimization`). Fresh blob comparisons proved each
affected specification byte-identical to base `a82d6fa9…`; no unrelated spec was
edited. [Raw commands and outputs](evidence/coordinator-doc-checks/raw-streams.json.txt)
and [baseline identities](evidence/coordinator-doc-checks/preexisting-strict-warnings.json.txt)
preserve both outcomes. The 79 original initial-survey packet files remained
byte-identical after formatting. This documentation checkpoint does not close
the full-baseline resource refusal or pending canonical/hosted acceptance.

## Collection placement follow-up: prestart contract

The coordinator authorized the two-point follow-up after the exact72 installed baseline failed under the unchanged 4 GiB/900-second guard and a single gateway-only collection probe advanced diagnostics. Both diagnostic copies are explicitly distinct from released artifacts: copied validator instrumentation and corresponding descriptor/manifest digests changed, while source72 denotes only their uninstrumented base. Originals, archive and first diagnostic copy were independently hashed before/after.

Implementation scope is only observeDiagnostics and prepareEmission in typescript-serial.ts, adding collection after reconstruction/import collection and before semantic diagnostics. Existing post-helper collection, phase precedence and bounded-source behavior remain unchanged. The existing production RED is retained before these edits. Focused controls, static checks, independent review, dirty full-baseline GREEN, normal hooks, exact-commit installed proof and coordinator acceptance remain pending until fresh receipts below. No conclusion about a permanent leak or universal RSS limit follows from the trace.

The [complete diagnostic packet](evidence/phase-collection-diagnostics/README.md) retains both traces, identities, patch boundaries, receipts and losslessly reconstructable original/copy snapshots. It proves that the gateway-only probe reclaimed preceding allocations and let gateway diagnostics finish, while MCP still exceeded the guard. It is not successor acceptance.

The [follow-up source identity](evidence/phase-collection/green-source.json) and [exact source patch](evidence/phase-collection/green-source.patch.json) bind the two production collection points against HEAD 7271931d4d7cb2615a22132b3de8466be43ae07c. Independent source review cleared typescript-serial.ts SHA256 d728f30b7285ab3f3633a212286be91ab967498e3f56132d6b56c8790e9e88c7: only the two approved calls and adjacent measured context changed. The reviewer found no change to phase/error order, existing collection points or bounded behavior.

The [focused compiler suite](evidence/phase-collection/focused.json) passed 87 tests / 213 assertions, zero failures, in 14.601 seconds at 429,368 KiB under the 2 GiB/360-second guard. It includes predecessor output equivalence, reference/owner/semantic-closure cases, compound-fault precedence and unchanged bounded callback accounting. This does not replace the pending full-baseline resource oracle.

The [production relationship CLI suite](evidence/phase-collection/production-cli.json) passed 53 tests / 671 assertions, zero failures, in 257.124 seconds at 1,606,972 KiB within the unchanged 2 GiB/360-second guard. [Scoped lint](evidence/phase-collection/lint.json) passed with zero warnings (2.433 seconds / 654,028 KiB); [full package typecheck](evidence/phase-collection/typecheck.json) passed (1.330 seconds / 1,306,088 KiB). [Strict change validation](evidence/phase-collection/openspec.json) passed and [scoped formatting](evidence/phase-collection/format.json) passed, including the retained diagnostic README. These complete follow-up tasks 5.2 and 5.3 without adding a GC-call-count mock test or changing a safety check.

The [precommit Nx pack](evidence/phase-collection/pack-green.json) and [separate consumer installation](evidence/phase-collection/install-green.json) succeeded. [Artifact metadata](evidence/phase-collection/green-artifact.json) binds archive SHA256 0bc112452421cd3e2b172d5d1f35a96079c2e82b28082956c16b925f76f5af8f and validator SHA256 1d61ec147b70b97650663141ba7ec8d606b6f00cb953aea80201884cc93e186d to the reviewed source patch. Embedded sourceRevision 7271931 names HEAD only: this artifact is explicitly dirty/precommit, not an exact-commit successor. The [installed before snapshot](evidence/phase-collection/base.before.json) precedes its unchanged-policy frozen-baseline attempt. The full-baseline result remains pending until recorded below; packaging and focused tests alone do not establish resource GREEN.

### Precommit full-baseline attempt failed

The [actual full-baseline attempt](evidence/phase-collection/full-base.json) did not establish GREEN: it exceeded the unchanged 4 GiB process-tree ceiling after 356.867 seconds, sampled peak 4,208,160 KiB, child exit -9 and rss_limit. Both stdout and stderr are empty; no JSON report or phase completion can be inferred. The [after snapshot](evidence/phase-collection/base.after.json) is byte-identical to the before snapshot, and the dirty archive hash remains unchanged. The [failure record](evidence/phase-collection/resource-failure.json) retains the uncommitted source/artifact binding.

Tasks 5.4 and 5.5 remain incomplete. Focused/static successes and the gateway-only reclamation probe do not establish a complete resource fix. No source commit, exact-commit packaging, final installed rerun, cap increase or additional implementation followed this failure. The later peak requires phase/config diagnosis before deciding the next action.

### Later-phase diagnostic also failed

A physical diagnostic copy of the failed dirty artifact added synchronous scalar phase/config/source traces and retained all eight existing collection points. Independent review cleared its instrumentation patch; only copied validator bytes and their descriptor/manifest digests changed. The [receipt, exact diagnostic identity/patch and trace analysis](evidence/phase-collection/later-phase-trace.json) record another guarded refusal after 366.368 seconds at 4,225,260 KiB sampled process-tree RSS, exit -9, `rss_limit`, empty stdout/stderr. Fresh complete before/after snapshots prove the original dirty consumer and archive unchanged.

The 42,691-event trace completed capture, imports, diagnostics (zero errors), and emission for all 21 configs, then 15 public helpers. Its final event is semantic dependency traversal returning 164 paths for `libs/wbs/adapters/store-sqlite/src/index.ts`; the containing public helper did not return. That config had emitted 458 records and 3,385,996 per-source output bytes. These are whole-program emission observations, not selected public-selector size. The following emitted dependency traversal, selector output charge and canonical hash were not distinguished by those markers. The full 14,799,864-byte trace remains preserved at `/tmp/wbs100-phase-collection-trace-20261020/trace.jsonl`, SHA256 `46388304326fdb6bd00511cacbfd44ef8c1ed8ba858cc0b4d2c5d6e80ebded2a`; the packet contains exact receipt/patch/identity bytes and a scalar analysis, not a substitute for that full trace.

This diagnostic is separately identified and does not establish resource GREEN or a leak cause. A further authorized diagnostic copy adds only dependency-call, closure-completion, output-charge and canonical-hash scalar markers under the same guard; no additional collection, cap increase or production change is authorized by this observation.

The [declared trace excerpts](evidence/phase-collection/later-phase-trace-excerpts.json) retain 544 exact phase/helper/GC/diagnostic-return/emission-return/public-semantic/terminal lines with one-based original line numbers and the full-trace SHA256. Each excerpt was compared with its original line. These excerpts intentionally cannot reconstruct the complete trace; the raw full trace remains available at the preserved path above.

### Emitted dependency closure localized

The independently reviewed finer diagnostic copy again failed the unchanged guard: 364.593 seconds, sampled peak 4,211,188 KiB, exit -9, `rss_limit`, empty stdout/stderr. The [exact receipt, identity, patch and analysis](evidence/phase-collection/public-closure-trace.json) distinguish its copied validator from the dirty source artifact and prior diagnostic copy. Fresh complete original/prior before/after snapshots are equal, and the copied validator/descriptor/manifest hashes still match their prelaunch identity.

All 15 preceding public selectors reached charge and hash completion. Store-memory selected 324 declarations with 2,567,419 text bytes; MCP selected 327 declarations with 2,618,459 text bytes. Store-sqlite instead stopped within emitted dependency traversal before closure completion, output charging or hashing. Its closure began at validator RSS 3,348,078,592 bytes; the first 300 declarations increased RSS by about 72 MiB. The `schema.ts` dependency call at visit 320 (371,145 emitted text bytes) increased observed RSS by 430,505,984 bytes, external memory by 99,445,654 bytes, and array buffers by 85,341,265 bytes over 1.233 seconds. It returned. The last completed call was `join-request.ts` (visit 365); `invitation.ts` began at visit 366 but did not return before the guard stop. That last path is not established as the cause.

The [declared excerpts](evidence/phase-collection/public-closure-trace-excerpts.json) retain exact boundary lines plus all store-sqlite dependency calls with original line numbers. They cannot reconstruct the complete 46,297-event trace. The full 16,261,300-byte trace is preserved at `/tmp/wbs100-public-closure-trace-20261020/trace.jsonl`, SHA256 `9dc355e7389cc2277ba3c8782c82284e615dd91bc6670e43bdb9ec0678406c74`. Per-call deltas include runtime effects and do not prove allocation ownership; heap readings remain coarse. This narrows the failure to emitted dependency traversal, not selector serialization. No resource GREEN, production fix, cap increase or commit follows from this observation.

### Targeted post-schema collection was not reached

A separately reviewed physical diagnostic copy added one conditional collection immediately after the `schema.ts` dependency call and pending-stack update for the store-sqlite public entrypoint. Its [identity, patch, receipt and analysis](evidence/phase-collection/public-closure-gc-trace.json) explicitly label it diagnostic-only. The unchanged guard stopped this run after 364.034 seconds at 4,216,708 KiB, exit -9 and `rss_limit`, with empty stdout/stderr. The last event is `schema.ts` dependency-call start at visit 320 and validator RSS 3,457,376,256 bytes. Neither the call-return marker nor either targeted collection marker occurred. Therefore the added collection never ran: this experiment does not measure reclaimability or establish a collection benefit.

The [exact indexed excerpts](evidence/phase-collection/public-closure-gc-trace-excerpts.json) retain declared boundary and store-sqlite dependency lines; they are not the complete trace. The full 46,205-event/16,226,456-byte trace remains at `/tmp/wbs100-public-closure-gc-trace-20261020/trace.jsonl`, SHA256 `41d354f81e32a76da2901442eaf9971f19cf77d3c1afa648145db60bca4fc5a2`. Complete original/prior snapshots remained equal after the run, and copied validator/descriptor/manifest hashes still match the prelaunch identity. This failure shows the schema dependency call itself can exceed the guard at its observed starting memory; it does not prove a permanent leak, isolate exact retained objects or authorize a production cache/collection change. Tasks 5.4 and 5.5 remain open.

### Pre-schema collection probe completed diagnostically

The next separately reviewed physical copy moved only that exact diagnostic collection to immediately before the store-sqlite/schema dependency call. The [receipt, identity, exact patch and analysis](evidence/phase-collection/public-closure-pre-gc-trace.json) record a completed run in 455.996 seconds at 4,084,860 KiB sampled process-tree RSS, below the unchanged 4,194,304 KiB ceiling, with `stopReason:null`. Child exit 1 accompanied a complete JSON report: 41 findings and three explicit unrelated unevaluated rules (`INV-CLASSIFY`, `PERF-THRESHOLD`, `SPEC-SCENARIOS`). The seven compiler-dependent refusals were absent. The report remains `allowed:false`; this instrumented, path-specific diagnostic is not an accepted production successor.

Both targeted collection markers occurred. Validator RSS fell from 3,443,015,680 to 3,257,106,432 bytes; reported heapUsed fell from 1,605,466,166 to 1,194,254,834 bytes over 302 milliseconds, while the current program, declarations and pending traversal remained live. Store-sqlite then completed a closure of 387 declarations containing 3,276,966 text bytes and completed charging/hashing. The observation demonstrates reclaimable preceding allocations at that boundary, but does not identify exact retained objects or prove that a generic earlier collection has the same effect.

The [declared indexed excerpts](evidence/phase-collection/public-closure-pre-gc-trace-excerpts.json) include the targeted collection and later completion boundaries. The full 52,049-event/18,373,751-byte trace is retained at `/tmp/wbs100-public-closure-pre-gc-trace-20261020/trace.jsonl`, SHA256 `692f1a4f667b4e01f4a0b743cbd6176de49f8e4e3161063729d83c6ddcafc2de`; excerpts cannot reconstruct it. Complete original/prior snapshots remained equal and copied evaluator hashes match the prelaunch identity. A generic production change and its fresh uninstrumented full-baseline proof remain unimplemented/unverified; tasks 5.4 and 5.5 remain open.

### Generic public boundary candidate

The coordinator approved the internal optional callback after semantic seed construction and before emitted dependency traversal, supplied only by the serial caller. The [dirty source identity](evidence/public-collection/green-source.json) and [patch](evidence/public-collection/green-source.patch.json) bind the candidate against documentation/CI base HEAD `434662eb3c16f83ce65c21beeade1da1ee0d4c31`. Independent review cleared serial source SHA256 `235d673581a729b1a27ba6590a3d29d825b7d71afa729c0ed711a11c5bfeb636` and declarations SHA256 `dd3e78def5353e717f1bd947288b3a06f63530f41dd807a435f77bbf8a21bc77`. The bounded core remains byte-identical at `988782269168521ac5749d35a8668df45f00de7597f20bab080be8b31de1f12a`, with its original four-argument call. No resolution, read, charge or failure-order changes were found.

The [fresh focused controls](evidence/public-collection/focused.json) passed 87 tests/213 assertions, zero failures, in 12.111 seconds at 395,300 KiB. The [standard Nx pack](evidence/public-collection/pack-green.json) succeeded in 8.021 seconds at 692,212 KiB; [separate consumer installation](evidence/public-collection/install-green.json) succeeded. [Artifact identity](evidence/public-collection/green-artifact.json) binds archive `44711362161259344e3d275c946e0858fc6dcc68ec1e6c5342c38d63239f8489` and validator `1ae8d7286375ff07dc8c5d82f2edabcc94e3025c4cb942c65aa1d71fccdd6ba8`. Embedded revision 434662 names base HEAD only; this is explicitly a dirty/precommit package, not an exact-commit successor. The [before snapshot](evidence/public-collection/base.before.json) precedes its unchanged-policy full-baseline attempt. Resource GREEN and whole-report equality remain pending until terminal evidence is recorded.

The [actual uninstrumented generic full baseline](evidence/public-collection/full-base.json) completed in 403.852 seconds at 4,133,096 KiB sampled process-tree RSS, within the unchanged 4,194,304 KiB/900-second guard (`stopReason:null`). Exit 1 accompanied the complete report with 41 findings and three explicit unrelated refusals. [Whole-report parity](evidence/public-collection/full-report-parity.json) confirms both parsed JSON equality and exact raw-byte equality with the successful targeted diagnostic: SHA256 `eedb17263aedc359fe503a2a2e9443c527f2a5b06b2685598f68554aa618dca2`. The [after snapshot](evidence/public-collection/base.after.json) is byte-identical to the before snapshot at SHA256 `02b8d828f514abd3973a13d7411b66fc951acabc8f74478164a84c7cd34cdbbc`.

This establishes task 6.3 resource GREEN for the measured dirty generic candidate and frozen workload, superseding the failed two-point attempt without erasing it. It does not promise a universal RSS bound or mark the report allowed. The 53 production CLI controls, final static review, normal-hook commit, exact-commit package/installed proof and coordinator full comparisons remain separate until freshly recorded.

Independent review of the actual resource receipt notes only 61,208 KiB (about 59.77 MiB) of sampled headroom below the ceiling. This measured pass is narrow; the exact-commit repetition and all candidate/fault comparisons remain required, and no larger workload or universal bound is inferred.

The generic candidate's [production CLI suite](evidence/public-collection/production-cli.json) passed 53 tests/671 assertions, zero failures, in 266.407 seconds at 1,683,036 KiB within the unchanged 2 GiB/360-second guard. [Scoped lint](evidence/public-collection/lint.json) passed with zero warnings (2.996 seconds/686,248 KiB); [full package typecheck](evidence/public-collection/typecheck.json) passed (1.430 seconds/1,420,176 KiB); [strict change validation](evidence/public-collection/openspec.json) passed. These are fresh checks of the generic source, separate from the earlier two-point receipts. Formatting, normal-hook commit and exact-commit installed proof are recorded separately when complete.

The final scoped formatting receipt is retained [with the generic candidate checks](evidence/public-collection/format.json).
