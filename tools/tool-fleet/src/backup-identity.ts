import { randomBytes } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import type { RunCommand } from './controller';

export interface BackupIdentity {
  readonly ca: string;
  readonly certificate: string;
  readonly key: string;
}

/**
 * Generate a two-day identity inside a disposable lab's owned state, never a persistent CA.
 * The CLI confines ca.crt, tls.crt and tls.key to a fresh backup-tls child of its owned state root; Deploy invokes that file protocol to keep
 * the non-buildable Fleet implementation outside its static dependency graph.
 */
export async function createBackupIdentity(
  directory: string,
  run: RunCommand = (command) => Bun.spawnSync([...command]),
): Promise<BackupIdentity> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const ca = join(directory, 'ca.crt');
  const key = join(directory, 'tls.key');
  const certificate = join(directory, 'tls.crt');
  const authorityKey = join(directory, 'ca.key');
  const request = join(directory, 'server.csr');
  const extensions = join(directory, 'extensions');
  await writeFile(
    extensions,
    'subjectAltName=DNS:object-store.puni-backup.svc,DNS:object-store.puni-backup.svc.cluster.local,DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth\n',
  );
  // Proof: removing CA key usage failed strict X509 chain verification (backup-identity.test.ts).
  for (const arguments_ of [
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      authorityKey,
      '-out',
      ca,
      '-days',
      '2',
      '-subj',
      '/CN=puni-disposable-backup-ca',
      '-addext',
      'basicConstraints=critical,CA:TRUE',
      '-addext',
      'keyUsage=critical,keyCertSign,cRLSign',
    ],
    [
      'req',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      key,
      '-out',
      request,
      '-subj',
      '/CN=object-store.puni-backup.svc',
    ],
    [
      'x509',
      '-req',
      '-in',
      request,
      '-CA',
      ca,
      '-CAkey',
      authorityKey,
      '-CAcreateserial',
      '-out',
      certificate,
      '-days',
      '2',
      '-extfile',
      extensions,
    ],
  ]) {
    const execution = run(['openssl', ...arguments_]);
    // Proof: removing this guard accepted the injected openssl exit 42.
    if (execution.exitCode !== 0)
      throw new Error(
        `Disposable certificate command failed: ${new TextDecoder().decode(execution.stderr)}`,
      );
  }
  return { ca, certificate, key };
}

/**
 * Create backup inputs only in a freshly created, caller-owned disposable cluster.
 * Uses create rather than apply: an existing Secret refuses instead of being overwritten.
 * The caller must finish cluster ownership admission before invoking this prerequisite.
 */
export async function provisionBackupIdentity(
  identity: BackupIdentity,
  kubectl: (arguments_: readonly string[], input: string) => Promise<unknown>,
): Promise<void> {
  const ca = await readFile(identity.ca, 'utf8');
  const user = 'rehearsal';
  const password = randomBytes(32).toString('hex');
  const secrets = [
    { namespace: 'puni-backup', name: 'object-store-ca', values: { 'ca.crt': ca } },
    {
      namespace: 'puni-backup',
      name: 'object-store-tls',
      values: {
        'tls.crt': await readFile(identity.certificate, 'utf8'),
        'tls.key': await readFile(identity.key, 'utf8'),
      },
    },
    {
      namespace: 'puni-backup',
      name: 'object-store-root',
      values: { MINIO_ROOT_USER: user, MINIO_ROOT_PASSWORD: password },
    },
    {
      namespace: 'puni-backup',
      name: 'velero-credentials',
      values: {
        cloud: `[default]\naws_access_key_id=${user}\naws_secret_access_key=${password}\n`,
      },
    },
    {
      namespace: 'puni-backup',
      name: 'velero-repo-credentials',
      values: { 'repository-password': randomBytes(32).toString('hex') },
    },
    {
      namespace: 'observability',
      name: 'elastic-s3-credentials',
      values: {
        's3.client.default.access_key': user,
        's3.client.default.secret_key': password,
        'ca.crt': ca,
      },
    },
  ];
  for (const namespace of ['puni-backup', 'observability']) {
    await kubectl(
      ['apply', '-f', '-'],
      JSON.stringify({ apiVersion: 'v1', kind: 'Namespace', metadata: { name: namespace } }),
    );
  }
  for (const secret of secrets) {
    await kubectl(
      ['create', '-f', '-'],
      JSON.stringify({
        apiVersion: 'v1',
        kind: 'Secret',
        metadata: { namespace: secret.namespace, name: secret.name },
        stringData: secret.values,
      }),
    );
  }
}

if (import.meta.main) {
  const directory = process.argv.at(2);
  // Proof: dropping argument checks lost the missing/extra-argument CLI refusals (backup-identity.test.ts).
  if (directory === undefined || process.argv.length !== 3)
    throw new Error('Usage: backup-identity.ts <owned-disposable-directory>');
  const root = resolve(directory);
  const state = await lstat(root);
  // Proof: removing this guard generated an identity through the symlinked state root.
  if (
    state.isSymbolicLink() ||
    !state.isDirectory() ||
    state.uid !== process.getuid?.() ||
    (await realpath(root)) !== root
  )
    throw new Error('Backup identity requires an owned canonical state directory');
  const output = join(root, 'backup-tls');
  // Proof: allowing recursive mkdir overwrote the existing identity key (backup-identity.test.ts).
  await mkdir(output, { mode: 0o700 });
  await createBackupIdentity(output);
}
