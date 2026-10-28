import { rejects } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { readToolchain } from './contracts';
import {
  buildRehearsalBootstrap,
  collectRehearsalBootstrap,
  createRehearsalCollector,
  readRehearsalBootstrap,
} from './observability-rehearsal-sources';

const root = join(import.meta.dir, '../../..');
const hash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const policy = 'infra/platform/policy';
const retained = 'infra/rehearsal/bootstrap/policy';
const flux = 'infra/platform/flux/install.yaml';
const overlay = 'infra/platform/flux/kustomization.yaml';
const topology = 'infra/local/platform.k3d.yaml';
const objectStore = 'infra/versions/object-store.json';
const namespace = 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: source-only\n';

async function fixture() {
  const directory = await scratchAsync('bootstrap-sources-');
  const exported = join(directory, 'export');
  const packet = join(directory, 'packet');
  const lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const inputs = new Map<string, Buffer>([
    [flux, await readFile(join(root, flux))],
    [overlay, await readFile(join(root, overlay))],
    [topology, await readFile(join(root, topology))],
    [objectStore, await readFile(join(root, objectStore))],
    [
      `${policy}/kustomization.yaml`,
      Buffer.from(
        'apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources: [namespaces.yaml]\n',
      ),
    ],
    [`${policy}/namespaces.yaml`, Buffer.from(namespace)],
  ]);
  for (const [path, bytes] of inputs) {
    await mkdir(join(exported, path, '..'), { recursive: true });
    await writeFile(join(exported, path), bytes);
  }
  const files = new Map<string, Buffer>([
    [`${policy}/namespaces.yaml`, Buffer.from(namespace.replace('source-only', 'generated-only'))],
  ]);
  const collector = createRehearsalCollector(exported, files);
  await collectRehearsalBootstrap(collector);
  for (const [path, bytes] of files) {
    await mkdir(join(packet, path, '..'), { recursive: true });
    await writeFile(join(packet, path), bytes);
  }

  return { exported, packet, files, sources: [...collector.sources.values()], lock };
}

test('bootstrap collector retains original policy independently from generated stage bytes', async () => {
  const selected = await fixture();
  expect(selected.files.get(`${policy}/namespaces.yaml`)?.toString()).toContain('generated-only');
  expect(selected.files.get(`${retained}/namespaces.yaml`)?.toString()).toBe(namespace);
  expect(selected.sources).toContainEqual({
    sourcePath: `${policy}/namespaces.yaml`,
    artifactPath: `${retained}/namespaces.yaml`,
    sha256: hash(namespace),
  });
  const bootstrap = await readRehearsalBootstrap(selected.packet, selected.sources, selected.lock);
  expect(bootstrap.flux).toBe(await readFile(join(root, flux), 'utf8'));
  expect(bootstrap.sources).toHaveLength(6);
  expect(bootstrap.topology.image).toBe('${K3S_IMAGE}');
  expect(bootstrap.objectStore.image).toBe(selected.lock.runtimeImages.objectStore.name);
});

test.each([flux, topology, `${retained}/namespaces.yaml`, objectStore])(
  'bootstrap required input missing %s refuses',
  async (path) => {
    const selected = await fixture();
    const { unlink } = await import('node:fs/promises');
    await unlink(join(selected.packet, path));
    await rejects(readRehearsalBootstrap(selected.packet, selected.sources, selected.lock), {
      code: 'ENOENT',
    });
  },
);

test.each([flux, topology, `${retained}/namespaces.yaml`, objectStore])(
  'bootstrap required input unreadable %s refuses',
  async (path) => {
    const selected = await fixture();
    await chmod(join(selected.packet, path), 0);
    try {
      await rejects(readRehearsalBootstrap(selected.packet, selected.sources, selected.lock), {
        code: 'EACCES',
      });
    } finally {
      await chmod(join(selected.packet, path), 0o600);
    }
  },
);

