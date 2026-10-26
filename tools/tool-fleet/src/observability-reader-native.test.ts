import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, test } from 'bun:test';

import { retainedReaderProjections } from './observability-reader-observation';

test('pinned kubectl retained-reader projections retain actual chart volume and configuration fields', async () => {
  const directory = await scratchAsync('reader-native-');
  const kubeconfig = join(directory, 'config');
  await writeFile(
    kubeconfig,
    JSON.stringify({ apiVersion: 'v1', kind: 'Config', contexts: [], clusters: [], users: [] }),
  );
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      if (request.method !== 'GET') return new Response('writes forbidden', { status: 403 });
      const path = new URL(request.url).pathname;
      if (path === '/api') return Response.json({ kind: 'APIVersions', versions: ['v1'] });
      if (path === '/apis')
        return Response.json({
          kind: 'APIGroupList',
          groups: [
            {
              name: 'apps',
              versions: [{ groupVersion: 'apps/v1', version: 'v1' }],
              preferredVersion: { groupVersion: 'apps/v1', version: 'v1' },
            },
          ],
        });
      if (path === '/api/v1')
        return Response.json({
          kind: 'APIResourceList',
          groupVersion: 'v1',
          resources: [
            {
              name: 'configmaps',
              singularName: 'configmap',
              namespaced: true,
              kind: 'ConfigMap',
              verbs: ['create', 'get'],
            },
          ],
        });
      if (path === '/apis/apps/v1')
        return Response.json({
          kind: 'APIResourceList',
          groupVersion: 'apps/v1',
          resources: [
            {
              name: 'daemonsets',
              singularName: 'daemonset',
              namespaced: true,
              kind: 'DaemonSet',
              verbs: ['create', 'get'],
            },
          ],
        });
      return new Response('unknown fixture path', { status: 404 });
    },
  });
  const metadata = {
    name: 'otel-collector-agent',
    namespace: 'observability',
    uid: 'fixture-uid',
    generation: 2,
    annotations: {
      'meta.helm.sh/release-name': 'otel-collector',
      'meta.helm.sh/release-namespace': 'observability',
    },
  };
  const manifests = {
    configuration: {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata,
      data: { relay: 'source-config' },
    },
    workload: {
      apiVersion: 'apps/v1',
      kind: 'DaemonSet',
      metadata,
      spec: {
        template: {
          metadata: { annotations: { 'checksum/config': 'reviewed-checksum' } },
          spec: {
            volumes: [
              {
                name: 'opentelemetry-collector-configmap',
                configMap: { name: 'otel-collector-agent' },
              },
            ],
          },
        },
      },
      status: {
        observedGeneration: 2,
        desiredNumberScheduled: 1,
        numberReady: 1,
        updatedNumberScheduled: 1,
      },
    },
  };
  try {
    for (const name of ['configuration', 'workload'] as const) {
      const path = join(directory, `${name}.json`);
      await writeFile(path, JSON.stringify(manifests[name]));
      const child = Bun.spawn(
        [
          '/tmp/puni-parity-tools/kubectl',
          `--server=http://127.0.0.1:${String(server.port)}`,
          '--kubeconfig',
          kubeconfig,
          '--cache-dir',
          join(directory, 'cache'),
          'create',
          '--dry-run=client',
          '--validate=false',
          '-f',
          path,
          '-o',
          `go-template=${retainedReaderProjections[name]}`,
        ],
        { stdout: 'pipe', stderr: 'pipe', timeout: 10000 },
      );
      const [exit, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      expect(exit).toBe(0);
      expect(stderr).toBe('');
      expect(JSON.parse(stdout)).toMatchObject({
        uid: 'fixture-uid',
        owner: 'otel-collector',
        configuration: name === 'workload' ? 'otel-collector-agent' : 'source-config',
      });
    }
  } finally {
    await server.stop(true);
  }
});
