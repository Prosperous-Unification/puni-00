import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { decodeFleet, decodeObservation, type Fleet } from './contracts';
import { type DiscoveryCommand, type DiscoveryResponse, observeFleet } from './discover';
import { digestObservation, type FleetObservationBody } from './observation';

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
              metadata: {
                name: 'platform-a',
                uid: 'uid-platform-a',
                labels: {
                  'puni.dev/capability-control-plane': 'true',
                  'puni.dev/capability-product': 'true',
                  'puni.dev/capability-ingress': 'true',
                },
              },
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
              spec: {
                nodeName: 'platform-a',
                source: { persistentVolumeName: 'pv-platform-a' },
              },
            },
          ],
        }),
      );
    }
    if (command.source === 'kubernetes-pvs:platform') {
      return Promise.resolve(
        response({
          items: [
            {
              metadata: { name: 'pv-platform-a' },
              spec: { claimRef: { namespace: 'default', name: 'claim-platform-a' } },
            },
          ],
        }),
      );
    }
    if (command.source === 'kubernetes-pvcs:platform') {
      return Promise.resolve(
        response({
          items: [
            {
              metadata: { namespace: 'default', name: 'claim-platform-a' },
              spec: { volumeName: 'pv-platform-a' },
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
    expect(observation.nodes[0]?.capabilities).toEqual(['control-plane', 'product', 'ingress']);
    expect(observation.storage).toEqual([
      {
        clusterId: 'platform',
        claims: ['default/claim-platform-a->pv-platform-a'],
        volumes: ['pv-platform-a->default/claim-platform-a'],
        attachments: [
          'pvc:default/claim-platform-a@pv:pv-platform-a#volumeattachment:attachment-platform-a',
        ],
      },
    ]);
    expect(observation.clusters).toEqual([{ id: 'platform', state: 'ready' }]);
    expect(observation.nodes).toEqual([
      expect.objectContaining({
        desiredNodeId: 'platform-a',
        providerIdentity: 'hcloud:1001',
        identitySource: 'provider:platform',
        kubernetesNodeUid: 'uid-platform-a',
        states: ['enrolled', 'ready'],
        storageAttachments: [
          'pvc:default/claim-platform-a@pv:pv-platform-a#volumeattachment:attachment-platform-a',
        ],
      }),
    ]);
    expect(() => decodeObservation(observation)).not.toThrow();
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

    const { digest: _digest, ...body } = observation;
    const { kubernetesNodeUid: _kubernetesNodeUid, ...nodeWithoutKubernetesUid } = body.nodes[0];
    for (const malformedBody of [
      { ...body, sources: [null] },
      { ...body, clusters: [7] },
      { ...body, nodes: [{}] },
      { ...body, sources: body.sources.slice(0, -1) },
      { ...body, storage: [] },
      {
        ...body,
        storage: [
          ...body.storage,
          { clusterId: 'unknown', claims: [], volumes: [], attachments: [] },
        ],
      },
      {
        ...body,
        sources: [...body.sources, { name: 'provider:unknown', observedAt: body.observedAt }],
      },
      { ...body, sources: [body.sources[0], body.sources[0]] },
      { ...body, clusters: [body.clusters[0], body.clusters[0]] },
      { ...body, nodes: [body.nodes[0], body.nodes[0]] },
      { ...body, nodes: [{ ...body.nodes[0], clusterId: 'unknown' }] },
      {
        ...body,
        nodes: [{ ...body.nodes[0], identitySource: 'ssh-facts:platform/unrecorded' }],
      },
      {
        ...body,
        sources: [
          ...body.sources,
          { name: 'provider:workers' as const, observedAt: body.observedAt },
        ],
        clusters: [...body.clusters, { id: 'workers', state: 'not-bootstrapped' as const }],
        storage: [
          ...body.storage,
          { clusterId: 'workers', claims: [], volumes: [], attachments: [] },
        ],
        nodes: [{ ...body.nodes[0], identitySource: 'provider:workers' }],
      },
      {
        ...body,
        nodes: [{ ...body.nodes[0], states: ['enrolled', 'enrolled'] }],
      },
      {
        ...body,
        nodes: [nodeWithoutKubernetesUid],
      },
      {
        ...body,
        nodes: [
          {
            ...body.nodes[0],
            providerIdentity: 'ssh:machine-a',
            machineId: 'machine-a',
          },
        ],
      },
      {
        ...body,
        nodes: [
          {
            ...body.nodes[0],
            storageAttachments: [
              body.nodes[0]?.storageAttachments[0],
              body.nodes[0]?.storageAttachments[0],
            ],
          },
        ],
      },
    ]) {
      const malformedObservation = {
        ...malformedBody,
        digest: digestObservation(malformedBody as unknown as FleetObservationBody),
      };
      expect(() => decodeObservation(malformedObservation)).toThrow(
        /Observation validation failed/,
      );
    }
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
        kubernetesNodeUid: 'uid-platform-a',
        states: ['enrolled', 'ready'],
      }),
    ]);
  });

  it('preserves Kubernetes and storage evidence when the provider host is missing', async () => {
    const run = (command: DiscoveryCommand): Promise<DiscoveryResponse> =>
      command.source === 'provider:platform'
        ? Promise.resolve(response({ _meta: { hostvars: {} } }))
        : successfulRunner()(command);
    const observation = await observeFleet(fleetOf(), { now: () => now, run, root: '/repo' });
    expect(observation.nodes).toEqual([
      expect.objectContaining({
        states: ['missing', 'ready'],
        identitySource: 'kubernetes-nodes:platform',
        kubernetesNodeUid: 'uid-platform-a',
        capabilities: ['control-plane', 'product', 'ingress'],
        storageAttachments: [
          'pvc:default/claim-platform-a@pv:pv-platform-a#volumeattachment:attachment-platform-a',
        ],
      }),
    ]);
  });

  it('preserves enrolled nodes outside desired/provider state and unattached storage', async () => {
    const run = async (command: DiscoveryCommand): Promise<DiscoveryResponse> => {
      if (command.source === 'provider:platform') {
        return response({
          _meta: {
            hostvars: {
              'platform-a': {
                puni_cluster: 'platform',
                puni_instance_id: '1001',
                puni_private_ipv4: '10.0.0.11',
              },
              'outside-desired': {
                puni_cluster: 'platform',
                puni_instance_id: '2002',
                puni_private_ipv4: '10.0.0.22',
              },
            },
          },
        });
      }
      if (command.source === 'kubernetes-nodes:platform') {
        return response({
          items: ['1001', '2002', '3003'].map((instanceId) => ({
            metadata: { name: `node-${instanceId}`, uid: `uid-${instanceId}`, labels: {} },
            spec: { providerID: `hcloud://${instanceId}` },
            status: { conditions: [{ type: 'Ready', status: 'True' }], nodeInfo: {} },
          })),
        });
      }
      if (command.source === 'kubernetes-pvs:platform') {
        const base = await successfulRunner()(command);
        const document = JSON.parse(base.stdout) as { items: unknown[] };
        document.items.push({ metadata: { name: 'local-unattached' }, spec: {} });
        return response(document);
      }
      return successfulRunner()(command);
    };
    const observation = await observeFleet(fleetOf(), { now: () => now, run, root: '/repo' });
    const outsideDesired = observation.nodes.find(
      ({ providerIdentity }) => providerIdentity === 'hcloud:2002',
    );
    expect(outsideDesired?.states).toEqual(['enrolled', 'ready']);
    expect(outsideDesired?.identitySource).toBe('provider:platform');
    expect(outsideDesired?.kubernetesNodeUid).toBe('uid-2002');
    const kubernetesOnly = observation.nodes.find(
      ({ providerIdentity }) => providerIdentity === 'hcloud:3003',
    );
    expect(kubernetesOnly?.states).toEqual(['missing', 'enrolled', 'ready']);
    expect(kubernetesOnly?.identitySource).toBe('kubernetes-nodes:platform');
    expect(kubernetesOnly?.kubernetesNodeUid).toBe('uid-3003');
    expect(observation.storage[0]?.volumes).toContain('local-unattached->unclaimed');
    const baseline = await observeFleet(fleetOf(), {
      now: () => now,
      run: successfulRunner(),
      root: '/repo',
    });
    expect(observation.digest).not.toBe(baseline.digest);
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
ok: [10.0.0.99] => {"msg":"PUNI_MACHINE_FACT={\\"address\\":\\"10.0.0.99\\",\\"machineId\\":\\"machine-platform-a\\",\\"name\\":\\"different-display-name\\"}"}

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

    expect(
      observeFleet(fleetOf('complete', 'ssh'), {
        now: () => now,
        run: (command) =>
          command.source.startsWith('ssh-facts:')
            ? Promise.resolve({
                exitCode: 0,
                stderr: '',
                observedAt: now.toISOString(),
                stdout:
                  'TASK [Emit fleet machine fact]\nok: [host] => {"msg":"PUNI_MACHINE_FACT={bad}"}\nPLAY RECAP',
              })
            : run(command),
        root: '/repo',
      }),
    ).rejects.toThrow(/malformed machine identity fact/i);
  });

  it('round-trips replaced and unenrolled SSH identities with their actual source', async () => {
    const replacementRunner =
      (enrolled: boolean) =>
      (command: DiscoveryCommand): Promise<DiscoveryResponse> => {
        if (command.source === 'provider:platform')
          return Promise.resolve(response({ _meta: { hostvars: {} } }));
        if (command.source === 'kubernetes-nodes:platform') {
          return Promise.resolve(
            response({
              items: enrolled
                ? [
                    {
                      metadata: { name: 'replacement', uid: 'uid-replacement', labels: {} },
                      spec: {},
                      status: {
                        conditions: [{ type: 'Ready', status: 'True' }],
                        nodeInfo: { machineID: 'machine-replacement' },
                      },
                    },
                  ]
                : [],
            }),
          );
        }
        if (command.source.startsWith('ssh-facts:')) {
          return Promise.resolve(
            response({
              hosts: [
                {
                  name: 'replacement',
                  machineId: 'machine-replacement',
                  address: '10.0.0.99',
                },
              ],
            }),
          );
        }
        return Promise.resolve(response({ items: [] }));
      };

    for (const enrolled of [true, false]) {
      const observation = await observeFleet(fleetOf('complete', 'ssh'), {
        now: () => now,
        run: replacementRunner(enrolled),
        root: '/repo',
      });
      const replacement = observation.nodes.find(
        ({ providerIdentity }) => providerIdentity === 'ssh:machine-replacement',
      );
      expect(replacement?.identitySource).toBe('ssh-facts:platform/platform-a');
      expect(replacement?.states).toEqual(
        enrolled ? ['enrolled', 'ready'] : ['discovered-unenrolled'],
      );
      expect(() => decodeObservation(observation)).not.toThrow();
    }
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

    expect(
      observeFleet(fleetOf('required'), {
        now: () => now,
        run: (command) =>
          command.source === 'kubernetes-nodes:platform'
            ? Promise.resolve({
                exitCode: 0,
                stdout: '{',
                stderr: '',
                observedAt: now.toISOString(),
              })
            : bootstrapRunner(command),
        root: '/repo',
      }),
    ).rejects.toThrow(/kubernetes-nodes:platform.*malformed JSON/i);

    expect(
      observeFleet(fleetOf('required'), {
        now: () => now,
        run: (command) =>
          command.source === 'kubernetes-nodes:platform'
            ? Promise.resolve({
                exitCode: 1,
                stdout: '',
                stderr: 'Error from server (Forbidden)',
                observedAt: now.toISOString(),
              })
            : bootstrapRunner(command),
        root: '/repo',
      }),
    ).rejects.toThrow(/kubernetes-nodes:platform.*Forbidden/i);
  });

  it('refuses duplicate machine identity emitted by distinct SSH fact sources', () => {
    const fleet = decodeFleet({
      schemaVersion: 1,
      revision: 'ssh-duplicate-v1',
      clusters: [
        {
          id: 'platform',
          purpose: 'platform',
          apiEndpoint: 'https://platform.example.test:6443',
          controlPlane: 'single',
          bootstrap: 'complete',
          requiredCapabilities: { product: 1, ingress: 1 },
        },
      ],
      nodes: [
        {
          id: 'platform-a',
          cluster: 'platform',
          capabilities: ['control-plane', 'product', 'ingress'],
          lifecycle: 'present',
          provider: { kind: 'ssh', machineId: 'desired-a', address: '10.0.0.11' },
        },
        {
          id: 'platform-b',
          cluster: 'platform',
          capabilities: ['observability'],
          lifecycle: 'present',
          provider: { kind: 'ssh', machineId: 'desired-b', address: '10.0.0.12' },
        },
      ],
    });
    const run = (command: DiscoveryCommand): Promise<DiscoveryResponse> => {
      if (command.source === 'provider:platform')
        return Promise.resolve(response({ _meta: { hostvars: {} } }));
      if (command.source === 'kubernetes-nodes:platform')
        return Promise.resolve(response({ items: [] }));
      if (command.source.startsWith('ssh-facts:')) {
        return Promise.resolve(
          response({
            hosts: [
              { name: 'same-machine', machineId: 'observed-duplicate', address: '10.0.0.99' },
            ],
          }),
        );
      }
      return Promise.resolve(response({ items: [] }));
    };
    expect(observeFleet(fleet, { now: () => now, run, root: '/repo' })).rejects.toThrow(
      /duplicates provider identity ssh:observed-duplicate/i,
    );
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
        'duplicate provider identity',
        async (command) =>
          command.source === 'provider:platform'
            ? response({
                _meta: {
                  hostvars: {
                    'platform-a': {
                      puni_cluster: 'platform',
                      puni_instance_id: '1001',
                      puni_private_ipv4: '10.0.0.11',
                    },
                    'platform-copy': {
                      puni_cluster: 'platform',
                      puni_instance_id: '1001',
                      puni_private_ipv4: '10.0.0.12',
                    },
                  },
                },
              })
            : successfulRunner()(command),
        /provider:platform.*duplicates provider identity hcloud:1001/i,
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
        'node identity',
        async (command) =>
          command.source === 'kubernetes-nodes:platform'
            ? response({
                items: [
                  {
                    metadata: { name: 'platform-a', uid: 'uid-platform-a' },
                    spec: {},
                    status: { conditions: [], nodeInfo: {} },
                  },
                ],
              })
            : successfulRunner()(command),
        /kubernetes-nodes:platform.*no provider or machine identity/i,
      ],
      [
        'duplicate node identity',
        async (command) =>
          command.source === 'kubernetes-nodes:platform'
            ? response({
                items: [
                  {
                    metadata: { name: 'platform-a', uid: 'uid-a' },
                    spec: { providerID: 'hcloud://1001' },
                    status: { conditions: [], nodeInfo: {} },
                  },
                  {
                    metadata: { name: 'platform-copy', uid: 'uid-b' },
                    spec: { providerID: 'hcloud://1001' },
                    status: { conditions: [], nodeInfo: {} },
                  },
                ],
              })
            : successfulRunner()(command),
        /kubernetes-nodes:platform.*duplicates Kubernetes identity hcloud:1001/i,
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
                      labels: { 'puni.dev/capability-database': 'true' },
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
        'disabled capability label',
        async (command) =>
          command.source === 'kubernetes-nodes:platform'
            ? response({
                items: [
                  {
                    metadata: {
                      name: 'platform-a',
                      uid: 'uid-platform-a',
                      labels: { 'puni.dev/capability-product': 'false' },
                    },
                    spec: {},
                    status: { conditions: [], nodeInfo: {} },
                  },
                ],
              })
            : successfulRunner()(command),
        /kubernetes-nodes:platform.*non-true observed capability label/i,
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
        'claim member',
        async (command) =>
          command.source === 'kubernetes-pvcs:platform'
            ? response({ items: [{}] })
            : successfulRunner()(command),
        /kubernetes-pvcs:platform.*metadata/i,
      ],
      [
        'volume member',
        async (command) =>
          command.source === 'kubernetes-pvs:platform'
            ? response({ items: [{}] })
            : successfulRunner()(command),
        /kubernetes-pvs:platform.*metadata/i,
      ],
      [
        'duplicate claim',
        async (command) =>
          command.source === 'kubernetes-pvcs:platform'
            ? response({
                items: [
                  {
                    metadata: { namespace: 'default', name: 'claim-platform-a' },
                    spec: { volumeName: 'pv-platform-a' },
                  },
                  {
                    metadata: { namespace: 'default', name: 'claim-platform-a' },
                    spec: { volumeName: 'pv-platform-a' },
                  },
                ],
              })
            : successfulRunner()(command),
        /duplicates persistent volume claim/i,
      ],
      [
        'duplicate volume',
        async (command) =>
          command.source === 'kubernetes-pvs:platform'
            ? response({
                items: [
                  { metadata: { name: 'pv-platform-a' }, spec: {} },
                  { metadata: { name: 'pv-platform-a' }, spec: {} },
                ],
              })
            : successfulRunner()(command),
        /duplicates persistent volume pv-platform-a/i,
      ],
      [
        'duplicate attachment',
        async (command) =>
          command.source === 'kubernetes-volumeattachments:platform'
            ? response({
                items: [
                  {
                    metadata: { name: 'attachment-platform-a' },
                    spec: {
                      nodeName: 'platform-a',
                      source: { persistentVolumeName: 'pv-platform-a' },
                    },
                  },
                  {
                    metadata: { name: 'attachment-platform-a' },
                    spec: {
                      nodeName: 'platform-a',
                      source: { persistentVolumeName: 'pv-platform-a' },
                    },
                  },
                ],
              })
            : successfulRunner()(command),
        /duplicates volume attachment attachment-platform-a/i,
      ],
      [
        'unobserved attachment volume',
        async (command) =>
          command.source === 'kubernetes-pvs:platform'
            ? response({ items: [] })
            : successfulRunner()(command),
        /references unobserved persistent volume pv-platform-a/i,
      ],
      [
        'unverified attachment claim',
        async (command) =>
          command.source === 'kubernetes-pvcs:platform'
            ? response({ items: [] })
            : successfulRunner()(command),
        /cannot verify bound claim default\/claim-platform-a/i,
      ],
      [
        'attachment identity',
        async (command) =>
          command.source === 'kubernetes-volumeattachments:platform'
            ? response({
                items: [
                  {
                    metadata: { name: 'attachment-a' },
                    spec: { source: { persistentVolumeName: 'pv-platform-a' } },
                  },
                ],
              })
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
    expect(observation.nodes[0]?.states).toEqual(['missing', 'ready']);

    let clockReads = 0;
    expect(
      observeFleet(fleetOf(), {
        now: () => (clockReads++ < 5 ? now : new Date(now.getTime() + 31_000)),
        run: successfulRunner(),
        root: '/repo',
        maxSourceAgeMs: 30_000,
      }),
    ).rejects.toThrow(/provider:platform.*stale/i);
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
if [ "$PUNI_FAULT" = "stale" ]; then sleep 1; fi
if [ "$PUNI_FAULT" = "timeout" ]; then trap '' TERM; (sleep 0.2; printf survived > "$PUNI_TIMEOUT_SENTINEL") & wait; fi
if [ "$PUNI_FAULT" = "empty" ] || [ "$PUNI_FAULT" = "dockerfail" ]; then printf '{"_meta":{"hostvars":{}}}'; exit 0; fi
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
    const docker = `#!/bin/sh
printf '%s\n' "$*" >> "$PUNI_DOCKER_LOG"
if [ "$PUNI_FAULT" = "dockerfail" ]; then
  for argument in "$@"; do
    if [ "$argument" = "kubectl" ]; then echo 'registry request failed: i/o timeout' >&2; exit 125; fi
  done
fi
while [ "$#" -gt 0 ]; do
  case "$1" in
    ansible-inventory|kubectl|ansible-playbook)
      executable="$1"
      shift
      exec "$PUNI_FAKE_BIN/$executable" "$@"
      ;;
  esac
  shift
done
echo 'controller command missing' >&2
exit 98
`;
    for (const [name, source] of [
      ['ansible-inventory', provider],
      ['kubectl', kubectl],
      ['ansible-playbook', playbook],
      ['docker', docker],
    ] as const) {
      const path = join(binaries, name);
      await writeFile(path, source);
      await chmod(path, 0o700);
    }
    const mutationSentinel = join(directory, 'apply-called');
    const timeoutSentinel = join(directory, 'timeout-survived');
    const dockerLog = join(directory, 'docker.log');
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
            PUNI_FAKE_BIN: binaries,
            PUNI_DOCKER_LOG: dockerLog,
            PUNI_TIMEOUT_SENTINEL: timeoutSentinel,
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

    const bootstrapFleet = join(directory, 'bootstrap-fleet.json');
    const dockerFailureOutput = join(directory, 'docker-failure.json');
    await Bun.write(bootstrapFleet, JSON.stringify(fleetOf('required')));
    const dockerFailure = Bun.spawnSync(
      [
        process.execPath,
        join(import.meta.dir, 'entrypoint.ts'),
        'discover',
        '--fleet',
        bootstrapFleet,
        '--output',
        dockerFailureOutput,
      ],
      {
        env: {
          ...process.env,
          PATH: `${binaries}:${process.env['PATH'] ?? ''}`,
          PUNI_FAULT: 'dockerfail',
          PUNI_FAKE_BIN: binaries,
          PUNI_DOCKER_LOG: dockerLog,
          PUNI_TIMEOUT_SENTINEL: timeoutSentinel,
        },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    );
    expect(dockerFailure.exitCode).not.toBe(0);
    expect(dockerFailure.stderr.toString()).toMatch(
      /Controller failed while reading kubernetes-nodes:platform.*exit 125.*i\/o timeout/i,
    );
    expect(Bun.file(dockerFailureOutput).size).toBe(0);

    const invoke = (argv: readonly string[]) =>
      Bun.spawnSync(
        [process.execPath, join(import.meta.dir, 'entrypoint.ts'), 'discover', ...argv],
        {
          env: {
            ...process.env,
            PATH: `${binaries}:${process.env['PATH'] ?? ''}`,
            PUNI_FAULT: 'empty',
            PUNI_FAKE_BIN: binaries,
            PUNI_DOCKER_LOG: dockerLog,
            PUNI_TIMEOUT_SENTINEL: timeoutSentinel,
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

    const unreadable = invoke([
      '--fleet',
      directory,
      '--output',
      join(directory, 'unreadable-output.json'),
    ]);
    expect(unreadable.exitCode).not.toBe(0);
    expect(unreadable.stderr.toString()).toContain('Cannot read required fleet');

    const occupiedOutput = join(directory, 'empty.json');
    const existingBytes = await readFile(occupiedOutput, 'utf8');
    const occupied = invoke(['--fleet', join(directory, 'fleet.json'), '--output', occupiedOutput]);
    expect(occupied.exitCode).not.toBe(0);
    expect(occupied.stderr.toString()).toContain('Cannot create new fleet observation');
    expect(await readFile(occupiedOutput, 'utf8')).toBe(existingBytes);
    expect(Bun.file(mutationSentinel).size).toBe(0);
    await Bun.sleep(300);
    expect(Bun.file(timeoutSentinel).size).toBe(0);
    const controllerInvocations = await readFile(dockerLog, 'utf8');
    expect(controllerInvocations).toContain(
      'ghcr.io/prosperous-unification/fleet-controller:0.1.0@sha256:',
    );
    expect(controllerInvocations).toContain('--network host');
    expect(controllerInvocations).toContain('timeout --signal=TERM --kill-after=0.1s');
  }, 10_000);
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
    // Terraform names each cluster network `puni-<cluster>`; the plugin needs it for private IPs.
    expect(inventory).toMatch(new RegExp(`^network: puni-${purpose}$`, 'm'));
    expect(await readFile(join(root, 'infra/terraform/main.tf'), 'utf8')).toContain(
      'name     = "puni-${each.key}"',
    );
    expect(inventory).toContain("puni_cluster: hcloud_labels['puni-cluster']");
    expect(inventory).toContain('puni_instance_id: hcloud_id | string');
    expect(inventory).toContain('puni_private_ipv4: hcloud_private_ipv4');
    expect(inventory).not.toContain('public_ipv4');
  }
  const playbook = await readFile(join(root, 'infra/ansible/playbooks/discover.yml'), 'utf8');
  expect(playbook).toContain('src: /etc/machine-id');
  expect(playbook).toContain('puni_display_name | default(puni_node_name, true)');
  expect(playbook.match(/changed_when: false/g)).toHaveLength(3);
  expect(playbook).not.toMatch(/shell:|command:/);
});
