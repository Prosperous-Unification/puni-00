import { createHash } from 'node:crypto';

import { describe, expect, it } from 'bun:test';
import { parse } from 'yaml';

import { createDevConfiguration, renderDevConfiguration } from '../dev/configuration';
import { renderDevCompose } from '../dev/deployment';
import { renderRegistryPressureOverlay } from './pressure';

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
const wireKey = 'db887fe73e15bd479cd1c847d73dca4fa1b697c42d795dba847a546bfffd0fbc';

describe('registry pressure overlay', () => {
  it('renders just the private scrape job, matched wire identity and read-only rule mount', () => {
    const configuration = createDevConfiguration();
    const defaults = renderDevConfiguration(configuration);
    const topology = renderDevCompose();
    const overlay = renderRegistryPressureOverlay(enrollment);
    const { prometheus, ...admissionAndReceiver } = configuration;
    const {
      'prometheus.yaml': candidate,
      'registry-pressure.rules.yaml': rule,
      ...rest
    } = overlay.files;
    const { 'prometheus.yaml': _original, ...unchanged } = defaults;
    expect(rest).toEqual(unchanged);
    expect(renderDevConfiguration(configuration)).toEqual(defaults);
    expect(createDevConfiguration()).toEqual({ prometheus, ...admissionAndReceiver });
    expect(renderDevCompose()).toEqual(topology);
    expect(Object.keys(overlay.files).sort()).toEqual(
      [...Object.keys(defaults), 'registry-pressure.rules.yaml'].sort(),
    );

    const { machineId, registryId, storageId, registryPath } = enrollment.target;
    expect(
      createHash('sha256')
        .update(
          JSON.stringify([machineId, registryId, storageId, registryPath, enrollment.enrolledAt]),
        )
        .digest('hex'),
    ).toBe(wireKey);
    expect(parse(candidate)).toEqual({
      ...prometheus,
      rule_files: [...prometheus.rule_files, '/etc/puni/registry-pressure.rules.yaml'],
      scrape_configs: [
        ...prometheus.scrape_configs,
        {
          job_name: 'registry-pressure-observer',
          metrics_path: '/metrics',
          scrape_interval: '30s',
          scrape_timeout: '5s',
          body_size_limit: '16KiB',
          sample_limit: 16,
          label_limit: 8,
          label_name_length_limit: 64,
          label_value_length_limit: 256,
          honor_labels: false,
          honor_timestamps: false,
          follow_redirects: false,
          static_configs: [{ targets: ['10.1.0.2:19101'], labels: { target: wireKey } }],
        },
      ],
    });
    expect(overlay.prometheusMount).toBe(
      './registry-pressure.rules.yaml:/etc/puni/registry-pressure.rules.yaml:ro',
    );
    expect(rule).toContain('unless on(target)');
    expect(rule).toContain(`enrollment="${wireKey}"`);
    for (const raw of [machineId, registryId, storageId, registryPath, enrollment.enrolledAt]) {
      expect(rule).not.toContain(JSON.stringify(raw));
      expect(candidate).not.toContain(JSON.stringify(raw));
    }
  });

  it.each([
    ['absent', undefined],
    ['empty', {}],
    ['null', null],
    ['array', [enrollment]],
    ['extra inventory key', { ...enrollment, secondTarget: enrollment.target }],
    ['extra target key', { ...enrollment, target: { ...enrollment.target, host: 'extra' } }],
    ['missing target', { ...enrollment, target: undefined }],
    ['missing date', { ...enrollment, enrolledAt: undefined }],
    ['missing environment', { ...enrollment, environment: undefined }],
    ['missing address', { ...enrollment, address: undefined }],
    [
      'wrong machine-id length',
      { ...enrollment, target: { ...enrollment.target, machineId: 'a'.repeat(31) } },
    ],
    [
      'nonlowercase machine id',
      { ...enrollment, target: { ...enrollment.target, machineId: 'A'.repeat(32) } },
    ],
    [
      'nonhex machine id',
      { ...enrollment, target: { ...enrollment.target, machineId: 'g'.repeat(32) } },
    ],
    ['empty registry id', { ...enrollment, target: { ...enrollment.target, registryId: '' } }],
    [
      'oversized storage id',
      { ...enrollment, target: { ...enrollment.target, storageId: 'x'.repeat(257) } },
    ],
    [
      'oversized registry path',
      { ...enrollment, target: { ...enrollment.target, registryPath: '/'.repeat(257) } },
    ],
    ['non-date', { ...enrollment, enrolledAt: 'yesterday' }],
    ['non-canonical date', { ...enrollment, enrolledAt: '2026-11-01T00:00:00Z' }],
    ['invalid day normalized by Date', { ...enrollment, enrolledAt: '2026-11-31T00:00:00.000Z' }],
    ['empty environment', { ...enrollment, environment: '' }],
    ['injected line in environment', { ...enrollment, environment: 'prod\n' }],
    ['non-ASCII environment', { ...enrollment, environment: 'prod-β' }],
    ['oversized environment', { ...enrollment, environment: 'a'.repeat(65) }],
    ['environment starts with number', { ...enrollment, environment: '1prod' }],
    ['uppercase environment', { ...enrollment, environment: 'PROD' }],
  ])('refuses %s inventory before rendering', (_name, inventory) => {
    expect(() => {
      renderRegistryPressureOverlay(inventory);
    }).toThrow();
  });

  it.each([
    '1.1.1.1:19101',
    '127.0.0.1:19101',
    '0.0.0.0:19101',
    '10.1.0.2:0',
    '10.1.0.2:65536',
    '10.1.0.2:000001',
    '10.1.0.2:-1',
    '10.1.0.2:',
    '10.1.0.2',
    '10.1.0:19101',
    '10.1.0.02:19101',
    '10.1.0.256:19101',
    '172.15.0.2:19101',
    '172.32.0.2:19101',
    '192.169.0.2:19101',
    'http://10.1.0.2:19101',
    'observer:19101',
    'user:password@10.1.0.2:19101',
    '10.1.0.2:19101/scrape',
    '[::1]:19101',
    '10.1.0.2:19101\n',
  ])('refuses address %s', (address) => {
    expect(() => {
      renderRegistryPressureOverlay({ ...enrollment, address });
    }).toThrow();
  });

  it.each([
    '10.255.255.254:1',
    '172.16.0.2:65535',
    '172.31.0.2:80',
    '192.168.0.2:443',
    '10.1.0.2:00001',
  ])('accepts explicit RFC1918 address %s', (address) => {
    expect(
      renderRegistryPressureOverlay({ ...enrollment, address }).files['prometheus.yaml'],
    ).toContain(address);
  });

  it('accepts full bounds and emits the requested non-default environment', () => {
    const environment = 'x' + '-'.repeat(62) + '0';
    const rule = renderRegistryPressureOverlay({
      ...enrollment,
      target: { ...enrollment.target, registryId: 'x', storageId: 'x'.repeat(256) },
      environment,
    }).files['registry-pressure.rules.yaml'];
    expect(rule).toContain(`environment: ${environment}`);
  });
});
