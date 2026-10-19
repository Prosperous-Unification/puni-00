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

Readable logs trim trailing whitespace for the repository whitespace check. Where bytes changed, adjacent `.log.gz` files preserve the exact raw output; [the integrity record](evidence/raw-log-integrity.log) binds both forms. Empty outputs are retained as empty files.

Final scoped Prettier check passed on all six TypeScript files and all five OpenSpec documents (exit 0, 162,068 KiB, 0.456 seconds). Git staged whitespace verification is required before the normal-hook commit.
