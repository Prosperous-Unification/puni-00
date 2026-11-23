import { createHash } from 'node:crypto';

import { expect, test } from 'bun:test';

import type { Digest } from '../../ports/runtime';
import { buildAddressSpace, readStepAddresses, resolveAddressedStep } from './step-addresses';

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

const secondLeafId = '00000000-0000-4000-8000-000000000005';
const zeroLeafId = '00000000-0000-4000-8000-000000000006';
const currentSteps = [
  { id: devId, code: 'dev', position: 10 },
  { id: qaId, code: 'qa', position: 20 },
];
const currentRows = [
  { ...workItems[0], id: parentId, parentId: null, number: '010' },
  {
    id: leafId,
    parentId,
    number: '010.1',
    steps: [
      { stepId: devId, code: 'dev' },
      { stepId: qaId, code: 'qa' },
    ],
  },
  {
    id: secondLeafId,
    parentId: null,
    number: '020',
    steps: [
      { stepId: qaId, code: 'qa' },
      { stepId: devId, code: 'dev' },
    ],
  },
  { id: zeroLeafId, parentId: null, number: '030', steps: [] },
];

test('current addresses use each leaf own order and omit zero-step leaves', async () => {
  const addressed = await readStepAddresses(
    'current',
    { workItems: currentRows, steps: currentSteps },
    digest,
  );
  expect(addressed.stepNodes).toEqual([
    { id: `sn1.${leafId}.${devId}`, workItemId: leafId, stepId: devId, reference: '010.1.s1-dev' },
    { id: `sn1.${leafId}.${qaId}`, workItemId: leafId, stepId: qaId, reference: '010.1.s2-qa' },
    {
      id: `sn1.${secondLeafId}.${qaId}`,
      workItemId: secondLeafId,
      stepId: qaId,
      reference: '020.s1-qa',
    },
    {
      id: `sn1.${secondLeafId}.${devId}`,
      workItemId: secondLeafId,
      stepId: devId,
      reference: '020.s2-dev',
    },
  ]);
  expect(addressed.addressRevision).toMatch(/^ar2:[0-9a-f]{64}$/);
  const tree = { workItems: currentRows, steps: currentSteps };
  expect(
    await resolveAddressedStep(
      'current',
      { reference: '020.qa', revision: addressed.addressRevision },
      tree,
      digest,
    ),
  ).toMatchObject({
    kind: 'resolved',
    workItemId: secondLeafId,
    stepId: qaId,
    reference: '020.s1-qa',
  });
  expect(
    await resolveAddressedStep(
      'current',
      { reference: '030.dev', revision: addressed.addressRevision },
      tree,
      digest,
    ),
  ).toEqual({ kind: 'unresolvable', reason: 'unknown_code' });
  expect(
    await resolveAddressedStep(
      'current',
      { reference: '020.s2-qa', revision: addressed.addressRevision },
      tree,
      digest,
    ),
  ).toEqual({ kind: 'unresolvable', reason: 'alias_mismatch' });
});

test('current address revision follows leaf applicability while ignoring unused package columns', async () => {
  const tree = { workItems: currentRows, steps: currentSteps };
  const before = await readStepAddresses('current', tree, digest);
  const same = await readStepAddresses(
    'current',
    {
      ...tree,
      steps: [
        ...currentSteps,
        { id: '00000000-0000-4000-8000-000000000007', code: 'unused', position: 0 },
      ],
    },
    digest,
  );
  expect(same.addressRevision).toBe(before.addressRevision);
  const changed = {
    ...tree,
    workItems: currentRows.map((row) => (row.id === secondLeafId ? { ...row, steps: [] } : row)),
  };
  const after = await readStepAddresses('current', changed, digest);
  expect(after.addressRevision).not.toBe(before.addressRevision);
  expect(
    await resolveAddressedStep(
      'current',
      { reference: '020.qa', revision: before.addressRevision },
      changed,
      digest,
    ),
  ).toEqual({ kind: 'stale', addressRevision: after.addressRevision });
  expect(
    await resolveAddressedStep(
      'current',
      { reference: '020.qa', revision: after.addressRevision },
      changed,
      digest,
    ),
  ).toEqual({ kind: 'unresolvable', reason: 'unknown_code' });
});

test('current address construction refuses a missing leaf list instead of using the package union', () => {
  const partial = currentRows.map((row) =>
    row.id === zeroLeafId ? { id: row.id, parentId: row.parentId, number: row.number } : row,
  );
  expect(() => buildAddressSpace(partial, currentSteps, 'leaf')).toThrow(
    'leaf step metadata is absent',
  );
});

test('current address construction refuses wholly absent leaf metadata', async () => {
  await readStepAddresses('current', { workItems, steps: currentSteps }, digest).then(
    () => {
      throw new Error('current addresses accepted absent leaf metadata');
    },
    (cause: unknown) => {
      expect(String(cause)).toContain('leaf step metadata is absent');
    },
  );
});

test('current reference padding uses leaf count rather than the package union count', async () => {
  const broad = [
    ...currentSteps,
    ...Array.from({ length: 10 }, (_, index) => ({
      id: '00000000-0000-4000-8000-' + String(index + 100).padStart(12, '0'),
      code: 'other-' + String(index),
      position: index + 30,
    })),
  ];
  const parent = { id: parentId, parentId: null, number: '010' };
  const rows = [
    parent,
    { id: leafId, parentId, number: '010.1', steps: [{ stepId: devId, code: 'dev' }] },
  ];
  const addressed = await readStepAddresses('current', { workItems: rows, steps: broad }, digest);
  expect(addressed.stepNodes).toEqual([
    { id: `sn1.${leafId}.${devId}`, workItemId: leafId, stepId: devId, reference: '010.1.s1-dev' },
  ]);
  expect(
    await resolveAddressedStep(
      'current',
      { reference: '010.1.dev', revision: addressed.addressRevision },
      { workItems: rows, steps: broad },
      digest,
    ),
  ).toMatchObject({ kind: 'resolved', reference: '010.1.s1-dev' });
});

test('reads only leaf nodes in step order, with effective numbers and null for uncoded steps', async () => {
  const addresses = await readStepAddresses(
    'work_package',
    { workItems, steps },
    digest,
    'uniform',
  );
  expect(addresses.stepNodes).toEqual([
    { id: `sn1.${leafId}.${devId}`, workItemId: leafId, stepId: devId, reference: '010.1.s1-dev' },
    { id: `sn1.${leafId}.${qaId}`, workItemId: leafId, stepId: qaId, reference: null },
  ]);
  expect(addresses.addressRevision).toMatch(/^ar1:[0-9a-f]{64}$/);
  expect(buildAddressSpace(workItems, steps, 'uniform').workItems).toEqual([
    { id: parentId, number: '010', isLeaf: false },
    { id: leafId, number: '010.1', isLeaf: true },
  ]);
});

test('answers no nodes for a stepless work package', async () => {
  expect(
    (await readStepAddresses('work_package', { workItems, steps: [] }, digest, 'uniform'))
      .stepNodes,
  ).toEqual([]);
});

test('address revision ignores names but follows numbers, codes, order, and leafhood', async () => {
  const revision = async (rows: typeof workItems, columns: typeof steps) =>
    (
      await readStepAddresses(
        'work_package',
        { workItems: rows, steps: columns },
        digest,
        'uniform',
      )
    ).addressRevision;
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
