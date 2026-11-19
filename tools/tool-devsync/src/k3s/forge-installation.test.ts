import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, it } from 'bun:test';

import { bindEnvironment, SOLVER_NODE_PATH } from './dev-environment';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('committed Forge ' + label + ' is not an object');
  return value;
}
async function readCommittedOverlay(): Promise<Record<string, unknown>[]> {
  const overlay = join(import.meta.dir, '../../../../deploy/k8s/wbs/overlays/dev');
  const decoded: unknown = Bun.YAML.parse(await readFile(join(overlay, 'kustomization.yaml'), 'utf8'));
  const kustomization = readRecord(decoded, 'kustomization');
  const namespace = kustomization['namespace'], resources = kustomization['resources'];
  if (typeof namespace !== 'string' || !Array.isArray(resources))
    throw new Error('committed Forge namespace/resources are malformed');
  const objects: Record<string, unknown>[] = [];
  for (const value of resources) {
    const resource: unknown = value;
    if (typeof resource !== 'string') throw new Error('committed Forge resource path is not a string');
    const parsed: unknown = Bun.YAML.parse(await readFile(join(overlay, resource), 'utf8'));
    const object = readRecord(parsed, 'resource');
    objects.push({ ...object, metadata: { ...readRecord(object['metadata'], 'metadata'), namespace } });
  }
  return objects;
}

it('Forge binds an explicitly selected external PUNI installation without changing its existing tier resources', async () => {
  // Renderer-only opaque input; actual acquisition/profile verification has separate owning tests.
  const record = JSON.stringify({ schemaVersion: 1, installationDirectory: '/home/dev/puni-installations/reviewed', archive: { path: 'authenticated-puni.tgz', sha256: 'a'.repeat(64) }, entrypoint: 'node_modules/puni/dist/puni.mjs' }, null, 2) + '\n';
  const selection = {
    slug: 'artifact', labId: 'f9', image: 'puni-f9-registry:5000/dev-environment@sha256:' + 'b'.repeat(64),
    worktree: '/home/dev/worktrees/artifact', worktreeNodePath: '/srv/puni/worktrees/artifact',
    solverNodePath: SOLVER_NODE_PATH, host: 'artifact.localhost', origin: 'http://artifact.localhost:44425',
    recreateInputs: 'c'.repeat(64), ownerUid: 1000, ownerGid: 1000,
    // Proposed required operator selection; real bindEnvironment receives it, with no fake renderer.
    puni: {
      installationNodePath: '/srv/puni/puni-installations/reviewed-fixture',
      entrypoint: '/opt/puni-dev/node_modules/puni/dist/puni.mjs',
      selection: record, sha256: createHash('sha256').update(record).digest('hex'), directoryIdentity: '2049:133',
    },
  };
  const bound = bindEnvironment(await readCommittedOverlay(), selection);
  const pod = bound.find(object => object['kind'] === 'Pod');
  if (pod === undefined) throw new Error('bound committed overlay lacks its Pod');
  const spec = readRecord(pod['spec'], 'Pod spec');
  const containers = spec['containers'];
  if (!Array.isArray(containers) || containers.length !== 1)
    throw new Error('bound Forge Pod lacks its sole container');
  const container = readRecord(containers.at(0), 'container');
  expect(pod['metadata']).toMatchObject({ name: 'dev-artifact', namespace: 'puni-forge-artifact' });
  expect(spec['securityContext']).toMatchObject({ runAsUser: 1000, runAsGroup: 1000 });
  expect(container['image']).toBe(selection.image);
  expect(container['resources']).toEqual({ requests: { cpu: '250m', memory: '768Mi' }, limits: { memory: '2Gi' } });
  expect(spec['volumes']).toContainEqual({ name: 'worktree', hostPath: { path: selection.worktreeNodePath, type: 'Directory' } });
  expect(spec['volumes']).toContainEqual({ name: 'solver-runtime', hostPath: { path: SOLVER_NODE_PATH, type: 'Directory' } });
  expect(spec['volumes']).toContainEqual({ name: 'data', persistentVolumeClaim: { claimName: 'dev-artifact-data' } });
  // Intended first missing-delivery oracle after actual committed-overlay and old-resource premises.
  expect(spec['volumes']).toContainEqual({ name: 'puni-installation', hostPath: { path: selection.puni.installationNodePath, type: 'Directory' } });
  expect(container['volumeMounts']).toContainEqual({ name: 'puni-installation', mountPath: '/opt/puni-dev', readOnly: true });
  expect(container['env']).toContainEqual({ name: 'PUNI_EXECUTABLE', value: selection.puni.entrypoint });
  expect(container['env']).toContainEqual({ name: 'PUNI_SELECTION', value: record });
  expect(container['env']).toContainEqual({ name: 'PUNI_SELECTION_SHA256', value: selection.puni.sha256 });
  expect(container['command']).toEqual([
    '/usr/bin/env', '-u', 'BUN_OPTIONS', '-u', 'BUN_INSPECT_PRELOAD', '-u', 'NODE_OPTIONS', '-u', 'BUN_BE_BUN',
    'bun', '--no-env-file', '--config=/dev/null', selection.puni.entrypoint,
    'dash', 'dev-env', 'supervise', '--repository', '/src', '--termination-log', '/dev/termination-log',
  ]);
});


it('Forge refuses partial or writable installation mounts before binding the committed Pod', async () => {
  const record = JSON.stringify({ schemaVersion: 1, installationDirectory: '/home/dev/puni-installations/reviewed', archive: { path: 'authenticated-puni.tgz', sha256: 'a'.repeat(64) }, entrypoint: 'consumer/node_modules/puni/dist/puni.mjs' }, null, 2) + '\n';
  const binding = {
    slug: 'artifact', labId: 'f9', image: 'puni-f9-registry:5000/dev-environment@sha256:' + 'b'.repeat(64),
    worktree: '/home/dev/worktrees/artifact', worktreeNodePath: '/srv/puni/worktrees/artifact',
    solverNodePath: SOLVER_NODE_PATH, host: 'artifact.localhost', origin: 'http://artifact.localhost:44425',
    recreateInputs: 'c'.repeat(64), ownerUid: 1000, ownerGid: 1000,
    puni: { installationNodePath: '/srv/puni/puni-installations/reviewed', entrypoint: '/opt/puni-dev/consumer/node_modules/puni/dist/puni.mjs', selection: record, sha256: createHash('sha256').update(record).digest('hex'), directoryIdentity: '2049:133' },
  };
  // A real committed-overlay positive precedes every changed mount shape.
  const original = await readCommittedOverlay();
  expect(() => bindEnvironment(original, binding)).not.toThrow();
  for (const alteration of [{ subPath: 'consumer' }, { subPathExpr: '$(PUNI_PATH)' }, { readOnly: false }]) {
    const changed = await readCommittedOverlay();
    const pod = changed.find((object) => object['kind'] === 'Pod');
    if (pod === undefined) throw new Error('committed overlay has no Pod');
    const containers = readRecord(pod['spec'], 'Pod spec')['containers'];
    if (!Array.isArray(containers) || containers.length !== 1) throw new Error('committed Pod has no sole container');
    const mounts = readRecord(containers.at(0), 'container')['volumeMounts'];
    if (!Array.isArray(mounts)) throw new Error('committed container has no volume mounts');
    const installation = mounts.find((mount) => isRecord(mount) && mount['name'] === 'puni-installation');
    if (!isRecord(installation)) throw new Error('committed container has no installation mount');
    Object.assign(installation, alteration);
    expect(() => bindEnvironment(changed, binding)).toThrow('complete and read-only');
  }
});
