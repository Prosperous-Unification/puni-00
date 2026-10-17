## Shape

`preflightOrganizationOwnership(db)` accepts a dedicated Drizzle connection. It uses `drizzleReadTransaction` to begin, reads the marker first to pin the SQLite snapshot, awaits the three existing repository probes sequentially, commits, and returns their explicit arrays. Any probe error rolls back and rethrows. No transaction callback crosses an asynchronous boundary because Bun's native callback transactions are synchronous.

The CLI owns `openReadOnlyConnection(DB_PATH)` and closes it in `finally`. It validates arguments and environment before opening. It prints only after the complete report resolves. The function's caller must dedicate its connection until the promise settles; the CLI satisfies this lifetime. There are no probe callbacks or mutation capabilities added for tests.

Tests use a real migrated database and a Drizzle logger on a separate dedicated connection to commit a competing writer immediately before the first ownership query, after the marker has pinned the snapshot. A test-only Bun preload intercepts the CLI's opener and attempts a write on the returned connection, so a writable-opener mutation is observable on the production invocation.

See `docs/runbook-organization-ownership-preflight.md` for the operator boundary. Existing parent activation and inventory tasks remain unresolved.
