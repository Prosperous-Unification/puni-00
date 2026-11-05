# Ordinary image builder — source and SDK checkpoint

The [build decisions](ordinary-image-build-design-20261105.md) implement the next
real image layer above PR868. The actual controller, coupled enrollment and
finite ordinary HOLD qualification remain required and unimplemented. The
current output contract is built-unqualified and never grants execution.

## First source review epoch

Initial fixed builder source: fixture
`b46e9888f6807564d91f1031ac6420b956c448d78108e6bc456b108de7fbbaec`,
owner test `4c7f914c888472c5a477ddbd535b3adacb43acd55c53b358468b63fa5c2ac11d`,
mode0664. Historical first95701fixture bytes remain SHA256
`50281b36a01665b83062e7bb7d065361037182581fb791a89e1b049d65cf4b04`.
Pure source-pin/resolver/plan tests passed3/0/101; no actual ordinary builder
compile or output import occurred. Initial static checks passed. Source review
requires four bounded fixes before that first compile: unexpected-return
retirement, untracked filesystem import, frontend/migration root substitutions,
and concrete compiler/issuer/config/port provenance. Existing runtime-tap and
closure limitations remain explicit; no fake preparer success is accepted.

## Separately approved inert SDK probe

Astra approved one isolated probe with sibling inert entry/source directories,
fixed virtual-port resolver and external inert scanner placeholder. The probe
imports no production input and never imports/evaluates its emitted output.
Source SHA256 `fd237c20495614385de13964a817d205da384b21ded75b2dcb2d49ca85f843ad`.
Original PID/PGID1812619 exited0/no signal/both streamsEOF/empty stderr; receipt
SHA256 `f1f8bc7ea93f8dd519281a8fbb2e4666a7f387e4edf3b0a3e3e1cb6629934b16`.
All9actual setup/compiler original Promises and their separately retained
observers settled/joined. It produced one1125-byte entry artifact in memory;
Bun1.4.4 returned a genuine object metafile. This is SDK-boundary evidence,
not qualification of the ordinary production-source image.

Actual raw facts:

- Filesystem input labels are not BuildConfig.root-relative. The controlled
  launcher's cwd supplies provenance for their cwd-relative spellings; the raw
  probe receipt/payload itself did not record cwd. The corrected builder must
  capture/check its own compiler cwd and use it with no fallback.
- A virtual input key has namespace:id form. Virtual-to-absolute callbacks
  arrive in file namespace with the bare port ID as importer and resolveDir `.`.
- The actual external absolute edges appear in inputs[*].imports; output imports
  were empty. Scanner checks must inspect observed input external edges.
- The entry artifact path was relative `_.._/entry/entry.js`; owned output writing
  must not interpret compiler labels as authority over arbitrary destinations.

Independent probe review SHA256 `654b4ad20831059c7dbd94564403c05f468245b257b40c11e3117c2ce1296f6f`.
No first-image compile is attributed to this probe. Corrected source/entry review
remains required before that separate finite build-only command.

## Portable raw inert probe observation

