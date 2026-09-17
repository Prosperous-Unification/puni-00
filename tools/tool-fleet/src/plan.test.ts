import { describe, expect, it } from 'bun:test';

import { decodeFleet, decodeObservation, type Fleet, type Observation } from './contracts';
import { decodeOperationPlan, planOperation } from './plan';

const fleetInput = {
  schemaVersion: 1,
  revision: 'fleet-2026-09-17',
  clusters: [
    {
      id: 'platform',
      purpose: 'platform',
      apiEndpoint: 'https://platform.example.test:6443',
      controlPlane: 'single',
      bootstrap: 'complete',
      requiredCapabilities: { product: 1, ingress: 1, observability: 1 },
    },
    {
      id: 'workers',
      purpose: 'workers',
      apiEndpoint: 'https://workers.example.test:6443',
      controlPlane: 'single',
      bootstrap: 'complete',
      requiredCapabilities: { execution: 2 },
    },
  ],
  nodes: [
    {
      id: 'platform-a',
      cluster: 'platform',
      capabilities: ['control-plane', 'product', 'ingress'],
      lifecycle: 'present',
      provider: { kind: 'hcloud', instanceId: '1001' },
    },
    {
      id: 'platform-observe-b',
      cluster: 'platform',
      capabilities: ['observability'],
      lifecycle: 'present',
      provider: { kind: 'ssh', machineId: 'machine-observe-b', address: '10.0.0.12' },
    },
    {
      id: 'workers-a',
      cluster: 'workers',
      capabilities: ['control-plane'],
      lifecycle: 'present',
      provider: { kind: 'hcloud', instanceId: '2001' },
    },
    {
      id: 'workers-b',
      cluster: 'workers',
      capabilities: ['execution'],
      lifecycle: 'present',
      provider: { kind: 'hcloud', instanceId: '2002' },
    },
    {
      id: 'arbitrary-fourth-host',
      cluster: 'workers',
      capabilities: ['execution'],
      lifecycle: 'present',
      provider: { kind: 'ssh', machineId: 'machine-fourth', address: '10.0.1.14' },
    },
  ],
} as const;

const observation: Observation = {
  schemaVersion: 1,
  observedAt: '2026-09-17T09:00:00.000Z',
  digest: 'a'.repeat(64),
  complete: true,
};

