import { expect, test } from 'bun:test';
import { parse } from 'yaml';

import { createDevConfiguration, renderDevConfiguration } from './configuration';
import { renderDevCompose } from './deployment';

const notification = {
  api_url_file: '/alertmanager/secrets/slack-webhook',
  channel: '#puni-alerts',
  send_resolved: true,
  title: '[{{ .Status | toUpper }}] {{ .CommonLabels.alertname }}',
  text: '{{ range .Alerts }}*{{ .Annotations.summary }}*\n{{ .Annotations.description }}\nSeverity: {{ .Labels.severity }} | Environment: {{ .Labels.environment }} | Service: {{ .Labels.service }}\n{{ end }}',
};
const receiver = { name: 'slack-puni', slack_configs: [notification] };

test('normal rendering preserves the authorized Slack receiver across repeated deployments', () => {
  for (let revision = 0; revision < 2; revision++) {
    const files = renderDevConfiguration();
    const rendered: unknown = parse(files['alertmanager.yaml']);
    expect(rendered).toMatchObject({
      route: { receiver: 'slack-puni' },
      receivers: [receiver],
    });
    expect(files['alertmanager.yaml']).not.toContain('hooks.slack.com');
    expect(files['alertmanager.yaml']).not.toContain('api_url:');
  }
  expect(renderDevCompose().services['alertmanager'].volumes).toContain(
    'alertmanager:/alertmanager',
  );
});

for (const [name, changed] of [
  [
    'local-only fallback',
    { route: { receiver: 'local-only' }, receivers: [{ name: 'local-only' }] },
  ],
  ['missing Slack notification', { receivers: [{ name: 'slack-puni' }] }],
  ['foreign receiver name', { receivers: [{ ...receiver, name: 'foreign' }] }],
  [
    'foreign channel',
    { receivers: [{ ...receiver, slack_configs: [{ ...notification, channel: '#foreign' }] }] },
  ],
  [
    'foreign secret path',
    {
      receivers: [
        { ...receiver, slack_configs: [{ ...notification, api_url_file: '/untrusted/webhook' }] },
      ],
    },
  ],
  [
    'missing secret path',
    {
      receivers: [
        {
          ...receiver,
          slack_configs: [
            {
              channel: '#puni-alerts',
              send_resolved: true,
              title: notification.title,
              text: notification.text,
            },
          ],
        },
      ],
    },
  ],
  [
    'inline webhook',
    {
      receivers: [
        {
          ...receiver,
          slack_configs: [{ ...notification, api_url: 'https://example.invalid/private' }],
        },
      ],
    },
  ],
  [
    'disabled recovery',
    { receivers: [{ ...receiver, slack_configs: [{ ...notification, send_resolved: false }] }] },
  ],
  [
    'extra Slack notification',
    { receivers: [{ ...receiver, slack_configs: [notification, notification] }] },
  ],
  ['extra receiver', { receivers: [receiver, { name: 'local-only' }] }],
  [
    'extra notification transport',
    { receivers: [{ ...receiver, webhook_configs: [{ url: 'https://example.invalid' }] }] },
  ],
  ['foreign route', { route: { receiver: 'foreign' } }],
  ['nested route override', { route: { routes: [{ receiver: 'foreign' }] } }],
  ['HTTP proxy override', { global: { http_config: { proxy_url: 'https://example.invalid' } } }],
] as const)
  test('renderer refuses ' + name + ' before emitting deployment files', () => {
    const configuration = createDevConfiguration();
    const target = configuration.alertmanager;
    if ('receivers' in changed) Object.assign(target, { receivers: changed.receivers });
    if ('route' in changed) Object.assign(target.route, changed.route);
    if ('global' in changed) Object.assign(target.global, changed.global);
    expect(() => renderDevConfiguration(configuration)).toThrow(/recipient/);
  });
