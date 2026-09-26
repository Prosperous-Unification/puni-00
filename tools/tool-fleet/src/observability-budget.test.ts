import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { $ } from 'bun';
import { describe, expect, it } from 'bun:test';
import { parseAllDocuments } from 'yaml';

const root = join(import.meta.dir, '../../..');

/** h3mon's MemTotal from the 2026-09-27 probe (`7.6Gi`), rounded down to whole MiB. */
const h3monCapacityMib = 7730;

async function readDocuments(path: string): Promise<unknown[]> {
  return parseAllDocuments(await readFile(join(root, path), 'utf8')).map(
    (document): unknown => document.toJS() as unknown,
  );
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
  it('names every workload pinned to the observability capability', async () => {
    const pinned = (
      await $`git -C ${root} grep -l capability-observability -- infra/platform`.text()
    )
      .trim()
      .split('\n')
      .filter((path) => !path.includes('/local/'))
      .sort();
    // A new pinned workload must be added to the budget below before it may land on h3mon.
    expect(pinned).toEqual([
      'infra/platform/observability/eck/eck-operator.yaml',
      'infra/platform/observability/elastic/production/elasticsearch.yaml',
      'infra/platform/observability/kibana/kibana.yaml',
      'infra/platform/observability/prometheus/blackbox-exporter.yaml',
      'infra/platform/observability/prometheus/kube-prometheus-stack.yaml',
    ]);
  });

  it('fits pinned workloads and every DaemonSet within h3mon allocatable memory', async () => {
    const kps = 'infra/platform/observability/prometheus/kube-prometheus-stack.yaml';
    const values = ['spec', 'values'] as const;
    const requests = {
      elasticsearch: await request(
        'infra/platform/observability/elastic/production/elasticsearch.yaml',
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
      otelAgent: await request('infra/platform/telemetry/agent/agent.yaml', 'HelmRelease', [
        ...values,
        'resources',
      ]),
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
    const requested = Object.values(requests).reduce((sum, value) => sum + value, 0);
    // Proof: a 1536Mi h3mon system reservation made this fail: 5926 requested > 5554 allocatable.
    expect(requested).toBeLessThanOrEqual(allocatable);
    // Elasticsearch keeps the 2 GiB heap inside a Guaranteed 4 GiB pod: request equals limit.
    expect(requests.elasticsearch).toBe(4096);
  });
});
