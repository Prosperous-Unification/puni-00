import { mkdtempSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ClaimStore } from '@wbs/core';
import { sql } from 'drizzle-orm';

import { openDatabase } from '../db';
import {
  claimRows,
  commandOf,
  copyFixture,
  journalCount,
  OCCUPIED,
  type Opened,
  openFixture,
  prepare,
  readClaim,
  readFixture,
  readJournalHead,
  releaseClaim,
  RESOURCE,
  same,
  setCapacity,
  snapshot,
  STATED,
} from './measure-shared-occupancy-fixture';
import {
  type Arm,
  armsOf,
  type ClaimTarget,
  type MeasurementRow,
  PAIRS,
  readMeasurement,
} from './shared-occupancy-measurement';

const WARMUPS = 8;

function record(kind: string, fields: object): void {
  console.log(JSON.stringify({ kind, ...fields }));
}

function fixturePaths(folder: string) {
  return { db: join(folder, 'seed.db'), manifest: join(folder, 'fixture.json') };
}

function pragmas(opened: Opened) {
  const db = opened.source.db;
  return {
    version: db.all(
      'SELECT sqlite_version() AS sqlite_version, sqlite_source_id() AS sqlite_source_id',
    ),
    ...Object.fromEntries(
      [
        'page_size',
        'journal_mode',
        'synchronous',
        'busy_timeout',
        'wal_autocheckpoint',
        'foreign_keys',
      ].map((name) => [name, db.all(`PRAGMA ${name}`)]),
    ),
  };
}

function files(db: string) {
  const physical = statSync(db);
  return {
    bytes: physical.size,
    device: physical.dev,
    inode: physical.ino,
    walBytes: statSync(`${db}-wal`, { throwIfNoEntry: false })?.size ?? 0,
    shmBytes: statSync(`${db}-shm`, { throwIfNoEntry: false })?.size ?? 0,
  };
}

function observeAggregate(suppressed: boolean) {
  const queries: { query: string; binds: unknown[]; inWrite: boolean }[] = [];
  const calls: { ids: readonly string[]; inWrite: boolean }[] = [];
  let inWrite = false;

  return {
    queries,
    calls,
    logger: {
      logQuery(query: string, binds: unknown[]) {
        if (query === 'BEGIN IMMEDIATE') inWrite = true;
        if (query === 'COMMIT' || query === 'ROLLBACK') inWrite = false;
        if (query.includes('SUM(CASE WHEN leaf.owned')) queries.push({ query, binds, inWrite });
      },
    },
    claims(claims: ClaimStore): ClaimStore {
      // The real staged repository retains its own receiver and connection.
      return new Proxy(claims, {
        get(repo, name) {
          if (name === 'organizationUnitsOf')
            return async (ids: readonly string[]) => {
              calls.push({ ids, inWrite });
              return suppressed ? [] : await repo.organizationUnitsOf(ids);
            };
          const member: unknown = Reflect.get(repo, name);
          if (typeof member !== 'function') return member;
          return (...args: unknown[]): unknown => Reflect.apply(member, repo, args);
        },
      });
    },
  };
}

/** Reads the ordinary claim's post-commit tree publication from the fixture broadcaster. */
function claimPublications(opened: Opened, from: number, target: ClaimTarget) {
  const publications = opened.broadcast.published.slice(from);
  // Proof: the first warmup rejected a real commit when it expected the lease-only claims_changed.
  if (
    !publications.some(
      ({ workPackageId, event }) =>
        workPackageId === target.workPackageId &&
        event.type === 'tree_replaced' &&
        event.workItems.some(({ id }) => id === target.workItemId),
    )
  )
    throw new Error(
      `Claim on ${target.workItemId} did not publish its updated tree before replying`,
    );
  return publications.map(({ workPackageId, event }) => ({ workPackageId, type: event.type }));
}