describe('fleet contracts', () => {
  it('decodes only an exact observation identity', () => {
    expect(decodeObservation(observation)).toEqual(observation);
    expect(() => decodeObservation({ ...observation, digest: 'abc' })).toThrow(/digest/i);
    expect(() => decodeObservation({ ...observation, observedAt: 'yesterday' })).toThrow(
      /observedAt/i,
    );
    expect(() =>
      decodeObservation({ ...observation, observedAt: '2026-99-99T99:99:99.000Z' }),
    ).toThrow(/observedAt/i);
    expect(() => decodeObservation({ ...observation, candidateHint: 'ignore-me' })).toThrow(
      /candidateHint/i,
    );
  });

  it('accepts two clusters and an arbitrary fourth hostname without role-code changes', () => {
    const fleet = decodeFleet(fleetInput);
    expect(fleet.nodes.map(({ id }) => id)).toContain('arbitrary-fourth-host');
  });

  it('rejects unknown capabilities, absent provider identity, and duplicate identities', () => {
    const unknownCapability = structuredClone(fleetInput) as unknown as Record<string, unknown>;
    const unknownNodes = unknownCapability['nodes'] as Record<string, unknown>[];
    unknownNodes[0] = { ...unknownNodes[0], capabilities: ['database'] };
    expect(() => decodeFleet(unknownCapability)).toThrow(/capabilities|database/i);

    const absentIdentity = structuredClone(fleetInput) as unknown as Record<string, unknown>;
    const absentNodes = absentIdentity['nodes'] as Record<string, unknown>[];
    absentNodes[0] = { ...absentNodes[0], provider: { kind: 'hcloud' } };
    expect(() => decodeFleet(absentIdentity)).toThrow(/Fleet validation failed.*provider/is);

    const duplicateIdentity = structuredClone(fleetInput) as unknown as Record<string, unknown>;
    const duplicateNodes = duplicateIdentity['nodes'] as Record<string, unknown>[];
    duplicateNodes[4] = {
      ...duplicateNodes[4],
      provider: { kind: 'hcloud', instanceId: '1001' },
    };
    expect(() => decodeFleet(duplicateIdentity)).toThrow(
      /provider identity.*platform-a.*arbitrary/i,
    );
  });

  it('rejects missing cluster policy, duplicate node ids, and platform execution placement', () => {
    const missingPolicy = structuredClone(fleetInput) as unknown as Record<string, unknown>;
    const policyClusters = missingPolicy['clusters'] as Record<string, unknown>[];
    policyClusters[0] = { ...policyClusters[0] };
    delete policyClusters[0]?.['requiredCapabilities'];
    expect(() => decodeFleet(missingPolicy)).toThrow(
      /Fleet validation failed.*requiredCapabilities/is,
    );

    const duplicateNode = structuredClone(fleetInput) as unknown as Record<string, unknown>;
    const duplicateNodes = duplicateNode['nodes'] as Record<string, unknown>[];
    duplicateNodes[4] = { ...duplicateNodes[4], id: 'workers-b' };
    expect(() => decodeFleet(duplicateNode)).toThrow(/node id.*workers-b/i);

    const misplacedExecution = structuredClone(fleetInput) as unknown as Record<string, unknown>;
    const misplacedNodes = misplacedExecution['nodes'] as Record<string, unknown>[];
    misplacedNodes[1] = { ...misplacedNodes[1], capabilities: ['observability', 'execution'] };
    expect(() => decodeFleet(misplacedExecution)).toThrow(/execution.*workers/i);

    const misplacedProduct = structuredClone(fleetInput) as unknown as Record<string, unknown>;
    const productNodes = misplacedProduct['nodes'] as Record<string, unknown>[];
    productNodes[3] = { ...productNodes[3], capabilities: ['execution', 'product'] };
    expect(() => decodeFleet(misplacedProduct)).toThrow(/platform capability.*platform/i);

    const executingServer = structuredClone(fleetInput) as unknown as Record<string, unknown>;
    const serverNodes = executingServer['nodes'] as Record<string, unknown>[];
    serverNodes[2] = { ...serverNodes[2], capabilities: ['control-plane', 'execution'] };
    serverNodes[4] = { ...serverNodes[4], lifecycle: 'retired' };
    expect(() => decodeFleet(executingServer)).toThrow(/control-plane.*execution/i);
  });

  it('rejects duplicate clusters, unknown cluster references, invalid topology, and unmet floors', () => {
    const duplicateCluster = structuredClone(fleetInput) as unknown as Record<string, unknown>;
    const duplicateClusters = duplicateCluster['clusters'] as Record<string, unknown>[];
    duplicateClusters[1] = { ...duplicateClusters[1], id: 'platform' };
    expect(() => decodeFleet(duplicateCluster)).toThrow(/duplicate cluster id/i);

    const unknownCluster = structuredClone(fleetInput) as unknown as Record<string, unknown>;
    const unknownNodes = unknownCluster['nodes'] as Record<string, unknown>[];
    unknownNodes[4] = { ...unknownNodes[4], cluster: 'absent' };
    expect(() => decodeFleet(unknownCluster)).toThrow(/unknown cluster/i);

    const invalidTopology = structuredClone(fleetInput) as unknown as Record<string, unknown>;
    const topologyNodes = invalidTopology['nodes'] as Record<string, unknown>[];
    topologyNodes[2] = { ...topologyNodes[2], capabilities: ['execution'] };
    expect(() => decodeFleet(invalidTopology)).toThrow(/control plane has 0 servers/i);

    const populatedBootstrap = structuredClone(fleetInput) as unknown as Record<string, unknown>;
    const populatedBootstrapClusters = populatedBootstrap['clusters'] as Record<string, unknown>[];
    const bootstrapNodes = populatedBootstrap['nodes'] as Record<string, unknown>[];
    populatedBootstrapClusters[0] = {
      ...populatedBootstrapClusters[0],
      bootstrap: 'required',
    };
    bootstrapNodes[0] = { ...bootstrapNodes[0], capabilities: ['product', 'ingress'] };
    expect(() => decodeFleet(populatedBootstrap)).toThrow(/control plane has 0 servers/i);

    const unmetFloor = structuredClone(fleetInput) as unknown as Record<string, unknown>;
    const floorNodes = unmetFloor['nodes'] as Record<string, unknown>[];
    floorNodes[4] = { ...floorNodes[4], lifecycle: 'retired' };
    expect(() => decodeFleet(unmetFloor)).toThrow(/execution.*requires 2.*provides 1/i);

    const missingBootstrap = structuredClone(fleetInput) as unknown as Record<string, unknown>;
    const bootstrapClusters = missingBootstrap['clusters'] as Record<string, unknown>[];
    delete bootstrapClusters[0]?.['bootstrap'];
    expect(() => decodeFleet(missingBootstrap)).toThrow(/bootstrap/i);
  });

  it('rejects duplicate capabilities and policy for the wrong cluster purpose', () => {
    const duplicateCapability = structuredClone(fleetInput) as unknown as Record<string, unknown>;
    const duplicateNodes = duplicateCapability['nodes'] as Record<string, unknown>[];
    duplicateNodes[3] = { ...duplicateNodes[3], capabilities: ['execution', 'execution'] };
    expect(() => decodeFleet(duplicateCapability)).toThrow(/duplicate capability/i);

    const invalidPolicy = structuredClone(fleetInput) as unknown as Record<string, unknown>;
    const invalidClusters = invalidPolicy['clusters'] as Record<string, unknown>[];
    invalidClusters[0] = {
      ...invalidClusters[0],
      requiredCapabilities: { product: 1, ingress: 1, observability: 1, execution: 1 },
    };
    expect(() => decodeFleet(invalidPolicy)).toThrow(/platform.*execution/i);

    const invalidWorkerPolicy = structuredClone(fleetInput) as unknown as Record<string, unknown>;
    const workerClusters = invalidWorkerPolicy['clusters'] as Record<string, unknown>[];
    workerClusters[1] = {
      ...workerClusters[1],
      requiredCapabilities: { execution: 2, product: 1 },
    };
    expect(() => decodeFleet(invalidWorkerPolicy)).toThrow(/workers.*platform capabilities/i);
  });
});

