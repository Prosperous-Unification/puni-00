import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import {
  decodeTerraformDestroyPlan,
  decodeTerraformPlan,
  decodeTerraformStateIdentity,
  planTerraformCommands,
  reconcileProvisioningOwnership,
} from './terraform';

const provisioningExpectation = {
  nodeId: 'workers-c',
  operationId: 'provision-workers-c-20260917',
  clusterId: 'workers',
  region: 'fsn1',
  machineType: 'cx33',
  image: 'ubuntu-24.04',
  network: 'private',
  sshKeyIds: ['operator'],
  retainedStorage: false,
  k3sRole: 'agent',
  budgetCapEur: 20,
} as const;

describe('Terraform provisioning boundary', () => {
  it('allows only an exact server destroy and refuses retained storage deletion', () => {
    expect(
      decodeTerraformDestroyPlan(
        {
          terraform_version: '1.16.3',
          resource_changes: [
            {
              address: 'hcloud_server.node["workers-agent-a"]',
              change: {
                actions: ['delete'],
                before: { labels: { 'puni-logical-node': 'workers-agent-a' } },
              },
            },
          ],
        },
        'workers-agent-a',
      ).addresses,
    ).toEqual(['hcloud_server.node["workers-agent-a"]']);
    expect(() =>
      decodeTerraformDestroyPlan(
        {
          terraform_version: '1.16.3',
          resource_changes: [
            {
              address: 'hcloud_server.node["workers-agent-a"]',
              change: {
                actions: ['delete'],
                before: { labels: { 'puni-logical-node': 'workers-agent-a' } },
              },
            },
            {
              address: 'hcloud_volume.retained["workers-agent-a"]',
              change: { actions: ['delete'] },
            },
          ],
        },
        'workers-agent-a',
      ),
    ).toThrow(/unreviewed.*volume/i);
    // Proof: adding retained-volume deletion to an otherwise valid provider-destroy plan makes the
    // production decoder refuse the saved plan before apply.
  });

  it('accepts only the reviewed create addresses and exact state identity', () => {
    const plan = decodeTerraformPlan(
      {
        format_version: '1.2',
        terraform_version: '1.16.3',
        resource_changes: [
          {
            address: 'hcloud_server.node["workers-c"]',
            change: { actions: ['create'] },
          },
          {
            address: 'hcloud_server_network.node["workers-c"]',
            change: { actions: ['create'] },
          },
        ],
      },
      ['hcloud_server.node["workers-c"]', 'hcloud_server_network.node["workers-c"]'],
    );
    expect(plan.addresses).toHaveLength(2);
    expect(decodeTerraformStateIdentity({ lineage: 'lineage-1', serial: 7 })).toEqual({
      lineage: 'lineage-1',
      serial: 7,
    });

    expect(() =>
      decodeTerraformPlan(
        {
          format_version: '1.2',
          terraform_version: '1.16.3',
          resource_changes: [
            { address: 'hcloud_volume.database["prod"]', change: { actions: ['delete'] } },
          ],
        },
        ['hcloud_server.node["workers-c"]'],
      ),
    ).toThrow(/unreviewed|delete/i);
    expect(() =>
      decodeTerraformPlan(
        {
          format_version: '1.2',
          terraform_version: '1.16.3',
          resource_changes: [
            {
              address: 'hcloud_server.node["workers-c"]',
              change: { actions: ['delete'] },
            },
          ],
        },
        ['hcloud_server.node["workers-c"]'],
      ),
    ).toThrow(/destructive|delete/i);
    expect(() => decodeTerraformStateIdentity({ lineage: '', serial: -1 })).toThrow(
      /state identity/i,
    );
    expect(() =>
      decodeTerraformPlan(
        {
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
                    'puni-operation': 'different-operation',
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
        },
        ['hcloud_server.node["workers-c"]'],
        provisioningExpectation,
      ),
    ).toThrow(/attributes differ/i);
    expect(() =>
      decodeTerraformPlan(
        {
          terraform_version: '1.16.3',
          resource_changes: [
            {
              address: 'hcloud_server.node["workers-a"]',
              change: { actions: ['no-op'] },
            },
            {
              address: 'hcloud_server.node["workers-c"]',
              change: { actions: ['create'] },
            },
          ],
        },
        ['hcloud_server.node["workers-c"]'],
      ),
    ).not.toThrow();
  });

  it('builds the locked init, validate, saved-plan, show, and exact-plan apply commands', () => {
    expect(planTerraformCommands('/repo/infra/terraform', '/state/reviewed.tfplan')).toEqual([
      ['init', '-input=false', '-lockfile=readonly'],
      ['validate', '-json'],
      ['plan', '-input=false', '-lock=true', '-out=/state/reviewed.tfplan'],
      ['show', '-json', '/state/reviewed.tfplan'],
      ['apply', '-input=false', '-lock=true', '/state/reviewed.tfplan'],
    ]);
  });

  it('imports the exact operation-owned server after a lost create response', () => {
    expect(
      reconcileProvisioningOwnership('workers-c', 'operation-7', [
        {
          instanceId: '4815162342',
          nodeId: 'workers-c',
          operationId: 'operation-7',
          state: 'running',
        },
      ]),
    ).toEqual({ kind: 'import', instanceId: '4815162342' });
    expect(reconcileProvisioningOwnership('workers-c', 'operation-7', [])).toEqual({
      kind: 'create',
    });
    expect(() =>
      reconcileProvisioningOwnership('workers-c', 'operation-7', [
        {
          instanceId: '1',
          nodeId: 'workers-c',
          operationId: 'operation-7',
          state: 'running',
        },
        {
          instanceId: '2',
          nodeId: 'workers-c',
          operationId: 'operation-7',
          state: 'running',
        },
      ]),
    ).toThrow(/duplicate ownership/i);
    expect(() =>
      reconcileProvisioningOwnership('workers-c', 'operation-7', [
        {
          instanceId: '1',
          nodeId: 'workers-c',
          operationId: 'different',
          state: 'running',
        },
      ]),
    ).toThrow(/different operation/i);
  });

  it('uses stable logical keys and protects retained resources with exact pins', async () => {
    const root = join(import.meta.dir, '../../..');
    const main = await readFile(join(root, 'infra/terraform/main.tf'), 'utf8');
    const versions = await readFile(join(root, 'infra/terraform/versions.tf'), 'utf8');
    const backend = await readFile(join(root, 'infra/terraform/backend.tf'), 'utf8');
    const variables = await readFile(join(root, 'infra/terraform/variables.tf'), 'utf8');
    const lock = await readFile(join(root, 'infra/terraform/.terraform.lock.hcl'), 'utf8');

    expect(main.match(/for_each\s*=/g)?.length).toBeGreaterThanOrEqual(5);
    expect(main).toContain('prevent_destroy = true');
    expect(main).toContain('puni-logical-node');
    expect(main).toContain('puni-operation');
    expect(versions).toContain('required_version = "= 1.16.3"');
    expect(versions).toContain('version = "= 1.69.0"');
    expect(backend).toContain('backend "http"');
    expect(backend).not.toMatch(/address\s*=|password\s*=|username\s*=/);
    expect(variables).toContain('estimated_monthly_cost_eur <= var.budget_cap_eur');
    expect(lock).toContain('version     = "1.69.0"');
    expect(lock).toContain('zh:cbd1c2040111b595cfa5daa201166560b4988eb0227dd6be17e8ae72a5ff1df0');
  });
});
