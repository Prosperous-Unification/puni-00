# Task 10.1 bounded retained gateway egress admission

Base: `7f33d202104b786b4dd545d59cf2bf9aae28990a`. Work was isolated in
`/tmp/puni-egress-1031`; primary worktree untouched. Parent 10.1 remains open.

The common FIFO now requires fresh asynchronous authority admission and a
synchronous physical writer. Queue time and authority transport share the existing
absolute five-second enqueue budget. Cancellation/expiry are checked before and
after admission, with no await between the final checks and physical acceptance.
The app passes its frozen empty gateway capability and no negotiated protocol to
the existing backend admission endpoint/closed decoder, with parent cancellation.
Incompatibility is terminal and distinct from authority error/deadline retirement.

Retirement aborts pending connection work and removes subscriptions and presence
before physical close. Close broadcasts the projects already removed and does not
await joined or its own FIFO. Delayed identity and subscribe continuations cannot
restore membership; late open completion preserves the original 1013 retirement.

## Observed negatives

The first added service tests failed against the base implementation: queued
second frame was accepted, held admission cancellation accepted a frame, and
exact expiry with withheld timers accepted a frame. After implementation these
passed. An incompatible retirement callback initially resolved instead of
propagating an infrastructure failure; its failing test preceded moving terminal
retirement outside the authority catch.

Each fault below was injected independently into production code, the named
production-path test failed, and the source was restored before verification.
Receipts live in [evidence/retained-egress](evidence/retained-egress/).

| Injected fault                                 | Observed assertion                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Skip fresh FIFO-head admission                 | Replay accepted sentinel and acknowledgement after the first event changed authority (`fresh-admission.log`).            |
| Skip incompatible retirement                   | Retained real socket stayed open; observation deadline failed (`incompatible-retirement.log`).                           |
| Remove post-admission cancellation check       | Mounted internal push physically wrote after cancellation (`post-admission-cancellation.log`).                           |
| Remove post-admission absolute-expiry check    | Mounted internal push counted an expired accepted frame with timer withheld (`post-admission-expiry.log`).               |
| Remove pre-admission expiry check              | Mounted expired FIFO head inspected authority once instead of zero times (`pre-admission-expiry.log`).                   |
| Omit authority parent cancellation             | Real socket close left held authority fetch un-aborted until observation deadline (`authority-parent-cancellation.log`). |
| Omit connection abort before close             | Mounted close snapshot saw `canceled: false` (`retirement-abort.log`).                                                   |
| Omit subscription removal before close         | Mounted close snapshot retained its subscribed delivery socket (`retirement-subscriptions.log`).                         |
| Omit presence removal before close             | Mounted close snapshot retained one connection (`retirement-presence.log`).                                              |
| Omit delayed identity cancellation check       | Mounted late identity restored one presence connection (`late-identity.log`).                                            |
| Omit held subscribe cancellation check         | Production controller restored a subscription after cancellation (`late-subscribe.log`).                                 |
| Omit canceled-open completion check            | Mounted late identity added close 1008 after 1013 (`late-close.log`).                                                    |
| Catch incompatible retirement callback failure | Producer resolved instead of rejecting (`callback-failure.log`).                                                         |

Physical close is deliberately withheld in mounted lifecycle tests. Assertions
observe actual cancellation, subscription and presence state captured at close,
then assert outside the delivery failure boundary so callback exceptions cannot
make the check falsely pass. Presence observation wraps the real join method; it
does not replace membership behavior.

## Verification

Commands run from the isolated checkout, serially for configured gateway targets:

- `NODE_OPTIONS=--max-old-space-size=4096 NX_DAEMON=false bunx nx run wbs-gw-01:test --skip-nx-cache`: exit 0, 188 tests, 3783 assertions.
- `NODE_OPTIONS=--max-old-space-size=4096 NX_DAEMON=false bunx nx run wbs-gw-01:lint --skip-nx-cache`: exit 0.
- `NODE_OPTIONS=--max-old-space-size=4096 NX_DAEMON=false bunx nx run wbs-gw-01:typecheck --skip-nx-cache`: exit 0.
- `bun test --timeout=10000 apps/wbs/be-01/src/http/elysia/gateway-dependency.db.test.ts apps/wbs/be-01/src/http/elysia/retained-gateway-dependency.db.test.ts`: exit 0, 2 tests, 27 assertions. Real SQLite authority changes DISABLED→synthetic ENABLED, still zero external rows; distinct retained push/replay subscriptions receive no later application frame or acknowledgement, and push reports zero accepted sockets. Backend capability is synthetic in this fixture; production binary support remains empty.
- Changed-file Prettier and `git diff --check`: exit 0.
- `bunx eslint apps/wbs/be-01/src/http/elysia/gateway-dependency.db.test.ts apps/wbs/be-01/src/http/elysia/retained-gateway-dependency.db.test.ts`: exit 0.
- `bunx openspec validate cross-project-dependencies --json`: exit 0, valid. Strict validation was attempted and exits 1 for pre-existing long-requirement warnings; the new requirement introduces no long-text warning.

The default network sandbox denied localhost listeners; socket/subprocess tests
were rerun with explicit sandbox escalation. An early combined backend test run
used Bun's default five-second timeout and timed out; final runs use its configured
10-second budget. Initial gateway upgrade fixture counts were adapted to the fresh
initial presence admission; backend tests await that frame before closing to avoid
counting a request canceled before reaching the backend.

Build was deliberately withheld at the parent agent's instruction while host-gate
coordination ran. Full backend suite/typecheck, browser checks, independent Astra
review and the integrated isolated host gate remain unclaimed here.

## Limits

This is fresh-observation egress admission, not a linearizable authority/write
fence. A backend may read DISABLED, delay its 204, and deliver it after ENABLED;
the gateway may then write. That post-read/pre-send race remains unresolved and
belongs to the deployment owner's participant-exclusion/activation protocol.
Every routed backend must expose the endpoint; an older backend 404 retires as
authority unavailable. Accepted Bun backpressure is counted once and is not a
browser receipt. Already accepted bytes cannot be recalled.

No activation, authoring, ingress fencing, old-process participant exclusion,
semantic advertisement, negotiated dependency protocol or deployment was enabled.
Backend, gateway and MCP binary capabilities remain empty.
