import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { applyOperation } from './apply';
import { digestObservation, type FleetObservation } from './observation';
import { sealOperationPlan } from './plan';
import {
  type CommandRequest,
  type CommandResponse,
  createProductionApplyDependencies,
} from './production-apply';
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
    expect(plan.steps).toContain(
      'record replacement authorization for a distinct provisioning plan',
    );
    expect(plan.oldProviderIdentity).toBe('hcloud:2002');
  });

  it('journals exact live fence evidence before replacement authorization', async () => {
    const fleet = fleetFixture();
    const observation = missingObservation();
    const replacement = planReplacement(fleet, observation, 'workers-agent-a', {
      providerIdentity: 'hcloud:2002',
      state: 'powered-off',
      fenceId: 'poweroff-2002-verified',
    });
    const directory = await mkdtemp(join(tmpdir(), 'fleet-replacement-'));
    const planPath = join(directory, 'replace.json');
    const fenceSource = `${JSON.stringify({
      schemaVersion: 1,
      nodeId: replacement.nodeId,
      providerIdentity: replacement.oldProviderIdentity,
      state: 'powered-off',
      fenceId: replacement.fenceId,
      verifiedAt: '2026-09-17T09:00:00.000Z',
    })}\n`;
    await writeFile(`${planPath}.fence-receipt.json`, fenceSource, { mode: 0o600 });
    const plan = sealOperationPlan({
      schemaVersion: 1,
      desiredRevision: fleet.revision,
      observationDigest: observation.digest,
      observedAt: observation.observedAt,
      expiresAt: '2026-09-18T00:00:00.000Z',
      request: {
        kind: 'replace',
        nodeId: replacement.nodeId,
        fenceReceiptSha256: createHash('sha256').update(fenceSource).digest('hex'),
      },
      targetIdentities: [
        `node:${replacement.nodeId}`,
        replacement.oldProviderIdentity,
        `cluster:${replacement.clusterId}`,
        `fence:${replacement.fenceId}`,
      ],
      preconditions: ['exact external fence'],
      effects: replacement.steps,
      affectedCapabilities: ['execution'],
      storageImplication: 'storage-transfer-remains-separate',
      downtimeImplication: 'missing-node',
      summary: 'authorize replacement provisioning',
    });
    let leaseHolder: string | undefined;
    const run = (request: CommandRequest): Promise<CommandResponse> =>
      Promise.resolve().then(() => {
        if (request.executable === 'ansible-inventory') {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              _meta: {
                hostvars: {
                  'workers-agent-a': {
                    puni_instance_id: '2002',
                    puni_logical_node: 'workers-agent-a',
                    puni_provider_state: 'off',
                  },
                },
              },
            }),
            stderr: '',
          };
        }
        if (request.executable === 'kubectl') {
          if (request.arguments.includes('get')) {
            return leaseHolder === undefined
              ? { exitCode: 1, stdout: '', stderr: 'NotFound' }
              : {
                  exitCode: 0,
                  stdout: JSON.stringify({
                    metadata: { resourceVersion: '9' },
                    spec: {
                      holderIdentity: leaseHolder,
                      leaseDurationSeconds: 300,
                      renewTime: '2026-09-17T09:00:00.000Z',
                    },
                  }),
                  stderr: '',
                };
          }
          if (request.arguments.includes('delete')) {
            leaseHolder = undefined;
            return { exitCode: 0, stdout: '', stderr: '' };
          }
          const manifest = JSON.parse(request.stdin ?? '{}') as {
            spec?: { holderIdentity?: string };
          };
          leaseHolder = manifest.spec?.holderIdentity;
          return {
            exitCode: 0,
            stdout: JSON.stringify({ ...manifest, metadata: { resourceVersion: '9' } }),
            stderr: '',
          };
        }
        throw new Error(`Unexpected replacement command ${request.executable}`);
      });
    const dependencies = createProductionApplyDependencies(
      directory,
      plan,
      planPath,
      run,
      () => new Date('2026-09-17T09:00:00.000Z'),
      'replacement-test',
    );

    const receipt = await applyOperation({
      plan,
      expectedSha256: plan.planSha256,
      journalPath: `${planPath}.journal.json`,
      dependencies,
    });
    expect(receipt.state).toBe('complete');
    expect(
      JSON.parse(await readFile(`${planPath}.replacement-authorization.json`, 'utf8')),
    ).toMatchObject({ state: 'replacement-authorized', providerIdentity: 'hcloud:2002' });
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
