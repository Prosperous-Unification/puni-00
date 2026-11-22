import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type } from 'arktype';
import { stringify } from 'yaml';

import { renderRegistryPressureOverlay } from './pressure';

const Lock = type({
  charts: { kubePrometheusStack: { images: type({ role: 'string' }).array() } },
});
// Proof: widening the locked name or digest schema independently failed the corresponding refusal test.
const PrometheusPin = type({
  name: "'quay.io/prometheus/prometheus:v3.14.0-distroless'",
  digest: /^sha256:[a-f0-9]{64}$/,
});

/** Resolves exactly one usable Prometheus image from the required repository toolchain lock. */
async function readImage(root: string): Promise<string> {
  // Proof: bypassing the schema failed the typed invalid-image-inventory diagnostic.
  const lock = Lock.assert(
    JSON.parse(await readFile(join(root, 'infra/versions/toolchain.json'), 'utf8')),
  );
  const pins = lock.charts.kubePrometheusStack.images.filter(({ role }) => role === 'prometheus');
  // Proof: removing the cardinality check let a duplicate Prometheus image reach the runner.
  if (pins.length !== 1) throw new Error('toolchain lock requires exactly one Prometheus image');
  const { name, digest } = PrometheusPin.assert(pins[0]);
  return `${name}@${digest}`;
}

/** Runs the locked tool offline and preserves its stderr and stdout on failure. */
function runPromtool(directory: string, image: string, arguments_: string[]): string {
  const child = Bun.spawnSync(
    // Proof: dropping each isolation flag or changing the entrypoint failed the runner command fixture.
    // The native rules also failed to write scratch files when the writable /tmp mount was removed.
    [
      'docker',
      'run',
      '--rm',
      '--pull=never',
      '--network=none',
      '--read-only',
      '--tmpfs',
      '/tmp',
      '--mount',
      `type=bind,source=${directory},target=/etc/puni,readonly`,
      '--workdir',
      '/tmp',
      '--entrypoint',
      '/bin/promtool',
      image,
      ...arguments_,
    ],
    { timeout: 60_000, stdout: 'pipe', stderr: 'pipe' },
  );
  const output = child.stdout.toString() + child.stderr.toString();
  // Proof: omitting the exit check let a subprocess exit 42 return success.
  if (child.exitCode !== 0) {
    throw new Error(`promtool ${arguments_.join(' ')} exited ${String(child.exitCode)}\n${output}`);
  }
  return output;
}

/** Checks the candidate config and synthetic wire fixtures against the repository-pinned engine. */
export async function testRegistryPressureRules(root: string): Promise<string> {
  const image = await readImage(root);
  const { files } = renderRegistryPressureOverlay(enrollment);
  const directory = await mkdtemp(join(tmpdir(), 'registry-pressure-rules-'));
  try {
    // The image's non-root user reads the synthetic inputs through the read-only mount.
    // Proof: removing the chmod failed native configuration validation with permission denied.
    await chmod(directory, 0o755);
    const suite = 'registry-pressure.test.yaml';
    const precision = 'registry-pressure.precision.test.yaml';
    const inputs = {
      'prometheus.yaml': files['prometheus.yaml'],
      'rules.yaml': files['rules.yaml'],
      'registry-pressure.rules.yaml': files['registry-pressure.rules.yaml'],
      [suite]: stringify(nativeFixtures()),
      [precision]: stringify(precisionFixture()),
    };
    for (const [name, content] of Object.entries(inputs)) {
      const path = join(directory, name);
      await writeFile(path, content);
      // Proof: omitting this chmod left all inputs at 0600 and failed native config under umask 077.
      await chmod(path, 0o444);
    }
    // Proof: omitting config validation or either fixture file failed the runner command fixture.
    return (
      runPromtool(directory, image, ['check', 'config', '/etc/puni/prometheus.yaml']) +
      runPromtool(directory, image, [
        'test',
        'rules',
        `/etc/puni/${suite}`,
        `/etc/puni/${precision}`,
      ])
    );
  } finally {
    await rm(directory, { recursive: true });
  }
}

const enrollment = {
  target: {
    machineId: 'a'.repeat(32),
    registryId: 'owned',
    storageId: 'owned-store',
    registryPath: '/owned/registry',
  },
  enrolledAt: '2026-11-01T00:00:00.000Z',
  environment: 'prod',
  address: '10.1.0.2:19101',
};

const key = 'db887fe73e15bd479cd1c847d73dca4fa1b697c42d795dba847a546bfffd0fbc';
const scrapeLabels = { job: 'registry-pressure-observer', instance: '10.1.0.2:19101', target: key };
const wireLabels = { ...scrapeLabels, enrollment: key };
const evaluation = 'registry_pressure_evaluation_timestamp_milliseconds';
const baseline = 'registry_pressure_baseline_timestamp_milliseconds';
const measurement = 'registry_pressure_has_measurement';
const core = [evaluation, baseline, measurement];
const alertname = 'RegistryPressureObservationUnavailable';
const expectedAlert = {
  exp_labels: { environment: 'prod', service: 'registry', severity: 'warning', target: key },
  exp_annotations: {
    summary: 'Registry pressure observation reporting is unavailable',
    description: `Enrollment ${key}. Resolution means reporting is visible within its original deadline. Capacity recovery, write access and Slack receipt require separate evidence.`,
  },
};

