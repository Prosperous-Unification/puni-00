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
import * as sourceClaims from './observability-source-claims';

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
  addSource(packet, [standaloneClaim(), claimConsumer()]);
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
    expect(costs.standaloneKnownContributions.diskMiB).toBe(51200);
    expect(costs.standaloneClaims).toEqual(consume(packet).standaloneClaims);
    expect(costs.claimConsumers).toEqual(consume(packet).claimConsumers);
    expect(costs.native).toEqual(consume(packet).native);
    const claimSnapshot = JSON.stringify({
      claims: costs.standaloneClaims,
      consumers: costs.claimConsumers,
      entries: costs.standaloneEntries,
    });
    source.resources.find(({ entry }) => entry.category === 'claim')!.entry.source.frameSHA256 =
      'f'.repeat(64);
    source.resources.find(({ entry }) => entry.kind === 'Deployment')!.entry.claims[0].pointer =
      '/forged-reference';
    expect(
      JSON.stringify({
        claims: costs.standaloneClaims,
        consumers: costs.claimConsumers,
        entries: costs.standaloneEntries,
      }),
    ).toBe(claimSnapshot);
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

function standaloneClaim(
  name = 'registry',
  namespace: string | undefined | null = 'puni-registry',
  storage = '50Gi',
) {
  return {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: { name, ...(namespace == null ? {} : { namespace }) },
    spec: {
      accessModes: ['ReadWriteOnce'],
      storageClassName: 'puni-retain',
      resources: { requests: { storage } },
    },
  };
}
function addSource(packet: Awaited<ReturnType<typeof fixture>>, manifests: unknown[]) {
  packet.crds += '---\n' + manifests.map((manifest) => stringify(manifest)).join('---\n');
  reseal(packet);
}

test('standalone supported declarations add full 71680Mi to existing combined disk total', async () => {
  const packet = await fixture();
  const before = consume(packet);
  addSource(packet, [standaloneClaim(), standaloneClaim('object-store', 'puni-backup', '20Gi')]);
  const costs = consume(packet);
  expect(costs.knownContributions.diskMiB - before.knownContributions.diskMiB).toBe(71680);
  expect(costs.knownContributions.memoryMiB).toBe(before.knownContributions.memoryMiB);
  expect(costs.knownContributions.cpuMilli).toBe(before.knownContributions.cpuMilli);
});

function claimConsumer(
  kind = 'Deployment',
  namespace: string | undefined | null = 'puni-registry',
  name = 'registry-user',
  references = ['registry'],
) {
  const pod = {
    containers: [
      {
        name: 'app',
        image: 'busybox:1.37',
        resources: {
          requests: { cpu: '10m', memory: '16Mi', 'ephemeral-storage': '16Mi' },
          limits: { cpu: '10m', memory: '16Mi', 'ephemeral-storage': '16Mi' },
        },
      },
    ],
    volumes: references.map((claimName, index) => ({
      name: `claim-${String(index)}`,
      persistentVolumeClaim: { claimName },
    })),
  };
  const template = {
    metadata: { labels: { app: name } },
    spec: { ...pod, ...(kind === 'Job' || kind === 'CronJob' ? { restartPolicy: 'Never' } : {}) },
  };
  return {
    apiVersion:
      kind === 'Pod' ? 'v1' : kind === 'Job' || kind === 'CronJob' ? 'batch/v1' : 'apps/v1',
    kind,
    metadata: { name, ...(namespace == null ? {} : { namespace }) },
    spec:
      kind === 'Pod'
        ? pod
        : kind === 'CronJob'
          ? { schedule: '* * * * *', jobTemplate: { spec: { template } } }
          : {
              ...(kind === 'DaemonSet' ? { selector: { matchLabels: { app: name } } } : {}),
              ...(kind === 'Deployment' || kind === 'StatefulSet' ? { replicas: 0 } : {}),
              template,
            },
  };
}

