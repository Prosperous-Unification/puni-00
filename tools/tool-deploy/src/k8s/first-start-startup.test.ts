import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { expect, it } from 'bun:test';
import { parseAllDocuments } from 'yaml';

import { assertFirstStartBackend } from './first-start-adapter';
import { assertFirstStartStartup } from './first-start-startup';

function trustedTemplate(tier: string): {
  metadata: { labels: Record<string, string> };
  spec: Record<string, unknown> & { containers: Record<string, unknown>[] };
} {
  const manifests = parseAllDocuments(
    readFileSync(resolve(import.meta.dir, `../../../../deploy/k8s/wbs/base/${tier}.yaml`), 'utf8'),
  ).map(
    (document) =>
      document.toJS() as { kind: string; spec: { template: ReturnType<typeof trustedTemplate> } },
  );
  const deployment = manifests.find((manifest) => manifest.kind === 'Deployment');
  if (deployment === undefined) throw new Error('fixture Deployment missing');
  return deployment.spec.template;
}
for (const probe of ['startupProbe', 'readinessProbe', 'livenessProbe']) {
  it(`real backend rejects executable ${probe}`, () => {
    const template = trustedTemplate('backend');
    template.spec.containers[0][probe] = {
      exec: {
        command: [
          'bun',
          '-e',
          "new (require('bun:sqlite').Database)('/data/wbs.sqlite').run('UPDATE step_blockage_activation SET state=?','ENABLED')",
        ],
      },
    };
    expect(() => {
      assertFirstStartBackend({ spec: { strategy: { type: 'Recreate' }, template } });
    }).toThrow();
  });
}
for (const tier of ['backend', 'gateway', 'frontend', 'mcp']) {
  for (const fault of [
    'init',
    'command',
    'args',
    'envFrom',
    'ephemeral',
    'volume',
    'hook',
    'mount',
    'env',
    'startupProbe',
    'readinessProbe',
    'livenessProbe',
  ]) {
    for (const pod of [false, true])
      it(`real ${tier} trusted startup refuses ${fault} in ${pod ? 'descendant Pod' : 'Deployment'}`, () => {
        const trusted = trustedTemplate(tier);
        const actual = structuredClone(trusted);
        const container = actual.spec.containers[0];
        if (fault === 'init')
          actual.spec['initContainers'] = [
            {
              name: 'rewrite',
              image: container['image'],
              command: ['sh', '-c', 'touch /tmp/injected'],
            },
          ];
        if (fault === 'command') container['command'] = ['sh', '-c', 'touch /tmp/injected'];
        if (fault === 'args') container['args'] = ['--unreviewed'];
        if (fault === 'envFrom') container['envFrom'] = [{ configMapRef: { name: 'unreviewed' } }];
        if (fault === 'ephemeral')
          actual.spec['ephemeralContainers'] = [
            { name: 'injected', image: container['image'], command: ['touch', '/tmp/injected'] },
          ];
        if (fault === 'volume')
          actual.spec['volumes'] = [{ name: 'injected', hostPath: { path: '/etc' } }];
        if (fault === 'hook')
          container['lifecycle'] = { postStart: { exec: { command: ['touch', '/tmp/injected'] } } };
        if (fault === 'mount')
          container['volumeMounts'] = [{ name: 'tmp', mountPath: '/usr/local/bin' }];
        if (fault === 'env')
          container['env'] = [{ name: 'NODE_OPTIONS', value: '--require=/tmp/injected' }];
        if (fault.endsWith('Probe'))
          container[fault] = { exec: { command: ['touch', '/tmp/injected'] } };
        if (pod) actual.metadata.labels['pod-template-hash'] = 'owned';
        expect(() => {
          assertFirstStartStartup(actual, trusted, pod);
        }).toThrow();
      });
  }
  it(`real ${tier} startup admits exact render and explicit API defaults in descendant Pod`, () => {
    const trusted = trustedTemplate(tier);
    const pod = structuredClone(trusted);
    pod.metadata.labels['pod-template-hash'] = 'owned';
    Object.assign(pod.spec, {
      nodeName: 'product',
      dnsPolicy: 'ClusterFirst',
      restartPolicy: 'Always',
      schedulerName: 'default-scheduler',
      serviceAccountName: pod.spec['serviceAccountName'] ?? 'default',
      serviceAccount: pod.spec['serviceAccountName'] ?? 'default',
      enableServiceLinks: true,
      priority: 0,
      preemptionPolicy: 'PreemptLowerPriority',
      tolerations: [
        {
          key: 'node.kubernetes.io/not-ready',
          operator: 'Exists',
          effect: 'NoExecute',
          tolerationSeconds: 300,
        },
      ],
    });
    Object.assign(pod.spec.containers[0], {
      terminationMessagePath: '/dev/termination-log',
      terminationMessagePolicy: 'File',
      imagePullPolicy: 'IfNotPresent',
    });
    expect(() => {
      assertFirstStartStartup(trusted, trusted);
      assertFirstStartStartup(pod, trusted, true);
    }).not.toThrow();
  });
}