```json
{
  "root": "/tmp/puni-inert-sdk-probe-Aroixp",
  "sourceRoot": "/tmp/puni-inert-sdk-probe-Aroixp/source",
  "entryPath": "/tmp/puni-inert-sdk-probe-Aroixp/entry/entry.ts",
  "version": "1.4.4",
  "success": true,
  "events": [
    {
      "event": "resolve",
      "path": "/tmp/puni-inert-sdk-probe-Aroixp/entry/entry.ts",
      "importer": "",
      "namespace": "file",
      "resolveDir": ".",
      "kind": "entry-point-build"
    },
    {
      "event": "resolve",
      "path": "../source/relative.ts",
      "importer": "/tmp/puni-inert-sdk-probe-Aroixp/entry/entry.ts",
      "namespace": "file",
      "resolveDir": "/tmp/puni-inert-sdk-probe-Aroixp/entry",
      "kind": "import-statement"
    },
    {
      "event": "resolve",
      "path": "ordinary-probe:port",
      "importer": "/tmp/puni-inert-sdk-probe-Aroixp/entry/entry.ts",
      "namespace": "file",
      "resolveDir": "/tmp/puni-inert-sdk-probe-Aroixp/entry",
      "kind": "import-statement"
    },
    {
      "event": "resolve",
      "path": "../source/external.ts",
      "importer": "/tmp/puni-inert-sdk-probe-Aroixp/entry/entry.ts",
      "namespace": "file",
      "resolveDir": "/tmp/puni-inert-sdk-probe-Aroixp/entry",
      "kind": "import-statement"
    },
    {
      "event": "load",
      "path": "port",
      "namespace": "ordinary-probe"
    },
    {
      "event": "resolve",
      "path": "./module.ts",
      "importer": "/tmp/puni-inert-sdk-probe-Aroixp/source/relative.ts",
      "namespace": "file",
      "resolveDir": "/tmp/puni-inert-sdk-probe-Aroixp/source",
      "kind": "import-statement"
    },
    {
      "event": "resolve",
      "path": "/tmp/puni-inert-sdk-probe-Aroixp/source/module.ts",
      "importer": "port",
      "namespace": "file",
      "resolveDir": ".",
      "kind": "import-statement"
    },
    {
      "event": "resolve",
      "path": "/tmp/puni-inert-sdk-probe-Aroixp/source/external.ts",
      "importer": "port",
      "namespace": "file",
      "resolveDir": ".",
      "kind": "import-statement"
    }
  ],
  "metadataPresent": true,
  "metadataType": "object",
  "metafile": {
    "inputs": {
      "../../../../../../tmp/puni-inert-sdk-probe-Aroixp/entry/entry.ts": {
        "bytes": 150,
        "imports": [
          {
            "path": "../../../../../../tmp/puni-inert-sdk-probe-Aroixp/source/relative.ts",
            "kind": "import-statement",
            "original": "../source/relative.ts"
          },
          {
            "path": "ordinary-probe:port",
            "kind": "import-statement"
          },
          {
            "path": "/tmp/puni-inert-sdk-probe-Aroixp/source/external.ts",
            "kind": "import-statement",
            "original": "../source/external.ts",
            "external": true
          }
        ],
        "format": "esm"
      },
      "../../../../../../tmp/puni-inert-sdk-probe-Aroixp/source/relative.ts": {
        "bytes": 42,
        "imports": [
          {
            "path": "../../../../../../tmp/puni-inert-sdk-probe-Aroixp/source/module.ts",
            "kind": "import-statement",
            "original": "./module.ts"
          }
        ],
        "format": "esm"
      },
      "ordinary-probe:port": {
        "bytes": 161,
        "imports": [
          {
            "path": "../../../../../../tmp/puni-inert-sdk-probe-Aroixp/source/module.ts",
            "kind": "import-statement",
            "original": "/tmp/puni-inert-sdk-probe-Aroixp/source/module.ts"
          },
          {
            "path": "/tmp/puni-inert-sdk-probe-Aroixp/source/external.ts",
            "kind": "import-statement",
            "external": true
          }
        ],
        "format": "esm"
      },
      "../../../../../../tmp/puni-inert-sdk-probe-Aroixp/source/module.ts": {
        "bytes": 29,
        "imports": [],
        "format": "esm"
      }
    },
    "outputs": {
      "_.._/entry/entry.js": {
        "bytes": 1125,
        "inputs": {
          "../../../../../../tmp/puni-inert-sdk-probe-Aroixp/source/module.ts": {
            "bytesInOutput": 20
          },
          "../../../../../../tmp/puni-inert-sdk-probe-Aroixp/source/relative.ts": {
            "bytesInOutput": 91
          },
          "ordinary-probe:port": {
            "bytesInOutput": 192
          },
          "../../../../../../tmp/puni-inert-sdk-probe-Aroixp/entry/entry.ts": {
            "bytesInOutput": 82
          }
        },
        "imports": [],
        "exports": ["external", "relative", "virtual"],
        "entryPoint": "../../../../../../tmp/puni-inert-sdk-probe-Aroixp/entry/entry.ts"
      }
    }
  },
  "outputs": [
    {
      "path": "_.._/entry/entry.js",
      "kind": "entry-point",
      "size": 1125
    }
  ],
  "logs": [],
  "operations": [
    {
      "label": "root",
      "outcome": "fulfilled",
      "originalRetained": true,
      "observerRetained": true
    },
    {
      "label": "source-directory",
      "outcome": "fulfilled",
      "originalRetained": true,
      "observerRetained": true
    },
    {
      "label": "entry-directory",
      "outcome": "fulfilled",
      "originalRetained": true,
      "observerRetained": true
    },
    {
      "label": "module-source",
      "outcome": "fulfilled",
      "originalRetained": true,
      "observerRetained": true
    },
    {
      "label": "relative-source",
      "outcome": "fulfilled",
      "originalRetained": true,
      "observerRetained": true
    },
    {
      "label": "external-source",
      "outcome": "fulfilled",
      "originalRetained": true,
      "observerRetained": true
    },
    {
      "label": "entry-source",
      "outcome": "fulfilled",
      "originalRetained": true,
      "observerRetained": true
    },
    {
      "label": "config-source",
      "outcome": "fulfilled",
      "originalRetained": true,
      "observerRetained": true
    },
    {
      "label": "compiler",
      "outcome": "fulfilled",
      "originalRetained": true,
      "observerRetained": true
    }
  ],
  "emittedOutputImported": false
}
```

