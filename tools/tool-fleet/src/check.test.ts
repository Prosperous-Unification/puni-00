import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { scratchSync } from '@tools/test-scratch';
import { describe, expect, it } from 'bun:test';

import {
  type AnsibleReport,
  assertStrictYaml,
  fleetShellScripts,
  judgeAnsibleSyntax,
  judgeExecutables,
  judgeInventories,
  kustomizationDirectories,
  parseIndexEntries,
} from './check';
import { runChecked } from './check-cli';
import { installLockedTool } from './check-provision';

const unsafe = (value: string) => ({ __ansible_unsafe: value });

function host(ip: string, id: string, logical: string) {
  return {
    ansible_host: unsafe(ip),
    puni_private_ipv4: unsafe(ip),
    puni_instance_id: unsafe(id),
    puni_logical_node: unsafe(logical),
    puni_cluster: unsafe('platform'),
    puni_operation_id: unsafe('op-check'),
    puni_provider_state: unsafe('running'),
  };
}

function inventoryReport(
  overrides: Partial<AnsibleReport['inventories'][number]> = {},
): AnsibleReport {
  return {
    syntax: [{ playbook: 'playbooks/join.yml', exitCode: 0, stderr: '' }],
    inventories: [
      {
        file: 'inventory/platform.hcloud.yml',
        cluster: 'platform',
        exitCode: 0,
        stderr: '',
        selectors: ['puni-fleet=puni,puni-cluster=platform'],
        listed: {
          _meta: {
            hostvars: {
              bootstrap: host('10.0.0.11', '11', 'server-1'),
              joiner: host('10.0.0.12', '12', 'server-2'),
              agent: host('10.0.0.13', '13', 'agent-1'),
            },
          },
          k3s_bootstrap_servers: { hosts: ['bootstrap'] },
          k3s_join_servers: { hosts: ['joiner'] },
          k3s_agents: { hosts: ['agent'] },
        },
        ...overrides,
      },
    ],
  };
}

describe('ansible judgements', () => {
  it('accepts the fixture fleet listed in its groups with its facts', () => {
    expect(judgeInventories(inventoryReport())).toEqual([]);
  });

  it('refuses an inventory that lists a foreign-cluster host', () => {
    const report = inventoryReport();
    const listed = report.inventories[0].listed as { _meta: { hostvars: Record<string, unknown> } };
    listed._meta.hostvars['foreigner'] = host('10.1.0.14', '14', 'agent-9');
    expect(judgeInventories(report)).toEqual([
      'inventory/platform.hcloud.yml lists hosts [agent, bootstrap, foreigner, joiner], not bootstrap, joiner, agent',
    ]);
  });

  it('refuses a host reachable at anything but its private address', () => {
    const report = inventoryReport();
    const listed = report.inventories[0].listed as {
      _meta: { hostvars: Record<string, Record<string, unknown>> };
    };
    delete listed._meta.hostvars['agent']['ansible_host'];
    expect(judgeInventories(report)).toContain(
      'inventory/platform.hcloud.yml: agent.ansible_host is undefined, not 10.0.0.13',
    );
  });

  it('refuses an inventory the plugin could not parse, naming its cause', () => {
    const report = inventoryReport({
      exitCode: 1,
      listed: null,
      stderr:
        "[WARNING]: Failed to parse inventory with 'auto' plugin: 'hcloud_private_ipv4' is undefined\n",
    });
    expect(judgeInventories(report)).toEqual([
      "inventory/platform.hcloud.yml does not parse against the fixture API: 'hcloud_private_ipv4' is undefined",
    ]);
  });

  it('refuses a selector for another cluster, and an empty report', () => {
    expect(judgeInventories(inventoryReport({ selectors: ['puni-fleet=puni'] }))[0]).toContain(
      'not puni-fleet=puni,puni-cluster=platform',
    );
    expect(judgeInventories({ syntax: [], inventories: [] })).toEqual([
      'no hcloud inventories were validated',
    ]);
    expect(judgeAnsibleSyntax({ syntax: [], inventories: [] })).toEqual([
      'no playbooks were syntax-checked',
    ]);
  });

  it('reports a playbook that fails --syntax-check', () => {
    const report = inventoryReport();
    const syntax = [{ playbook: 'playbooks/retire.yml', exitCode: 4, stderr: 'no module\n' }];
    expect(judgeAnsibleSyntax({ ...report, syntax })).toEqual([
      'playbooks/retire.yml fails --syntax-check: no module',
    ]);
  });
});

