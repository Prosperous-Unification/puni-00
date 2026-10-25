import { readFileSync } from 'node:fs';

import { stringify } from 'yaml';

import { createLegacyConfiguration, legacyAdmission } from '../configuration/legacy';
import { renderDevCompose } from './deployment';

/** Preserves the transitional Compose rendering while shared persistent profiles converge. */
export const createDevConfiguration = createLegacyConfiguration;

export type DevConfiguration = ReturnType<typeof createDevConfiguration>;

/** Refuses unsafe renderer changes before serializing inputs; binary validation remains separate. */
export function assertDevConfiguration(configuration: DevConfiguration): void {
  const collector = configuration.collector.exporters.otlp;
  const gateway = configuration.gateway.exporters['elasticsearch/otel'];
  for (const exporter of [collector, gateway]) {
    // Proof: removing this throw independently failed disabled collector and gateway renderer negatives.
    if (!Object.is(exporter.sending_queue.enabled, true))
      throw new Error('enabled persistent queue required');
    // Proof: removing this throw failed the independent missing-persistent-storage negative.
    if (exporter.sending_queue.storage !== 'file_storage/queue')
      throw new Error('persistent queue storage required');
    // Proof: removing this throw failed all zero/Infinity/NaN queue negatives.
    if (
      !Number.isFinite(exporter.sending_queue.queue_size) ||
      exporter.sending_queue.queue_size <= 0 ||
      exporter.sending_queue.queue_size > 16777216
    )
      throw new Error('finite bounded queue required');
    // Proof: removing this throw failed zero/infinite/empty deadline negatives.
    if (!/^[1-9][0-9]?s$/.test(exporter.timeout))
      throw new Error('finite request deadline required');
  }
  // Proof: removing this throw failed both collector and gateway indefinite-retry negatives.
  if (
    !/^[1-9][0-9]?s$/.test(collector.retry_on_failure.max_elapsed_time) ||
    !Number.isSafeInteger(gateway.retry.max_retries) ||
    gateway.retry.max_retries < 1 ||
    gateway.retry.max_retries > 3
  )
    throw new Error('finite retry required');
  // Proof: removing this throw failed trace-enrichment removal with the connector retained.
  if (!configuration.gateway.service.pipelines.traces.processors.includes('elasticapm'))
    throw new Error('trace enrichment required');
  // Proof: removing this throw failed connector removal with trace enrichment retained.
  if (
    !configuration.gateway.service.pipelines.traces.exporters.includes('elasticapm') ||
    configuration.gateway.service.pipelines['metrics/apm'].receivers.join() !== 'elasticapm'
  )
    throw new Error('APM connector required');
  for (const pipeline of [configuration.collector, configuration.gateway]) {
    const predicates = pipeline.processors['filter/dev'];
    for (const stream of Object.values(pipeline.service.pipelines)) {
      // Proof: removing this throw failed the admission-processor bypass negative.
      if (stream.receivers.includes('otlp') && !stream.processors.includes('filter/dev'))
        throw new Error('dev admission processor must remain in each input pipeline');
    }
    // Proof: removing this throw failed the changed dev-admission predicate negative.
    if (
      [predicates.logs.log_record, predicates.traces.span, predicates.metrics.datapoint].some(
        (conditions) => conditions.join() !== legacyAdmission,
      )
    )
      throw new Error('dev admission must reject unknown or production environment');
  }
  // Proof: removing this throw failed the external webhook-recipient negative.
  if (
    configuration.alertmanager.receivers.length !== 1 ||
    Object.keys(configuration.alertmanager.receivers[0]).join() !== 'name' ||
    configuration.alertmanager.route.receiver !== configuration.alertmanager.receivers[0].name
  )
    throw new Error('external recipient refused');
}

/** Only the two fixed new project queue volumes may be initialized; no host mount is accepted. */
export function renderQueueInitialization(
  role: 'collector' | 'gateway',
  volume: string,
  mount: string,
): string[] {
  // Proof: removing this throw failed foreign-volume, host-directory and foreign-mount negatives.
  if (volume !== `puni-dev-observability_${role}` || mount !== '/queue')
    throw new Error('initializer requires exact dev-owned queue volume and mount');
  const owner = role === 'collector' ? '10001:10001' : '1000:1000';
  return [
    'docker',
    'run',
    '--rm',
    '--network',
    'none',
    '--user',
    '0:0',
    '--mount',
    `type=volume,source=${volume},target=/queue`,
    '--entrypoint',
    '/bin/sh',
    renderDevCompose().services['gateway'].image,
    '-ec',
    'chown "$1" /queue',
    'queue-init',
    owner,
  ];
}

/** Emits deployable inputs; retention setup must run before ingestion, then be queried on actual streams. */
export function renderDevConfiguration(
  configuration: DevConfiguration = createDevConfiguration(),
): Record<string, string> {
  assertDevConfiguration(configuration);
  const files: Record<string, string> = {};
  for (const [name, settings] of Object.entries(configuration))
    files[`${name}.yaml`] = stringify(settings);
  files['rules.yaml'] = readFileSync(new URL('./rules.yaml', import.meta.url), 'utf8');
  files['rollback.json'] = JSON.stringify({
    environment: 'dev',
    host: 'h3mon',
    project: 'puni-dev-observability',
    preserveVolumes: true,
  });
  files['health.mjs'] = readFileSync(new URL('./health.mjs', import.meta.url), 'utf8');
  files['retention.sh'] = readFileSync(new URL('./retention.sh', import.meta.url), 'utf8');
  return files;
}
