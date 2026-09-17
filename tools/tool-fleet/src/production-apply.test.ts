import { createHash } from 'node:crypto';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { applyOperation } from './apply';
import { type OperationPlan, sealOperationPlan } from './plan';
import {
  type CommandRequest,
  type CommandResponse,
  createProductionApplyDependencies,
  prepareTerraformPlan,
} from './production-apply';

function operationPlan(terraformPlanSha256: string): OperationPlan {
  return sealOperationPlan({
    schemaVersion: 1,
    desiredRevision: 'fleet-2026-09-17',
    observationDigest: 'a'.repeat(64),
    observedAt: '2026-09-17T09:00:00.000Z',
    expiresAt: '2026-09-17T09:30:00.000Z',
    request: {
      kind: 'provision',
      nodeId: 'workers-c',
      clusterId: 'workers',
      cloudAccount: 'production',
      region: 'fsn1',
      machineType: 'cx33',
      image: 'ubuntu-24.04',
      network: 'private',
      sshKeyIds: ['operator'],
      retainedStorage: false,
      budgetCapEur: 20,
      providerOwnershipId: 'provision-workers-c-20260917',
      terraformPlanSha256,
      terraformStateLineage: 'lineage-1',
      terraformStateSerial: 7,
    },
    targetIdentities: ['pending:workers-c', 'cluster:workers'],
    preconditions: ['observation remains current', 'operation lease is owned'],
    effects: ['create provider instance', 'record provider identity', 'enroll configured host'],
    affectedCapabilities: [],
    storageImplication: 'system-disk-only-with-no-retention',
    downtimeImplication: 'none-new-capacity',
    summary: 'provision workers-c',
  });
}

function lease(holder: string): string {
  return JSON.stringify({
    metadata: { resourceVersion: '9' },
    spec: {
      holderIdentity: holder,
      renewTime: '2026-09-17T09:01:00.000Z',
      leaseDurationSeconds: 300,
    },
  });
}

function terraformState(status = 'running'): string {
  return JSON.stringify({
    lineage: 'lineage-1',
    serial: 7,
    resources: [
      {
        type: 'hcloud_server',
        name: 'node',
        instances: [{ index_key: 'workers-c', attributes: { status } }],
      },
    ],
  });
}

function terraformShow(): string {
  return JSON.stringify({
    terraform_version: '1.16.3',
    resource_changes: [
      {
        address: 'hcloud_server.node["workers-c"]',
        change: {
          actions: ['create'],
          after: {
            labels: {
              'puni-logical-node': 'workers-c',
              'puni-operation': 'provision-workers-c-20260917',
            },
          },
        },
      },
    ],
  });
}

function output(): string {
  return JSON.stringify({
    node_identities: { value: { 'workers-c': { instance_id: '4815162342' } } },
  });
}

async function rejectionMessage(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return '(resolved without throwing)';
  } catch (cause) {
    return cause instanceof Error ? cause.message : String(cause);
  }
}

