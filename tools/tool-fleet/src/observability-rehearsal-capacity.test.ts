import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { type } from 'arktype';
import { expect, spyOn, test } from 'bun:test';
import type { Document } from 'yaml';
import { parseAllDocuments, parseDocument, stringify } from 'yaml';

import * as contracts from './contracts';
import { decodeRetainedToolchain } from './contracts';
import retained from './fixtures/observability-rehearsal-capacity.json';
import { sumCapacity } from './observability-capacity';
import { readRehearsalNativeCosts } from './observability-native-ordinal';
import * as rehearsal from './observability-parity-rehearsal';
import {
  deriveObservabilityRehearsalCapacityCosts,
  readRehearsalCapacityCosts,
} from './observability-rehearsal-capacity';
import * as inventory from './observability-rehearsal-inventory';
import { captureRehearsalFrames } from './observability-rehearsal-inventory';
import * as obligations from './observability-rehearsal-obligations';
import * as sources from './observability-rehearsal-sources';
import * as rendering from './observability-render';

const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
async function fixture() {
  const runtimeLock = await readFile(
    join(import.meta.dir, '../../../infra/versions/toolchain.json'),
    'utf8',
  );
  const declarations = retained.releases.map((release) => release.manifest);
  const crds = [
    ['elasticsearch.k8s.elastic.co', 'Elasticsearch'],
    ['kibana.k8s.elastic.co', 'Kibana'],
    ['monitoring.coreos.com', 'Prometheus'],
    ['monitoring.coreos.com', 'Alertmanager'],
  ].map(([group, kind]) =>
    stringify({
      apiVersion: 'apiextensions.k8s.io/v1',
      kind: 'CustomResourceDefinition',
      metadata: { name: `${kind.toLowerCase()}s.${group}` },
      spec: { group, names: { kind }, scope: 'Namespaced', versions: [{ name: 'v1' }] },
    }),
  );
  const bytes = [...crds, ...declarations].join('---\n');
  const releases = retained.releases as Parameters<
    typeof captureRehearsalFrames
  >[0][number]['releases'];
  const stages = [
    {
      stage: 'selected',
      path: 'infra/selected',
      declarationPath: 'stages/selected.yaml',
      sourceSHA256: hash('source'),
      sha256: hash(bytes),
      bytes,
      releases: structuredClone(releases),
    },
  ];
  const expansions = Object.fromEntries(
    Object.entries(retained.manifests).map(([owner, manifests]) => [
      owner,
      manifests.map((manifest) => stringify(manifest)).join('---\n'),
    ]),
  );
  const files = [{ path: 'infra/versions/toolchain.json', sha256: hash(runtimeLock) }];
  // This unit packet is synthetic; retained.origin separately preserves the authentic projection receipt.
  const selection = {
    sourceRevision: 'a'.repeat(40),
    artifactSHA256: hash(`${JSON.stringify(files, null, 2)}\n`),
  };
  const contract = {
    ...captureRehearsalFrames(stages, expansions),
    bootstrapSources: [],
    provenance: selection,
    packet: {
      ...selection,
      files,
    },
  };
  return { stages, expansions, contract, options: { runtimeLock }, crds: crds.join('---\n') };
}

test('combined retained reader derives eight traits and sixteen full generated cohorts', async () => {
  const packet = await fixture();
  const costs = readRehearsalCapacityCosts(
    packet.stages,
    packet.expansions,
    packet.contract,
    packet.options,
  );
  expect(packet.contract.packet.artifactSHA256).not.toBe(retained.origin.artifactSHA256);
  expect(packet.contract.packet.sourceRevision).not.toBe(retained.origin.sourceRevision);
  expect(costs.generatedTraits).toHaveLength(8);
  expect(costs.generatedTraits.map((trait) => trait.perReplica)).toEqual([
    { memoryMiB: 2048, cpuMilli: 500, ephemeralMiB: 1024 },
    { memoryMiB: 1024, cpuMilli: 200, ephemeralMiB: 1024 },
    { memoryMiB: 1088, cpuMilli: 210, ephemeralMiB: 1088 },
    { memoryMiB: 192, cpuMilli: 20, ephemeralMiB: 320 },
    { memoryMiB: 2048, cpuMilli: 500, ephemeralMiB: 1024 },
    { memoryMiB: 1024, cpuMilli: 200, ephemeralMiB: 1024 },
    { memoryMiB: 1088, cpuMilli: 210, ephemeralMiB: 1088 },
    { memoryMiB: 192, cpuMilli: 20, ephemeralMiB: 320 },
  ]);
  expect(costs.generatedEntries.filter((charge) => charge.kind === 'pod')).toHaveLength(16);
  expect(costs.generatedEntries.filter((charge) => charge.kind === 'claim')).toHaveLength(6);
  expect(costs.generatedKnownContributions).toEqual({
    memoryMiB: 17408,
    cpuMilli: 3720,
    diskMiB: 56832,
  });
  expect(costs.state).toBe('incomplete');
  expect(costs.creationAuthority).toBe(false);
  expect(costs.runtimeAuthority).toBe(false);
});

