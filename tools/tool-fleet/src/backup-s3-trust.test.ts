import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { createBackupIdentity } from './backup-identity';
import { requireS3Trust } from './backup-sqlite';
import { cliEnvironment } from './cli.fixture';

it('requires HTTPS in either explicit trust mode', () => {
  for (const mode of ['system-roots', 'system-roots-plus-ca'])
    expect(() =>
      requireS3Trust({ S3_ENDPOINT: 'http://localhost:9000', S3_TRUST_MODE: mode }),
    ).toThrow('HTTPS');
});
it('refuses certificate bypass and unknown modes', () => {
  expect(() =>
    requireS3Trust({
      S3_ENDPOINT: 'https://localhost',
      S3_TRUST_MODE: 'system-roots',
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
    }),
  ).toThrow('certificate bypass');
  expect(() =>
    requireS3Trust({ S3_ENDPOINT: 'https://localhost', S3_TRUST_MODE: 'unknown' }),
  ).toThrow('S3_TRUST_MODE');
});
it('system roots is explicit and needs no private CA', () => {
  expect(requireS3Trust({ S3_ENDPOINT: 'https://localhost', S3_TRUST_MODE: 'system-roots' })).toBe(
    'https://localhost',
  );
});
it('private trust refuses missing unreadable empty and malformed CA distinctly', async () => {
  const directory = await scratchAsync('s3-ca-');
  const ca = join(directory, 'ca.crt');
  const env = {
    S3_ENDPOINT: 'https://localhost',
    S3_TRUST_MODE: 'system-roots-plus-ca',
    NODE_EXTRA_CA_CERTS: ca,
  };
  expect(() => requireS3Trust(env)).toThrow('missing TLS input');
  expect(() => requireS3Trust({ ...env, NODE_EXTRA_CA_CERTS: undefined })).toThrow(
    'missing TLS input',
  );
  const locked = join(directory, 'locked');
  await mkdir(locked, { mode: 0 });
  try {
    expect(() => requireS3Trust({ ...env, NODE_EXTRA_CA_CERTS: join(locked, 'ca.crt') })).toThrow(
      'unreadable TLS input',
    );
  } finally {
    await chmod(locked, 0o700);
  }
  await writeFile(ca, 'not a certificate');
  await chmod(ca, 0);
  expect(() => requireS3Trust(env)).toThrow('unreadable TLS input');
  await chmod(ca, 0o600);
  expect(() => requireS3Trust(env)).toThrow('malformed TLS input');
  await writeFile(ca, '');
  expect(() => requireS3Trust(env)).toThrow('empty TLS input');
  const identity = await createBackupIdentity(join(directory, 'identity'));
  await writeFile(ca, await readFile(identity.ca));
  expect(requireS3Trust(env)).toBe('https://localhost');
});

it('the production backup runner enforces trust before native S3 access', () => {
  const execution = Bun.spawnSync(['bun', join(import.meta.dir, 'backup-sqlite.ts'), 'verify'], {
    env: {
      ...cliEnvironment(),
      S3_ENDPOINT: 'http://127.0.0.1:1',
      S3_TRUST_MODE: 'system-roots',
      S3_BUCKET: 'fixture',
      S3_REGION: 'us-east-1',
      AWS_ACCESS_KEY_ID: 'fixture',
      AWS_SECRET_ACCESS_KEY: 'fixture',
      BACKUP_DATABASE_NAME: 'fixture',
      BACKUP_PREFIX: 'fixture',
      RESTORE_TARGET_PATH: '/not-created',
    },
  });
  expect(execution.exitCode).not.toBe(0);
  expect(
    execution.stderr
      .toString()
      .split('\n')
      .find((line) => line.startsWith('error:')),
  ).toBe('error: S3 endpoint requires HTTPS');
});

it('public-root mode refuses an ambient private CA override', () => {
  expect(() =>
    requireS3Trust({
      S3_ENDPOINT: 'https://localhost',
      S3_TRUST_MODE: 'system-roots',
      NODE_EXTRA_CA_CERTS: '/unexpected/ca.crt',
    }),
  ).toThrow('system-roots forbids NODE_EXTRA_CA_CERTS');
});
