import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { runRegistryReader } from '@tools/registry-publication';

import { kubernetesReaderFixture } from './registry-reader.fixture';

const renderer = process.argv.at(2);
const sha256 = process.argv.at(3);
if (renderer === undefined || sha256 === undefined)
  throw new Error('Usage: registry-reader-rehearsal.ts <kubectl-path> <sha256>');
const root = await mkdtemp('/tmp/task6-kubernetes-reader-');
const { documents } = kubernetesReaderFixture();
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  fetch(request) {
    const path = new URL(request.url).pathname;
    return documents.has(path)
      ? Response.json(documents.get(path))
      : Response.json(
          { kind: 'Status', status: 'Failure', reason: 'NotFound', code: 404 },
          { status: 404 },
        );
  },
});
try {
  const credentials = JSON.stringify({
    kind: 'Config',
    apiVersion: 'v1',
    clusters: [{ name: 'fixture', cluster: { server: `http://127.0.0.1:${String(server.port)}` } }],
    contexts: [{ name: 'fixture', context: { cluster: 'fixture' } }],
    'current-context': 'fixture',
    users: [],
  });
  const kubeconfig = join(root, 'config');
  await writeFile(kubeconfig, credentials, { mode: 0o600 });
  const built = await Bun.build({
    entrypoints: [join(import.meta.dir, 'registry-reader.ts')],
    target: 'bun',
    outdir: root,
    naming: 'reader.js',
  });
  if (!built.success) throw new Error('Reader fixture artifact build failed');
  const artifact = join(root, 'reader.js');
  const configuration = {
    schemaVersion: 1,
    protocol: 'registry-consumer/2',
    registryId: 'proof',
    id: 'kubernetes',
    role: 'consumer',
    kind: 'kubernetes',
    source: join(root, 'reader.json'),
    artifact: {
      path: artifact,
      sha256: createHash('sha256')
        .update(await readFile(artifact))
        .digest('hex'),
    },
    input: {
      renderer: { path: renderer, sha256 },
      kubeconfig: {
        path: kubeconfig,
        sha256: createHash('sha256').update(credentials).digest('hex'),
      },
      context: 'fixture',
      clusterUid: 'cluster',
      namespaces: [{ name: 'wbs', uid: 'namespace' }],
      registryUrl: 'https://registry.test',
    },
  };
  const report = await runRegistryReader(configuration, 7);
  if (
    report.references.length !== 2 ||
    report.revision !== 7 ||
    !report.sourceRevision.startsWith('sha256:')
  )
    throw new Error('Incomplete actual Kubernetes reader report');
  console.log('native Kubernetes reader protocol PASS', report.references);
  documents.delete('/apis/batch/v1/namespaces/wbs/jobs');
  const refused = await runRegistryReader(configuration, 8).then(
    () => false,
    () => true,
  );
  if (!refused) throw new Error('Missing actual API source was omitted');
  console.log('native Kubernetes missing source refusal PASS');
} finally {
  await server.stop(true);
  await rm(root, { recursive: true });
}
