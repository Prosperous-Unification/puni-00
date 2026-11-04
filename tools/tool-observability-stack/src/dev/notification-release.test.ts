import { createHash } from 'node:crypto';

import { expect, test } from 'bun:test';
import { parse } from 'yaml';

import fixture from '../../fixtures/runtime.json';
import { renderNotificationRelease, validateNotificationRelease } from './notification-release';
import { validateRuntimeSnapshot } from './runtime';

const commit = 'a'.repeat(40);
const directory = '/home/monitor/puni-dev-observability/releases/slack-' + commit;
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');

function observation() {
  const rendered = renderNotificationRelease(commit);
  return {
    directory,
    mountedPath: directory + '/alertmanager.yaml',
    manifest: JSON.parse(rendered.files['manifest.json']) as Record<string, unknown>,
    actual: {
      'alertmanager.yaml': hash(rendered.files['alertmanager.yaml']),
      'compose.slack.json': hash(rendered.files['compose.slack.json']),
    },
  };
}

test('notification release mounts only the authorized versioned configuration and retained Alertmanager volume', () => {
  const rendered = renderNotificationRelease(commit);
  expect(rendered.directory).toBe(directory);
  expect(Object.keys(rendered.files).sort()).toEqual([
    'alertmanager.yaml',
    'compose.slack.json',
    'manifest.json',
  ]);
  expect(JSON.parse(rendered.files['compose.slack.json'])).toEqual({
    services: {
      alertmanager: {
        volumes: [
          'alertmanager:/alertmanager',
          directory + '/alertmanager.yaml:/etc/puni/alertmanager.yaml:ro',
        ],
      },
    },
  });
  const configuration: unknown = parse(rendered.files['alertmanager.yaml']);
  expect(configuration).toMatchObject({
    route: { receiver: 'slack-puni' },
    receivers: [
      {
        name: 'slack-puni',
        slack_configs: [
          {
            channel: '#puni-alerts',
            api_url_file: '/alertmanager/secrets/slack-webhook',
            send_resolved: true,
          },
        ],
      },
    ],
  });
  expect(rendered.files['alertmanager.yaml']).not.toContain('hooks.slack.com');
  const manifest: unknown = JSON.parse(rendered.files['manifest.json']);
  expect(manifest).toMatchObject({
    purpose: 'puni-alerts/1',
    sourceCommit: commit,
    environment: 'dev',
    host: 'h3mon',
    project: 'puni-dev-observability',
  });
});

for (const source of ['', '../outside', 'A'.repeat(40), 'a'.repeat(39), 'a'.repeat(41)])
  test('notification renderer refuses invalid source identity ' + source.slice(0, 12), () => {
    expect(() => renderNotificationRelease(source)).toThrow();
  });

test('actual mounted notification release is verified against current rendered bytes', () => {
  expect(validateNotificationRelease(observation())).toEqual({
    sourceCommit: commit,
    directory,
    mountedPath: directory + '/alertmanager.yaml',
  });
});

for (const [fault, change] of [
  [
    'changed configuration',
    (input: ReturnType<typeof observation>) => {
      input.actual['alertmanager.yaml'] = '0'.repeat(64);
    },
  ],
  [
    'changed overlay',
    (input: ReturnType<typeof observation>) => {
      input.actual['compose.slack.json'] = '0'.repeat(64);
    },
  ],
  [
    'forged matching hashes',
    (input: ReturnType<typeof observation>) => {
      input.actual['alertmanager.yaml'] = '0'.repeat(64);
      Object.assign(input.manifest, { files: { ...input.actual } });
    },
  ],
  [
    'changed manifest hash',
    (input: ReturnType<typeof observation>) => {
      Object.assign(input.manifest, {
        files: { ...input.actual, 'alertmanager.yaml': '0'.repeat(64) },
      });
    },
  ],
  [
    'foreign mount',
    (input: ReturnType<typeof observation>) => {
      input.mountedPath = '/untrusted/alertmanager.yaml';
    },
  ],
  [
    'foreign directory',
    (input: ReturnType<typeof observation>) => {
      input.directory = '/untrusted';
    },
  ],
  [
    'missing manifest',
    (input: ReturnType<typeof observation>) => {
      Object.assign(input, { manifest: null });
    },
  ],
  [
    'foreign source',
    (input: ReturnType<typeof observation>) => {
      Object.assign(input.manifest, { sourceCommit: 'b'.repeat(40) });
    },
  ],
  [
    'foreign purpose',
    (input: ReturnType<typeof observation>) => {
      Object.assign(input.manifest, { purpose: 'foreign' });
    },
  ],
  [
    'extra files',
    (input: ReturnType<typeof observation>) => {
      Object.assign(input.actual, { 'foreign.yaml': '0'.repeat(64) });
    },
  ],
] as const)
  test('notification release refuses ' + fault + ' before adoption', () => {
    const input = observation();
    change(input);
    expect(() => validateNotificationRelease(input)).toThrow();
  });

const observedNow = Math.max(fixture.h1.observedAt, fixture.h3.observedAt) + 1;
for (const [name, proof] of [
  ['missing', undefined],
  ['null', null],
  ['false', false],
  ['empty', {}],
] as const)
  test('runtime preflight refuses absent or invalid notification release: ' + name, () => {
    const monitor = { ...fixture.h3 };
    if (proof === undefined) Reflect.deleteProperty(monitor, 'notificationRelease');
    else Object.assign(monitor, { notificationRelease: proof });
    expect(() => validateRuntimeSnapshot(monitor, fixture.h1, observedNow)).toThrow();
  });

test('runtime preflight exposes only an actually mounted policy-verified notification release', () => {
  const monitor = { ...fixture.h3, notificationRelease: observation() };
  const verified = validateRuntimeSnapshot(monitor, fixture.h1, observedNow);
  expect(verified.notificationRelease).toEqual({
    sourceCommit: commit,
    directory,
    mountedPath: directory + '/alertmanager.yaml',
  });
});