function labelSet(labels: Record<string, string>) {
  return (
    '{' +
    Object.entries(labels)
      .map(([name, value]) => `${name}="${value}"`)
      .join(',') +
    '}'
  );
}

function sample(
  metric: string,
  values: string,
  labels: Record<string, string> = metric === 'up' ? scrapeLabels : wireLabels,
) {
  return { series: metric + labelSet(labels), values };
}

function evidence({
  evaluationMs = '0+30000x8',
  baselineMs = '0+0x8',
  measured = '1+0x8',
  up = '1+0x8',
} = {}) {
  return [
    sample('up', up),
    sample(evaluation, evaluationMs),
    sample(baseline, baselineMs),
    sample(measurement, measured),
  ];
}

function assessment(time: string, unavailable = true) {
  return {
    eval_time: time,
    alertname,
    exp_alerts: unavailable ? [expectedAlert] : [],
  };
}

function scenario(
  name: string,
  input_series: ReturnType<typeof evidence>,
  ...alert_rule_test: ReturnType<typeof assessment>[]
) {
  return { name, interval: '30s', input_series, alert_rule_test };
}

const due = assessment('150s');
const visible = assessment('150s', false);

function labelFault(
  metric: string,
  dimension: keyof typeof wireLabels,
  replacement: string,
  conflict: boolean,
) {
  const accepted = metric === 'up' ? scrapeLabels : wireLabels;
  const series = metric + labelSet(accepted);
  return evidence().flatMap((entry) => {
    if (entry.series !== series) return [entry];
    const foreign = sample(metric, entry.values, { ...accepted, [dimension]: replacement });
    return conflict ? [entry, foreign] : [foreign];
  });
}

