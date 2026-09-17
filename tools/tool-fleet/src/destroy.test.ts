import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { applyOperation } from './apply';
import { sealOperationPlan } from './plan';
import {
  type CommandRequest,
  type CommandResponse,
  createProductionApplyDependencies,
} from './production-apply';

const backend = `${JSON.stringify({
  schemaVersion: 1,
  cloudAccount: 'production',
  address: 'https://state.example/fleet',
  lockAddress: 'https://state.example/fleet/lock',
  unlockAddress: 'https://state.example/fleet/lock',
  encryptedAtRest: true,
  accessControlled: true,
  versioned: true,
  verifiedAt: '2026-09-17T08:55:00.000Z',
})}\n`;

function state(serial: number, present: boolean): string {
  return JSON.stringify({
    lineage: 'lineage-1',
    serial,
    resources: present
      ? [
          {
            type: 'hcloud_server',
            name: 'node',
            instances: [
              {
                index_key: 'workers-agent-a',
                attributes: {
                  id: '2002',
                  status: 'running',
                  labels: {
                    'puni-logical-node': 'workers-agent-a',
                    'puni-operation': 'provision-workers-agent-a',
                  },
                },
              },
            ],
          },
        ]
      : [],
  });
}

function engineArguments(request: CommandRequest): readonly string[] {
  return request.arguments.slice(request.arguments.indexOf('--') + 1);
}

test('production destroy consumes retirement and a saved non-storage Terraform deletion', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fleet-destroy-'));
  const planPath = join(directory, 'destroy.json');
  const savedPlan = 'opaque reviewed destroy plan';
  const variables = '{"nodes":{}}\n';
  const receipt = `${JSON.stringify({
    schemaVersion: 1,
    nodeId: 'workers-agent-a',
    providerIdentity: 'hcloud:2002',
    kubernetesNodeUid: 'uid-3',
    backupReceipt: 'backup-workers-1',
    planSha256: 'a'.repeat(64),
    state: 'retired',
  })}\n`;
  await writeFile(`${planPath}.tfplan`, savedPlan, { mode: 0o600 });
  await writeFile(`${planPath}.tfvars.json`, variables, { mode: 0o600 });
  await writeFile(`${planPath}.backend.json`, backend, { mode: 0o600 });
  await writeFile(`${planPath}.retirement-receipt.json`, receipt, { mode: 0o600 });
  const plan = sealOperationPlan({
    schemaVersion: 1,
    desiredRevision: 'fleet-test-1',
    observationDigest: 'a'.repeat(64),
    observedAt: '2026-09-17T09:00:00.000Z',
    expiresAt: '2026-09-17T10:00:00.000Z',
    request: {
      kind: 'destroy',
      nodeId: 'workers-agent-a',
      retirementReceiptSha256: createHash('sha256').update(receipt).digest('hex'),
      cloudAccount: 'production',
      terragruntConfigSha256: 'c8dc0be5a5c4b9c6ae5b76c2d1a33c41bc4b61859340a5759758de08f921015f',
      terraformPlanSha256: createHash('sha256').update(savedPlan).digest('hex'),
      terraformVariablesSha256: createHash('sha256').update(variables).digest('hex'),
      terraformBackendEvidenceSha256: createHash('sha256').update(backend).digest('hex'),
      terraformStateLineage: 'lineage-1',
      terraformStateSerial: 7,
    },
    targetIdentities: ['node:workers-agent-a', 'hcloud:2002', 'cluster:workers'],
    preconditions: ['completed retirement'],
    effects: ['require completed retirement receipt', 'destroy provider instance'],
    affectedCapabilities: ['execution'],
    storageImplication: 'system-disk-destruction-requires-retirement-receipt',
    downtimeImplication: 'none-after-verified-retirement',
    summary: 'destroy workers-agent-a',
  });
  let holder: string | undefined;
  let providerPresent = true;
  let serial = 7;
  const run = (request: CommandRequest): Promise<CommandResponse> =>
    Promise.resolve().then(() => {
      if (request.executable === 'kubectl') {
        if (request.arguments.includes('get')) {
          return holder === undefined
            ? { exitCode: 1, stdout: '', stderr: 'NotFound' }
            : {
                exitCode: 0,
                stdout: JSON.stringify({
                  metadata: { resourceVersion: '1' },
                  spec: {
                    holderIdentity: holder,
                    leaseDurationSeconds: 300,
                    renewTime: '2026-09-17T09:00:00.000Z',
                  },
                }),
                stderr: '',
              };
        }
        if (request.arguments.includes('delete')) {
          holder = undefined;
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        const manifest = JSON.parse(request.stdin ?? '{}') as {
          spec?: { holderIdentity?: string };
        };
        holder = manifest.spec?.holderIdentity;
        return {
          exitCode: 0,
          stdout: JSON.stringify({ ...manifest, metadata: { resourceVersion: '1' } }),
          stderr: '',
        };
      }
      if (request.executable === 'ansible-inventory') {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            _meta: {
              hostvars: providerPresent
                ? {
                    target: {
                      puni_instance_id: '2002',
                      puni_logical_node: 'workers-agent-a',
                      puni_operation_id: 'provision-workers-agent-a',
                      puni_provider_state: 'running',
                    },
                  }
                : {},
            },
          }),
          stderr: '',
        };
      }
      if (request.executable === 'terragrunt' && engineArguments(request)[0] === 'show') {
        return {
          exitCode: 0,
          stdout: JSON.stringify({
            terraform_version: '1.13.3',
            resource_changes: [
              {
                address: 'hcloud_server.node["workers-agent-a"]',
                change: {
                  actions: ['delete'],
                  before: { labels: { 'puni-logical-node': 'workers-agent-a' } },
                },
              },
            ],
          }),
          stderr: '',
        };
      }
      if (request.executable === 'terragrunt' && engineArguments(request)[0] === 'state') {
        return { exitCode: 0, stdout: state(serial, providerPresent), stderr: '' };
      }
      if (request.executable === 'terragrunt' && engineArguments(request)[0] === 'apply') {
        providerPresent = false;
        serial = 8;
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });

  const receiptResult = await applyOperation({
    plan,
    expectedSha256: plan.planSha256,
    journalPath: `${planPath}.journal.json`,
    dependencies: createProductionApplyDependencies(
      join(import.meta.dir, '../../..'),
      plan,
      planPath,
      run,
      () => new Date('2026-09-17T09:00:00.000Z'),
      'destroy-test',
    ),
  });
  expect(receiptResult.state).toBe('complete');
  expect(providerPresent).toBe(false);
});
