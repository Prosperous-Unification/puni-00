import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { beforeAll, expect, test } from 'bun:test';
import { stringify } from 'yaml';

import { readToolchain, type Toolchain } from './contracts';
import {
  inspectRehearsalKubernetesSources,
  type RehearsalStageBuild,
} from './observability-parity-rehearsal';
import {
  captureRehearsalFrames,
  readRehearsalInventory,
} from './observability-rehearsal-inventory';
import type { RehearsalBootstrapBuild } from './observability-rehearsal-sources';

const root = join(import.meta.dir, '../../..');
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const encode = (...manifests: unknown[]) =>
  manifests.map((manifest) => stringify(manifest)).join('---\n');
const namespace = { apiVersion: 'v1', kind: 'Namespace', metadata: { name: 'observability' } };
const dev = { ...namespace, metadata: { name: 'observability-dev' } };
const flux = {
  apiVersion: 'apps/v1',
  kind: 'Deployment',
  metadata: { name: 'source-controller', namespace: 'flux-system' },
  spec: {
    template: {
      spec: {
        containers: [{ name: 'manager', image: 'example.invalid/flux@sha256:' + 'a'.repeat(64) }],
      },
    },
  },
};
let lock: Toolchain;
beforeAll(async () => {
  lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));
});
function fixture() {
  const bytes = encode(namespace, dev);
  const stages: RehearsalStageBuild[] = [
    {
      stage: 'policy',
      path: 'infra/platform/policy',
      declarationPath: 'stages/policy.yaml',
      sourceSHA256: hash('policy'),
      bytes,
      sha256: hash(bytes),
      releases: [],
    },
  ];
  const bootstrap: RehearsalBootstrapBuild[] = [
    {
      bootstrap: 'flux',
      sourcePath: 'infra/platform/flux/install.yaml',
      path: 'infra/platform/flux/install.yaml',
      sources: [
        {
          sourcePath: 'infra/platform/flux/install.yaml',
          artifactPath: 'infra/platform/flux/install.yaml',
          sha256: hash(encode(flux)),
        },
      ],
      bytes: encode(flux),
      sha256: hash(encode(flux)),
    },
    {
      bootstrap: 'policy',
      sourcePath: 'infra/platform/policy',
      path: 'infra/rehearsal/bootstrap/policy',
      sources: [
        {
          sourcePath: 'infra/platform/policy/namespaces.yaml',
          artifactPath: 'infra/rehearsal/bootstrap/policy/namespaces.yaml',
          sha256: hash(encode(namespace)),
        },
      ],
      bytes: encode(namespace),
      sha256: hash(encode(namespace)),
    },
  ];
  const contract = captureRehearsalFrames(stages, {}, bootstrap);
  return { stages, bootstrap, contract };
}
test('bootstrap native facts retain explicit origins and equal policy shares one physical object', () => {
  const { stages, bootstrap, contract } = fixture();
  const inventory = readRehearsalInventory(stages, {}, contract, lock, bootstrap);
  expect(inventory.entries).toHaveLength(3);
  expect(inventory.entries.find((entry) => entry.name === 'source-controller')).toMatchObject({
    owner: 'bootstrap/flux',
    images: [{ name: 'manager' }],
    source: {
      kind: 'bootstrap',
      bootstrap: 'flux',
      sourcePath: 'infra/platform/flux/install.yaml',
    },
  });
  expect(
    inventory.entries
      .find((entry) => entry.name === 'observability')
      ?.lifecycleOrigins.map((origin) => origin.owner),
  ).toEqual(['stage/policy', 'bootstrap/policy']);
  expect(
    inventory.entries.find((entry) => entry.name === 'observability-dev')?.lifecycleOrigins,
  ).toHaveLength(1);
  expect(inventory.frames.filter((frame) => frame.owner.startsWith('bootstrap/'))).toHaveLength(2);
  expect(inventory.creationAuthority).toBe(false);
  expect(inventory.runtimeRehearsal).toBe(false);
  expect(inventory.runnableClosure).toBe('incomplete');
});
test('bootstrap conflicts refuse independently decoded full definitions', () => {
  const { stages, bootstrap } = fixture();
  const bytes = encode({
    ...namespace,
    metadata: { ...namespace.metadata, labels: { changed: 'true' } },
  });
  bootstrap[1] = { ...bootstrap[1], bytes, sha256: hash(bytes) };
  expect(() =>
    readRehearsalInventory(
      stages,
      {},
      captureRehearsalFrames(stages, {}, bootstrap),
      lock,
      bootstrap,
    ),
  ).toThrow(/conflict/);
});
test('bootstrap equality never permits unrelated cross-stage duplicates', () => {
  const { stages, bootstrap } = fixture();
  stages.push({ ...stages[0], stage: 'unrelated' });
  expect(() =>
    readRehearsalInventory(
      stages,
      {},
      captureRehearsalFrames(stages, {}, bootstrap),
      lock,
      bootstrap,
    ),
  ).toThrow(/duplicate/);
});
test.each(['flux', 'policy'] as const)(
  'bootstrap immutable frame contract refuses omitted %s origin',
  (omitted) => {
    const { stages, bootstrap, contract } = fixture();
    expect(() =>
      readRehearsalInventory(
        stages,
        {},
        contract,
        lock,
        bootstrap.filter((frame) => frame.bootstrap !== omitted),
      ),
    ).toThrow(/closure/);
  },
);
test('bootstrap contract refuses omitted native workload after frame hash update', () => {
  const { stages, bootstrap, contract } = fixture();
  const bytes = encode({ ...namespace, metadata: { name: 'flux-system' } });
  bootstrap[0] = { ...bootstrap[0], bytes, sha256: hash(bytes) };
  contract.bootstrap[0] = { ...contract.bootstrap[0], sha256: hash(bytes) };
  const frame = contract.frames.find((candidate) => candidate.owner === 'bootstrap/flux');
  if (!frame) throw new Error('Fixture bootstrap frame missing');
  frame.sha256 = hash(bytes);
  expect(() => readRehearsalInventory(stages, {}, contract, lock, bootstrap)).toThrow(
    /resource closure/,
  );
});
test('bootstrap security refuses correctly hashed retained Secret material', async () => {
  const declarations = await readFile(
    join(root, 'infra/platform/secrets/platform-local/externally-provided.json'),
  );
  const bytes = Buffer.from(
    encode({
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: { name: 'not-allowed', namespace: 'flux-system' },
      stringData: { token: 'fixture' },
    }),
  );
  const files = new Map([
    ['infra/platform/secrets/platform-local/externally-provided.json', declarations],
    ['infra/platform/flux/install.yaml', bytes],
  ]);
  expect(hash(bytes.toString())).toHaveLength(64);
  expect(() => inspectRehearsalKubernetesSources(files, [])).toThrow(/Secret material/);
});

test('bootstrap captured source coordinate contract is independent of mutable input arrays', () => {
  const { stages, bootstrap, contract } = fixture();
  const changed = bootstrap[0].sources as {
    sourcePath: string;
    artifactPath: string;
    sha256: string;
  }[];
  changed[0].sha256 = '0'.repeat(64);
  expect(() => readRehearsalInventory(stages, {}, contract, lock, bootstrap)).toThrow(/closure/);
});
test('bootstrap policy overlap requires the recognized source and stage paths', () => {
  const { stages, bootstrap } = fixture();
  bootstrap[1] = { ...bootstrap[1], sourcePath: 'infra/foreign' };
  expect(() =>
    readRehearsalInventory(
      stages,
      {},
      captureRehearsalFrames(stages, {}, bootstrap),
      lock,
      bootstrap,
    ),
  ).toThrow(/duplicate/);
});

test('bootstrap duplicate application frame refuses at origin closure', () => {
  const { stages, bootstrap } = fixture();
  bootstrap.push(bootstrap[0]);
  expect(() =>
    readRehearsalInventory(
      stages,
      {},
      captureRehearsalFrames(stages, {}, bootstrap),
      lock,
      bootstrap,
    ),
  ).toThrow(/frame closure/);
});