test('standalone reservations retain exact declaration snapshots and explicit default provenance', async () => {
  const packet = await fixture();
  const before = consume(packet);
  addSource(packet, [
    standaloneClaim(),
    {
      ...standaloneClaim('explicit'),
      spec: { ...standaloneClaim().spec, volumeMode: 'Filesystem' },
    },
  ]);
  const costs = consume(packet);
  expect(costs.standaloneEntries).toHaveLength(2);
  expect(costs.standaloneKnownContributions).toEqual({
    memoryMiB: 0,
    cpuMilli: 0,
    diskMiB: 102400,
  });
  expect(costs.standaloneClaims[0]).toMatchObject({
    identity: 'PersistentVolumeClaim:puni-registry:registry',
    requestedStorage: '50Gi',
    requestedMiB: 51200,
    supported: true,
    volumeMode: { value: 'Filesystem', origin: 'absent-source-default' },
    storageClass: { value: 'puni-retain', origin: 'explicit' },
    runtimeObserved: false,
  });
  expect(costs.standaloneClaims[1].volumeMode).toEqual({ value: 'Filesystem', origin: 'explicit' });
  expect(costs.standaloneClaims[0].declaration.entry.source.frameSHA256).toBe(
    packet.stages[0].sha256,
  );
  expect(costs.standaloneEntries[0]).toMatchObject({
    identity: 'PersistentVolumeClaim:puni-registry:registry',
    kind: 'claim',
    diskMiB: 51200,
    memoryMiB: 0,
    cpuMilli: 0,
    coordinate: 'logical-standalone-claim',
  });
  expect(costs.standaloneEntries[0]).not.toHaveProperty('ordinal');
  const lock = decodeRetainedToolchain(
    Buffer.from(packet.options.runtimeLock),
    hash(packet.options.runtimeLock),
  );
  expect(costs.native).toEqual(
    readRehearsalNativeCosts(packet.stages, packet.expansions, packet.contract, lock),
  );
  expect(costs.generatedKnownContributions).toEqual(before.generatedKnownContributions);
  expect(costs.state).toBe('incomplete');
  expect(costs.creationAuthority).toBe(false);
  expect(costs.runtimeAuthority).toBe(false);
  expect(costs.blockers).not.toContainEqual({
    owner: 'PersistentVolumeClaim:puni-registry:registry',
    missingFact: 'claim-owner-and-retention-unaccounted',
  });
  expect(costs.native.blockers).toContainEqual({
    owner: 'PersistentVolumeClaim:puni-registry:registry',
    missingFact: 'claim-owner-and-retention-unaccounted',
  });
  for (const missingFact of [
    'fresh-immutable-attempt-same-declaration-claim-reuse',
    'no-prior-adopted-deleted-recreated-resized-unrelated-or-hidden-claims',
    'claim-history-and-retention',
    'claim-physical-identity-and-enforcement',
  ])
    expect(costs.blockers).toContainEqual({
      owner: 'PersistentVolumeClaim:puni-registry:registry',
      missingFact,
    });
  expect(costs.closureSHA256).not.toBe(before.closureSHA256);
});

test.each(['Pod', 'Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'])(
  'standalone consumers retain every %s reference independently of bounds and zero replicas',
  async (kind) => {
    const packet = await fixture();
    addSource(packet, [
      standaloneClaim(),
      claimConsumer(kind, 'puni-registry', 'first', ['registry', 'registry']),
      claimConsumer(kind, 'puni-registry', 'second'),
    ]);
    const costs = consume(packet);
    expect(costs.claimConsumers).toHaveLength(3);
    expect(costs.claimConsumers.map((consumer) => consumer.declarationIdentity)).toEqual([
      'PersistentVolumeClaim:puni-registry:registry',
      'PersistentVolumeClaim:puni-registry:registry',
      'PersistentVolumeClaim:puni-registry:registry',
    ]);
    expect(
      new Set(
        costs.claimConsumers.map((consumer) => `${consumer.owner}${consumer.reference.pointer}`),
      ).size,
    ).toBe(3);
    expect(costs.claimConsumers.map((consumer) => consumer.runtimeObserved)).toEqual([
      false,
      false,
      false,
    ]);
    expect(costs.standaloneEntries).toHaveLength(1);
    expect(costs.standaloneKnownContributions.diskMiB).toBe(51200);
    expect(costs.blockers.some((blocker) => blocker.owner === `${kind}:puni-registry:first`)).toBe(
      true,
    );
  },
);

