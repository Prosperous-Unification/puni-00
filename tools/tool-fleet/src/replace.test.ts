import { describe, expect, it } from 'bun:test';

import { digestObservation, type FleetObservation } from './observation';
import { planReplacement } from './replace';
import { fleetFixture, observationFixture } from './testing/fleet';

function missingObservation(): FleetObservation {
  const fleet = fleetFixture();
  const observation = observationFixture(fleet);
  const { digest: _digest, ...body } = observation;
  const changed = {
    ...body,
    nodes: body.nodes.map((node) =>
      node.desiredNodeId === 'workers-agent-a' ? { ...node, states: ['missing'] as const } : node,
    ),
  };
  return { ...changed, digest: digestObservation(changed) };
}

describe('planReplacement', () => {
  it('requires an exact external fence before replacing a missing writer', () => {
    const fleet = fleetFixture();
    const observation = missingObservation();
    expect(() => planReplacement(fleet, observation, 'workers-agent-a')).toThrow(/fence/i);
    expect(() =>
      planReplacement(fleet, observation, 'workers-agent-a', {
        providerIdentity: 'hcloud:other',
        state: 'powered-off',
        fenceId: 'poweroff-4815',
      }),
    ).toThrow(/identity/i);
    const plan = planReplacement(fleet, observation, 'workers-agent-a', {
      providerIdentity: 'hcloud:2002',
      state: 'powered-off',
      fenceId: 'poweroff-2002-verified',
    });
    expect(plan.steps).toContain('provision replacement with a new provider identity');
    expect(plan.oldProviderIdentity).toBe('hcloud:2002');
  });

  it('refuses storage reassignment while the old writer can resume', () => {
    const fleet = fleetFixture();
    const observation = missingObservation();
    expect(() =>
      planReplacement(fleet, observation, 'workers-agent-a', {
        providerIdentity: 'hcloud:2002',
        state: 'running',
        fenceId: 'claimed-but-not-real',
      }),
    ).toThrow(/cannot resume|powered-off/i);
    expect(() =>
      planReplacement(
        fleet,
        { ...observation, observedAt: '2026-09-17T09:01:00.000Z' },
        'workers-agent-a',
        {
          providerIdentity: 'hcloud:2002',
          state: 'powered-off',
          fenceId: 'poweroff-2002-verified',
        },
      ),
    ).toThrow(/exact current observation/i);
  });
});
