# Backend disk and boot identity contract correction

This finite correction starts from integration commit
`e09e0c5f511fad7284698f1e68d81aef54906828`. The real backend health producer
and shared declaration require exactly `status`, `commit` and `bootCommit`.
The two participant decoders had incorrectly required exactly two fields.
The producer is unchanged. Product health now requires both commits to be null;
source health requires both to equal the independently pinned source SHA.
Returned evidence includes both commits and the response digest. Existing JSON,
status, size and private-error boundaries remain in place.

The owning test calls the actual `infrastructureEndpoints` health handler with
healthy database inputs, serializes its actual reply, and invokes each real
consumer. It does not recreate the producer body. The four modeled fixture files
now emit three fields at their five response sites; the backend coordinator's
expected response digest also includes `bootCommit`. Arbitrary payloads in raw
HTTP transport tests are unchanged.

## Red, green and boot equality proofs

Root's original actual-producer reproduction exited 1 after printing healthy 200
`{status:"ok",commit:null,bootCommit:null}` and observing product decoder refusal:
`/tmp/puni-health-contract-actual-producer-red-20261029.log`.

Before changing either decoder, the expanded owning test reported **17 pass,
5 fail, 29 assertions**. Actual product and source positives failed the old
closed decoder, while missing-boot negatives exposed acceptance of incomplete
responses. Receipt: `/tmp/puni-health-contract-owning-red-20261029.log`.
The corrected decoder first passed **22 tests, 35 assertions**:
`/tmp/puni-health-contract-owning-green-20261029.log`.

Each new boot equality received a separate exact omission against an actual
producer response with all three fields and otherwise valid status/disk identity:

| Omitted equality                     | Actual producer input                 | Observed failure       | Exact restoration             |
| ------------------------------------ | ------------------------------------- | ---------------------- | ----------------------------- |
| Product boot commit null             | null disk, non-null boot              | Consumer did not throw | Same selected consumer passed |
| Source boot commit equals pinned SHA | expected disk SHA, different boot SHA | Consumer did not throw | Same selected consumer passed |

Both mutants exited 1 with `Received function did not throw`; both restored runs
exited 0. Each restoration compared exact saved bytes, SHA256
`09eb189f28b85da80a8914ee7fdb1b6e4b485e991d19f63e3062aea89a2d73ba`.
That pin predates factual Proof comments and formatting. Driver and receipts:
`/tmp/puni-health-contract-proofs-20261029.py`,
`/tmp/puni-health-contract-proofs-20261029.json`, and
`/tmp/puni-health-contract-{product,source}-{mutant,restored}-20261029.log`.
Adjacent Proof comments were added only after observing these failures. Existing
JSON/status/commit guards and their prior proof epoch were not replayed or
relabeled. Missing boot, unknown fields, wrong status and wrong disk identity
remain explicit ordinary negatives.

## Scoped verification

The owning tests passed again after the final test-only import explanation:
**22 tests, 35 assertions, zero failures**,
`/tmp/puni-health-contract-owning-frozen-20261029.log`.

Both owning compilers passed with no diagnostics:

```sh
bunx tsc --project tools/tool-remote-scripts/tsconfig.lib.json --noEmit --pretty false
bunx tsc --project tools/tool-remote-scripts/tsconfig.spec.json --noEmit --pretty false
```

Receipts: `/tmp/puni-health-contract-{lib,spec}-compiler-20261029.log`.
A fresh actual Nx project graph was generated before scoped lint. Initial lint
reported import ordering and the tool-to-app test import boundary. Ordering was
fixed; the single statically typed producer import has one test-only
`@nx/enforce-module-boundaries` exception with its actual producer integration
boundary explained adjacent to it. Root accepted this test-only exception; no
production file imports the app and no other lint exception was added. The fresh
Nx project graph does contain a static `tool-remote-scripts` → `wbs-be-01` edge
from this test import; traversal from the app found no return path to the tool.
Graph generation succeeded. This project dependency can affect Nx task selection;
receipt: `/tmp/puni-health-contract-graph-consequence-20261029.json`.
Scoped lint then passed:
`/tmp/puni-health-contract-lint-final-20261029.log`.

Prettier checked the six changed source/test files and two verification files;
`git diff --check` also passed. Receipt:
`/tmp/puni-health-contract-format-check-20261029.log`.
The owning OpenSpec change validated **one item, zero failed** with existing
long-requirement warnings:

```sh
bunx openspec validate cross-project-dependencies --json
```

Receipt: `/tmp/puni-health-contract-openspec-20261029.log`.

## Minimum affected modeled positives

The five selected cases run serially under the existing fixed-port ownership, original
300000/310000ms child/parent bounds and scratch cleanup hooks. They use corrected
three-field modeled backend responses, actual HTTP and the existing real
observers/coordinators. The raw process/container inputs remain modeled.

```sh
# From tools/tool-remote-scripts; substitute each exact name below.
bun test src/lib/dependency-product-process-model.test.ts -t '^<name>$' --preload ../test/scratch/preload.ts --timeout=310000
```

- `isolated readiness actual HTTP and full observer brackets: none`
- `isolated backend restart coordinator retains fences through durable ready`
- `isolated backend coordinator authority boundary: exact-prod`
- `isolated solver-first backend retains original authority through ready`
- `isolated readiness retained state barrier: post-evidence`

All five selected cases passed with zero failures; both inner and outer scratch
cleanup hooks returned:

| Case                    | Inner assertions | Outer assertions | Outer duration |
| ----------------------- | ---------------: | ---------------: | -------------: |
| Readiness               |              187 |                9 |         88.28s |
| Backend coordinator     |              228 |                9 |        136.40s |
| Exact production opener |              215 |                9 |        126.05s |
| Solver-first backend    |              245 |                9 |         72.75s |

Driver and exact commands: `/tmp/puni-health-contract-models-20261029.py` and
`/tmp/puni-health-contract-models-20261029.json`. Individual receipts use
`/tmp/puni-health-contract-{readiness,backend,opener,solver-backend}-positive-20261029.log`.
The exact fifth case covers the second changed modeled health response site at
`dependency-product-process-model.model.ts`'s retained-state fixture. Its receipt
is `/tmp/puni-health-contract-retained-post-evidence-20261029.log`.
All test/driver sessions joined with exit 0, and ports 3100/3200 were explicitly
released after the fifth case. Frozen source/test pins: `/tmp/puni-health-contract-final-source-pins-20261029.json`.

## Limits

This correction establishes producer/consumer contract compatibility and the two
new boot equality checks. Modeled readiness/coordinator observations do not prove
native Docker/image acceptance, installed processes, source startup, full
restoration, exposure, architectural adoption, CI for this patch or deployment.
No remote gate, full Nx gate, old campaign or backend producer change belongs to
this packet. Root retains Git integration and independent review authority.

The later [be344 CI policy correction](verify-ci-be344-policy-corrections.md) records the graph oracle’s exact static sole-test-import attribution and its actual extra-production-importer/implicit-edge refusals. The approved typed producer test remains unchanged.
