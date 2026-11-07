import { rejects } from 'node:assert/strict';

import { type ReservedSQL, SQL } from 'bun';
import { describe, expect, test } from 'bun:test';

import { closeFixtures } from '../testing/close-fixtures';
import { awaitCompletion } from './deadline';
import { createPostgresObserver, type PostgresWriter, readPostgresWriter } from './observer';

const testUrl = process.env['TWILIGHT_POSTGRES_TEST_URL'];
const testOwner = process.env['TWILIGHT_POSTGRES_TEST_OWNER'];
const configured = testUrl !== undefined || testOwner !== undefined;
if (configured) {
  if (testUrl === undefined || testOwner === undefined || testOwner.trim() === '') {
    throw new Error('PostgreSQL test URL and owner must both be supplied');
  }
  const address = new URL(testUrl);
  if (!['postgres:', 'postgresql:'].includes(address.protocol)) {
    throw new Error('PostgreSQL test URL must use postgres or postgresql');
  }
}

async function closeConnection(pool: SQL, connection: ReservedSQL | undefined): Promise<void> {
  const failures: unknown[] = [];
  if (connection !== undefined) {
    try {
      connection.release();
    } catch (cause) {
      failures.push(cause);
    }
  }
  try {
    await pool.close({ timeout: 0 });
  } catch (cause) {
    failures.push(cause);
  }
  if (failures.length > 0)
    throw new AggregateError(failures, 'PostgreSQL fixture connection cleanup failed');
}

async function openConnection(applicationName: string, username?: string) {
  if (testUrl === undefined || testOwner === undefined)
    throw new Error('missing PostgreSQL fixture');
  const pool = new SQL(testUrl, {
    max: 1,
    username,
    connection: { application_name: applicationName },
  });
  let reservation: ReservedSQL | undefined;
  try {
    const connection = await pool.reserve();
    reservation = connection;
    const owners = await connection<
      { owner: unknown }[]
    >`SELECT current_setting('puni_test.owner') AS owner`;
    if (owners.length !== 1 || owners[0]?.owner !== testOwner)
      throw new Error('PostgreSQL fixture owner does not match');
    let closed = false;
    return {
      connection,
      async close() {
        if (closed) return;
        closed = true;
        await closeConnection(pool, connection);
      },
    };
  } catch (cause) {
    try {
      await closeConnection(pool, reservation);
    } catch (cleanup) {
      throw new AggregateError(
        [cause, cleanup],
        'PostgreSQL fixture acquisition and cleanup failed',
        { cause: cleanup },
      );
    }
    throw cause;
  }
}

async function openBundle(username?: string) {
  const suffix = crypto.randomUUID().replaceAll('-', '');
  const writerName = `writer_${suffix}`;
  const observerName = `observer_${suffix}`;
  const writer = await openConnection(writerName, username);
  const observer = await openConnection(observerName, username).catch(async (cause: unknown) => {
    try {
      await writer.close();
    } catch (cleanup) {
      throw new AggregateError(
        [cause, cleanup],
        'PostgreSQL fixture bundle acquisition and cleanup failed',
        { cause: cleanup },
      );
    }
    throw cause;
  });
  return {
    writer,
    observer,
    writerName,
    observerName,
    async create() {
      return await createPostgresObserver(
        observer.connection,
        {
          writerName,
          observerName,
          pollMilliseconds: 5,
        },
        AbortSignal.timeout(2000),
      );
    },
    async close() {
      await closeFixtures([writer, observer]);
    },
  };
}

async function findProbe(connection: ReservedSQL): Promise<string> {
  const statements = await connection<{ name: unknown; statement: unknown }[]>`
    SELECT name, statement FROM pg_catalog.pg_prepared_statements
    WHERE statement LIKE 'PREPARE twilight_observer_probe AS%'
  `;
  if (statements.length !== 1 || statements[0]?.name !== 'twilight_observer_probe') {
    throw new Error('missing observer session probe');
  }
  const statement = statements[0]?.statement;
  if (typeof statement !== 'string') throw new Error('missing prepared SQL');
  return statement;
}

interface WorkerIdentity {
  readonly pid: number;
  readonly startedAt: string;
}

