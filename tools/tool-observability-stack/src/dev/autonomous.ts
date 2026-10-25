import { renameSync, writeFileSync } from 'node:fs';

import type { ApplicationLogState } from './application-log';
import type { ObservationHealth } from './observation';
import { executeBounded } from './source';

export type StorageState =
  | {
      state: 'complete';
      checkedAt: number;
      observedAt: number;
      availableBytes: number;
      capacityBytes: number;
    }
  | {
      state: 'unavailable';
      reason: 'source-unavailable' | 'deadline' | 'invalid-reading';
      checkedAt: number;
    };
export interface HealthCheckpoint {
  checkedAt: number;
  observationId: string | null;
  health: ObservationHealth;
  application: ApplicationLogState;
  storage: StorageState;
}

/** Parses one fixed filesystem with df column padding; ordered header tokens and remote completion time stay required. */
export function parseStorage(
  text: string,
  observedAt: number,
): Extract<StorageState, { state: 'complete' }> {
  const lines = text.trim().split('\n');
  // Proof: removing whitespace normalization rejects actual padded stdout; removing token equality accepts the reordered-header SSH fixture.
  if (
    lines.length !== 2 ||
    lines[0].trim().split(/\s+/).join(' ') !==
      'Filesystem 1024-blocks Used Available Capacity Mounted on'
  )
    throw new Error('Invalid storage reading');
  const fields = lines[1].trim().split(/\s+/);
  const capacity = Number(fields[1]),
    used = Number(fields[2]),
    available = Number(fields[3]);
  // Proof: ignoring capacity accounting accepts the impossible actual-df-shaped fixture.
  if (
    fields.length !== 6 ||
    !/^\d+%$/.test(fields[4]) ||
    ![capacity, used, available, observedAt].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) ||
    capacity <= 0 ||
    used + available > capacity ||
    observedAt <= 0
  )
    throw new Error('Invalid storage reading');
  return {
    state: 'complete',
    checkedAt: Date.now(),
    observedAt,
    availableBytes: available * 1024,
    capacityBytes: capacity * 1024,
  };
}

/** Existing SSH identity, fixed filesystem, bounded capture and remote timestamp; no host mutation. */
export function createStorageReader(sshExecutable = 'ssh') {
  return async (parent: AbortSignal): Promise<StorageState> => {
    const checkedAt = Date.now(),
      signal = AbortSignal.any([parent, AbortSignal.timeout(10000)]);
    try {
      const captured = await executeBounded(
        [
          sshExecutable,
          '-o',
          'BatchMode=yes',
          '-o',
          'ConnectTimeout=5',
          'h3mon',
          "sudo -n sh -c 'df -Pk /var/lib/docker && date +%s'",
        ],
        '',
        signal,
      );
      if (captured.exitCode !== 0)
        return { state: 'unavailable', reason: 'source-unavailable', checkedAt };
      const lines = captured.stdout.trim().split('\n');
      const timestamp = lines.pop();
      if (timestamp === undefined || !/^\d+$/.test(timestamp))
        return { state: 'unavailable', reason: 'invalid-reading', checkedAt };
      const observedAt = Number(timestamp) * 1000;
      // date +%s floors completion time: one second of lower-bound quantization is allowed, never future time.
      // Proof: removing the upper bound accepts the otherwise-valid just-next-second SSH fixture.
      if (observedAt < checkedAt - 1000 || observedAt > Date.now())
        return { state: 'unavailable', reason: 'invalid-reading', checkedAt };
      try {
        return parseStorage(lines.join('\n'), observedAt);
      } catch (error) {
        // Malformed remote output is a modeled source failure, never a healthy default.
        if (error instanceof Error && error.message === 'Invalid storage reading')
          return { state: 'unavailable', reason: 'invalid-reading', checkedAt };
        throw error;
      }
    } catch (error) {
      if (signal.aborted) return { state: 'unavailable', reason: 'deadline', checkedAt };
      // Proof: oversized actual SSH stdout previously threw; its source fixture now reports invalid-reading.
      if (error instanceof RangeError)
        return { state: 'unavailable', reason: 'invalid-reading', checkedAt };
      throw error;
    }
  };
}
function attribute(key: string, value: string) {
  return { key, value: { stringValue: value } };
}

