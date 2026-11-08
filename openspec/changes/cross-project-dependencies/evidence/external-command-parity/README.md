# Bounded dormant HTTP/MCP command parity — 2026-10-22

Base: `6ebc5c2e46690e14e50cb7a55eb4813a31fa04a4`, isolated clone
`/tmp/puni-external-command-contracts`. Architecture input:
`/tmp/puni-external-command-parity-architecture.md` (Astra).

Task 3.2 remains unchecked. Production external authoring stays dormant. This
packet supplies transport/contract and local compatibility evidence only;
real semantic activation and successful external mounted writes remain task 10
inputs. No test activates external dependencies or overrides production
composition.

## Changes and red observations

The explicit-ID normalizer now refuses empty or surrounding-whitespace project,
work-item and step IDs only when the endpoint explicitly names its project.
It does not trim identities, impose UUID syntax on stable IDs, or tighten omitted
project IDs and aliases. The existing sn1 parser already validates decoded IDs.

Before the guard, the booted `explicit endpoint IDs reject empty and surrounding
whitespace through HTTP and MCP` test failed: expected `HTTP 400`, received
`HTTP 404 not_found` for a padded explicit project ID. The unit test likewise
accepted `{ scope: 'whole', projectId: ' padded ', workItemId: 'work-item/a' }`
instead of throwing `invalid_typed_endpoint`. Retained red logs name the exact
commands and assertions. The generated description test failed on missing
`projectId` prose before authoritative registry descriptions were extended.

The boot matrix uses real production be-01 composition over migrated SQLite,
verified JWTs and single-use organization delegation, with generated MCP tools.
Both transports exercise:

- Dormant external add and local-to-external update across whole, node and
  descendant-step scopes and FS/SS/FF, with a preceding valid patch rolled back.
- Successful legacy dotted batch aliases (`PUNI.080.39`), legacy removal, omitted
  and explicit owner typed endpoints, batch node aliases, sn1 IDs, update, removal,
  undo and redo. Durable relationship IDs/endpoints/types are independently
  asserted against SQLite; equivalent fresh local endpoints are used per transport.
- Null/array endpoints, invalid scopes, nonstring identity, forbidden scope fields,
  explicit-project aliases, malformed/unknown sn1 encodings, unknown nested fields,
  unsupported SF, and empty/padded explicit IDs on both endpoint sides for add/update.

Refusals assert the upstream HTTP status and exact parsed body inside MCP's error
text, including command index/kind where defined. They compare before/after project,
work-item, step, legacy dependency, typed dependency, external dependency, calendar
marker, command journal, saved-plan/body, organization audit, event log and sequencer
rows. Authentication replay/session bookkeeping is outside that plan-effects
snapshot. These are durable effects; live delivery and connected fanout are not
proved here.

## Verification

Commands ran from the isolated clone with Bun 1.4.2. Real listeners are denied
by the sandbox (`EPERM: listen`), so boot suites ran under approved escalation.
The initial sandbox failure also exposed the preexisting unguarded afterAll
`jwks.stop` cleanup; the test harness was not changed to hide that failure.

- Baseline boot: `bun test apps/wbs/mcp-01/src/organization-delegation.boot.test.ts`
  — 16 pass, 0 fail, 91 assertions.
- Expanded restored boot: same command — see retained final log.
- Shared contract/normalizer/publication: `bun test
libs/wbs/domain/contracts/src/http/plan-command-shapes.test.ts
libs/wbs/domain/contracts/src/http/document-from-shapes.test.ts
libs/wbs/application/core/src/service/command-normalizers.test.ts
apps/wbs/mcp-01/src/generated-document.test.ts
apps/wbs/mcp-01/src/shape-document.test.ts` — see final log.
- Controller regressions: `bun test
apps/wbs/be-01/src/controller/typed-dependency-commands.controller.db.test.ts
apps/wbs/be-01/src/controller/connected-command-admission.controller.db.test.ts`
  — 127 pass, 0 fail, 1,615 assertions.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx run-many -t typecheck
