import { X509Certificate } from 'node:crypto';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scratchAsync } from '@tools/test-scratch';
import { expect, it } from 'bun:test';

import { createBackupIdentity, provisionBackupIdentity } from './backup-identity';
import { cliEnvironment } from './cli.fixture';

it('creates a disposable CA and matching S3 service identity', async () => {
  const directory = await scratchAsync('backup-identity-');
  const identity = await createBackupIdentity(directory);
  const authority = new X509Certificate(await readFile(identity.ca));
  const server = new X509Certificate(await readFile(identity.certificate));
  expect(authority.ca).toBe(true);
  expect(server.verify(authority.publicKey)).toBe(true);
  expect(server.checkHost('object-store.puni-backup.svc')).toBe('object-store.puni-backup.svc');
  expect(identity.key).toBe(join(directory, 'tls.key'));
});
it('refuses a failed certificate command before declaring an identity', async () => {
  const directory = await scratchAsync('backup-identity-failure-');
  expect(
    createBackupIdentity(directory, () => ({
      exitCode: 42,
      stdout: new Uint8Array(),
      stderr: new TextEncoder().encode('injected openssl refusal'),
    })),
  ).rejects.toThrow('certificate command failed');
});

it('issues a CA and server chain accepted by strict X509 verification', async () => {
  const identity = await createBackupIdentity(await scratchAsync('backup-identity-strict-'));
  const verification = Bun.spawnSync([
    'openssl',
    'verify',
    '-x509_strict',
    '-CAfile',
    identity.ca,
    identity.certificate,
  ]);
  expect(verification.stderr.toString()).toBe('');
  expect(verification.exitCode).toBe(0);
});

it('provisions only the exact disposable backup Secret inputs and propagates create refusal', async () => {
  const identity = await createBackupIdentity(await scratchAsync('backup-provision-'));
  const requests: {
    command: readonly string[];
    resource: {
      kind: string;
      metadata: { namespace?: string; name: string };
      stringData?: Record<string, string>;
    };
  }[] = [];
  await provisionBackupIdentity(identity, (command, input) => {
    requests.push({
      command,
      resource: JSON.parse(input) as (typeof requests)[number]['resource'],
    });
    return Promise.resolve();
  });
  const secrets = requests.filter(({ resource }) => resource.kind === 'Secret');
  expect(
    secrets.map(
      ({ resource }) => `${String(resource.metadata.namespace)}/${resource.metadata.name}`,
    ),
  ).toEqual([
    'puni-backup/object-store-ca',
    'puni-backup/object-store-tls',
    'puni-backup/object-store-root',
    'puni-backup/velero-credentials',
    'puni-backup/velero-repo-credentials',
    'observability/elastic-s3-credentials',
  ]);
  expect(secrets.every(({ command }) => command[0] === 'create')).toBe(true);
  expect(secrets.at(-1)?.resource.stringData?.['ca.crt']).toBe(await readFile(identity.ca, 'utf8'));
  let secretAttempts = 0;
  expect(
    provisionBackupIdentity(identity, (command) => {
      if (command[0] === 'create') {
        secretAttempts++;
        return Promise.reject(new Error('existing Secret refuses'));
      }
      return Promise.resolve();
    }),
  ).rejects.toThrow('existing Secret refuses');
  expect(secretAttempts).toBe(1);
});

it('the identity CLI requires its owned disposable directory', () => {
  const execution = Bun.spawnSync(['bun', join(import.meta.dir, 'backup-identity.ts')], {
    env: cliEnvironment(),
  });
  expect(execution.exitCode).not.toBe(0);
  expect(
    execution.stderr
      .toString()
      .split('\n')
      .find((line) => line.startsWith('error:')),
  ).toBe('error: Usage: backup-identity.ts <owned-disposable-directory>');
});

it('the identity CLI refuses extra arguments and non-owned state roots', async () => {
  const directory = await scratchAsync('backup-identity-arguments-');
  for (const arguments_ of [[directory, 'extra'], ['/']]) {
    const execution = Bun.spawnSync(
      ['bun', join(import.meta.dir, 'backup-identity.ts'), ...arguments_],
      { env: cliEnvironment() },
    );
    expect(execution.exitCode).not.toBe(0);
    expect(
      execution.stderr
        .toString()
        .split('\n')
        .find((line) => line.startsWith('error:')),
    ).toMatch(/Usage:|owned canonical state/);
  }
});
it('the identity CLI refuses a linked state root and an existing identity', async () => {
  const directory = await scratchAsync('backup-identity-state-');
  const link = join(directory, 'linked');
  await symlink(directory, link);
  const linked = Bun.spawnSync(['bun', join(import.meta.dir, 'backup-identity.ts'), link], {
    env: cliEnvironment(),
  });
  expect(linked.exitCode).not.toBe(0);
  expect(
    linked.stderr
      .toString()
      .split('\n')
      .find((line) => line.startsWith('error:')),
  ).toContain('owned canonical state');
  const identity = join(directory, 'backup-tls');
  await mkdir(identity);
  await writeFile(join(identity, 'tls.key'), 'must-preserve');
  const existing = Bun.spawnSync(['bun', join(import.meta.dir, 'backup-identity.ts'), directory], {
    env: cliEnvironment(),
  });
  expect(existing.exitCode).not.toBe(0);
  expect(existing.stderr.toString()).toContain('EEXIST');
  expect(await readFile(join(identity, 'tls.key'), 'utf8')).toBe('must-preserve');
});
