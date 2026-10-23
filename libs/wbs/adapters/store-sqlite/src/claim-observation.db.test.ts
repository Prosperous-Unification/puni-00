import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AvailableWorkItemService as WorkItemService } from '@wbs/core/testing/available-work-item-service';
import { inMemoryServices } from '@wbs/core/testing/harness';
import { workItemRow } from '@wbs/core/testing/work-item-fixture';
import { projectRow } from '@wbs/store-memory/project-fixture';
import { personAdded } from '@wbs/store-memory/testing/service-fixtures';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';

import { ClaimRepository } from './claim';
import { type Drizzle, openDrizzle } from './db';
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
let db: Drizzle;
let service: WorkItemService;
let workItems: WorkItemRepository;
let claims: ClaimRepository;

/**
 * The claims read's one observation (`ClaimStore.observeProject`,
 * `wbs-claim-display` C1) over real SQLite: a writer racing the read never
 * makes it answer a claim on a row it did not read, and access the deployment
 * withdrew after admission is refused inside the observation.
 */
beforeEach(async () => {
  folder = mkdtempSync(join(tmpdir(), 'wbs-claim-observation-'));
  const path = join(folder, 'test.db');
  runMigrations(path, FOLDER);
  db = openDrizzle(path);
  const directory = new DirectoryRepository(db, OPEN);
  const projects = new ProjectRepository(db, OPEN);
  workItems = new WorkItemRepository(db, OPEN);
  claims = new ClaimRepository(db, OPEN);
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

  it('answers an absent project as not found', async () => {
    expect(await claims.observeProject('nowhere', LEGACY)).toEqual({ kind: 'not_found' });
  });
});
