# Design

## Resource graph

The composition has four registrations:

- `source` opens the process's SQLite source.
- `services` depends on `source` and composes the backend service graph.
- `retention` depends on `services`, starts the retention timer, and returns that timer.
- `server` depends on `source`, `services`, and `retention`; it builds and starts the application, completes the configured schema and identity work, and starts the optimizer when configured.

These dependency edges declare the startup order. DI Bag releases dependants before their dependencies, while disposers pushed by one factory run last-pushed first. The resulting close order is therefore `app.stop`, `optimizer.stop`, `retention.stop`, and `source.close`; it is a consequence of ownership and graph edges rather than a separate handwritten shutdown sequence.

## Complete and partial acquisition

`DiBag.withDisposal` owns the application returned by the server factory on the completed path. The factory can acquire a listener and then fail before it returns, so `factoryCtx.pushDisposer` also takes responsibility for that partially acquired listener. The pushed disposer reads `disposerCtx.reason`: it stops the application unless the completed service's `withDisposal` already did so. This distinction prevents both a leaked listener on rollback and a duplicate stop on normal close.

The rejected mutation in the packet's negative-proof design—removing the server's `withDisposal` wrapper—does not prove this split. DI Bag then gives the pushed disposer the `no-service-disposer` reason, and that disposer still stops the listener. The consequential mutation instead leaves `withDisposal` present but makes its disposer inert; the pushed disposer sees `service-disposed`, does nothing, and the listener remains open.

## Startup and cleanup failures

`buildAndStart(['server'])` eagerly acquires the complete graph. If any factory fails, DI Bag releases every acquisition already owned and rejects with `DiBagStartupError`; its `cause` preserves the original startup failure, while `cleanupFailures` separately reports releases that failed during rollback. A later `bag.close()` attempts every disposer even when one rejects, then reports those refusals as a cleanup error.