-p wbs-contracts,wbs-core,wbs-be-01,wbs-mcp-01 --skip-nx-cache` checked all four
  projects and both module prerequisites. Contracts, backend, MCP and module checks
  passed; core caught a new test fixture's broad scope type. After correction,
  `bunx tsc --build --force libs/wbs/application/core/tsconfig.json
apps/wbs/mcp-01/tsconfig.json` exited 0. No module code changed. The earlier Nx
  attempt without those environment flags emitted socket-denial warnings and
  exited 0 without target execution; it is not counted as verification.
- Scoped ESLint, Prettier, OpenAPI emission/derivation and strict OpenSpec validation
  outcomes are recorded below after final restoration.

## Remaining obligations

Successful external mounted add/update/remove/history, connected announcements,
read-after-write and real schedule/optimization outcome parity require the real
activation authority and producers. Startup/deploy/downgrade compatibility,
participant drain evidence and browser behavior are outside this packet. Full CI,
full builds and the exact-SHA h2/h4 host gate were not run. No shared tracked source,
remote branch or host heavy lock was changed. Existing installed dependencies were
reused via a node_modules symlink; frozen dependency installation remains a gate
obligation.

## Independent watched production faults

Each fault ran singly in the isolated clone, then its original bytes were restored
in a `finally` block. Full boot runs include organization activation only; external
authoring remains dormant. These observed failure assertions are on the MCP path
through the actual mounted HTTP backend; restored passing cases separately assert
the direct delegated HTTP response and unchanged plan effects. They do not claim
that a direct assertion after a failing MCP assertion was reached in fault runs.

| Injected fault                                          | Observed assertion failure                                                                            |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Remove explicit-ID normalization guard                  | Explicit-ID matrix expected HTTP 400; received HTTP 404 `not_found` at command 1.                     |
| Widen only add type enum to string                      | Malformed matrix expected HTTP 400; received HTTP 422 `unsupported_relationship_type`, add command 0. |
| Widen only update type enum to string                   | Same expected 400; received HTTP 422 `unsupported_relationship_type`, update command 0.               |
| Change shared batch deep-undeclared behavior to delete  | Nested endpoint extra expected HTTP 400; received HTTP 409 `cycle`, add command 1.                    |
| Remove explicit-project/alias exclusion                 | Expected `invalid_typed_endpoint`; received indexed `unknown_ref`.                                    |
| Strip nested projectId in the MCP serializer            | Dormant MCP expected HTTP 409; received HTTP 404 `not_found`; direct request still expected 409.      |
| Delete projectId from authoritative endpoint descriptor | Generated tool expected `{ type: 'string' }`; received `undefined`.                                   |

The exact mutation driver is retained as `fault-driver.txt` (Python orchestration of Bun tests). It checks each mutation
matches its intended source, requires nonzero test exit and a named failing test,
and restores production code even on a failed proof. Test commands and printed
assertions are retained with each fault; full source paths in the logs refer to
the isolated clone. Baseline green and restored final green bound these faults.

## Final restored outcomes

- Booted HTTP/MCP: **21 pass, 0 fail, 698 assertions** (`boot-final.txt`).
- Contract/normalizer/generated-document suites: **57 pass, 0 fail, 392 assertions**
  (`unit-final.txt`). Controller regression counts above are retained in `controllers.txt`.
- Final core and MCP `bunx tsc --build --force` exited 0 after all faults were restored.
- Final scoped `bunx eslint` on all six changed TypeScript files exited 0 with no diagnostics.
  Full project lint targets were not run.
- `bun apps/wbs/be-01/src/openapi/emit-openapi-cli.ts
/tmp/puni-parity-openapi-final.json` exited 0; the actual MCP
  `toolsFromDocument(readDocument(path))` derived the document and independently
  asserted the add/update type enums and both project ID declarations. It emitted
  87 tools, matching the existing README count. No tool was added.
- `bunx openspec validate cross-project-dependencies --strict` passed.
  `bunx openspec validate --all --json` passed **268/268**, comprising 250 changes
  and 18 specs, with zero failures.
- Retained transcripts have trailing display whitespace removed only;
  `SHA256SUMS` pins their final bytes.

Final Prettier on all edited source/docs and `git diff --check` passed.
