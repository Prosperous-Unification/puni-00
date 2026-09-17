import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { decodeFleet, decodeObservation, type Fleet } from './contracts';
import { type DiscoveryCommand, type DiscoveryResponse, observeFleet } from './discover';

const now = new Date('2026-09-17T12:00:00.000Z');

function fleetOf(
  bootstrap: 'required' | 'complete' = 'complete',
  provider: 'hcloud' | 'ssh' = 'hcloud',
): Fleet {
  return decodeFleet({
    schemaVersion: 1,
    revision: 'fleet-discovery-v1',
    clusters: [
      {
        id: 'platform',
        purpose: 'platform',
        apiEndpoint: 'https://platform.example.test:6443',
        controlPlane: 'single',
        bootstrap,
        requiredCapabilities: { product: 1, ingress: 1 },
      },
    ],
    nodes:
      bootstrap === 'required'
        ? []
        : [
            {
              id: 'platform-a',
              cluster: 'platform',
              capabilities: ['control-plane', 'product', 'ingress'],
              lifecycle: 'present',
              provider:
                provider === 'hcloud'
                  ? { kind: 'hcloud', instanceId: '1001' }
                  : { kind: 'ssh', machineId: 'machine-platform-a', address: '10.0.0.11' },
            },
          ],
  });
}

function response(stdout: unknown, observedAt = now.toISOString()): DiscoveryResponse {
  return { exitCode: 0, stdout: JSON.stringify(stdout), stderr: '', observedAt };
}

function successfulRunner(instanceId = '1001') {
  return (command: DiscoveryCommand): Promise<DiscoveryResponse> => {
    if (command.source === 'provider:platform') {
      return Promise.resolve(
        response({
          _meta: {
            hostvars: {
              'platform-a': {
                puni_cluster: 'platform',
                puni_instance_id: instanceId,
                puni_private_ipv4: '10.0.0.11',
              },
            },
          },
        }),
      );
    }
    if (command.source === 'kubernetes-nodes:platform') {
      return Promise.resolve(
        response({
          items: [
            {
              metadata: { name: 'platform-a', uid: 'uid-platform-a', labels: {} },
              spec: { providerID: `hcloud://${instanceId}` },
              status: { conditions: [{ type: 'Ready', status: 'True' }], nodeInfo: {} },
            },
          ],
        }),
      );
    }
    if (command.source === 'kubernetes-volumeattachments:platform') {
      return Promise.resolve(
        response({
          items: [
            {
              metadata: { name: 'attachment-platform-a' },
              spec: { nodeName: 'platform-a' },
            },
          ],
        }),
      );
    }
    if (command.source === 'ssh-facts:platform') return Promise.resolve(response({ hosts: [] }));
    return Promise.resolve(response({ items: [] }));
  };
}