function consume(packet: Awaited<ReturnType<typeof fixture>>) {
  return readRehearsalCapacityCosts(
    packet.stages,
    packet.expansions,
    packet.contract,
    packet.options,
  );
}
function resealPacket(packet: Awaited<ReturnType<typeof fixture>>) {
  const artifactSHA256 = hash(`${JSON.stringify(packet.contract.packet.files, null, 2)}\n`);
  packet.contract.packet.artifactSHA256 = artifactSHA256;
  packet.contract.provenance.artifactSHA256 = artifactSHA256;
}
function reseal(packet: Awaited<ReturnType<typeof fixture>>) {
  for (const stage of packet.stages) {
    stage.bytes =
      stage.releases.map((release) => release.manifest).join('---\n') + '---\n' + packet.crds;
    stage.sha256 = hash(stage.bytes);
  }
  Object.assign(packet.contract, captureRehearsalFrames(packet.stages, packet.expansions));
}

test('packet lock refuses missing duplicate wrong-path changed bytes and selection drift', async () => {
  for (const fault of [
    'missing',
    'duplicate',
    'path',
    'bytes',
    'revision',
    'artifact',
    'malformed',
  ]) {
    const packet = await fixture();
    if (fault === 'missing') packet.contract.packet.files = [];
    if (fault === 'duplicate')
      packet.contract.packet.files.push({ ...packet.contract.packet.files[0] });
    if (fault === 'path') packet.contract.packet.files[0].path = 'foreign/toolchain.json';
    if (fault === 'bytes') packet.options.runtimeLock += ' ';
    if (fault === 'revision') packet.contract.packet.sourceRevision = '1'.repeat(40);
    if (fault === 'artifact') packet.contract.packet.artifactSHA256 = '2'.repeat(64);
    if (fault === 'malformed') {
      packet.options.runtimeLock = '{}';
      packet.contract.packet.files[0].sha256 = hash('{}');
    }
    if (['missing', 'duplicate', 'path', 'malformed'].includes(fault)) resealPacket(packet);
    const decode = spyOn(contracts, 'decodeRetainedToolchain');
    try {
      expect(() => consume(packet), fault).toThrow(
        fault === 'malformed' ? /binaries/ : 'Generated rehearsal packet lock binding differs',
      );
      if (fault === 'malformed') expect(decode).toHaveBeenCalledTimes(1);
      else expect(decode).not.toHaveBeenCalled();
    } finally {
      decode.mockRestore();
    }
  }
});

