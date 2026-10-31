import { expect, test } from 'bun:test';

import { encodeResourceMetrics, InvalidResourceReading, parseResourceReading } from './resources';

function resourceReading(now = Date.now()) {
  return {
    observedAt: now,
    source: {
      provider: 'fixture',
      target: 'monitor',
      identity: 'machine',
      authority: 'engine',
      generation: 'boot',
    },
    host: { startedAt: now - 100000, totalBytes: 10000, availableBytes: 4000, cpuSeconds: 12 },
    unselected: 2,
    workloads: [
      {
        group: 'monitoring',
        role: 'store',
        generation: 'execution-a',
        startedAt: now - 1000,
        memoryBytes: 1500,
        memoryLimitBytes: 2000,
        cpuSeconds: 0.5,
      },
    ],
  };
}

test('neutral resource encoding preserves measured values, target and execution start without exposing provenance IDs', () => {
  const reading = parseResourceReading(resourceReading(), Date.now());
  const batch = encodeResourceMetrics({ state: 'complete', checkedAt: Date.now(), reading });
  const text = JSON.stringify(batch);
  expect(text).toContain('puni_resource_host_memory_available_bytes');
  expect(text).toContain('"asDouble":4000');
  expect(text).toContain('"asDouble":1500');
  expect(text).toContain('"aggregationTemporality":2');
  expect(text).toContain('"isMonotonic":true');
  expect(text).toContain(
    `"startTimeUnixNano":"${String(BigInt(reading.workloads[0].startedAt) * 1000000n)}"`,
  );
  expect(text).toContain('puni_resource_workload_started_timestamp_seconds');
  expect(text).toContain('puni_resource_host_started_timestamp_seconds');
  expect(text).toContain('monitoring');
  expect(text).not.toContain('execution-a');
  expect(text).not.toContain('machine');
  const restarted = resourceReading();
  restarted.workloads[0].startedAt += 500;
  restarted.workloads[0].generation = 'execution-b';
  expect(
    JSON.stringify(
      encodeResourceMetrics({
        state: 'complete',
        checkedAt: Date.now(),
        reading: parseResourceReading(restarted, Date.now()),
      }),
    ),
  ).toContain(
    `"startTimeUnixNano":"${String(BigInt(restarted.workloads[0].startedAt) * 1000000n)}"`,
  );
});

test('resource boundary refuses stale/future/unsafe/contradictory and malformed readings', () => {
  const now = Date.now();
  const invalid = [
    { ...resourceReading(now), observedAt: now - 10001 },
    { ...resourceReading(now), observedAt: now + 1 },
    { ...resourceReading(now), observedAt: NaN },
    { ...resourceReading(now), host: { ...resourceReading(now).host, availableBytes: 10001 } },
    { ...resourceReading(now), host: { ...resourceReading(now).host, cpuSeconds: -1 } },
    {
      ...resourceReading(now),
      host: { ...resourceReading(now).host, totalBytes: Number.MAX_SAFE_INTEGER + 1 },
    },
    {
      ...resourceReading(now),
      workloads: [{ ...resourceReading(now).workloads[0], startedAt: now + 1 }],
    },
    {
      ...resourceReading(now),
      workloads: [{ ...resourceReading(now).workloads[0], memoryLimitBytes: 0 }],
    },
    {
      ...resourceReading(now),
      workloads: [resourceReading(now).workloads[0], resourceReading(now).workloads[0]],
    },
    { ...resourceReading(now), workloads: [] },
    { ...resourceReading(now), private: 'not-retained' },
  ];
  for (const reading of invalid)
    expect(() => parseResourceReading(reading, now)).toThrow(InvalidResourceReading);
  expect(() => parseResourceReading(resourceReading(now), NaN)).toThrow();
  const unbounded = resourceReading(now);
  expect(
    parseResourceReading(
      { ...unbounded, workloads: [{ ...unbounded.workloads[0], memoryLimitBytes: null }] },
      now,
    ).workloads[0].memoryLimitBytes,
  ).toBeNull();
});

test('unavailable resources emit state and checked time without measured samples', () => {
  const text = JSON.stringify(
    encodeResourceMetrics({ state: 'unavailable', reason: 'deadline', checkedAt: Date.now() }),
  );
  expect(text).toContain('puni_resource_collection_state');
  expect(text).toContain('puni_resource_checked_timestamp_seconds');
  expect(text).not.toContain('memory_available_bytes');
  expect(text).not.toContain('cpu_seconds');
});

test.each(['shape', 'time', 'provenance', 'host', 'workload'])(
  'resource refusal reports %s at its boundary',
  (fault) => {
    const now = Date.now();
    const reading = resourceReading(now);
    const invalid =
      fault === 'shape'
        ? { ...reading, private: true }
        : fault === 'time'
          ? { ...reading, observedAt: now + 1 }
          : fault === 'provenance'
            ? { ...reading, unselected: 65 }
            : fault === 'host'
              ? { ...reading, host: { ...reading.host, availableBytes: 10001 } }
              : { ...reading, workloads: [reading.workloads[0], reading.workloads[0]] };
    const messages: Record<string, string> = {
      shape: 'Invalid resource shape',
      time: 'Invalid resource time',
      provenance: 'Invalid resource provenance',
      host: 'Invalid host counters',
      workload: 'Invalid workload counters',
    };
    expect(() => parseResourceReading(invalid, now)).toThrow(messages[fault]);
  },
);

test('unbounded memory stays explicit and current charge can exceed its configured limit', () => {
  const now = Date.now();
  const reading = resourceReading(now);
  reading.workloads[0].memoryBytes = 2500;
  expect(parseResourceReading(reading, now).workloads[0].memoryBytes).toBe(2500);
  const unlimited = parseResourceReading(
    { ...reading, workloads: [{ ...reading.workloads[0], memoryLimitBytes: null }] },
    now,
  );
  const text = JSON.stringify(
    encodeResourceMetrics({ state: 'complete', checkedAt: now, reading: unlimited }),
  );
  expect(text).not.toContain('puni_resource_workload_memory_limit_bytes');
  expect(text).toContain('puni_resource_workload_memory_bounded');
});