/** All state series are emitted as 0/1 every cycle; identities and raw errors are never metric labels. */
export function encodeHealthMetrics(checkpoint: HealthCheckpoint) {
  const labels = [attribute('environment', 'dev'), attribute('service', 'be-01')];
  const point = (asDouble: number, attributes = labels) => ({
    asDouble,
    timeUnixNano: String(BigInt(checkpoint.checkedAt) * 1000000n),
    attributes,
  });
  const gauge = (name: string, points: ReturnType<typeof point>[]) => ({
    name,
    gauge: { dataPoints: points },
  });
  const metrics = [
    gauge(
      'puni_dev_observation_health',
      ['missing', 'incomplete', 'stale', 'complete'].map((state) =>
        point(checkpoint.health.state === state ? 1 : 0, [...labels, attribute('state', state)]),
      ),
    ),
    gauge('puni_dev_observation_checked_timestamp_seconds', [point(checkpoint.checkedAt / 1000)]),
    gauge(
      'puni_dev_application_log_collection_state',
      ['complete', 'incomplete', 'unavailable'].map((state) =>
        point(checkpoint.application.state === state ? 1 : 0, [
          ...labels,
          attribute('state', state),
        ]),
      ),
    ),
    gauge('puni_dev_application_log_checked_timestamp_seconds', [
      point(checkpoint.application.checkedAt / 1000),
    ]),
    gauge(
      'puni_dev_storage_collection_state',
      ['complete', 'unavailable'].map((state) =>
        point(checkpoint.storage.state === state ? 1 : 0, [
          attribute('environment', 'dev'),
          attribute('state', state),
        ]),
      ),
    ),
  ];
  const reasonCodes = [
    'none',
    'missing',
    'unavailable',
    'identity',
    'invalid-time',
    'future-time',
    'stale',
    'incomplete-trace',
  ];
  const reasons: ReturnType<typeof point>[] = [];
  for (const signal of ['log', 'metric', 'trace'] as const) {
    const present = new Set(
      checkpoint.health.signals[signal].map((reason) =>
        reason.startsWith('unavailable:')
          ? 'unavailable'
          : reason.startsWith('identity.')
            ? 'identity'
            : reason,
      ),
    );
    if (present.size === 0) present.add('none');
    for (const reason of reasonCodes)
      reasons.push(
        point(present.has(reason) ? 1 : 0, [
          ...labels,
          attribute('signal', signal),
          attribute('reason', reason),
        ]),
      );
  }
  metrics.push(gauge('puni_dev_observation_signal_reason', reasons));
  if (checkpoint.storage.state === 'complete')
    metrics.push(
      gauge('puni_dev_storage_available_bytes', [
        point(checkpoint.storage.availableBytes, [attribute('environment', 'dev')]),
      ]),
      gauge('puni_dev_storage_capacity_bytes', [
        point(checkpoint.storage.capacityBytes, [attribute('environment', 'dev')]),
      ]),
      gauge('puni_dev_storage_observed_timestamp_seconds', [
        point(checkpoint.storage.observedAt / 1000, [attribute('environment', 'dev')]),
      ]),
    );
  return {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            attribute('service.name', 'puni-dev-probe'),
            attribute('deployment.environment.name', 'dev'),
          ],
        },
        scopeMetrics: [{ scope: { name: 'puni-dev-observation-health' }, metrics }],
      },
    ],
  };
}

/** One atomically replaced health checkpoint for CLI inspection; no history or second telemetry store. */
export function writeHealthCheckpoint(path: string, checkpoint: HealthCheckpoint): void {
  const text = JSON.stringify(checkpoint);
  // Proof: lifting this cap fails oversized health checkpoint preservation before replacement.
  if (Buffer.byteLength(text) > 8192) throw new Error('Health checkpoint exceeds size bound');
  writeFileSync(`${path}.next`, text, { mode: 0o600 });
  renameSync(`${path}.next`, path);
}