test('source-derived selection refuses duplicate labels namespace drift missing roles foreign API and owner', async () => {
  for (const fault of [
    'label',
    'namespace',
    'missing',
    'extra',
    'api',
    'owner',
    'provider',
    'missingLabel',
  ]) {
    const packet = await fixture();
    const owner = 'observability-dev/kube-prometheus-stack';
    const release = packet.stages[0].releases.find((release) => release.owner === owner)!;
    if (['label', 'missingLabel'].includes(fault)) {
      const declaration = parseDocument(release.manifest);
      if (fault === 'label')
        declaration.setIn(
          ['spec', 'values', 'commonLabels', 'puni.dev/telemetry-instance'],
          'prod',
        );
      if (fault === 'missingLabel')
        declaration.deleteIn(['spec', 'values', 'commonLabels', 'puni.dev/telemetry-instance']);

      release.manifest = declaration.toString();
    } else {
      const manifests = parseAllDocuments(packet.expansions[owner]).map((document) =>
        type({
          apiVersion: 'string',
          kind: 'string',
          metadata: { name: 'string', namespace: 'string' },
        }).assert(document.toJSON()),
      );
      if (fault === 'missing') manifests.shift();
      if (fault === 'extra') {
        const extra = structuredClone(manifests[0]);
        extra.metadata.name = 'other';
        manifests.push(extra);
      }
      if (fault === 'api') {
        manifests[0].apiVersion = 'foreign/v1';
        packet.crds +=
          '---\n' +
          stringify({
            apiVersion: 'apiextensions.k8s.io/v1',
            kind: 'CustomResourceDefinition',
            metadata: { name: 'foreign' },
            spec: {
              group: 'foreign',
              names: { kind: manifests[0].kind },
              scope: 'Namespaced',
              versions: [{ name: 'v1' }],
            },
          });
      }
      if (fault === 'namespace') manifests[0].metadata.namespace = 'foreign';
      if (fault === 'owner') {
        packet.expansions['observability/kibana'] += '---\n' + stringify(manifests.shift());
      }
      if (fault === 'provider') {
        const declaration = parseDocument(
          packet.stages[0].releases.find(
            (release) => release.owner === 'observability/prometheus-controller',
          )!.manifest,
        );
        declaration.setIn(['spec', 'values', 'prometheus', 'enabled'], true);
        packet.stages[0].releases.find(
          (release) => release.owner === 'observability/prometheus-controller',
        )!.manifest = declaration.toString();
      }
      packet.expansions[owner] = manifests.map((manifest) => stringify(manifest)).join('---\n');
    }
    reseal(packet);
    expect(() => consume(packet), fault).toThrow(
      fault === 'label' || fault === 'provider'
        ? 'Generated rehearsal instance/provider selection differs'
        : fault === 'api'
          ? 'Generated rehearsal resource binding differs'
          : fault === 'extra'
            ? 'Generated rehearsal resource selection differs'
            : undefined,
    );
  }
});

function editCR(
  packet: Awaited<ReturnType<typeof fixture>>,
  kind: string,
  change: (manifest: Document) => void,
) {
  const owner = 'observability-dev/kube-prometheus-stack';
  packet.expansions[owner] = parseAllDocuments(packet.expansions[owner])
    .map((document) => {
      if (document.get('kind') === kind) change(document);
      return document.toString();
    })
    .join('---\n');
  reseal(packet);
}

test('unsupported traits remain null uncharged and retain late malformed known-state refusal', async () => {
  const packet = await fixture();
  editCR(packet, 'Prometheus', (document) => {
    document.setIn(['spec', 'thanos'], { image: 'example' });
  });
  const costs = consume(packet);
  const identity = 'Prometheus:observability-dev:kps-prometheus';
  expect(costs.generatedTraits.find((trait) => trait.identity === identity)?.perReplica).toBeNull();
  expect(costs.generatedEntries.filter((charge) => charge.owner === identity)).toEqual([]);
  expect(
    costs.generatedLifecycles.find((lifecycle) => lifecycle.owner === identity)?.maximumPodSlots,
  ).toBeNull();
  expect(costs.blockers).toContainEqual({
    owner: identity,
    missingFact: 'provider-or-unclassified-demand',
  });
  editCR(packet, 'Prometheus', (document) => {
    document.setIn(['spec', 'containers', 0, 'resources', 'requests', 'memory'], '99999Gi');
  });
  expect(() => consume(packet)).toThrow();
});

