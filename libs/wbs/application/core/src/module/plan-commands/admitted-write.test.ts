import { describe, expect, it } from 'bun:test';

import { LEGACY_ACCESS } from '../../ports/organization-access';
import type { Broadcaster } from '../../ports/project-event';
import type { Decision, Scope, UnitOfWork } from '../../ports/unit-of-work';
import type { AdmittedServices } from './admitted-write';
import { createAdmittedWrites } from './composition';

/** A unit of work that records what ran inside it and what it decided. */
function recordingUnitOfWork(log: string[]): UnitOfWork {
  return {
    async run<T>(act: (scope: Scope) => Promise<Decision<T>>): Promise<T> {
      log.push('begin');
      // The scope is never read by the graph below: the services are fakes.
      const decision = await act({ stores: {} as Scope['stores'] });
      log.push(decision.commit ? 'commit' : 'rollback');
      return decision.value;
    },
  };
}

function silent(log: string[]): Broadcaster {
  return {
    publish: () => {
      log.push('publish');
      return Promise.resolve();
    },
    latestSeq: () => Promise.resolve(-1),
  };
}

describe('admittedWrites', () => {
  /**
   * Proof: `updateProjectWithin` calling the graph without `uow.run` made this case
   * fail on `- Expected - 2 / + Received + 0`, `begin` and `commit` missing
   * around `update`; watched 2026-09-27.
   */
  it('checks and writes a project update inside one unit of work, announcing after commit', async () => {
    const log: string[] = [];
    const graph = (_scope: Scope, broadcast: Broadcaster): AdmittedServices => ({
      projects: {
        updateWithin: async (id) => {
          log.push('update');
          await broadcast.publish(id, { type: 'project_settings_changed' } as never);
          return { ok: true, value: {} as never };
        },
      },
      steps: { removeWithin: () => Promise.reject(new Error('not asked')) },
    });
    const writes = createAdmittedWrites({
      uow: recordingUnitOfWork(log),
      batch: graph,
      announcements: silent(log),
    });

    await writes.updateProjectWithin('p', 'u', { depReach: 'whole-item' }, LEGACY_ACCESS);

    expect(log).toEqual(['begin', 'update', 'commit', 'publish']);
  });

  it('rolls a refused step removal back and announces nothing', async () => {
    const log: string[] = [];
    const writes = createAdmittedWrites({
      uow: recordingUnitOfWork(log),
      batch: (_scope, broadcast) => ({
        projects: { updateWithin: () => Promise.reject(new Error('not asked')) },
        steps: {
          removeWithin: async (projectId) => {
            log.push('remove');
            await broadcast.publish(projectId, { type: 'step_removed' } as never);
            return { ok: false, reason: 'dependency_cycle' };
          },
        },
      }),
      announcements: silent(log),
    });

    expect(await writes.removeStepWithin('p', 's', 'u', true, LEGACY_ACCESS)).toEqual({
      ok: false,
      reason: 'dependency_cycle',
    });
    expect(log).toEqual(['begin', 'remove', 'rollback']);
  });
});
