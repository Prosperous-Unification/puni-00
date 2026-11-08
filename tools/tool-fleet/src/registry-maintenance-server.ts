import { constants } from 'node:fs';
import {
  chown,
  lstat,
  open,
  readdir,
  readFile,
  readlink,
  realpath,
  unlink,
} from 'node:fs/promises';
import { join } from 'node:path';

import { type } from 'arktype';
import { parse } from 'yaml';

import type { RegistryMaintenanceInstallation } from './registry-maintenance-installation';
import { verifyRegistryHostArtifact } from './registry-maintenance-installation';
import { awaitMaintenanceChild } from './registry-maintenance-process';
import { consumeRegistryStream } from './registry-stream';

const Configuration = type({
  version: '0.1',
  log: { level: "'error'", '+': 'reject' },
  storage: {
    filesystem: { rootdirectory: 'string > 0', '+': 'reject' },
    delete: { enabled: 'boolean', '+': 'reject' },
    maintenance: {
      readonly: { enabled: 'boolean', '+': 'reject' },
      uploadpurging: { enabled: 'false', '+': 'reject' },
      '+': 'reject',
    },
    '+': 'reject',
  },
  http: { addr: "'127.0.0.1:5051'", '+': 'reject' },
  auth: {
    htpasswd: {
      realm: "'puni-registry-maintenance'",
      path: "'/run/puni-registry-maintenance/auth.htpasswd'",
      '+': 'reject',
    },
    '+': 'reject',
  },
  '+': 'reject',
});

/** Exact installed isolated configuration; unknown middleware/drivers/listeners cannot bypass the authenticated fenced filesystem boundary. */
export function parseRegistryMaintenanceConfiguration(
  input: unknown,
  path: string,
  mode: 'readonly' | 'deletion',
) {
  const parsed = Configuration.assert(input);
  // Proof: path/listener/auth/purger/delete/readonly/middleware faults refuse the production configuration parser.
  if (
    parsed.storage.filesystem.rootdirectory !== path ||
    parsed.storage.delete.enabled !== (mode === 'deletion') ||
    parsed.storage.maintenance.readonly.enabled !== (mode === 'readonly')
  )
    throw new Error('Isolated registry configuration does not match verified action/store');
  return parsed;
}

/** Prove that the exact native child owns the fixed IPv4 loopback listener; an unrelated HTTP200 is never readiness evidence. */
export async function assertRegistryMaintenanceListener(pid: number): Promise<void> {
  if (!Number.isSafeInteger(pid) || pid < 1) throw new Error('Invalid owned registry child');
  const lines = (await readFile('/proc/net/tcp', 'utf8')).trim().split('\n').slice(1);
  const listeners = lines
    .map((line) => line.trim().split(/\s+/))
    .filter((fields) => fields[1] === '0100007F:13BB' && fields[3] === '0A');
  const inode = listeners.at(0)?.[9];
  if (listeners.length !== 1 || inode === undefined || !/^[1-9]\d*$/.test(inode))
    throw new Error('Owned registry listener is not observable');
  const links = await Promise.all(
    (await readdir(`/proc/${String(pid)}/fd`)).map(async (descriptor) => {
      const path = `/proc/${String(pid)}/fd/${descriptor}`;
      try {
        return await readlink(path);
      } catch (cause) {
        if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') {
          try {
            await lstat(path);
          } catch (again) {
            if (again instanceof Error && 'code' in again && again.code === 'ENOENT') return null;
            throw again;
          }
        }
        throw cause;
      }
    }),
  );
  if (!links.includes(`socket:[${inode}]`))
    throw new Error('Fixed registry listener belongs to another process');
}

/**
 * Run only the pinned Distribution serve/ordinary-GC action selected by the installed store.
 * Root owns descendant cleanup; server runs as UID/GID59001 and authenticates only the current
 * operation token via an ephemeral bcrypt file. Tokens never enter argv, diagnostics or receipts.
 * The caller has already independently proved all ordinary writers absent under the same FD.
 * Authentication cleanup follows child/pipe settlement. Execution plus cleanup failure rejects
 * with both ordered causes; successful cleanup preserves the original thrown value.
 */
