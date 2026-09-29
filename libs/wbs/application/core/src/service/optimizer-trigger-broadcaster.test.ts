import { describe, expect, it } from 'bun:test';

import type { ProjectEvent } from '../ports/project-event';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { OptimizerTriggerBroadcaster } from './optimizer-trigger-broadcaster';

describe('OptimizerTriggerBroadcaster', () => {
  it('re-solves a project below when the one above moves', async () => {
    const changed: string[] = [];
    const broadcast = new OptimizerTriggerBroadcaster(recordingBroadcaster(), (projectId) => {
      changed.push(projectId);
    });

    await broadcast.publish('below', {
      type: 'elsewhere_changed',
      projectId: 'below',
      causeProjectId: 'above',
    });

    expect(changed).toEqual(['below']);
  });

  it('triggers only after a scheduling-input event was published', async () => {
    const inner = recordingBroadcaster();
    const changed: string[] = [];
    const broadcast = new OptimizerTriggerBroadcaster(inner, (projectId) => {
      changed.push(projectId);
    });
    const step = {
      id: 's-1',
      projectId: 'p-1',
      name: 'Dev',
      position: 10,
      code: 'dev',
      allowancePercent: 0,
    };
    const schedulingEvents: ProjectEvent[] = [
      { type: 'tree_replaced', workItems: [] },
      { type: 'step_added', step },
      { type: 'step_removed', stepId: 's-1' },
      { type: 'step_updated', step: { ...step, allowancePercent: 30 } },
      { type: 'directory_changed' },
      { type: 'capacity_changed' },
      {
        type: 'project_settings_changed',
        optimizationEnabled: true,
        scheduleEngine: 'optimized',
        scheduleObjective: 'pri',
      },
    ];

    for (const event of schedulingEvents) await broadcast.publish('p-1', event);
    expect(changed).toEqual(schedulingEvents.map(() => 'p-1'));

    for (const event of [
      { type: 'step_renamed', step },
      { type: 'priority_bands_changed' },
      { type: 'saved_plans_changed' },
    ] satisfies ProjectEvent[]) {
      await broadcast.publish('p-1', event);
    }
    expect(changed).toHaveLength(schedulingEvents.length);

    // Proof: triggering unconditionally grows `changed` to nine; triggering
    // before `inner.publish` lets a throwing inner report a change that did not commit.
  });

  it('does not trigger when publication fails', async () => {
    const changed: string[] = [];
    const broadcast = new OptimizerTriggerBroadcaster(
      {
        publish: () => Promise.reject(new Error('record refused')),
        latestSeq: () => Promise.resolve(-1),
      },
      (projectId) => changed.push(projectId),
    );

    const refusal = await broadcast.publish('p-1', { type: 'capacity_changed' }).then(
      () => '(resolved without throwing)',
      (error: unknown) => String(error),
    );
    expect(refusal).toContain('record refused');
    expect(changed).toEqual([]);
  });
});

describe('OptimizerTriggerBroadcaster and step allowances', () => {
  it('starts the optimizer debounce after a step allowance edit', async () => {
    const changed: string[] = [];
    const broadcast = new OptimizerTriggerBroadcaster(recordingBroadcaster(), (projectId) => {
      changed.push(projectId);
    });
    await broadcast.publish('p-1', {
      type: 'step_updated',
      step: {
        id: 's-1',
        projectId: 'p-1',
        name: 'QA',
        position: 20,
        code: 'qa',
        allowancePercent: 30,
      },
    });
    expect(changed).toEqual(['p-1']);
  });
});
