# Gate fixture temporary-root corrections

Base: `0a1376b46440700e9835046be76d59c6273df5f2`. These bounded test-fixture
repairs address concrete failures from the old exact-10e5 h2 gate. That run exited1
normally after126m49;187 tasks succeeded and backend/remote tests failed. The
backend working-directory defect was already fixed in D9. Remote collection had
3088 pass,2 skip,268 fail; these repairs do not claim all268 are resolved.
Parent11.2, the new exact-SHA gate and full feature remain open.

## Mock transport fixture paths

H2 deliberately uses TMPDIR=/var/tmp. The mock transport helper required `/tmp/`
while its actual native-shape fixture used the shared scratch allocator. The old
run recorded51 `fixture root must contain UUID` errors. The helper now explicitly
permits descendants of `/tmp/` and `/var/tmp/`, retaining the UUID, runtime-under-root,
complete census, physical identities, startup and ownership checks.

The real disposable host acceptance entry still requires canonical `/tmp`.
Two existing negative tests intended to reach image-pin/receipt checks previously
stopped at that earlier root precondition. They now run in isolated children with
TMPDIR/BUN_TMPDIR=/tmp, exact original bad inputs and expected refusal messages.
An absolute Bun executable is used; a recording failing Docker stub is first on
PATH and selected with Bun.which. Each test requires zero stub calls. The third
production-temp-root refusal remains unchanged. No real Docker was invoked.

```sh
bun test --preload ./tools/test/scratch/preload.ts \
  tools/tool-remote-scripts/test/source-exclusion-transport.test.ts \
  tools/tool-remote-scripts/test/source-exclusion-topology.test.ts \
  tools/tool-remote-scripts/test/source-exclusion-native.test.ts --timeout=10000
```

Separate child environments used fresh owned temporary directories under each
parent. Both `/tmp` and `/var/tmp` runs passed **81 tests,183 assertions**,0 failures.
All51 native-named cases use mocked Docker inspection shapes; they are not native
host acceptance. Independent Astra replay of the transport file passed
**27 tests,72 assertions**.

Watched faults in a separate copy:

- Removing only the allowed-parent predicate admitted an outside `/home` UUID root;
  the unchanged constructor-negative test failed before any Docker callback. Restoring
  source passed9 tests/22 assertions.
- Restoring the old `/tmp`-only predicate made the real `/var/tmp` mock fixture fail
  again at the root check.
- Removing the Docker stub directory from the child PATH failed stub selection before
  the acceptance runner, with no real Docker command.

Packet and exact logs: `/tmp/puni-source-temp-root-frozen-packet.json`.
Independent review: `/tmp/puni-source-temp-root-source-review.md`. Types,
graph-backed lint, formatting and diff checks passed; real acceptance, scratch
allocator, ownership class and package/lock files remain unchanged.

## Synthetic factory ownership setup

A named factory case's h2 stderr showed `FixtureOwnership` rejecting its root.
The factory test allocated that root with tmpdir(), so `/var/tmp` conflicted with
its deliberately unchanged `/tmp` ownership model. A small test-only
`allocateFactoryRoot` now creates `/tmp/edge-init-factory-*`, and observe() uses it.
Reversing only the import/call reconstructs the original factory test byte-for-byte.
Existing TLS setup, worker, environment, assertions, deadlines and cleanup remain
unchanged. The ownership class and its descriptor/native boundaries are unchanged.

```sh
bun test tools/tool-remote-scripts/src/lib/edge-init-factory-root.test.ts \
  tools/tool-remote-scripts/src/lib/edge-init-owner.test.ts
```

The ordinary regression imports only the allocator and inert ownership class. Its
parent and `/var/tmp` child each create, validate and remove their own fixture root.
Final author run: **3 tests,18 Bun assertions**,0 failures. Independent Astra replay:
**3 tests,18 assertions**,0 failures. The node:assert invariants are additional to
Bun's expect counter.

In an independent source-only copy, restoring just the old tmpdir-dependent allocator
made the `/var/tmp` child reach the unchanged constructor and fail:1 pass/1 fail.
The parent control passed. Restoring exact helper bytes passed2 tests. Ordinary
owned `/var/tmp` allocation used sandbox escalation; no privilege, native worker,
namespace operation, credential or OpenSSL invocation occurred.

The original factory suite was deliberately not run locally: its beforeAll starts
OpenSSL even for a filtered invocation. CI/canonical gate must verify its full
behavior. This is a reproduced setup defect, not certification of every historical
factory failure. Receipt: `/tmp/puni-factory-root-verification.md`; independent
review: `/tmp/puni-factory-root-independent-review-0a137.md`. Source pins and exact
mutation are retained by those receipts. Project spec types, graph-backed lint,
formatting and diff checks passed.

## Remaining verification

The modeled-process child deadline and separate observation deadline tests remain
separately scoped. No timeout, production scope equality, ownership, real native
acceptance, schema or architecture was changed by this packet. The integrated
exact-SHA CI/host gate remains required. PR630 stays draft and auto-merge disabled;
no architectural main merge or deployment follows from these tests.

The root then combined all five reviewed source/test files in the integration
tree and ran their ordinary suites together under a fresh owned `/var/tmp`
parent: **84 tests,201 assertions**,0 failures,824ms. Combined project spec types
and graph-backed five-file lint passed. No OpenSSL or original factory suite was
run. Receipt logs: `/tmp/puni-combined-fixture-roots-{tests,types,lint}.log`.