test('bootstrap refuses source hash drift and independently wrong Flux lock', async () => {
  const selected = await fixture();
  await writeFile(join(selected.packet, flux), namespace + '\n');
  await rejects(readRehearsalBootstrap(selected.packet, selected.sources, selected.lock), /hash/);
  await writeFile(join(selected.packet, flux), await readFile(join(root, flux)));
  selected.lock.manifests.fluxInstall.sha256 = '0'.repeat(64);
  await rejects(readRehearsalBootstrap(selected.packet, selected.sources, selected.lock), /Flux/);
});

test.each([flux, topology, `${retained}/kustomization.yaml`, objectStore])(
  'bootstrap refuses omitted source coordinate %s',
  async (path) => {
    const selected = await fixture();
    await rejects(
      readRehearsalBootstrap(
        selected.packet,
        selected.sources.filter((source) => source.artifactPath !== path),
        selected.lock,
      ),
      /closure/,
    );
  },
);

test.each([topology, objectStore])(
  'bootstrap refuses malformed trusted %s after coherent hash update',
  async (path) => {
    const selected = await fixture();
    const bytes =
      path === topology
        ? (await readFile(join(selected.packet, topology), 'utf8')).replace(
            'servers: 1',
            'servers: unknown',
          )
        : '{}';
    await writeFile(join(selected.packet, path), bytes);
    const sources = selected.sources.map((source) =>
      source.artifactPath === path ? { ...source, sha256: hash(bytes) } : source,
    );
    await rejects(readRehearsalBootstrap(selected.packet, sources, selected.lock));
  },
);

test.each(['malformed-yaml', 'memory-option', 'wrong-coordinate'] as const)(
  'bootstrap rejects %s at its retained boundary',
  async (fault) => {
    const selected = await fixture();
    if (fault === 'wrong-coordinate') {
      selected.sources[0] = { ...selected.sources[0], sourcePath: 'infra/foreign.yaml' };
      await rejects(
        readRehearsalBootstrap(selected.packet, selected.sources, selected.lock),
        /coordinates/,
      );
      return;
    }
    const bytes =
      fault === 'malformed-yaml'
        ? 'kind: [invalid'
        : (await readFile(join(selected.packet, topology), 'utf8')).replace(
            'wait: true',
            'wait: true\n    serversMemory: 2g',
          );
    await writeFile(join(selected.packet, topology), bytes);
    const sources = selected.sources.map((source) =>
      source.artifactPath === topology ? { ...source, sha256: hash(bytes) } : source,
    );
    await rejects(readRehearsalBootstrap(selected.packet, sources, selected.lock));
  },
);

test('bootstrap malformed locked Flux bytes refuse before becoming a native frame', async () => {
  const selected = await fixture();
  const bytes = 'kind: [invalid';
  await writeFile(join(selected.packet, flux), bytes);
  selected.lock.manifests.fluxInstall.sha256 = hash(bytes);
  const sources = selected.sources.map((source) =>
    source.artifactPath === flux ? { ...source, sha256: hash(bytes) } : source,
  );
  await rejects(readRehearsalBootstrap(selected.packet, sources, selected.lock));
});
test('bootstrap topology refuses duplicate YAML keys despite an otherwise valid declaration', async () => {
  const selected = await fixture();
  const bytes = (await readFile(join(selected.packet, topology), 'utf8')) + '\nservers: 1\n';
  await writeFile(join(selected.packet, topology), bytes);
  const sources = selected.sources.map((source) =>
    source.artifactPath === topology ? { ...source, sha256: hash(bytes) } : source,
  );
  await rejects(
    readRehearsalBootstrap(selected.packet, sources, selected.lock),
    /malformed topology/,
  );
});
test('bootstrap original policy collector refuses escaped relocation references', async () => {
  const selected = await fixture();
  await writeFile(
    join(selected.exported, policy, 'kustomization.yaml'),
    'apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nresources: [../outside.yaml]\n',
  );
  await writeFile(join(selected.exported, 'infra/platform/outside.yaml'), namespace);
  const collector = createRehearsalCollector(selected.exported, new Map());
  await rejects(collectRehearsalBootstrap(collector), /escapes source/);
});