test('standalone joins refuse missing foreign and unresolved namespace references without losing orphan reservations', async () => {
  const packet = await fixture();
  addSource(packet, [
    standaloneClaim(),
    standaloneClaim('unresolved', null),
    claimConsumer('Deployment', 'foreign'),
    claimConsumer('Deployment', null, 'unresolved'),
    claimConsumer('Deployment', 'puni-registry', 'missing', ['absent']),
  ]);
  const costs = consume(packet);
  expect(costs.standaloneEntries).toHaveLength(1);
  expect(costs.claimConsumers.map((consumer) => consumer.declarationIdentity)).toEqual([
    null,
    null,
    null,
  ]);
  expect(costs.blockers).toContainEqual({
    owner: 'PersistentVolumeClaim:_:unresolved',
    missingFact: 'source-namespace',
  });
  for (const [owner, missingFact] of [
    ['Deployment:foreign:registry-user', 'claim-declaration-missing:foreign/registry'],
    ['Deployment:_:unresolved', 'claim-consumer-source-namespace:registry'],
    ['Deployment:puni-registry:missing', 'claim-declaration-missing:puni-registry/absent'],
  ])
    expect(costs.blockers).toContainEqual({ owner, missingFact });
});

test.each([
  ['classAbsent', ['spec', 'storageClassName'], undefined, 'storage-class'],
  ['classEmpty', ['spec', 'storageClassName'], '', 'storage-class'],
  ['classNull', ['spec', 'storageClassName'], null, 'storage-class'],
  ['rwMany', ['spec', 'accessModes'], ['ReadWriteMany'], 'access-mode'],
  ['block', ['spec', 'volumeMode'], 'Block', 'volume-mode'],
  ['selector', ['spec', 'selector'], { matchLabels: { disk: 'one' } }, 'selector'],
  ['prebound', ['spec', 'volumeName'], 'pv-one', 'volume-name'],
  [
    'clone',
    ['spec', 'dataSource'],
    { kind: 'PersistentVolumeClaim', name: 'prior' },
    'data-source',
  ],
  [
    'reference',
    ['spec', 'dataSourceRef'],
    { apiGroup: 'example.test', kind: 'Snapshot', name: 'prior', namespace: 'foreign' },
    'data-source-ref',
  ],
  ['uid', ['metadata', 'uid'], 'prior-uid', 'runtime-identity-or-status'],
  [
    'status',
    ['status'],
    { phase: 'Bound', capacity: { storage: '50Gi' } },
    'runtime-identity-or-status',
  ],
  ['unknown', ['spec', 'futureBinding'], {}, 'unsupported-spec:futureBinding'],
] as const)(
  'standalone valid unsupported %s retains exact request without nominal charge',
  async (_label, path, value, missingFact) => {
    const packet = await fixture();
    const declaration = parseDocument(stringify(standaloneClaim()));
    if (value === undefined) declaration.deleteIn([...path]);
    else declaration.setIn([...path], value);
    addSource(packet, [declaration.toJSON()]);
    const costs = consume(packet);
    expect(costs.standaloneEntries).toEqual([]);
    expect(costs.standaloneClaims[0]).toMatchObject({
      requestedStorage: '50Gi',
      requestedMiB: 51200,
      supported: false,
    });
    expect(costs.blockers).toContainEqual({
      owner: 'PersistentVolumeClaim:puni-registry:registry',
      missingFact,
    });
    expect(costs.blockers).toContainEqual({
      owner: 'PersistentVolumeClaim:puni-registry:registry',
      missingFact: 'claim-owner-and-retention-unaccounted',
    });
  },
);