describe('executable ownership', () => {
  const targets = [{ project: 'p', commands: ['shellcheck -s bash bin/owned.sh'] }];

  it('accepts executables shellchecked by a target, by this check, or in the baseline', () => {
    expect(
      judgeExecutables(
        ['bin/owned.sh', 'infra/x.sh', 'bin/legacy.sh'],
        targets,
        ['infra/x.sh'],
        ['bin/legacy.sh'],
      ),
    ).toEqual([]);
  });

  it('refuses a new executable no target shellchecks', () => {
    expect(judgeExecutables(['bin/owned.sh', 'infra/new.bash'], targets, [], [])).toEqual([
      'infra/new.bash is executable but no Nx target shellchecks it',
    ]);
  });

  it('refuses a stale baseline entry so the baseline only shrinks', () => {
    expect(
      judgeExecutables(['bin/owned.sh'], targets, [], ['bin/owned.sh', 'bin/gone.sh']),
    ).toEqual([
      'bin/owned.sh is in check-tools.json uncheckedExecutables but is checked or gone; remove it',
      'bin/gone.sh is in check-tools.json uncheckedExecutables but is checked or gone; remove it',
    ]);
  });

  it('does not count a target that names a script without shellchecking it', () => {
    expect(
      judgeExecutables(['bin/run.sh'], [{ project: 'p', commands: ['bash bin/run.sh'] }], [], []),
    ).toEqual(['bin/run.sh is executable but no Nx target shellchecks it']);
  });
});

describe('tree inventory helpers', () => {
  it('parses git index entries and refuses anything else', () => {
    expect(parseIndexEntries([`100755 ${'a'.repeat(40)} 0\tbin/x.sh`])).toEqual([
      { mode: '100755', path: 'bin/x.sh' },
    ]);
    expect(() => parseIndexEntries(['garbage'])).toThrow('unexpected git ls-files line');
  });

  it('owns infra and deploy shell scripts plus publish-release', () => {
    expect(fleetShellScripts(['infra/ci/a.sh', 'deploy/b.sh', 'bin/c.sh', 'infra/d.bash'])).toEqual(
      ['bin/publish-release.sh', 'deploy/b.sh', 'infra/ci/a.sh'],
    );
  });

  it('finds kustomizations under infra and deploy/k8s only', () => {
    expect(
      kustomizationDirectories([
        'infra/platform/policy/kustomization.yaml',
        'deploy/k8s/wbs/base/kustomization.yaml',
        'apps/x/kustomization.yaml',
      ]),
    ).toEqual(['deploy/k8s/wbs/base', 'infra/platform/policy']);
  });

  it('refuses duplicate keys and malformed YAML', () => {
    expect(() => {
      assertStrictYaml('a.yaml', 'kind: A\nkind: B\n');
    }).toThrow('a.yaml:');
    expect(() => {
      assertStrictYaml('b.yaml', 'a: [1\n');
    }).toThrow('b.yaml:');
    expect(() => {
      assertStrictYaml('c.yaml', '---\nkind: A\n---\nkind: B\n');
    }).not.toThrow();
  });
});

describe('locked tool provisioning', () => {
  it('refuses a download whose digest differs from the lock, installing nothing', async () => {
    const served = new TextEncoder().encode('#!/bin/sh\necho tampered\n');
    const server = Bun.serve({ port: 0, fetch: () => new Response(served) });
    const cache = scratchSync('fleet-check-tools-');
    try {
      const artifact = {
        name: 'probe',
        version: '1.0.0',
        url: `http://127.0.0.1:${String(server.port)}/probe`,
        sha256: 'b'.repeat(64),
        member: null,
      };
      const outcome = await installLockedTool(artifact, cache, runChecked).then(
        () => 'installed',
        (e: unknown) => String(e),
      );
      expect(outcome).toContain(
        `has sha256 ${createHash('sha256').update(served).digest('hex')}; the lock requires ${'b'.repeat(64)}`,
      );
      expect(existsSync(join(cache, 'probe-1.0.0', 'probe'))).toBe(false);
      const exact = { ...artifact, sha256: createHash('sha256').update(served).digest('hex') };
      expect(await installLockedTool(exact, cache, runChecked)).toBe(
        join(cache, 'probe-1.0.0', 'probe'),
      );
    } finally {
      await server.stop(true);
    }
  });
});
