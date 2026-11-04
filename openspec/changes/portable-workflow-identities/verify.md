# Verification Report

> Produced with `openspec-verify-change` after implementation and the required source checks completed.

**Change:** `portable-workflow-identities`

**Verifier:** Codex/root, 2026-10-31 UTC

**Verified implementation:** `3aade51cf7aa888ea2d930a86065fb9a0091c911`

**Implementation commit range:** `9ac25dc61abdc95fe763a037c4fed5cd09043236..3aade51cf7aa888ea2d930a86065fb9a0091c911`

This report accepts the reviewed identity implementation at that commit. It records no architectural main merge, operator-store migration, production activation or completion of the wider agentic-workflows foundation. Verification metadata is written after the source checks; the checks do not certify a later documentation commit by implication.

## 1. Structural validation

- [x] Locked OpenSpec `validate --all --json`: every one of 306 entries is valid; 287 changes and 19 main specifications.
- [x] Both `portable-workflow-identities` and `workflow-identities` have zero issues.

Actual canonical output excerpt:

```json
  "summary": {
    "totals": {
      "items": 306,
      "passed": 306,
      "failed": 0
    },
    "byType": {
      "change": {
        "items": 287,
        "passed": 287,
        "failed": 0
      },
      "spec": {
        "items": 19,
        "passed": 19,
        "failed": 0
      }
    }
  },
```

Existing repository-wide notices: 685 WARNING and 25 INFO, including unrelated archive/header conflicts. They were retained rather than repaired in other owners' changes. They do not make this report an archive approval.

## 2. Completeness, correctness and coherence

| Dimension    | Assessment                                                                                                                                                                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Completeness | 14/14 tasks complete; four requirements and eight scenarios covered.                                                                                                                                                                                                        |
| Correctness  | Actual public-port cases, genuine predecessor transitions, independent fault/restoration observations and current source checks support the requirements below.                                                                                                             |
| Coherence    | Task reviews, grouped fix re-review, whole-identity review and the scoped preload-correction review accepted their source with no outstanding findings. The private codec, shared transition lifecycle, genuine source pins and explicit worker-fork cost match the design. |

Paths beginning `runs/` below are relative to `apps/twilight-structure/twilight-dash/cli/src/`; `tools/` paths are repository-relative.

| Requirement / scenario                                                       | Implementation and executable coverage                                                                    | Observed evidence                                                                                                                                                                                                                                                        |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stable generated run: persist the same generated run twice, including reopen | `runs/create-run.ts`, `runs/create-run.test.ts`, `runs/sqlite/identity-keys.db.test.ts`                   | Real UUIDv4 constructor called once; retained validated frozen version1/revision0 Run reused through memory retry and SQLite retry/reopen/retry. Task1 27/0/90 assertions; final shared cases 65/0/684. No coordinator-generation or CLI wiring claimed.                 |
| Exact private identities: Unicode and literal escapes remain distinct        | `runs/sqlite/identity-key.ts`, finite table maps/readers/writers, shared `identity-keys.db.test.ts` cases | Both providers; 11 raw samples, exact 256-UTF-16 edge and whitespace, lone high/low surrogates, replacement/literal escape/NUL/astral distinctions, finite unbounded-ID controls and independent references. Payloads/digests/scope tuples retain their representations. |
| Noncanonical or independently mismatched trusted keys refuse                 | `runs/sqlite/identity-key.ts`, `row-codecs.ts`; public identity corruption cases                          | Independent T3 021 canonical omission and T3 010 physical/logical omission lose their actual public-read refusal. The earlier masked 009 attempt receives no independent proof credit.                                                                                   |
| Genuine populated predecessor upgrades atomically and old writers refuse     | `runs/sqlite/migrate-identities.ts`, `format-transition.ts`; `identity-migration.db.test.ts`              | Genuine b3b producer; payload/schema/identity comparisons; already-open, queued, BUSY and already-admitted callback writers fenced. Existing 3↔4 targets, all0001–0004 bytes and frozen format3 worker/protocol controls preserved.                                      |
| Corrupt predecessor or late transition failure leaves predecessor intact     | Same transition owners and actual migration fault cases                                                   | Predecessor audits, publication-trigger corruption, real late abort and explicit pre-close inTransaction observations. Absence and unreadability have distinct preflight cases; diagnostic category faults remain labeled accordingly.                                   |
| Unused transition round trip preserves prior history/payloads/identity       | Explicit4↔5 API and genuine producer                                                                      | Populated genuine round trip and both transition pairs; fix1 003 10/0/86, restored fix1 020 and full fix1 024. Prior tables retained until explicit unused down.                                                                                                         |
| Unused downgrade preserves a later observed clock                            | Shared metadata/clock and documented immutable-artifact exceptions                                        | Original055 13/0/122 and full fix1 024 preserve the greatest duplicate/refusal observation without changing predecessor execution/history or ownership.                                                                                                                  |
| New semantic use prevents destructive API and raw SQL down                   | `runs/sqlite/run-store.ts`, `identity-usage.ts`,0005 `down.sql`                                           | Independent affected-row, AFTER-trigger readback, presence/count, raw SQL and common semantic-finish faults033–038; used/missing/corrupt markers refuse. Successful ownership/manifest changes count as semantic use.                                                    |

