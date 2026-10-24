# Complete backend V1 support intersection

Base: `6effc8f653fa0c6d67f903f576b6d97cd6f2adad`. This packet completes the
backend binary-support intersection and advertises V1 through the existing single
frozen backend descriptor. It does not activate a store, publish an owner receipt,
provide an activation writer/CLI, deploy, or establish complete participant fencing.
Parent tasks 10.1/10.2 remain open.

## Production behavior

`OpenSqliteSourceOptions.dependencyCapability` is required. Opening a source parses
the exact closed descriptor once, requires backend role before opening SQLite,
and captures its immutable support fact. Caller mutation, environment variables,
schema presence and durable receipts cannot grant unsupported binary semantics.
Production `bootBe01` passes the same frozen `BACKEND_DEPENDENCY_CAPABILITY` used
by startup admission, HTTP infrastructure, the DB-free CLI and resource admission.
There is no BootOptions or environment override.

An admitted writer checks its lifetime, inspects durable authority once on its
own connection, and returns a stable capability projection: DISABLED is inactive;
ENABLED plus captured V1 support is active; ENABLED without support throws.
Public and repair catalogs refuse authoring authority. All direct source callers,
fault wrappers and reflective-call fixtures now give explicit real or test binary
descriptors. Semantic fixtures explicitly use capable binaries; incapable controls
explicitly use empty support. The previous reflective saved-plan constructor call
now uses its precise typed function directly.

The sole backend descriptor was switched to V1 only after source/intersection,
semantic consumer and requested connected regressions had run. CLI/HTTP equality
and actual deployment binary-observation expectations follow that descriptor;
explicit fake old-binary and stalled envelopes remain empty controls. No gateway,
MCP or browser negotiation implementation is changed by this packet.

## Real mounted acceptance

`backend-v1-support.boot.db.test.ts` invokes `BootedBrowserProcess.open` without
its synthetic callback, using actual boot/buildServices/core and the real frozen
production descriptor. Tests cover external create/update/remove and undo/redo,
persisted relationship identity and journal/event effects, complete rollback after
a later batch refusal, actual external import without appended command history,
rollback after an injected external insertion fault, exact/missing/wrong/combined
resource claims, ENABLED-empty restart preserving every durable table, and a
wrong-role source refusal before factories/writes.

These tests initialize synthetic durable receipts only in disposable databases.
They prove runtime consumption and binary support, not trusted owner activation
publication or independent participant exclusion. No production authoring-permission
object or synthetic WorkItemService/importer is injected into these acceptance tests.
The older optional helper callback remains explicitly test-only and now documents
that binary support does not prove owner activation.

Incapable startup is modeled in a separate subprocess that replaces only the
immutable binary module with an explicit frozen empty descriptor before importing
real boot. It adds no production configuration API. Complete schema/ledger/row
snapshots prove rejection before pending migration or service side effects,
including ENABLED authority with zero external relationships.

## TDD and R5

Initial source tests: 1 passed/10 failed before implementation, then all passed.
The first three real-boot V1 acceptance tests failed against the old empty binary
descriptor, then passed after the single descriptor switch. The final source suite
also covers repair refusal and exactly one durable authority inspection.

Nine independent production mutations were watched and restored:

| Fault                                    | Observed negative                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| Skip closed descriptor parsing           | Six malformed/missing descriptor cases failed before-connection expectations |
| Remove backend-role requirement          | Gateway descriptor reached the connection factory                            |
| Read caller descriptor at operation time | Mutation granted formerly incapable source permission                        |
| Remove unsupported-runtime refusal       | ENABLED incapable source answered instead of throwing                        |
| Force active over DISABLED               | Capable binary incorrectly gained dormant authoring                          |
| Return a live authority getter           | One operation performed two durable marker inspections                       |
| Bind empty source while advertising V1   | Real mounted external command failed instead of persisting its identity      |
| Remove V1 advertisement                  | Real enabled backend refused the exact resource claim                        |
| Remove incapable startup predicate       | Old-binary subprocess admitted a pending migration/service side effects      |

