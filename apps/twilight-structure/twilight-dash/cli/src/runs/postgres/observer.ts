import type { ReservedSQL } from 'bun';

import { awaitCompletion } from './deadline';

/** Exact server identity; backend-start epoch text never passes through a JavaScript Date. */
export interface PostgresWriter {
  readonly pid: number;
  readonly startedAt: string;
  readonly databaseOid: string;
  readonly roleOid: string;
  readonly applicationName: string;
}

interface PostgresActivity {
  readonly fields: Record<string, unknown>;
  readonly pid: number;
  readonly leaderPid: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('invalid PostgreSQL catalog record');
  }
  return value;
}

function readPid(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error('missing PostgreSQL backend visibility');
  }
  return value;
}

function readIdentity(fields: Record<string, unknown>): PostgresWriter {
  const { startedAt, databaseOid, roleOid, applicationName } = fields;
  if (
    typeof startedAt !== 'string' ||
    !/^\d+(\.\d+)?$/.test(startedAt) ||
    typeof databaseOid !== 'string' ||
    !/^[1-9]\d*$/.test(databaseOid) ||
    typeof roleOid !== 'string' ||
    !/^[1-9]\d*$/.test(roleOid) ||
    typeof applicationName !== 'string'
  ) {
    throw new Error('missing PostgreSQL backend visibility');
  }
  return { pid: readPid(fields['pid']), startedAt, databaseOid, roleOid, applicationName };
}

function isIdentity(left: PostgresWriter, right: PostgresWriter): boolean {
  return (
    left.pid === right.pid &&
    left.startedAt === right.startedAt &&
    left.databaseOid === right.databaseOid &&
    left.roleOid === right.roleOid &&
    left.applicationName === right.applicationName
  );
}

function validateCookie(cookie: string): void {
  if (!/^[a-zA-Z0-9_]{1,63}$/.test(cookie)) throw new Error('invalid PostgreSQL startup cookie');
}

/** Reads the startup-tagged reserved writer before its owner permits persistent mutation. */
export async function readPostgresWriter(
  connection: ReservedSQL,
  applicationName: string,
  signal: AbortSignal,
): Promise<PostgresWriter> {
  signal.throwIfAborted();
  validateCookie(applicationName);
  const rows = await awaitCompletion(
    connection<unknown[]>`
    SELECT pid, EXTRACT(EPOCH FROM backend_start)::text AS "startedAt",
      datid::text AS "databaseOid", usesysid::text AS "roleOid",
      application_name AS "applicationName"
    FROM pg_catalog.pg_stat_activity WHERE pid = pg_catalog.pg_backend_pid()
  `,
    signal,
  );
  if (rows.length !== 1) throw new Error('missing PostgreSQL writer identity');
  const writer = readIdentity(readRecord(rows[0]));
  if (writer.applicationName !== applicationName)
    throw new Error('PostgreSQL writer identity cookie changed');
  return writer;
}

/**
 * Observes one direct-server reserved session using only fixed catalog reads.
 * The owner must fence future writer creation, drain admitted work, and close
 * writer reservations/pools before waitForWriters can certify disappearance.
 * This does not determine unanswered COMMIT outcomes or prove process reaping.
 * Registered roots survive absence; a visible replacement backend-start removes
 * the previous PID from ancestry roots. Untagged parallel ancestry must resolve
 * to an identified root; missing links or cycles reject observation.
 * The owner also disposes this read-only reservation after observation ends.
 */