Final full SQLite/fixture source campaign before the shared-case-only edit: 1,359 passed, zero failed, 5,282 assertions across 35 files. Final shared identity file: 65 passed, zero failed, 684 assertions. Subsequent full corrected CI and the exact-feature canonical target set cover the accepted final implementation. Seven affected typechecks plus the backend prerequisite passed uncached; named lint/format and normal hooks passed.

No incomplete task remains inside this identity change. Architectural integration and the wider foundation are separately held/incomplete; they are not relabeled as completed tasks here.

## 3. Delta specification sync

| Capability            | Status | Evidence                                                                                                                                            |
| --------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workflow-identities` | Synced | Main and delta contain the same four requirement bodies/eight scenarios; exact comparison passed after the approved sync was committed in3aade51cf. |

## 4. Failure proofs

`T3` identifies `task-3-evidence`; `F1` identifies `task-3-fix-round-1-evidence` in the retained implementation packet. A numbered observation names its original selected test command, source state, raw failure/restoration streams and captured metadata. Early T3 001–019 metadata is partial; later audits do not reconstruct it. Operation descriptions identify the exercised public port or actual fixture/policy boundary. No copied predicate is substituted for the production/test-infrastructure owner.

| Check (current file:line)                                                                   | Actual injected fault and observing test/path                                                                                                                               | Restored evidence / qualification                                                                                                                                        |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Constructor validation (`runs/create-run.ts:14`)                                            | Task1 fault removed only decodeRun;15negative tests returned malformed Runs and failed expected refusal.                                                                    | Task1 restored/complete-tests27/0/90.                                                                                                                                    |
| Canonical physical spelling (`runs/sqlite/identity-key.ts:9`)                               | T3021 omitted only canonical comparison; public readManifest admitted noncanonical key with logical guards installed.                                                       | 022restored;042/full024. Initial009masked omission diagnostic only.                                                                                                      |
| Physical/logical correspondence (`runs/sqlite/row-codecs.ts:80`)                            | T3010 omitted only comparison; canonical wrong physical key passed public readRun.                                                                                          | Restored original streams;042/full024; early metadata limitation retained.                                                                                               |
| Usage UPDATE affected rows (`runs/sqlite/identity-usage.ts:19`)                             | T3033 omitted changes===1; suppressed UPDATE allowed applied renewal on already-used marker while readback stayed installed.                                                | 042/full024.                                                                                                                                                             |
| Usage post-trigger readback (`runs/sqlite/identity-usage.ts:19`)                            | T3034 omitted readback; AFTER trigger reset used=0 and renewal applied.                                                                                                     | 042/full024.                                                                                                                                                             |
| Usage presence/shape audit (`runs/sqlite/read-runtime.ts:55`)                               | T3035 omitted audit; public manifest accepted absent/invalid/extra markers.                                                                                                 | 042/full024.                                                                                                                                                             |
| Usage singleton count (`runs/sqlite/identity-usage.ts:9`)                                   | T3036 omitted count; public manifest accepted extra row.                                                                                                                    | 042/full024.                                                                                                                                                             |
| Independent raw down guard (`runs/sqlite/migrations/0005-identity-keys/down.sql:3`)         | T3037 replaced CHECK with unconditional success; actual direct down dropped used/absent/invalid marker tables.                                                              | 042refused all3 before destruction; full024.                                                                                                                             |
| Common semantic-use marking (`runs/sqlite/run-store.ts:186`)                                | T3038 omitted finish dispatch; applied ownership left actual upgraded store eligible for unused down.                                                                       | 042/full024.                                                                                                                                                             |
| Successor audit (`runs/sqlite/format-transition.ts:169`)                                    | T3039 omitted audit and trigger removed usage; upgrade committed. F1011 omitted shared audit and both actual API-pair corruptions committed.                                | 042; F1020/full024.                                                                                                                                                      |
| Format5 recovery dispatch (`runs/sqlite/read-runtime.ts:113`)                               | T3040 restored version===4 branch;8actual format5 histories silently became empty.                                                                                          | 042/full024.                                                                                                                                                             |
| Runtime counter singleton (`runs/sqlite/read-runtime.ts:142`)                               | T3041 omitted count; public manifest accepted extra successor counter.                                                                                                      | 042/full024.                                                                                                                                                             |
| Explicit rollback (`runs/sqlite/format-transition.ts:181`)                                  | T3051 omitted ROLLBACK; actual down connection was inTransaction immediately before native close. F1012 shared omission exposed3abort paths likewise.                       | F1020/full024; no credit from implicit rollback on close.                                                                                                                |
| Closure no-history-read oracle (`runs/sqlite/recovery.db.test.ts:1018`)                     | T3063 inserted actual history SELECT between closure writes; oracle rejected it with inherited audits installed.                                                            | 084/full024.                                                                                                                                                             |
| Final usage-write ordering oracle (`runs/sqlite/recovery.db.test.ts:1011`)                  | T3064 inserted early exact usage UPDATE/readback; next semantic write failed oracle.                                                                                        | 084/full024; only final exact usage read is allowed.                                                                                                                     |
| Test-owned source retention (`runs/testing/predecessor-fixture.ts:242`)                     | T3046 omitted pending-owner guard; failed archive import deleted source.                                                                                                    | 055/full024; import failure is not native-open proof.                                                                                                                    |
| Closed fixture owner (`runs/testing/predecessor-fixture.ts:322`)                            | T3047 omitted closing guard; late owner admitted after source deletion.                                                                                                     | 055/full024.                                                                                                                                                             |
| Exact native close ownership (`runs/testing/format4-fixture.test.ts:55`)                    | F1001 blocked owned native close while3other connections closed; old aggregate gate deleted both roots while owned connection still answered SELECT.                        | F10025/0/59; full024. Controlled exact close is required before cleanup.                                                                                                 |
| Body-failure cleanup retention (`runs/testing/format4-fixture.ts:109`)                      | F1005 injected assertion failure after blocked close; both roots retained with owned connection queryable, then removed after controlled exact close.                       | Deliberate body failure; separate retention exercise, not a second native-close witness.                                                                                 |
| Missing / completed pooled owner (`runs/testing/format4-provider.ts:22`)                    | T3071/072 independently omitted conditions; actual native stores succeeded without required owner or after teardown.                                                        | 084/full024.                                                                                                                                                             |
| Lease before native open (`runs/testing/format4-provider.ts:47`)                            | T3073 omitted acquisition; actual native fault observed0leases before throwing.                                                                                             | 084/full024.                                                                                                                                                             |
| Source provenance before open (`runs/testing/format4-provider.ts:54`)                       | T3074 omitted recheck; altered archive reached native open and released lease.                                                                                              | 084/full024.                                                                                                                                                             |
| Pending lease teardown (`runs/testing/format4-provider.ts:97`)                              | T3075 omitted barrier; native-close-fault child exited0 and source was removed.                                                                                             | 084/full024retain source on uncertainty.                                                                                                                                 |
| Generic scratch teardown ordering (`runs/testing/format4-lifetime-preload.ts:12`)           | T3076 put scratch deletion in finally; provider source retained but generic root disappeared.                                                                               | 084/full024.                                                                                                                                                             |
| Exact preload policy (`tools/tool-devsync/src/eslint-boundaries.test.ts:13`)                | T3077 removed allowance and real preload lint refused;078widened alias and079added peer, failing effective-policy assertions without parser faults.                         | 084/full024plus actual affected/static checks.                                                                                                                           |
| Ordinary module/archive reuse (`runs/testing/format4-provider.ts:52`)                       | T3080reimported per lease /081re-extracted; actual second file observed2loads / different archive and failed.                                                               | 084/full024one ordinary pooled module, separate stores/leases. No hard heap/performance bound claimed.                                                                   |
| Complete closure witness cardinality (`runs/testing/format4-lifetime.test.ts:198`)          | T3082 repeated module fault with incomplete witness; corrected harness retained owned root.                                                                                 | Nonpassing by design;084/full024complete closure. Earlier080/081cleanup weakness remains disclosed.                                                                      |
| Reused protocol provenance dependency (`runs/testing/format4-protocol.test.ts:174`)         | F1007 omitted only archived protocol entry; changed bytes passed verification with shared comparison installed.                                                             | F1020/full024.                                                                                                                                                           |
| Actual worker invocation arity (`runs/testing/format4-worker.ts:419`)                       | F1006 omitted only worker arity guard; genuine4 accepted extra renewOwnership parameter with decoders installed.                                                            | F1020/full024real missing/extra parameter refusals.                                                                                                                      |
| Configured Dash preload execution (`runs/testing/format4-lifetime.test.ts:272`)             | Release correction002 executes the actual configured command/cwd and fails on missing preload;006 removes only the corrected `./` and the unchanged regression fails again. | 005and011actual genuine-store test,015final colored command pass with one provider load, zero leases and removed source. This is command execution, not string equality. |
| Color-independent configured-command evidence (`runs/testing/format4-lifetime.test.ts:276`) | Release correction014 runs actual command under FORCE_COLOR=1: child selected test succeeds but the `(pass)` assertion fails.                                               | 015uses the selected name, independent1pass summary and native closure witness; no environment normalization or command rewriting.                                       |

Additional diagnostic or functional checks are kept distinct from independent unsafe-admission prevention:

| Check                                                             | Fault and observed test effect                                                                                                        | Classification / restoration                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `runs/sqlite/format-transition.ts:50,61` original cause/category  | T3M6CAUSE/T3M6 and053 alter absent/unreadable error cause/category; actual transition diagnostics lose their expected classification. | Diagnostic; refusal remains. Exact restoration and both-pair/full campaigns pass.      |
| `runs/sqlite/format-transition.ts:155` predecessor-audit ordering | T3M3PRE omission moves partial-successor corruption to a later DDL refusal.                                                           | Diagnostic ordering; DDL still refuses. No independent unsafe-publication credit.      |
| `runs/sqlite/format-transition.ts:161` used-history precheck      | F1 010 omission loses `used_history` on both API pairs while raw down CHECK still refuses.                                            | Diagnostic; restored F1 020/full024.                                                   |
| `runs/sqlite/format-transition.ts:165` apply dispatch             | F1 009 omission breaks genuine predecessor round trips; retained successor audit still rejects.                                       | Functional dependency; restored F1 020/full024.                                        |
| `runs/sqlite/format-transition.ts:172` committed phase            | T3M7/052 omission mislabels a successful commit followed by native close failure as a transaction failure.                            | Diagnostic; actual committed state is not credited as rolled back. Restoration passes. |
| `runs/testing/predecessor-fixture.ts:166` producer context        | F1 008 old-producer label loses the correct outer context of an actual genuine4 arity refusal.                                        | Diagnostic; original cause/refusal remain, restored F1 020/full024.                    |

Inherited validations moved without behavioral changes retain their original adjacent Proof context. Existing decoder/schema checks remain installed in the independent negatives. API inspection/category labels and partial-family diagnostics do not gain new safety credit from later guards refusing.

- [x] New/changed safety checks are represented above, with truthful adjacent source Proof comments and retained observations.
- [x] Refusal and functional negatives exercise the actual owner; diagnostic-only and direct-row-owner scope is explicit.
- [x] Filesystem absence and unreadability are separately exercised where the transition preflight distinguishes them.
- [x] Exact native closure, worker/pipe closure and retained uncertain source are distinct facts; an unrelated connection close is not an ownership witness.
- [x] No row treats an exit status as proof of effects beyond its tool or test contract.

## 5. Actual source-check output

### Exact-feature canonical host

Host `h4claw`, isolated tree `/home/puni1/puni-00-gate-tbf`, canonical command:

```sh
bin/h2puni-gate.sh 3aade51cf7aa888ea2d930a86065fb9a0091c911
```

Actual stderr identity/lock output:

```text
heavy lock: waited 0s behind 0 tickets
h2puni gate: running on 3aade51cf7aa888ea2d930a86065fb9a0091c911
```

Actual install output:

```text
{"schemaVersion":1,"status":"inactive","certified":false,"reason":"external activation marker is not provisioned"}
bun install v1.4.4 (38afee6c8)

