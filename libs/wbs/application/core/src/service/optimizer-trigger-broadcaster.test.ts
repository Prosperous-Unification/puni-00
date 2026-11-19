import { describe, expect, it } from 'bun:test';

import type { WorkPackageEvent } from '../ports/work-package-event';
import { recordingBroadcaster } from '../testing/broadcast-fixture';
import { OptimizerTriggerBroadcaster } from './optimizer-trigger-broadcaster';

describe('OptimizerTriggerBroadcaster', () => {
  it('triggers only after a scheduling-input event was published', async () => {
    const inner = recordingBroadcaster();
    const changed: string[] = [];
    const broadcast = new OptimizerTriggerBroadcaster(inner, (workPackageId) => {
      changed.push(workPackageId);
    });
    const step = {
      id: 's-1',
      workPackageId: 'p-1',
      name: 'Dev',
      position: 10,
      code: 'dev',
      allowancePercent: 0,
      estimateUnit: 'workdays' as const,
    };
    const schedulingEvents: WorkPackageEvent[] = [
      { type: 'elsewhere_changed', workPackageId: 'p-1', causeWorkPackageId: 'upstream' },
      { type: 'tree_replaced', workItems: [] },
      { type: 'step_added', step },
      { type: 'step_removed', stepId: 's-1' },
      { type: 'step_updated', step: { ...step, allowancePercent: 30 } },
      { type: 'directory_changed' },
      { type: 'capacity_changed' },
      {
        type: 'work_package_settings_changed',
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
    ] satisfies WorkPackageEvent[]) {
      await broadcast.publish('p-1', event);
    }
    expect(changed).toHaveLength(schedulingEvents.length);

    // Proof: triggering unconditionally grows `changed` to nine; triggering
    // before `inner.publish` lets a throwing inner report a change that did not commit.
  });

  // `wbs-claim-display` C4: a heartbeat moves a lease, never a schedule input.
  it('schedules no optimization for claims_changed', async () => {
    const inner = recordingBroadcaster();
    const changed: string[] = [];
    const broadcast = new OptimizerTriggerBroadcaster(inner, (workPackageId) => {
      changed.push(workPackageId);
    });
    await broadcast.publish('p-1', { type: 'claims_changed' });
    expect(inner.published).toEqual([{ workPackageId: 'p-1', event: { type: 'claims_changed' } }]);
    expect(changed).toEqual([]);
  });

  it('does not trigger when publication fails', async () => {
    const changed: string[] = [];
    const broadcast = new OptimizerTriggerBroadcaster(
      {
        publish: () => Promise.reject(new Error('record refused')),
        latestSeq: () => Promise.resolve(-1),
      },
      (workPackageId) => changed.push(workPackageId),
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
    const broadcast = new OptimizerTriggerBroadcaster(recordingBroadcaster(), (workPackageId) => {
      changed.push(workPackageId);
    });
    await broadcast.publish('p-1', {
      type: 'step_updated',
      step: {
        id: 's-1',
        workPackageId: 'p-1',
        name: 'QA',
        position: 20,
        code: 'qa',
        allowancePercent: 30,
        estimateUnit: 'workdays' as const,
      },
    });
    expect(changed).toEqual(['p-1']);
  });
});