test.each([
  ['spec', ['spec'], []],
  ['quantity', ['spec', 'resources', 'requests', 'storage'], 'bad'],
  ['zero', ['spec', 'resources', 'requests', 'storage'], '0Gi'],
  ['lateMode', ['spec', 'volumeMode'], 'Bogus'],
  ['modes', ['spec', 'accessModes'], ['bogus']],
  ['emptyModes', ['spec', 'accessModes'], []],
  ['class', ['spec', 'storageClassName'], 42],
  ['selector', ['spec', 'selector'], []],
  [
    'selectorValues',
    ['spec', 'selector', 'matchExpressions'],
    [{ key: 'x', operator: 'In', values: [42] }],
  ],
  ['source', ['spec', 'dataSource'], { kind: 'Snapshot', name: 42 }],
  ['name', ['metadata', 'name'], ''],
  ['namespace', ['metadata', 'namespace'], null],
  ['uid', ['metadata', 'uid'], 42],
  ['status', ['status'], []],
  ['statusPhase', ['status', 'phase'], 'Nope'],
  ['limit', ['spec', 'resources', 'limits', 'storage'], 'bad'],
  ['resourceMap', ['spec', 'resources', 'requests'], []],
  ['classAttributes', ['spec', 'volumeAttributesClassName'], 42],
  ['volumeName', ['spec', 'volumeName'], 42],
  ['sourceKind', ['spec', 'dataSource'], { kind: 42, name: 'prior' }],
  [
    'selectorOperator',
    ['spec', 'selector'],
    { matchExpressions: [{ key: 'x', operator: 'bogus' }] },
  ],
  ['sourceGroup', ['spec', 'dataSource'], { apiGroup: 42, kind: 'Snapshot', name: 'prior' }],
  [
    'sourceNamespace',
    ['spec', 'dataSourceRef'],
    { kind: 'Snapshot', name: 'prior', namespace: 42 },
  ],
  ['labels', ['metadata', 'labels'], []],
  ['version', ['metadata', 'resourceVersion'], 42],
  ['generation', ['metadata', 'generation'], -1],
  ['created', ['metadata', 'creationTimestamp'], 42],
  ['deleted', ['metadata', 'deletionTimestamp'], 42],
  ['grace', ['metadata', 'deletionGracePeriodSeconds'], -1],
  ['finalizers', ['metadata', 'finalizers'], [42]],
  ['owners', ['metadata', 'ownerReferences'], [{ uid: 42 }]],
  ['statusModes', ['status', 'accessModes'], ['bogus']],
  ['statusQuantity', ['status', 'capacity', 'storage'], 'bad'],
] as const)(
  'standalone malformed late %s throws after an unsupported consumer',
  async (_label, path, value) => {
    const packet = await fixture();
    const declaration = parseDocument(stringify(standaloneClaim()));
    declaration.setIn([...path], value);
    expect(() => {
      addSource(packet, [claimConsumer(), declaration.toJSON()]);
      consume(packet);
    }).toThrow();
  },
);

test('standalone duplicate declarations and ordinal identity collisions throw', async () => {
  const duplicate = await fixture();
  addSource(duplicate, [standaloneClaim(), standaloneClaim()]);
  expect(() => consume(duplicate)).toThrow('Rehearsal duplicate object owner');
  const packet = await fixture();
  const controller = claimConsumer('StatefulSet', 'puni-registry', 'database');
  const declaration = parseDocument(stringify(controller));
  declaration.setIn(['spec', 'replicas'], 1);
  declaration.setIn(
    ['spec', 'volumeClaimTemplates'],
    [{ metadata: { name: 'disk' }, spec: standaloneClaim().spec }],
  );
  addSource(packet, [declaration.toJSON(), standaloneClaim('disk-database-0')]);
  expect(() => consume(packet)).toThrow(/collision|duplicate/i);
});

test('standalone complete prepass rejects late malformed mode before an earlier native ordinal collision', async () => {
  const packet = await fixture();
  const controller = parseDocument(
    stringify(claimConsumer('StatefulSet', 'puni-registry', 'database')),
  );
  controller.setIn(['spec', 'replicas'], 1);
  controller.setIn(
    ['spec', 'volumeClaimTemplates'],
    [{ metadata: { name: 'disk' }, spec: standaloneClaim().spec }],
  );
  const malformed = parseDocument(stringify(standaloneClaim('late')));
  malformed.setIn(['spec', 'volumeMode'], 'Bogus');
  addSource(packet, [controller.toJSON(), standaloneClaim('disk-database-0'), malformed.toJSON()]);
  expect(() => consume(packet)).toThrow(/volumeMode/);
});