Checked 1801 installs across 1648 packages (no changes) [751.00ms]
```

Actual completed-stage output excerpts:

```text
 NX   Successfully ran targets test, lint, typecheck, build for 52 projects and 10 tasks they depend on
  Run duration:      58m 17s
  Cache:             Skipped (--skip-nx-cache)
    - Cache: drop --skip-nx-cache to restore unchanged tasks instantly.
 NX   Successfully ran targets test, typecheck, build for 2 projects and 4 tasks they depend on
  Run duration:      47m 15s
  Cache:             Skipped (--skip-nx-cache)
    - Cache: drop --skip-nx-cache to restore unchanged tasks instantly.
 NX   Successfully ran target lint:source for project twilight-burokrat
  Run duration:      23.6s
  Cache:             Skipped (--skip-nx-cache)
 NX   Successfully ran target lint for project twilight-dash
  Run duration:      40.6s
  Cache:             Skipped (--skip-nx-cache)
    - Cache: drop --skip-nx-cache to restore unchanged tasks instantly.
[solver-image-smoke] supervisor authenticated and published feasible baseline answer
[solver-image-smoke] supervisor authenticated and published feasible shared-person answer
 NX   Successfully ran target solver-image-smoke for project wbs-be-01
  Run duration:      3m 50s
  Cache:             0/1 hit (0%)
 3 pass
 0 fail
 15 expect() calls
