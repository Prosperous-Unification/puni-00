import { createHash } from 'node:crypto';

import { type } from 'arktype';
import { stringify } from 'yaml';

import { createDevConfiguration, renderDevConfiguration } from '../dev/configuration';

const job = 'registry-pressure-observer';
const rulePath = '/etc/puni/registry-pressure.rules.yaml';
const ruleFile = 'registry-pressure.rules.yaml';
// Proof: changing the declared mount to read-write failed the overlay contract test.
const mount = './registry-pressure.rules.yaml:/etc/puni/registry-pressure.rules.yaml:ro';
// Proof: widening either text bound failed the empty registry ID or oversized storage ID test.
const targetText = type('1 <= string <= 256');
// Proof: bypassing validation or relaxing either exact-object boundary admitted the extra-key inventory tests.
const Enrollment = type({
  target: {
    // Proof: removing this pattern admitted the nonhex machine ID fixture.
    machineId: /^[a-f0-9]{32}$/,
    registryId: targetText,
    storageId: targetText,
    registryPath: targetText,
    '+': 'reject',
  },
  enrolledAt: 'string',
  // Proof: removing the environment pattern admitted the non-ASCII inventory fixture.
  environment: /^[a-z][a-z0-9-]{0,63}$/,
  // Proof: removing the address pattern admitted a three-octet address.
  // Removing the port text cap admitted a six-digit port with a valid numeric value.
  address: /^(?:0|[1-9][0-9]{0,2})(?:\.(?:0|[1-9][0-9]{0,2})){3}:[0-9]{1,5}$/,
  '+': 'reject',
});

/** Reads an exact, explicit enrollment before any configuration is emitted. */
function parseEnrollment(inventory: unknown) {
  const enrollment = Enrollment.assert(inventory);
  // Proof: removing the Date round trip admitted the non-canonical timestamp fixture.
  if (new Date(enrollment.enrolledAt).toJSON() !== enrollment.enrolledAt)
    throw new Error('registry pressure enrollment requires a canonical Date');

  const [host, portText] = enrollment.address.split(':');
  const octets = host.split('.').map(Number);
  const [first, second] = octets;
  const port = Number(portText);
  // Proof: removing the octet cap, private range or either 172 range bound admitted each invalid address.
  if (
    octets.some((octet) => octet > 255) ||
    !(
      first === 10 ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    )
  )
    throw new Error('registry pressure observer requires an RFC1918 IPv4 address');
  // Proof: removing either port bound admitted 0 or 65536 respectively.
  if (!(port >= 1 && port <= 65535))
    throw new Error('registry pressure observer requires a port from 1 through 65535');
  return enrollment;
}

