export const kubernetesFixtureImages = [
  `registry.test/be@sha256:${'a'.repeat(64)}`,
  `registry.test/job@sha256:${'b'.repeat(64)}`,
];
export function kubernetesReaderFixture() {
  const documents = new Map<string, unknown>([
    ['/api/v1/namespaces/kube-system', { metadata: { uid: 'cluster' } }],
    ['/api/v1/namespaces/wbs', { metadata: { uid: 'namespace' } }],
    [
      '/apis',
      {
        groups: [
          {
            preferredVersion: { groupVersion: 'apps/v1' },
            versions: [{ groupVersion: 'apps/v1' }],
          },
          {
            preferredVersion: { groupVersion: 'batch/v1' },
            versions: [{ groupVersion: 'batch/v1' }],
          },
        ],
      },
    ],
    [
      '/api/v1',
      {
        groupVersion: 'v1',
        resources: [{ name: 'pods', kind: 'Pod', namespaced: true, verbs: ['list'] }],
      },
    ],
    [
      '/apis/apps/v1',
      {
        groupVersion: 'apps/v1',
        resources: [{ name: 'deployments', kind: 'Deployment', namespaced: true, verbs: ['list'] }],
      },
    ],
    [
      '/apis/batch/v1',
      {
        groupVersion: 'batch/v1',
        resources: [{ name: 'jobs', kind: 'Job', namespaced: true, verbs: ['list'] }],
      },
    ],
    ['/api/v1/namespaces/wbs/pods', { metadata: { resourceVersion: '1' }, items: [] }],
    [
      '/apis/apps/v1/namespaces/wbs/deployments',
      {
        metadata: { resourceVersion: '2' },
        items: [
          {
            apiVersion: 'apps/v1',
            kind: 'Deployment',
            metadata: { name: 'idle', namespace: 'wbs' },
            spec: {
              replicas: 0,
              template: {
                spec: { containers: [{ name: 'be', image: kubernetesFixtureImages[0] }] },
              },
            },
          },
        ],
      },
    ],
    [
      '/apis/batch/v1/namespaces/wbs/jobs',
      {
        metadata: { resourceVersion: '3' },
        items: [
          {
            apiVersion: 'batch/v1',
            kind: 'Job',
            metadata: { name: 'restore', namespace: 'wbs' },
            spec: {
              template: {
                spec: { containers: [{ name: 'restore', image: kubernetesFixtureImages[1] }] },
              },
            },
          },
        ],
      },
    ],
  ]);
  const read = (path: string) =>
    Promise.resolve().then(() => {
      if (!documents.has(path)) throw new Error(`Unknown source endpoint ${path}`);
      return documents.get(path);
    });
  return { documents, read };
}