describe('observeFleet', () => {
  it('joins cloud and Kubernetes identity and reports readiness and complete sources', async () => {
    const observation = await observeFleet(fleetOf(), {
      now: () => now,
      run: successfulRunner(),
      root: '/repo',
      maxSourceAgeMs: 30_000,
    });

    expect(observation.complete).toBe(true);
    expect(observation.desiredRevision).toBe('fleet-discovery-v1');
    expect(observation.sources).toHaveLength(5);
    expect(observation.clusters).toEqual([{ id: 'platform', state: 'ready' }]);
    expect(observation.nodes).toEqual([
      expect.objectContaining({
        desiredNodeId: 'platform-a',
        providerIdentity: 'hcloud:1001',
        kubernetesNodeUid: 'uid-platform-a',
        states: ['enrolled', 'ready'],
        storageAttachments: ['attachment-platform-a'],
      }),
    ]);
    expect(observation.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(decodeObservation(observation)).toEqual({
      schemaVersion: 1,
      observedAt: observation.observedAt,
      digest: observation.digest,
      complete: true,
    });
    expect(() =>
      decodeObservation({
        ...observation,
        nodes: [{ ...observation.nodes[0], providerIdentity: 'hcloud:replaced' }],
      }),
    ).toThrow(/digest differs/i);
  });

  it('reports provider-only desired nodes as discovered but not enrolled', async () => {
    const run = (command: DiscoveryCommand): Promise<DiscoveryResponse> =>
      command.source === 'kubernetes-nodes:platform'
        ? Promise.resolve(response({ items: [] }))
        : successfulRunner()(command);

    const observation = await observeFleet(fleetOf(), { now: () => now, run, root: '/repo' });
    expect(observation.nodes).toEqual([
      expect.objectContaining({
        desiredNodeId: 'platform-a',
        providerIdentity: 'hcloud:1001',
        states: ['discovered-unenrolled'],
      }),
    ]);
  });

  it('reports draining nodes as retiring while retaining enrollment evidence', async () => {
    const fleet = fleetOf();
    const drainingFleet = decodeFleet({
      ...fleet,
      nodes: fleet.nodes.map((node) => ({ ...node, lifecycle: 'draining' })),
    });
    const observation = await observeFleet(drainingFleet, {
      now: () => now,
      run: successfulRunner(),
      root: '/repo',
    });

    expect(observation.nodes[0]?.states).toEqual(['retiring', 'enrolled', 'ready']);
  });

  it('keeps the desired host missing when the same display name has a new instance identity', async () => {
    const observation = await observeFleet(fleetOf(), {
      now: () => now,
      run: successfulRunner('9999'),
      root: '/repo',
      maxSourceAgeMs: 30_000,
    });

    expect(observation.nodes).toEqual([
      expect.objectContaining({
        desiredNodeId: 'platform-a',
        providerIdentity: 'hcloud:1001',
        states: ['missing'],
      }),
      expect.objectContaining({
        displayName: 'platform-a',
        providerIdentity: 'hcloud:9999',
        states: ['discovered-unenrolled'],
      }),
    ]);
  });

  it('joins an external host by machine identity rather than its address or name', async () => {
    const run = (command: DiscoveryCommand): Promise<DiscoveryResponse> => {
      if (command.source === 'provider:platform') {
        return Promise.resolve(response({ _meta: { hostvars: {} } }));
      }
      if (command.source === 'kubernetes-nodes:platform') {
        return Promise.resolve(
          response({
            items: [
              {
                metadata: { name: 'renamed-in-kubernetes', uid: 'uid-ssh', labels: {} },
                spec: {},
                status: {
                  conditions: [{ type: 'Ready', status: 'False' }],
                  nodeInfo: { machineID: 'machine-platform-a' },
                },
              },
            ],
          }),
        );
      }
      if (command.source.startsWith('ssh-facts:')) {
        return Promise.resolve({
          exitCode: 0,
          stderr: '',
          observedAt: now.toISOString(),
          stdout: `
TASK [Emit fleet machine fact] *************************************************
ok: [10.0.0.99] => {
    "msg": {
        "address": "10.0.0.99",
        "machineId": "machine-platform-a",
        "name": "different-display-name"
    }
}

PLAY RECAP *********************************************************************
10.0.0.99 : ok=3 changed=0 unreachable=0 failed=0
`,
        });
      }
      return Promise.resolve(response({ items: [] }));
    };
    const observation = await observeFleet(fleetOf('complete', 'ssh'), {
      now: () => now,
      run,
      root: '/repo',
    });
    expect(observation.nodes).toEqual([
      expect.objectContaining({
        desiredNodeId: 'platform-a',
        displayName: 'different-display-name',
        providerIdentity: 'ssh:machine-platform-a',
        kubernetesNodeUid: 'uid-ssh',
        states: ['enrolled', 'not-ready'],
      }),
    ]);
    expect(
      observeFleet(fleetOf('complete', 'ssh'), {
        now: () => now,
        run: (command) =>
          command.source.startsWith('ssh-facts:') ? Promise.resolve(response({})) : run(command),
        root: '/repo',
      }),
    ).rejects.toThrow(/ssh-facts:platform\/platform-a.*controlled machine identity fact/i);
  });

  it('distinguishes an intentional empty bootstrap cluster from a failed established API', async () => {
    const bootstrapRunner = (command: DiscoveryCommand): Promise<DiscoveryResponse> => {
      if (command.source === 'provider:platform') {
        return Promise.resolve(response({ _meta: { hostvars: {} } }));
      }
      if (command.source === 'kubernetes-nodes:platform') {
        return Promise.resolve({
          exitCode: 1,
          stdout: '',
          stderr: 'connection refused',
          observedAt: now.toISOString(),
        });
      }
      if (command.source === 'ssh-facts:platform') {
        return Promise.resolve(response({ hosts: [] }));
      }
      return Promise.resolve(response({ items: [] }));
    };
    const observation = await observeFleet(fleetOf('required'), {
      now: () => now,
      run: bootstrapRunner,
      root: '/repo',
      maxSourceAgeMs: 30_000,
    });
    expect(observation.clusters).toEqual([{ id: 'platform', state: 'not-bootstrapped' }]);

    expect(
      observeFleet(fleetOf(), {
        now: () => now,
        run: bootstrapRunner,
        root: '/repo',
        maxSourceAgeMs: 30_000,
      }),
    ).rejects.toThrow(/kubernetes-nodes:platform.*connection refused/i);
  });

  it('refuses failed, malformed, partial, and stale sources while accepting a valid empty list', async () => {
    const faults: readonly [
      string,
      (command: DiscoveryCommand) => Promise<DiscoveryResponse>,
      RegExp,
    ][] = [
      [
        'exit',
        async (command) =>
          command.source === 'provider:platform'
            ? {
                exitCode: 42,
                stdout: '',
                stderr: 'provider unavailable',
                observedAt: now.toISOString(),
              }
            : successfulRunner()(command),
        /provider:platform.*exit 42.*provider unavailable/i,
      ],
      [
        'malformed',
        async (command) =>
          command.source === 'provider:platform'
            ? { exitCode: 0, stdout: '{', stderr: '', observedAt: now.toISOString() }
            : successfulRunner()(command),
        /provider:platform.*malformed JSON/i,
      ],
      [
        'exit-zero diagnostic',
        async (command) =>
          command.source === 'provider:platform'
            ? {
                ...response({ _meta: { hostvars: {} } }),
                stderr:
                  '[WARNING]: Failed to parse inventory with ansible_collections.hetzner.hcloud.plugins.inventory.hcloud plugin',
              }
            : successfulRunner()(command),
        /provider:platform.*failed despite exit 0.*failed to parse inventory/i,
      ],
      [
        'provider shape',
        async (command) =>
          command.source === 'provider:platform'
            ? response({ _meta: [] })
            : successfulRunner()(command),
        /provider:platform.*object field _meta/i,
      ],
      [
        'provider cluster',
        async (command) =>
          command.source === 'provider:platform'
            ? response({
                _meta: {
                  hostvars: {
                    'platform-a': {
                      puni_cluster: 'workers',
                      puni_instance_id: '1001',
                      puni_private_ipv4: '10.0.0.11',
                    },
                  },
                },
              })
            : successfulRunner()(command),
        /provider:platform.*platform-a.*workers/i,
      ],
      [
        'partial',
        async (command) =>
          command.source === 'kubernetes-nodes:platform'
            ? response({
                items: [
                  {
                    metadata: { name: 'platform-a' },
                    spec: {},
                    status: { conditions: [], nodeInfo: {} },
                  },
                ],
              })
            : successfulRunner()(command),
        /kubernetes-nodes:platform.*uid/i,
      ],
      [
        'node conditions',
        async (command) =>
          command.source === 'kubernetes-nodes:platform'
            ? response({
                items: [
                  {
                    metadata: { name: 'platform-a', uid: 'uid-platform-a' },
                    spec: {},
                    status: { nodeInfo: {} },
                  },
                ],
              })
            : successfulRunner()(command),
        /kubernetes-nodes:platform.*status.conditions/i,
      ],
      [
        'capability',
        async (command) =>
          command.source === 'kubernetes-nodes:platform'
            ? response({
                items: [
                  {
                    metadata: {
                      name: 'platform-a',
                      uid: 'uid-platform-a',
                      labels: { 'puni.dev/capabilities': 'database' },
                    },
                    spec: {},
                    status: { conditions: [], nodeInfo: {} },
                  },
                ],
              })
            : successfulRunner()(command),
        /kubernetes-nodes:platform.*unknown observed capability.*database/i,
      ],
      [
        'storage list',
        async (command) =>
          command.source === 'kubernetes-pvcs:platform'
            ? response({})
            : successfulRunner()(command),
        /kubernetes-pvcs:platform.*array field items/i,
      ],
      [
        'attachment identity',
        async (command) =>
          command.source === 'kubernetes-volumeattachments:platform'
            ? response({ items: [{ metadata: { name: 'attachment-a' }, spec: {} }] })
            : successfulRunner()(command),
        /kubernetes-volumeattachments:platform.*nodeName/i,
      ],
      [
        'stale',
        async (command) =>
          command.source === 'provider:platform'
            ? response({ _meta: { hostvars: {} } }, '2026-09-17T11:58:00.000Z')
            : successfulRunner()(command),
        /provider:platform.*stale/i,
      ],
    ];

    for (const [, run, diagnostic] of faults) {
      expect(
        observeFleet(fleetOf(), { now: () => now, run, root: '/repo', maxSourceAgeMs: 30_000 }),
      ).rejects.toThrow(diagnostic);
    }

    const emptyProvider = async (command: DiscoveryCommand): Promise<DiscoveryResponse> =>
      command.source === 'provider:platform'
        ? response({ _meta: { hostvars: {} } })
        : successfulRunner()(command);
    const observation = await observeFleet(fleetOf(), {
      now: () => now,
      run: emptyProvider,
      root: '/repo',
      maxSourceAgeMs: 30_000,
    });
    expect(observation.nodes[0]?.states).toEqual(['missing']);
  });
});

describe('the production discover command', () => {
  it('distinguishes subprocess failures, malformed/partial/stale responses, empty success, and replaced identity', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'fleet-discover-'));
    const binaries = join(directory, 'bin');
    await Bun.write(join(directory, 'fleet.json'), JSON.stringify(fleetOf()));
    await mkdir(binaries);
    const provider = `#!/bin/sh
if [ "$PUNI_FAULT" = "exit" ]; then echo "provider unavailable" >&2; exit 42; fi
if [ "$PUNI_FAULT" = "malformed" ]; then printf '{'; exit 0; fi
if [ "$PUNI_FAULT" = "warning" ]; then printf '{"_meta":{"hostvars":{}}}'; echo '[WARNING]: Failed to parse inventory with hetzner.hcloud.hcloud plugin' >&2; exit 0; fi
if [ "$PUNI_FAULT" = "stale" ] || [ "$PUNI_FAULT" = "timeout" ]; then sleep 1; fi
if [ "$PUNI_FAULT" = "empty" ]; then printf '{"_meta":{"hostvars":{}}}'; exit 0; fi
instance=1001
if [ "$PUNI_FAULT" = "replaced" ]; then instance=9999; fi
printf '{"_meta":{"hostvars":{"platform-a":{"puni_cluster":"platform","puni_instance_id":"%s","puni_private_ipv4":"10.0.0.11"}}}}' "$instance"
`;
    const kubectl = `#!/bin/sh
case "$*" in
  *"get nodes"*)
    if [ "$PUNI_FAULT" = "missing" ]; then printf '{"items":[{"metadata":{"name":"platform-a"},"spec":{},"status":{"conditions":[],"nodeInfo":{}}}]}'; exit 0; fi
    instance=1001
    if [ "$PUNI_FAULT" = "replaced" ]; then instance=9999; fi
    printf '{"items":[{"metadata":{"name":"platform-a","uid":"uid-platform-a","labels":{}},"spec":{"providerID":"hcloud://%s"},"status":{"conditions":[{"type":"Ready","status":"True"}],"nodeInfo":{}}}]}' "$instance"
    ;;
  *) printf '{"items":[]}' ;;
esac
`;
    const playbook = `#!/bin/sh
printf '{"hosts":[]}'
`;
    for (const [name, source] of [
      ['ansible-inventory', provider],
      ['kubectl', kubectl],
      ['ansible-playbook', playbook],
    ] as const) {
      const path = join(binaries, name);
      await writeFile(path, source);
      await chmod(path, 0o700);
    }
    const mutationSentinel = join(directory, 'apply-called');
    const applyPath = join(binaries, 'tool-fleet-apply');
    await writeFile(applyPath, `#!/bin/sh\nprintf called > "${mutationSentinel}"\nexit 99\n`);
    await chmod(applyPath, 0o700);

    const cases = [
      ['exit', 30_000, 30_000, /provider:platform.*exit 42.*provider unavailable/i, false],
      ['malformed', 30_000, 30_000, /provider:platform.*malformed JSON/i, false],
      [
        'warning',
        30_000,
        30_000,
        /provider:platform.*failed despite exit 0.*failed to parse inventory/i,
        false,
      ],
      ['missing', 30_000, 30_000, /kubernetes-nodes:platform.*uid/i, false],
      ['stale', 1, 30_000, /provider:platform.*stale/i, false],
      ['timeout', 30_000, 1, /provider:platform.*timed out after 1ms/i, false],
      ['empty', 30_000, 30_000, undefined, true],
      ['replaced', 30_000, 30_000, undefined, true],
    ] as const;
    for (const [fault, maxAge, timeout, diagnostic, succeeds] of cases) {
      const output = join(directory, `${fault}.json`);
      const invocation = Bun.spawnSync(
        [
          process.execPath,
          join(import.meta.dir, 'entrypoint.ts'),
          'discover',
          '--fleet',
          join(directory, 'fleet.json'),
          '--output',
          output,
          '--max-source-age-ms',
          String(maxAge),
          '--timeout-ms',
          String(timeout),
        ],
        {
          env: {
            ...process.env,
            PATH: `${binaries}:${process.env['PATH'] ?? ''}`,
            PUNI_FAULT: fault,
          },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
      expect(invocation.exitCode === 0).toBe(succeeds);
      if (diagnostic !== undefined) expect(invocation.stderr.toString()).toMatch(diagnostic);
      if (succeeds) {
        const source: unknown = JSON.parse(await readFile(output, 'utf8'));
        expect(source).toEqual(
          expect.objectContaining({ complete: true, desiredRevision: 'fleet-discovery-v1' }),
        );
      }
      expect(Bun.file(mutationSentinel).size).toBe(0);
    }

    const invoke = (argv: readonly string[]) =>
      Bun.spawnSync(
        [process.execPath, join(import.meta.dir, 'entrypoint.ts'), 'discover', ...argv],
        {
          env: {
            ...process.env,
            PATH: `${binaries}:${process.env['PATH'] ?? ''}`,
            PUNI_FAULT: 'empty',
          },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      );
    const base = [
      '--fleet',
      join(directory, 'fleet.json'),
      '--output',
      join(directory, 'boundary.json'),
    ];
    for (const boundary of [
      { argv: [...base, '--unknown', 'ignored'], diagnostic: 'Unexpected fleet discover flag' },
      { argv: [...base, '--timeout-ms'], diagnostic: 'flag has no value' },
      { argv: [...base, '--fleet', 'other'], diagnostic: 'Duplicate fleet discover flag' },
      {
        argv: ['fleet', join(directory, 'fleet.json'), ...base.slice(2)],
        diagnostic: 'argument at position 1',
      },
      { argv: [...base, '--max-source-age-ms', '0'], diagnostic: 'positive integer' },
      {
        argv: ['--output', join(directory, 'missing-fleet.json')],
        diagnostic: 'Missing required --fleet',
      },
      {
        argv: [
          '--fleet',
          join(directory, 'absent.json'),
          '--output',
          join(directory, 'absent-output.json'),
        ],
        diagnostic: 'Cannot read required fleet',
      },
    ]) {
      const invocation = invoke(boundary.argv);
      expect(invocation.exitCode).not.toBe(0);
      expect(invocation.stderr.toString()).toContain(boundary.diagnostic);
    }
    const malformedFleet = join(directory, 'malformed.yaml');
    await writeFile(malformedFleet, '[\n');
    const malformed = invoke([
      '--fleet',
      malformedFleet,
      '--output',
      join(directory, 'malformed-output.json'),
    ]);
    expect(malformed.exitCode).not.toBe(0);
    expect(malformed.stderr.toString()).toContain('malformed YAML');

    const occupiedOutput = join(directory, 'empty.json');
    const existingBytes = await readFile(occupiedOutput, 'utf8');
    const occupied = invoke(['--fleet', join(directory, 'fleet.json'), '--output', occupiedOutput]);
    expect(occupied.exitCode).not.toBe(0);
    expect(occupied.stderr.toString()).toContain('Cannot create new fleet observation');
    expect(await readFile(occupiedOutput, 'utf8')).toBe(existingBytes);
    expect(Bun.file(mutationSentinel).size).toBe(0);
  });
});

it('commits strict uncached private inventories and a read-only machine identity playbook', async () => {
  const root = join(import.meta.dir, '../../..');
  for (const purpose of ['platform', 'workers']) {
    const inventory = await readFile(
      join(root, `infra/ansible/inventory/${purpose}.hcloud.yml`),
      'utf8',
    );
    expect(inventory).toContain('plugin: hetzner.hcloud.hcloud');
    expect(inventory).toContain('strict: true');
    expect(inventory).toContain('cache: false');
    expect(inventory).toContain(`puni-cluster=${purpose}`);
    expect(inventory).toContain('connect_with: private_ipv4');
    expect(inventory).toContain("puni_cluster: hcloud_labels['puni-cluster']");
    expect(inventory).toContain('puni_instance_id: hcloud_id | string');
    expect(inventory).toContain('puni_private_ipv4: hcloud_private_ipv4');
    expect(inventory).not.toContain('public_ipv4');
  }
  const playbook = await readFile(join(root, 'infra/ansible/playbooks/discover.yml'), 'utf8');
  expect(playbook).toContain('src: /etc/machine-id');
  expect(playbook.match(/changed_when: false/g)).toHaveLength(3);
  expect(playbook).not.toMatch(/shell:|command:/);
});
