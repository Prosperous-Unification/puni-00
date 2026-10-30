# Pure source frontend HTTP inspectors — Slice 1

This source checkpoint implements only the two pure response inspectors authorized
by the reviewed frontend contract and independent sequencing amendment. Original
manifest profile selection, captureRestart/SourceDevRestartInputs, shared
restoration fixtures, source collector/context/coordinator integration and full
six-response readiness remain deferred. Parent10.2 is incomplete.

## Contract and representation

`source-frontend-http.ts` recognizes one complete reviewed transported-text
profile. The document requires 200 and text/html; the entry requires 200 and
text/javascript. MIME matching preserves the existing health-inspector convention
of case-insensitive types with optional parameters. Complete UTF-8 text hashes are:

| Representation                     | UTF-8 bytes | SHA256                                                           |
| ---------------------------------- | ----------: | ---------------------------------------------------------------- |
| HTML                               |        2539 | 09ab3b528f1a147d34addea248fa08925801d66ee9f384bb634112b9abc30e2f |
| JS including complete trailing map |        1582 | e990c7ae6b545d4177b27560878bd41d34843b32109a21af190794d73e45ee08 |

The complete document includes its Vite client insertion and theme bootstrap.
The complete entry binds executable code and its map together; matching original
sourcesContent alone is insufficient. Expected digests are internal constants;
no caller supplies expected hashes, bodies, normalization or a baseline. No
returned JavaScript is evaluated and no HTML/JS parser framework is introduced.
These inspectors grant no readiness/start/profile authority.

The existing participant HTTP transport fatally decodes UTF-8 and may remove a
leading BOM. These are COMPLETE TRANSPORTED TEXT digests of that returned string's
UTF-8 encoding, not universal original-wire byte claims. The reviewed outputs have
no BOM; their raw and transported digests coincide. A focused actual HTTP test
observes the existing BOM removal and keeps that API boundary explicit.

## Genuine actual producer RED and GREEN

Worktree base was b297c2275cb860fa8f4ae13891418fa56cbb7660. The test-only helper
checks the eighteen reviewed size/SHA tuples before and after capture. These are
producer-selection inputs, not the complete installed producer closure and not
original source-input capture authority. The branch binding is private receipt
`/tmp/puni-source-frontend-slice1-root-binding-20261029.json`, SHA256
`c1bb9b05fa4b9210ec3da9cf1004e706ff850e5a2932dd8afaadd0fcf221f771`.

The snapshot enumerates only HEAD Git blobs in the same curated frontend/domain/UI
source roots and root package/config paths as the reviewed research. It preserves
the repository layout and actual index/main/Vite configuration bytes; every
basename beginning .env is excluded. Ignored/private environment files are never
enumerated or copied. Its only .env contains fake unused BE/GW targets at loopback
port9. A private node_modules directory links installed non-dot package entries,
keeping Vite's config temp/cache writes in owned scratch. Actual envDir/cwd are
scratch; only the documented small development/public-dev environment is supplied.
No dependency install/build or transform hook occurs.

Actual Vite uses its default loader and original plugins. The helper checks resolved
127.0.0.1/port0 before listen and numeric ephemeral IPv4 afterward, excluding the
four fixed role ports. Each actual capture audits exactly two GETs, `/` followed
by `/src/main.tsx`, using identity encoding/connection close and no proxy agent,
Accept or conditional-cache headers. Each request has its existing 15-second probe
bound and 256KiB cap. No browser/API/upstream request occurs.

The successful RED first captured both exact responses and joined original Node
child/stdout/stderr, request/response closes, Vite server and explicit watcher
close (closed true, zero watched directories). Only then the owning test dynamically
imported the absent inspector and failed at missing module. Original terminal
session 81351 joined at exit1 (chunk 949d89),1.74s. This is producer-before-consumer
RED; it is not a collection error before producer setup.

After minimal implementation, the actual producer positive plus modeled HTTP
negatives passed:6 tests/45 assertions. Final formatted source, including the
separate executable-only/map-only cases, passed7 tests/44 assertions in 1.58s.
Original final session 33035 joined exit0 (chunk 7907d2). Each capture's own Node
process and both captured streams finish synchronously under the documented Bun
spawnSync API before consumption; child success and the original HTTP/server/
watcher receipts are required. The 90-second producer timeout is a finite fixture
ceiling; a failed or uncertain capture retains scratch and throws, never handing
unknown custody to a consumer. Successful captures remove owned scratch only
after consumption; private evidence copies retain the public source snapshot,
program, original observations and logs.

A preliminary setup run failed before Vite because the first fixture incorrectly
compared optional SyncSubprocess.signalCode to null. A read-only Git receipt and
installed Bun type/docs confirmed successful synchronous children omit that
property. The fixture was corrected to the documented success/optional-signal
contract. That run grants no producer RED credit; its empty snapshot remains
retained at the named private receipt path. No original Vite request or listener
started in that preliminary run.

## Ordinary negatives and four finite new guard proofs

Captured strings are immutable additional unit fixtures, not another producer run.
Negative bodies served by owned ephemeral loopback fixtures are labeled modeled
responses over the actual participant HTTP reader. Their requests and servers are
joined. Ordinary negatives cover injected scripts/extra root/wrong module target,
prefix/suffix, swapped document/entry, error/fallback document, unsupported MIME,
status/error response, executable change with original map, map/sourcesContent
change with original executable prefix, and appended suffix. No old transport or
native mutation campaign is replayed.