function nativeFixtures() {
  return {
    rule_files: ['registry-pressure.rules.yaml'],
    evaluation_interval: '30s',
    tests: [
      scenario('expected target without any scrape or gauges', [], assessment('0s')),
      scenario('failed scrape with visible previous gauges', evidence({ up: '0+0x8' }), due),
      scenario('up must be exactly one', evidence({ up: '2+0x8' }), due),
      scenario(
        'source deadline minus one millisecond',
        evidence({ baselineMs: '-149999+0x8' }),
        visible,
      ),
      scenario(
        'original source deadline equality survives checkpoint restart and fresh scrape',
        evidence({ baselineMs: '-150000+0x8' }),
        assessment('120s', false),
        due,
        assessment('180s'),
      ),
      scenario(
        'enrollment grace before first report expires at the original deadline',
        evidence({ baselineMs: '-150000+0x8', measured: '0+0x8' }),
        assessment('120s', false),
        due,
      ),
      scenario(
        'new emission cannot renew old baseline',
        evidence({ baselineMs: '-152001+0x8' }),
        due,
      ),
      scenario(
        'source changes from visible to missing before exporter loss',
        evidence({
          evaluationMs: '0+30000x5 stale',
          baselineMs: '-150000+0x5 stale',
          measured: '1+0x5 stale',
          up: '1+0x5 0 stale',
        }),
        assessment('120s', false),
        due,
        assessment('180s'),
        assessment('210s'),
      ),
      scenario(
        'restarted checkpoint retains the expired baseline after scrape return',
        evidence({
          evaluationMs: '0+30000x5 stale 210000',
          baselineMs: '-150000+0x5 stale -150000',
          measured: '1+0x5 stale 1',
          up: '1+0x5 0 1',
        }),
        due,
        assessment('180s'),
        assessment('210s'),
      ),
      scenario(
        'source and scrape disappear on the same assessment',
        evidence({
          evaluationMs: '0+30000x4 stale',
          baselineMs: '-150000+0x4 stale',
          measured: '1+0x4 stale',
          up: '1+0x4 stale',
        }),
        assessment('120s', false),
        due,
      ),
      scenario(
        'visibility-only return retains the original deadline',
        evidence({
          evaluationMs: '0 30000 stale 90000 120000 150000',
          baselineMs: '-150000 -150000 stale -150000 -150000 -150000',
          measured: '1 1 stale 1 1 1',
          up: '1 1 0 1 1 1',
        }),
        assessment('30s', false),
        assessment('60s'),
        assessment('90s', false),
        due,
      ),
      scenario(
        'fresh normal report restores reporting after known expiry',
        [
          ...evidence({ baselineMs: '-150000+0x5 180000+0x2' }),
          sample('registry_pressure_last_measured_rank', '0+0x8'),
          sample('registry_pressure_last_measured_fenced', '0+0x8'),
        ],
        due,
        assessment('180s', false),
      ),
      scenario(
        'fresh fenced report restores reporting after known expiry',
        [
          ...evidence({
            evaluationMs: '0+30000x8',
            baselineMs: '-150000+0x5 180000+0x2',
          }),
          sample('registry_pressure_last_measured_rank', '0+0x5 3+0x2'),
          sample('registry_pressure_last_measured_fenced', '0+0x5 1+0x2'),
          sample('registry_pressure_last_used_bytes', '12+0x8'),
          sample('registry_pressure_last_budget_bytes', '10+0x8'),
          sample('registry_pressure_last_used_inodes', '1+0x8'),
          sample('registry_pressure_last_total_inodes', '10+0x8'),
          sample('registry_pressure_last_root_free_bytes', '0+0x8'),
        ],
        due,
        assessment('180s', false),
      ),
      scenario(
        'evaluation age exactly 90000 milliseconds',
        evidence({ evaluationMs: '60000+0x8' }),
        visible,
      ),
      scenario('evaluation age 90001 milliseconds', evidence({ evaluationMs: '59999+0x8' }), due),
      scenario(
        'evaluation timestamp one millisecond in the future',
        evidence({ evaluationMs: '150001+0x8' }),
        due,
      ),
      scenario(
        'baseline after evaluation',
        evidence({ baselineMs: '150000+0x8', evaluationMs: '149999+0x8' }),
        due,
      ),
      scenario('scrape age exactly 90 seconds', evidence({ up: '_ _ 1 _ _ _' }), visible),
      {
        ...scenario(
          'stale up with a future scrape sample scheduled',
          evidence({ up: '1 _ _ _ _ 1' }),
          assessment('90s', false),
          assessment('120s'),
          visible,
        ),
        promql_expr_test: [
          {
            expr: `timestamp(up${labelSet(scrapeLabels)})`,
            eval_time: '120s',
            exp_samples: [{ labels: labelSet(scrapeLabels), value: 0 }],
          },
          {
            expr: `timestamp(up${labelSet(scrapeLabels)})`,
            eval_time: '150s',
            exp_samples: [{ labels: labelSet(scrapeLabels), value: 150 }],
          },
        ],
      },
      ...['-1', '0.5', '2', 'NaN'].map((value) =>
        scenario(`invalid has_measurement ${value}`, evidence({ measured: `${value}+0x8` }), due),
      ),
      ...core.map((metric) =>
        scenario(
          `missing ${metric}`,
          evidence().filter(({ series }) => !series.startsWith(metric + '{')),
          due,
        ),
      ),
      ...['up', ...core].flatMap((metric) => [
        scenario(`wrong job for ${metric}`, labelFault(metric, 'job', 'other', false), due),
        scenario(
          `wrong instance for ${metric}`,
          labelFault(metric, 'instance', '10.1.0.3:19101', false),
          due,
        ),
        scenario(
          `other target cannot confirm ${metric}`,
          labelFault(metric, 'target', 'foreign', false),
          due,
        ),
        scenario(
          `other target does not conflict with ${metric}`,
          labelFault(metric, 'target', 'foreign', true),
          visible,
        ),
        scenario(`conflicting job for ${metric}`, labelFault(metric, 'job', 'other', true), due),
        scenario(
          `conflicting instance for ${metric}`,
          labelFault(metric, 'instance', '10.1.0.3:19101', true),
          due,
        ),
      ]),
      ...core.flatMap((metric) => [
        scenario(
          `wrong enrollment for ${metric}`,
          labelFault(metric, 'enrollment', 'f'.repeat(64), false),
          due,
        ),
        scenario(
          `conflicting enrollment for ${metric}`,
          labelFault(metric, 'enrollment', 'f'.repeat(64), true),
          due,
        ),
      ]),
      scenario(
        'complete evidence for another target cannot confirm the expected target',
        evidence().map(({ series, values }) => ({
          series: series.replace(`target="${key}"`, 'target="foreign"'),
          values,
        })),
        due,
      ),
      scenario(
        'duplicate exact baseline and evaluation selectors',
        [
          ...evidence(),
          sample(evaluation, '0+30000x8', { ...wireLabels, extra: 'duplicate' }),
          sample(baseline, '0+0x8', { ...wireLabels, extra: 'duplicate' }),
        ],
        due,
      ),
    ],
  };
}

/** A 1001ms instant needs rounding after conversion from PromQL's seconds. */
function precisionFixture() {
  const interval = '1001ms';
  return {
    rule_files: ['registry-pressure.rules.yaml'],
    evaluation_interval: interval,
    tests: [
      {
        ...scenario(
          'fractional seconds clock at exact integer-millisecond deadline',
          evidence({ evaluationMs: '0 1000', baselineMs: '-298999 -298999' }),
          assessment('0s', false),
          assessment(interval),
        ),
        interval,
      },
    ],
  };
}

if (import.meta.main) {
  try {
    const root = process.argv.at(2);
    // Proof: dropping either CLI condition failed the extra-root or blank-root fixture.
    if (process.argv.length !== 3 || !root?.trim())
      throw new Error('Usage: pressure-rules.ts <root>');
    console.log((await testRegistryPressureRules(root)).trimEnd());
  } catch (failure) {
    console.error(failure);
    process.exitCode = 1;
  }
}