## First actual production-source build: failed, fully joined

After the bounded source corrections, fixture SHA256
`7f440806dc61409500447786c3ba77250c9351d481ccb1cb7ece4780700dcd62`
and owning test SHA256
`3e17503525435d04711b44b3c8ff22adf6f9481f4595e8d469451f3a3089e223`
were frozen. Independent source review SHA256
`805bc8ff52ec685f9b6ec44d4fe73b95168ae5423651f930126c45c4722dd93d`
authorized one build-only invocation. The exact driver SHA256 was
`a07d7e237936adc00aea82df33d07332d780ec664ebd318f14b289d7c7ca0b75`.

The actual command used Bun1.4.4, an explicit empty Bun configuration, no env
file and the frozen 16-source epoch. Original PID/PGID1839650 exited1 with no
signal and both streams at EOF. All41 started setup/compiler operations and
their original Promises and observers were joined. The compiler itself fulfilled
with `success:false`, three `ordinary HOLD classifier alias differs` errors,
no outputs and no metafile. The wrapper rejected with
`ordinary HOLD compiler output differs`. No emitted output was imported or run.
This is a genuine compiler failure, not an injected R5 proof or a successful
image qualification.

Private immutable captures remain under
`/tmp/puni-ordinary-image-first-build-20261105`. Receipt SHA256
`3f4385939b3392fc69298790a27eda5b60b3eaa3039583ffcfbd0db0b9455a7a`;
failure capture SHA256
`be2f7e9b2194602ce396f3e4ee5901418488a8e15a2bdd8294ea4ce516d759b5`.

Source inspection found the overly broad specialist resolver rejected the
legitimate `migrate`, `migration-set` and `cross-project-dependency-activation`
aliases before the pinned tsconfig resolver could handle them. The captured
compiler messages omit source positions, so attribution to those imports comes
from source inspection rather than per-message locations. The accepted routing
contract special-cases only the three exact classifier aliases; other aliases
are delegated to normal pinned resolution. Near aliases also delegate and never
canonicalize to the classifier. Unknown fixed virtual ports still refuse.

The separate correction review SHA256
`9d82997c01f8f21dbc3e13ee45ce783a971fc3a1983501ee43b0d5806c846e51`
authorized a narrow source/test correction only. This draft checkpoint includes
that correction and a mechanical callback rename. A second actual compiler
invocation, successful ordinary image, runtime controller, coupled enrollment,
native custody, full gate, main adoption and deploy remain unverified.

## Alias correction source checkpoint

Final fixture SHA256
`f8d59caff696e28b7039ed0b3826f6a6c4c30b79a8faaa61a020c01c505f6d69`
(170003 bytes, mode0664); owner test SHA256
`81617b96671d65495c8b0c3c927deef45dfe9fbba81117d61030d00791dae418`
(79514 bytes, mode0664). The historical first95701 fixture bytes retain
SHA256 `50281b36a01665b83062e7bb7d065361037182581fb791a89e1b049d65cf4b04`.

The two selected resolver consumers failed on the unchanged blanket alias
refusal (exit1), then passed after the two-line guard removal (2passed,
0failed,16assertions,exit0). The final six pure builder tests passed
6/0/130 with89filtered. These are source-level TDD observations, not physical
necessity proofs for every new safety check. Configured TypeScript, populated
Nx-graph ESLint, Prettier and diff-check returned0 on the frozen correction.
No second ordinary compiler invocation ran. Runtime and native qualification
remain open.

Root then ran the complete owning file on exactly those frozen source hashes:

