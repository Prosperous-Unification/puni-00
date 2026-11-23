import type { ResolvedStep } from '@wbs/domain';
import { describe, expect, test } from 'bun:test';

import { createConnectedOptimizationRead } from '../testing/connected-optimization-view.fixture';
import { createConnectedEndpointProjector } from './connected-endpoints';

/** Detached display fixture; actual Source admission is covered separately. */
function captureLeafLabels() {
  const captured = createConnectedOptimizationRead();
  const own = captured.metadataByWorkPackage.get('B');
  const row = own?.workItems.at(0),
    step = own?.steps.at(0);
  if (own === undefined || row === undefined || step === undefined)
    throw new Error('Connected label fixture lacks its member');
  const steps = [
    { ...step, id: 'dev', code: 'dev', name: 'Develop', position: 10 },
    { ...step, id: 'qa', code: 'qa', name: 'Quality', position: 20 },
    ...Array.from({ length: 10 }, (_, index) => ({
      ...step,
      id: 'unused-' + String(index),
      code: 'unused-' + String(index),
      position: index + 30,
    })),
  ];
  const resolve = (codes: readonly string[]): ResolvedStep[] =>
    codes.map((code) => ({
      stepId: code,
      code,
      name: code,
      via: [
        {
          bindingId: 'fixture-' + code,
          scopeKind: 'organization',
          scopeId: 'org',
          workItemTypeId: null,
        },
      ],
    }));
  const workItems = [
    { ...row, id: 'b', position: 10, steps: resolve(['qa', 'dev']) },
    { ...row, id: 'b2', position: 20, steps: resolve(['dev', 'qa']) },
    { ...row, id: 'b0', position: 30, steps: resolve([]) },
  ];
  const metadata = new Map(captured.metadataByWorkPackage);
  const member = { ...own, steps, workItems };
  metadata.set('B', member);
  return { metadata, member };
}

describe('detached connected endpoint labels', () => {
  test('current connected nodes follow each leaf order and count', () => {
    const { metadata } = captureLeafLabels();
    const project = createConnectedEndpointProjector(metadata);
    for (const [workItemId, stepId, reference] of [
      ['b', 'qa', 'PB.010.s1-qa'],
      ['b', 'dev', 'PB.010.s2-dev'],
      ['b2', 'dev', 'PB.020.s1-dev'],
      ['b2', 'qa', 'PB.020.s2-qa'],
    ])
      expect(
        project({ workPackageId: 'B', workItemId, scope: 'node', stepId }).qualifiedReference,
      ).toBe(reference);
    expect(
      project({ workPackageId: 'B', workItemId: 'b0', scope: 'whole' }).qualifiedReference,
    ).toBe('PB.030');
  });

  test('current connected nodes refuse absent leaf metadata', () => {
    const { metadata, member } = captureLeafLabels();
    metadata.set('B', {
      ...member,
      workItems: member.workItems.map(({ steps: _steps, ...row }) => row),
    });
    expect(() =>
      createConnectedEndpointProjector(metadata)({
        workPackageId: 'B',
        workItemId: 'b',
        scope: 'node',
        stepId: 'dev',
      }),
    ).toThrow('missing connected tree leaf steps b');
  });

  test('current connected nodes refuse package-only steps', () => {
    const { metadata } = captureLeafLabels();
    expect(() =>
      createConnectedEndpointProjector(metadata)({
        workPackageId: 'B',
        workItemId: 'b',
        scope: 'node',
        stepId: 'unused-0',
      }),
    ).toThrow('unresolved connected tree endpoint step B.unused-0');
  });

  test('current connected zero-step leaves refuse a node reference', () => {
    const { metadata } = captureLeafLabels();
    expect(() =>
      createConnectedEndpointProjector(metadata)({
        workPackageId: 'B',
        workItemId: 'b0',
        scope: 'node',
        stepId: 'qa',
      }),
    ).toThrow('unresolved connected tree endpoint step B.qa');
  });

  test('current connected parents refuse a node reference', () => {
    const { metadata, member } = captureLeafLabels();
    metadata.set('B', {
      ...member,
      workItems: member.workItems.map((row) => (row.id === 'b2' ? { ...row, parentId: 'b' } : row)),
    });
    expect(() =>
      createConnectedEndpointProjector(metadata)({
        workPackageId: 'B',
        workItemId: 'b',
        scope: 'node',
        stepId: 'dev',
      }),
    ).toThrow('connected tree node endpoint is not a leaf b');
  });
  test('work packages a foreign endpoint with its captured string step code and own address', () => {
    const captured = createConnectedOptimizationRead();
    const metadata = new Map(
      [...captured.metadataByWorkPackage].map(([workPackageId, member]) => [
        workPackageId,
        { ...member, steps: member.steps.map((step) => ({ ...step, code: 'build' })) },
      ]),
    );
    const workPackage = createConnectedEndpointProjector(metadata);
    expect(
      workPackage({ workPackageId: 'B', workItemId: 'b', scope: 'node', stepId: 'build' }),
    ).toMatchObject({
      endpoint: { workPackageId: 'B', workItemId: 'b', scope: 'node', stepId: 'build' },
      workPackageAbbreviation: 'PB',
      workItemNumber: '010',
      stepNodeId: 'sn1.b.build',
      step: { code: 'build' },
      qualifiedReference: 'PB.010.s1-build',
    });
  });

  test('refuses missing captured endpoint rows without live lookup', () => {
    const workPackage = createConnectedEndpointProjector(
      createConnectedOptimizationRead().metadataByWorkPackage,
    );
    expect(() =>
      workPackage({ workPackageId: 'B', workItemId: 'missing', scope: 'whole' }),
    ).toThrow('endpoint row missing');
  });
});