test('generated logical claims reuse only their own two full slots and preserve exact native facts', async () => {
  const packet = await fixture();
  const costs = consume(packet);
  const lock = decodeRetainedToolchain(
    Buffer.from(packet.options.runtimeLock),
    hash(packet.options.runtimeLock),
  );
  const native = readRehearsalNativeCosts(packet.stages, packet.expansions, packet.contract, lock);
  expect(costs.native).toEqual(native);
  expect(JSON.stringify(costs.native)).toBe(JSON.stringify(native));
  expect(costs.knownContributions).toEqual(
    sumCapacity([...native.entries, ...costs.generatedEntries]),
  );
  for (const trait of costs.generatedTraits) {
    const charges = costs.generatedEntries.filter((charge) => charge.owner === trait.identity);
    const pods = charges.filter((charge) => charge.kind === 'pod');
    const amounts = trait.perReplica;
    if (amounts === null) throw new Error('Supported fixture unexpectedly unbounded');
    expect(pods.map((charge) => [charge.memoryMiB, charge.cpuMilli, charge.diskMiB])).toEqual(
      [amounts, amounts].map((amounts) => [
        amounts.memoryMiB,
        amounts.cpuMilli,
        amounts.ephemeralMiB,
      ]),
    );
    expect(pods.map((charge) => charge.identity)).toEqual([
      `Generated:${trait.identity}/initial/0`,
      `Generated:${trait.identity}/replacement/0`,
    ]);
    const claims = charges.filter((charge) => charge.kind === 'claim');
    expect(claims).toHaveLength(trait.claims.length);
    for (const claim of claims) {
      expect(claim.identity).toStartWith(`GeneratedClaim:${trait.source.owner}/`);
      expect(claim).toHaveProperty('claim.actualPVC', 'unobserved');
      expect(claim).not.toHaveProperty('uid');
    }
    expect(trait.binding.resource.releaseOwner).toBe(trait.source.owner);
    expect(trait.binding.resource.source.frameSHA256).toBe(trait.source.sha256);
    expect(
      trait.binding.instance?.enablement.filter((fact) => fact.origin === 'pinned-chart-default'),
    ).toHaveLength(2);
    expect(trait.effectivePodObserved).toBe(false);
    expect(trait.concurrency.state).toBe('unassessed');
  }
  const covered = new Set(costs.generatedTraits.map((trait) => trait.identity));
  expect(costs.blockers.filter((blocker) => !covered.has(blocker.owner))).toEqual(
    native.blockers.filter((blocker) => !covered.has(blocker.owner)),
  );
  expect(
    costs.blockers.filter(
      (blocker) =>
        blocker.missingFact === 'provider-or-unclassified-demand' && covered.has(blocker.owner),
    ),
  ).toEqual([]);
  for (const fact of [
    'no-prior-or-adopted-children',
    'no-second-replacements-repeated-or-uncertain-creations',
    'unchanged-claim-reuse-with-no-additional-or-unrelated-claims',
    'whole-attempt-history-and-enforcement',
    'backing-devices-and-writers',
  ])
    expect(costs.blockers).toContainEqual({
      owner: costs.generatedTraits[0].identity,
      missingFact: fact,
    });
  const serialized = JSON.stringify(costs.generatedTraits);
  packet.contract.packet.files[0].sha256 = 'f'.repeat(64);
  packet.contract.frames[0].resources.push('changed');
  expect(JSON.stringify(costs.generatedTraits)).toBe(serialized);
});

test('enabled defaults retain pinned origins while explicit disabled null malformed and pin drift refuse', async () => {
  for (const fault of ['disabled', 'null', 'malformed', 'pin']) {
    const packet = await fixture();
    const release = packet.stages[0].releases.find(
      (release) => release.owner === 'observability-dev/kube-prometheus-stack',
    )!;
    const declaration = parseDocument(release.manifest);
    if (fault === 'disabled') declaration.setIn(['spec', 'values', 'prometheus', 'enabled'], false);
    if (fault === 'null') declaration.setIn(['spec', 'values', 'prometheus', 'enabled'], null);
    if (fault === 'malformed') declaration.setIn(['spec', 'values', 'prometheus'], []);
    if (fault === 'pin') {
      const lock = decodeRetainedToolchain(
        Buffer.from(packet.options.runtimeLock),
        hash(packet.options.runtimeLock),
      );
      lock.charts.kubePrometheusStack.sha256 = 'a'.repeat(64);
      packet.options.runtimeLock = JSON.stringify(lock);
      packet.contract.packet.files[0].sha256 = hash(packet.options.runtimeLock);
      resealPacket(packet);
    }
    release.manifest = declaration.toString();
    reseal(packet);
    expect(() => consume(packet), fault).toThrow(
      fault === 'pin'
        ? 'Generated rehearsal enablement default pin differs'
        : fault === 'disabled'
          ? 'Generated rehearsal instance/provider selection differs'
          : fault === 'null'
            ? /boolean/
            : undefined,
    );
  }
});