function readWorkerIdentity(fields: { pid: unknown; startedAt: unknown }): WorkerIdentity {
  if (
    typeof fields.pid !== 'number' ||
    !Number.isSafeInteger(fields.pid) ||
    fields.pid <= 0 ||
    typeof fields.startedAt !== 'string' ||
    !/^\d+(\.\d+)?$/.test(fields.startedAt)
  )
    throw new Error('missing parallel-worker identity visibility');
  return { pid: fields.pid, startedAt: fields.startedAt };
}

async function withParallelWriter(
  shouldRegisterWriter: boolean,
  inspect: (fixture: {
    bundle: Awaited<ReturnType<typeof openBundle>>;
    observer: Awaited<ReturnType<typeof createPostgresObserver>>;
    writer: PostgresWriter;
    statement: string;
    running: Promise<unknown>;
    readonly cancelWriter: () => Promise<void>;
    readonly countWorkers: () => Promise<number>;
    readonly waitForWorkersToExit: () => Promise<void>;
  }) => Promise<void>,
): Promise<void> {
  const bundle = await openBundle();
  let administrator: Awaited<ReturnType<typeof openConnection>> | undefined;
  const table = `parallel_${crypto.randomUUID().replaceAll('-', '')}`;
  let running: Promise<unknown> | undefined;
  let cancelWriter: (() => Promise<void>) | undefined;
  try {
    administrator = await openConnection(`admin_${crypto.randomUUID().replaceAll('-', '')}`);
    await administrator.connection.unsafe(
      `CREATE UNLOGGED TABLE ${table} AS SELECT generate_series(1, 20000) AS n`,
    );
    await administrator.connection.unsafe(`ALTER TABLE ${table} SET (parallel_workers = 2)`);
    await bundle.writer.connection`SET min_parallel_table_scan_size = 0`;
    await bundle.writer.connection`SET parallel_setup_cost = 0`;
    await bundle.writer.connection`SET parallel_tuple_cost = 0`;
    const observer = await bundle.create();
    const writer = await readPostgresWriter(
      bundle.writer.connection,
      bundle.writerName,
      AbortSignal.timeout(2000),
    );
    const administratorConnection = administrator.connection;
    let cancelled = false;
    cancelWriter = async () => {
      if (cancelled) return;
      const cancellations = await administratorConnection<{ accepted: unknown }[]>`
        SELECT pg_cancel_backend(${writer.pid}) AS accepted
      `;
      if (cancellations.length !== 1 || cancellations[0]?.accepted !== true)
        throw new Error('PostgreSQL parallel query cancellation was not accepted');
      cancelled = true;
    };
    if (shouldRegisterWriter) await observer.register(writer, AbortSignal.timeout(2000));
    const statement = await findProbe(bundle.observer.connection);
    running = Promise.resolve(
      bundle.writer.connection.unsafe(
        `SELECT count(*) FROM ${table} WHERE pg_sleep(0.001) IS NULL`,
      ),
    );
    void running.catch(() => undefined);
    const readiness = AbortSignal.timeout(2000);
    let workers: WorkerIdentity[];
    do {
      const visible = await awaitCompletion(
        administratorConnection<{ pid: unknown; startedAt: unknown }[]>`
          SELECT pid, EXTRACT(EPOCH FROM backend_start)::text AS "startedAt"
          FROM pg_catalog.pg_stat_activity
          WHERE leader_pid = ${writer.pid} AND application_name = ${bundle.writerName}
            AND state = 'active' AND backend_type = 'parallel worker'
        `,
        readiness,
      );
      workers = visible.map(readWorkerIdentity);
      if (new Set(workers.map((worker) => worker.pid)).size !== workers.length)
        throw new Error('duplicate parallel-worker identity');
      if (workers.length !== 2) await awaitCompletion(Bun.sleep(5), readiness);
    } while (workers.length !== 2);
    async function countWorkers(deadline = AbortSignal.timeout(2000)): Promise<number> {
      const visible = await awaitCompletion(
        administratorConnection.unsafe<{ pid: unknown; startedAt: unknown }[]>(
          `SELECT pid, EXTRACT(EPOCH FROM backend_start)::text AS "startedAt"
           FROM pg_catalog.pg_stat_activity
           WHERE pid IN (${workers.map((_, index) => '$' + String(index + 1)).join(', ')})`,
          workers.map((worker) => worker.pid),
        ),
        deadline,
      );
      return visible
        .map(readWorkerIdentity)
        .filter((identity) =>
          workers.some(
            (worker) => worker.pid === identity.pid && worker.startedAt === identity.startedAt,
          ),
        ).length;
    }
    async function waitForWorkersToExit(): Promise<void> {
      const deadline = AbortSignal.timeout(2000);
      while ((await countWorkers(deadline)) > 0) {
        await awaitCompletion(Bun.sleep(5), deadline);
      }
    }
    await inspect({
      bundle,
      observer,
      writer,
      statement,
      running,
      cancelWriter,
      countWorkers,
      waitForWorkersToExit,
    });
  } finally {
    if (cancelWriter !== undefined) await cancelWriter();
    if (running !== undefined) await Promise.allSettled([running]);
    await bundle.close();
    if (administrator !== undefined) {
      await administrator.connection.unsafe(`DROP TABLE IF EXISTS ${table}`);
      await administrator.close();
    }
  }
}