export async function runRegistryMaintenanceServer(input: {
  installed: RegistryMaintenanceInstallation;
  storage: RegistryMaintenanceInstallation['ordinary'];
  action: 'readonly' | 'deletion' | 'collect';
  token: string;
  descriptor: number;
  signal: AbortSignal;
  ready(receipt: string): Promise<void>;
}): Promise<void> {
  const { installed, storage, signal } = input;
  const mode = input.action === 'readonly' ? 'readonly' : 'deletion';
  const isOrdinary =
    storage.path === installed.ordinary.path && storage.storageId === installed.ordinary.storageId;
  const target = isOrdinary ? null : installed.recovery;
  if (target?.state === 'unenrolled')
    throw new Error('Recovery registry server target is unenrolled');
  if (target !== null && (target.path !== storage.path || target.storageId !== storage.storageId))
    throw new Error('Unknown isolated server storage');
  const artifact =
    target === null
      ? mode === 'readonly'
        ? installed.readonlyConfiguration
        : installed.deletionConfiguration
      : mode === 'readonly'
        ? target.configuration
        : target.deletionConfiguration;
  await verifyRegistryHostArtifact(installed.distribution);
  const decoded: unknown = parse((await verifyRegistryHostArtifact(artifact)).toString('utf8'));
  parseRegistryMaintenanceConfiguration(decoded, storage.path, mode);
  signal.throwIfAborted();
  const interrupted = new AbortController();
  const lifetimeSignal = AbortSignal.any([signal, interrupted.signal]);
  let authentication: { path: string; inode: number } | undefined;
  if (input.action !== 'collect') authentication = await writeAuthentication(input.token);
  const outcome = await (async () => {
    const child = Bun.spawn(
      [
        installed.distribution.path,
        input.action === 'collect' ? 'garbage-collect' : 'serve',
        artifact.path,
      ],
      {
        env: { PATH: '/usr/bin:/bin', LANG: 'C' },
        uid: 59001,
        gid: 59001,
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe', input.descriptor],
      },
    );
    const lifetime = awaitMaintenanceChild(child, lifetimeSignal);
    const drain = async (stream: ReadableStream<Uint8Array>) => {
      try {
        await consumeRegistryStream(
          stream,
          1024 ** 2,
          'Isolated registry diagnostics',
          () => undefined,
        );
      } catch (cause) {
        interrupted.abort(cause);
        throw cause;
      }
    };
    const diagnostics = [drain(child.stdout), drain(child.stderr)];
    const serving = (async () => {
      if (input.action === 'collect') return;
      const endpoint = 'http://127.0.0.1:5051/v2/';
      const deadline = Date.now() + 30000;
      for (;;) {
        lifetimeSignal.throwIfAborted();
        if (child.exitCode !== null) throw new Error('Isolated registry exited before readiness');
        let response: Response;
        try {
          response = await fetch(endpoint, {
            headers: {
              authorization:
                'Basic ' + Buffer.from('maintenance:' + input.token).toString('base64'),
            },
            signal: AbortSignal.any([lifetimeSignal, AbortSignal.timeout(1000)]),
          });
        } catch (cause) {
          if (Date.now() >= deadline || lifetimeSignal.aborted) throw cause;
          await Bun.sleep(100);
          continue;
        }
        await response.body?.cancel();
        if (response.status !== 200)
          throw new Error('Isolated registry authenticated readiness failed');
        await assertRegistryMaintenanceListener(child.pid);
        const anonymous = await fetch(endpoint, {
          signal: AbortSignal.any([lifetimeSignal, AbortSignal.timeout(1000)]),
        });
        await anonymous.body?.cancel();
        if (anonymous.status !== 401)
          throw new Error('Isolated registry permits ordinary unauthenticated access');
        await assertRegistryMaintenanceListener(child.pid);
        await input.ready(
          JSON.stringify({ url: 'http://127.0.0.1:5051', authentication: 'operation-token' }),
        );
        return;
      }
    })().catch((cause: unknown) => {
      interrupted.abort(cause);
      throw cause;
    });
    const outcomes = await Promise.allSettled([lifetime, serving, ...diagnostics]);
    for (const outcome of outcomes) if (outcome.status === 'rejected') throw outcome.reason;
    if (input.action !== 'collect')
      throw new Error('Isolated server ended without owner cancellation');
  })().then(
    () => ({ ok: true as const }),
    (cause: unknown) => ({ ok: false as const, cause }),
  );
  try {
    if (authentication !== undefined) {
      const current = await lstat(authentication.path);
      // Proof: cleanup-identity omission reaches modeled unlink for a changed inode in registry-server-cleanup.test.ts.
      if (
        current.ino !== authentication.inode ||
        current.uid !== 0 ||
        !current.isFile() ||
        current.nlink !== 1
      )
        throw new Error('Maintenance authentication cleanup identity mismatch');
      await unlink(authentication.path);
    }
  } catch (cause) {
    // Proof: compound-failure omission loses the primary readiness failure when unlink also fails in registry-server-cleanup.test.ts.
    if (!outcome.ok)
      throw new AggregateError(
        [outcome.cause, cause],
        'Maintenance server and authentication cleanup failed',
        { cause },
      );
    throw cause;
  }
  // Proof: primary-refusal omission falsely acknowledges a failed spawn after successful cleanup in registry-server-cleanup.test.ts.
  if (!outcome.ok) throw outcome.cause;
}

async function writeAuthentication(token: string): Promise<{ path: string; inode: number }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(token))
    throw new Error('Invalid maintenance credential identity');
  const directory = '/run/puni-registry-maintenance';
  const metadata = await lstat(directory);
  if (
    (await realpath(directory)) !== directory ||
    !metadata.isDirectory() ||
    metadata.uid !== 0 ||
    metadata.gid !== 59001 ||
    (metadata.mode & 0o777) !== 0o750
  )
    throw new Error('Untrusted maintenance runtime directory');
  const path = join(directory, 'auth.htpasswd');
  // A preexisting file is an unresolved prior helper effect; never silently adopt or replace it.
  const descriptor = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o640,
  );
  try {
    await chown(path, 0, 59001);
    await descriptor.chmod(0o640);
    await descriptor.writeFile(
      'maintenance:' + (await Bun.password.hash(token, { algorithm: 'bcrypt', cost: 10 })) + '\n',
    );
    await descriptor.sync();
    return { path, inode: (await descriptor.stat()).ino };
  } finally {
    await descriptor.close();
  }
}