export async function createPostgresObserver(
  connection: ReservedSQL,
  configuration: {
    readonly observerName: string;
    readonly writerName: string;
    readonly pollMilliseconds: number;
  },
  signal: AbortSignal,
): Promise<{
  register(writer: PostgresWriter, signal: AbortSignal): Promise<void>;
  waitForWriters(signal: AbortSignal): Promise<void>;
}> {
  signal.throwIfAborted();
  const { observerName, writerName, pollMilliseconds } = configuration;
  validateCookie(observerName);
  validateCookie(writerName);
  if (
    observerName === writerName ||
    !Number.isSafeInteger(pollMilliseconds) ||
    pollMilliseconds <= 0 ||
    pollMilliseconds > 2147483647
  ) {
    throw new Error('invalid PostgreSQL observer configuration');
  }
  const observer = await readPostgresWriter(connection, observerName, signal);
  await awaitCompletion(connection`SET default_transaction_read_only = on`, signal);
  const marker = crypto.randomUUID().replaceAll('-', '');
  // Only the internally generated hexadecimal marker enters this fixed statement.
  await awaitCompletion(
    connection.unsafe(`PREPARE twilight_observer_probe AS
    SELECT '${marker}'::text AS marker, pg_catalog.pg_backend_pid() AS pid,
      current_user::regrole::oid::text AS "currentRoleOid",
      pg_catalog.current_setting('default_transaction_read_only') AS "defaultReadOnly",
      pg_catalog.current_setting('transaction_read_only') AS "transactionReadOnly",
      (SELECT pg_catalog.jsonb_build_object(
        'pid', pid, 'startedAt', EXTRACT(EPOCH FROM backend_start)::text,
        'databaseOid', datid::text, 'roleOid', usesysid::text,
        'applicationName', application_name)
       FROM pg_catalog.pg_stat_activity WHERE pid = pg_catalog.pg_backend_pid()) AS observer,
      (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'pid', pid, 'startedAt', EXTRACT(EPOCH FROM backend_start)::text,
        'databaseOid', datid::text, 'roleOid', usesysid::text,
        'applicationName', application_name, 'leaderPid', leader_pid,
        'backendType', backend_type, 'state', state))
       FROM pg_catalog.pg_stat_activity) AS activities
  `),
    signal,
  );
  const writers: PostgresWriter[] = [];

  async function inspect(deadline: AbortSignal): Promise<PostgresActivity[]> {
    deadline.throwIfAborted();
    // Proof: O2 deallocated the real session probe; the missing-prepared-probe test observed EXECUTE rejection instead of false absence.
    const rows = await awaitCompletion(
      connection<unknown[]>`EXECUTE twilight_observer_probe`,
      deadline,
    );
    if (rows.length !== 1) throw new Error('missing PostgreSQL observer inspection');
    const inspection = readRecord(rows[0]);
    // Proof: O3 replaced the prepared SELECT marker; the actual observer rejected the replacement.
    if (
      inspection['marker'] !== marker ||
      inspection['pid'] !== observer.pid ||
      // Proof: O6 changed to a real role retaining pg_read_all_stats; removing this guard allowed false successful absence.
      inspection['currentRoleOid'] !== observer.roleOid ||
      // Proof: O7 removed read-only validation; the changed-policy test lost its expected rejection.
      inspection['defaultReadOnly'] !== 'on' ||
      inspection['transactionReadOnly'] !== 'on' ||
      !isIdentity(readIdentity(readRecord(inspection['observer'])), observer)
    ) {
      throw new Error('PostgreSQL observer session continuity lost');
    }
    const activities = inspection['activities'];
    // Proof: O11 replaced missing-catalog rejection with an empty scan; the absent-catalog test lost its expected rejection.
    if (!Array.isArray(activities)) throw new Error('missing PostgreSQL activity visibility');
    return activities.map((value: unknown) => {
      const fields = readRecord(value);
      const leader = fields['leaderPid'];
      if (leader !== null) readPid(leader);
      return {
        fields,
        pid: readPid(fields['pid']),
        leaderPid: leader === null ? null : readPid(leader),
      };
    });
  }

  function ownedActivities(activities: readonly PostgresActivity[]): PostgresWriter[] {
    const visible = new Map<number, PostgresActivity>(
      activities.map((activity) => [activity.pid, activity]),
    );
    const leaders = new Set<number>();
    for (const writer of writers) {
      const current = visible.get(writer.pid);
      // Proof: O13 removed PID/start reconciliation; the real-worker replacement test waited for unrelated descendants and hit its deadline.
      if (current !== undefined && readIdentity(current.fields).startedAt !== writer.startedAt)
        continue;
      leaders.add(writer.pid);
    }
    const owned = new Set<number>();
    for (const activity of activities) {
      const fields = activity.fields;
      const sameScope =
        fields['databaseOid'] === observer.databaseOid && fields['roleOid'] === observer.roleOid;
      const registered = writers.some(
        (writer) =>
          writer.pid === activity.pid &&
          (fields['startedAt'] === writer.startedAt || fields['startedAt'] === null),
      );
      if (sameScope || registered || fields['applicationName'] === writerName) {
        // Proof: O4 hid a same-role writer's backend-start; observation rejected the missing visibility.
        const identity = readIdentity(fields);
        if (typeof fields['state'] !== 'string' || typeof fields['backendType'] !== 'string') {
          throw new Error('missing PostgreSQL backend visibility');
        }
        // Proof: O10 removed this guard; hiding real parallel-worker leaders lost the expected ambiguous-ownership rejection.
        if (fields['backendType'] === 'parallel worker' && activity.leaderPid === null) {
          throw new Error('ambiguous PostgreSQL parallel writer ownership');
        }
        if (registered || identity.applicationName === writerName) {
          // Proof: O5 changed the real registered writer cookie; identity validation rejected the retagged backend.
          if (identity.applicationName !== writerName || !sameScope)
            throw new Error('PostgreSQL writer identity changed');
          owned.add(activity.pid);
          leaders.add(activity.pid);
        }
      }
    }
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const activity of activities) {
        if (
          !owned.has(activity.pid) &&
          activity.leaderPid !== null &&
          // Proof: O9 removed descendant traversal; real untagged workers completed observation before close.
          leaders.has(activity.leaderPid)
        ) {
          const identity = readIdentity(activity.fields);
          if (
            identity.databaseOid !== observer.databaseOid ||
            identity.roleOid !== observer.roleOid
          ) {
            throw new Error('PostgreSQL parallel writer identity changed');
          }
          owned.add(activity.pid);
          leaders.add(activity.pid);
          expanded = true;
        }
      }
    }
    for (const activity of activities) {
      if (
        owned.has(activity.pid) ||
        activity.leaderPid === null ||
        activity.fields['databaseOid'] !== observer.databaseOid ||
        activity.fields['roleOid'] !== observer.roleOid
      )
        continue;
      const ancestry = new Set<number>();
      let ancestor = activity;
      while (ancestor.leaderPid !== null) {
        // Proof: O14 removed cycle rejection; real workers with self-referential catalog links no longer produced the expected ancestry error.
        if (ancestry.has(ancestor.pid))
          throw new Error('ambiguous PostgreSQL parallel writer ancestry');
        ancestry.add(ancestor.pid);
        const leader = visible.get(ancestor.leaderPid);
        // Proof: O12 skipped unresolved non-null links; real workers with an unregistered hidden leader falsely completed observation.
        if (leader === undefined) throw new Error('ambiguous PostgreSQL parallel writer ancestry');
        const identity = readIdentity(leader.fields);
        // Proof: O15 removed ancestry scope validation; real workers with a foreign-role/database root lost their expected identity rejection.
        if (
          identity.databaseOid !== observer.databaseOid ||
          identity.roleOid !== observer.roleOid
        ) {
          throw new Error('PostgreSQL parallel writer identity changed');
        }
        ancestor = leader;
      }
    }
    return activities
      .filter((activity) => owned.has(activity.pid))
      .map((activity) => readIdentity(activity.fields));
  }

  ownedActivities(await inspect(signal));
  return {
    async register(writer, deadline) {
      const candidate = readIdentity(readRecord(writer));
      if (
        candidate.applicationName !== writerName ||
        candidate.databaseOid !== observer.databaseOid ||
        candidate.roleOid !== observer.roleOid
      )
        throw new Error('PostgreSQL writer identity outside observer scope');
      const visible = ownedActivities(await inspect(deadline));
      // Proof: O8 removed the exact visible-identity match; the wrong-start registration test lost its expected rejection.
      if (!visible.some((identity) => isIdentity(identity, candidate))) {
        throw new Error('PostgreSQL writer identity not visible');
      }
      if (!writers.some((identity) => isIdentity(identity, candidate))) writers.push(candidate);
    },
    async waitForWriters(deadline) {
      // Proof: O1 bypassed this actual activity classification; the idle writer test completed before its real close.
      while (ownedActivities(await inspect(deadline)).length > 0) {
        await awaitCompletion(Bun.sleep(pollMilliseconds), deadline);
      }
    },
  };
}