test('native topology companion retains bootstrap bytes and original coordinates independently of caller mutation', async () => {
  const selected = await fixture();
  const bootstrap = await readRehearsalBootstrap(selected.packet, selected.sources, selected.lock);
  const retainedBytes = selected.files.get(topology);
  if (retainedBytes === undefined) throw new Error('Fixture topology bytes missing');
  expect(bootstrap.topologyEvidence).toEqual({
    bytes: retainedBytes.toString(),
    source: {
      sourcePath: topology,
      artifactPath: topology,
      sha256: hash(retainedBytes),
    },
  });
  const coordinate = selected.sources.find((source) => source.artifactPath === topology);
  if (coordinate === undefined) throw new Error('Fixture topology source missing');
  Object.assign(coordinate, { sha256: '0'.repeat(64) });
  expect(bootstrap.topologyEvidence.source.sha256).not.toBe(coordinate.sha256);
  const { readDaemonTopology } = await import('./observability-native-daemon');
  const selection = { sourceRevision: 'a'.repeat(40), artifactSHA256: 'b'.repeat(64) };
  const contract = {
    stages: [],
    frames: [],
    bootstrap: [],
    bootstrapSources: [structuredClone(bootstrap.topologyEvidence.source)],
    provenance: selection,
  };
  expect(readDaemonTopology(contract, { ...bootstrap.topologyEvidence, selection })).toMatchObject({
    servers: 1,
    agents: 0,
    candidateNodes: 1,
  });
});

test('new forward bootstrap requires overlay source coordinate without raw-vendor fallback', async () => {
  const selected = await fixture();
  expect(selected.files.has(overlay)).toBe(true);
  await rejects(
    readRehearsalBootstrap(
      selected.packet,
      selected.sources.filter((source) => source.artifactPath !== overlay),
      selected.lock,
    ),
    /closure/,
  );
});
test.each([
  'missing',
  'unreadable',
  'hash drift',
  'coherent malformed',
  'substituted original',
] as const)('retained Flux overlay %s refuses before build', async (fault) => {
  const selected = await fixture();
  const path = join(selected.packet, overlay);
  let sources = selected.sources;
  if (fault === 'missing') {
    const { unlink } = await import('node:fs/promises');
    await unlink(path);
  }
  if (fault === 'unreadable') await chmod(path, 0);
  if (fault === 'hash drift' || fault === 'coherent malformed')
    await writeFile(path, 'kind: [invalid');
  if (fault === 'coherent malformed')
    sources = sources.map((source) =>
      source.artifactPath === overlay ? { ...source, sha256: hash('kind: [invalid') } : source,
    );
  if (fault === 'substituted original')
    sources = sources.map((source) =>
      source.artifactPath === overlay
        ? { ...source, sourcePath: 'infra/platform/foreign/kustomization.yaml' }
        : source,
    );
  try {
    await rejects(
      readRehearsalBootstrap(selected.packet, sources, selected.lock),
      fault === 'missing'
        ? { code: 'ENOENT' }
        : fault === 'unreadable'
          ? { code: 'EACCES' }
          : fault === 'hash drift'
            ? /hash/
            : fault === 'substituted original'
              ? /coordinates/
              : /malformed/,
    );
  } finally {
    if (fault === 'unreadable') await chmod(path, 0o600);
  }
});
test('current bootstrap emits one actual Flux build with both input identities', async () => {
  const selected = await fixture();
  const bootstrap = await readRehearsalBootstrap(selected.packet, selected.sources, selected.lock);
  const built = namespace.replace('source-only', 'actual-flux-build');
  const frames = buildRehearsalBootstrap(bootstrap, namespace, built);
  expect(frames.filter((frame) => frame.bootstrap === 'flux')).toHaveLength(1);
  expect(frames[0]).toEqual({
    bootstrap: 'flux',
    sourcePath: 'infra/platform/flux',
    path: 'infra/platform/flux',
    sources: selected.sources.filter((source) => [flux, overlay].includes(source.artifactPath)),
    bytes: built,
    sha256: hash(built),
  });
});
