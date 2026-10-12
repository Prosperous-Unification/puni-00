import type { StoredAttempt } from '@wbs/core';
import { expect } from 'bun:test';

import type { CaseRegistration } from '../case-manifest';
import { type OpenCase, storeCase } from './store-case';

const keysOf = (attempts: readonly StoredAttempt[]) =>
  attempts.map(
    ({ workItemId, stepId, attemptNumber, outcome }) =>
      `${workItemId}/${stepId}#${String(attemptNumber)}:${outcome ?? 'running'}`,
  );

/** Shared attempt-store cases, observed through the store's own complete reads. */
export function attemptRegistrations(open: OpenCase<'attempts'>): readonly CaseRegistration[] {
  return [
    storeCase('attempts', 'attempts.start:number-and-running', open, async ({ port, seed }) => {
      const workItemId = seed.workItemIds[0][0];
      const stepId = seed.stepIds[0][0];
      const node = { workItemId, stepId, executorPersonId: null, reference: null, note: null };
      const first = await port.start({ ...node, startedAt: 100 }, seed.stamps[0]);
      expect(first).toMatchObject({ ok: true, attempt: { attemptNumber: 1, endedAt: null } });
      expect(await port.start({ ...node, startedAt: 110 }, seed.stamps[0])).toEqual({
        ok: false,
        reason: 'attempt_running',
      });
      expect(
        await port.end({ workItemId, stepId, endedAt: 120, outcome: 'failed' }, seed.stamps[0]),
      ).toMatchObject({ ok: true, prior: { attemptNumber: 1, outcome: null } });
      expect(
        await port.end({ workItemId, stepId, endedAt: 130, outcome: 'failed' }, seed.stamps[0]),
      ).toEqual({ ok: false, reason: 'no_running_attempt' });
      expect(await port.start({ ...node, startedAt: 140 }, seed.stamps[0])).toMatchObject({
        ok: true,
        attempt: { attemptNumber: 2 },
      });
      expect(keysOf(await port.listByProject(seed.projectIds[0]))).toEqual([
        `${workItemId}/${stepId}#1:failed`,
        `${workItemId}/${stepId}#2:running`,
      ]);
      expect(await port.listByProject(seed.projectIds[1])).toEqual([]);
    }),
    // A42: a removed number stays issued, the highest one included, and the
    // undo of a removal puts the row back under its own number.
    storeCase('attempts', 'attempts.start:never-reuses', open, async ({ port, seed }) => {
      const workItemId = seed.workItemIds[0][0];
      const stepId = seed.stepIds[0][0];
      const node = { workItemId, stepId, executorPersonId: null, reference: null, note: null };
      for (const startedAt of [100, 120]) {
        await port.start({ ...node, startedAt }, seed.stamps[0]);
        await port.end(
          { workItemId, stepId, endedAt: startedAt + 10, outcome: 'failed' },
          seed.stamps[0],
        );
      }
      const removed = await port.remove(workItemId, stepId, 2, seed.stamps[0]);
      if (removed === null) throw new Error('attempt 2 was not removed');
      expect(await port.start({ ...node, startedAt: 140 }, seed.stamps[0])).toMatchObject({
        ok: true,
        attempt: { attemptNumber: 3 },
      });
      await port.restore(removed, seed.stamps[1]);
      expect(keysOf(await port.listByProject(seed.projectIds[0]))).toEqual([
        `${workItemId}/${stepId}#1:failed`,
        `${workItemId}/${stepId}#2:failed`,
        `${workItemId}/${stepId}#3:running`,
      ]);
      expect(await port.listIssued(seed.projectIds[0], [workItemId])).toEqual([
        { workItemId, stepId, issued: 3 },
      ]);
      await port.raiseIssued([{ workItemId, stepId, issued: 2 }]);
      expect(await port.listIssued(seed.projectIds[0], [workItemId])).toEqual([
        { workItemId, stepId, issued: 3 },
      ]);
    }),
    storeCase('attempts', 'attempts.moveAll:ownership', open, async ({ port, seed }) => {
      const [sourceId, targetId] = seed.workItemIds[0];
      const [devId, qaId] = seed.stepIds[0];
      const otherId = seed.workItemIds[1][0];
      const startOn = (workItemId: string, stepId: string, startedAt: number) =>
        port.start(
          { workItemId, stepId, startedAt, executorPersonId: null, reference: null, note: null },
          seed.stamps[0],
        );
      await startOn(sourceId, devId, 100);
      await port.end(
        { workItemId: sourceId, stepId: devId, endedAt: 110, outcome: 'succeeded' },
        seed.stamps[0],
      );
      await startOn(sourceId, qaId, 120);
      await startOn(otherId, seed.stepIds[1][0], 130);

      await port.moveAll(sourceId, targetId, seed.stamps[1]);

      expect((await port.listOfWorkItem(sourceId)).size).toBe(0);
      expect(keysOf([...(await port.listOfWorkItem(targetId)).values()].flat())).toEqual([
        `${targetId}/${devId}#1:succeeded`,
        `${targetId}/${qaId}#1:running`,
      ]);
      expect(keysOf(await port.listByProject(seed.projectIds[1]))).toEqual([
        `${otherId}/${seed.stepIds[1][0]}#1:running`,
      ]);
    }),
    // The hand-down copies the marks: a highest attempt removed before the
    // first child arrived is still skipped there, and the parent keeps its own.
    storeCase('attempts', 'attempts.moveAll:issued', open, async ({ port, seed }) => {
      const [sourceId, targetId] = seed.workItemIds[0];
      const stepId = seed.stepIds[0][0];
      const node = { stepId, executorPersonId: null, reference: null, note: null };
      for (const startedAt of [100, 120]) {
        await port.start({ ...node, workItemId: sourceId, startedAt }, seed.stamps[0]);
        await port.end(
          { workItemId: sourceId, stepId, endedAt: startedAt + 10, outcome: 'failed' },
          seed.stamps[0],
        );
      }
      await port.remove(sourceId, stepId, 2, seed.stamps[0]);

      await port.moveAll(sourceId, targetId, seed.stamps[1]);

      expect(await port.listIssued(seed.projectIds[0], [sourceId, targetId])).toEqual(
        [
          { workItemId: sourceId, stepId, issued: 2 },
          { workItemId: targetId, stepId, issued: 2 },
        ].sort((left, right) => left.workItemId.localeCompare(right.workItemId)),
      );
      expect(
        await port.start({ ...node, workItemId: targetId, startedAt: 140 }, seed.stamps[1]),
      ).toMatchObject({ ok: true, attempt: { attemptNumber: 3 } });
      expect(await port.listIssued(seed.projectIds[1], [sourceId])).toEqual([]);
    }),
  ];
}
