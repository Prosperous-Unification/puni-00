import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AvailableWorkItemService as WorkItemService } from '@wbs/core/testing/available-work-item-service';
import { inMemoryServices } from '@wbs/core/testing/harness';
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

  it('answers an absent project as not found', async () => {
    expect(await claims.observeProject('nowhere', LEGACY)).toEqual({ kind: 'not_found' });
  });
});
