import { describe, expect, it } from 'bun:test';

import { LEGACY_ACCESS } from '../ports/organization-access';
import { loadWindowOf, PersonLoad, type PersonLoadOptions } from './person-load.feature';

type TreeRead = Awaited<ReturnType<PersonLoadOptions['workItems']['treeWithin']>>;

const WINDOW = loadWindowOf('2026-10-05', '2026-10-16');
if (WINDOW === null) throw new Error('the test window is refused');

/** A dated one-row tree whose only slice books `personId` for `days` from day zero. */
function datedTree(personId: string, days: number, displayed: 'fast' | 'makespan'): TreeRead {
  // Only the fields `PersonLoad` reads; the rest of the plan read is irrelevant here.
  return {
    seq: 1,
    startDate: '2026-10-05',
    scheduleError: null,
    assignedPeople: [{ id: personId, name: personId }],
    workItems: [{ id: 'w1', number: '010', name: 'Build' }],
    slices: [
      {
        id: 'w1:dev',
        workItemId: 'w1',
        stepId: 'dev',
        personId,
        earliestStart: 0,
        earliestFinish: days,
        width: 1,
      },
    ],
    optimization: { displayed },
  } as unknown as TreeRead;
}

function loadOver(trees: Partial<Record<string, () => TreeRead>>): {
  load: PersonLoad;
  reads: string[];
} {
  const reads: string[] = [];
  const projects = Object.keys(trees).map((id, index) => ({ id, name: id, createdAt: index }));
  const options = {
    projects: { listWithin: () => Promise.resolve(projects) },
    workItems: {
      latestSeq: () => Promise.resolve(1),
      treeWithin: (projectId: string) => {
        reads.push(projectId);
        const tree = trees[projectId];
        if (tree === undefined) throw new Error(`no tree for ${projectId}`);
        return Promise.resolve(tree());
      },
    },
    directory: {
      listWithin: () => Promise.resolve([{ id: 'ana', name: 'Ana', kind: 'person', teamIds: [] }]),
    },
  } as unknown as PersonLoadOptions;
  return { load: new PersonLoad(options), reads };
}

describe('PersonLoad', () => {
  it('reads bookings from the engine the project displays', async () => {
    const { load } = loadOver({
      fast: () => datedTree('ana', 2, 'fast'),
      solved: () => datedTree('ana', 3, 'makespan'),
    });
    const read = await load.readPerson('ana', WINDOW, 'u', LEGACY_ACCESS);
    expect(read?.projects.map(({ projectId, engine }) => [projectId, engine])).toEqual([
      ['fast', 'fast'],
      ['solved', 'optimized'],
    ]);
  });

  it('lists a project whose engine is not installed as unavailable, whoever it names', async () => {
    const { load } = loadOver({
      missing: () =>
        ({ kind: 'engine_unavailable', error: 'engine_unavailable', engine: 'optimized' }) as const,
    });
    const read = await load.readPerson('ana', WINDOW, 'u', LEGACY_ACCESS);
    expect(read?.unavailable).toEqual([
      { projectId: 'missing', name: 'missing', reason: 'engine_unavailable' },
    ]);
    const organization = await load.readOrganization(WINDOW, 'u', LEGACY_ACCESS);
    expect(organization.unavailable).toHaveLength(1);
  });

  it('lists a plan in a cycle as unavailable only to the people it names', async () => {
    const cycle = () =>
      ({
        ...(datedTree('ben', 2, 'fast') as object),
        scheduleError: 'cycle',
        slices: [],
      }) as unknown as TreeRead;
    const { load } = loadOver({ cycle });
    expect((await load.readPerson('ana', WINDOW, 'u', LEGACY_ACCESS))?.unavailable).toEqual([]);
    expect((await load.readOrganization(WINDOW, 'u', LEGACY_ACCESS)).unavailable).toEqual([
      { projectId: 'cycle', name: 'cycle', reason: 'cycle' },
    ]);
  });

  it('reuses a reading while the project’s sequence stands', async () => {
    const { load, reads } = loadOver({ only: () => datedTree('ana', 2, 'fast') });
    await load.readPerson('ana', WINDOW, 'u', LEGACY_ACCESS);
    await load.readOrganization(WINDOW, 'u', LEGACY_ACCESS);
    expect(reads).toEqual(['only']);
  });

  it('answers null for a person outside the directory', async () => {
    const { load, reads } = loadOver({ only: () => datedTree('ana', 2, 'fast') });
    expect(await load.readPerson('bea', WINDOW, 'u', LEGACY_ACCESS)).toBeNull();
    expect(reads).toEqual([]);
  });
});

describe('loadWindowOf', () => {
  it('admits 182 days and refuses 183', () => {
    expect(loadWindowOf('2026-01-01', '2026-07-02')).not.toBeNull();
    expect(loadWindowOf('2026-01-01', '2026-07-03')).toBeNull();
  });
});
