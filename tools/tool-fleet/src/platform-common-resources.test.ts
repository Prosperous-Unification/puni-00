import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { type } from 'arktype';
import { expect, test } from 'bun:test';
import { parseAllDocuments, parseDocument } from 'yaml';

import { assessObservabilityBudget } from './observability-budget';
import { validatePlatform } from './platform';
import { assertCommonNativeResources } from './platform-common-resources';
import { readPlatformManifests } from './platform-manifests';
import { platformReleases } from './platform-releases';

const root = join(import.meta.dir, '../../..');
const registry = 'registry/base/registry.yaml';
const monitoring = 'observability/prometheus/kube-prometheus-stack.yaml';
const buckets = 'backup/local/object-store.yaml';
async function copyPlatform() {
  const directory = await scratchAsync('common-resources-');
  await cp(join(root, 'infra'), join(directory, 'infra'), { recursive: true });
  await mkdir(join(directory, 'tools/tool-fleet/src'), { recursive: true });
  await cp(
    join(root, 'tools/tool-fleet/src/backup-sqlite.ts'),
    join(directory, 'tools/tool-fleet/src/backup-sqlite.ts'),
  );
  return directory;
}
async function alter(
  directory: string,
  path: string,
  name: string,
  edit: (document: ReturnType<typeof parseAllDocuments>[number]) => void,
) {
  const location = join(directory, 'infra/platform', path);
  const documents = parseAllDocuments(await readFile(location, 'utf8'));
  const document = documents.find(
    (document) =>
      document.getIn(['metadata', 'name']) === name &&
      ['Deployment', 'Job', 'CronJob', 'HelmRelease'].includes(String(document.get('kind'))),
  );
  if (document === undefined) throw new Error('Common resource fixture absent');
  edit(document);
  await writeFile(location, documents.map((document) => document.toString()).join('---\n'));
}
async function refreshBudget(directory: string) {
  await writeFile(
    join(directory, 'infra/platform/observability/base/coexistence.json'),
    JSON.stringify(await assessObservabilityBudget(directory)),
  );
}
const pod = ['spec', 'template', 'spec'];
const resources = [...pod, 'containers', 0, 'resources'];
test.each([
  [
    'resources absent',
    (document: ReturnType<typeof parseAllDocuments>[number]) => document.deleteIn(resources),
  ],
  [
    'resources null',
    (document: ReturnType<typeof parseAllDocuments>[number]) => {
      document.setIn(resources, null);
    },
  ],
  [
    'request map absent',
    (document: ReturnType<typeof parseAllDocuments>[number]) =>
      document.deleteIn([...resources, 'requests']),
  ],
  [
    'request map null',
    (document: ReturnType<typeof parseAllDocuments>[number]) => {
      document.setIn([...resources, 'requests'], null);
    },
  ],
  [
    'limit map array',
    (document: ReturnType<typeof parseAllDocuments>[number]) => {
      document.setIn([...resources, 'limits'], []);
    },
  ],
  [
    'ephemeral request absent',
    (document: ReturnType<typeof parseAllDocuments>[number]) =>
      document.deleteIn([...resources, 'requests', 'ephemeral-storage']),
  ],
  [
    'ephemeral limit absent',
    (document: ReturnType<typeof parseAllDocuments>[number]) =>
      document.deleteIn([...resources, 'limits', 'ephemeral-storage']),
  ],
  [
    'cpu malformed',
    (document: ReturnType<typeof parseAllDocuments>[number]) => {
      document.setIn([...resources, 'requests', 'cpu'], 'wat');
    },
  ],
  [
    'memory negative',
    (document: ReturnType<typeof parseAllDocuments>[number]) => {
      document.setIn([...resources, 'requests', 'memory'], '-1Mi');
    },
  ],
  [
    'ephemeral malformed',
    (document: ReturnType<typeof parseAllDocuments>[number]) => {
      document.setIn([...resources, 'requests', 'ephemeral-storage'], '1m');
    },
  ],
  [
    'request above limit',
    (document: ReturnType<typeof parseAllDocuments>[number]) => {
      document.setIn([...resources, 'requests', 'ephemeral-storage'], '1Gi');
    },
  ],
  ...(['cpu', 'memory', 'ephemeral-storage'] as const).map(
    (dimension) =>
      [
        `zero ${dimension} limit`,
        (document: ReturnType<typeof parseAllDocuments>[number]) => {
          document.setIn([...resources, 'requests', dimension], '0');
          document.setIn([...resources, 'limits', dimension], '0');
        },
      ] as const,
  ),
  [
    'role absent',
    (document: ReturnType<typeof parseAllDocuments>[number]) => {
      document.setIn([...pod, 'containers'], []);
    },
  ],
  [
    'role renamed',
    (document: ReturnType<typeof parseAllDocuments>[number]) => {
      document.setIn([...pod, 'containers', 0, 'name'], 'foreign');
    },
  ],
  [
    'unbounded sidecar',
    (document: ReturnType<typeof parseAllDocuments>[number]) => {
      document.addIn([...pod, 'containers'], {
        name: 'sidecar',
        image:
          'docker.io/library/registry:2.8.3@sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278',
      });
    },
  ],
  [
    'bounded unregistered ephemeral',
    (document: ReturnType<typeof parseAllDocuments>[number]) => {
      document.setIn(
        [...pod, 'ephemeralContainers'],
        [
          {
            name: 'debug',
            image:
              'docker.io/library/registry:2.8.3@sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278',
            resources: {
              requests: { cpu: '10m', memory: '16Mi', 'ephemeral-storage': '16Mi' },
              limits: { cpu: '100m', memory: '32Mi', 'ephemeral-storage': '64Mi' },
            },
          },
        ],
      );
    },
  ],
  [
    'bounded unregistered init',
    (document: ReturnType<typeof parseAllDocuments>[number]) => {
      document.setIn(
        [...pod, 'initContainers'],
        [
          {
            name: 'init',
            image:
              'docker.io/library/registry:2.8.3@sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278',
            resources: {
              requests: { cpu: '10m', memory: '16Mi', 'ephemeral-storage': '16Mi' },
              limits: { cpu: '100m', memory: '32Mi', 'ephemeral-storage': '64Mi' },
            },
          },
        ],
      );
    },
  ],
  [
    'unbounded init',
    (document: ReturnType<typeof parseAllDocuments>[number]) => {
      document.setIn(
        [...pod, 'initContainers'],
        [
          {
            name: 'init',
            image:
              'docker.io/library/registry:2.8.3@sha256:46faa9a1ae6813194b53921a370f2f4f8c5e1aae228a89bceafef5847a6a3278',
          },
        ],
      );
    },
  ],
] as const)('Task25c3f current native refuses %s', async (_fault, edit) => {
  const directory = await copyPlatform();
  await alter(directory, registry, 'registry', edit);
  expect(validatePlatform(directory)).rejects.toThrow(/common candidate|Generated capacity/);
});
test('Task25c3f explicit zero requests remain valid with positive limits', async () => {
  const directory = await copyPlatform();
  await alter(directory, registry, 'registry', (document) => {
    for (const dimension of ['cpu', 'memory', 'ephemeral-storage'])
      document.setIn([...resources, 'requests', dimension], '0');
  });
  await refreshBudget(directory);
  expect(await validatePlatform(directory)).toMatchObject({ workloadImages: 13 });
});
test.each(['kube-state-metrics', 'prometheus-node-exporter'])(
  'Task25c3f current Helm requires %s bounds',
  async (role) => {
    const directory = await copyPlatform();
    await alter(directory, monitoring, 'kube-prometheus-stack', (document) =>
      document.deleteIn(['spec', 'values', role, 'resources']),
    );
    await refreshBudget(directory);
    expect(validatePlatform(directory)).rejects.toThrow(/common candidate/);
  },
);
test.each([
  'absent',
  'null',
  'zero',
  'malformed',
  'negative',
  'array',
  'duplicate',
  'renamed',
  'mount absent',
] as const)('Task25c3f bucket scratch refuses %s', async (fault) => {
  const directory = await copyPlatform();
  await alter(directory, buckets, 'object-store-buckets', (document) => {
    const volumes = [...pod, 'volumes'];
    const scratch = [...volumes, 0, 'emptyDir', 'sizeLimit'];
    if (fault === 'mount absent') document.deleteIn([...pod, 'containers', 0, 'volumeMounts', 0]);
    if (fault === 'absent') document.deleteIn(scratch);
    if (fault === 'null') document.setIn(scratch, null);
    if (fault === 'zero') document.setIn(scratch, '0');
    if (fault === 'malformed') document.setIn(scratch, '1m');
    if (fault === 'negative') document.setIn(scratch, '-1Mi');
    if (fault === 'array') document.setIn([...volumes, 0, 'emptyDir'], []);
    if (fault === 'duplicate')
      document.addIn(volumes, { name: 'tmp', emptyDir: { sizeLimit: '16Mi' } });
    if (fault === 'renamed') document.setIn([...volumes, 0, 'name'], 'other');
  });
  const manifests = await readPlatformManifests(directory);
  expect(() => {
    assertCommonNativeResources(manifests);
  }).toThrow(/common candidate|Generated capacity/);
  expect(validatePlatform(directory)).rejects.toThrow(/common candidate|Generated capacity/);
});
test.each(['missing', 'unreadable', 'malformed', 'role omitted'] as const)(
  'Task25c3f required source refuses %s',
  async (fault) => {
    const directory = await copyPlatform();
    const location = join(directory, 'infra/platform', buckets);
    if (fault === 'missing') await rm(location);
    if (fault === 'unreadable') await chmod(location, 0);
    if (fault === 'malformed') await writeFile(location, 'kind: [bad');
    if (fault === 'role omitted')
      await alter(directory, buckets, 'object-store-buckets', (document) => {
        document.setIn(['metadata', 'name'], 'other-buckets');
      });
    expect(validatePlatform(directory)).rejects.toThrow(
      fault === 'unreadable'
        ? /EACCES|Cannot read/
        : fault === 'missing'
          ? /ENOENT|common candidate/
          : fault === 'malformed'
            ? /YAML|nothing consumes/
            : /common candidate/,
    );
  },
);
test.each(['absent', 'null', 'inner null'] as const)(
  'Task25c3f historical Helm retains %s maps',
  async (fault) => {
    const document = parseDocument(
      await readFile(join(root, 'infra/platform', monitoring), 'utf8'),
    );
    for (const role of ['kube-state-metrics', 'prometheus-node-exporter']) {
      const path = ['spec', 'values', role, 'resources'];
      if (fault === 'absent') document.deleteIn(path);
      if (fault === 'null') document.setIn(path, null);
      if (fault === 'inner null') document.setIn(path, { requests: null, limits: null });
    }
    const release = platformReleases.find((release) => release.name === 'kube-prometheus-stack');
    if (release === undefined) throw new Error('KPS fixture absent');
    expect(
      Object.keys(
        release.imageReferences(
          type({ spec: { values: 'unknown' } }).assert(document.toJSON()).spec.values,
        ),
      ),
    ).toContain('kubeStateMetrics');
  },
);
test.each(['array', 'foreign', 'bad quantity', 'contradiction'] as const)(
  'Task25c3f historical Helm refuses supplied %s',
  async (fault) => {
    const document = parseDocument(
      await readFile(join(root, 'infra/platform', monitoring), 'utf8'),
    );
    const path = ['spec', 'values', 'kube-state-metrics', 'resources'];
    if (fault === 'array') document.setIn(path, []);
    if (fault === 'foreign') document.setIn([...path, 'requests', 'foreign'], '1Mi');
    if (fault === 'bad quantity') document.setIn([...path, 'requests', 'memory'], '-1Mi');
    if (fault === 'contradiction') document.setIn([...path, 'requests', 'memory'], '1Gi');
    const release = platformReleases.find((release) => release.name === 'kube-prometheus-stack');
    if (release === undefined) throw new Error('KPS fixture absent');
    expect(() =>
      release.imageReferences(
        type({ spec: { values: 'unknown' } }).assert(document.toJSON()).spec.values,
      ),
    ).toThrow();
  },
);

