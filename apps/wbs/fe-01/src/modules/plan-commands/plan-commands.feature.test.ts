import { describe, expect, it } from 'vitest';

import {
  type PlanCommandRoutes,
  PROJECT_COMMAND_ROUTES,
  WORK_ITEM_COMMAND_ROUTES,
} from './contract';
import { createPlanCommands } from './plan-commands.feature';

/**
 * The port, recording every call and answering each with a promise of its own
 * that never settles: what these tests are about happens when a command is
 * called, and whose promise comes back is asserted by identity.
 */
function recordingRoutes(): {
  readonly routes: PlanCommandRoutes;
  readonly calls: unknown[][];
  readonly answers: Map<string, Promise<unknown>>;
} {
  const calls: unknown[][] = [];
  const answers = new Map<string, Promise<unknown>>();
  function answer<T>(route: string, args: readonly unknown[]): Promise<T> {
    calls.push([route, ...args]);
    const pending = new Promise<T>(() => undefined);
    answers.set(route, pending);
    return pending;
  }
  return {
    calls,
    answers,
    routes: {
      undo: (...args) => answer('undo', args),
      redo: (...args) => answer('redo', args),
      exportPlan: (...args) => answer('exportPlan', args),
      setEstimateMethod: (...args) => answer('setEstimateMethod', args),
      setEstimateArithmetic: (...args) => answer('setEstimateArithmetic', args),
      setDepReach: (...args) => answer('setDepReach', args),
      setOptimizationSettings: (...args) => answer('setOptimizationSettings', args),
      retryOptimization: (...args) => answer('retryOptimization', args),
      setStartDate: (...args) => answer('setStartDate', args),
      setTeamCapacity: (...args) => answer('setTeamCapacity', args),
      setPriorityBands: (...args) => answer('setPriorityBands', args),
      addStep: (...args) => answer('addStep', args),
      renameStep: (...args) => answer('renameStep', args),
      removeStep: (...args) => answer('removeStep', args),
      createWorkItem: (...args) => answer('createWorkItem', args),
      arrangeBySchedule: (...args) => answer('arrangeBySchedule', args),
      freezeProject: (...args) => answer('freezeProject', args),
      unfreezeProject: (...args) => answer('unfreezeProject', args),
      patchWorkItem: (...args) => answer('patchWorkItem', args),
      setStatus: (...args) => answer('setStatus', args),
      assignPerson: (...args) => answer('assignPerson', args),
      moveWorkItem: (...args) => answer('moveWorkItem', args),
      duplicateWorkItem: (...args) => answer('duplicateWorkItem', args),
      removeWorkItem: (...args) => answer('removeWorkItem', args),
      setEstimate: (...args) => answer('setEstimate', args),
      clearEstimate: (...args) => answer('clearEstimate', args),
      unfreezeWorkItem: (...args) => answer('unfreezeWorkItem', args),
      addDependency: (...args) => answer('addDependency', args),
      removeDependency: (...args) => answer('removeDependency', args),
      addTeam: (...args) => answer('addTeam', args),
      addService: (...args) => answer('addService', args),
      addWorkItemType: (...args) => answer('addWorkItemType', args),
      addTag: (...args) => answer('addTag', args),
      addPerson: (...args) => answer('addPerson', args),
    },
  };
}

