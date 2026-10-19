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
