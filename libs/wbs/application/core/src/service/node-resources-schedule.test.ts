import { createHash } from 'node:crypto';

import { effectiveTeamsOf, schedule, serializeSchedule } from '@wbs/domain';
import { canonicalScheduleInput } from '@wbs/domain/canonical-schedule-input';
import { expect, it } from 'bun:test';

import { slicesOf } from '../module/work-item/work-item.resource';
import { labelledRow } from '../testing/work-item-fixture';

it('preserves base schedule slice bytes, pool order, canonical hash and Fast schedule', () => {
  const rows = [
    labelledRow({ id: 'parent', teamIds: ['wide', 'unsized', 'narrow'] }),
    ...['a', 'b', 'c'].map((id, position) =>
      labelledRow({ id, parentId: 'parent', position, maxParallel: 3 }),
    ),
  ];
  const steps = ['dev', 'qa', 'ops'].map((id) => ({
    id,
    allowancePercent: 0,
    estimateUnit: 'workdays' as const,
  }));
  const assignments = new Map<string, Record<string, string>>([
    ['b', { dev: 'ada' }],
    ['c', { dev: 'ada', qa: 'ada' }],
  ]);
  const capacity = new Map([
    ['wide', 4],
    ['narrow', 2],
  ]);
  const estimates = rows.slice(1).flatMap((row) =>
    steps.map((step) => ({
      workItemId: row.id,
      stepId: step.id,
      optimistic: 2,
      realistic: 2,
      pessimistic: 2,
    })),
  );
  const rule = {
    method: 'pert',
    pertWeights: { optimistic: 1, realistic: 4, pessimistic: 1 },
    rounding: 'exact',
  } as const;
  const slices = slicesOf(
    rows,
    estimates,
    new Set(['parent']),
    steps,
    rule,
    assignments,
    effectiveTeamsOf(rows),
    capacity,
  );
  const expected = ['a', 'b', 'c'].flatMap((workItemId) =>
    steps.map(({ id: stepId }) => ({
      workItemId,
      stepId,
      days: 2,
      personId: workItemId === 'b' || (workItemId === 'c' && stepId !== 'ops') ? 'ada' : null,
      width: workItemId === 'b' || (workItemId === 'c' && stepId !== 'ops') ? 1 : 2,
      poolIds: ['wide', 'narrow'],
    })),
  );
  expect(JSON.stringify(slices)).toBe(JSON.stringify(expected));
  const input = {
    rows,
    edges: [],
    slices,
    notBefore: new Map<string, number>(),
    poolSizes: capacity,
    reach: 'whole-item' as const,
    deadlines: new Map<string, number>(),
    typed: [],
  };
  const canonical = canonicalScheduleInput(input);
  const fast = serializeSchedule(
    schedule(rows, [], slices, input.notBefore, capacity, input.reach, input.deadlines, []),
  );
  // Golden hashes observed with fca16386's unmodified slicesOf, then with the extracted resolver.
  expect(createHash('sha256').update(canonical).digest('hex')).toBe(
    '836fceac297ca723748bc4d05720bb5ebe5f7b6741e30778f29bde44e26b459f',
  );
  expect(createHash('sha256').update(JSON.stringify(fast)).digest('hex')).toBe(
    '980ef345d62f1a699801b12f5f7e91779af965a080c564602865fdc3b03168e8',
  );
});
