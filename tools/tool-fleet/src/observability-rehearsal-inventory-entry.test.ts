import { writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { type } from 'arktype';
import { expect, spyOn, test } from 'bun:test';

import { readToolchain } from './contracts';
import * as rehearsal from './observability-parity-rehearsal';
import { inventoryObservabilityRehearsal } from './observability-rehearsal-inventory';
import * as rendering from './observability-render';
import { provisionObservabilityTools } from './observability-tools.fixture';
import { decodeRenderedResources } from './rendered-resources';

const root = join(import.meta.dir, '../../..');

test('canonical eleven-stage public entry inventories actual pinned releases with committed source provenance', async () => {
  const tools = await provisionObservabilityTools();
  const directory = await scratchAsync('rehearsal-inventory-entry-');
  const revision = Bun.spawnSync(['git', 'rev-parse', 'HEAD'], { cwd: root });
  if (revision.exitCode !== 0) throw new Error('Fixture source revision unavailable');
  const request = {
    sourceRevision: revision.stdout.toString().trim(),
    network: {
      api: ['172.31.100.1/32'],
      observer: ['172.31.100.2/32'],
      grafana: ['172.31.100.3/32'],
      s3: ['172.31.100.4/32'],
      alertDelivery: ['172.31.100.5/32'],
      publicProbes: ['172.31.100.6/32'],
    },
  };
  const packet = join(directory, 'packet');
  const prepared = await rehearsal.prepareObservabilityRehearsal(root, tools, request, packet);
  const lock = await readToolchain(join(root, 'infra/versions/toolchain.json'));
  const archive = join(
    tools,
    'cache',
    `helm-${lock.binaries.helm.version}`,
    basename(new URL(lock.binaries.helm.url).pathname),
  );
  const capture = process.env['PUNI_REHEARSAL_FRAMES_EXPORT'];
  const render = rendering.renderObservabilityReleases;
  let expansions: Awaited<ReturnType<typeof render>> | undefined;
  const observer = spyOn(rendering, 'renderObservabilityReleases').mockImplementation(
    async (...arguments_) => {
      const frames = await render(...arguments_);
      expansions = frames;
      if (capture !== undefined) await writeFile(capture, JSON.stringify(frames));
      return frames;
    },
  );
  const validate = rehearsal.validateObservabilityRehearsalBuilds;
  const buildObserver =
    capture === undefined
      ? null
      : spyOn(rehearsal, 'validateObservabilityRehearsalBuilds').mockImplementation(
          async (...arguments_) => {
            const validated = await validate(...arguments_);
            await writeFile(`${capture}.stages.json`, JSON.stringify(validated));
            return validated;
          },
        );
  let receipt: Awaited<ReturnType<typeof inventoryObservabilityRehearsal>>;
  try {
    receipt = await inventoryObservabilityRehearsal(root, tools, request, packet, archive);
  } finally {
    observer.mockRestore();
    buildObserver?.mockRestore();
  }

  const output = process.env['PUNI_REHEARSAL_INVENTORY_EXPORT'];
  if (output !== undefined) await writeFile(output, JSON.stringify(receipt, null, 2));

  expect(receipt.frames.filter((frame) => frame.owner.startsWith('stage/'))).toHaveLength(11);
  const declarations = receipt.entries.filter((entry) => entry.kind === 'HelmRelease');
  expect(declarations.length).toBeGreaterThan(9);
  expect(receipt.frames.filter((frame) => frame.owner.startsWith('release/'))).toHaveLength(
    declarations.length,
  );
  expect(declarations.every((entry) => entry.expansionOwner !== null)).toBe(true);
  expect(receipt.entries.some((entry) => entry.hooks.length > 0)).toBe(true);
  expect(receipt.entries.some((entry) => entry.images.length > 0)).toBe(true);
  expect(receipt.entries.some((entry) => entry.claims.length > 0)).toBe(true);
  expect(receipt.creationAuthority).toBe(false);
  expect(receipt.runtimeRehearsal).toBe(false);
  expect(receipt.transportObserved).toBe('not-evaluated');
  expect(receipt.provenance.sourceRevision).toBe(request.sourceRevision);
  expect(receipt.provenance.generator.dirty).toBe(false);
  expect(receipt.provenance.helm.archiveSHA256).toBe(lock.binaries.helm.sha256);
  expect(receipt.provenance.helm.executableSHA256).not.toBe(lock.binaries.helm.sha256);
  expect(receipt.provenance.capabilities).toEqual({
    kubernetesVersion: '1.35.0',
    observed: false,
  });
  expect(
    basename(receipt.entries.find((entry) => entry.release !== null)?.release?.archivePath ?? ''),
  ).not.toBe('');
  expect(receipt.bootstrapSources.map((source) => source.sourcePath)).toContain(
    'infra/versions/object-store.json',
  );
  for (const path of [
    'infra/platform/flux/install.yaml',
    'infra/local/platform.k3d.yaml',
    'infra/versions/object-store.json',
    'infra/rehearsal/bootstrap/policy/namespaces.yaml',
  ])
    expect(prepared.files.some((file) => file.path === path)).toBe(true);
  expect(receipt.frames.filter((frame) => frame.owner.startsWith('bootstrap/'))).toHaveLength(2);
  expect(
    receipt.entries.filter(
      (entry) => entry.owner === 'bootstrap/flux' && entry.category === 'native-template',
    ),
  ).toHaveLength(4);
  expect(
    receipt.entries
      .find((entry) => entry.kind === 'Namespace' && entry.name === 'flux-system')
      ?.lifecycleOrigins.map((origin) => origin.owner),
  ).toEqual(['bootstrap/flux']);
  expect(
    receipt.entries
      .find((entry) => entry.kind === 'Namespace' && entry.name === 'observability')
      ?.lifecycleOrigins.map((origin) => origin.owner),
  ).toEqual(['stage/policy', 'bootstrap/policy']);
  expect(
    receipt.entries.find(
      (entry) => entry.kind === 'Namespace' && entry.name === 'observability-dev',
    )?.lifecycleOrigins,
  ).toHaveLength(1);
  expect(receipt.obligations.some((obligation) => obligation.role === 'tools')).toBe(true);
  expect(receipt.runnerInputEquality).toBe('unobserved');
  expect(
    receipt.entries
      .flatMap((entry) => entry.images)
      .filter((image) => image.locks.some((link) => link.match === 'repository-digest')),
  ).toHaveLength(4);

  if (expansions === undefined) throw new Error('Canonical release capture is missing');
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
              'valueFrom?': { resourceFieldRef: { resource: 'string', divisor: 'string' } },
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
      limits: { cpu: 1, memory: memoryLimit, 'ephemeral-storage': '64Mi' },
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
    limits: { cpu: 2, memory: '512Mi', 'ephemeral-storage': '256Mi' },
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
}, 30_000);
