import { createHash } from 'node:crypto';

import { expect, test } from 'bun:test';

import type { Digest } from '../../ports/runtime';
import { addressSpaceOf, readStepAddresses } from './step-addresses';

const digest: Digest = {
  sha256: (bytes) => Promise.resolve(createHash('sha256').update(bytes).digest('hex')),
};
const parentId = '00000000-0000-4000-8000-000000000001';
const leafId = '00000000-0000-4000-8000-000000000002';
const devId = '00000000-0000-4000-8000-000000000003';
const qaId = '00000000-0000-4000-8000-000000000004';
const workItems = [
  { id: parentId, parentId: null, number: '010', name: 'Parent' },
  { id: leafId, parentId, number: '010.1', name: 'Leaf', frozenNumber: '010.1' },
];
const steps = [
  { id: qaId, code: null, position: 2, name: 'Quality' },
  { id: devId, code: 'dev', position: 1, name: 'Dev' },
];

test('reads only leaf nodes in step order, with effective numbers and null for uncoded steps', async () => {
  const addresses = await readStepAddresses('project', { workItems, steps }, digest);
  expect(addresses.stepNodes).toEqual([
    { id: `sn1.${leafId}.${devId}`, workItemId: leafId, stepId: devId, reference: '010.1.dev' },
    { id: `sn1.${leafId}.${qaId}`, workItemId: leafId, stepId: qaId, reference: null },
  ]);
  expect(addresses.addressRevision).toMatch(/^ar1:[0-9a-f]{64}$/);
  expect(addressSpaceOf(workItems, steps).workItems).toEqual([
    { id: parentId, number: '010', isLeaf: false },
    { id: leafId, number: '010.1', isLeaf: true },
  ]);
});

test('answers no nodes for a stepless project', async () => {
  expect((await readStepAddresses('project', { workItems, steps: [] }, digest)).stepNodes).toEqual(
    [],
  );
});

test('address revision ignores names but follows numbers, codes, order, and leafhood', async () => {
  const revision = async (rows: typeof workItems, columns: typeof steps) =>
    (await readStepAddresses('project', { workItems: rows, steps: columns }, digest))
      .addressRevision;
  const original = await revision(workItems, steps);
  expect(
    await revision(
      workItems.map((row) => ({ ...row, name: 'Renamed' })),
      steps.map((step) => ({ ...step, name: 'Renamed' })),
    ),
  ).toBe(original);
  expect(
    await revision(
      workItems.map((row) => (row.id === leafId ? { ...row, number: '020' } : row)),
      steps,
    ),
  ).not.toBe(original);
  expect(
    await revision(
      workItems,
      steps.map((step) => (step.id === devId ? { ...step, code: 'build' } : step)),
    ),
  ).not.toBe(original);
  expect(
    await revision(
      workItems,
      steps.map((step) => ({ ...step, position: 3 - step.position })),
    ),
  ).not.toBe(original);
  expect(
    await revision(
      [
        ...workItems,
        {
          id: 'child',
          parentId: leafId,
          number: '010.1.1',
          name: 'Child',
          frozenNumber: '010.1.1',
        },
      ],
      steps,
    ),
  ).not.toBe(original);
});
