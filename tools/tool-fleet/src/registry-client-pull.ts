import { constants } from 'node:fs';
import { chmod, chown, lstat, mkdir, open, readdir } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';

import { type } from 'arktype';

import { admitBuilderScratch, measureFilesystem } from './registry-capacity';
import {
  assertRegistryClientContext,
  assertRegistryClientReadonlyRoot,
} from './registry-client-context';
import { RegistryClientSelection, verifyRegistryClientLayout } from './registry-client-layout';
import { selectRegistryClientArtifact } from './registry-client-software';
import { createRegistryClientWorkspace } from './registry-client-workspace';
import { verifyRegistryHostArtifact } from './registry-maintenance-installation';
import {
  assertRegistryMaintenanceLock,
  awaitMaintenanceChild,
} from './registry-maintenance-process';
import { completeRegistryOperation } from './registry-operation-completion';
import { consumeRegistryStream } from './registry-stream';

const Path = type('0 < string <= 256').narrow(isAbsolute);
const Positive = type('number.safe > 0');
const Uuid = type(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
const Token = type(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
const Profile = type({
  authority: { directory: Path, descriptor: '3', '+': 'reject' },
  registryPath: Path,
  otherStores: Path.array().atMostLength(8),
  scratch: {
    path: Path,
    receiptPath: Path,
    storageId: Uuid,
    maximumBytes: Positive,
    maximumInodes: Positive,
    '+': 'reject',
  },
  token: Token,
  '+': 'reject',
});
const repositoryPattern =
  '[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*(?:/[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*)*';
const Request = type({
  repository: type(new RegExp('^' + repositoryPattern + '$')),
  reference: /^sha256:[a-f0-9]{64}$/,
  selection: RegistryClientSelection,
  envelope: { bytes: Positive, inodes: Positive, '+': 'reject' },
  '+': 'reject',
});
/** Require the actual bounded root PID1 context and its readonly root before accepting a fixed client profile. */
export async function assertRegistryClientWorker(signal: AbortSignal): Promise<void> {
  await assertRegistryClientContext(signal);
  await assertRegistryClientReadonlyRoot(signal);
}
async function writeCredentials(directory: string, token: string): Promise<void> {
  await mkdir(directory, { mode: 0o750 });
  await chown(directory, 0, 59001);
  await chmod(directory, 0o750);
  const descriptor = await open(
    join(directory, 'config.json'),
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    0o640,
  );
  await completeRegistryOperation(
    async () => {
      await descriptor.chown(0, 59001);
      await descriptor.chmod(0o640);
      await descriptor.writeFile(
        JSON.stringify({
          auths: {
            '127.0.0.1:5051': { auth: Buffer.from('maintenance:' + token).toString('base64') },
          },
        }),
      );
      await descriptor.sync();
    },
    () => descriptor.close(),
  );
}
async function childCompletion(
  child: Bun.Subprocess<'ignore', 'pipe', 'pipe'>,
  signal: AbortSignal,
  interrupt: AbortController,
): Promise<void> {
  const drain = async (stream: ReadableStream<Uint8Array>) => {
    try {
      await consumeRegistryStream(
        stream,
        1024 ** 2,
        'Registry client diagnostics',
        () => undefined,
      );
    } catch (cause) {
      interrupt.abort(cause);
      throw cause;
    }
  };
  const outcomes = await Promise.allSettled([
    awaitMaintenanceChild(child, signal),
    drain(child.stdout),
    drain(child.stderr),
  ]);
  const failures: unknown[] = [];
  for (const outcome of outcomes)
    if (outcome.status === 'rejected') {
      const failure: unknown = outcome.reason;
      failures.push(failure);
    }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, 'Registry client completion failed', { cause: failures[0] });
}
function platformSelector(platform: (typeof RegistryClientSelection.infer)['platform']): string {
  return (
    platform.os +
    '/' +
    platform.architecture +
    (platform.variant === undefined ? '' : '/' + platform.variant) +
    (platform['os.version'] === undefined ? '' : ':' + platform['os.version'])
  );
}

/**
 * Create the actual pull executor only inside the installed namespace worker. Its root bootstrap,
 * current operation and freshly started readonly Distribution listener are authenticated by the
 * caller; user request JSON cannot select this profile or an executable. Enforce the live worker,
 * held FD3, pinned Crane, independent ext4 root-owned0711 pool, root reserve and byte/inode admission.
 * Each pull gets exclusive fresh output, private credentials, an owned unprivileged process group,
 * a five-minute deadline and bounded discarded diagnostics. FD4 binds all child paths to the held
 * job; root setup and verification use that same directory capability. Verify output after group
 * reaping, then delete/audit its entire workspace before returning. Operation and cleanup failures
 * survive together. The caller still owns filesystem/namespace teardown if ownership cannot be
 * acknowledged, and settles the durable root receipt only after its complete teardown succeeds.
 */
export interface RegistryClientExecutor {
  (requestInput: unknown, signal: AbortSignal): Promise<void>;
  /** Revalidate the same fixed profile before/after a batch, including exact empty coverage. */
  admit(envelope: { bytes: number; inodes: number }, signal: AbortSignal): Promise<void>;
}
export async function createRegistryClientExecutor(
  profileInput: unknown,
  signal: AbortSignal,
): Promise<RegistryClientExecutor> {
  await assertRegistryClientWorker(signal);
  const profile = Profile.assert(structuredClone(profileInput));
  const validate = async (
    envelope: (typeof Request.infer)['envelope'],
    currentSignal: AbortSignal,
  ) => {
    await assertRegistryClientWorker(currentSignal);
    await assertRegistryMaintenanceLock(
      profile.authority.directory,
      profile.authority.descriptor,
      59001,
    );
    await verifyRegistryHostArtifact(selectRegistryClientArtifact());
    const scratch = await admitBuilderScratch({
      path: profile.scratch.path,
      receiptPath: profile.scratch.receiptPath,
      excludedPaths: [profile.authority.directory, profile.registryPath, ...profile.otherStores],
      envelope,
    });
    const metadata = await lstat(profile.scratch.path);
    if (
      scratch.identity !== profile.scratch.storageId ||
      scratch.maximumBytes !== profile.scratch.maximumBytes ||
      scratch.totalInodes > profile.scratch.maximumInodes ||
      metadata.uid !== 0 ||
      metadata.gid !== 0 ||
      !metadata.isDirectory() ||
      (metadata.mode & 0o777) !== 0o711
    )
      throw new Error('Registry client scratch differs from installed profile');
    if ((await measureFilesystem('/')).availableBytes < 20 * 1024 ** 3)
      throw new Error('Registry client host root reserve is exhausted');
    currentSignal.throwIfAborted();
  };
  const execute: RegistryClientExecutor = Object.assign(
    async (requestInput: unknown, ownerSignal: AbortSignal) => {
      const request = Request.assert(structuredClone(requestInput));
      const interrupted = new AbortController();
      const lifetimeSignal = AbortSignal.any([
        signal,
        ownerSignal,
        interrupted.signal,
        AbortSignal.timeout(300000),
      ]);
      await validate(request.envelope, lifetimeSignal);
      let workspace: Awaited<ReturnType<typeof createRegistryClientWorkspace>> | undefined;
      await completeRegistryOperation(
        async () => {
          workspace = await createRegistryClientWorkspace(profile.scratch.path);
          const directory = workspace.path;
          await workspace.grantClient();
          const output = join(directory, 'output'),
            temporary = join(directory, 'temporary'),
            credentials = join(directory, 'credentials');
          for (const path of [output, temporary]) {
            await mkdir(path, { mode: 0o700 });
            await chown(path, 59001, 59001);
            await chmod(path, 0o700);
          }
          await writeCredentials(credentials, profile.token);
          if ((await readdir(output)).length !== 0 || (await readdir(temporary)).length !== 0)
            throw new Error('Registry client cache is not independently empty');
          lifetimeSignal.throwIfAborted();
          const child = Bun.spawn(
            [
              selectRegistryClientArtifact().path,
              'pull',
              '--insecure',
              '--platform',
              platformSelector(request.selection.platform),
              '--format',
              'oci',
              '127.0.0.1:5051/' + request.repository + '@' + request.reference,
              '/proc/self/fd/4/output',
            ],
            {
              env: {
                PATH: '/usr/bin:/bin',
                LANG: 'C',
                DOCKER_CONFIG: '/proc/self/fd/4/credentials',
                TMPDIR: '/proc/self/fd/4/temporary',
                GOMAXPROCS: '2',
                GOMEMLIMIT: '128MiB',
              },
              uid: 59001,
              gid: 59001,
              detached: true,
              stdio: [
                'ignore',
                'pipe',
                'pipe',
                profile.authority.descriptor,
                workspace.descriptor.fd,
              ],
            },
          );
          await childCompletion(child, lifetimeSignal, interrupted);
          await verifyRegistryClientLayout(
            { parent: workspace.descriptor, name: 'output' },
            request.selection,
            lifetimeSignal,
          );
          lifetimeSignal.throwIfAborted();
        },
        async () => {
          if (workspace !== undefined) await workspace.close();
        },
      );
    },
    { admit: validate },
  );
  return execute;
}