Ran 3 tests across 2 files. [11.28s]
```

- [x] `bunx nx format:check --all` completed before the first Nx batch under the canonical script's `set -euo pipefail`; successful formatting is quiet. Hosted CI's separate Format step also completed successfully. No formatting-success line was invented.
- [x] Full test/lint/typecheck/build scope ran through the canonical split: workspace52projects+10dependencies; Twilight2projects+4dependencies; both source lints. Cache was explicitly skipped.
- [x] Real solver-image smoke produced authenticated feasible baseline/shared-person answers and passed the three real Docker lifecycle cases.

Canonical terminal: started `2026-10-31T15:49:54Z`, finished `2026-10-31T17:43:02Z`, exit0, 6788 seconds. Original stdout 308781 bytes, SHA256 `d9c49e8d2456875bfc604721b0c24575dda8ddad31fca12b1b8bcf8fa00429cd`; stderr 1513 bytes, SHA256 `afb7786ceadb87a2813b09f2b6aafb7bd3369de00fb9d3f5fc2592dce83588eb`. All three SSH transfers settled0, both transfer pipes drained, and transferred byte counts/hashes matched the host terminal. The remote contract is regular files after foreground termination; independent remote pipe EOF is not claimed. Static target output does not expose per-suite totals; no synthetic-CI counts are borrowed for this source tree.

### Hosted CI

[CI41216691929](https://github.com/Prosperous-Unification/puni-00/actions/runs/41216691929) completed success: 10 applicable jobs succeeded; the docs-only job was intentionally skipped for the affected-code plan. Required `gate` and `pixels` contexts were completed/success from GitHub Actions app15368 on exact head `3aade51cf7aa888ea2d930a86065fb9a0091c911`.

Actual recorded workspace commands and exits:

```json
{"command":["nx","run-many","-t","test","typecheck","build","-p","harness-example,shared-delivery,shared-delivery-github,shared-failures,shared-portability-format,shared-test-evidence,shared-test-levels,shared-ui-core-01,shared-ui-saas-01,shared-validation,tool-bootstrap,tool-compose,tool-dagger,tool-deploy,tool-dev-setup,tool-devsync,tool-fleet,tool-git-hooks,tool-observability-stack,tool-private,tool-remote-scripts,tool-rename-work-package,tool-secrets,tool-smoke,tool-test-clock-reads,tool-test-scratch,tool-workflows,twilight-navigator,wbs-auth,wbs-be-01,wbs-config,wbs-conformance,wbs-contracts,wbs-core,wbs-domain,wbs-fe-01,wbs-gw-01,wbs-mcp-01,wbs-observability,wbs-realtime,wbs-runtime-portable,wbs-solver-py,wbs-solver-supervisor-protocol,wbs-store-memory,wbs-store-sqlite,wbs-validation,website-be-01,website-contracts,website-fe-01,website-portability-fixture,website-store-sqlite,workspace-portability","--parallel=2","--output-style=stream"],"elapsedMs":4636865,"exitCode":0}
{"command":["nx","affected","-t","lint","--base=1860660a93c26dcd108dd675b4bc81c91672cad6","--head=9e0e41f2851f07439a374267851654c41f847963","--exclude=twilight-burokrat","--parallel=2","--output-style=stream"],"elapsedMs":524031,"exitCode":0}
{"command":["nx","run","twilight-burokrat:lint:source","--skip-nx-cache","--output-style=stream"],"elapsedMs":35427,"exitCode":0}
```

Actual workspace success/cache excerpts:

```text
 NX   Successfully ran targets test, typecheck, build for 52 projects and 9 tasks they depend on
  Cache:             0/140 hit (0%)
 NX   Successfully ran target lint for 49 projects and 1 task they depend on
  Cache:             0/50 hit (0%)
 NX   Successfully ran target lint:source for project twilight-burokrat
  Cache:             Skipped (--skip-nx-cache)
    - Cache: drop --skip-nx-cache to restore unchanged tasks instantly.
