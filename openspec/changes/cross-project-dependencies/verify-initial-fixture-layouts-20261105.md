# Ordinary initial-handoff fixture layouts — 2026-11-05

The ordinary storage fixture relocates both canonical environments into owned
scratch directories. It supplied those layouts in its owner/request, while the
raw constructor independently decoded against the real host layout provider.
An unchanged healthy-prod case therefore refused at canonical-layout validation
before allocating Graph files. The production refusal is correct.

The test file now explicitly binds its layout provider after constructing every
fixture and before publishing the owner. It independently clones the completed
fixture layout pair; it never derives expected layouts from the request being
validated. Each affected callback retains its original body except that explicit
setup. Cleanup restores the original provider before removing scratch roots.
Production decoder, Graph, owner/exclusion, deadlines and private custody
admission remain unchanged.

Astra High reviewed the small test-only correction and rejected a production
canonical-decoder split: supplied publication JSON is not the retained original
owner capability, so agreement between two caller-supplied plans cannot
establish canonical authority.

## Observed checks

The prior unchanged healthy-prod RED retained the original canonical-layout
cause before Graph allocation. With the fixture binding, the same named case
passed: 1 pass, 0 fail, 173 assertions, 87.29 seconds, unchanged 180000ms limit.
Dev and prod+dev then passed in one process: 2 pass, 0 fail, 428 assertions,
282.20 seconds total. Their individual times were 117.98s and 164.16s,
respectively, under the unchanged 180000ms per-case limit. Scratch afterAll
returned. These three healthy cases are narrower than the whole 69-case file.

Three additional lightweight raw-boundary cases use the real provider and alter
only the supplied publication, only the activation request, or both coherently.
They require the intended exact refusal and zero file opens during only the
saved raw-constructor call. Subsequent explicit cleanup lies outside that
counter. Initial boundary/public-decoder/census execution passed 22 tests;
the refined assertions are reviewed. Two actual production-source omissions
were observed with exact source restoration after each:

- Removing only publication/activation owner-plan equality admitted a returned
  observation with four raw file opens. The test failed its joint expected
  refusal/zero-open oracle; the returned observation closed normally.
- Removing only public canonical-layout validation reached the later owner-plan
  refusal with zero opens. The test failed the exact intended canonical-boundary
  message. This is ordering/refusal evidence, not an unsafe-admission claim.

Neither negative produced UNKNOWN cleanup. Omitting only `provider.mockRestore`
then failed the actual healthy-prod afterEach provider-identity assertion:
0 pass, 1 fail, 174 assertions, 56.62s. Scratch cleanup returned, and the test
source was restored exactly. The new adjacent Proof comment is the only byte
difference between that restored epoch and the final helper before the shared
terminal run.

After all three independent faults were restored, one shared process passed
23 tests, 0 failures, 226 assertions in 103.79s across four files: the actual
healthy-prod consumer, three raw-boundary negatives, 17 public-decoder cases
and two custody-census cases. It filtered the other 68 storage cases; this is
not whole-file qualification. Scratch cleanup returned in 1ms.

The first configured typecheck then exposed widened fixture literal types at
the raw test call. A test-only cast at the saved constructor boundary documents
that deliberately malformed request; it performs no pre-decoding or runtime
conversion. After this erased change, the three cheap files passed 22 tests,
0 failures, 52 assertions in 247ms. No repeated heavy run is inferred for this
runtime-erased cast. Configured forced uncached `tool-remote-scripts:typecheck`
and `tool-remote-scripts:lint` then passed; lint printed only the existing
NO_COLOR/FORCE_COLOR warning.

An independent one-off TypeScript AST comparison removed exactly twelve
reviewed direct binding calls and two leading cleanup statements, then recovered
all original callback, cleanup and four-route owner-loop hashes. All 42 original
syntactic callbacks and their assertions remain. The permanent census adopts
new dated hashes that include the legitimate fixture setup; its earlier
extraction proof retains its historical source epoch.

## Commands and retained evidence

All test commands used Bun 1.4.4, `TZ=UTC`, the owned scratch TMPDIR below,
`--no-env-file`, the empty `/tmp/puni-initial-empty-bunfig.toml`, and the existing
outer scratch preload. The actual shared-process invocation was:

```bash
TZ=UTC TMPDIR=/home/df/.codex/worktrees/cde5/puni-00/tmp/puni-delivery-evidence/20261105/initial-fixture-layouts/scratch PATH=/home/df/.bun/bin:/home/df/.volta/tools/image/node/24.20.0/bin:$PATH /home/df/.bun/bin/bun --no-env-file --config=/tmp/puni-initial-empty-bunfig.toml test --preload ./tools/test/scratch/preload.ts ./tools/tool-remote-scripts/src/lib/dependency-activation-storage.test.ts ./tools/tool-remote-scripts/src/lib/dependency-initial-layout-boundary.test.ts ./tools/tool-remote-scripts/src/lib/dependency-complete-activation.test.ts ./tools/tool-remote-scripts/src/lib/dependency-owner-custody-routing.test.ts --test-name-pattern='^initial handoff prod retains genuine bounded original evidence$|^raw initial boundary|^ordinary storage callbacks|^native custody acceptance|^decodes detached|^refuses |^public request refusal' --timeout=180000
```

The post-cast command used only the last three files, the same flags/environment
and no selection regex. The preservation script ran with
`bun --no-env-file --config=/tmp/puni-initial-empty-bunfig.toml run tmp/puni-delivery-evidence/20261105/initial-fixture-layouts/preserve-original-callbacks.ts`.
Configured checks used the actual Nx `tool-remote-scripts:typecheck` and `:lint`
targets with `--skip-nx-cache`, `NX_DAEMON=false`, `NX_ISOLATE_PLUGINS=false`,
and owned `NX_WORKSPACE_DATA_DIRECTORY`/`NX_CACHE_DIRECTORY`. Typecheck's
configured command includes `tsc --build --force`; lint included the configured
ordinary, explicit acceptance, Caddy and CI-test source trees without executing
the private acceptance helper.

Local evidence directory: `tmp/puni-delivery-evidence/20261105/initial-fixture-layouts/`.
The first attempted Bun filename mistakenly appended its version and exited
127; the real executable/version was verified before any test run.

| Artifact                         | SHA256                                                           |
| -------------------------------- | ---------------------------------------------------------------- |
| preservation script              | cea1c768eb8d51e418545b5b71f9005e9ea524134f67a24a1b4bda31c6ca0226 |
| callback-preservation.log        | 26ce35d5310eb4d5a2aa493d707951b4c6b0eb36e326ad86a093af95b24d154f |
| guard-faults.json                | 568852ed1ff19116b3873a9b011ca9e6459bd93012831095cd1c45987e0f9eec |
| provider-restoration-fault.json  | cb10b54b7d6a280a0edc723aa6be7e05bb27c325d1f13ab813f31354a897bd51 |
| restored-shared-terminal.log     | 18bd573e53e7b870e0f11ac9baa30a77b8c4ce07b540e290ed0697b1254c088c |
| typed-boundary-public-census.log | 6542f86dfd2312130236858d21677488d42dcc13767b0da934c03f5f3f68c275 |

Final test source SHA256: storage `02d32b92f0b8caf8490a4af1b8b14f7850236bcb217968162d8c915e1e2dabd9`,
boundary `468adb815d4552ee9a2f3fb2d425d0c3cbef7ec6ae2f3e282da51dc3ad901109`,
census `713f255b552f76769fc943a17bd861ef7fcc7209f2a13d42f29f1c6a9c83e245`.
Production Graph `bdf3da709f70238e073fcc7db1f51870e855959477048645c1fcd46bb3b042ef`
and public decoder `6911c1e8b8d52536ee12406b6c2e0a0787e0276efc223b450dbcc88ba0c58286`
remain byte-identical to the published base. Astra High's final source/evidence
review found no Critical or Important issue. Local review report:
`/tmp/puni-initial-fixture-astra-review-20261105.md`.

## Qualification limits

This is ordinary test-environment repair, not a new private native acceptance
protocol or architectural adoption. The full storage file, current CI, and an
exact-SHA h2 gate still require their own results. No skip, timeout increase,
private pin refresh, fabricated before-image, main merge or deployment follows.

The previous canonical h2 request at 86295471 printed that exact running SHA,
then exited 1 during its OpenSpec pipeline before jq/Nx. Its 294760-byte log
(SHA256 3d76a80948665bb94dcafd12f9d69ee1f8766a27010fcc23f6d8a847d506aa89)
ends inside JSON. The visible 304 valid records do not prove the complete
validation result; neither pipeline member's individual status was retained.
This failure remains unresolved and is not test qualification.