async function controls(folder: string, scratch: string, fault: boolean): Promise<void> {
  const { db, manifest } = fixturePaths(folder);
  const fixture = readFixture(db, manifest);
  const sibling = join(scratch, 'control.db');
  const copy = copyFixture(db, sibling, fixture.sha256);
  const observed = observeAggregate(fault);
  const opened = openFixture(sibling, fixture.minted, observed);
  try {
    const target = fixture.spares.at(0);
    if (target === undefined) throw new Error('Missing disposable claim target');
    const baseline = snapshot(opened.read, fixture);
    const command = commandOf(target);
    const claim = () => opened.run(target.workPackageId, [command]);
    const journal = journalCount(opened.read, target.workPackageId);
    await setCapacity(opened, OCCUPIED);
    const refusal = await claim();
    // Proof: the staged aggregate omission made this real scoped claim commit both steps.
    if (
      refusal.ok ||
      !('reason' in refusal) ||
      refusal.reason !== 'resources_exhausted' ||
      refusal.detail.resourceId !== RESOURCE ||
      refusal.detail.free !== 0 ||
      refusal.detail.asked !== 1 ||
      !refusal.detail.resources.some(
        (resource) => 'scope' in resource && resource.scope === 'organization',
      ) ||
      claimRows(opened.read, target.workItemId).length !== 0 ||
      journalCount(opened.read, target.workPackageId) !== journal
    ) {
      record('aggregate-refusal-failure', {
        answer: refusal,
        calls: observed.calls,
        queries: observed.queries,
      });
      throw new Error(
        'Expected organization aggregate refusal without durable claim or journal write',
      );
    }
    record('aggregate-refusal', { answer: refusal, baselineJournal: journal, copy });

    await setCapacity(opened, STATED);
    const beforeStated = observed.calls.length;
    const beforeStatedQueries = observed.queries.length;
    const statedStart = opened.broadcast.published.length;
    const stated = readClaim(opened.read, target, await claim());
    const statedPublications = claimPublications(opened, statedStart, target);
    if (
      !same(observed.calls.slice(beforeStated), [{ ids: [RESOURCE], inWrite: true }]) ||
      observed.queries.length !== beforeStatedQueries + 1 ||
      !same(observed.queries.at(-1)?.binds, [RESOURCE]) ||
      observed.queries.at(-1)?.inWrite !== true
    )
      throw new Error('Stated sample did not read the aggregate on the staged write connection');
    await releaseClaim(opened, target);

    await setCapacity(opened, null);
    const beforeUnstated = observed.calls.length;
    const unstatedStart = opened.broadcast.published.length;
    const unstated = readClaim(opened.read, target, await claim());
    const unstatedPublications = claimPublications(opened, unstatedStart, target);
    if (observed.calls.length !== beforeUnstated)
      throw new Error('Unstated sample read the organization aggregate');
    await releaseClaim(opened, target);

    const membership = opened.source.db
      .all<{ organizationId: string; userId: string }>(
        sql`
      SELECT organization_id AS organizationId, user_id AS userId FROM organization_membership
    `,
      )
      .at(0);
    if (membership === undefined) throw new Error('Missing control membership');
    const beforeMembership = journalCount(opened.read, target.workPackageId);
    opened.source.db.run(sql`
      DELETE FROM organization_membership WHERE organization_id = ${membership.organizationId}
      AND user_id = ${membership.userId}
    `);
    const removed = await claim();
    if (
      !same(removed, { ok: false, refusal: 'not_a_member' }) ||
      claimRows(opened.read, target.workItemId).length !== 0 ||
      journalCount(opened.read, target.workPackageId) !== beforeMembership
    )
      throw new Error(
        `Current membership removal did not refuse atomically: ${JSON.stringify(removed)}`,
      );
    opened.source.db.run(sql`
      INSERT INTO organization_membership (organization_id, user_id, role, created_at)
      VALUES (${membership.organizationId}, ${membership.userId}, 'admin', 1000)
    `);
    if (!same(snapshot(opened.read, fixture), baseline))
      throw new Error('Disposable controls changed the standing cohort');
    record('controls', {
      stated,
      unstated,
      statedPublications,
      unstatedPublications,
      removed,
      calls: observed.calls,
      queries: observed.queries,
      database: files(sibling),
      sqlite: pragmas(opened),
    });
  } finally {
    await opened.close();
  }
}