```sh
bun test --no-env-file --config=/tmp/puni-initial-empty-bunfig.toml \
  --preload ./tools/test/scratch/preload.ts \
  tools/tool-remote-scripts/src/lib/edge-ownership.test.ts --timeout=10000
```

Fresh output: **95passed,0failed,546assertions**,95tests/1file,3.74s,
exit0. Scratch cleanup returned and both source hashes remained exact. This
command exercises the owning file, not the full runtime/storage/HOLD suite.

Independent final draft-publication review SHA256
`3207fd6c321d457f555bfd34b4d58758957cf95137dec24b7bbf470f78f92ded`
accepted the exact bounded correction. In-memory reversal reconstructed both
previously reviewed source hashes. No automatic builder calls or storage/complete
enrollment were found. Root's subsequently completed95-test run above fulfills
the review's pending whole-owner regression. All334OpenSpec entries validate;
current document/index checks pass. Publication does not grant a second build,
image execution, main merge or deployment.

## Second actual build: compiled, still unqualified

The corrected f8d59caf/81617b96 source was committed as
`ffa15caaf22d31275fea73872180055f0de61c6f` and freshly published in draft PR870.
A new private directory preserved the failed first run unchanged. Its driver
SHA256 `fee60b74685209cf7f3f51466f5b3be3efce6641969ae113e4ca183183475c3b`
differs from the first only in the evidence directory and expected issuer hash.
Expected manifest SHA256
`376466a288034bfdeaaea994fec2bbd734ca466dbe558f005474410cb7a9a273`;
launcher SHA256
`ef6168d9c835e0342412eb0544559ceb53f78cc1c5a913c509a92e4d45c09b41`.
After independent review Root ran exactly once:

```sh
python3 /tmp/puni-ordinary-image-second-build-20261105/launch.py
```

Actual PID/PGID1861410 exited0, no signal, stdout/stderr EOF, empty stderr.
Pre/post source,16pinned inputs, configuration, compiler and driver matched.
The actual compiler succeeded with no logs. All44setup operations fulfilled
and their original Promises and separately retained observers were joined.
The resulting one entry artifact is1110085bytes, SHA256
`f4da563ee35593043e597ddcbe53e85594b7060beb4cce8cf5bfabf45f6ce2da`.
The566665-byte metadata file has SHA256
`a48737bceaba4206d035f9a7c70acfc705196e76e9dde8210965a1c64fb7491b`.
Actual metadata contains275inputs:19fixed virtual ports and256filesystem
inputs, including15fixed bundled modules and four unchanged scanner external
edges. No generated output was imported or executed.

Retained receipt SHA256
`477aa7e6050e7ad63197087e5bf21fe09f1c51171d121ca1250ce8c13a2630eb`;
success capture SHA256
`c5305172881c36da1f72a7c2ba2e42510c5bb0f1c43195c7f3cb1f659be16b71`;
raw compiler metafile SHA256
`6cf42f0b87d360aa538062ac8c197802d1bc7c4552d57057c40acf9de0404727`.
Independent review accepts compilation with status `built-unqualified` only.

A separate post-build read-only closure observation (SHA256
`3b86b3a0cdac68cd266c2bdc56d78b065d1c7efc5bd0d08ae62f6a5941cd1bc6`)
is not a pre-build immutable admission. The13raw source-size differences are
transformed modules. Input external flags also include unused Drizzle imports;
output imports are empty and do not prove runtime closure. A reviewed complete
source/actual emitted import closure remains required before image execution.
All six explicit missing capabilities remain: owner observer/keeper taps,
complete body/projection/acceptance taps, setup write/migration/child-reader taps,
transitive closure, scanner serialization equivalence and actual native custody
with finite HOLD retirement. No full UC2, host gate, main or deployment follows.

Independent actual-build review SHA256
`a835368ec2a217d101c2effdda43261b7382ed67ea6fc69872a27befe77aec9c`
matched the original process receipt, complete bytes,44joined operations,
275inputs and unchanged source. It accepts compiler-only qualification.
The next fixed-ledger/owner-tap source decision is SHA256
`f0597e25de749a5acf4d75fda8c868108b83de07c3ce0f2ffbc5f8a1bfb31a37`.
It authorizes only the existing fixture/owner-test implementation and inert
generated-ledger consumers, preserving all actual runtime prerequisites.
