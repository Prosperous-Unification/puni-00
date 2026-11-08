import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Source, TransactionalStores } from '@wbs/core';
import type { AvailableWorkItemService as WorkItemService } from '@wbs/core/testing/available-work-item-service';
import { inMemoryServices } from '@wbs/core/testing/harness';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { personAdded } from '@wbs/store-memory/testing/service-fixtures';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { drizzle } from 'drizzle-orm/bun-sqlite';

import { ClaimRepository } from './claim';
import {
  type Connection,
  type Drizzle,
  openDatabase,
  openDrizzle,
  openReadOnlyConnection,
  openReadOnlyDatabase,
} from './db';
import { DirectoryRepository } from './directory';
import { OPEN } from './gate';
import { runMigrations } from './migrate';
import { ProjectRepository } from './project';
import { openSqliteSource } from './source';
import { INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY } from './testing/dependency-capability';
import { UserRepository } from './user';
import { WorkItemRepository } from './work-item';

const FOLDER = new URL('../../../../../apps/wbs/be-01/drizzle', import.meta.url).pathname;
const STAMP = { at: 1, by: 'owner' };
const LEGACY = { kind: 'legacy' } as const;
let folder: string;
let path: string;
let db: Drizzle;
let projects: ProjectRepository;
let directory: DirectoryRepository;
let service: WorkItemService;
let workItems: WorkItemRepository;
let claims: ClaimRepository;

/**
 * The claims read's one observation (`ClaimStore.observeProject`,
 * `wbs-claim-display` C1) over real SQLite, through a read-only connection of
 * its own as be-01 binds it: a writer racing the read, in this process or
 * another, never makes it answer a claim on a row it did not read; an open
 * batch's claim is not seen; and access the deployment withdrew after
 * admission is refused inside the observation.
 */
beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'wbs-claim-observation-'));
  path = join(folder, 'test.db');
  runMigrations(path, FOLDER);
  db = openDrizzle(path);
  directory = new DirectoryRepository(db, OPEN);
  projects = new ProjectRepository(db, OPEN);
  workItems = new WorkItemRepository(db, OPEN);
  claims = new ClaimRepository(db, OPEN, { openConnection: () => openReadOnlyConnection(path) });
  service = inMemoryServices({ projects, workItems, directory, claims }).service;
  await new UserRepository(db, OPEN).create(
    { id: 'owner', username: 'owner', passwordHash: 'x', createdAt: 1 },
    STAMP,
  );
  await projects.create(
    projectRow({ id: 'project', ownerId: 'owner' }),
    [
      {
        id: 'step-dev',
        projectId: 'project',
        name: 'Dev',
        position: 10,
        code: 'dev',
        allowancePercent: 0,
        estimateUnit: 'workdays' as const,
      },
    ],
    STAMP,
  );
  await personAdded(directory.addPerson({ id: 'codex', name: 'codex-fleet' }, [], STAMP));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

/** Tracks the actual read-only handle handed to the public claim observer. */
function createTrackedClaimObserver(failBegin = false) {
  const opened: Database[] = [];
  const settledAtClose: boolean[] = [];
  const observed = new ClaimRepository(db, OPEN, {
    openConnection: () => {
      const client = openReadOnlyDatabase(path);
      opened.push(client);
      const reader = drizzle({ client });
      return {
        db: failBegin
          ? new Proxy(reader, {
              get(target, key, receiver): unknown {
                if (key === 'run')
                  return () => {
                    throw new Error('injected BEGIN failure');
                  };
                return Reflect.get(target, key, receiver);
              },
            })
          : reader,
        close: () => {
          settledAtClose.push(!client.inTransaction);
          client.close();
        },
      };
    },
  });
  function assertSettledClose(): void {
    expect(opened).toHaveLength(1);
    expect(settledAtClose).toEqual([true]);
    const client = opened[0];
    expect(() => client.query('SELECT 1')).toThrow('Cannot use a closed database');
  }
  function closeLeakedHandles(): void {
    for (const client of opened) client.close();
  }
  return { observed, assertSettledClose, closeLeakedHandles };
}

/** Inserts a row and claims its step, as a concurrent batch would, after `delay` turns. */
async function claimNewRow(id: string, delay: number): Promise<void> {
  for (let turn = 0; turn < delay; turn += 1) await Promise.resolve();
  await workItems.insert(workItemRow({ id, projectId: 'project' }), [], STAMP);
  const written = await claims.add(
    [
      {
        id: `claim-${id}`,
        workItemId: id,
        stepId: 'step-dev',
        personId: 'codex',
        runId: null,
        parentClaimId: null,
        accountId: 'owner',
      },
    ],
    [],
    STAMP,
    [],
  );
  if (written !== 'written') throw new Error(`the racing claim was refused: ${written}`);
}

