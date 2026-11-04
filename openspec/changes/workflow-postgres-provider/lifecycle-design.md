# Private PostgreSQL connection lifecycle

This implements the existing awaited-disposal contract as a private adapter component, following the selected PostgreSQL/serialized-write direction. It supplies no RunStore implementation or production provider selection. The [research](evidence/postgres-lifecycle-research.md) distinguishes writer transaction quiescence from final read-only observer disposal. The current semantic 26+2 ports and SQLite implementation stay intact.

## Connections and affinity

One bundle owns dedicated writer and observer pools, with one continuously reserved connection from each. Their startup application names are distinct short generated ASCII cookies. The private factory creates new pools with these startup names; no global/shared client, SET ROLE or application-name changes are supported. Both use the same owner-supplied database role, so no pg_read_all_stats grant is needed.

Before any persistent mutation, inspect the writer's exact PID/backend-start epoch text, role and database OIDs and cookie on that writer, then require the observer to see the same identity. Do not round timestamps through JavaScript Date. Query pg_catalog objects explicitly and retain every registered identity until bundle disposal.

The observer creates one SQL prepared SELECT containing a generated session marker and the complete backend activity inspection. Each poll executes that existing statement in autocommit, validates marker/role/read-only mode/session identity and only then classifies potentially owned backends. Missing or restricted identity fields for a potentially owned backend throw. Include startup-cookie matches, registered PID/start identities and parallel descendants; never count only active/non-null-xact rows. Different same-role bundles are unrelated; PID reuse is distinct from the original identity.

The marker and inspection are the SAME statement, avoiding a marker-check/query reconnect race. SQL prepared statements belong to one database session: reconnect/restart loses the statement and must throw instead of accepting a zero scan. This is SQL PREPARE SELECT, not two-phase PREPARE TRANSACTION. The observer permits only fixed inspection SQL after setup, sets/verifies default_transaction_read_only=on, and exposes no arbitrary query callback. [Prepared statements](https://www.postgresql.org/docs/18/sql-prepare.html), [READ ONLY semantics](https://www.postgresql.org/docs/18/sql-set-transaction.html).

## Transaction owner

One private queue serializes operations on the reserved writer. Write transactions use READ COMMITTED, await the transaction advisory lock in a separate SQL command, then invoke the adapter's internal planning/persistence callback. Snapshot reads use a read-only REPEATABLE READ transaction. There are no automatic transaction retries in this component. Provider-specific ownership/clock/guard/history semantics belong to the later complete RunStore adapter.

Every operation has a finite client deadline and finite server statement/lock budgets. Return a value only after acknowledged COMMIT. Callback failure rolls back with acknowledgement; rollback failure retains both causes and fences the bundle. Connection loss or ambiguous COMMIT fences future work and throws without inferring an absent transaction. An operation's failure remains on that operation promise.

The private callback accepts a Bun reserved connection and never crosses the semantic store ports. It is trusted adapter code: no caller-driven external work, role changes, cookie changes, two-phase/detached transactions or autonomous server extensions. The initial supported topology is direct connections to one server, without session-multiplexing proxies, transparent connection migration or failover substitution.

## Bounded close

The first close synchronously fences both ports/future writer creation, captures the queue boundary and caches one outcome. Queued work rejects before issuing SQL. Under one finite overall close deadline:

1. Wait for admitted work to settle; do not reinterpret its unknown commit.
2. Close the writer reservation and owning pool, observing the local outcomes.
3. Execute fresh prepared observer scans until no registered/cookie-bearing writer or owned parallel descendant remains. Client close or one early zero scan before writer disposal is insufficient.
4. Stop observer commands; close its reservation and pool and await local completion. It has no path to mutate provider records after writer disappearance, so no recursive observer is introduced.

Every independent cleanup is attempted. Observation/disposal/deadline failures remain sticky and preserve original/additional causes; ports remain fenced. Deadline helpers attach rejection observers to late promises, but timeout does not prove cancellation or disposal. Successful close means no future bundle writer transaction plus observed local resource disposal, not OS reaping, every remote process absent, power-loss certification or a known unanswered COMMIT outcome.

## Validation and scope

Finite budgets are explicit positive safe timer values. No secret URL is placed in retained records or diagnostics; the private factory consumes owner configuration. Real integration tests require an exclusively owned disposable PostgreSQL fixture with a checked owner marker; absent optional test configuration is visibly skipped, malformed/provided configuration throws. This private component is not a certified second provider: all 26+2 conformance, durable settings/schema admission, complete recovery and paused-writer transfer remain mandatory before enabling PostgreSQL selection.

Prove real close/rollback/locking, retained-connection admission fencing, observable server activity after client close, missing visibility, session-marker loss/replacement, deadline exhaustion and sticky cleanup errors. Observe production-path negative controls with the actual guard removed or dependency broken, restore exact source and record limits. Old P10 failures stay historical; only newly exercised bounded behavior earns new evidence.
