import { describe, expect, test } from 'bun:test';

import { createConnectedOptimizationRead } from '../testing/connected-optimization-view.fixture';
import { createConnectedEndpointProjector } from './connected-endpoints';

describe('detached connected endpoint labels', () => {
  test('projects a foreign endpoint with its captured string step code and own address', () => {
    const captured = createConnectedOptimizationRead();
    const metadata = new Map(
      [...captured.metadataByProject].map(([projectId, member]) => [
        projectId,
        { ...member, steps: member.steps.map((step) => ({ ...step, code: 'build' })) },
      ]),
    );
    const project = createConnectedEndpointProjector(metadata);
    expect(
      project({ projectId: 'B', workItemId: 'b', scope: 'node', stepId: 'build' }),
    ).toMatchObject({
      endpoint: { projectId: 'B', workItemId: 'b', scope: 'node', stepId: 'build' },
      projectAbbreviation: 'PB',
      workItemNumber: '010',
      stepNodeId: 'sn1.b.build',
      step: { code: 'build' },
      qualifiedReference: 'PB.010.s1-build',
    });
  });

  test('refuses missing captured endpoint rows without live lookup', () => {
    const project = createConnectedEndpointProjector(
      createConnectedOptimizationRead().metadataByProject,
    );
    expect(() => project({ projectId: 'B', workItemId: 'missing', scope: 'whole' })).toThrow(
      'endpoint row missing',
    );
  });
});
