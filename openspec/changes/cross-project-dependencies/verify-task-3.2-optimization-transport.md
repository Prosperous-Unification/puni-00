# Task 3.2 bounded optimization transport proof — 2026-10-23

Base: `927e8c79594fe9df4c694d18a0171bd9ebec7ae8`. Isolated clone:
`/tmp/puni-32-mcp`; dependencies linked to the primary checkout's installed
`node_modules`. Using change `cross-project-dependencies`, schema `sdd-lean`
(53/77 tasks complete before this packet). Task 3.2 remains unchecked pending
independent review and complete reconciliation; no 4.2 authority expansion,
gateway 5.2 or 6.3 change is included.

## Production-owned connected outcomes

The generated SDK → MCP → mounted HTTP/SQLite fixture still authenticates with
a real machine key and authors its external FS relationship through the actual
command tool using only the existing synthetic active-command authority. No
HTTP response, optimization record or connected response body is supplied by a
fake producer.

The test-only backend control sets persisted required-engine settings for the
successor. With an installed runtime it invokes the real coordinator's input
admission and drains it. The launcher starts an actual Bun child that exits 1;
production capture, reservation, terminal classification, persistence and
connected outcome projection produce both objectives as
`failed / internal-error`, generation 1. The test independently expects those
discriminants, a SHA256-shaped input hash, Fast display with successor 2→4,
and the captured connected-stage scope naming the successor and both fixed
predecessor step intervals 0→1 and 1→2. An earlier launcher rejection produced
the modeled `retrying` state, so the terminal fixture uses an exited child.

With no runtime installed, the same persisted settings produce a real
`engine_unavailable / optimized / adapter_missing` schedule error identifying
the successor, empty slices and null row schedule/dates, without optimization
presentation. This persisted-settings control models a reader encountering
required-engine configuration; the public settings PATCH's optimizer admission
refusal remains covered by the prior packet and its regression cases.

Both cases assert exact mounted HTTP body equality with parsed generated MCP
text, plus independent outcome/relationship/project/work-item/step identity
expectations. Complete SQLite table snapshots and push lists are equal before
and after both reads. Tests use installed production capture/outcome owners,
not stored handcrafted optimization rows. The real solver algorithm, installed
solver executable, Supervisor and delegated OAuth active external success are
outside this packet.

## Watched production faults

Each mutation ran independently and its file was restored byte-for-byte before
the next mutation. Logs are retained in
[evidence/task-3.2-optimization-transport](evidence/task-3.2-optimization-transport).

| Production fault                                                        | Mounted invocation filter                   | Observed assertion failure                                                                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Delete `optimization` from parsed successful `wbs-client.ts` forwarding | `terminal optimization`                     | 0 pass / 1 fail; exact HTTP/MCP equality loses complete optimization                                                                |
| Replace forwarded `"state":"failed"` with `"state":"idle"`              | `terminal optimization`                     | 0 pass / 1 fail; exact equality differs in both objective discriminants                                                             |
| Delete `scheduleError` from successful forwarding                       | `required-engine-unavailable`               | 0 pass / 1 fail; exact equality loses required-engine error                                                                         |
| Widen only addTypedDependency's production FS/SS/FF schema to string    | `rejects unsupported addTypedDependency`    | 0 pass / 2 fail; HTTP receives 422 instead of 400; generated MCP reports HTTP 422 unsupported_relationship_type instead of HTTP 400 |
| Widen only updateTypedDependency's production FS/SS/FF schema to string | `rejects unsupported updateTypedDependency` | 0 pass / 2 fail; same exact 400→422 boundary failures for update                                                                    |

All filters use:

```sh
bun test apps/wbs/mcp-01/src/connected-command-parity.test.ts --test-name-pattern '<filter>'
```

The shared-schema negatives deliberately retain the downstream semantic
parser: these prove loss of the structural input-boundary 400 contract even
though downstream still refuses SF. They do not claim SF writes succeed. The
HTTP and MCP assertions run as separate tests so HTTP's first failure cannot
prevent the MCP negative. Adjacent test `Proof:` comments name these faults.
No production safety check or forwarding implementation ships changed.

## Final verification

```sh
bun test apps/wbs/mcp-01/src/connected-command-parity.test.ts --test-name-pattern 'real connected|rejects unsupported|propagates real calendar|real optimizer admission'
```

10 passed / 0 failed, 62 filtered, 79 assertions; 41.85s. After replacing an
unsafe test matcher assignment with a direct hash assertion, reran final added
cases with `real connected|rejects unsupported`: 6 passed / 0 failed, 66 filtered,
36 assertions; 27.35s. The initial sandbox execution hit `EPERM listen` before
application assertions. Mounted verification and fault runs then used approved
local loopback access; that sandbox refusal is not a behavior negative.

```sh
bun test libs/wbs/domain/contracts/src/http/plan-command-shapes.test.ts apps/wbs/be-01/src/controller/typed-dependency-commands.controller.db.test.ts
NX_DAEMON=false bunx nx run wbs-mcp-01:lint
NX_DAEMON=false bunx nx run wbs-mcp-01:typecheck
bunx eslint apps/wbs/be-01/src/testing/mcp-command-parity-backend.ts
NX_DAEMON=false bunx nx run wbs-be-01:typecheck
OPENSPEC_TELEMETRY=0 node_modules/.bin/openspec validate --all --json
```

Contract/controller tests: 28 passed / 0 failed, 210 assertions; 12.07s.
Configured MCP lint and typecheck passed uncached (22.3s and 4.8s). Changed
backend fixture lint passed; configured backend typecheck and its one dependency
passed uncached (12.5s). Nx's denied worker socket used its reported in-process
fallback. OpenSpec passed 271/271 items (253 changes, 18 specs), exit 0.
Changed-file Prettier and `git diff --check` passed.

Not run: full configured MCP/backend test suites, full backend lint, repository
build, canonical host gate, exact-head CI, browser, installed solver/Python/image
acceptance or active delegated OAuth external success. No push, merge,
deployment, production activation or parent-checkbox closure occurred. These
are bounded transport evidence and shared-boundary negatives; task 3.2 requires
independent Astra review and complete acceptance reconciliation.
