import { describe, expect, it } from 'bun:test';

import { CREATOR_ADMISSION, type EditAdmission, NO_ADMISSION } from '../../ports/edit-admission';
import { LEGACY_ACCESS, type ResourceAccess } from '../../ports/organization-access';
import type { Broadcaster } from '../../ports/project-event';
import type { Project } from '../../ports/project-store';
import type { PlanTransactionalStores } from '../../ports/stores';
import type { Scope, UnitOfWork } from '../../ports/unit-of-work';
import { recordingBroadcaster } from '../../testing/broadcast-fixture';
import { PlanCommandRunner, type PlanCommandServices } from './plan-commands.feature';

const PROJECT = 'project-1';
const ACTOR = 'super-admin';
const SCOPED: ResourceAccess = {
  kind: 'scoped',
  scope: { organizationId: 'org-a', userId: ACTOR, role: 'super_admin' },
};

/** The project as stored: someone else's, restricted, which only a recovery may write. */
const restricted = (id = PROJECT) => ({ id, ownerId: 'creator', restricted: true }) as Project;

const silent: Broadcaster = recordingBroadcaster();

/**
 * A runner over stand-in stores whose unit of work classifies every scoped
 * write as a recovery, recording the admission each graph was built with.
 */
function runnerOver(entryToDiscard?: string) {
  const admissions: EditAdmission[] = [];
  // A stand-in for the stores the runner reads itself; the graph is stubbed.
  const stores = {
    projects: {
      admitEditInOrganization: () => Promise.resolve('recovery'),
      findCrossReferences: () => Promise.resolve([]),
    },
  } as unknown as PlanTransactionalStores;
  const scope: Scope = { stores };
  const uow: UnitOfWork = {
    async run(act) {
      const decision = await act(scope);
      if (!decision.commit && decision.afterRollback !== undefined) {
        await decision.afterRollback(scope);
      }
      return decision.value;
    },
  };
  const whileBuilt: { granted: boolean; otherActor: boolean; otherProject: boolean }[] = [];
  const graph = (admission: EditAdmission) => {
    admissions.push(admission);
    whileBuilt.push({
      granted: admission.admits(restricted(), ACTOR),
      otherActor: admission.admits(restricted(), 'someone-else'),
      otherProject: admission.admits(restricted('project-2'), ACTOR),
    });
    return {
      workItems: {
        collect: async (fn: () => Promise<unknown>) => ({
          result: await fn(),
          recordings: [],
          dirty: false,
        }),
        recordCollected: () => Promise.resolve(),
        undoState: () => Promise.resolve({ undoable: false, redoable: false }),
        undoWithin: () =>
          Promise.resolve(
            entryToDiscard === undefined
              ? { ok: true, value: { done: 'undo', detail: null } }
              : { ok: false, reason: 'stale', detail: null, entryId: entryToDiscard },
          ),
        discardEntry: () => Promise.resolve(),
      },
    } as unknown as PlanCommandServices;
  };
  const runner = new PlanCommandRunner({
    batchServices: (_scope, _broadcast, admission) => graph(admission),
    publicServices: graph(CREATOR_ADMISSION),
    uow,
    announcements: silent,
  });
  admissions.length = 0;
  whileBuilt.length = 0;
  return { runner, admissions, whileBuilt };
}

describe('the admission a batch graph is built with', () => {
  it('admits the granted actor on the granted project only while its unit of work runs', async () => {
    const { runner, admissions, whileBuilt } = runnerOver();

    expect(await runner.runWithin(PROJECT, ACTOR, [], SCOPED)).toMatchObject({ ok: true });

    expect(whileBuilt).toEqual([{ granted: true, otherActor: false, otherProject: false }]);
    // Proof: skipping `expire` in `execute` made this receive true (0 pass,
    // 1 fail, run alone with `-t`); watched 2026-09-28.
    expect(admissions[0]?.admits(restricted(), ACTOR)).toBe(false);
  });

  it('never falls back to the creator rule under scoped access', async () => {
    const { runner, admissions } = runnerOver();

    await runner.runDirectoryWithin(ACTOR, [], SCOPED);
    await runner.run(PROJECT, ACTOR, []);

    expect(admissions).toEqual([NO_ADMISSION, CREATOR_ADMISSION]);
  });

  it('grants a journal walk until it settles, and its repair nothing', async () => {
    const { runner, admissions, whileBuilt } = runnerOver('entry-1');

    await runner.undoWithin(PROJECT, ACTOR, SCOPED);

    expect(admissions).toHaveLength(2);
    expect(whileBuilt[0]?.granted).toBe(true);
    // Proof: skipping `expire` in `walk` made this receive true; watched 2026-09-28.
    expect(admissions[0]?.admits(restricted(), ACTOR)).toBe(false);
    expect(admissions[1]).toBe(NO_ADMISSION);
  });

  it('builds a legacy journal walk with the creator rule', async () => {
    const { runner, admissions } = runnerOver();

    await runner.undoWithin(PROJECT, ACTOR, LEGACY_ACCESS);

    expect(admissions).toEqual([CREATOR_ADMISSION]);
  });
});
