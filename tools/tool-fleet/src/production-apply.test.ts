import { createHash } from 'node:crypto';
import { access, chmod, mkdtemp, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { applyOperation } from './apply';
import { type OperationPlan, sealOperationPlan } from './plan';
import {
  type CommandRequest,
  type CommandResponse,
  controllerRequest,
  createProductionApplyDependencies,
  prepareTerraformPlan,
  runBoundedCommand,
} from './production-apply';

const backendEvidenceSource = `${JSON.stringify({
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
const ansibleVariablesSource = `${JSON.stringify({
  puni_node_name: 'workers-c',
  puni_cluster_id: 'workers',
  puni_node_ip: '10.0.0.23',
  puni_node_capabilities: ['execution'],
})}\n`;
const terraformVariablesSource = '{"nodes":{}}\n';

function operationPlan(
  terraformPlanSha256: string,
  terraformVariablesSha256 = createHash('sha256').update(terraformVariablesSource).digest('hex'),
): OperationPlan {
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
      k3sRole: 'agent',
      capabilities: ['execution'],
      budgetCapEur: 20,
      providerOwnershipId: 'provision-workers-c-20260917',
      terraformPlanSha256,
      terraformVariablesSha256,
      terraformBackendEvidenceSha256: createHash('sha256')
        .update(backendEvidenceSource)
        .digest('hex'),
      ansibleVariablesSha256: createHash('sha256').update(ansibleVariablesSource).digest('hex'),
      terraformStateLineage: 'lineage-1',
      terraformStateSerial: 7,
    },
    targetIdentities: ['pending:workers-c', 'cluster:workers'],
    preconditions: ['observation remains current', 'operation lease is owned'],
    effects: [
      'create provider instance',
      'record provider identity',
      'record desired membership',
      'enroll configured host',
    ],
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

function leaseMutation(request: CommandRequest, fallbackHolder: string): CommandResponse {
  const manifest = JSON.parse(request.stdin ?? '{}') as {
    metadata?: { resourceVersion?: unknown };
    spec?: {
      holderIdentity?: unknown;
      renewTime?: unknown;
      leaseDurationSeconds?: unknown;
    };
  };
  return {
    exitCode: 0,
    stdout: JSON.stringify({
      metadata: { resourceVersion: manifest.metadata?.resourceVersion ?? '9' },
      spec: {
        holderIdentity: manifest.spec?.holderIdentity ?? fallbackHolder,
        renewTime: manifest.spec?.renewTime ?? '2026-09-17T09:01:00.000Z',
        leaseDurationSeconds: manifest.spec?.leaseDurationSeconds ?? 300,
      },
    }),
    stderr: '',
  };
}

function terraformState(status = 'running', present = true): string {
  return JSON.stringify({
    lineage: 'lineage-1',
    serial: 7,
    resources: present
      ? [
          {
            type: 'hcloud_server',
            name: 'node',
            instances: [
              {
                index_key: 'workers-c',
                attributes: {
                  id: '4815162342',
                  status,
                  labels: {
                    'puni-logical-node': 'workers-c',
                    'puni-operation': 'provision-workers-c-20260917',
                  },
                },
              },
            ],
          },
        ]
      : [],
  });
}

function terraformShow(): string {
  return JSON.stringify({
    terraform_version: '1.16.3',
    variables: {
      budget_cap_eur: { value: 20 },
      estimated_monthly_cost_eur: { value: 12 },
    },
    resource_changes: [
      {
        address: 'hcloud_server.node["workers-c"]',
        change: {
          actions: ['create'],
          after: {
            labels: {
              'puni-logical-node': 'workers-c',
              'puni-operation': 'provision-workers-c-20260917',
              'puni-cluster': 'workers',
              'puni-network': 'private',
              'puni-k3s-role': 'agent',
            },
            location: 'fsn1',
            server_type: 'cx33',
            image: 'ubuntu-24.04',
            ssh_keys: ['operator'],
          },
        },
      },
    ],
  });
}

function output(): string {
  return JSON.stringify({
    'workers-c': { instance_id: '4815162342', private_ip: '10.0.0.23' },
  });
}

function providerInventory(present: boolean): string {
  return JSON.stringify({
    _meta: {
      hostvars: present
        ? {
            'workers-c': {
              puni_instance_id: '4815162342',
              puni_logical_node: 'workers-c',
              puni_operation_id: 'provision-workers-c-20260917',
              puni_provider_state: 'running',
            },
          }
        : {},
    },
  });
}

function machineFact(host: string, address: string, machineId: string): string {
  return `PUNI_MACHINE_FACT=${JSON.stringify({ address, machineId, name: host })}\nPLAY RECAP\n${host} : ok=3 changed=0 unreachable=0 failed=0`;
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
  it('keeps controller stdin attached for Kubernetes Lease manifests', () => {
    const request = controllerRequest('/repo', 'controller', 'sha256:abc', {
      executable: 'kubectl',
      arguments: ['replace', '-f', '-'],
      stdin: '{"kind":"Lease"}',
    });
    // Proof: removing --interactive made the locked Docker controller deliver zero bytes to
    // kubectl even though the subprocess adapter supplied the Lease manifest.
    expect(request.arguments).toContain('--interactive');
    expect(request.stdin).toBe('{"kind":"Lease"}');
  });
  it('kills a signal-ignoring process group at the production command deadline', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-command-timeout-'));
    const sentinel = join(directory, 'survived');
    const script = join(directory, 'descendant.ts');
    await writeFile(
      script,
      `process.on('SIGTERM', () => {}); const child = Bun.spawn([process.execPath, '-e', ${JSON.stringify(`await Bun.sleep(300); await Bun.write(${JSON.stringify(sentinel)}, 'survived')`)}]); await child.exited;`,
    );
    expect(
      runBoundedCommand({ executable: process.execPath, arguments: [script] }, 50),
    ).rejects.toThrow(/timed out/i);
    await Bun.sleep(400);
    expect(access(sentinel)).rejects.toThrow();
  });

  it('gives concurrent executions of the same plan distinct Lease ownership', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-production-lease-'));
    const planPath = join(directory, 'operation.json');
    const plan = operationPlan('f'.repeat(64));
    let holder: string | undefined;
    const run = (request: CommandRequest): Promise<CommandResponse> => {
      if (request.arguments.includes('get')) {
        return Promise.resolve(
          holder === undefined
            ? { exitCode: 1, stdout: '', stderr: 'NotFound' }
            : { exitCode: 0, stdout: lease(holder), stderr: '' },
        );
      }
      const manifest = JSON.parse(request.stdin ?? '{}') as {
        spec?: { holderIdentity?: unknown };
      };
      if (typeof manifest.spec?.holderIdentity !== 'string') {
        throw new Error('Test Lease manifest has no holder');
      }
      holder = manifest.spec.holderIdentity;
      return Promise.resolve(leaseMutation(request, holder));
    };
    const first = createProductionApplyDependencies(
      '/repo',
      plan,
      planPath,
      run,
      () => new Date('2026-09-17T09:01:00.000Z'),
      'execution-one',
    );
    const second = createProductionApplyDependencies(
      '/repo',
      plan,
      planPath,
      run,
      () => new Date('2026-09-17T09:01:00.000Z'),
      'execution-two',
    );

    expect((await first.acquireLease(plan)).owner).toBe('execution-one');
    expect(await rejectionMessage(second.acquireLease(plan))).toMatch(/active operation Lease/i);
  });

  it('enrolls an existing SSH host only from reviewed identity and host-key artifacts', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-existing-enroll-'));
    const planPath = join(directory, 'operation.json');
    const knownHostsPath = `${planPath}.known_hosts`;
    const inventorySource = `${JSON.stringify({
      all: {
        children: {
          k3s_agents: {
            hosts: {
              'external-c': {
                ansible_host: '10.0.0.44',
                puni_machine_id: 'abcdefabcdefabcdefabcdefabcdefab',
                puni_provider_identity: 'abcdefabcdefabcdefabcdefabcdefab',
                ansible_ssh_common_args: `-o UserKnownHostsFile=${knownHostsPath} -o StrictHostKeyChecking=yes`,
              },
            },
          },
          k3s_join_servers: { hosts: {} },
        },
      },
    })}\n`;
    const variablesSource = `${JSON.stringify({
      puni_node_name: 'external-c',
      puni_cluster_id: 'workers',
      puni_node_ip: '10.0.0.44',
      puni_machine_id: 'abcdefabcdefabcdefabcdefabcdefab',
      puni_node_capabilities: ['execution'],
    })}\n`;
    const knownHostsSource = '10.0.0.44 ssh-ed25519 AAAAC3NzaReviewedKey\n';
    await writeFile(`${planPath}.inventory.json`, inventorySource, { mode: 0o600 });
    await writeFile(`${planPath}.ansible-vars.json`, variablesSource, { mode: 0o600 });
    await writeFile(knownHostsPath, knownHostsSource, { mode: 0o600 });
    const plan = sealOperationPlan({
      schemaVersion: 1,
      desiredRevision: 'fleet-2026-09-17',
      observationDigest: 'a'.repeat(64),
      observedAt: '2026-09-17T09:00:00.000Z',
      expiresAt: '2026-09-17T09:30:00.000Z',
      request: {
        kind: 'enroll',
        nodeId: 'external-c',
        clusterId: 'workers',
        inventorySha256: createHash('sha256').update(inventorySource).digest('hex'),
        ansibleVariablesSha256: createHash('sha256').update(variablesSource).digest('hex'),
        knownHostsSha256: createHash('sha256').update(knownHostsSource).digest('hex'),
      },
      targetIdentities: [
        'node:external-c',
        'ssh:abcdefabcdefabcdefabcdefabcdefab',
        'cluster:workers',
      ],
      preconditions: ['observation remains current', 'operation lease is owned'],
      effects: ['verify provider identity', 'configure host', 'join cluster'],
      affectedCapabilities: ['execution'],
      storageImplication: 'attachments-must-be-verified-before-scheduling',
      downtimeImplication: 'none-before-schedulable',
      summary: 'enroll external-c',
    });
    let leaseExists = false;
    const calls: CommandRequest[] = [];
    const run = (request: CommandRequest): Promise<CommandResponse> => {
      calls.push(request);
      if (request.executable === 'kubectl' && request.arguments.includes('get')) {
        return Promise.resolve(
          leaseExists
            ? { exitCode: 0, stdout: lease('execution-owner'), stderr: '' }
            : { exitCode: 1, stdout: '', stderr: 'NotFound' },
        );
      }
      if (request.executable === 'kubectl') {
        leaseExists = true;
        return Promise.resolve(leaseMutation(request, 'execution-owner'));
      }
      if (request.arguments.some((argument) => argument.endsWith('/discover.yml'))) {
        return Promise.resolve({
          exitCode: 0,
          stdout:
            'ok: [external-c] => {"msg":"PUNI_MACHINE_FACT={\\"address\\":\\"10.0.0.44\\",\\"machineId\\":\\"abcdefabcdefabcdefabcdefabcdefab\\",\\"name\\":\\"external-c\\"}"}\nPUNI_MACHINE_FACT={"address":"10.0.0.44","machineId":"abcdefabcdefabcdefabcdefabcdefab","name":"external-c"}\nPLAY RECAP\nexternal-c : ok=3 changed=0 unreachable=0 failed=0',
          stderr: '',
        });
      }
      return Promise.resolve({
        exitCode: 0,
        stdout: 'PLAY RECAP\nexternal-c : ok=12 changed=1 unreachable=0 failed=0',
        stderr: '',
      });
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
        'execution-owner',
      ),
    });
    expect(receipt.state).toBe('complete');
    expect(
      calls.some((request) => request.arguments.some((arg) => arg.endsWith('/join.yml'))),
    ).toBe(true);
  });

  it('prepares a private saved plan and emits its exact state bindings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-terraform-plan-'));
    const outputPath = join(directory, 'operation.json.tfplan');
    const backendPath = join(directory, 'backend.json');
    const variablesPath = join(directory, 'nodes.tfvars.json');
    await writeFile(backendPath, backendEvidenceSource, { mode: 0o600 });
    await writeFile(variablesPath, '{"nodes":{}}\n', { mode: 0o600 });
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
      {
        nodeId: 'workers-c',
        clusterId: 'workers',
        operationId: 'provision-workers-c-20260917',
        region: 'fsn1',
        machineType: 'cx33',
        image: 'ubuntu-24.04',
        network: 'private',
        sshKeyIds: ['operator'],
        retainedStorage: false,
        k3sRole: 'agent',
        budgetCapEur: 20,
      },
      'production',
      backendPath,
      variablesPath,
      outputPath,
      run,
    );

    expect(evidence).toEqual({
      terraformPlanSha256: createHash('sha256').update('saved plan bytes').digest('hex'),
      terraformVariablesSha256: createHash('sha256').update('{"nodes":{}}\n').digest('hex'),
      terraformBackendEvidenceSha256: createHash('sha256')
        .update(backendEvidenceSource)
        .digest('hex'),
      terraformStateLineage: 'lineage-1',
      terraformStateSerial: 7,
    });
    expect(Bun.file(outputPath).size).toBe(16);
    expect(await Bun.file(join(directory, 'operation.json.tfvars.json')).text()).toBe(
      '{"nodes":{}}\n',
    );
    expect(calls.find((request) => request.arguments[0] === 'plan')?.arguments).toContain(
      `-var-file=${join(directory, 'operation.json.tfvars.json')}`,
    );
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
    const backendPath = join(directory, 'backend.json');
    const variablesPath = join(directory, 'nodes.tfvars.json');
    await writeFile(backendPath, backendEvidenceSource, { mode: 0o600 });
    await writeFile(variablesPath, terraformVariablesSource, { mode: 0o600 });
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
          {
            nodeId: 'workers-c',
            clusterId: 'workers',
            operationId: 'provision-workers-c-20260917',
            region: 'fsn1',
            machineType: 'cx33',
            image: 'ubuntu-24.04',
            network: 'private',
            sshKeyIds: ['operator'],
            retainedStorage: false,
            k3sRole: 'agent',
            budgetCapEur: 20,
          },
          'production',
          backendPath,
          variablesPath,
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
    await writeFile(`${planPath}.backend.json`, backendEvidenceSource, { mode: 0o600 });
    await writeFile(`${planPath}.ansible-vars.json`, ansibleVariablesSource, { mode: 0o600 });
    const plan = operationPlan(createHash('sha256').update(savedPlan).digest('hex'));
    let leaseExists = false;
    let providerExists = false;
    const calls: CommandRequest[] = [];
    const run = (request: CommandRequest): Promise<CommandResponse> => {
      calls.push(request);
      if (request.executable === 'kubectl' && request.arguments.includes('get')) {
        return Promise.resolve(
          leaseExists
            ? { exitCode: 0, stdout: lease('execution-owner'), stderr: '' }
            : { exitCode: 1, stdout: '', stderr: 'NotFound' },
        );
      }
      if (request.executable === 'kubectl') {
        leaseExists = true;
        return Promise.resolve(leaseMutation(request, 'execution-owner'));
      }
      if (request.executable === 'terraform' && request.arguments[0] === 'state') {
        return Promise.resolve({
          exitCode: 0,
          stdout: terraformState('running', providerExists),
          stderr: '',
        });
      }
      if (request.executable === 'terraform' && request.arguments[0] === 'show') {
        return Promise.resolve({ exitCode: 0, stdout: terraformShow(), stderr: '' });
      }
      if (request.executable === 'terraform' && request.arguments[0] === 'output') {
        return Promise.resolve({ exitCode: 0, stdout: output(), stderr: '' });
      }
      if (request.executable === 'terraform' && request.arguments[0] === 'apply') {
        providerExists = true;
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      }
      if (request.executable === 'ansible-inventory') {
        return Promise.resolve({
          exitCode: 0,
          stdout: providerInventory(providerExists),
          stderr: '',
        });
      }
      if (request.executable === 'ansible-playbook') {
        return Promise.resolve({
          exitCode: 0,
          stdout: request.arguments.some((argument) => argument.endsWith('/discover.yml'))
            ? machineFact('workers-c', '10.0.0.23', '0123456789abcdef0123456789abcdef')
            : 'PLAY RECAP\nworkers-c : ok=12 changed=1 unreachable=0 failed=0 skipped=0',
          stderr: '',
        });
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
        'execution-owner',
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
    expect(await Bun.file(`${planPath}.machine-id`).text()).toBe(
      '0123456789abcdef0123456789abcdef\n',
    );
    expect(
      calls.some(
        (request) =>
          request.executable === 'ansible-playbook' &&
          request.arguments.includes('puni_machine_id=0123456789abcdef0123456789abcdef'),
      ),
    ).toBe(true);
    expect(
      calls.some(
        (request) =>
          request.executable === 'kubectl' &&
          request.arguments.includes('replace') &&
          request.stdin?.includes('1970-01-01T00:00:00.000Z') === true,
      ),
    ).toBe(true);
  });

  it('imports an operation-owned server after a lost response and requires a fresh plan', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-response-lost-'));
    const planPath = join(directory, 'operation.json');
    const savedPlan = new TextEncoder().encode('reviewed terraform plan');
    await writeFile(`${planPath}.backend.json`, backendEvidenceSource, { mode: 0o600 });
    const variablesPath = join(directory, 'nodes.tfvars.json');
    const variablesSource = '{"nodes":{"workers-c":{"name":"workers-c"}}}\n';
    await writeFile(variablesPath, variablesSource, { mode: 0o600 });
    await prepareTerraformPlan(
      '/repo',
      {
        nodeId: 'workers-c',
        clusterId: 'workers',
        operationId: 'provision-workers-c-20260917',
        region: 'fsn1',
        machineType: 'cx33',
        image: 'ubuntu-24.04',
        network: 'private',
        sshKeyIds: ['operator'],
        retainedStorage: false,
        k3sRole: 'agent',
        budgetCapEur: 20,
      },
      'production',
      `${planPath}.backend.json`,
      variablesPath,
      `${planPath}.tfplan`,
      async (request) => {
        if (request.arguments[0] === 'validate') {
          return { exitCode: 0, stdout: '{"valid":true,"diagnostics":[]}', stderr: '' };
        }
        if (request.arguments[0] === 'plan') {
          const outputPath = request.arguments
            .find((argument) => argument.startsWith('-out='))
            ?.slice('-out='.length);
          if (outputPath === undefined) throw new Error('Test plan request has no output');
          await writeFile(outputPath, savedPlan);
        }
        if (request.arguments[0] === 'show') {
          return { exitCode: 0, stdout: terraformShow(), stderr: '' };
        }
        if (request.arguments[0] === 'state') {
          return { exitCode: 0, stdout: terraformState('running', false), stderr: '' };
        }
        return { exitCode: 0, stdout: '', stderr: '' };
      },
    );
    const plan = operationPlan(
      createHash('sha256').update(savedPlan).digest('hex'),
      createHash('sha256').update(variablesSource).digest('hex'),
    );
    let leaseExists = false;
    let imports = 0;
    let applies = 0;
    const run = async (request: CommandRequest): Promise<CommandResponse> => {
      if (request.executable === 'kubectl' && request.arguments.includes('get')) {
        return Promise.resolve(
          leaseExists
            ? { exitCode: 0, stdout: lease('execution-owner'), stderr: '' }
            : { exitCode: 1, stdout: '', stderr: 'NotFound' },
        );
      }
      if (request.executable === 'kubectl') {
        leaseExists = true;
        return Promise.resolve(leaseMutation(request, 'execution-owner'));
      }
      if (request.executable === 'terraform' && request.arguments[0] === 'state') {
        return Promise.resolve({
          exitCode: 0,
          stdout: terraformState('running', false),
          stderr: '',
        });
      }
      if (request.executable === 'terraform' && request.arguments[0] === 'import') {
        imports += 1;
        const reviewedVariables = request.arguments
          .find((argument) => argument.startsWith('-var-file='))
          ?.slice('-var-file='.length);
        if (reviewedVariables === undefined) throw new Error('Import has no reviewed variables');
        expect(await Bun.file(reviewedVariables).text()).toBe(variablesSource);
      }
      if (request.executable === 'terraform' && request.arguments[0] === 'apply') applies += 1;
      if (request.executable === 'ansible-inventory') {
        return Promise.resolve({ exitCode: 0, stdout: providerInventory(true), stderr: '' });
      }
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    };

    await writeFile(`${planPath}.tfvars.json`, '{"nodes":{"tampered":{}}}\n', { mode: 0o600 });
    expect(
      await rejectionMessage(
        applyOperation({
          plan,
          expectedSha256: plan.planSha256,
          journalPath: `${planPath}.journal.json`,
          dependencies: createProductionApplyDependencies(
            '/repo',
            plan,
            planPath,
            run,
            () => new Date('2026-09-17T09:01:00.000Z'),
            'execution-owner',
          ),
        }),
      ),
    ).toMatch(/import variables.*reviewed SHA-256/i);
    // Proof: changing the preparation-produced variable bytes stops before Terraform import.
    expect(imports).toBe(0);
    await writeFile(`${planPath}.tfvars.json`, variablesSource, { mode: 0o600 });
    await chmod(`${planPath}.tfvars.json`, 0o644);
    expect(
      await rejectionMessage(
        applyOperation({
          plan,
          expectedSha256: plan.planSha256,
          journalPath: `${planPath}.journal.json`,
          dependencies: createProductionApplyDependencies(
            '/repo',
            plan,
            planPath,
            run,
            () => new Date('2026-09-17T09:01:00.000Z'),
            'execution-owner',
          ),
        }),
      ),
    ).toMatch(/import variables must be owner-only/i);
    expect(imports).toBe(0);
    await chmod(`${planPath}.tfvars.json`, 0o600);

    expect(
      await rejectionMessage(
        applyOperation({
          plan,
          expectedSha256: plan.planSha256,
          journalPath: `${planPath}.journal.json`,
          dependencies: createProductionApplyDependencies(
            '/repo',
            plan,
            planPath,
            run,
            () => new Date('2026-09-17T09:01:00.000Z'),
            'execution-owner',
          ),
        }),
      ),
    ).toMatch(/create provider instance/i);
    expect(imports).toBe(1);
    expect(applies).toBe(0);

    const freshPlanPath = join(directory, 'fresh-operation.json');
    await writeFile(`${freshPlanPath}.tfplan`, savedPlan);
    await writeFile(`${freshPlanPath}.backend.json`, backendEvidenceSource, { mode: 0o600 });
    await writeFile(`${freshPlanPath}.ansible-vars.json`, ansibleVariablesSource, { mode: 0o600 });
    await writeFile(`${freshPlanPath}.machine-id`, `${'0'.repeat(32)}\n`, { mode: 0o600 });
    leaseExists = false;
    const observedMachineId = 'ffffffffffffffffffffffffffffffff';
    let joinCalls = 0;
    const recoveredRun = (request: CommandRequest): Promise<CommandResponse> => {
      if (request.executable === 'kubectl' && request.arguments.includes('get')) {
        return Promise.resolve(
          leaseExists
            ? { exitCode: 0, stdout: lease('execution-owner'), stderr: '' }
            : { exitCode: 1, stdout: '', stderr: 'NotFound' },
        );
      }
      if (request.executable === 'kubectl') {
        leaseExists = true;
        return Promise.resolve(leaseMutation(request, 'execution-owner'));
      }
      if (request.executable === 'terraform' && request.arguments[0] === 'state') {
        return Promise.resolve({
          exitCode: 0,
          stdout: terraformState('running', true),
          stderr: '',
        });
      }
      if (request.executable === 'terraform' && request.arguments[0] === 'show') {
        return Promise.resolve({ exitCode: 0, stdout: terraformShow(), stderr: '' });
      }
      if (request.executable === 'terraform' && request.arguments[0] === 'output') {
        return Promise.resolve({ exitCode: 0, stdout: output(), stderr: '' });
      }
      if (request.executable === 'terraform' && request.arguments[0] === 'import') imports += 1;
      if (request.executable === 'terraform' && request.arguments[0] === 'apply') applies += 1;
      if (request.executable === 'ansible-inventory') {
        return Promise.resolve({ exitCode: 0, stdout: providerInventory(true), stderr: '' });
      }
      if (request.executable === 'ansible-playbook') {
        if (!request.arguments.some((argument) => argument.endsWith('/discover.yml'))) {
          joinCalls += 1;
        }
        return Promise.resolve({
          exitCode: 0,
          stdout: request.arguments.some((argument) => argument.endsWith('/discover.yml'))
            ? machineFact('workers-c', '10.0.0.23', observedMachineId)
            : 'PLAY RECAP\nworkers-c : ok=12 changed=0 unreachable=0 failed=0 skipped=0',
          stderr: '',
        });
      }
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    };
    expect(
      await rejectionMessage(
        applyOperation({
          plan,
          expectedSha256: plan.planSha256,
          journalPath: `${freshPlanPath}.journal.json`,
          dependencies: createProductionApplyDependencies(
            '/repo',
            plan,
            freshPlanPath,
            recoveredRun,
            () => new Date('2026-09-17T09:01:00.000Z'),
            'execution-owner',
          ),
        }),
      ),
    ).toMatch(/observed machine identity/i);
    expect(joinCalls).toBe(0);
    await unlink(`${freshPlanPath}.machine-id`);
    expect(
      await rejectionMessage(
        applyOperation({
          plan,
          expectedSha256: plan.planSha256,
          journalPath: `${freshPlanPath}.journal.json`,
          dependencies: createProductionApplyDependencies(
            '/repo',
            plan,
            freshPlanPath,
            recoveredRun,
            () => new Date('2026-09-17T09:01:00.000Z'),
            'execution-owner',
          ),
        }),
      ),
    ).toMatch(/resume without persisted observed machine identity/i);
    expect(joinCalls).toBe(0);
    await writeFile(`${freshPlanPath}.machine-id`, `${observedMachineId}\n`, { mode: 0o600 });
    const receipt = await applyOperation({
      plan,
      expectedSha256: plan.planSha256,
      journalPath: `${freshPlanPath}.journal.json`,
      dependencies: createProductionApplyDependencies(
        '/repo',
        plan,
        freshPlanPath,
        recoveredRun,
        () => new Date('2026-09-17T09:01:00.000Z'),
        'execution-owner',
      ),
    });
    // Proof: treating every observed operation-owned server as unmanaged attempted a second
    // import forever; managed state now continues through the saved plan and enrollment.
    expect(receipt.state).toBe('complete');
    expect(imports).toBe(1);
    expect(applies).toBe(1);
    expect(joinCalls).toBe(2);
  });

  it('refuses exit-zero provider inventory diagnostics before provisioning', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-inventory-diagnostic-'));
    const planPath = join(directory, 'operation.json');
    const savedPlan = new TextEncoder().encode('reviewed terraform plan');
    await writeFile(`${planPath}.tfplan`, savedPlan);
    await writeFile(`${planPath}.backend.json`, backendEvidenceSource, { mode: 0o600 });
    const plan = operationPlan(createHash('sha256').update(savedPlan).digest('hex'));
    let leaseExists = false;
    let applies = 0;
    const run = (request: CommandRequest): Promise<CommandResponse> => {
      if (request.executable === 'kubectl' && request.arguments.includes('get')) {
        return Promise.resolve(
          leaseExists
            ? { exitCode: 0, stdout: lease('execution-owner'), stderr: '' }
            : { exitCode: 1, stdout: '', stderr: 'NotFound' },
        );
      }
      if (request.executable === 'kubectl') {
        leaseExists = true;
        return Promise.resolve(leaseMutation(request, 'execution-owner'));
      }
      if (request.executable === 'terraform' && request.arguments[0] === 'state') {
        return Promise.resolve({
          exitCode: 0,
          stdout: terraformState('running', false),
          stderr: '',
        });
      }
      if (request.executable === 'terraform' && request.arguments[0] === 'apply') applies += 1;
      if (request.executable === 'ansible-inventory') {
        return Promise.resolve({
          exitCode: 0,
          stdout: providerInventory(false),
          stderr: '[WARNING]: hcloud plugin failed authentication',
        });
      }
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
    };
    expect(
      await rejectionMessage(
        applyOperation({
          plan,
          expectedSha256: plan.planSha256,
          journalPath: `${planPath}.journal.json`,
          dependencies: createProductionApplyDependencies(
            '/repo',
            plan,
            planPath,
            run,
            () => new Date('2026-09-17T09:01:00.000Z'),
            'execution-owner',
          ),
        }),
      ),
    ).toMatch(/inventory diagnostics/i);
    // Proof: accepting this exit-zero warning classified failed discovery as absence and would
    // reach Terraform apply; the production adapter records zero provider mutations.
    expect(applies).toBe(0);
  });

  it('refuses concurrent ownership, changed plan bytes, and pending deletion before effects', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-production-refusal-'));
    const planPath = join(directory, 'operation.json');
    await writeFile(`${planPath}.tfplan`, 'changed bytes');
    await writeFile(`${planPath}.backend.json`, backendEvidenceSource, { mode: 0o600 });
    await writeFile(`${planPath}.ansible-vars.json`, ansibleVariablesSource, { mode: 0o600 });
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
            'execution-owner',
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
            : { exitCode: 0, stdout: lease('execution-owner'), stderr: '' },
        );
      }
      if (request.executable === 'kubectl') {
        return Promise.resolve(leaseMutation(request, 'execution-owner'));
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
            'execution-owner',
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
        return Promise.resolve(leaseMutation(request, 'execution-owner'));
      }
      if (request.executable === 'terraform' && request.arguments[0] === 'state') {
        return Promise.resolve({ exitCode: 0, stdout: terraformState('deleting'), stderr: '' });
      }
      if (request.executable === 'terraform') {
        return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' });
      }
      if (request.executable === 'ansible-inventory') {
        return Promise.resolve({ exitCode: 0, stdout: providerInventory(false), stderr: '' });
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
            'execution-owner',
          ),
        }),
      ),
    ).toMatch(/pending deletion/i);
    expect(mutations).toBe(0);
  });
});