test('closure changes with exact source traits lifecycle charge and packet inputs', async () => {
  const packet = await fixture();
  const before = consume(packet);
  editCR(packet, 'Alertmanager', (document) => {
    document.setIn(['spec', 'resources', 'limits', 'memory'], '160Mi');
    document.setIn(['spec', 'containers', 0, 'resources', 'limits', 'memory'], '160Mi');
  });
  const changed = consume(packet);
  expect(changed.closureSHA256).not.toBe(before.closureSHA256);
  expect(
    changed.generatedKnownContributions.memoryMiB - before.generatedKnownContributions.memoryMiB,
  ).toBe(64);
  expect(
    before.generatedTraits.find(
      (trait) => trait.identity === 'Alertmanager:observability-dev:kps-alertmanager',
    )?.perReplica?.memoryMiB,
  ).toBe(192);
  const repeated = consume(packet);
  expect(repeated).toEqual(changed);
});

test('canonical companion forwards exactly five producer arguments once and consumes its validated views', async () => {
  const packet = await fixture();
  const lock = decodeRetainedToolchain(
    Buffer.from(packet.options.runtimeLock),
    hash(packet.options.runtimeLock),
  );
  const source = inventory.readRehearsalSource(
    packet.stages,
    packet.expansions,
    packet.contract,
    lock,
  );
  const prepared = {
    inventory: {
      ...source.inventory,
      bootstrapSources: [],
      provenance: packet.contract.provenance,
      inventorySHA256: 'f'.repeat(64),
      obligations: [],
    },
    native: source.native,
    lock,
    topologyEvidence: undefined,
    capacityEvidence: {
      source,
      runtimeLock: packet.options.runtimeLock,
      packet: packet.contract.packet,
    },
  } as unknown as Awaited<ReturnType<typeof inventory.prepareRehearsalInventory>>;
  const producer = spyOn(inventory, 'prepareRehearsalInventory').mockResolvedValue(prepared);
  const sourceReader = spyOn(inventory, 'readRehearsalSource');
  try {
    const request = { retained: 'request' };
    const costs = await deriveObservabilityRehearsalCapacityCosts(
      'root',
      'tools',
      request,
      'directory',
      'archive',
    );
    expect(producer).toHaveBeenCalledTimes(1);
    expect(producer.mock.calls[0]).toEqual(['root', 'tools', request, 'directory', 'archive']);
    expect(sourceReader).not.toHaveBeenCalled();
    expect(costs.generatedTraits).toHaveLength(8);
    expect(costs.native).toEqual(consume(packet).native);
    expect(costs.sourceInventorySHA256).toBe(prepared.inventory.inventorySHA256);
    expect(costs.provenance).toEqual(prepared.inventory.provenance);
    expect(costs.obligations).toEqual([]);
    const snapshot = JSON.stringify(costs.generatedTraits);
    const borrowed = source.resources.find(({ entry }) => entry.kind === 'Elasticsearch')!;
    borrowed.entry.pointer = '/forged-after-consumption';
    expect(JSON.stringify(costs.generatedTraits)).toBe(snapshot);
    const horizons = {
      basis: 'declared' as const,
      selection: { sourceRevision: '1'.repeat(40), artifactSHA256: '2'.repeat(64) },
      windows: [],
    };
    await deriveObservabilityRehearsalCapacityCosts(
      'root',
      'tools',
      request,
      'directory',
      'archive',
      horizons,
    ).then(
      () => {
        throw new Error('Changed horizon selection accepted');
      },
      (failure: unknown) => {
        expect(failure).toBeInstanceOf(Error);
      },
    );
  } finally {
    producer.mockRestore();
    sourceReader.mockRestore();
  }
});

test('missing packet shape decoded lock substitution and malformed selection refuse at the binding boundary', async () => {
  for (const fault of ['packet', 'selection', 'decoded']) {
    const packet = await fixture();
    if (fault === 'packet') delete (packet.contract as { packet?: unknown }).packet;
    if (fault === 'selection') {
      packet.contract.provenance.sourceRevision = 'invalid';
      packet.contract.packet.sourceRevision = 'invalid';
    }
    if (fault === 'decoded')
      (packet.options as { runtimeLock: unknown }).runtimeLock = decodeRetainedToolchain(
        Buffer.from(packet.options.runtimeLock),
        hash(packet.options.runtimeLock),
      );
    expect(() => consume(packet)).toThrow();
  }
});