describe('the claims observation', () => {
  it('settles and closes its one owned connection after a successful claim read', async () => {
    const tracked = createTrackedClaimObserver();
    try {
      expect((await tracked.observed.observeProject('project', LEGACY)).kind).toBe('observed');
      tracked.assertSettledClose();
    } finally {
      tracked.closeLeakedHandles();
    }
  });

  it('settles and closes its one owned connection after not-found and modeled refusal', async () => {
    const absent = createTrackedClaimObserver();
    try {
      expect(await absent.observed.observeProject('nowhere', LEGACY)).toEqual({
        kind: 'not_found',
      });
      absent.assertSettledClose();
    } finally {
      absent.closeLeakedHandles();
    }
    db.run("UPDATE organization_activation SET state = 'activated', activated_at = 1");
    const refused = createTrackedClaimObserver();
    try {
      expect(await refused.observed.observeProject('project', LEGACY)).toEqual({
        kind: 'access_refused',
        refusal: 'no_active_organization',
      });
      refused.assertSettledClose();
    } finally {
      refused.closeLeakedHandles();
    }
  });

  it('rolls back and closes its one owned connection after a trusted-state read failure', async () => {
    db.run('DROP TABLE organization_activation');
    const tracked = createTrackedClaimObserver();
    try {
      const failure = await tracked.observed.observeProject('project', LEGACY).then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).toContain('organization activation marker is absent');
      tracked.assertSettledClose();
    } finally {
      tracked.closeLeakedHandles();
    }
  });

  it('closes an acquired owned connection when BEGIN fails before the read', async () => {
    const tracked = createTrackedClaimObserver(true);
    try {
      const failure = await tracked.observed.observeProject('project', LEGACY).then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).toContain('injected BEGIN failure');
      tracked.assertSettledClose();
    } finally {
      tracked.closeLeakedHandles();
    }
  });

  it('answers whatever a racing claim on a new row lands before or after', async () => {
    for (let delay = 0; delay < 40; delay += 1) {
      const reading = service.claimsWithin('project', LEGACY).then(
        (answer) => (answer === null || 'kind' in answer ? 'refused' : 'answered'),
        (error: unknown) => String(error),
      );
      const [outcome] = await Promise.all([reading, claimNewRow(`w-${String(delay)}`, delay)]);
      expect({ delay, outcome }).toEqual({ delay, outcome: 'answered' });
    }
  });

  it('refuses legacy access once the deployment is activated', async () => {
    expect((await claims.observeProject('project', LEGACY)).kind).toBe('observed');
    db.run("UPDATE organization_activation SET state = 'activated', activated_at = 1");
    expect(await claims.observeProject('project', LEGACY)).toEqual({
      kind: 'access_refused',
      refusal: 'no_active_organization',
    });
  });

  it('does not see a claim an open batch has not committed', async () => {
    db.run(
      "INSERT INTO work_item (id, project_id, position, name) VALUES ('w-staged', 'project', 1, 'Staged')",
    );
    // The batch's own transaction on the process connection, as sqliteUnitOfWork opens it.
    db.run('BEGIN IMMEDIATE');
    try {
      db.run(
        "INSERT INTO claim (id, work_item_id, step_id, person_id, created_at, created_by) VALUES ('claim-staged', 'w-staged', 'step-dev', 'codex', 1, 'owner')",
      );
      const observed = await claims.observeProject('project', LEGACY);
      if (observed.kind !== 'observed') throw new Error(`observed ${observed.kind}`);
      expect(observed.claims).toEqual([]);
    } finally {
      db.run('ROLLBACK');
    }
  });

  it('holds one snapshot while another connection commits a row and its claim', async () => {
    const writer: Database = openDatabase(path);
    let committed = false;
    const hooked = (): Connection => {
      const client = openReadOnlyDatabase(path);
      return {
        db: drizzle({
          client,
          logger: {
            logQuery(query) {
              // Between the observation's rows read and its claims read.
              if (committed || !query.includes('from "step"')) return;
              committed = true;
              writer.run(
                "INSERT INTO work_item (id, project_id, position, name) VALUES ('w-other', 'project', 1, 'Other')",
              );
              writer.run(
                "INSERT INTO claim (id, work_item_id, step_id, person_id, created_at, created_by) VALUES ('claim-other', 'w-other', 'step-dev', 'codex', 1, 'owner')",
              );
            },
          },
        }),
        close: () => {
          client.close();
        },
      };
    };
    const observing = inMemoryServices({
      projects,
      workItems,
      directory,
      claims: new ClaimRepository(db, OPEN, { openConnection: hooked }),
    }).service;
    try {
      const answer = await observing.claimsWithin('project', LEGACY);
      expect(committed).toBe(true);
      if (answer === null || 'kind' in answer) throw new Error('the first read did not answer');
      expect(answer.claims).toEqual([]);
      const after = await observing.claimsWithin('project', LEGACY);
      if (after === null || 'kind' in after) throw new Error('the second read did not answer');
      expect(after.claims.map(({ claimId }) => claimId)).toEqual(['claim-other']);
    } finally {
      writer.close();
    }
  });

  it('throws both failures when the savepoint does not roll back', async () => {
    // A connection whose reads fail and whose second statement, the savepoint
    // rollback, fails too: the first statement is the SAVEPOINT itself.
    let statements = 0;
    const broken = new Proxy(db, {
      get(target, key, receiver) {
        if (key === 'all')
          return () => {
            throw new Error('the read broke');
          };
        if (key === 'run')
          return (query: Parameters<Drizzle['run']>[0]) => {
            statements += 1;
            if (statements === 2) throw new Error('the rollback broke');
            return target.run(query);
          };
        const member: unknown = Reflect.get(target, key, receiver);
        return member;
      },
    });
    const failure = await new ClaimRepository(broken, OPEN).observeProject('project', LEGACY).then(
      () => null,
      (error: unknown) => error,
    );
    db.run('ROLLBACK');
    if (!(failure instanceof AggregateError)) throw new Error(`threw ${String(failure)}`);
    const [cause, rollbackCause] = failure.errors.map((each) => String(each));
    expect(cause).toContain('unreadable');
    expect(rollbackCause).toBe('Error: the rollback broke');
    expect(failure.errors).toHaveLength(2);
  });

  it('answers an absent project as not found', async () => {
    expect(await claims.observeProject('nowhere', LEGACY)).toEqual({ kind: 'not_found' });
  });
});

