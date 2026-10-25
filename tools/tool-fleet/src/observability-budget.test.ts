import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';
import { parse, parseAllDocuments } from 'yaml';

import { assessObservabilityBudget } from './observability-budget';

const root = join(import.meta.dir, '../../..');

/** h3mon MemTotal15977380KiB measured 2026-10-25, not a live admission receipt. */
const h3monCapacityMib = Math.floor(15977380 / 1024);

/** Usage allowance for DaemonSet containers that request no memory (none since hcloud CSI left the graph). */
const unrequestedDaemonSetMib = 128;

async function readDocuments(path: string): Promise<unknown[]> {
  return parseAllDocuments(await readFile(join(root, path), 'utf8')).map(
    (document): unknown => document.toJS() as unknown,
  );
}

async function kustomizationFiles(directory: string): Promise<string[]> {
  const kustomization = parse(
    await readFile(join(root, directory, 'kustomization.yaml'), 'utf8'),
  ) as { resources: string[] };
  const files: string[] = [];
  for (const resource of kustomization.resources) {
    const path = join(directory, resource);
    if ((await stat(join(root, path))).isDirectory())
      files.push(...(await kustomizationFiles(path)));
    else files.push(path);
  }
  return files;
}

/** Every manifest the platform-production Flux graph applies. */
async function productionGraphFiles(): Promise<string[]> {
  const stages = 'infra/clusters/platform/production';
  const files: string[] = [];
  for (const stage of await readdir(join(root, stages))) {
    if (stage === 'kustomization.yaml') continue;
    const [document] = await readDocuments(join(stages, stage));
    const path = (document as { spec?: { path?: string } }).spec?.path;
    if (path !== undefined) files.push(...(await kustomizationFiles(path.replace(/^\.\//, ''))));
  }
  return [...new Set(files)].sort();
}

function at(value: unknown, path: readonly (string | number)[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) {
      throw new Error(`Manifest lacks ${path.join('.')}`);
    }
    current = (current as Record<string | number, unknown>)[key];
  }
  if (current === undefined) throw new Error(`Manifest lacks ${path.join('.')}`);
  return current;
}

function mebibytes(quantity: unknown): number {
  const match = /^(\d+)(Mi|Gi)$/.exec(String(quantity));
  if (match === null) throw new Error(`Unsupported memory quantity ${String(quantity)}`);
  return Number(match[1]) * (match[2] === 'Gi' ? 1024 : 1);
}

async function request(path: string, kind: string, keys: readonly (string | number)[]) {
  const document = (await readDocuments(path)).find(
    (candidate) => (candidate as { kind?: string } | null)?.kind === kind,
  );
  return mebibytes(at(document, [...keys, 'requests', 'memory']));
}

describe('h3mon observability memory budget', () => {
  it('knows every pinned workload and DaemonSet source in the production graph', async () => {
    const sources = await Promise.all(
      (await productionGraphFiles()).map(async (path) => ({
        path,
        text: await readFile(join(root, path), 'utf8'),
      })),
    );
    // A new pinned workload or DaemonSet must enter the budget below before it may land on h3mon.
    // Proof: adding `mode: daemonset` to registry/base made this fail with the new file listed.
    expect(
      sources
        .filter(({ text }) => text.includes('capability-observability'))
        .map(({ path }) => path),
    ).toEqual([
      'infra/platform/observability/base/metrics.yaml',
      'infra/platform/observability/base/signals.yaml',
      'infra/platform/observability/eck/eck-operator.yaml',
      'infra/platform/observability/elastic/base/elasticsearch.yaml',
      'infra/platform/observability/kibana/kibana.yaml',
      'infra/platform/observability/prometheus/blackbox-exporter.yaml',
      'infra/platform/observability/prometheus/kube-prometheus-stack.yaml',
    ]);
    expect(
      sources
        .filter(({ text }) =>
          /kind: DaemonSet|mode: daemonset|deployNodeAgent: true|hcloud-csi-|kube-prometheus-stack-/.test(
            text,
          ),
        )
        .map(({ path }) => path),
    ).toEqual([
      'infra/platform/backup/velero/production/velero.yaml',
      'infra/platform/networking/traefik.yaml',
      'infra/platform/observability/otel/collector.yaml',
      'infra/platform/observability/prometheus/kube-prometheus-stack.yaml',
    ]);
    // Traefik is budgeted on h4claw: it runs only on ingress nodes.
    expect(
      at((await readDocuments('infra/platform/networking/traefik.yaml'))[0], [
        'spec',
        'values',
        'nodeSelector',
        'puni.dev/capability-ingress',
      ]),
    ).toBe('true');
  });

  it('fits pinned workloads and every DaemonSet within h3mon allocatable memory', async () => {
    const kps = 'infra/platform/observability/prometheus/kube-prometheus-stack.yaml';
    const values = ['spec', 'values'] as const;
    const requests = {
      elasticsearch: await request(
        'infra/platform/observability/elastic/base/elasticsearch.yaml',
        'HelmRelease',
        [...values, 'nodeSets', 0, 'podTemplate', 'spec', 'containers', 0, 'resources'],
      ),
      kibana: await request('infra/platform/observability/kibana/kibana.yaml', 'HelmRelease', [
        ...values,
        'podTemplate',
        'spec',
        'containers',
        0,
        'resources',
      ]),
      eckOperator: await request(
        'infra/platform/observability/eck/eck-operator.yaml',
        'HelmRelease',
        [...values, 'resources'],
      ),
      prometheus: await request(kps, 'HelmRelease', [
        ...values,
        'prometheus',
        'prometheusSpec',
        'resources',
      ]),
      prometheusOperator: await request(kps, 'HelmRelease', [
        ...values,
        'prometheusOperator',
        'resources',
      ]),
      alertmanager: await request(kps, 'HelmRelease', [
        ...values,
        'alertmanager',
        'alertmanagerSpec',
        'resources',
      ]),
      nodeExporter: await request(kps, 'HelmRelease', [
        ...values,
        'prometheus-node-exporter',
        'resources',
      ]),
      blackbox: await request(
        'infra/platform/observability/prometheus/blackbox-exporter.yaml',
        'Deployment',
        ['spec', 'template', 'spec', 'containers', 0, 'resources'],
      ),
      otelCollector: await request(
        'infra/platform/observability/otel/collector.yaml',
        'HelmRelease',
        [...values, 'resources'],
      ),
      veleroNodeAgent: await request(
        'infra/platform/backup/velero/production/velero.yaml',
        'HelmRelease',
        [...values, 'nodeAgent', 'resources'],
      ),
    };
    const inventory = (
      await readDocuments('infra/ansible/inventory/production-existing-hosts.yml')
    )[0];
    const h3 = at(inventory, ['all', 'children', 'k3s_agents', 'hosts', 'h3mon']);
    const allocatable =
      h3monCapacityMib -
      mebibytes(at(h3, ['puni_kubelet_system_reserved_memory'])) -
      mebibytes(at(h3, ['puni_kubelet_kube_reserved_memory'])) -
      mebibytes(at(h3, ['puni_kubelet_eviction_memory']));
    const budget = await assessObservabilityBudget(root);
    const requested =
      [
        ...Object.values(budget.platformRequestsMiB),
        ...Object.values(budget.applicationMiB),
      ].reduce((sum, value) => sum + value, 0) + unrequestedDaemonSetMib;
    // Proof: Kibana's former 768Mi request made this fail: 6086 requested > 6066 allocatable.
    expect(requested).toBeLessThanOrEqual(allocatable);
    // Elasticsearch keeps the 2 GiB heap inside a Guaranteed 4 GiB pod: request equals limit.
    expect(requests.elasticsearch).toBe(4096);
  });
});

it('overlap accounts every preserved Docker limit and reports the capacity blocker', async () => {
  const budget = await assessObservabilityBudget(root);
  expect(Object.values(budget.preservedDockerMiB).reduce((sum, memory) => sum + memory, 0)).toBe(
    2560,
  );
  expect(Object.values(budget.legacyDevMiB).reduce((sum, memory) => sum + memory, 0)).toBe(5632);
  expect(budget.overlap.admitted).toBe(false);
  expect(budget.overlap.shortfallMiB).toBeGreaterThan(0);
});
