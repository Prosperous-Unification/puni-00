import { type } from 'arktype';

const Reading = type({
  '+': 'reject',
  observedAt: 'number',
  source: {
    '+': 'reject',
    provider: 'string',
    target: 'string',
    identity: 'string',
    authority: 'string',
    generation: 'string',
  },
  host: {
    '+': 'reject',
    startedAt: 'number',
    totalBytes: 'number',
    availableBytes: 'number',
    cpuSeconds: 'number',
  },
  unselected: 'number',
  workloads: type({
    '+': 'reject',
    group: 'string',
    role: 'string',
    generation: 'string',
    startedAt: 'number',
    memoryBytes: 'number',
    memoryLimitBytes: 'number | null',
    cpuSeconds: 'number',
  }).array(),
});

/** Measured current memory charges and cumulative CPU seconds; source provenance is checkpoint-only. */
export type ResourceReading = typeof Reading.infer;
export type ResourceState =
  | { state: 'complete'; checkedAt: number; reading: ResourceReading }
  | {
      state: 'unavailable';
      checkedAt: number;
      reason: 'source-unavailable' | 'deadline' | 'invalid-reading';
    };

/** Malformed external readings are modeled refusals; other programming failures propagate. */
export class InvalidResourceReading extends Error {}

/** Validates one external reading; no partial readings, fabricated zeroes or stale/future counters. */
export function parseResourceReading(value: unknown, checkedAt: number): ResourceReading {
  const reading = Reading(value);
  if (reading instanceof type.errors)
    // Proof: removing this refusal fails resource refusal reports shape in resources.test.ts.
    throw new InvalidResourceReading('Invalid resource shape');
  const isInteger = (number: number) => Number.isSafeInteger(number) && number >= 0;
  const isCounter = (number: number) =>
    Number.isFinite(number) && number >= 0 && number <= Number.MAX_SAFE_INTEGER;
  const isLabel = (text: string) => /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(text);
  if (
    !isInteger(checkedAt) ||
    checkedAt <= 0 ||
    !isInteger(reading.observedAt) ||
    reading.observedAt <= 0 ||
    reading.observedAt > checkedAt ||
    checkedAt - reading.observedAt > 10000
  )
    // Proof: removing this refusal fails resource refusal reports time in resources.test.ts.
    throw new InvalidResourceReading('Invalid resource time');
  if (
    !Object.values(reading.source).every(isLabel) ||
    !isInteger(reading.unselected) ||
    reading.unselected > 64 ||
    reading.workloads.length < 1 ||
    reading.workloads.length > 64
  )
    // Proof: removing this refusal fails resource refusal reports provenance in resources.test.ts.
    throw new InvalidResourceReading('Invalid resource provenance');
  const host = reading.host;
  if (
    !isInteger(host.startedAt) ||
    host.startedAt <= 0 ||
    host.startedAt > reading.observedAt ||
    !isInteger(host.totalBytes) ||
    host.totalBytes <= 0 ||
    !isInteger(host.availableBytes) ||
    host.availableBytes > host.totalBytes ||
    !isCounter(host.cpuSeconds)
  )
    // Proof: removing this refusal fails resource refusal reports host in resources.test.ts.
    throw new InvalidResourceReading('Invalid host counters');
  const roles = new Set<string>();
  for (const workload of reading.workloads) {
    const role = `${workload.group}/${workload.role}`;
    if (
      ![workload.group, workload.role, workload.generation].every(isLabel) ||
      roles.has(role) ||
      !isInteger(workload.startedAt) ||
      workload.startedAt <= 0 ||
      workload.startedAt < host.startedAt ||
      workload.startedAt > reading.observedAt ||
      !isInteger(workload.memoryBytes) ||
      (workload.memoryLimitBytes !== null &&
        (!isInteger(workload.memoryLimitBytes) || workload.memoryLimitBytes <= 0)) ||
      !isCounter(workload.cpuSeconds)
    )
      // Proof: removing this refusal fails resource refusal reports workload in resources.test.ts.
      throw new InvalidResourceReading('Invalid workload counters');
    roles.add(role);
  }
  return reading;
}

