import { type } from 'arktype';
import { expect } from 'bun:test';

import { readCPUMilli, readMemoryMiB } from './observability-capacity';
import type { inventoryObservabilityRehearsal } from './observability-rehearsal-inventory';
import {
  assertInventoryWorkload,
  InventoryWorkloadSpec,
  NativeWorkloadSpec,
  normalizeWorkload,
} from './observability-workload';
import { decodeRenderedResources } from './rendered-resources';

/** Check actual bytes once; both environment captures use the existing shared workload normalizer. */
export function assertVeleroCapture(
  bytes: string,
  receipt?: Awaited<ReturnType<typeof inventoryObservabilityRehearsal>>,
) {
  const resources = decodeRenderedResources(bytes);
  const deployment = resources.find(
    (entry) => entry.identity.kind === 'Deployment' && entry.identity.metadata.name === 'velero',
  );
  if (deployment === undefined) throw new Error('Captured Velero Deployment absent');
  expect(deployment.identity.metadata.namespace).toBe('puni-backup');
  const pod = type({
    spec: {
      template: {
        spec: {
          containers: type({ name: 'string', resources: 'unknown' }).array(),
          initContainers: type({ name: 'string', resources: 'unknown' }).array(),
          volumes: 'unknown[]',
        },
      },
    },
  }).assert(deployment.manifest).spec.template.spec;
  const server = pod.containers.find((container) => container.name === 'velero');
  const plugin = pod.initContainers.find((container) => container.name === 'velero-plugin-for-aws');
  expect(server?.resources).toEqual({
    requests: { cpu: '100m', memory: '128Mi', 'ephemeral-storage': '128Mi' },
    limits: { cpu: '1', memory: '512Mi', 'ephemeral-storage': '1Gi' },
  });
  expect(plugin?.resources).toEqual({
    requests: { cpu: '50m', memory: '64Mi', 'ephemeral-storage': '16Mi' },
    limits: { cpu: '1', memory: '256Mi', 'ephemeral-storage': '128Mi' },
  });
  expect(pod.volumes).toEqual([
    { name: 'cloud-credentials', secret: { secretName: 'velero-credentials' } },
    { name: 'plugins', emptyDir: { sizeLimit: '256Mi' } },
    { name: 'scratch', emptyDir: { sizeLimit: '1Gi' } },
  ]);
  const refuse = (reason: string): never => {
    throw new Error(`Captured Velero ${reason}`);
  };
  const readers = {
    memory: (quantity: string) => readMemoryMiB(quantity, refuse),
    cpu: (quantity: string) => readCPUMilli(quantity, refuse),
    refuse,
    refuseMalformed: refuse,
  };
  assertInventoryWorkload(InventoryWorkloadSpec.assert(pod), readers);
  const normalized = normalizeWorkload(NativeWorkloadSpec.assert(pod), readers);
  expect(normalized.containers.map((container) => container.name)).toEqual(['velero']);
  expect(normalized.initContainers.map((container) => container.name)).toEqual([
    'velero-plugin-for-aws',
  ]);
  expect({
    memoryMiB: normalized.memoryMiB,
    cpuMilli: normalized.cpuMilli,
    ephemeralMiB: normalized.ephemeralMiB,
  }).toEqual({ memoryMiB: 512, cpuMilli: 100, ephemeralMiB: 1280 });
  if (receipt !== undefined) {
    const entry = receipt.entries.find(
      (entry) =>
        entry.kind === 'Deployment' && entry.namespace === 'puni-backup' && entry.name === 'velero',
    );
    expect(entry?.sourceRequests.map((entry) => entry.quantities)).toEqual([
      { cpu: '100m', memory: '128Mi', 'ephemeral-storage': '128Mi' },
      { cpu: '50m', memory: '64Mi', 'ephemeral-storage': '16Mi' },
    ]);
    expect(entry?.sourceLimits.map((entry) => entry.quantities)).toEqual([
      { cpu: '1', memory: '512Mi', 'ephemeral-storage': '1Gi' },
      { cpu: '1', memory: '256Mi', 'ephemeral-storage': '128Mi' },
    ]);
  }
  return normalized;
}
