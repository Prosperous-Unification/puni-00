import { metrics } from '@opentelemetry/api';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { Elysia } from 'elysia';

import type { ServiceName } from '../logger';

export interface ObservabilityPluginOptions {
  service: ServiceName;
  metricsPath?: string;
}

let started = false;

function ensureExporter(): PrometheusExporter {
  const exporter = new PrometheusExporter({ preventServerStart: true });
  if (!started) {
    const provider = new MeterProvider({ readers: [exporter] });
    metrics.setGlobalMeterProvider(provider);
    started = true;
  }
  return exporter;
}

export function observabilityPlugin(opts: ObservabilityPluginOptions) {
  const metricsPath = opts.metricsPath ?? '/metrics';
  const exporter = ensureExporter();

  return new Elysia({ name: 'wbs-observability', seed: opts.service }).get(
    metricsPath,
    async () => {
      const { resourceMetrics, errors } = await exporter.collect();
      if (errors.length > 0) {
        return new Response(`# scrape errors: ${errors.map((e) => String(e)).join(',')}`, {
          status: 500,
        });
      }
      const serializer = (
        exporter as unknown as {
          _serializer?: { serialize: (m: unknown) => string };
        }
      )._serializer;
      const text = serializer ? serializer.serialize(resourceMetrics) : '# HELP placeholder\n';
      return new Response(text, { headers: { 'content-type': 'text/plain; version=0.0.4' } });
    },
  );
}
