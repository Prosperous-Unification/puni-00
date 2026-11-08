# UC2 core and exact import-policy support — 2026-11-05

This is an implementation checkpoint on published parent
`c955920c1db94d68d359f53e2f2d5849d64fae7c`, not completed UC2. The corrected
[portable design](original-handoff-design.md#uc2-preparation-custody-implementation--2026-11-05)
remains authoritative. Storage/complete runtime enrollment is unchanged; actual
full preparation, UNKNOWN containment, native grants and final gates remain open.

## Exact policy support

Only the edge-ownership.ts activation-importer row was added, allowing exactly
`@wbs/store-sqlite/backup` and `@wbs/store-sqlite/sqlite-cleanup`, plus its mirrored
test row and four parser-valid probes. Existing anchors, importer restrictions,
full Nx options, other rows and rule order remain unchanged.

The initial absent-graph run reported skipped Nx enforcement and earns no policy
credit. An attempted graph command used the wrong installed CLI path and also
earns no credit. The actual installed `node_modules/nx/dist/bin/nx.js show projects`
then populated a dedicated graph. Unchanged tests produced genuine missing-row
RED: exact imports2fail, broadened denials2pass. Minimal exact row GREEN:4pass,
110assertions. The final bounded six-probe run passed6/0/323, including two existing
forbidden-edge groups. Scoped lint, Prettier and diff checks exited0; a nullable
test suffix lint error was corrected before the frozen source epoch.

The command prefix was pinned Bun1.4.4 with `test --no-env-file
--config=/tmp/puni-initial-empty-bunfig.toml --preload ./tools/test/scratch/preload.ts
./tools/tool-devsync/src/eslint-boundaries.test.ts --timeout=10000`, existing30000ms
case annotations preserved. Use the exact literal titles below for single-case
runs; display-suite separators are not selectors. A zero-match attempt remains
failed history, not test coverage.

Two independently reviewed physical pairs each removed only one required alias
from the production owner row while preserving the test file and every other
configuration byte. Backup mutant SHA256:
`1ee4db0f06cd239b68fc8940947900ddf64e7520e933057af17d340420cd9168`;
sqlite-cleanup mutant SHA256:
`9b71a5b1daef107e7ed2c8c3d485c7c3e16ce1374280fe32ec641d848ec51902`.

```text
owner admits only its exact @wbs/store-sqlite/backup classifier import
owner admits only its exact @wbs/store-sqlite/sqlite-cleanup classifier import
```

Each exact before/mutant/restored consumer selected one test with five assertions:
exit0/pass1, exit1/fail1 at actual active Nx `not.toContain`, exit0/pass1.
All twelve raw streams/lengths/hashes and original process exits/EOFs joined;
no skipped-rule warning, setup/parser error, timeout or signal qualified as RED.
The dedicated graph pin remained unchanged throughout. Config and test bytes
and mode0664 were verified after each pair before continuing. These prove only
the two named admission exceptions, not new necessity for unchanged boundary
mechanics or actual classifier runtime correctness.

Retained private local evidence:

- Implementation `/tmp/puni-uc2-import-policy-implementation-20261105.json`, SHA256
  `eaeddc9ec2b0bbc5bd75f760a3d157a02b7bc2082fff54e325e333f96bc0dd32`.
- Accepted recipe review `/tmp/puni-uc2-import-policy-source-r5-review-20261105.md`, SHA256
  `e10c38db4c5d3e63db35bfae5388bb97746a865198694885d847a23cc323f370`.
- Actual driver `/tmp/puni-uc2-import-policy-r5-driver-20261105.py`, SHA256
  `c9820129db92778d0925bd355cea559d6b7ab61937fb7c0264f779bf33bc1612`.
- Manifest `/tmp/puni-uc2-import-policy-r5-manifest-20261105.json`, SHA256
  `f20d21c0fe5a344b392b826efa38da7484388a56bacc7da80293e6b18ec58bcc`.

The restored config hash was
`c2fc73f2ee06cf96045efe018038edeaf78cb0b6bfc61ccb8a88fefdcd490645`;
test hash `99687864ffee121893cdb15ea835d7bc05df52eb4f3dba5071dcc6643a1e204a`.
Only after accepted actual review did Root add one adjacent factual Proof comment
to the config row; removing that exact comment reconstructs the reviewed config.
Local paths are retained evidence, not portable committed logs.

Root then ran the existing `keeps every peer boundary option and only the exact
needed activation edges` actual-source/table oracle on the frozen owner imports,
using a fresh separate graph and the same controlled Bun prefix. Original
session74980 exited0:1pass/0fail/79assertions,109filtered,6.93s; scratch cleanup
returned. Log: `tmp/puni-delivery-evidence/20261105/uc2-core-integration/policy-owner-parity.log`.
This verifies actual owner alias/table integration; it does not execute cleanup
classifiers or prove genuine constructor classification.

## Owner-core first review epoch

The initial owner core adds capsule/actual-original/Promise records and owner
unwind support, with only type aliases in storage. Its first tests showed missing
API RED, then known-path GREEN. During refinement a fixture incorrectly used the
two-layout publication decoder on a one-layout owner after enrollment but before
binding its original composition Promise. That reached the strict missing-body
HOLD guard and timed out:3pass/1timeout,20assertions,74filtered; original session59890
terminal exit1. No original PID/root/native close ledger was captured. This
attempt earns no HOLD, resource-closure or cleanup proof; process exit and scratch
removal do not replace original outcomes. No private constructor/storage run was
performed and no consumed grant was reset.

The corrected fixture binds its genuine readFile composition Promise immediately
after enrollment before fallible assertions. One explicitly bounded fresh four-case
known recheck completed4/0/24,74filtered, original pid1303621 exit0, both streams
EOF; scratch cleanup returned. Receipt `uc2-core/known-recheck-1/receipt.json`
under local delivery evidence, SHA256
`c79168ce2027ec681689f3bddf1e0c5a257dc9d2165edb20b566179f0f2d64d7`.
Scoped TSC/lint/format/diff passed on that epoch. These are narrow controls only:
composition is also pending in the deferred-close case, and the callback awaits
its operation, so those cases do not independently prove the operation-pending
or owner-join guards.

Astra source review found additional required transfer/runtime exit/settlement
corrections. Their source fixes, fresh exact controls and separate physical
necessity proofs must be recorded before broader acceptance. No core R5, full
storage/default gate, private/HOLD fixture qualification or full UC2 success is
claimed by these first known-path tests. Parent UC2/UC4/UC5 and UC2A–UC2F remain
unchecked until their full obligations are actually met.

## Corrected core source checkpoint

Five first-review findings and three follow-up corrections were implemented in
the same three-file scope. The canonical callback now returns a private outcome
envelope; only normal canonical completion marks runtime release, and original
callback refusal is rethrown afterward. The fixed `assertPreparationCompletion`
joins the original body/observer without self-joining its calling projection;
actual complete-caller invocation remains mandatory and unwired. Context binding
requires the exact enrolled scanner object. Historical liveness/runtime Proof
claims are attributed to the pre-core epoch rather than borrowed as new evidence.

Final source before further proof work: owner
`8c711e6d2daa0c6e23c185fb569698ec83cc0db287645d8fb1696c2f056298b5`;
owner test `bc740e75549bc99c5abe7254aac1862c1708fbcc3b7fd7d07b3ec893a66d1e5d`;
storage type aliases `e8ac098736b6cc538693437ae9c923819f5783fb8df61285d4f217a0f1b2154a`.
Astra final bounded source review SHA256
`d8dfc29504afd9aca89f7a9b85c82ed372b44e1de184ee092f68f60aabf36eb2`.

The revised exact nine-case known-only run passes9/0/42,74filtered, original
PID1332091/exit0/both streams EOF, unchanged source/modes. Receipt
`uc2-core/known-nine-revised-1/receipt.json` SHA256
`4bae0a1c8235bd27fab2b8ec615474d0d306f12117268f831532f1f59eb5f79d`.
The prior nine-case epoch also exited0, but its reporting script compared timing
suffixes as literal titles and marked qualified:false. That original receipt
remains unchanged; a separate assessment of the same captures supplies only its
narrow compatibility credit, without rerun or metadata surgery.

Root configured `nx run tool-remote-scripts:build --skip-nx-cache` with owned
uc2-core-build graph/cache and daemon/plugin isolation disabled. Original session9092
exited0, uncached2.7s: remote CLI build and9 dependency tasks completed, including
the owner/Graph cycle. This compiles bundles, not native execution or deployment.

No storage/complete enrollment, genuine prepared success, finite UNKNOWN/HOLD,
per-guard necessity, whole owner regression or full UC2/gate success is inferred.
The revised E snapshot precedes its fixture joins; A still does not establish
native-pending I/O or exact native close-before-unwind ordering.

## Whole owner baseline and publication limits

The unchanged full owner file then completed 83 pass / 0 fail / 370 assertions,
83 distinct expanded outer titles, one file. Original PID/PGID1339483 exited0,
without timeout or signal, both captured streams reached EOF and scratch
cleanup returned. Receipt `uc2-core/whole-owner-baseline-1/receipt.json`,
SHA256 `ad6cc2f654f27e0a63fe8803179ffc5bf087534044b4cac736b3ea8af86f66dd`.
Owner/test/storage/policy hashes and modes remained unchanged. This is a known
resource regression baseline, not genuine storage enrollment or HOLD evidence.

PR863 CI run41969919400 is now terminal failure at c955. The source leaf,
frontend, backend, ordinary remote, complete-activation and all eight pixel
shards succeeded. Workspace job127055663164, twilight job127055663203 and
storage job127055663282 failed; aggregate gate consequently failed. The storage
job reports two failures at dependency-activation-storage.test.ts:1454 and
phase exit1 after2505s. No new core changes were present in that hosted run.
The private publication captures retain those job consoles; this checkpoint
does not infer all failure causes or full-gate success from the source positive.

The separately [prepared producer-P protocol](verify-producer-p-prepared-20261105.md)
is published as an unapplied draft only. It has not been run and FEP8 remains
open. The new owner core is deliberately unwired to storage and complete
runtime enrollment until the coupled finite-HOLD fixture migration is ready.
No private constructor grant, final h2 gate, deployment, full UC2 success or
architectural main adoption is claimed by this publication.

## Three physical owner-core necessity pairs

All three independently reviewed recipes ran sequentially against the final
8c711e6d owner epoch. Each used a fresh original Bun process for intact control,
physical mutant and exact-restored control. There were nine terminal processes,
no timeout/signal, both streams EOF, source and modes restored after each fault.
Root independently rehashed all18 captured streams, all9 receipts and the4 final
source identities. The unchanged test/storage/policy remained pinned throughout.

| Recipe | Exact mutation                                                                | Actual negative                                                                 | Before / mutant / restored |
| ------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------- |
| R1     | Return `original.then((value) => value)` in `bindPreparationOperation`        | `toBe(original)` fails with distinct Promise identity                           | exit0 / exit1 / exit0      |
| R2     | Remove only `assertPreparationLocks(record)` in `assertDependencyPreparation` | Inner lock `toThrow` did not throw;3 expectations show first assertion failure  | exit0 / exit1 / exit0      |
| R3     | Remove only the same call in `assertPreparationOperation`                     | Inner lock `toThrow` did not throw;4 expectations show second assertion failure | exit0 / exit1 / exit0      |

R2/R3 preserve the actual inner missing-throw cause even though the later expected
message assertion also fails. Generic nonzero status alone is not credited.
R1 proves original-Promise return identity only; the pending-composition fixture
does not independently prove native-pending cleanup exclusion. R2/R3 prove each
call's necessity against the replaced actual runtime inode, not every predicate
in the shared lock validator. No new native ordering, UNKNOWN/HOLD or genuine
storage/context integration proof is inferred.

The manifest below is portable metadata; its raw paths identify retained private
local captures, not files uploaded by this PR. The independently prepared
[finite-HOLD harness draft](ordinary-hold-harness-draft-20261105.md) remains
unimplemented and unexecuted.

```json
{
  "whole_owner_baseline_receipt_sha256": "ad6cc2f654f27e0a63fe8803179ffc5bf087534044b4cac736b3ea8af86f66dd",
  "pair_phases": [
    {
      "recipe": "R1",
      "phase": "before",
      "pid": 1342242,
      "exit": 0,
      "source_during_owner_sha256": "8c711e6d2daa0c6e23c185fb569698ec83cc0db287645d8fb1696c2f056298b5",
      "stdout_sha256": "bbe6a94c29cc8d3ff5a1792a5abae1f1122aed0642111b52036ab7e0b2b2ca47",
      "stderr_sha256": "49474bd5c979a05b70d85fdab688b50a07e802f11ab8531702c6faeed858b7c4",
      "receipt_sha256": "216dcb69d283b674ed101408689e04980d45ec4e1246313a194fa18f8b0687bb",
      "raw_dir": "/home/df/.codex/worktrees/1b31/puni-00/tmp/puni-delivery-evidence/20261105/uc2-core/r5-R1/before"
    },
    {
      "recipe": "R1",
      "phase": "red",
      "pid": 1342390,
      "exit": 1,
      "source_during_owner_sha256": "25ed1922c8aa51bde2cf2ec2ee592491ed577bcb16ac2a307bd7134fc6d0596e",
      "stdout_sha256": "bbe6a94c29cc8d3ff5a1792a5abae1f1122aed0642111b52036ab7e0b2b2ca47",
      "stderr_sha256": "e42e54b7ac0180a01ca559d1b401085214a6ea92c1f9a73a577317e8cdda882d",
      "receipt_sha256": "18a7d057fca4d252318feb525ee8b6cd199f12e319edc552ef12aa69d8b2c4d1",
      "raw_dir": "/home/df/.codex/worktrees/1b31/puni-00/tmp/puni-delivery-evidence/20261105/uc2-core/r5-R1/red"
    },
    {
      "recipe": "R1",
      "phase": "after",
      "pid": 1342914,
      "exit": 0,
      "source_during_owner_sha256": "8c711e6d2daa0c6e23c185fb569698ec83cc0db287645d8fb1696c2f056298b5",
      "stdout_sha256": "bbe6a94c29cc8d3ff5a1792a5abae1f1122aed0642111b52036ab7e0b2b2ca47",
      "stderr_sha256": "129516bd30e376279581e75cbbeaa7b9bf12ad549965a6038de6804f67d187c1",
      "receipt_sha256": "54c6a2a119bce7ffecfc76fa71254de1fe26f0e8993311eab2bed8733c96d283",
      "raw_dir": "/home/df/.codex/worktrees/1b31/puni-00/tmp/puni-delivery-evidence/20261105/uc2-core/r5-R1/after"
    },
    {
      "recipe": "R2",
      "phase": "before",
      "pid": 1342990,
      "exit": 0,
      "source_during_owner_sha256": "8c711e6d2daa0c6e23c185fb569698ec83cc0db287645d8fb1696c2f056298b5",
      "stdout_sha256": "bbe6a94c29cc8d3ff5a1792a5abae1f1122aed0642111b52036ab7e0b2b2ca47",
      "stderr_sha256": "ce2ba7b1881f5cbff3883e5715e363d394a34b44245fbac00686c0ee7a04c540",
      "receipt_sha256": "ecea5cde626cb13e74d3a0b8b2c442752d5d9f0af16d1698ba6f7bc100305350",
      "raw_dir": "/home/df/.codex/worktrees/1b31/puni-00/tmp/puni-delivery-evidence/20261105/uc2-core/r5-R2/before"
    },
    {
      "recipe": "R2",
      "phase": "red",
      "pid": 1343197,
      "exit": 1,
      "source_during_owner_sha256": "d059fb2832df0a90a45abf6fef0fa34ae6c1c2c1e9682fa76bc488a200ab3981",
      "stdout_sha256": "bbe6a94c29cc8d3ff5a1792a5abae1f1122aed0642111b52036ab7e0b2b2ca47",
      "stderr_sha256": "ce9f70574d11b357e18f9dd88069a23e415aa0a74e61bab7d4759e31ea46ee55",
      "receipt_sha256": "d46081f717122514cab03a5038aa41212b8cad0db857833ecbc02971776193f4",
      "raw_dir": "/home/df/.codex/worktrees/1b31/puni-00/tmp/puni-delivery-evidence/20261105/uc2-core/r5-R2/red"
    },
    {
      "recipe": "R2",
      "phase": "after",
      "pid": 1343383,
      "exit": 0,
      "source_during_owner_sha256": "8c711e6d2daa0c6e23c185fb569698ec83cc0db287645d8fb1696c2f056298b5",
      "stdout_sha256": "bbe6a94c29cc8d3ff5a1792a5abae1f1122aed0642111b52036ab7e0b2b2ca47",
      "stderr_sha256": "d6b5fe94b73fdcec7aafacaec43e8f71c561c45dbaa4d4e1a5b8cd7d143e5523",
      "receipt_sha256": "ce2f16ac9d01e020855a972136a65b46fd39807d3dddf1853294eac08cde48a4",
      "raw_dir": "/home/df/.codex/worktrees/1b31/puni-00/tmp/puni-delivery-evidence/20261105/uc2-core/r5-R2/after"
    },
    {
      "recipe": "R3",
      "phase": "before",
      "pid": 1343620,
      "exit": 0,
      "source_during_owner_sha256": "8c711e6d2daa0c6e23c185fb569698ec83cc0db287645d8fb1696c2f056298b5",
      "stdout_sha256": "bbe6a94c29cc8d3ff5a1792a5abae1f1122aed0642111b52036ab7e0b2b2ca47",
      "stderr_sha256": "d746ff68c690d9b0c904100526ec57a8f6a88acd3d9bedd9ee88acbdb2c2ca74",
      "receipt_sha256": "3bf54b6b67b0a65bd65d4514fa9de9287bf60032d47db647af7e5935bc0b2e9a",
      "raw_dir": "/home/df/.codex/worktrees/1b31/puni-00/tmp/puni-delivery-evidence/20261105/uc2-core/r5-R3/before"
    },
    {
      "recipe": "R3",
      "phase": "red",
      "pid": 1343777,
      "exit": 1,
      "source_during_owner_sha256": "4656c0a53be5721132ffce70cdb3b1452166a105603509c41690a650718be0c4",
      "stdout_sha256": "bbe6a94c29cc8d3ff5a1792a5abae1f1122aed0642111b52036ab7e0b2b2ca47",
      "stderr_sha256": "159f77495240425d159dd22a01383ca0cc362b82b67823a2f7c29d4539d53a4e",
      "receipt_sha256": "570bc93ca2c20f8fa7b80e26a44a9062aa9936bd113eddb2f27a214f76b5d849",
      "raw_dir": "/home/df/.codex/worktrees/1b31/puni-00/tmp/puni-delivery-evidence/20261105/uc2-core/r5-R3/red"
    },
    {
      "recipe": "R3",
      "phase": "after",
      "pid": 1344033,
      "exit": 0,
      "source_during_owner_sha256": "8c711e6d2daa0c6e23c185fb569698ec83cc0db287645d8fb1696c2f056298b5",
      "stdout_sha256": "bbe6a94c29cc8d3ff5a1792a5abae1f1122aed0642111b52036ab7e0b2b2ca47",
      "stderr_sha256": "2c90d81810a6e210827ac842fa81f47121aa185c69244357ee336a3ec04512fc",
      "receipt_sha256": "09caa98608bbaaa531175a3b6caa671d46039785e8622a5950c1cf66ec1bd386",
      "raw_dir": "/home/df/.codex/worktrees/1b31/puni-00/tmp/puni-delivery-evidence/20261105/uc2-core/r5-R3/after"
    }
  ],
  "final_sources": {
    "tools/tool-remote-scripts/src/lib/edge-ownership.ts": {
      "sha256": "8c711e6d2daa0c6e23c185fb569698ec83cc0db287645d8fb1696c2f056298b5",
      "mode": "0o664"
    },
    "tools/tool-remote-scripts/src/lib/edge-ownership.test.ts": {
      "sha256": "bc740e75549bc99c5abe7254aac1862c1708fbcc3b7fd7d07b3ec893a66d1e5d",
      "mode": "0o664"
    },
    "tools/tool-remote-scripts/src/lib/dependency-activation-storage.ts": {
      "sha256": "e8ac098736b6cc538693437ae9c923819f5783fb8df61285d4f217a0f1b2154a",
      "mode": "0o664"
    },
    "eslint.config.js": {
      "sha256": "db08dfaf676d108dc83ea7238b7552f378f7b7e06d2b30ef1757bb0e15c44e1b",
      "mode": "0o664"
    }
  },
  "scope": "R1 exact original Promise return; R2 preparation-validator call; R3 operation-validator call. No credit for unrelated predicates, native pending/order, UNKNOWN, storage/context integration."
}
```

## Independent actual-proof acceptance and comment-only epoch

Astra independently accepted the whole83 baseline and all three physical
necessity pairs after reading the original receipts and raw captures. Review
SHA256 `4b7cc5f83e3a5b2c717c479d6bfdafaf71a99edbfa90ae80fb1e3631e90110b9`.
Root then added exactly three proposed narrow adjacent Proof comments. Removing
those exact six comment lines reconstructs owner SHA256
`8c711e6d2daa0c6e23c185fb569698ec83cc0db287645d8fb1696c2f056298b5`.
Existing receipts remain unchanged and retain their original pre-comment epoch.
No additional runtime behavior or test rerun is attributed to the comments.

Final configured TSC (`tsc --noEmit --project
tools/tool-remote-scripts/tsconfig.lib.json`) and scoped ESLint over all five
changed code/config files completed exit0 with empty logs, original sessions73669
and29957 respectively. ESLint used the populated configured-build Nx graph,
not a missing-graph fallback. Final owner comment-only SHA256 is
`8121dcdd8dda191443ff1b6065191fbea6995e588f114e2a4d5e3e6344268063`.
Document/index checking completed exit0; all334 OpenSpec entries passed.
This publication retains the earlier exact runtime receipts, without rerunning
known tests solely for comments or inferring current full CI/h2 success.