describe('the plan commands of one project', () => {
  it('sends every project command to the project it was bound to, with the rest as given', () => {
    const { routes, calls, answers } = recordingRoutes();
    const commands = createPlanCommands({ projectId: 'p1', routes });
    const sent = [
      commands.undo(),
      commands.redo(),
      commands.exportPlan(),
      commands.setEstimateMethod('realistic'),
      commands.setEstimateArithmetic({ estimateRounding: 'ceil' }),
      commands.setDepReach('anchor-slice'),
      commands.setOptimizationSettings({ optimizationEnabled: true }),
      commands.retryOptimization('time', 'hash-1'),
      commands.setStartDate('2026-10-05'),
      commands.setTeamCapacity('team-1', 3),
      commands.setPriorityBands([{ startsAt: 1, label: 'Critical', defaultValue: 10 }]),
      commands.addStep('Review'),
      commands.renameStep('step-1', 'Build'),
      commands.removeStep('step-1', true),
      commands.createWorkItem({ parentId: null, afterId: 'w0', name: 'Paint' }),
      commands.arrangeBySchedule(),
      commands.freezeProject(),
      commands.unfreezeProject(),
    ];

    expect(calls).toStrictEqual([
      ['undo', 'p1'],
      ['redo', 'p1'],
      ['exportPlan', 'p1'],
      ['setEstimateMethod', 'p1', 'realistic'],
      ['setEstimateArithmetic', 'p1', { estimateRounding: 'ceil' }],
      ['setDepReach', 'p1', 'anchor-slice'],
      ['setOptimizationSettings', 'p1', { optimizationEnabled: true }],
      ['retryOptimization', 'p1', 'time', 'hash-1'],
      ['setStartDate', 'p1', '2026-10-05'],
      ['setTeamCapacity', 'p1', 'team-1', 3],
      ['setPriorityBands', 'p1', [{ startsAt: 1, label: 'Critical', defaultValue: 10 }]],
      ['addStep', 'p1', 'Review'],
      ['renameStep', 'p1', 'step-1', 'Build'],
      ['removeStep', 'p1', 'step-1', true],
      ['createWorkItem', 'p1', { parentId: null, afterId: 'w0', name: 'Paint' }],
      ['arrangeBySchedule', 'p1'],
      ['freezeProject', 'p1'],
      ['unfreezeProject', 'p1'],
    ]);
    // The route's own promise, not a wrapper: a refusal reaches the gesture as
    // the object be-01's client threw.
    PROJECT_COMMAND_ROUTES.forEach((route, index) => {
      expect(sent[index], route).toBe(answers.get(route));
    });
  });

  it('passes every work-item command through unchanged, leaving out what the caller left out', () => {
    const { routes, calls, answers } = recordingRoutes();
    const commands = createPlanCommands({ projectId: 'p1', routes });
    const sent = [
      commands.patchWorkItem('w1', { name: 'Paint the fence' }),
      commands.setStatus('w1', 'done', '2026-09-24'),
      commands.assignPerson('w1', 'step-1', null),
      commands.moveWorkItem('w1', null, 'w0'),
      commands.duplicateWorkItem('w1'),
      commands.removeWorkItem('w1'),
      commands.setEstimate('w1', 'step-1', { optimistic: 1, realistic: 2, pessimistic: 3 }),
      commands.clearEstimate('w1', 'step-1'),
      commands.unfreezeWorkItem('w1'),
      commands.addDependency('w2', 'w1'),
      commands.removeDependency('w2', 'w1'),
      commands.addTeam('Platform'),
      commands.addService('Billing'),
      commands.addWorkItemType('Spike'),
      commands.addTag('urgent'),
      commands.addPerson('Kat', ['team-1']),
    ];

    expect(calls).toStrictEqual([
      ['patchWorkItem', 'w1', { name: 'Paint the fence' }],
      ['setStatus', 'w1', 'done', '2026-09-24'],
      ['assignPerson', 'w1', 'step-1', null],
      ['moveWorkItem', 'w1', null, 'w0'],
      ['duplicateWorkItem', 'w1'],
      ['removeWorkItem', 'w1'],
      ['setEstimate', 'w1', 'step-1', { optimistic: 1, realistic: 2, pessimistic: 3 }],
      ['clearEstimate', 'w1', 'step-1'],
      ['unfreezeWorkItem', 'w1'],
      ['addDependency', 'w2', 'w1'],
      ['removeDependency', 'w2', 'w1'],
      ['addTeam', 'Platform'],
      ['addService', 'Billing'],
      ['addWorkItemType', 'Spike'],
      ['addTag', 'urgent'],
      ['addPerson', 'Kat', ['team-1']],
    ]);
    WORK_ITEM_COMMAND_ROUTES.forEach((route, index) => {
      expect(sent[index], route).toBe(answers.get(route));
    });
  });

  it('reaches each route when it is called, not when the commands were built', () => {
    const { routes, calls } = recordingRoutes();
    const commands = createPlanCommands({ projectId: 'p1', routes });
    const later: string[] = [];
    routes.freezeProject = (projectId) => {
      later.push(`freeze:${projectId}`);
      return Promise.resolve();
    };
    routes.patchWorkItem = (id) => {
      later.push(`patch:${id}`);
      return Promise.resolve();
    };

    void commands.freezeProject();
    void commands.patchWorkItem('w1', { name: 'Paint' });

    expect(later).toEqual(['freeze:p1', 'patch:w1']);
    expect(calls).toEqual([]);
  });
});
