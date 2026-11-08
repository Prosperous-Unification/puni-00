import { isDeepStrictEqual } from 'node:util';

import { type } from 'arktype';
import { parseDocument } from 'yaml';

// Proof: widening error_mode to string admitted ignore in the filter-mode negative; malformed scalar input also refuses at this boundary.
const Configuration = type({
  receivers: {
    'filelog?': { include: 'string[]', exclude: 'string[]', operators: 'object[]' },
    'file_log?': { include: 'string[]', exclude: 'string[]', operators: 'object[]' },
  },
  processors: {
    'filter/platform-only': { error_mode: "'propagate'", logs: { log_record: 'string[]' } },
  },
  service: { pipelines: 'Record<string, unknown>' },
});
const Pipeline = type({ receivers: 'string[]', processors: 'string[]', exporters: 'string[]' });
/** Source prerequisite only: both file-path exclusion and namespace rejection cover the retained reader's logs, including forwarded records without an app environment. */
export function assertRetainedReaderConfiguration(source: string) {
  const document = parseDocument(source);
  // Proof: removing this check admitted duplicate extensions keys in observability-reader.test.ts (yaml fault).
  if (document.errors.length) throw new Error('Retained reader configuration malformed');
  const configuration = Configuration(document.toJSON());
  if (configuration instanceof type.errors)
    throw new Error('Retained reader configuration malformed');
  const receivers = configuration.receivers;
  const receiver = Object.hasOwn(receivers, 'filelog') ? 'filelog' : 'file_log';
  const filelog = receivers[receiver];
  // Proof: removing identity closure admitted simultaneous authored filelog and chart-rewritten file_log receivers in observability-reader.test.ts.
  if (
    filelog === undefined ||
    (Object.hasOwn(receivers, 'filelog') && Object.hasOwn(receivers, 'file_log'))
  )
    throw new Error('Retained reader configuration receiver identity differs');
  // Proof: removing the path guard admitted both dev path inclusion and lost platform diagnostics in production validator negatives.
  if (
    !isDeepStrictEqual(filelog.include, ['/var/log/pods/*/*/*.log']) ||
    !isDeepStrictEqual(filelog.exclude, [
      '/var/log/pods/observability_otel-collector-*/*/*.log',
      '/var/log/pods/observability-dev_*/*/*.log',
    ])
  )
    throw new Error('Retained reader configuration path policy differs');
  // Proof: removing namespace equality admitted absent-environment dev records in the retained source contract negative.
  if (
    !isDeepStrictEqual(configuration.processors['filter/platform-only'].logs.log_record, [
      'resource.attributes["deployment.environment.name"] != nil',
      'resource.attributes["k8s.namespace.name"] == "observability-dev"',
    ])
  )
    throw new Error('Retained reader configuration namespace predicate differs');
  const logs = Object.entries(configuration.service.pipelines).filter(
    ([name]) => name === 'logs' || name.startsWith('logs/'),
  );
  // Proof: removing exact pipeline closure admitted a forwarding log pipeline bypass in the production validator negative.
  if (logs.length !== 1 || logs[0][0] !== 'logs')
    throw new Error('Retained reader configuration log pipeline closure differs');
  const pipeline = Pipeline(logs[0][1]);
  // Proof: removing pipeline equality admitted the missing namespace-filter attachment in the production validator negative.
  if (
    pipeline instanceof type.errors ||
    !isDeepStrictEqual(pipeline.receivers, [receiver, 'otlp', 'otlp/mtls']) ||
    !isDeepStrictEqual(pipeline.processors, [
      'memory_limiter',
      'filter/platform-only',
      'transform/redact',
      'resource/stream',
      'batch',
    ]) ||
    !isDeepStrictEqual(pipeline.exporters, ['elasticsearch'])
  )
    throw new Error('Retained reader configuration log pipeline policy differs');
  return {
    pathExcluded: true as const,
    namespaceRejected: true as const,
    effectiveReaderVerified: false as const,
  };
}
