# Bounded task 5.2 real socket delivery

2026-10-23; base `2af130d535ea6a91e0007ccb327d79256ce25628`.

The mounted backend completion command now has an acceptance proof crossing the
real production PushClient, HTTP `/internal/push`, production `buildGateway`,
subscription map and Bun websocket writer. This is test coverage plus adjacent
proof comments; it introduces no production activation or delivery behavior.

The migrated SQLite fixture stores A→B→C node FS dependencies, with organization
shared people disabled and no assignment rows. Synthetic stored dependency
authority exercises the existing consumer without enabling production authoring.
A real mounted `setProgress(done)` command changes A. Separate cookie-authenticated
B and C sockets wait for their admitted project presence rosters before mutation.
Each receives exactly the durable `{subscription, seq, message}` ledger envelope,
including target and cause project identities. Pong wire barriers finish each
stream observation. Separate admitted unrelated and foreign-organization observers
receive no project envelope and retain no durable `elsewhere_changed` event.
The mounted B tree changes its node reading from unknown to waiting on reread.

The gateway runs in its own child process from a gateway-owned fixture, preserving
the application import boundary. Its production browser-access client reaches the
mounted backend over loopback; project authorization is not stubbed. The harness
accepts an optional shared internal secret for its mounted routes and outgoing
PushClient, retaining existing defaults for older tests. The backend `test` target explicitly includes gateway source files for cache
hashing and affected routing across the subprocess boundary. The push transport only
replaces the harness's `gw.invalid` origin with the real gateway listener.

## Watched production faults

Each fault was applied separately to
`apps/wbs/gw-01/src/controller/internal.controller.ts`, run through the new mounted
acceptance test, and restored before final verification:

1. Remove `for (const s of sockets) s.send(payload)`, preserving the accepted HTTP
   response and reported socket count. Observed 0 pass / 1 fail, with the specific
   `missing successor … delivery` deadline; B retained only `presence: []` and its
   admitted `presence: [ada]` frames. This proves an accepted push and count alone
   cannot satisfy the test. An earlier run hit the original 15-second outer test
   timeout; the repeated run with bounded startup and a 30-second outer budget
   reached the specific delivery assertion. Retained final rewatch: [send-removed.log](send-removed.log).
2. Change `socketsFor(req.subscription)` to
   ``socketsFor(`${req.subscription}:wrong`)``. Observed 0 pass / 1 fail at the same
   missing-B-delivery assertion after the admitted roster. This independently
   proves production subscription lookup is crossed. Retained final rewatch: [wrong-subscription.log](wrong-subscription.log).

Review found the runtime subprocess path did not establish a static Nx graph
edge. Added `{workspaceRoot}/apps/wbs/gw-01/src/**/*` to backend `test` inputs.
With that input, the gateway controller-only `nx show projects --affected` query includes
`wbs-be-01`. Removing the input makes `wbs-be-01` disappear; restoring it makes
a fixture-only affected query include the backend again. This declares the
source bytes for test caching as well as affected selection, without adding
an application import dependency.

Adjacent `Proof:` comments name both observed delivery failures. Existing before-commit,
rollback and organization-filter mutation receipts remain in their earlier
packets; this packet does not reattribute or duplicate those negatives.

## Verification and limits

The loopback listeners are blocked by the workspace sandbox (`EPERM: listen`).
The acceptance commands ran with the approved socket-capable execution path.
The initial direct lint attempt skipped module boundaries before the Nx project
graph existed; configured Nx verification is the required check below.

Final restored commands:

```sh
bun test apps/wbs/be-01/src/controller/cross-project-delivery.controller.db.test.ts apps/wbs/be-01/src/controller/cross-project-events.controller.db.test.ts apps/wbs/be-01/src/controller/gateway-browser.controller.db.test.ts apps/wbs/gw-01/src/composition.integration.test.ts apps/wbs/gw-01/src/fan-out.integration.test.ts --timeout=30000
NX_DAEMON=false bunx nx run-many --targets=lint,typecheck --projects=wbs-be-01,wbs-gw-01 --parallel=2 --output-style=static
NX_DAEMON=false bunx nx run wbs-gw-01:lint --skip-nx-cache --output-style=static
bunx openspec validate cross-project-dependencies --json
bunx prettier --check apps/wbs/be-01/project.json apps/wbs/be-01/src/controller/cross-project-delivery.controller.db.test.ts apps/wbs/be-01/src/testing/organization-harness.ts apps/wbs/gw-01/src/controller/internal.controller.ts apps/wbs/gw-01/src/testing/cross-project-delivery-gateway.ts openspec/changes/cross-project-dependencies/tasks.md openspec/changes/cross-project-dependencies/verify.md openspec/changes/cross-project-dependencies/evidence/real-socket-delivery/report.md
git diff --check
```

- Focused tests: **28 pass, 0 fail, 191 assertions**, 11.03 seconds;
  retained [restored-tests.log](restored-tests.log).
- Configured lint/typecheck: **5 successful tasks**, including backend module
  typecheck. The final run after the gateway-input update executed four tasks
  and reused the unchanged gateway typecheck output from its preceding successful
  execution. The earlier backend
  lint failure (two shorthand void callbacks) was corrected before this run.
- Restored gateway lint was rerun uncached after retaining both fault logs: **passed**.
- OpenSpec: **1 passed, 0 failed**; existing warnings concern long requirement
  text and were not modified by this packet.
- Changed-file Prettier and whitespace checks: **passed**.

Independent Astra High read-only review: **no remaining Critical or Important findings**.
The initial Nx input finding was resolved with the watched affected-routing proof above.

Full backend/gateway test suites, production builds, browser tests, all-change
OpenSpec validation and canonical h2/h4 host gates were not run for this bounded
packet. The focused checks are not a release receipt.

This closes the bounded backend→gateway→socket seam only. It does not establish
browser cache reconciliation, the complete fanout writer matrix, rollout,
activation or the canonical host gate. Parent task 5.2 remains unchecked.