const databaseTests = configured ? describe : describe.skip;
databaseTests('private PostgreSQL observer (requires explicitly owned fixture)', () => {
  test('observes same-role idle writer until real close, then fresh absence', async () => {
    const bundle = await openBundle();
    try {
      const observer = await bundle.create();
      const writer = await readPostgresWriter(
        bundle.writer.connection,
        bundle.writerName,
        AbortSignal.timeout(2000),
      );
      await observer.register(writer, AbortSignal.timeout(2000));
      const deadline = new AbortController();
      const pending = observer.waitForWriters(deadline.signal);
      let settled = false;
      void pending.then(
        () => {
          settled = true;
        },
        () => {
          settled = true;
        },
      );
      await Bun.sleep(40);
      // Fault O1: removing activity inspection makes this assertion fail before writer close.
      expect(settled).toBe(false);
      await bundle.writer.close();
      await pending;
    } finally {
      await bundle.close();
    }
  });

  test('excludes unrelated same-role bundles', async () => {
    const bundle = await openBundle();
    const unrelated = await openConnection(`other_${crypto.randomUUID().replaceAll('-', '')}`);
    try {
      const observer = await bundle.create();
      const writer = await readPostgresWriter(
        bundle.writer.connection,
        bundle.writerName,
        AbortSignal.timeout(2000),
      );
      await observer.register(writer, AbortSignal.timeout(2000));
      await bundle.writer.close();
      await observer.waitForWriters(AbortSignal.timeout(2000));
    } finally {
      await Promise.all([bundle.close(), unrelated.close()]);
    }
  });

  test('rejects wrong registration identity and startup cookie', async () => {
    const bundle = await openBundle();
    try {
      const observer = await bundle.create();
      const writer = await readPostgresWriter(
        bundle.writer.connection,
        bundle.writerName,
        AbortSignal.timeout(2000),
      );
      for (const altered of [
        { ...writer, startedAt: '0' },
        { ...writer, roleOid: '1' },
        { ...writer, databaseOid: '1' },
        { ...writer, applicationName: 'unrelated' },
      ]) {
        await rejects(observer.register(altered, AbortSignal.timeout(2000)));
      }
      await rejects(
        readPostgresWriter(bundle.writer.connection, 'wrong_cookie', AbortSignal.timeout(2000)),
      );
    } finally {
      await bundle.close();
    }
  });

  test('rejects changed registered writer cookie instead of treating it as gone', async () => {
    const bundle = await openBundle();
    try {
      const observer = await bundle.create();
      const writer = await readPostgresWriter(
        bundle.writer.connection,
        bundle.writerName,
        AbortSignal.timeout(2000),
      );
      await observer.register(writer, AbortSignal.timeout(2000));
      await bundle.writer.connection`SET application_name = 'changed_cookie'`;
      await rejects(observer.waitForWriters(AbortSignal.timeout(2000)), /writer identity/);
    } finally {
      await bundle.close();
    }
  });

  test('rejects missing prepared probe and replacement marker', async () => {
    for (const replace of [false, true]) {
      const bundle = await openBundle();
      try {
        const observer = await bundle.create();
        const statement = await findProbe(bundle.observer.connection);
        await bundle.observer.connection`DEALLOCATE twilight_observer_probe`;
        if (replace) {
          await bundle.observer.connection.unsafe(
            statement.replace(
              /SELECT '[a-f0-9]+'::text AS marker/,
              "SELECT 'replacement'::text AS marker",
            ),
          );
        }
        await bundle.writer.close();
        await rejects(observer.waitForWriters(AbortSignal.timeout(2000)));
      } finally {
        await bundle.close();
      }
    }
  });

  test('rejects a changed observer read-only policy and session cookie', async () => {
    for (const mutation of ['read_only', 'cookie']) {
      const bundle = await openBundle();
      try {
        const observer = await bundle.create();
        if (mutation === 'read_only') {
          await bundle.observer.connection`SET default_transaction_read_only = off`;
        } else {
          await bundle.observer.connection`SET application_name = 'changed_observer'`;
        }
        await bundle.writer.close();
        await rejects(observer.waitForWriters(AbortSignal.timeout(2000)));
      } finally {
        await bundle.close();
      }
    }
  });

  test('rejects missing visibility for a potentially owned backend', async () => {
    const bundle = await openBundle();
    try {
      const observer = await bundle.create();
      const statement = await findProbe(bundle.observer.connection);
      await bundle.observer.connection`DEALLOCATE twilight_observer_probe`;
      await bundle.observer.connection.unsafe(
        statement.replaceAll(
          "'startedAt', EXTRACT(EPOCH FROM backend_start)::text",
          `'startedAt', CASE WHEN application_name = '${bundle.writerName}' THEN NULL ELSE EXTRACT(EPOCH FROM backend_start)::text END`,
        ),
      );
      await rejects(observer.waitForWriters(AbortSignal.timeout(2000)), /visibility/);
    } finally {
      await bundle.close();
    }
  });

  test('includes real untagged parallel descendants when the leader is excluded', async () => {
    await withParallelWriter(
      true,
      async ({
        bundle,
        observer,
        statement,
        running,
        cancelWriter,
        countWorkers,
        waitForWorkersToExit,
      }) => {
        const parallelProbe = statement
          .replace(
            'FROM pg_catalog.pg_stat_activity) AS activities',
            `FROM pg_catalog.pg_stat_activity WHERE application_name <> '${bundle.writerName}' OR backend_type = 'parallel worker') AS activities`,
          )
          .replace(
            "'applicationName', application_name, 'leaderPid'",
            "'applicationName', CASE WHEN backend_type = 'parallel worker' THEN '' ELSE application_name END, 'leaderPid'",
          );
        await bundle.observer.connection`DEALLOCATE twilight_observer_probe`;
        await bundle.observer.connection.unsafe(
          parallelProbe.replace("'leaderPid', leader_pid", "'leaderPid', NULL"),
        );
        // Proof: O10 removed the null-link guard; this real-worker test lost its expected rejection.
        await rejects(observer.waitForWriters(AbortSignal.timeout(2000)), /ambiguous/);
        await bundle.observer.connection`DEALLOCATE twilight_observer_probe`;
        await bundle.observer.connection.unsafe(parallelProbe);
        const observation = new AbortController();
        const stop = new Error('live parallel-worker observation complete');
        const pending = observer.waitForWriters(
          AbortSignal.any([observation.signal, AbortSignal.timeout(2000)]),
        );
        let settled = false;
        void pending.then(
          () => {
            settled = true;
          },
          () => {
            settled = true;
          },
        );
        await Bun.sleep(40);
        // Proof: O9 removed descendant traversal; this live-worker test observed premature settlement.
        expect(settled).toBe(false);
        expect(await countWorkers()).toBe(2);
        observation.abort(stop);
        await rejects(pending, (cause: unknown) => cause === stop);

        await cancelWriter();
        await rejects(running);
        await bundle.writer.close();
        await waitForWorkersToExit();

        // Reserved-connection ordering drains any EXECUTE issued before the controlled abort.
        await bundle.observer.connection`SELECT 1`;
        await bundle.observer.connection`DEALLOCATE twilight_observer_probe`;
        await bundle.observer.connection.unsafe(statement);
        await observer.waitForWriters(AbortSignal.timeout(2000));
      },
    );
  });

  test('does not certify captured parallel worker exit while they are live', async () => {
    await withParallelWriter(true, async ({ countWorkers, waitForWorkersToExit }) => {
      expect(await countWorkers()).toBe(2);
      // Proof: F3 returned early from this barrier; this held-worker test lost its expected timeout rejection.
      await rejects(
        waitForWorkersToExit(),
        (cause: unknown) => cause instanceof DOMException && cause.name === 'TimeoutError',
      );
      expect(await countWorkers()).toBe(2);
    });
  });

  test('rejects unresolved non-null parallel ancestry with an unregistered hidden leader', async () => {
    await withParallelWriter(false, async ({ bundle, observer, statement }) => {
      const danglingProbe = statement
        .replace(
          'FROM pg_catalog.pg_stat_activity) AS activities',
          `FROM pg_catalog.pg_stat_activity WHERE application_name <> '${bundle.writerName}' OR backend_type = 'parallel worker') AS activities`,
        )
        .replace(
          "'applicationName', application_name, 'leaderPid'",
          "'applicationName', CASE WHEN backend_type = 'parallel worker' THEN '' ELSE application_name END, 'leaderPid'",
        );
      await bundle.observer.connection`DEALLOCATE twilight_observer_probe`;
      await bundle.observer.connection.unsafe(danglingProbe);
      await rejects(observer.waitForWriters(AbortSignal.timeout(2000)), /ambiguous.*ancestry/);
    });
  });

  test('rejects cyclic parallel ancestry rather than treating workers as unrelated', async () => {
    await withParallelWriter(false, async ({ bundle, observer, statement }) => {
      const cyclicProbe = statement
        .replace(
          'FROM pg_catalog.pg_stat_activity) AS activities',
          `FROM pg_catalog.pg_stat_activity WHERE application_name <> '${bundle.writerName}' OR backend_type = 'parallel worker') AS activities`,
        )
        .replace(
          "'applicationName', application_name, 'leaderPid', leader_pid",
          "'applicationName', CASE WHEN backend_type = 'parallel worker' THEN '' ELSE application_name END, 'leaderPid', CASE WHEN backend_type = 'parallel worker' THEN pid ELSE leader_pid END",
        );
      await bundle.observer.connection`DEALLOCATE twilight_observer_probe`;
      await bundle.observer.connection.unsafe(cyclicProbe);
      await rejects(observer.waitForWriters(AbortSignal.timeout(2000)), /ambiguous.*ancestry/);
    });
  });

  test('rejects parallel ancestry that crosses role or database identities', async () => {
    for (const { name, expression } of [
      { name: "'roleOid'", expression: 'usesysid::text' },
      { name: "'databaseOid'", expression: 'datid::text' },
    ]) {
      await withParallelWriter(false, async ({ bundle, observer, writer, statement }) => {
        const coordinate = `${name}, ${expression}`;
        const foreignProbe = statement
          .replaceAll(
            coordinate,
            `${name}, CASE WHEN pid = ${String(writer.pid)} THEN '1' ELSE ${expression} END`,
          )
          .replace(
            "'applicationName', application_name, 'leaderPid'",
            `'applicationName', CASE WHEN pid = ${String(writer.pid)} THEN 'unrelated_foreign_root' WHEN backend_type = 'parallel worker' THEN '' ELSE application_name END, 'leaderPid'`,
          );
        await bundle.observer.connection`DEALLOCATE twilight_observer_probe`;
        await bundle.observer.connection.unsafe(foreignProbe);
        await rejects(
          observer.waitForWriters(AbortSignal.timeout(2000)),
          /parallel writer identity/,
        );
      });
    }
  });

  test('excludes unrelated parallel descendants after a registered PID has a new backend start', async () => {
    await withParallelWriter(true, async ({ bundle, observer, writer, statement }) => {
      const replacedProbe = statement
        .replaceAll(
          "'startedAt', EXTRACT(EPOCH FROM backend_start)::text",
          `'startedAt', CASE WHEN pid = ${String(writer.pid)} THEN '0' ELSE EXTRACT(EPOCH FROM backend_start)::text END`,
        )
        .replace(
          "'applicationName', application_name, 'leaderPid'",
          `'applicationName', CASE WHEN pid = ${String(writer.pid)} THEN 'unrelated_replacement' WHEN backend_type = 'parallel worker' THEN '' ELSE application_name END, 'leaderPid'`,
        );
      await bundle.observer.connection`DEALLOCATE twilight_observer_probe`;
      await bundle.observer.connection.unsafe(replacedProbe);
      await observer.waitForWriters(AbortSignal.timeout(2000));
    });
  });

  test('rejects ancestry after a proven PID replacement disappears on a later scan', async () => {
    await withParallelWriter(true, async ({ bundle, observer, writer, statement }) => {
      const replacedProbe = statement
        .replaceAll(
          "'startedAt', EXTRACT(EPOCH FROM backend_start)::text",
          `'startedAt', CASE WHEN pid = ${String(writer.pid)} THEN '0' ELSE EXTRACT(EPOCH FROM backend_start)::text END`,
        )
        .replace(
          "'applicationName', application_name, 'leaderPid'",
          `'applicationName', CASE WHEN pid = ${String(writer.pid)} THEN 'unrelated_replacement' WHEN backend_type = 'parallel worker' THEN '' ELSE application_name END, 'leaderPid'`,
        );
      await bundle.observer.connection`DEALLOCATE twilight_observer_probe`;
      await bundle.observer.connection.unsafe(replacedProbe);
      await observer.waitForWriters(AbortSignal.timeout(2000));
      const missingReplacement = replacedProbe.replace(
        'FROM pg_catalog.pg_stat_activity) AS activities',
        `FROM pg_catalog.pg_stat_activity WHERE pid <> ${String(writer.pid)}) AS activities`,
      );
      await bundle.observer.connection`DEALLOCATE twilight_observer_probe`;
      await bundle.observer.connection.unsafe(missingReplacement);
      await rejects(observer.waitForWriters(AbortSignal.timeout(2000)), /ambiguous.*ancestry/);
    });
  });

  test('closes the writer after failed observer fixture acquisition', async () => {
    const administrator = await openConnection(`admin_${crypto.randomUUID().replaceAll('-', '')}`);
    const role = `limited_${crypto.randomUUID().replaceAll('-', '')}`;
    let reopened: Awaited<ReturnType<typeof openConnection>> | undefined;
    try {
      await administrator.connection.unsafe(`CREATE ROLE ${role} LOGIN CONNECTION LIMIT 1`);
      await rejects(openBundle(role), /too many connections for role/);
      const deadline = AbortSignal.timeout(2000);
      let remaining = true;
      while (remaining) {
        deadline.throwIfAborted();
        const backends = await administrator.connection<{ count: number }[]>`
          SELECT count(*)::integer AS count FROM pg_catalog.pg_stat_activity WHERE usename = ${role}
        `;
        const count = backends.at(0)?.count;
        if (count === undefined) throw new Error('missing fixture acquisition catalogue');
        remaining = count > 0;
        await Bun.sleep(5);
      }
      reopened = await openConnection(`reopened_${crypto.randomUUID().replaceAll('-', '')}`, role);
    } finally {
      if (reopened !== undefined) await reopened.close();
      const backends = await administrator.connection<{ pid: number }[]>`
        SELECT pid FROM pg_catalog.pg_stat_activity WHERE usename = ${role}
      `;
      for (const backend of backends)
        await administrator.connection`SELECT pg_terminate_backend(${backend.pid})`;
      await administrator.connection.unsafe(`DROP ROLE IF EXISTS ${role}`);
      await administrator.close();
    }
  });

  test('sees same-role backends without superuser or pg_read_all_stats', async () => {
    const administrator = await openConnection(`admin_${crypto.randomUUID().replaceAll('-', '')}`);
    const role = `writer_role_${crypto.randomUUID().replaceAll('-', '')}`;
    let bundle: Awaited<ReturnType<typeof openBundle>> | undefined;
    try {
      await administrator.connection.unsafe(`CREATE ROLE ${role} LOGIN`);
      bundle = await openBundle(role);
      const privileges = await bundle.writer.connection<{ superuser: boolean; stats: boolean }[]>`
        SELECT rolsuper AS superuser, pg_has_role(current_user, 'pg_read_all_stats', 'MEMBER') AS stats
        FROM pg_catalog.pg_roles WHERE rolname = current_user
      `;
      expect(privileges[0]).toEqual({ superuser: false, stats: false });
      const observer = await bundle.create();
      const writer = await readPostgresWriter(
        bundle.writer.connection,
        bundle.writerName,
        AbortSignal.timeout(2000),
      );
      await observer.register(writer, AbortSignal.timeout(2000));
      await bundle.writer.close();
      await observer.waitForWriters(AbortSignal.timeout(2000));
    } finally {
      if (bundle !== undefined) await bundle.close();
      await administrator.connection.unsafe(`DROP ROLE IF EXISTS ${role}`);
      await administrator.close();
    }
  });

  test('rejects role changes on the reserved observer', async () => {
    const bundle = await openBundle();
    const administrator = await openConnection(`admin_${crypto.randomUUID().replaceAll('-', '')}`);
    const role = `observer_role_${crypto.randomUUID().replaceAll('-', '')}`;
    try {
      await administrator.connection.unsafe(`CREATE ROLE ${role} NOLOGIN`);
      await administrator.connection.unsafe(`GRANT pg_read_all_stats TO ${role}`);
      const observer = await bundle.create();
      await bundle.observer.connection.unsafe(`SET ROLE ${role}`);
      await bundle.writer.close();
      await rejects(observer.waitForWriters(AbortSignal.timeout(2000)));
    } finally {
      await bundle.close();
      await administrator.connection.unsafe(`DROP ROLE IF EXISTS ${role}`);
      await administrator.close();
    }
  });

  test('rejects server-side loss of the reserved observer backend', async () => {
    const bundle = await openBundle();
    const administrator = await openConnection(`admin_${crypto.randomUUID().replaceAll('-', '')}`);
    try {
      const observer = await bundle.create();
      const identity = await readPostgresWriter(
        bundle.observer.connection,
        bundle.observerName,
        AbortSignal.timeout(2000),
      );
      await administrator.connection`SELECT pg_terminate_backend(${identity.pid})`;
      await bundle.writer.close();
      await rejects(observer.waitForWriters(AbortSignal.timeout(2000)));
    } finally {
      await bundle.close();
      await administrator.close();
    }
  });

  test('rejects an absent activity catalogue instead of treating it as empty', async () => {
    const bundle = await openBundle();
    try {
      const observer = await bundle.create();
      const statement = await findProbe(bundle.observer.connection);
      await bundle.observer.connection`DEALLOCATE twilight_observer_probe`;
      await bundle.observer.connection.unsafe(
        statement.replace(
          'FROM pg_catalog.pg_stat_activity) AS activities',
          'FROM pg_catalog.pg_stat_activity WHERE false) AS activities',
        ),
      );
      await bundle.writer.close();
      await rejects(observer.waitForWriters(AbortSignal.timeout(2000)), /activity visibility/);
    } finally {
      await bundle.close();
    }
  });

  test('rejects invalid poll budget and unsafe or colliding startup cookies', async () => {
    const bundle = await openBundle();
    try {
      for (const changes of [
        { pollMilliseconds: 0 },
        { pollMilliseconds: 0.1 },
        { pollMilliseconds: 2147483648 },
        { writerName: 'unsafe cookie' },
        { observerName: bundle.writerName },
      ]) {
        await rejects(
          createPostgresObserver(
            bundle.observer.connection,
            {
              writerName: bundle.writerName,
              observerName: bundle.observerName,
              pollMilliseconds: 5,
              ...changes,
            },
            AbortSignal.timeout(2000),
          ),
        );
      }
    } finally {
      await bundle.close();
    }
  });
});
