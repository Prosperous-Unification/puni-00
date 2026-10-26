import { parseArgs } from 'node:util';

import { createBackendAcceptance } from './acceptance';
import {
  type ApplicationLogState,
  createApplicationLogCollector,
  encodeApplicationLogs,
} from './application-log';
import {
  createStorageReader,
  encodeHealthMetrics,
  type StorageState,
  writeHealthCheckpoint,
} from './autonomous';
import { readCheckpoint, writeCheckpoint } from './checkpoint';
import type { ObservationHealth } from './observation';
import { createOtlpPublisher, createOtlpSender } from './otlp';
import { collectProbe, runProbe } from './probe';
import { createHttpHealthReader, createSshHealthReader } from './source';
import { readTransportFile } from './transport';

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    local: { type: 'string' },
    elastic: { type: 'string' },
    prometheus: { type: 'string' },
    'health-checkpoint': { type: 'string' },
    otlp: { type: 'string' },
    'otlp-binding': { type: 'string' },
    'elastic-binding': { type: 'string' },
    'prometheus-binding': { type: 'string' },
    version: { type: 'string' },
    checkpoint: { type: 'string' },
    initialize: { type: 'boolean' },
    once: { type: 'boolean' },
    'expected-revision': { type: 'string' },
  },
  strict: true,
  allowPositionals: false,
});
if (
  (values.otlp === undefined && values['otlp-binding'] === undefined) ||
  values.version === undefined ||
  values.checkpoint === undefined
)
  throw new Error(
    'Required: --otlp <loopback-url> or --otlp-binding <private-json>, --version <producer-version>, --checkpoint <path>; first start also --initialize',
  );
// Proof: runtime-binding-conflict removal loses the ambiguity diagnostic; publisher-binding/batch-sender-binding faults independently fail the four-publication TLS subprocess.
if (
  (values.otlp !== undefined && values['otlp-binding'] !== undefined) ||
  (values.elastic !== undefined && values['elastic-binding'] !== undefined) ||
  (values.prometheus !== undefined && values['prometheus-binding'] !== undefined)
)
  throw new Error('Use one endpoint or binding per route');
const otlp =
  values['otlp-binding'] === undefined ? values.otlp : readTransportFile(values['otlp-binding']);
if (otlp === undefined) throw new Error('OTLP binding is required');
const elastic =
  values['elastic-binding'] === undefined
    ? (values.elastic ?? 'http://127.0.0.1:19200')
    : readTransportFile(values['elastic-binding']);
const prometheus =
  values['prometheus-binding'] === undefined
    ? (values.prometheus ?? 'http://127.0.0.1:19090')
    : readTransportFile(values['prometheus-binding']);
const checkpointPath = values.checkpoint;
const previous = readCheckpoint(checkpointPath, values.initialize === true);
const controller = new AbortController();
const stop = () => {
  controller.abort();
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
const options = {
  readHealth:
    values.local === undefined ? createSshHealthReader() : createHttpHealthReader(values.local),
  publication: createOtlpPublisher(
    otlp,
    previous?.publication.state === 'acknowledged' ? previous.revision : null,
  ),
  producerVersion: values.version,
  expectedRevision: values['expected-revision'],
  signal: controller.signal,
};
const backend = createBackendAcceptance({
  elastic,
  prometheus,
  freshnessMs: 120000,
});
const send = createOtlpSender(otlp);
const applicationLogs = createApplicationLogCollector({
  publish: (records, containerId, signal) =>
    send('logs', encodeApplicationLogs(records, containerId), signal),
});
const readStorage = createStorageReader();
let assessed: { observationId: string; checkedAt: number; health: ObservationHealth } | undefined;
const acceptance = {
  assess: async (observation: Awaited<ReturnType<typeof collectProbe>>, signal: AbortSignal) => {
    const health = await backend.assess(observation, signal);
    assessed = { observationId: observation.observationId, checkedAt: Date.now(), health };
    return health;
  },
};
try {
  const onCompleted = async (
    observation: Awaited<ReturnType<typeof collectProbe>>,
    cycleSignal: AbortSignal,
  ) => {
    writeCheckpoint(checkpointPath, observation);
    console.log(JSON.stringify(observation));
    const signal = AbortSignal.any([cycleSignal, AbortSignal.timeout(10000)]);
    const unavailableApplication: ApplicationLogState = {
      state: 'unavailable',
      reason: 'source-unavailable',
      checkedAt: Date.now(),
      containerId: null,
      accepted: 0,
      unsupported: 0,
      invalid: 0,
    };
    const unavailableStorage: StorageState = {
      state: 'unavailable',
      reason: 'source-unavailable',
      checkedAt: Date.now(),
    };
    // A local protocol rehearsal must never read or assert actual dev/storage source evidence.
    const [application, storage] =
      values.local === undefined
        ? await Promise.all([applicationLogs.collect(signal), readStorage(signal)])
        : [unavailableApplication, unavailableStorage];
    const sourceFailed = !observation.success || observation.revision === null;
    const health: ObservationHealth =
      sourceFailed || assessed === undefined
        ? {
            state: 'incomplete',
            signals: {
              log: ['unavailable: source-not-validated'],
              metric: ['unavailable: source-not-validated'],
              trace: ['unavailable: source-not-validated'],
            },
          }
        : assessed.health;
    const checkpoint = {
      checkedAt: sourceFailed || assessed === undefined ? Date.now() : assessed.checkedAt,
      observationId: sourceFailed ? observation.observationId : (assessed?.observationId ?? null),
      health,
      application,
      storage,
    };
    writeHealthCheckpoint(values['health-checkpoint'] ?? `${checkpointPath}.health`, checkpoint);
    console.log(JSON.stringify({ kind: 'observation-health', ...checkpoint }));
    const published = await send('metrics', encodeHealthMetrics(checkpoint), signal);
    if (published.state !== 'acknowledged')
      console.error(
        JSON.stringify({ kind: 'health-publication', state: 'failed', reason: published.reason }),
      );
  };
  if (values.once === true) {
    const onceSignal = AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]);
    const [observation] = await Promise.all([
      collectProbe({ ...options, signal: onceSignal }),
      previous === undefined ? Promise.resolve() : acceptance.assess(previous, onceSignal),
    ]);
    await onCompleted(observation, onceSignal);
    if (!observation.success || observation.publication.state !== 'acknowledged')
      process.exitCode = 1;
  } else
    await runProbe({
      ...options,
      previous,
      acceptance,
      onCompleted,
      onAssessed: (health) => {
        if (assessed !== undefined) assessed.health = health;
      },
    });
} finally {
  process.off('SIGTERM', stop);
  process.off('SIGINT', stop);
}
