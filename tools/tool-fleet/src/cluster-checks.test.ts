import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

const checks = join(import.meta.dir, '../../../infra/ansible/scripts/cluster-checks.py');

/** Run one controller-side check against a fake kubectl that answers by resource. */
async function runCheck(
  responses: Readonly<Record<string, unknown>>,
  ...arguments_: readonly string[]
): Promise<{ readonly exitCode: number | null; readonly stderr: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'fleet-cluster-checks-'));
  const cases = Object.entries(responses)
    .map(
      ([resource, document]) =>
        `if [[ "$*" == *"get ${resource}"* ]]; then printf '%s\\n' '${JSON.stringify(document)}'; exit 0; fi`,
    )
    .join('\n');
  await writeFile(join(directory, 'kubectl'), `#!/bin/bash\n${cases}\nexit 42\n`);
  await chmod(join(directory, 'kubectl'), 0o700);
  const invocation = Bun.spawnSync(['python3', checks, ...arguments_], {
    env: { ...process.env, PATH: `${directory}:${process.env['PATH'] ?? ''}` },
    stderr: 'pipe',
  });
  return { exitCode: invocation.exitCode, stderr: invocation.stderr.toString() };
}

function node(name: string, ready: boolean, capability: string): unknown {
  return {
    metadata: { name, labels: { [`puni.dev/capability-${capability}`]: 'true' } },
    status: { conditions: [{ type: 'Ready', status: ready ? 'True' : 'False' }] },
  };
}

function pod(extra: Record<string, unknown> = {}, volumes: unknown[] = []): unknown {
  return {
    metadata: {
      namespace: 'n',
      name: 'p',
      ownerReferences: [{ kind: 'ReplicaSet' }],
      labels: {},
      ...extra,
    },
    spec: { volumes },
    status: { phase: 'Running', conditions: [{ type: 'Ready', status: 'True' }] },
  };
}

describe('controller-side retirement checks', () => {
  it('refuses retirement that leaves a capability below its floor', async () => {
    const nodes = {
      items: [node('target', true, 'execution'), node('other', false, 'execution')],
    };
    const refused = await runCheck({ nodes }, 'floors', 'workers', 'target', '{"execution":1}');
    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain('execution would keep 0 Ready nodes');
    const healthy = {
      items: [node('target', true, 'execution'), node('other', true, 'execution')],
    };
    expect(
      (await runCheck({ nodes: healthy }, 'floors', 'workers', 'target', '{"execution":1}'))
        .exitCode,
    ).toBe(0);
  });

  it('refuses unmanaged, labelled local-state, and hostPath workloads on the node', async () => {
    for (const refused of [
      pod({ ownerReferences: [] }),
      pod({ labels: { 'puni.dev/singleton-sqlite': 'true' } }),
      pod({}, [{ name: 'solver', hostPath: { path: '/run/puni/solver' } }]),
    ]) {
      const outcome = await runCheck({ pods: { items: [refused] } }, 'workloads', 'w', 'target');
      expect(outcome.exitCode).toBe(1);
    }
    expect(
      (await runCheck({ pods: { items: [pod()] } }, 'workloads', 'w', 'target')).exitCode,
    ).toBe(0);
  });

  it('refuses a claim bound to a volume pinned to the retiring node', async () => {
    const pods = { items: [pod({}, [{ persistentVolumeClaim: { claimName: 'data' } }])] };
    const pinned = {
      items: [
        {
          metadata: { name: 'pv' },
          spec: {
            claimRef: { namespace: 'n', name: 'data' },
            nodeAffinity: {
              required: {
                nodeSelectorTerms: [
                  { matchExpressions: [{ key: 'kubernetes.io/hostname', values: ['target'] }] },
                ],
              },
            },
          },
        },
      ],
    };
    expect(
      (await runCheck({ pods, persistentvolumes: pinned }, 'local-volumes', 'w', 'target'))
        .exitCode,
    ).toBe(1);
    const portable = {
      items: [
        { metadata: { name: 'pv' }, spec: { claimRef: { namespace: 'n', name: 'data' }, csi: {} } },
      ],
    };
    expect(
      (await runCheck({ pods, persistentvolumes: portable }, 'local-volumes', 'w', 'target'))
        .exitCode,
    ).toBe(0);
  });

  it('fails closed when kubectl fails or returns malformed output', async () => {
    const failed = await runCheck({}, 'floors', 'workers', 'target', '{"execution":1}');
    expect(failed.exitCode).toBe(2);
    expect(failed.stderr).toContain('kubectl get nodes failed');
    const malformed = await runCheck({ nodes: { notItems: [] } }, 'floors', 'w', 't', '{}');
    expect(malformed.exitCode).toBe(2);
  });
});