test('coherent extra application release and absent provider declaration cannot vanish', async () => {
  const packet = await fixture();
  const extra = structuredClone(
    packet.stages[0].releases.find((release) => release.chart === 'kibana')!,
  );
  const declaration = parseDocument(extra.manifest);
  declaration.setIn(['metadata', 'namespace'], 'foreign');
  extra.owner = 'foreign/kibana';
  extra.manifest = declaration.toString();
  packet.stages[0].releases = [...packet.stages[0].releases, extra];
  packet.expansions[extra.owner] = stringify({
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: { namespace: 'foreign', name: 'fixture' },
  });
  reseal(packet);
  expect(() => consume(packet)).toThrow('Generated rehearsal extra application release');
  const missing = await fixture();
  missing.stages[0].releases = missing.stages[0].releases.filter(
    (release) => release.chart !== 'eckOperator',
  );
  delete missing.expansions['observability/eck-operator'];
  reseal(missing);
  expect(() => consume(missing)).toThrow('Generated rehearsal instance/provider selection differs');
});

test('full source frames pointers and provider scope retain independent closure', async () => {
  const packet = await fixture();
  packet.contract.frames[0].resources[0] = 'forged';
  expect(() => consume(packet)).toThrow('Rehearsal frame resource closure differs');
  const missing = await fixture();
  delete missing.expansions['observability-dev/kibana'];
  expect(() => consume(missing)).toThrow();
  const scoped = await fixture();
  scoped.crds = scoped.crds.replaceAll('scope: Namespaced', 'scope: Cluster');
  reseal(scoped);
  expect(() => consume(scoped)).toThrow('Rehearsal cluster namespace contradiction');
});

test('portable fixture retains its authentic source and projection receipt', () => {
  expect(retained.origin.sourceRevision).toBe('ff0b0208bc426ad8bc2a4896f15a90f34eb97b89');
  expect(retained.origin.artifactSHA256).toBe(
    'd96afb33eb6732c20b5f2ef6831c2dfbefa55d1c79ba7fc233824a9923442086',
  );
  expect(hash(JSON.stringify({ releases: retained.releases, manifests: retained.manifests }))).toBe(
    retained.origin.projectionSHA256,
  );
  expect(retained.origin.frames).toHaveLength(8);
});

test('prepared producer reads and decodes packet-bound lock once and keeps the public inventory exact', async () => {
  const packet = await fixture();
  const directory = await scratchAsync('generated-capacity-');
  await mkdir(join(directory, 'infra/versions'), { recursive: true });
  await writeFile(join(directory, 'infra/versions/toolchain.json'), packet.options.runtimeLock);
  const builds = {
    stages: packet.stages,
    receipt: { ...packet.contract.packet, generator: { files: [] } },
    bootstrap: { policyBytes: '', sources: [], topology: {}, topologyEvidence: {} },
  } as unknown as Awaited<ReturnType<typeof rehearsal.validateObservabilityRehearsalBuilds>>;
  const validated = spyOn(rehearsal, 'validateObservabilityRehearsalBuilds').mockResolvedValue(
    builds,
  );
  const rendered = spyOn(rendering, 'renderAuthenticatedObservabilityReleases').mockResolvedValue({
    expansions: packet.expansions,
    helm: {},
  } as Awaited<ReturnType<typeof rendering.renderAuthenticatedObservabilityReleases>>);
  const bootstrap = spyOn(sources, 'buildRehearsalBootstrap').mockReturnValue([]);
  const declared = spyOn(obligations, 'readRehearsalObligations').mockReturnValue([]);
  const decode = spyOn(contracts, 'decodeRetainedToolchain');
  try {
    const prepared = await inventory.prepareRehearsalInventory(
      'root',
      'tools',
      {},
      directory,
      'archive',
    );
    expect(decode).toHaveBeenCalledTimes(1);
    expect(decode.mock.calls[0][1]).toBe(hash(packet.options.runtimeLock));
    expect(prepared.capacityEvidence.runtimeLock).toBe(packet.options.runtimeLock);
    expect(prepared.capacityEvidence.packet).toEqual(packet.contract.packet);
    expect(prepared.capacityEvidence.source.inventory).toEqual(
      inventory.readRehearsalInventory(
        packet.stages,
        packet.expansions,
        packet.contract,
        prepared.lock,
      ),
    );
    expect(prepared.inventory).not.toHaveProperty('capacityEvidence');
    expect(Object.keys(prepared.inventory)).toEqual([
      'scope',
      'entries',
      'stages',
      'bootstrap',
      'frames',
      'unresolved',
      'runnableClosure',
      'creationAuthority',
      'runtimeRehearsal',
      'transportObserved',
      'obligations',
      'bootstrapSources',
      'topologyDeclaration',
      'runnerInputEquality',
      'provenance',
      'inventorySHA256',
    ]);
    builds.receipt.files.push({ ...builds.receipt.files[0] });
    await inventory.prepareRehearsalInventory('root', 'tools', {}, directory, 'archive').then(
      () => {
        throw new Error('Duplicate packet lock coordinate admitted');
      },
      (failure: unknown) => {
        expect(failure).toBeInstanceOf(Error);
        expect(String(failure)).toContain('Rehearsal runtime lock coordinate differs');
      },
    );
  } finally {
    validated.mockRestore();
    rendered.mockRestore();
    bootstrap.mockRestore();
    declared.mockRestore();
    decode.mockRestore();
  }
});