async function sample(
  opened: Opened,
  target: ClaimTarget,
  phase: MeasurementRow['phase'],
  pair: number,
  order: number,
  arm: Arm,
): Promise<MeasurementRow> {
  const commands = [commandOf(target)];
  const before = readJournalHead(opened.read, target.workPackageId);
  if (claimRows(opened.read, target.workItemId).length !== 0)
    throw new Error(`Target ${target.workItemId} is already occupied before pair ${String(pair)}`);
  const announced = opened.broadcast.published.length;
  const started = performance.now();
  const reply = await opened.run(target.workPackageId, commands);
  const ended = performance.now();
  const durationMs = ended - started;
  try {
    const claim = readClaim(opened.read, target, reply);
    const journal = readJournalHead(opened.read, target.workPackageId);
    if (
      !Number.isFinite(durationMs) ||
      durationMs <= 0 ||
      journal.seq !== before.seq + 1 ||
      journal.id === before.id
    )
      throw new Error(
        `Expected positive duration and one durable journal write for pair ${String(pair)} arm ${arm}`,
      );
    const publications = claimPublications(opened, announced, target);
    await releaseClaim(opened, target);
    const afterRelease = readJournalHead(opened.read, target.workPackageId);
    if (afterRelease.seq !== journal.seq + 1 || afterRelease.id === journal.id)
      throw new Error(
        `Expected a durable release journal write for pair ${String(pair)} arm ${arm}`,
      );
    const row: MeasurementRow = { phase, pair, order, arm, target, durationMs, claim };
    record('sample', {
      ...row,
      startedMs: started,
      endedMs: ended,
      commands,
      journal,
      afterRelease,
      publications,
    });
    return row;
  } catch (error) {
    record('failed-sample', {
      phase,
      pair,
      order,
      arm,
      target,
      startedMs: started,
      endedMs: ended,
      durationMs,
      reply,
    });
    throw error;
  }
}

async function measure(folder: string, scratch: string) {
  const { db, manifest } = fixturePaths(folder);
  const fixture = readFixture(db, manifest);
  const databases = { D: join(scratch, 'D.db'), U: join(scratch, 'U.db') };
  const d = copyFixture(db, databases.D, fixture.sha256);
  const u = copyFixture(db, databases.U, fixture.sha256);
  if (d.inode === u.inode) throw new Error('The timed arms share a database file');

  const D = openFixture(databases.D, fixture.minted);
  try {
    const U = openFixture(databases.U, fixture.minted);
    try {
      const arms = { D, U };
      const cohort = snapshot(D.read, fixture);
      if (!same(snapshot(U.read, fixture), cohort) || !same(pragmas(D), pragmas(U)))
        throw new Error('Paired starting state differs');
      const startable = fixture.spares.slice(0, WARMUPS + PAIRS);
      const targets = startable.slice(WARMUPS);
      record('setup', {
        D: d,
        U: u,
        seed: fixture.sha256,
        minted: fixture.minted,
        workPackages: cohort.workPackages,
        standingStepClaims: 2 * OCCUPIED,
        occupiedUnits: OCCUPIED,
        sparePersons: fixture.spares.length,
        sqlite: pragmas(D),
        pairs: PAIRS,
        warmups: WARMUPS,
        clock: 'performance.now',
        clockOriginEpochMs: performance.timeOrigin,
        bun: Bun.version,
        bunRevision: Bun.revision,
        firstOrder: 'D/U, then U/D',
      });
      await setCapacity(D, STATED);
      await setCapacity(U, null);
      if (D.minted() !== U.minted()) throw new Error('Capacity setup desynchronized arm clocks');
      const rows: MeasurementRow[] = [];
      for (const [index, target] of startable.entries()) {
        const phase = index < WARMUPS ? 'warmup' : 'measured';
        const pair = phase === 'warmup' ? index + 1 : index - WARMUPS + 1;
        const paired: MeasurementRow[] = [];
        for (const [order, arm] of armsOf(pair).entries())
          paired.push(await sample(arms[arm], target, phase, pair, order + 1, arm));
        if (D.minted() !== U.minted() || !same(paired.at(0)?.claim, paired.at(1)?.claim))
          throw new Error(`Arm writes differed for ${phase} pair ${String(pair)}`);
        if (phase === 'measured') rows.push(...paired);
      }
      if (!same(snapshot(D.read, fixture), cohort) || !same(snapshot(U.read, fixture), cohort))
        throw new Error('A timed arm changed the original holders');
      const summary = readMeasurement(rows, targets, RESOURCE);
      record('summary', {
        ...summary,
        databases: { D: files(databases.D), U: files(databases.U) },
        minted: D.minted(),
        phase: 'measured',
        p99Rank: 198,
        p99Index: 197,
      });
      return summary;
    } finally {
      await U.close();
    }
  } finally {
    await D.close();
  }
}