describe('production apply adapter', () => {
  it('prepares a private saved plan and emits its exact state bindings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-terraform-plan-'));
    const outputPath = join(directory, 'operation.json.tfplan');
    const calls: CommandRequest[] = [];
    const run = async (request: CommandRequest): Promise<CommandResponse> => {
      calls.push(request);
      if (request.arguments[0] === 'validate') {
        return {
          exitCode: 0,
          stdout: JSON.stringify({ valid: true, diagnostics: [] }),
          stderr: '',
        };
      }
      if (request.arguments[0] === 'plan') {
        const output = request.arguments.find((argument) => argument.startsWith('-out='));
        if (output === undefined) throw new Error('Test plan request has no output');
        await writeFile(output.slice('-out='.length), 'saved plan bytes');
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      if (request.arguments[0] === 'show') {
        return { exitCode: 0, stdout: terraformShow(), stderr: '' };
      }
      if (request.arguments[0] === 'state') {
        return { exitCode: 0, stdout: terraformState(), stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    };

    const evidence = await prepareTerraformPlan(
      '/repo',
      'workers-c',
      'workers',
      'provision-workers-c-20260917',
      '/reviewed/nodes.tfvars',
      outputPath,
      run,
    );

    expect(evidence).toEqual({
      terraformPlanSha256: createHash('sha256').update('saved plan bytes').digest('hex'),
      terraformStateLineage: 'lineage-1',
      terraformStateSerial: 7,
    });
    expect(Bun.file(outputPath).size).toBe(16);
    expect(calls.map((request) => request.arguments[0])).toEqual([
      'init',
      'validate',
      'plan',
      'show',
      'state',
    ]);
  });

  it('stops Terraform preparation when validation reports invalid', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-terraform-invalid-'));
    let planCalls = 0;
    const run = (request: CommandRequest): Promise<CommandResponse> => {
      if (request.arguments[0] === 'validate') {
        return Promise.resolve({
          exitCode: 0,
          stdout: JSON.stringify({ valid: false, diagnostics: [{ summary: 'invalid module' }] }),
          stderr: '',
        });
      }
      if (request.arguments[0] === 'plan') planCalls += 1;
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    };

    expect(
      await rejectionMessage(
        prepareTerraformPlan(
          '/repo',
          'workers-c',
          'workers',
          'provision-workers-c-20260917',
          '/reviewed/nodes.tfvars',
          join(directory, 'operation.tfplan'),
          run,
        ),
      ),
    ).toMatch(/validation failed/i);
    expect(planCalls).toBe(0);
  });

  it('uses Kubernetes Lease, the exact saved Terraform plan, and F3 enrollment', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-production-apply-'));
    const planPath = join(directory, 'operation.json');
    const savedPlan = new TextEncoder().encode('reviewed terraform plan');
    await writeFile(`${planPath}.tfplan`, savedPlan);
    const plan = operationPlan(createHash('sha256').update(savedPlan).digest('hex'));
    let leaseExists = false;
    const calls: CommandRequest[] = [];
    const run = (request: CommandRequest): Promise<CommandResponse> => {
      calls.push(request);
      if (request.executable === 'kubectl' && request.arguments.includes('get')) {
        return Promise.resolve(
          leaseExists
            ? { exitCode: 0, stdout: lease(plan.planSha256), stderr: '' }
            : { exitCode: 1, stdout: '', stderr: 'NotFound' },
        );
      }
      if (request.executable === 'kubectl' && request.arguments.includes('create')) {
        leaseExists = true;
        return Promise.resolve({ exitCode: 0, stdout: lease(plan.planSha256), stderr: '' });
      }
      if (request.executable === 'terraform' && request.arguments[0] === 'state') {
        return Promise.resolve({ exitCode: 0, stdout: terraformState(), stderr: '' });
      }
      if (request.executable === 'terraform' && request.arguments[0] === 'show') {
        return Promise.resolve({ exitCode: 0, stdout: terraformShow(), stderr: '' });
      }
      if (request.executable === 'terraform' && request.arguments[0] === 'output') {
        return Promise.resolve({ exitCode: 0, stdout: output(), stderr: '' });
      }
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    };

    const receipt = await applyOperation({
      plan,
      expectedSha256: plan.planSha256,
      journalPath: `${planPath}.journal.json`,
      dependencies: createProductionApplyDependencies(
        '/repo',
        plan,
        planPath,
        run,
        () => new Date('2026-09-17T09:01:00.000Z'),
      ),
    });

    expect(receipt.state).toBe('complete');
    expect(receipt.completedSteps[0]?.externalResourceId).toBe('4815162342');
    expect(
      calls.some(
        (request) => request.executable === 'terraform' && request.arguments[0] === 'apply',
      ),
    ).toBe(true);
    expect(calls.some((request) => request.executable === 'ansible-playbook')).toBe(true);
  });

  it('refuses concurrent ownership, changed plan bytes, and pending deletion before effects', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-production-refusal-'));
    const planPath = join(directory, 'operation.json');
    await writeFile(`${planPath}.tfplan`, 'changed bytes');
    const plan = operationPlan('f'.repeat(64));
    let mutations = 0;
    const concurrent = (request: CommandRequest): Promise<CommandResponse> => {
      if (request.executable === 'kubectl' && request.arguments.includes('get')) {
        return Promise.resolve({ exitCode: 0, stdout: lease('other-operation'), stderr: '' });
      }
      mutations += 1;
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    };
    expect(
      await rejectionMessage(
        applyOperation({
          plan,
          expectedSha256: plan.planSha256,
          journalPath: `${planPath}.concurrent.json`,
          dependencies: createProductionApplyDependencies(
            '/repo',
            plan,
            planPath,
            concurrent,
            () => new Date('2026-09-17T09:01:00.000Z'),
          ),
        }),
      ),
    ).toMatch(/active operation Lease/i);
    expect(mutations).toBe(0);

    let leaseReads = 0;
    const changedPlan = (request: CommandRequest): Promise<CommandResponse> => {
      if (request.executable === 'kubectl' && request.arguments.includes('get')) {
        leaseReads += 1;
        return Promise.resolve(
          leaseReads === 1
            ? { exitCode: 1, stdout: '', stderr: 'NotFound' }
            : { exitCode: 0, stdout: lease(plan.planSha256), stderr: '' },
        );
      }
      if (request.executable === 'kubectl') {
        return Promise.resolve({ exitCode: 0, stdout: lease(plan.planSha256), stderr: '' });
      }
      mutations += 1;
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    };
    expect(
      await rejectionMessage(
        applyOperation({
          plan,
          expectedSha256: plan.planSha256,
          journalPath: `${planPath}.changed.json`,
          dependencies: createProductionApplyDependencies(
            '/repo',
            plan,
            planPath,
            changedPlan,
            () => new Date('2026-09-17T09:01:00.000Z'),
          ),
        }),
      ),
    ).toMatch(/saved Terraform plan differs/i);
    expect(mutations).toBe(0);

    const exactPlan = operationPlan(
      createHash('sha256').update(new TextEncoder().encode('changed bytes')).digest('hex'),
    );
    const deleting = (request: CommandRequest): Promise<CommandResponse> => {
      if (request.executable === 'kubectl') {
        return Promise.resolve({ exitCode: 0, stdout: lease(exactPlan.planSha256), stderr: '' });
      }
      if (request.executable === 'terraform' && request.arguments[0] === 'state') {
        return Promise.resolve({ exitCode: 0, stdout: terraformState('deleting'), stderr: '' });
      }
      if (request.executable === 'terraform') {
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      }
      mutations += 1;
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    };
    expect(
      await rejectionMessage(
        applyOperation({
          plan: exactPlan,
          expectedSha256: exactPlan.planSha256,
          journalPath: `${planPath}.deleting.json`,
          dependencies: createProductionApplyDependencies(
            '/repo',
            exactPlan,
            planPath,
            deleting,
            () => new Date('2026-09-17T09:01:00.000Z'),
          ),
        }),
      ),
    ).toMatch(/pending deletion/i);
    expect(mutations).toBe(0);
  });
});
