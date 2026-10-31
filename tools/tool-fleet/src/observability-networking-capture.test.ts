import { type } from 'arktype';
import { expect } from 'bun:test';

import type { inventoryObservabilityRehearsal } from './observability-rehearsal-inventory';
import { decodeRenderedResources } from './rendered-resources';

/** Assert the shared networking policy against one actual capture; reusable without rerendering. */
export function assertNetworkingCapture(
  expansions: Readonly<Record<string, string>>,
  receipt: Awaited<ReturnType<typeof inventoryObservabilityRehearsal>>,
): void {
  const Workload = type({
    metadata: { namespace: 'string' },
    spec: {
      template: {
        spec: {
          containers: type({
            name: 'string',
            resources: {
              requests: 'Record<string,string|number>',
              limits: 'Record<string,string|number>',
            },
            securityContext: { readOnlyRootFilesystem: 'boolean' },
            'env?': type({
              name: 'string',
              'value?': 'string',
              'valueFrom?': 'unknown',
            }).array(),
            'args?': 'string[]',
            'readinessProbe?': { httpGet: { path: 'string' } },
          }).array(),
          'volumes?': type({ name: 'string', 'emptyDir?': 'unknown' }).array(),
          'hostNetwork?': 'boolean',
          'dnsPolicy?': 'string',
          'nodeSelector?': 'unknown',
        },
      },
    },
  });
  const certManager = decodeRenderedResources(expansions['cert-manager/cert-manager']);
  for (const [kind, name, containerName, memoryRequest, memoryLimit] of [
    ['Deployment', 'cert-manager', 'cert-manager-controller', '128Mi', '512Mi'],
    ['Deployment', 'cert-manager-cainjector', 'cert-manager-cainjector', '128Mi', '512Mi'],
    ['Deployment', 'cert-manager-webhook', 'cert-manager-webhook', '128Mi', '512Mi'],
    ['Job', 'cert-manager-startupapicheck', 'cert-manager-startupapicheck', '64Mi', '256Mi'],
  ]) {
    const workload = Workload.assert(
      certManager.find(
        (entry) => entry.identity.kind === kind && entry.identity.metadata.name === name,
      )?.manifest,
    );
    expect(workload.metadata.namespace).toBe('cert-manager');
    const container = workload.spec.template.spec.containers.find(
      (container) => container.name === containerName,
    );
    if (container === undefined) throw new Error(`Missing rendered ${containerName}`);
    expect(container.resources).toEqual({
      requests: { cpu: '50m', memory: memoryRequest, 'ephemeral-storage': '16Mi' },
      limits: { cpu: '1', memory: memoryLimit, 'ephemeral-storage': '64Mi' },
    });
    expect(container.securityContext.readOnlyRootFilesystem).toBe(true);
    expect(
      workload.spec.template.spec.volumes?.some((volume) => volume.emptyDir !== undefined) ?? false,
    ).toBe(false);
    const inventoried = receipt.entries.find(
      (entry) => entry.kind === kind && entry.namespace === 'cert-manager' && entry.name === name,
    );
    expect(inventoried?.sourceRequests[0]?.quantities).toEqual(container.resources.requests);
    expect(inventoried?.sourceLimits[0]?.quantities).toEqual(container.resources.limits);
  }
  const traefik = decodeRenderedResources(expansions['traefik/traefik']);
  const daemon = Workload.assert(
    traefik.find(
      (entry) => entry.identity.kind === 'DaemonSet' && entry.identity.metadata.name === 'traefik',
    )?.manifest,
  );
  expect(daemon.metadata.namespace).toBe('traefik');
  const pod = daemon.spec.template.spec;
  const container = pod.containers.find((container) => container.name === 'traefik');
  if (container === undefined) throw new Error('Missing rendered Traefik');
  expect(container.resources).toEqual({
    requests: { cpu: '100m', memory: '128Mi', 'ephemeral-storage': '64Mi' },
    limits: { cpu: '2', memory: '512Mi', 'ephemeral-storage': '256Mi' },
  });
  expect(pod.volumes?.filter((volume) => ['data', 'tmp'].includes(volume.name))).toEqual([
    { name: 'data', emptyDir: { sizeLimit: '64Mi' } },
    { name: 'tmp', emptyDir: { sizeLimit: '64Mi' } },
  ]);
  expect(
    container.env?.filter((entry) => ['GOMAXPROCS', 'GOMEMLIMIT'].includes(entry.name)),
  ).toEqual([
    {
      name: 'GOMAXPROCS',
      valueFrom: { resourceFieldRef: { resource: 'limits.cpu', divisor: '1' } },
    },
    { name: 'GOMEMLIMIT', value: '460MiB' },
  ]);
  expect(pod.hostNetwork).toBe(true);
  expect(pod.dnsPolicy).toBe('ClusterFirstWithHostNet');
  expect(pod.nodeSelector).toEqual({ 'puni.dev/capability-ingress': 'true' });
  expect(container.securityContext.readOnlyRootFilesystem).toBe(true);
  expect(container.args).toContain('--entryPoints.web.address=:80/tcp');
  expect(container.args).toContain('--entryPoints.websecure.address=:443/tcp');
  expect(container.args).toContain('--entryPoints.web.http.redirections.entryPoint.to=:443');
  expect(container.args).toContain('--entryPoints.web.http.redirections.entryPoint.scheme=https');
  expect(container.args).toContain('--entryPoints.web.http.redirections.entryPoint.permanent=true');
  expect(container.args).toContain('--entryPoints.websecure.http.tls=true');
  expect(container.readinessProbe?.httpGet.path).toBe('/ping');
  expect(
    type({ spec: { type: 'string' } }).assert(
      traefik.find(
        (entry) => entry.identity.kind === 'Service' && entry.identity.metadata.name === 'traefik',
      )?.manifest,
    ).spec.type,
  ).toBe('ClusterIP');
  const inventoried = receipt.entries.find(
    (entry) =>
      entry.kind === 'DaemonSet' && entry.namespace === 'traefik' && entry.name === 'traefik',
  );
  expect(inventoried?.sourceRequests[0]?.quantities).toEqual(container.resources.requests);
  expect(inventoried?.sourceLimits[0]?.quantities).toEqual(container.resources.limits);
}