test.each(['nodeSet', 'volume'])(
  'combined reader retains unsupported extra %s with no nominal charges',
  async (fault) => {
    const packet = await fixture();
    const owner = 'observability-dev/elasticsearch';
    const declaration = parseDocument(packet.expansions[owner]);
    if (fault === 'nodeSet') {
      const node = type({ spec: { nodeSets: type('Record<string,unknown>').array() } }).assert(
        declaration.toJSON(),
      ).spec.nodeSets[0];
      declaration.addIn(['spec', 'nodeSets'], { ...node, name: 'extra' });
    } else
      declaration.addIn(['spec', 'nodeSets', 0, 'podTemplate', 'spec', 'volumes'], {
        name: 'external',
        csi: { driver: 'example.test' },
      });
    packet.expansions[owner] = declaration.toString();
    reseal(packet);
    const costs = consume(packet);
    const identity = 'Elasticsearch:observability-dev:elasticsearch';
    const trait = costs.generatedTraits.find((trait) => trait.identity === identity)!;
    expect(trait.perReplica).toBeNull();
    expect(costs.generatedEntries.filter((charge) => charge.owner === identity)).toEqual([]);
    expect(trait.missingFacts.some((fact) => fact.startsWith('unsupported-source:'))).toBe(true);
    expect(costs.blockers).toContainEqual({
      owner: identity,
      missingFact: 'provider-or-unclassified-demand',
    });
    if (fault === 'nodeSet')
      expect(
        type({ spec: { nodeSets: 'unknown[]' } }).assert(trait.binding.manifest).spec.nodeSets,
      ).toHaveLength(2);
  },
);

test('packet files commitment rejects coherently changed lock bytes and row against the prior artifact', async () => {
  const packet = await fixture();
  const priorArtifact = packet.contract.packet.artifactSHA256;
  const lock = decodeRetainedToolchain(
    Buffer.from(packet.options.runtimeLock),
    hash(packet.options.runtimeLock),
  );
  const checksum = lock.binaries.k3d.sha256;
  const changed = (checksum.startsWith('0') ? '1' : '0') + checksum.slice(1);
  expect(packet.options.runtimeLock.split(checksum)).toHaveLength(2);
  packet.options.runtimeLock = packet.options.runtimeLock.replace(checksum, changed);
  packet.contract.packet.files[0].sha256 = hash(packet.options.runtimeLock);
  expect(hash(`${JSON.stringify(packet.contract.packet.files, null, 2)}\n`)).not.toBe(
    priorArtifact,
  );
  expect(packet.contract.provenance.artifactSHA256).toBe(priorArtifact);
  expect(packet.contract.packet.artifactSHA256).toBe(priorArtifact);
  const decode = spyOn(contracts, 'decodeRetainedToolchain');
  try {
    expect(() => consume(packet)).toThrow('Generated rehearsal packet files commitment differs');
    expect(decode).not.toHaveBeenCalled();
  } finally {
    decode.mockRestore();
  }
});