describe("the source's public claims read", () => {
  /** A source over the seeded test file, plain or bound as be-01 binds it. */
  function seededSource(bound: boolean): Source<TransactionalStores> {
    const plain = openSqliteSource({
      dbPath: path,
      dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
    });
    return bound ? plain.bindLivePlans({ schedulerOf: () => fastScheduler }) : plain;
  }

  for (const bound of [false, true]) {
    it(`does not see an open batch's claim (${bound ? 'bound' : 'plain'} source)`, async () => {
      const source = seededSource(bound);
      try {
        const seen = await source.uow.run(async ({ stores }) => {
          await stores.workItems.insert(
            workItemRow({ id: 'w-batch', projectId: 'project' }),
            [],
            STAMP,
          );
          const written = await stores.claims.add(
            [
              {
                id: 'claim-batch',
                workItemId: 'w-batch',
                stepId: 'step-dev',
                personId: 'codex',
                runId: null,
                parentClaimId: null,
                accountId: 'owner',
              },
            ],
            [],
            STAMP,
            [],
          );
          if (written !== 'written') throw new Error(`the batch claim was refused: ${written}`);
          // The batch itself sees its own claim; the public catalog must not.
          const own = await stores.claims.observeProject('project', LEGACY);
          const observed = await source.stores.claims.observeProject('project', LEGACY);
          return { commit: false, value: { own, observed } };
        });
        if (seen.own.kind !== 'observed' || seen.observed.kind !== 'observed')
          throw new Error('an observation did not answer');
        expect(seen.own.claims.map(({ id }) => id)).toEqual(['claim-batch']);
        expect(seen.observed.claims).toEqual([]);
      } finally {
        await source.close();
      }
    });
  }

  it('reuses one read connection and closes every pooled one with the source', async () => {
    const opened = { now: 0, ever: 0 };
    const source = openSqliteSource({
      dependencyCapability: INCAPABLE_BACKEND_DEPENDENCY_CAPABILITY,
      dbPath: path,
      openReadOnlyConnection: (dbPath) => {
        const connection = openReadOnlyConnection(dbPath);
        opened.now += 1;
        opened.ever += 1;
        return {
          db: connection.db,
          close: () => {
            connection.close();
            opened.now -= 1;
          },
        };
      },
    }).bindLivePlans({ schedulerOf: () => fastScheduler });
    await claimNewRow('w-first', 0);
    const first = await source.stores.claims.observeProject('project', LEGACY);
    await claimNewRow('w-second', 0);
    const second = await source.stores.claims.observeProject('project', LEGACY);
    if (first.kind !== 'observed' || second.kind !== 'observed')
      throw new Error('an observation did not answer');
    expect(first.claims.map(({ id }) => id)).toEqual(['claim-w-first']);
    expect(second.claims.map(({ id }) => id).sort()).toEqual(['claim-w-first', 'claim-w-second']);
    expect(opened).toEqual({ now: 1, ever: 1 });
    await source.close();
    expect(opened.now).toBe(0);
  });
});