async function diagnose(folder: string, scratch: string): Promise<void> {
  const { db, manifest } = fixturePaths(folder);
  const fixture = readFixture(db, manifest);
  const sibling = join(scratch, 'diagnostic.db');
  copyFixture(db, sibling, fixture.sha256);
  const observed = observeAggregate(false);
  const opened = openFixture(sibling, fixture.minted, observed);
  try {
    const target = fixture.spares.at(0);
    if (target === undefined) throw new Error('Missing diagnostic claim target');
    await setCapacity(opened, STATED);
    readClaim(opened.read, target, await opened.run(target.workPackageId, [commandOf(target)]));
    await releaseClaim(opened, target);
    const statement = observed.queries.at(0);
    if (
      observed.queries.length !== 1 ||
      statement === undefined ||
      !statement.inWrite ||
      !same(statement.binds, [RESOURCE])
    )
      throw new Error('Missing production statement and resource binding');
    const native = openDatabase(sibling);
    try {
      const explain = native.query(`EXPLAIN QUERY PLAN ${statement.query}`).all(RESOURCE);
      const query = native.query(statement.query);
      const durations = Array.from({ length: 200 }, () => {
        const started = performance.now();
        const aggregate = query.all(RESOURCE);
        const durationMs = performance.now() - started;
        if (!same(aggregate, [{ resourceId: RESOURCE, units: OCCUPIED, unowned: 0 }]))
          throw new Error('Diagnostic query changed the aggregate');
        return durationMs;
      });
      record('diagnostic', {
        ...statement,
        explain,
        durationMs: durations,
        resourceId: RESOURCE,
        sqlite: pragmas(opened),
        database: files(sibling),
      });
    } finally {
      native.close();
    }
  } finally {
    await opened.close();
  }
}

/** Runs the task 3.5 committed claim comparison on two private SQLite copies. */
async function main(): Promise<void> {
  const args = Bun.argv.slice(2);
  const scratch = mkdtempSync(join(tmpdir(), 'measure-shared-occupancy-'));
  const mode = args.at(0);
  const supplied = args.at(1);
  record('workspace', { scratch, mode: mode ?? 'full' });
  if (mode === undefined || mode === 'prepare') {
    if (args.length > 1) throw new Error('Expected only the prepare mode');
    const { db, manifest } = fixturePaths(scratch);
    const seeded = await prepare(db, manifest);
    record('prepared', {
      folder: scratch,
      seed: seeded.sha256,
      minted: seeded.minted,
      file: files(db),
      manifestBytes: statSync(manifest).size,
      standingLeaves: seeded.standing.length,
      spareLeaves: seeded.spares.length,
    });
    await controls(scratch, scratch, false);
    if (mode === 'prepare') return;
  } else if (!['measure', 'control', 'fault', 'diagnose'].includes(mode) || args.length !== 2) {
    throw new Error(
      'Expected prepare, measure <seed>, control <seed>, fault <seed> or diagnose <seed>',
    );
  }

  const folder = supplied ?? scratch;
  if (mode === 'control' || mode === 'fault') {
    await controls(folder, scratch, mode === 'fault');
  } else if (mode === 'diagnose') {
    await diagnose(folder, scratch);
  } else {
    const summary = await measure(folder, scratch);
    if (!summary.passes) process.exitCode = 2;
  }
}

await main();