```

Full Nx ZIPs independently matched GitHub's published digests. Twilight expanded log: 4,392,941bytes, SHA256 `10fd9b1eded8d60bb8a31746e64be9fc6c188c29b802b4b3c4b013981f4ac0f9`. Workspace expanded log: 3,855,603bytes, SHA256 `d9a0bc5a616d21e4b0e73802f316014784d396d2390b0fe9c3567c7a65c5cd4c`. Full outputs and original completed-job streams are retained, including successful format, solver smoke, lock/head-pinning, dev-entrypoint, secrets, private nesting, doc caps, compose, migration, corpus and schema checks.

| CI suite                | Actual result                                |
| ----------------------- | -------------------------------------------- |
| Dash                    | 4,965 pass /0fail;21,227 assertions;140files |
| Burokrat                | 2,544 pass /0fail;16,042 assertions;101files |
| Burokrat packed package | 84 pass /0fail;9files                        |
| Browser                 | 616 pass /40recorded skips                   |
| OpenSpec                | 306/306valid;685WARNING+25INFO               |

CI executed synthetic merge `9e0e41f2851f07439a374267851654c41f847963`, parents main `1860660a93c26dcd108dd675b4bc81c91672cad6` and feature3aade51cf. Its tree `2a59e45940ba51390893cb4f23a2c1c0b7f350c7` differs from canonical feature tree `384e26f7738530b5e49c95ccf325b5609ba147f0`. Complete API compare path/status/blob lists and local feature diff show67additional incoming-main paths and128feature paths with zero overlap. This is metadata comparison, not an independent fetch/hash of every remote tree blob. PR-reported base7e0c disagreed with the direct main ref/actual executed parent1860; that observation remains recorded rather than normalized.

### Skipped, inactive and unverified scope

Nine unique workspace test skips were reported; their literal names follow. These are not passing cases:

- wbs-domain: » the leveled pass, at the size of a real plan > measures CPU work without charging a descheduled interval
- wbs-domain: » the leveled pass, at the size of a real plan > also measures elapsed time spent blocked inside a schedule call
- wbs-domain: » the leveled pass, at the size of a real plan > certifies 600 slices in under 20ms elapsed
- tool-remote-scripts: » managed solver exceptional cleanup with real Docker > removes a merely created container when timer setup fails
- tool-remote-scripts: » managed solver exceptional cleanup with real Docker > waits and removes after the real container has already stopped
- wbs-be-01: » fences actual stopped blue/green containers and an extra running mounted writer
- wbs-be-01: » fences real shared blue/green and alias writers, then commits with all test-owned writers stopped
- wbs-store-sqlite: » assignSubtree on the memory store, beyond the batch > refuses a stale undo once another account changed one of its leaves
- wbs-be-01: » solver supervisor orphan process boundaries > keeps the slot through coordinator EOF and survives a timer-stopped restart orphan

Browser's40skipped cases, including literal names and original job logs, are retained in `ci-corrected-browser-acceptance-audit.json` and the source-check checkpoint. They are not counted as passes.

Three CI ToolWiki steps were skipped:

- Tool wiki — diagnostic/non-certifying
- Provision immutable external activation for push audit
- Tool wiki — externally activated push audit

Canonical external ToolWiki activation reported inactive/certified:false. No external certification is inferred. The format4 worker remains one explicitly accepted version-specific fork, while protocol/transition ownership is shared. The fixture pool proves one ordinary verified module/archive per Bun process, not a hard RAM or performance bound.

### Preserved nonpassing observations

- The original public SQLite surrogate-ID save/read discrepancy was a real regression, repaired here. Earlier masked canonical omission009 is diagnostic-only; corrected021 carries the independent proof.
- Restricted-context import/EPERM/readiness attempts, cancellation, initial namespace/order/branding setup failures and partial early metadata remain nonpassing. They are not substituted for domain regressions or proof of their exact environmental causes.
- T3 059 broad validation failed with accidental dist discovery/stale physical test targets and measured roughly13GiB parent growth. Corrected source lifetime/targets and fullF1 024 subsequently passed; original failure was retained. Original019 used an inadequate default budget and failed; restored focused020 used the unchanged required budget.
- Old CI41211569114 failed before Dash tests on the unresolved preload; remaining workspace work was cancelled. Its canonical observer/holder disappeared without a terminal receipt, so that original gate remains unverified with no passing credit.
- Preload correction007 aggregate120s timeout ended143/SIGTERM. Five completed lifecycle cases retain their actual scope; remaining011 and final015 separately passed. Closure of its pending provenance/native source was not established, so uncertain scratch remains retained.
- The final collector initially exited1 because it searched stdout for a marker deliberately printed to stderr by `bin/h2puni-gate-lib.sh:299`. All transfers had already settled and matched hashes. The failed observation remains unchanged; a corrected local audit verified the exact stderr marker on the same files. No gate or transfer was repeated.

Legacy Docker-builder deprecations, a curl connection reset and the modeled orphan socket-closed diagnostic remain in original canonical stderr; the actual solver smoke and lifecycle tests completed successfully. No unknown scratch/process closure is relabeled as cleanup success.

## 6. Implementation signal and retained evidence

- [x] Implementation source snapshot clean: `git status --short` emitted no paths at accepted head3aade51cf before writing this report.
- [x] Relevant implementation commits pushed/read back exactly to draft PR787.
- [x] Task reviews and the whole identity review completed, followed by the scoped preload-correction review; no outstanding findings.
- [x] WBS notes were freshly re-read after updates, preserving all prior notes. Latest accepted-source readback: core75, first-provider34, S0parent23, all `in_progress`.

The local evidence root is `.superpowers/sdd/portable-workflow-identities-20261031/` in the owned implementation worktree. Accepted CI and canonical audits are `ci-corrected-release-audit-20261031.json` and `h4-canonical-acceptance-audit-3aade51cf-20261031.json`.

Persistent controller-host checkpoints are under `/home/df/wd/puni/puni-00/.superpowers/artifacts/`:

- `agentic-identity-3aade51cf-20261031/index.json`:206files/16,030,913bytes, including the full1,241-artifact implementation gzip and all144preload-correction artifacts/review. The full gzip is8,823,791bytes, SHA256 `216fe77ed772fc88d739c70230485fac5362dd1388e72508d998a4c69d6cfb26`.
- `agentic-identity-source-checks-3aade51cf-20261031/index.json`:67files/22,127,153bytes, containing current completed CI logs, digest-verified Nx ZIPs/full logs, original canonical streams/transfers, corrected acceptance audit, source-comparison evidence and WBS/PR observations. Copy/original re-read hashes passed; every retained file in the referenced implementation checkpoint was also re-read and verified.

These are ignored persistent local artifacts, not a tracked Git archive or a self-contained archive of the wider goal. Raw originals, uncertain scratch and the remote capture remain untouched. Subsequent verification-metadata publication must preserve the implementation source basis above and must not claim these source gates ran on an untested later commit.

## Decision

**PASS WITH WARNINGS for the reviewed identity implementation at3aade51cf.** Four requirements/eight scenarios and all14implementation/verification tasks are supported. Existing global notices, recorded skips, optional external certification and retention limitations are explicit.

PR787 remains draft under the architectural main-merge hold. No archive, operator-store migration or production action is performed. The separate receiver Unicode-storage finding is not fixed by the generated UUID or Dash private codec.

The original goal remains incomplete: full outcome/write/release and physical continuation recovery, actual remaining adapters/five-kind conformance, the second durable provider, real machine-MCP composition and safeS7a remain required. The next coupled outcome-delivery design choice is still pending owner input.