const attribute = (key: string, value: string) => ({ key, value: { stringValue: value } });
const nanos = (milliseconds: number) => String(BigInt(milliseconds) * 1000000n);

/** Separate target labels preserve producer identity; cumulative CPU starts again at each execution's real start. */
export function encodeResourceMetrics(resources: ResourceState) {
  const point = (
    asDouble: number,
    time: number,
    attributes: ReturnType<typeof attribute>[],
    start?: number,
  ) => ({
    asDouble,
    timeUnixNano: nanos(time),
    attributes,
    // Proof: substituting observation time for execution start fails the restart CPU encoding test.
    ...(start === undefined ? {} : { startTimeUnixNano: nanos(start) }),
  });
  type Point = ReturnType<typeof point>;
  const metrics: {
    name: string;
    gauge?: { dataPoints: Point[] };
    sum?: { dataPoints: Point[]; aggregationTemporality: number; isMonotonic: boolean };
  }[] = [];
  const gauge = (
    name: string,
    asDouble: number,
    attributes: ReturnType<typeof attribute>[],
    time = resources.checkedAt,
  ) => metrics.push({ name, gauge: { dataPoints: [point(asDouble, time, attributes)] } });
  metrics.push({
    name: 'puni_resource_collection_state',
    gauge: {
      dataPoints: ['complete', 'unavailable'].map((state) =>
        point(resources.state === state ? 1 : 0, resources.checkedAt, [attribute('state', state)]),
      ),
    },
  });
  gauge('puni_resource_checked_timestamp_seconds', resources.checkedAt / 1000, []);
  // Proof: forcing measured encoding for unavailable resources fails its no-samples test.
  if (resources.state === 'complete') {
    const { reading } = resources;
    const target = [attribute('target.host', reading.source.target)];
    const measured = (name: string, number: number, labels = target) =>
      gauge(name, number, labels, reading.observedAt);
    const cpu = (
      name: string,
      seconds: number,
      startedAt: number,
      labels: ReturnType<typeof attribute>[],
    ) =>
      metrics.push({
        name,
        sum: {
          dataPoints: [point(seconds, reading.observedAt, labels, startedAt)],
          aggregationTemporality: 2,
          isMonotonic: true,
        },
      });
    measured('puni_resource_observed_timestamp_seconds', reading.observedAt / 1000);
    measured('puni_resource_host_started_timestamp_seconds', reading.host.startedAt / 1000);
    measured('puni_resource_host_memory_total_bytes', reading.host.totalBytes);
    measured('puni_resource_host_memory_available_bytes', reading.host.availableBytes);
    measured('puni_resource_unselected_workloads', reading.unselected);
    cpu('puni_resource_host_cpu_seconds', reading.host.cpuSeconds, reading.host.startedAt, target);
    for (const workload of reading.workloads) {
      const labels = [
        ...target,
        attribute('workload.group', workload.group),
        attribute('workload.role', workload.role),
      ];
      measured(
        'puni_resource_workload_started_timestamp_seconds',
        workload.startedAt / 1000,
        labels,
      );
      measured('puni_resource_workload_memory_current_bytes', workload.memoryBytes, labels);
      measured(
        'puni_resource_workload_memory_bounded',
        workload.memoryLimitBytes === null ? 0 : 1,
        labels,
      );
      if (workload.memoryLimitBytes !== null)
        measured('puni_resource_workload_memory_limit_bytes', workload.memoryLimitBytes, labels);
      cpu('puni_resource_workload_cpu_seconds', workload.cpuSeconds, workload.startedAt, labels);
    }
  }
  return {
    resourceMetrics: [
      {
        resource: {
          attributes: [
            attribute('service.name', 'puni-dev-probe'),
            attribute('deployment.environment.name', 'dev'),
          ],
        },
        scopeMetrics: [{ scope: { name: 'puni-resource-observation' }, metrics }],
      },
    ],
  };
}