Four independent new guard omissions were observed at intended pure consumers;
each exact saved byte sequence was restored before the same consumer passed:

| Omitted guard              | Observed intended negative                                                 | Restored |
| -------------------------- | -------------------------------------------------------------------------- | -------- |
| Complete document equality | injected-script modeled HTTP response missed rejection                     | pass     |
| Complete entry equality    | both executable-only and map-only consumers independently missed rejection | pass     |
| Status equality only       | exact document with500 missed rejection after MIME negatives passed        | pass     |
| MIME predicate only        | exact document with entry MIME over actual HTTP missed rejection           | pass     |

The private proof program returned exit0 only after each omission returned 1 and
each restored replay returned 0. Adjacent production Proof comments name those
observations. These prove complete-text/envelope dependencies, not JavaScript
semantic validation. Existing transport JSON/UTF8/status/size/encoding/cancellation
proof ownership is unchanged.

## Focused checks and limits

Exact owning command:

```sh
bun test tools/tool-remote-scripts/src/lib/source-frontend-http.test.ts --preload ./tools/test/scratch/preload.ts --timeout=10000
```

The actual producer case has its own fixed 130000 ms outer test budget around the
existing 90-second producer and request/cleanup envelope; no existing test or
production deadline changed. Final 7/44 output is in final-tests.log. Owning library
and spec compiler `bunx tsc --build --force tools/tool-remote-scripts/tsconfig.json`
exited 0 (original 49829/e700da); explicit five-file ESLint with NX_DAEMON=false
exited 0 (original 49425/67e36a). Final format/OpenSpec/diff and source pins are
recorded in the private frozen packet. Initial scoped lint found test-only indexed
lookup/async assertion typing mistakes; these were corrected without relaxing
checks or changing production predicates.

There are no existing production-file edits. Only appendices are added to the
existing delta spec/tasks; their original prefixes are byte-preserved. No source
collector, context, capture, resolver, profile selector, shared restoration fixture,
barrel, package, runtime config or controller changed.

Local Node 24.20 actual captures use distinct owned scratch/cache directories;
they do not establish source-image Node 24.18.1 or general native cache/path/config variance, package archive integrity, browser bootstrap,
transitive stylesheet/module execution, native topology or upstream behavior.
The source's eighteen selected tuples are not a full producer closure attestation.
Any legitimately different complete output remains unsupported; no oracle was
repinned. No full model/native/installed/performance/parity/host gate/deployment
campaign ran. No integration, main adoption, full readiness or full-goal completion
is claimed; Root retains Git and later integration after Node checkpoint acceptance.

Private evidence packet: `/tmp/puni-source-frontend-http-slice1-20261029/`.
Raw captures are red-producer/capture, green/capture and final/capture. The
preliminary failure, real RED, real GREEN, final ordinary suite and four omission/
restoration pairs remain distinct. Source/capture manifests and raw original logs
are retained for independent review; all own original sessions are joined before
source custody handoff.

Selected exact private log SHA256 receipts:

- `actual-red.log`: `cb8f64d30ad068402b611a065df20303575d59c7f6a658361b48ad01b112a519`.
- `actual-producer-red.log`: `5cbeb36e914644f82916f31d143e2b6be7591fc86006f18f5e5073d97bd04282`.
- `actual-green.log`: `bd54a902333f51e9e93c4b352bc4e1116ed9eeeebed342cf71a93537ef19b6ff`.
- `final-tests.log`: `e19dc7af546540eba2b17bb635bde7cbb994564865d5021cf0793ba01984deb5`.
- `proofs.log`: `c371bb789bb028796040448f10e05875f8bc680dbb980a5393e4e599557a4746`.
- `types.log`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- `lint.log`: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.

OpenSpec validation `bunx openspec validate cross-project-dependencies --json`
returned valid:true and exit 0 (original48774/f08cac), with existing long-requirement
warnings outside the appended pure-inspector requirement. Existing delta-spec and
tasks prefixes were byte-compared with their saved originals and remain identical.
Final format and whitespace checks and exact source/artifact pins are recorded in
the private frozen handoff; no normal Git hooks or integration were run by this
source owner.

## Final review and private integration

Independent final review passed with report SHA256
`c580dbb80f1e6b1511d06439b9892bdc9cde586364e8d0bc1d593f8ba51bb441`
at the frozen eight-path source. Root checkpointed that exact source as
`5dc0c0156505d378008a13671818e4e41b496bcf` using normal hooks.

After the Node collector checkpoint and its private combined verification were
accepted, Root combined this slice with
`c01dc1d4ff12fb17a3c3c689c34b5612b9f09c37`. Both documentation conflicts
were resolved by retaining both complete reviewed appendices; all five frontend
TypeScript bodies and the Node runtime/archive bytes remain exact. The combined
ordinary suite passed7/44 with a fresh actual Vite producer. Both owning TypeScript
compilers and OpenSpec309/309 passed. Original runtime/stream ownership joined.
Those checks preceded only this factual documentation note; their staged tree was
`528800fd213ffd747066e99c12aebdde5261ab1c`. Original manifest profile capture, source
readiness/start, controller/policy/exposure, native/browser acceptance, parent10.2,
MAIN adoption and deployment remain open.
