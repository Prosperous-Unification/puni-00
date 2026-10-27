import { join } from 'node:path';

import { beforeAll, expect, test } from 'bun:test';

import { readToolchain, type Toolchain } from './contracts';
import { nameLabHelpers } from './k3d-creation';
import {
  linkRehearsalImage,
  readRehearsalObligations,
} from './observability-rehearsal-obligations';
import { lockedImageReferences } from './platform-manifests';

const root = join(import.meta.dir, '../../..');
let lock: Toolchain;
beforeAll(async () => {
  lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));
});
const origin = {
  files: [
    'infra/local/platform.k3d.yaml',
    'infra/versions/toolchain.json',
    'infra/versions/object-store.json',
    'infra/platform/storage/local/storage-class.yaml',
  ].map((path) => ({ path, sha256: 'a'.repeat(64) })),
  generator: {
    files: ['k3d-lab.ts', 'k3d-creation.ts', 'object-store-image.ts', 'backup-identity.ts'].map(
      (name) => ({ path: `tools/tool-fleet/src/${name}`, sha256: 'b'.repeat(64) }),
    ),
  },
};

test('helper obligations preserve declared pins and every unresolved lifecycle without runtime authority', () => {
  const obligations = readRehearsalObligations(lock, origin);
  expect(obligations.map((obligation) => obligation.role)).toEqual([
    'node-system',
    'registry',
    'serverlb',
    'tools',
    'object-store-import',
    'bootstrap-tls',
    'bootstrap-material',
    'cluster-marker',
    'trusted-workload-label',
    'local-path-provisioning',
    'cert-manager-acmeSolver',
    'cert-manager-startupApiCheck',
    'velero-restore-transfer',
    'solver-host',
  ]);
  expect(
    obligations.every(
      (obligation) => obligation.unresolved.length > 0 && obligation.origins.length > 0,
    ),
  ).toBe(true);
  expect(new Set(obligations.map((obligation) => obligation.realization))).toEqual(
    new Set(['unobserved']),
  );
  expect(obligations.find((obligation) => obligation.role === 'tools')).toMatchObject({
    image: 'ghcr.io/k3d-io/k3d-tools:5.9.0',
    digest: null,
    temporary: true,
  });
  expect(
    obligations.find((obligation) => obligation.role === 'tools')?.unresolved.join(' '),
  ).toMatch(/every serial/);
  expect(
    obligations.find((obligation) => obligation.role === 'local-path-provisioning')?.image,
  ).toBeNull();
  expect(
    obligations.find((obligation) => obligation.role === 'bootstrap-tls')?.unresolved.join(' '),
  ).toMatch(/openssl/);
  expect(
    obligations.find((obligation) => obligation.role === 'object-store-import')?.origins,
  ).toContainEqual({
    basis: 'selected-git',
    path: 'infra/versions/object-store.json',
    sha256: 'a'.repeat(64),
    coordinate: 'readObjectStoreLock input',
  });
});
test('helper obligation source coordinates cannot silently disappear', () => {
  const changed = structuredClone(origin);
  changed.files = changed.files.filter((file) => !file.path.endsWith('object-store.json'));
  expect(() => readRehearsalObligations(lock, changed)).toThrow(/origin/);
});
test('helper obligation known role missing from chart lock refuses', () => {
  const changed = structuredClone(lock);
  changed.charts.certManager.images = changed.charts.certManager.images.filter(
    (image) => image.role !== 'acmeSolver',
  );
  expect(() => readRehearsalObligations(changed, origin)).toThrow(/role/);
});
test('shared helper descriptors preserve independent platform and worker expected names', () => {
  for (const cluster of ['platform', 'workers']) {
    const expected = nameLabHelpers(`puni-fixture-${cluster}`);
    expect(expected).toEqual([
      {
        name: `k3d-puni-fixture-${cluster}-serverlb`,
        image: 'ghcr.io/k3d-io/k3d-proxy:5.9.0',
        role: 'serverlb',
        temporary: false,
      },
      {
        name: `k3d-puni-fixture-${cluster}-tools`,
        image: 'ghcr.io/k3d-io/k3d-tools:5.9.0',
        role: 'tools',
        temporary: true,
      },
    ]);
  }
});
test('inventory-only image adapter links exact repository digest while preserving strict platform pins', () => {
  const pin = lock.charts.traefik.images[0];
  const rendered = `docker.io/library/traefik@${pin.digest}`;
  expect(linkRehearsalImage(rendered, lock)).toContainEqual({
    path: 'infra/versions/toolchain.json',
    coordinate: '/charts/traefik/images/0',
    role: pin.role,
    name: pin.name,
    digest: pin.digest,
    match: 'repository-digest',
  });
  expect(lockedImageReferences(lock).has(rendered)).toBe(false);
  expect(linkRehearsalImage(`other.invalid/traefik@${pin.digest}`, lock)).toEqual([]);
  expect(linkRehearsalImage('docker.io/library/traefik@sha256:' + '0'.repeat(64), lock)).toEqual(
    [],
  );
  expect(linkRehearsalImage(`docker.io/library/traefik:wrong@${pin.digest}`, lock)).toEqual([]);
});
test('all four observed tag-omitted image occurrences have exact chart coordinates', () => {
  for (const chart of ['traefik', 'opentelemetryCollector', 'velero', 'velero'] as const) {
    const pin = lock.charts[chart].images[0];
    const rendered = `${pin.name.replace(/:[^/:]+$/, '')}@${pin.digest}`;
    expect(
      linkRehearsalImage(rendered, lock).some((link) =>
        link.coordinate.startsWith(`/charts/${chart}/images/`),
      ),
    ).toBe(true);
  }
});
