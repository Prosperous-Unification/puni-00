import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { afterAll, expect, test } from 'bun:test';

import { readEmailDelivery } from './email-delivery-config';

const directory = mkdtempSync(join(tmpdir(), 'wbs-email-config-'));
const caFile = join(directory, 'ca.pem');
const generation = Bun.spawnSync([
  'openssl',
  'req',
  '-x509',
  '-newkey',
  'rsa:2048',
  '-nodes',
  '-keyout',
  join(directory, 'key.pem'),
  '-out',
  caFile,
  '-days',
  '2',
  '-subj',
  '/CN=relay.test',
  '-addext',
  'subjectAltName=DNS:relay.test',
]);
if (generation.exitCode !== 0) throw new Error('test certificate generation failed');
afterAll(() => {
  rmSync(directory, { recursive: true, force: true });
});
const valid = {
  WBS_SMTP_HOST: '127.0.0.1',
  WBS_SMTP_PORT: '465',
  WBS_SMTP_TLS: 'implicit',
  WBS_SMTP_SERVER_NAME: 'relay.test',
  WBS_SMTP_CA_FILE: caFile,
  WBS_SMTP_EHLO: 'wbs.test',
  WBS_SMTP_FROM: 'sender@example.test',
  WBS_SMTP_AUTH: 'none',
};

test('all SMTP variables absent model disabled without reading trust', () => {
  expect(readEmailDelivery({})).toEqual({ kind: 'disabled' });
});
test('complete explicit TLS/no-auth settings load the configured trust only', () => {
  expect(readEmailDelivery(valid)).toMatchObject({
    kind: 'smtp',
    host: '127.0.0.1',
    port: 465,
    serverName: 'relay.test',
    ehlo: 'wbs.test',
    from: 'sender@example.test',
    auth: { kind: 'none' },
    ca: readFileSync(caFile, 'utf8'),
  });
});
for (const field of Object.keys(valid))
  test(`present incomplete SMTP refuses missing ${field}`, () => {
    const partial = Object.fromEntries(Object.entries(valid).filter(([name]) => name !== field));
    expect(() => readEmailDelivery(partial)).toThrow('invalid email delivery configuration');
    expect(() => readEmailDelivery({ [field]: '' })).toThrow(
      'invalid email delivery configuration',
    );
  });
for (const [field, value] of [
  ['WBS_SMTP_HOST', 'smtp://relay.test'],
  ['WBS_SMTP_PORT', '0'],
  ['WBS_SMTP_PORT', '65536'],
  ['WBS_SMTP_PORT', '1.5'],
  ['WBS_SMTP_TLS', 'starttls'],
  ['WBS_SMTP_SERVER_NAME', 'bad\r\nname'],
  ['WBS_SMTP_EHLO', 'bad name'],
  ['WBS_SMTP_FROM', 'sender@example.test,other@example.test'],
  ['WBS_SMTP_FROM', 'sender@example.test\r\nBcc:x@example.test'],
  ['WBS_SMTP_HOST', 'relay.test\n'],
  ['WBS_SMTP_SERVER_NAME', 'relay.test\n'],
  ['WBS_SMTP_EHLO', 'wbs.test\n'],
  ['WBS_SMTP_FROM', 'sender@example.test\n'],
  ['WBS_SMTP_AUTH', 'auto'],
  ['WBS_SMTP_CA_FILE', relative(process.cwd(), caFile)],
  ['WBS_SMTP_FROM', 'Sender@example.test'],
  ['WBS_SMTP_FROM', `${'a'.repeat(65)}@example.test`],
  ['WBS_SMTP_FROM', 'bad..local@example.test'],
  ['WBS_SMTP_SERVER_NAME', `${'x'.repeat(64)}.test`],
  ['WBS_SMTP_FROM', `${'a'.repeat(64)}@${Array(3).fill('x'.repeat(63)).join('.')}`],
  ['WBS_SMTP_SERVER_NAME', Array(4).fill('x'.repeat(63)).join('.')],
  ['WBS_SMTP_SERVER_NAME', 'relay'],
])
  test(`malformed ${field} cannot opt into fallback`, () => {
    expect(() => readEmailDelivery({ ...valid, [field]: value })).toThrow(
      'invalid email delivery configuration',
    );
  });
test('PLAIN requires explicit nonempty credentials and none forbids credentials', () => {
  expect(
    readEmailDelivery({
      ...valid,
      WBS_SMTP_AUTH: 'plain',
      WBS_SMTP_USERNAME: 'fixture-user',
      WBS_SMTP_PASSWORD: 'fixture-password',
    }),
  ).toMatchObject({
    auth: { kind: 'plain', username: 'fixture-user', password: 'fixture-password' },
  });
  for (const credentials of [
    {},
    { WBS_SMTP_USERNAME: 'fixture-user' },
    { WBS_SMTP_PASSWORD: 'fixture-password' },
    { WBS_SMTP_USERNAME: '', WBS_SMTP_PASSWORD: 'fixture-password' },
    { WBS_SMTP_USERNAME: 'fixture-user', WBS_SMTP_PASSWORD: 'bad\0password' },
    { WBS_SMTP_USERNAME: 'fixture-user', WBS_SMTP_PASSWORD: 'x'.repeat(4097) },
  ]) {
    expect(() => readEmailDelivery({ ...valid, WBS_SMTP_AUTH: 'plain', ...credentials })).toThrow(
      'invalid email delivery configuration',
    );
  }
  expect(() => readEmailDelivery({ ...valid, WBS_SMTP_USERNAME: 'fixture-user' })).toThrow(
    'invalid email delivery configuration',
  );
});
for (const fault of [
  'absent',
  'unreadable',
  'empty',
  'malformed',
  'malformed-pem',
  'extra-pem-text',
] as const)
  test(`configured ${fault} CA is a boot boundary failure`, () => {
    const path = join(directory, `${fault}.pem`);
    if (fault !== 'absent')
      writeFileSync(
        path,
        fault === 'empty'
          ? ''
          : fault === 'malformed'
            ? 'not a certificate'
            : fault === 'malformed-pem'
              ? '-----BEGIN CERTIFICATE-----\nnot-a-der-certificate\n-----END CERTIFICATE-----'
              : fault === 'extra-pem-text'
                ? `${readFileSync(caFile, 'utf8')}\nuntrusted extra text`
                : readFileSync(caFile),
      );
    if (fault === 'unreadable') chmodSync(path, 0);
    try {
      expect(() => readEmailDelivery({ ...valid, WBS_SMTP_CA_FILE: path })).toThrow(
        'invalid email delivery configuration',
      );
    } finally {
      if (fault === 'unreadable') chmodSync(path, 0o600);
    }
  });
test('configuration errors never disclose supplied credentials or raw causes', () => {
  let message = '';
  try {
    readEmailDelivery({
      ...valid,
      WBS_SMTP_AUTH: 'plain',
      WBS_SMTP_USERNAME: 'fixture-secret-user',
      WBS_SMTP_PASSWORD: 'fixture-secret-password',
      WBS_SMTP_CA_FILE: '/missing/private-ca-name.pem',
    });
  } catch (failure) {
    message = String(failure);
    expect(failure).not.toHaveProperty('cause');
  }
  expect(message).toContain('invalid email delivery configuration');
  for (const secret of ['fixture-secret-user', 'fixture-secret-password', 'private-ca-name'])
    expect(message).not.toContain(secret);
});
