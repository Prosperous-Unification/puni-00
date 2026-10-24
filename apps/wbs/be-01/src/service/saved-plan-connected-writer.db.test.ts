import { installSavedPlans } from '@wbs/core/module/saved-plans/check';
import { fastScheduler } from '@wbs/core/testing/scheduler-fixture';
import { readSavedConnectedScheduleBody, sliceKey } from '@wbs/domain';
import { openDatabase } from '@wbs/store-sqlite/db';
import { openSqliteSource } from '@wbs/store-sqlite/source';
import { expect, spyOn, test } from 'bun:test';

import { nodeDigest } from '../runtime/bun-runtime';
import { BACKEND_DEPENDENCY_CAPABILITY } from '../runtime/dependency-support';
import { captureMixedFixture, captureSavedConnectedFixture } from './saved-plan-connected.fixture';

// Proof: replacing the final composite with baseline failed both real optimized chosen cases before persistence (slice-d-fault-selected-baseline.log).
test.each([
  ['isolated', false],
  ['shared', false],
  ['isolated', true],
  ['shared', true],
] as const)(
  'installed %s writer preserves selected ready and baseline=%s after cache publication',
  async (mode, floor) => {
    await captureMixedFixture(mode, floor, async (_captured, path, read) => {
      const source = openSqliteSource({
        dependencyCapability: BACKEND_DEPENDENCY_CAPABILITY,
        dbPath: path,
      });
      const access = {
        kind: 'scoped' as const,
        scope: { organizationId: 'org-a', userId: 'ada', role: 'member' as const },
      };
      let captures = 0;
      let replaceAfterCapture = false;
      const { savedPlans } = installSavedPlans({
        capture: source.history.savedPlanCapture,
        plans: source.history.savedPlans,
        digest: nodeDigest,
        scheduler: fastScheduler,
        now: () => 12,
        newId: () => 'saved-connected',
        captureSharedPlan: async () => {
          captures += 1;
          const held = await read();
          if (replaceAfterCapture) {
            const publisher = openDatabase(path);
            try {
              publisher.run('DELETE FROM optimized_schedule_cache');
            } finally {
              publisher.close();
            }
          }
          return held;
        },
      });
      const legacyCapture = spyOn(
        source.history.savedPlanCapture,
        'readPlanInput',
      ).mockImplementation(() => {
        throw new Error('connected observation cannot recapture target');
      });
      try {
        const current = await savedPlans.projectCurrentPlan('a1', access);
        if (current === null) throw new Error('current expected');
        replaceAfterCapture = true;
        const saved = await savedPlans.save({
          projectId: 'a1',
          createdBy: 'ada',
          createdById: 'ada',
          access,
          scoped: { organizationId: 'org-a', actorId: 'ada', role: 'member', operation: 'save' },
        });
        expect(saved.outcome).toBe('saved');
        if (saved.outcome !== 'saved' || !current.schedule.present)
          throw new Error('saved schedule expected');
        const stored = saved.record;
        if (!stored.schedule.present) throw new Error('saved schedule expected');
        expect(stored.input.schemaVersion).toBe(9);
        expect(stored.schedule.body.schemaVersion).toBe(2);
        expect(stored.input.sha256).toBe(await nodeDigest.sha256(stored.input.bytes));
        expect(stored.schedule.body.sha256).toBe(
          await nodeDigest.sha256(stored.schedule.body.bytes),
        );
        expect(stored.schedule.inputSha256).toBe(stored.input.sha256);
        expect(JSON.parse(stored.input.bytes)).toEqual(current.input);
        expect(JSON.parse(stored.schedule.body.bytes)).toEqual(current.schedule.body);
        const schedule = readSavedConnectedScheduleBody(JSON.parse(stored.schedule.body.bytes));
        const stage = schedule.connection.stages[0];
        expect(stage.selected).toBe('time');
        expect(stage.variants?.time).toMatchObject({
          state: 'ready',
          decision: { chosen: floor ? 'baseline' : 'optimized' },
        });
        expect(schedule.connection.baseline.slices[sliceKey('a', 'design')].earliestStart).toBe(3);
        expect(schedule.connection.composite.slices[sliceKey('a', 'design')].earliestStart).toBe(
          floor ? 3 : 0,
        );
        expect(schedule.connection.stages[1].stageBytes).toContain(
          JSON.stringify([sliceKey('a', 'design'), floor ? 3 : 0]),
        );
        // Proof: a second read callback observed the removed cache and failed saved/current equality (slice-d-fault-capture-twice.log).
        expect(captures).toBe(2);
        expect(legacyCapture).not.toHaveBeenCalled();
        const reloaded = await savedPlans.read(stored.id);
        expect(reloaded.outcome).toBe('read');
      } finally {
        legacyCapture.mockRestore();
        await source.close();
      }
    });
  },
);

test('installed connected writer refuses missing required evidence without partial rows', async () => {
  await captureSavedConnectedFixture('isolated', {
    consume: async (captured, path) => {
      const source = openSqliteSource({
        dependencyCapability: BACKEND_DEPENDENCY_CAPABILITY,
        dbPath: path,
      });
      const { savedPlans } = installSavedPlans({
        capture: source.history.savedPlanCapture,
        plans: source.history.savedPlans,
        digest: nodeDigest,
        scheduler: fastScheduler,
        now: () => 12,
        newId: () => 'incomplete-connected',
        captureSharedPlan: () => Promise.resolve(captured),
      });
      Map.prototype.delete.call(captured.readiness.statuses, 'b');
      try {
        let refusal: unknown;
        try {
          await savedPlans.save({
            projectId: 'a1',
            createdBy: 'ada',
            createdById: 'ada',
            access: {
              kind: 'scoped',
              scope: { organizationId: 'org-a', userId: 'ada', role: 'member' },
            },
          });
        } catch (cause) {
          refusal = cause;
        }
        expect(refusal).toBeInstanceOf(Error);
        expect(String(refusal)).toContain('missing connected history status');
        const reader = openDatabase(path);
        try {
          expect(reader.query('SELECT * FROM saved_plan').all()).toEqual([]);
          expect(reader.query('SELECT * FROM saved_plan_body').all()).toEqual([]);
        } finally {
          reader.close();
        }
      } finally {
        await source.close();
      }
    },
  });
});