test.each(['plaintext', 'CA'] as const)(
  'Task25c3f bounded bucket transport refuses %s mutation',
  async (fault) => {
    const directory = await copyPlatform();
    await alter(directory, buckets, 'object-store-buckets', (document) => {
      if (fault === 'plaintext') {
        const command: unknown = document.getIn([...pod, 'containers', 0, 'command', 2]);
        if (typeof command !== 'string') throw new Error('Bucket command absent');
        document.setIn(
          [...pod, 'containers', 0, 'command', 2],
          command.replace('mc alias set store https://', 'mc alias set store http://'),
        );
      } else document.setIn([...pod, 'volumes', 1, 'secret', 'defaultMode'], 0);
    });
    expect(validatePlatform(directory)).rejects.toThrow(/object-store TLS contract/);
  },
);

test('Task25c3f current native refuses duplicated registered source roles', async () => {
  const directory = await copyPlatform();
  const path = join(directory, 'infra/platform/observability/prometheus/blackbox-exporter.yaml');
  const source = await readFile(path, 'utf8');
  const workload = parseAllDocuments(source).find(
    (document) => document.get('kind') === 'Deployment',
  );
  if (workload === undefined) throw new Error('Blackbox fixture absent');
  await writeFile(path, source + '\n---\n' + workload.toString());
  await refreshBudget(directory);
  expect(validatePlatform(directory)).rejects.toThrow(/common candidate/);
});
