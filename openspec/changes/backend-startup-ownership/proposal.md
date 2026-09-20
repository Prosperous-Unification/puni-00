## Why

Backend startup acquires a SQLite connection, a retention timer and a listener, but releases none of them when a later startup step fails. Shutdown is one `await` chain, so a refused release abandons every release after it. Releasing these resources must be awaited, which the synchronous `bootBe01` contract cannot do.

## What Changes

DI Bag owns the source, services, retention timer and server. `bootBe01` returns a promise after its configured startup actions finish. A failure at any step releases everything already started in reverse order. `stop()` closes the bag; if one release is refused, it attempts the remaining releases before reporting the cleanup failure.

## Non-Goals

This change does not split backend modules, adopt a reporting library, change gw-01 or mcp-01, add startup or shutdown timeouts, change HTTP routes or migration policy, alter deployment scripts, add an Nx target, or add a new file under `apps/wbs/be-01/src`.

## Constraints

`/health` keeps every existing response, including its three 503 states. The listener keeps its current startup position, and `migrationsApplied` keeps its current meaning. No timeout is introduced. Schema management remains with the deployment pipeline.
