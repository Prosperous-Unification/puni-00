import { describe, expect, test } from 'bun:test';

import { createConnectedOptimizationRead } from '../testing/connected-optimization-view.fixture';
import { createConnectedEndpointProjector } from './connected-endpoints';

describe('detached connected endpoint labels', () => {
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