describe('planOperation', () => {
  const fleet: Fleet = decodeFleet(fleetInput);
  const enrollEvidence = {
    inventorySha256: 'b'.repeat(64),
    ansibleVariablesSha256: 'c'.repeat(64),
    knownHostsSha256: 'd'.repeat(64),
  } as const;

  it('decodes only exact persisted operation plans', () => {
    const plan = planOperation(fleet, observation, {
      kind: 'enroll',
      nodeId: 'workers-b',
      clusterId: 'workers',
      ...enrollEvidence,
    });
    expect(decodeOperationPlan(plan)).toEqual(plan);
    expect(() => decodeOperationPlan({ ...plan, unreviewed: true })).toThrow(/validation failed/i);
    expect(() => decodeOperationPlan({ ...plan, expiresAt: '2026-99-99T99:99:99.000Z' })).toThrow(
      /calendar instant/i,
    );
    expect(() => decodeOperationPlan({ ...plan, expiresAt: '2026-02-30T09:30:00.000Z' })).toThrow(
      /calendar instant/i,
    );
  });

  it('emits deterministic JSON-ready plans for every explicit operation kind', () => {
    const requests = [
      { kind: 'enroll', nodeId: 'workers-b', clusterId: 'workers', ...enrollEvidence },
      { kind: 'retire', nodeId: 'workers-b' },
      { kind: 'replace', nodeId: 'workers-b' },
      { kind: 'upgrade', nodeId: 'workers-b', version: 'v1.36.5+k3s1' },
      {
        kind: 'provision',
        nodeId: 'workers-c',
        clusterId: 'workers',
        cloudAccount: 'puni-production',
        region: 'fsn1',
        machineType: 'cx33',
        image: 'ubuntu-24.04',
        network: 'puni-private',
        sshKeyIds: ['admin-primary'],
        retainedStorage: false,
        k3sRole: 'agent',
        capabilities: ['execution'],
        budgetCapEur: 20,
        providerOwnershipId: 'provision-workers-c-20260917',
        terraformPlanSha256: 'f'.repeat(64),
        terraformBackendEvidenceSha256: 'd'.repeat(64),
        ansibleVariablesSha256: 'e'.repeat(64),
        terraformStateLineage: 'lineage-1',
        terraformStateSerial: 7,
      },
      { kind: 'destroy', nodeId: 'workers-b' },
    ] as const;
    for (const request of requests) {
      const plan = planOperation(fleet, observation, request);
      expect(plan.schemaVersion).toBe(1);
      expect(plan.desiredRevision).toBe(fleet.revision);
      expect(plan.observationDigest).toBe(observation.digest);
      expect(plan.planSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(plan.targetIdentities.length).toBeGreaterThan(0);
      expect(plan.effects.length).toBeGreaterThan(0);
      expect(plan.storageImplication).not.toBe('unchanged');
      expect(plan.downtimeImplication.length).toBeGreaterThan(0);
      expect(plan.summary).toContain(request.kind);
      expect(planOperation(fleet, observation, request)).toEqual(plan);
    }
  });

  it('reports destructive storage and single-server downtime explicitly', () => {
    const destroyed = planOperation(fleet, observation, { kind: 'destroy', nodeId: 'workers-a' });
    expect(destroyed.storageImplication).toContain('system-disk-destruction');
    expect(destroyed.downtimeImplication).toContain('cluster-api-unavailable');
    expect(destroyed.summary).toContain(destroyed.storageImplication);
    expect(destroyed.summary).toContain(destroyed.downtimeImplication);

    const replacement = planOperation(fleet, observation, {
      kind: 'replace',
      nodeId: 'workers-b',
    });
    expect(replacement.storageImplication).toContain('transfer-or-explicit-loss-required');
  });

  it('refuses incomplete observation and implicit or invalid targets', () => {
    expect(() =>
      planOperation(
        fleet,
        { ...observation, complete: false },
        { kind: 'retire', nodeId: 'workers-b' },
      ),
    ).toThrow(/complete observation/i);
    expect(() => planOperation(fleet, observation, { kind: 'retire', nodeId: 'missing' })).toThrow(
      /unknown fleet node/i,
    );
    expect(() =>
      planOperation({ ...fleet, clusters: [] }, observation, {
        kind: 'retire',
        nodeId: 'workers-b',
      }),
    ).toThrow(/desired node names unknown cluster/i);
    expect(() =>
      planOperation(fleet, observation, {
        kind: 'provision',
        nodeId: 'workers-c',
        clusterId: 'workers',
        cloudAccount: 'puni-production',
        region: 'fsn1',
        machineType: 'cx33',
        image: 'ubuntu-24.04',
        network: 'puni-private',
        sshKeyIds: [],
        retainedStorage: false,
        k3sRole: 'agent',
        capabilities: ['execution'],
        budgetCapEur: 0,
        providerOwnershipId: 'provision-workers-c-20260917',
        terraformPlanSha256: 'f'.repeat(64),
        terraformBackendEvidenceSha256: 'd'.repeat(64),
        ansibleVariablesSha256: 'e'.repeat(64),
        terraformStateLineage: 'lineage-1',
        terraformStateSerial: 7,
      }),
    ).toThrow(/provision/i);
    expect(() =>
      planOperation(fleet, observation, {
        kind: 'provision',
        nodeId: 'workers-c',
        clusterId: 'workers',
        cloudAccount: 'puni-production',
        region: 'fsn1',
        machineType: 'cx33',
        image: 'ubuntu-24.04',
        network: 'puni-private',
        sshKeyIds: ['admin-primary'],
        retainedStorage: false,
        k3sRole: 'agent',
        capabilities: ['execution'],
        budgetCapEur: 20,
        providerOwnershipId: 'provision-workers-c-20260917',
        terraformPlanSha256: 'unreviewed',
        terraformBackendEvidenceSha256: 'unreviewed',
        ansibleVariablesSha256: 'unreviewed',
        terraformStateLineage: '',
        terraformStateSerial: -1,
      }),
    ).toThrow(/provision/i);
  });

  it('refuses invalid joins, upgrades, observation identity, and provisioning collisions', () => {
    expect(() =>
      planOperation(fleet, observation, {
        kind: 'enroll',
        nodeId: 'workers-b',
        clusterId: 'platform',
        ...enrollEvidence,
      }),
    ).toThrow(/cluster differs/i);
    expect(() =>
      planOperation(fleet, observation, {
        kind: 'upgrade',
        nodeId: 'workers-b',
        version: 'latest',
      }),
    ).toThrow(/invalid k3s version/i);
    expect(() =>
      planOperation(
        fleet,
        { ...observation, digest: 'unknown' },
        { kind: 'retire', nodeId: 'workers-b' },
      ),
    ).toThrow(/observation SHA-256/i);
    expect(() =>
      planOperation(fleet, observation, {
        kind: 'provision',
        nodeId: 'workers-c',
        clusterId: 'absent',
        cloudAccount: 'puni-production',
        region: 'fsn1',
        machineType: 'cx33',
        image: 'ubuntu-24.04',
        network: 'puni-private',
        sshKeyIds: ['admin-primary'],
        retainedStorage: false,
        k3sRole: 'agent',
        capabilities: ['execution'],
        budgetCapEur: 20,
        providerOwnershipId: 'provision-workers-c-20260917',
        terraformPlanSha256: 'f'.repeat(64),
        terraformBackendEvidenceSha256: 'd'.repeat(64),
        ansibleVariablesSha256: 'e'.repeat(64),
        terraformStateLineage: 'lineage-1',
        terraformStateSerial: 7,
      }),
    ).toThrow(/unknown cluster/i);
    expect(() =>
      planOperation(fleet, observation, {
        kind: 'provision',
        nodeId: 'workers-b',
        clusterId: 'workers',
        cloudAccount: 'puni-production',
        region: 'fsn1',
        machineType: 'cx33',
        image: 'ubuntu-24.04',
        network: 'puni-private',
        sshKeyIds: ['admin-primary'],
        retainedStorage: false,
        k3sRole: 'agent',
        capabilities: ['execution'],
        budgetCapEur: 20,
        providerOwnershipId: 'provision-workers-c-20260917',
        terraformPlanSha256: 'f'.repeat(64),
        terraformBackendEvidenceSha256: 'd'.repeat(64),
        ansibleVariablesSha256: 'e'.repeat(64),
        terraformStateLineage: 'lineage-1',
        terraformStateSerial: 7,
      }),
    ).toThrow(/reuses fleet node id/i);
  });
});