test('standalone same name in distinct namespaces remains two independent reservations', async () => {
  const packet = await fixture();
  addSource(packet, [
    standaloneClaim('registry', 'first', '1Gi'),
    standaloneClaim('registry', 'second', '2Gi'),
    claimConsumer('Deployment', 'second'),
  ]);
  const costs = consume(packet);
  expect(costs.standaloneKnownContributions.diskMiB).toBe(3072);
  expect(costs.standaloneEntries.map((charge) => charge.identity)).toEqual([
    'PersistentVolumeClaim:first:registry',
    'PersistentVolumeClaim:second:registry',
  ]);
  expect(costs.claimConsumers[0].declarationIdentity).toBe('PersistentVolumeClaim:second:registry');
});

test('standalone combined reconciliation preserves consumer retention and unrelated unsupported declarations exactly', async () => {
  const packet = await fixture();
  const consumer = parseDocument(stringify(claimConsumer()));
  consumer.setIn(['spec', 'replicas'], 1);
  const unsupported = parseDocument(stringify(standaloneClaim('blocked')));
  unsupported.setIn(['spec', 'storageClassName'], '');
  addSource(packet, [standaloneClaim(), unsupported.toJSON(), consumer.toJSON()]);
  const costs = consume(packet);
  const covered = new Set([
    ...costs.generatedTraits
      .filter((trait) => trait.perReplica !== null)
      .map((trait) => trait.identity),
    'PersistentVolumeClaim:puni-registry:registry',
  ]);
  expect(
    costs.blockers.filter(
      (blocker) =>
        !covered.has(blocker.owner) &&
        costs.native.blockers.some(
          (native) => native.owner === blocker.owner && native.missingFact === blocker.missingFact,
        ),
    ),
  ).toEqual(costs.native.blockers.filter((blocker) => !covered.has(blocker.owner)));
  expect(costs.blockers).toContainEqual({
    owner: 'Deployment:puni-registry:registry-user',
    missingFact: 'claim-owner-and-retention:puni-registry/registry',
  });
  expect(costs.blockers).toContainEqual({
    owner: 'PersistentVolumeClaim:puni-registry:blocked',
    missingFact: 'claim-owner-and-retention-unaccounted',
  });
});

test('standalone closure binds derived declaration consumer charge and condition snapshots independently', async () => {
  const packet = await fixture();
  addSource(packet, [standaloneClaim(), claimConsumer()]);
  const baseline = consume(packet);
  const derive = sourceClaims.deriveStandaloneClaims;
  for (const fault of ['declaration', 'consumer', 'charge', 'condition'] as const) {
    const dependency = spyOn(sourceClaims, 'deriveStandaloneClaims').mockImplementation(
      (source) => {
        const claims = derive(source);
        if (fault === 'declaration')
          claims.standaloneClaims[0].declaration.entry.pointer = '/different-declaration';
        if (fault === 'consumer')
          claims.claimConsumers[0].reference.pointer = '/different-reference';
        if (fault === 'charge') claims.standaloneEntries[0].source.pointer = '/different-charge';
        if (fault === 'condition') claims.standaloneClaims[0].conditions = [];
        return claims;
      },
    );
    try {
      const changed = consume(packet);
      expect(changed.native).toEqual(baseline.native);
      expect(changed.knownContributions).toEqual(baseline.knownContributions);
      expect(changed.closureSHA256, fault).not.toBe(baseline.closureSHA256);
    } finally {
      dependency.mockRestore();
    }
  }
});

test('standalone consumer collection excludes native claim templates while retaining source references', async () => {
  const packet = await fixture();
  const controller = parseDocument(stringify(claimConsumer('StatefulSet')));
  controller.setIn(
    ['spec', 'volumeClaimTemplates'],
    [{ metadata: { name: 'template-only' }, spec: standaloneClaim().spec }],
  );
  addSource(packet, [standaloneClaim(), controller.toJSON()]);
  const costs = consume(packet);
  expect(costs.claimConsumers).toHaveLength(1);
  expect(costs.claimConsumers[0].reference.name).toBe('registry');
});
