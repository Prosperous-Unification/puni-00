import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseAllDocuments } from 'yaml';

/** Guaranteed memory requests/limits shared with the application workload generator. */
export const applicationMiB = { collector: 512, gateway: 1024, metricsProxy: 128 } as const;

/** Measured 2026-10-25: MemTotal15977380KiB; Docker limits, never RSS, from the same host receipt. This is planning evidence, not live admission. */
export async function assessObservabilityBudget(root: string) {
  const preservedDockerMiB = {
    mlflow: 512,
    oldCollector: 192,
    victoriaLogs: 768,
    victoriaTraces: 384,
    victoriaMetrics: 256,
    victoriaAuth: 64,
    grafana: 384,
  };
  const legacyDevMiB = {
    elasticsearch: 2048,
    kibana: 1024,
    gateway: 1024,
    collector: 512,
    prometheus: 768,
    alertmanager: 256,
  };

  const reservationsMiB = { system: 1024, kubelet: 384, eviction: 256, unrequestedDaemonSets: 128 };
  const requests: Record<string, number> = {};
  for (const path of [
    'observability/elastic/base/elasticsearch.yaml',
    'observability/eck/eck-operator.yaml',
    'observability/kibana/kibana.yaml',
    'observability/prometheus/kube-prometheus-stack.yaml',
    'observability/prometheus/blackbox-exporter.yaml',
    'observability/otel/collector.yaml',
    'backup/velero/production/velero.yaml',
  ]) {
    requests[path] = parseAllDocuments(
      await readFile(join(root, 'infra/platform', path), 'utf8'),
    ).reduce((sum, document) => sum + sumMemoryRequests(document.toJSON()), 0);
  }
  const sum = (entries: Record<string, number>) =>
    Object.values(entries).reduce((total, memory) => total + memory, 0);
  const capacityMiB = Math.floor(15977380 / 1024);
  const steadyStateMiB =
    sum(requests) + sum(applicationMiB) + sum(reservationsMiB) + sum(preservedDockerMiB);
  const overlapMiB = steadyStateMiB + sum(legacyDevMiB);
  return {
    observedAt: '2026-10-25',
    capacityMiB,
    reservationsMiB,
    platformRequestsMiB: requests,
    preservedDockerMiB,
    legacyDevMiB,
    applicationMiB,
    steadyState: { requestedMiB: steadyStateMiB, requiresLiveAdmission: true },
    overlap: {
      requestedMiB: overlapMiB,
      shortfallMiB: Math.max(0, overlapMiB - capacityMiB),
      admitted: overlapMiB <= capacityMiB,
    },
  };
}

function sumMemoryRequests(value: unknown): number {
  if (Array.isArray(value))
    return value.reduce((sum: number, entry: unknown) => sum + sumMemoryRequests(entry), 0);
  if (typeof value !== 'object' || value === null) return 0;
  let total = 0;
  for (const key of Object.keys(value)) {
    const child: unknown = Reflect.get(value, key);
    if (key === 'requests' && typeof child === 'object' && child !== null && 'memory' in child) {
      const quantity: unknown = child.memory;
      const match = typeof quantity === 'string' ? /^(\d+)(Mi|Gi)$/.exec(quantity) : null;
      // Proof: removing this branch changes the malformed-memory production negative into an unrelated null access.
      if (match === null) throw new Error('observability memory request must be explicit Mi or Gi');
      total += Number(match[1]) * (match[2] === 'Gi' ? 1024 : 1);
    } else total += sumMemoryRequests(child);
  }
  return total;
}