All mutation runs exited 1 at their selected assertions. Adjacent production
`Proof:` comments name the faults and tests. Every mutation was restored before
final regression and scoped verification.

## Verification receipts

- Before advertisement, 77 requested backend connected/read/publication/copy/
  history/export/import/saved-plan/arrangement/optimizer suites: 1292 passed,
  1 stale expectation failed. With a capable enabled source, an absent remote
  reference now reaches its precise 400 `unknown_ref` refusal; DISABLED retains
  409 inactive. Corrected affected suite plus incapable boot/saved-plan controls:
  82 passed, 0 failed. No domain implementation defect remained from that run.
- Semantic source/command/copy/import subset before advertisement: 190 passed,
  0 failed across four files.
- Complete domain suite (including connected scheduling, aggregate/readiness,
  arrangement and immutable history): 1503 passed, 1 existing performance skip,
  0 failed across 101 files. The skipped case is the existing isolated elapsed
  certification, `certifies 600 slices in under 20ms elapsed`; its CPU regression
  counterpart runs on shared workers.
- Final real boot plus CLI/HTTP acceptance: 10 passed, 0 failed. The five real
  boot tests include a restarted ENABLED backend returning 409 without a claim
  and 200 with the exact claim while preserving all durable tables. Final startup
  controls: 20 passed; strengthened isolated incapable-cause controls: 2 passed.
- Actual backend role CLI observation: 1 passed; the full role expectation now
  requires V1 for all roles and awaits the integrated gateway/MCP packet in the
  parent branch. This checkout intentionally retains their earlier descriptors.
- Crosscut actual/fake observation controls: 161 passed, 0 failed across
  dependency preflight/capability/admission, SQLite probe and Kubernetes execute
  adapter tests. Explicit fake empty-support envelopes were preserved.
- Configured Nx typecheck passed core, SQLite, backend and remote-scripts plus
  both module-typecheck dependencies, zero cache hits. `tool-deploy:typecheck`
  also passed separately.
- Final backend regression after advertisement: 1329 passed, 0 failed across
  83 files (647.37 seconds), including all requested regression families and the
  new source/real-boot/CLI/HTTP controls.
- Additional typed caller/fault controls (composed script fixture, SQLite fault
  controls, step-parallel conformance and capability source): 27 passed, 0 failed.
- Configured Nx lint passed core, SQLite and backend, zero cache hits. Final
  staged-file ESLint also passed after the Nx project graph existed.
- Scoped backend build and its three dependencies passed, including the Bun
  backend bundle and generated OpenAPI. No image was built or published.
- `bunx openspec validate cross-project-dependencies --json` passed. Strict
  validation remains subject to the unchanged shared long-requirement warnings;
  this packet does not edit shared spec/tasks/verify artifacts.
- Normal repository hooks are installed and required for the packet commit.

The first socket-bearing regression attempt encountered sandbox `listen` EPERM;
reruns used authorized disposable localhost execution. Initial direct ESLint ran
before a project graph existed and visibly skipped module-boundary rules; after
creating the graph, configured Nx checks and final staged-file checks own the lint
receipt. Initial fixture lint/type errors were fixed before final checks.

## Delivery limits

The isolated clone reuses the existing workspace's installed dependencies through
an ignored `node_modules` symlink. A fresh frozen install was not performed; the
integrated host gate owns locked-dependency installation and whole-repo acceptance.

No push, live database work, host gate, deployment, owner activation publication,
or gateway/MCP/browser negotiation completion is claimed. Final integrated role
observations, independent review and exact integrated-SHA host acceptance belong
to the parent feature delivery. The parent is separately integrating canonical
`1de2778500f7c62f48f32fc568ec2a6c949334bb` claim-lease work; these receipts remain
for this isolated base and do not certify that subsequent combined merge.
