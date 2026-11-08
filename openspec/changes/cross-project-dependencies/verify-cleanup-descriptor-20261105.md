# Ordinary cleanup fault targeting — 2026-11-05

The corrected whole-file run at95b5a817 reached an existing cleanup-injection
case that expected exclusion-or-finalizer refusal but failed earlier at final
readback. A source trace identified the test's selector: its first resolved
fixture-root open was a temporary migration-artifact ancestor, preceding the
storage-owned state-directory open. The test retained that numeric descriptor
after its native close, then faulted a later reused descriptor.

A first diagnostic is invalid evidence: its extra wrapper altered
`scanMigrationArtifact.toString()`, which the real scanner program serializes.
It refused before the intended path. Original test bytes/mode were restored
exactly, and the failed diagnostic was retained without FD-cause credit.

The corrected callback-only trace left every production function untouched and
buffered records until after restoring the original spies. It observed the
selected transient ancestor close returning before commit. Later, the same
number referred to a different manifest inode. GraphFiles closed that transient
file, then the test threw PRIVATE_CLEANUP_1. The second fault hit storage's held
evidence directory during unwind; the intended fenced-completion primary never
ran. Its outward independent-readback stage differs from the whole run's final
readback stage because descriptor allocation/reuse differs. Actual preclose
path/inode observations are decisive; an auxiliary openSync-only generation map
can miss relative/FFI opens and is not treated as a complete native ledger.

GraphFiles correctly retained logical UNKNOWN after the synthetic post-native
throw. That classification is unchanged. No retry, forced close or private
allocation/grant renewal followed; the ordinary probe process exited naturally
and its existing scratch cleanup returned. This does not establish unrelated
private custody or descendant-extinction claims.

## Test-only correction

The state selector now requires storage's literal fixture-root argument in
addition to the existing storage scope/resolved-path checks. Two small flags
retire the selected state/evidence originals only after their first native close
returns. Fault eligibility is computed before that close; later numeric reuse
is never eligible. No generic descriptor registry or production seam was added.

The operation-two-cleanups variant checks that the intended fenced primary ran
and both distinct selected originals had known returned closes with matching
paths/inodes after commit and the primary. Role-keyed comparisons impose no new
close order. All original stage, count, tracked-open, receipt/store and owner
assertions remain, and the anchor-close variant retains its original behavior.
The tracked-open map still has its original limited observer scope.

## Observed verification

- Initial repaired same consumer:1pass/0fail,145assertions,74.43s.
- Safe selector omission: remove only the literal argument predicate while
  retaining first-close retirement. The original stage assertion passes, then
  the unchanged cleanup count fails: expected2,received1. The wrong temporary
  selection retires before commit, preventing another fault on a reused Graph
  descriptor. Natural exit1,106.27s; scratch cleanup returned. Exact bytes and
  mode0664 were restored.
- Final restored batch:24pass/0fail,314assertions,162.62s. Anchor-close passed
  68.49s and operation-two-cleanups93.88s; boundary/public-decoder/census cases
  also passed. The other67storage cases were filtered; this is not full69
  qualification. Scratch cleanup returned in1ms.
- An independent source-preservation script verifies all other41callback bodies,
  the six old matcher assertions and original assertSafeFailure call in the
  changed callback, registration arguments/deadlines, cleanup and four-route
  owner loop. The permanent census adopts one new dated callback hash.
- Configured forced uncached remote typecheck and lint pass. Lint prints only
  the existing NO_COLOR/FORCE_COLOR warning. Astra High's final source/proof
  review found no Critical or Important issue. Document/OpenSpec validation and
  normal-hook publication belong to Root's accompanying receipt.

Actual final command from the isolated8877worktree:

```bash
umask 022
TZ=UTC TMPDIR=/home/df/.codex/worktrees/8877/puni-00/tmp/puni-delivery-evidence/20261105/cleanup-descriptor-fix/scratch PATH=/home/df/.bun/bin:/home/df/.volta/tools/image/node/24.20.0/bin:/usr/bin:/bin /home/df/.bun/bin/bun --no-env-file --config=/tmp/puni-initial-empty-bunfig.toml test --preload ./tools/test/scratch/preload.ts ./tools/tool-remote-scripts/src/lib/dependency-activation-storage.test.ts ./tools/tool-remote-scripts/src/lib/dependency-initial-layout-boundary.test.ts ./tools/tool-remote-scripts/src/lib/dependency-complete-activation.test.ts ./tools/tool-remote-scripts/src/lib/dependency-owner-custody-routing.test.ts --test-name-pattern='^initial preparation (anchor-close|operation-two-cleanups) retains commits and closes directly owned original descriptors$|^raw initial boundary|^ordinary storage callbacks|^native custody acceptance|^decodes detached|^refuses |^public request refusal' --timeout=10000
```

The preservation script ran with
`bun --no-env-file --config=/tmp/puni-initial-empty-bunfig.toml run tmp/puni-delivery-evidence/20261105/cleanup-descriptor-fix/preserve-callbacks.ts`.
The CLI10000ms and explicit180000ms test annotations are unchanged. Production,
Graph, owner, exclusion, private helper, dependencies and native pins are unchanged.

Evidence roots: `tmp/puni-delivery-evidence/20261105/cleanup-descriptor-diagnosis/`
and `tmp/puni-delivery-evidence/20261105/cleanup-descriptor-fix/`.

| Artifact                       | SHA256                                                           |
| ------------------------------ | ---------------------------------------------------------------- |
| corrected private FD trace     | fda4831447e0269190bc56b659b7291391f4693b3f7d70050a805a750b034713 |
| restored-regressions-green.log | 8d5a05be69480631971c8460f462577d1d9000d61dc89b3a5136a54c17f9198a |
| literal-filter-omitted-red.log | bf24d09fe2d70c48c44bb8a0fd885fa7dad5d34e480304f814e5fe77f2dad5bf |
| preserve-callbacks.ts          | 7a7baed75901269eaeae239a154f052ece276f4b62b59390a7ba13804baa5823 |
| callback-preservation.log      | c81ad7edd606d0105bfbf3d62df40c02d567f861e8ec26c11302be010737ad64 |

Final storage-test SHA256:
`25b66c566f9a5ae4f4ba2964368bd5db39aa840625fad9ab73d3395e4399559c`;
census `73995494df1ac28fd5b13b65f4af173d6e290c335aff87f9a048fde564daae11`.
The safe omission's before/restored hash4040078c679575c06991edf2e2b7ea3f3ab577a447f8337d9bce1a514d688150
differs only by the final adjacent factual Proof comment. No removed predicate
or diagnostic instrumentation is published.

The immutable95b5a817whole run continues on its original older source. Final
combined-source69/CI/h2capacity qualification, separate mandatory private
acceptance, architectural main adoption and deployment remain open.