/** Independent expected target keeps the alert series alive when observation evidence vanishes. */
function renderRule(target: string, environment: string, address: string): string {
  // Proof: dropping either identity matcher allowed the native wrong-job or wrong-instance scenario to confirm.
  const labels = `job="${job}",instance="${address}"`;
  const up = `up{${labels}}`;
  const onlyOne = (metric: string) => `count by(target) (${metric}) == 1`;
  // Count each core gauge before comparing two vectors. Conflicting series under a target
  // must withhold confirmation even if one has the matching exporter labels.
  // Proof: removing enrollment matching or relaxing any of the three counts failed the corresponding native wrong/conflicting enrollment cases.
  const core = (name: string) => {
    const metric = `registry_pressure_${name}`;
    return `(${metric}{${labels},enrollment="${target}"} and on(target) (${onlyOne(metric)}))`;
  };
  const evaluation = core('evaluation_timestamp_milliseconds');
  const baseline = core('baseline_timestamp_milliseconds');
  const measurement = core('has_measurement');
  // Proof: removing round failed the native deadline-equality fixture at 1001ms with a valid evaluation at 1000ms.
  const now = 'scalar(round(vector(time()*1000)))';
  // Plain instant selectors only see samples at or before evaluation. The pinned native
  // timestamp fixture verifies this behavior when an up sample is scheduled in the future.
  const confirming = [
    // Proof: removing the up value or making it boolean failed native scrape-loss confirmation.
    `(${up} == 1)`,
    // Proof: removing the count allowed a conflicting instance to confirm the target.
    `(${onlyOne('up')})`,
    // Proof: removing the age filter failed the stale-up fixture. Making it strict failed exact age 90s.
    `(time() - timestamp(${up}) <= 90)`,
    // Proof: widening the value domain admitted 0.5, omitting it admitted missing measurement,
    // and requiring 1 alone failed the initial enrollment grace fixture.
    `(${measurement} == 0 or ${measurement} == 1)`,
    // Proof: removing either evaluation age bound failed the future or stale fixtures respectively.
    // Substituting scrape time for evaluation failed the missing-evaluation fixture.
    `(${evaluation} <= ${now})`,
    `(${evaluation} >= ${now} - 90000)`,
    // Proof: removing ordering admitted a baseline after evaluation. Substituting evaluation
    // for baseline failed the missing-baseline fixture.
    `(${baseline} <= on(target) ${evaluation})`,
    // Proof: removing the deadline or accepting equality failed the original-deadline fixture.
    `(${now} < ${baseline} + 300000)`,
  ];
  return stringify({
    groups: [
      {
        name: 'registry-pressure-observation',
        rules: [
          {
            // Proof: adding a 30s delay failed the first expected-only native assessment.
            alert: 'RegistryPressureObservationUnavailable',
            // Proof: replacing the expected anchor with sum(up) failed when no series existed.
            // Unscoped subtraction let a complete foreign target silence the expected alert.
            expr:
              `label_replace(vector(1), "target", "${target}", "", "")\n` +
              `unless on(target) (\n  ${confirming.join('\n  and on(target) ')}\n)\n`,
            // Proof: changing environment, service or severity separately failed exact native labels.
            labels: { environment, service: 'registry', severity: 'warning' },
            annotations: {
              summary: 'Registry pressure observation reporting is unavailable',
              // Proof: omitting the enrollment key failed the exact native alert annotation.
              description: `Enrollment ${target}. Resolution means reporting is visible within its original deadline. Capacity recovery, write access and Slack receipt require separate evidence.`,
            },
          },
        ],
      },
    ],
  });
}

/** Stages only the opted-in private scrape job, inline rule and additional read-only rule mount. */
export function renderRegistryPressureOverlay(inventory: unknown): {
  files: Record<string, string>;
  prometheusMount: typeof mount;
} {
  const { address, enrolledAt, environment, target } = parseEnrollment(inventory);
  const { machineId, registryId, storageId, registryPath } = target;
  // Proof: swapping the registry and storage tuple members changed the pinned wire key.
  const key = createHash('sha256')
    .update(JSON.stringify([machineId, registryId, storageId, registryPath, enrolledAt]))
    .digest('hex');

  const defaults = createDevConfiguration();
  // Proof: bypassing the default renderer lost unchanged files in the overlay contract test.
  const files = renderDevConfiguration(defaults);
  const { prometheus } = defaults;
  files['prometheus.yaml'] = stringify({
    ...prometheus,
    // Proof: removing the rule reference or existing scrape configs failed the candidate comparison.
    rule_files: [...prometheus.rule_files, rulePath],
    scrape_configs: [
      ...prometheus.scrape_configs,
      {
        job_name: job,
        // Proof: changing the path, interval, timeout or any limit independently failed the candidate comparison.
        metrics_path: '/metrics',
        scrape_interval: '30s',
        scrape_timeout: '5s',
        body_size_limit: '16KiB',
        sample_limit: 16,
        label_limit: 8,
        label_name_length_limit: 64,
        label_value_length_limit: 256,
        // Proof: toggling label, timestamp or redirect behavior independently failed the candidate comparison.
        honor_labels: false,
        honor_timestamps: false,
        follow_redirects: false,
        // Proof: changing the target key failed the candidate comparison.
        static_configs: [{ targets: [address], labels: { target: key } }],
      },
    ],
  });
  files[ruleFile] = renderRule(key, environment, address);
  return { files, prometheusMount: mount };
}
