import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { type } from 'arktype';
import { expect, test } from 'bun:test';
import { type Document, parseAllDocuments } from 'yaml';

import { readToolchain } from './contracts';
import { assertPodResources } from './observability-pod-resources';
import { assertReceiverCandidate } from './observability-receiver';
import { validatePlatform } from './platform';
import { assertLockedWorkloadImages } from './platform-manifests';

const root = join(import.meta.dir, '../../..');
const path = 'observability/local/receiver.yaml';
const pod = ['spec', 'template', 'spec'];
const container = [...pod, 'containers', 0];

test('current platform refuses missing receiver ephemeral policy through its actual entrypoint', async () => {
  const directory = await scratchAsync('receiver-platform-');
  await cp(join(root, 'infra'), join(directory, 'infra'), { recursive: true });
  await mkdir(join(directory, 'tools/tool-fleet/src'), { recursive: true });
  await cp(
    join(root, 'tools/tool-fleet/src/backup-sqlite.ts'),
    join(directory, 'tools/tool-fleet/src/backup-sqlite.ts'),
  );
  const location = join(directory, 'infra/platform', path);
  const documents = parseAllDocuments(await readFile(location, 'utf8'));
  documents[0].deleteIn([...container, 'resources', 'limits', 'ephemeral-storage']);
  await writeFile(location, documents.map((document) => document.toString()).join('---\n'));
  expect(validatePlatform(directory)).rejects.toThrow(/receiver|common candidate/);
});

async function documents(): Promise<Document[]> {
  return parseAllDocuments(await readFile(join(root, 'infra/platform', path), 'utf8'));
}
function manifests(source: Awaited<ReturnType<typeof documents>>) {
  return source.map((document) => ({ path, document: document.toJSON() as unknown }));
}

test('receiver candidate accepts the current platform and current platform preserves its workload inventory', async () => {
  const source = await documents();
  expect(() => {
    assertReceiverCandidate(manifests(source));
  }).not.toThrow();
  expect(await validatePlatform(root)).toMatchObject({ workloadImages: 13 });
});

test.each([
  ['missing resource map', [...container, 'resources'], undefined],
  ['null resource map', [...container, 'resources'], null],
  ['missing request', [...container, 'resources', 'requests', 'ephemeral-storage'], undefined],
  ['malformed quantity', [...container, 'resources', 'limits', 'ephemeral-storage'], '1m'],
  ['contradictory quantity', [...container, 'resources', 'requests', 'ephemeral-storage'], '128Mi'],
  ['wrong valid limit', [...container, 'resources', 'limits', 'ephemeral-storage'], '128Mi'],
  ['cpu drift', [...container, 'resources', 'limits', 'cpu'], '200m'],
  ['memory drift', [...container, 'resources', 'limits', 'memory'], '64Mi'],
  ['role drift', [...container, 'name'], 'foreign'],
  ['image drift', [...container, 'image'], 'busybox:latest'],
  ['security drift', [...container, 'securityContext', 'readOnlyRootFilesystem'], false],
  ['pod security drift', [...pod, 'securityContext', 'runAsUser'], 0],
  ['missing policy', [...container, 'env'], undefined],
  ['wrong body policy', [...container, 'env', 0, 'value'], '65537'],
  ['wrong history policy', [...container, 'env', 1, 'value'], '8388609'],
  ['wrong deadline policy', [...container, 'env', 2, 'value'], '11'],
  ['missing scratch cap', [...pod, 'volumes', 0, 'emptyDir', 'sizeLimit'], undefined],
  ['null scratch cap', [...pod, 'volumes', 0, 'emptyDir', 'sizeLimit'], null],
  ['wrong scratch cap', [...pod, 'volumes', 0, 'emptyDir', 'sizeLimit'], '16Mi'],
  ['malformed scratch cap', [...pod, 'volumes', 0, 'emptyDir', 'sizeLimit'], '1m'],
  ['memory scratch', [...pod, 'volumes', 0, 'emptyDir', 'medium'], 'Memory'],
  ['missing mount', [...container, 'volumeMounts'], []],
  ['wrong mount', [...container, 'volumeMounts', 0, 'mountPath'], '/other'],
  ['extra role', [...pod, 'initContainers'], []],
  ['replica drift', ['spec', 'replicas'], 2],
  ['selector drift', ['spec', 'selector', 'matchLabels', 'app.kubernetes.io/name'], 'other'],
] as const)('receiver candidate refuses %s', async (_name, pointer, value) => {
  const source = await documents();
  if (value === undefined) source[0].deleteIn(pointer);
  else source[0].setIn(pointer, value);
  expect(() => {
    assertReceiverCandidate(manifests(source));
  }).toThrow();
});

test.each(['missing', 'duplicate', 'service', 'command', 'launcher'] as const)(
  'receiver candidate refuses %s source identity',
  async (fault) => {
    const source = await documents();
    if (fault === 'missing') source.shift();
    if (fault === 'duplicate') source.push(source[0]);
    if (fault === 'service') source[1].setIn(['spec', 'ports', 0, 'port'], 8081);
    if (fault === 'command') source[0].setIn([...container, 'command', 2], 'printf ok');
    if (fault === 'launcher') source[0].setIn([...container, 'command', 0], 'other');
    expect(() => {
      assertReceiverCandidate(manifests(source));
    }).toThrow(/receiver/);
  },
);

test('historical receiver resource and image readers preserve valid absent candidate bounds', async () => {
  const source = await documents();
  source[0].deleteIn([...container, 'env']);
  for (const bound of ['requests', 'limits'])
    source[0].deleteIn([...container, 'resources', bound, 'ephemeral-storage']);
  source[0].setIn([...pod, 'volumes', 0, 'emptyDir'], {});
  const quantities = type({
    spec: { template: { spec: { containers: type({ resources: 'unknown' }).array() } } },
  }).assert(source[0].toJSON()).spec.template.spec.containers[0].resources;
  expect(assertPodResources(quantities)).toEqual({
    requests: { cpu: '5m', memory: '8Mi' },
    limits: { cpu: '100m', memory: '32Mi' },
  });
  expect(
    assertLockedWorkloadImages(
      manifests(source),
      await readToolchain(join(root, 'infra/versions/toolchain.json')),
    ),
  ).toBe(1);
  expect(() => {
    assertReceiverCandidate(manifests(source));
  }).toThrow();
});
