import { metrics } from '@opentelemetry/api';
import { PrometheusExporter, PrometheusSerializer } from '@opentelemetry/exporter-prometheus';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { Elysia } from 'elysia';

import type { ServiceName } from '../logger';

export interface ObservabilityPluginOptions {
  service: ServiceName;
  metricsPath?: string;
}

let started = false;
let sharedReader: PrometheusExporter | null = null;

function ensureReader(): PrometheusExporter {
  if (sharedReader) return sharedReader;
  const reader = new PrometheusExporter({ preventServerStart: true });
  if (!started) {
    const provider = new MeterProvider({ readers: [reader] });
    metrics.setGlobalMeterProvider(provider);
    started = true;
  }
  sharedReader = reader;
  return reader;
}

export function observabilityPlugin(opts: ObservabilityPluginOptions): Elysia {
  const metricsPath = opts.metricsPath ?? '/metrics';
  const reader = ensureReader();
  const serializer = new PrometheusSerializer();

  return new Elysia({ name: 'wbs-observability', seed: opts.service }).get(
    metricsPath,
    async () => {
      const { resourceMetrics, errors } = await reader.collect();
      if (errors.length > 0) {
        const msg = errors.map((e) => (e instanceof Error ? e.message : String(e))).join(', ');
        return new Response(`# scrape errors: ${msg}\n`, {
          status: 500,
          headers: { 'content-type': 'text/plain; version=0.0.4' },
        });
      }
      const text = serializer.serialize(resourceMetrics);
      const body = text.length > 0 ? text : `# no metrics registered yet for ${opts.service}\n`;
      return new Response(body, {
        headers: { 'content-type': 'text/plain; version=0.0.4' },
      });
    },
  );
}

export function __resetForTests(): void {
  sharedReader = null;
  started = false;
}
