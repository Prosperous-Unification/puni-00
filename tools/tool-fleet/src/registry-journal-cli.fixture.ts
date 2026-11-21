import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  lstat,
  mkdir,
  readdir,
  readFile,
  readlink,
  realpath,
  stat,
  statfs,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import { consumeRegistryStream } from './registry-stream';

let stage = 'invocation';

/** Publish original observations before assertions while the private filesystem still exists. */
function publishObservation(selectedStage: string, observation: Record<string, unknown>): void {
  process.stdout.write(
    `${JSON.stringify({ schemaVersion: 1, fixture: 'registry-journal-cli-v1', stage: selectedStage, ...observation })}\n`,
  );
}

function requireRecord(value: unknown, boundary: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`Malformed ${boundary}`);
  // The plain non-null object boundary above excludes arrays and primitives before property reads.
  return value as Record<string, unknown>;
}

/** Spawn the unchanged CLI twice, sequentially inside this same namespace; no arbitrary executable or command is accepted. */
async function invokeJournalCli(
  directory: string,
  request: string,
  selectedStage: 'initialize' | 'read',
) {
  stage = selectedStage;
  const argv = [
    process.execPath,
    '--no-env-file',
    join(import.meta.dir, 'registry-journal-cli.ts'),
    directory,
  ];
  const cwd = process.cwd();
  publishObservation(`${selectedStage}-request`, { argv, cwd, request });
  const child = Bun.spawn(argv, {
    cwd,
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', BUN_RUNTIME_TRANSPILER_CACHE_PATH: '0' },
    stdin: new TextEncoder().encode(request),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stopChild = () => {
    if (child.exitCode === null) child.kill('SIGKILL');
  };
  let hasTimedOut = false;
  // Proof: worker-stall fault14 retained prefix/deadline before actual child/readers settled; no general kernel or scratch cleanup bound is inferred.
  const deadline = setTimeout(() => {
    hasTimedOut = true;
    publishObservation('diagnostic', {
      event: 'deadline',
      ownerStage: selectedStage,
      pid: child.pid,
      hasTimedOut,
      settlement: 'pending',
    });
    stopChild();
  }, 5000);
  const collectStream = async (stream: ReadableStream<Uint8Array>, boundary: string) => {
    const chunks: Uint8Array[] = [];
    let failure: string | null = null;
    let receivedBytes = 0;
    let retainedBytes = 0;
    const observed = stream.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          receivedBytes += chunk.byteLength;
          if (receivedBytes > 65536) {
            // Proof: worker-noise fault13 retained prefix/overflow before the joined terminal at this actual collector.
            // Publish and stop before consumeRegistryStream waits for upstream cancellation.
            publishObservation('diagnostic', {
              event: 'stream-overflow',
              ownerStage: selectedStage,
              boundary,
              pid: child.pid,
              receivedBytes,
              retainedBytes,
              complete: false,
              settlement: 'pending',
            });
            stopChild();
          }
          controller.enqueue(chunk);
        },
      }),
    );
    try {
      await consumeRegistryStream(observed, 65536, boundary, (chunk) => {
        chunks.push(chunk);
        retainedBytes += chunk.byteLength;
        publishObservation('diagnostic', {
          event: 'stream-prefix',
          ownerStage: selectedStage,
          boundary,
          pid: child.pid,
          retainedBytes,
          prefixBase64: Buffer.from(chunk).toString('base64'),
          complete: false,
        });
      });
    } catch (cause) {
      failure = String(cause);
      publishObservation('diagnostic', {
        event: 'stream-failure',
        ownerStage: selectedStage,
        boundary,
        pid: child.pid,
        receivedBytes,
        retainedBytes,
        failure,
        complete: false,
        settlement: 'pending',
      });
      stopChild();
    }
    const bytes = Buffer.concat(chunks);
    return { text: bytes.toString('utf8'), base64: bytes.toString('base64'), failure };
  };
  try {
    const [terminal, stdout, stderr] = await Promise.allSettled([
      child.exited,
      collectStream(child.stdout, 'Journal CLI stdout'),
      collectStream(child.stderr, 'Journal CLI stderr'),
    ]);
    if (
      terminal.status !== 'fulfilled' ||
      stdout.status !== 'fulfilled' ||
      stderr.status !== 'fulfilled'
    ) {
      publishObservation('diagnostic', {
        event: 'settlement-failed',
        ownerStage: selectedStage,
        status: 'settlement-failed',
        argv,
        request,
        pid: child.pid,
        terminal,
        stdout,
        stderr,
      });
      throw new Error('Journal CLI process or stream settlement is unconfirmed');
    }
    const observation = {
      argv,
      cwd,
      request,
      pid: child.pid,
      exitCode: terminal.value,
      signal: child.signalCode,
      stdout: stdout.value.text,
      stderr: stderr.value.text,
      stdoutBase64: stdout.value.base64,
      stderrBase64: stderr.value.base64,
      stdoutFailure: stdout.value.failure,
      stderrFailure: stderr.value.failure,
      hasTimedOut,
      settled: true,
    };
    publishObservation(selectedStage, observation);
    assert.equal(hasTimedOut, false, 'Journal CLI deadline exceeded');
    assert.equal(stdout.value.failure, null, 'Journal CLI stdout collection failed');
    assert.equal(stderr.value.failure, null, 'Journal CLI stderr collection failed');
    assert.equal(terminal.value, 0, JSON.stringify(observation));
    assert.equal(stderr.value.text, '', JSON.stringify(observation));
    return requireRecord(JSON.parse(stdout.value.text), `${selectedStage} response`);
  } finally {
    clearTimeout(deadline);
  }
}

/** Admit a real, distinct, bounded tmpfs before any mkdir/write; a plain host directory is never a filesystem fixture. */
async function admitFilesystem(mountpoint: string): Promise<Record<string, unknown>> {
  stage = 'filesystem-domain';
  const [filesystem, mountStatus, rootStatus, canonical, mountInformation] = await Promise.all([
    statfs(mountpoint),
    lstat(mountpoint),
    stat('/'),
    realpath(mountpoint),
    readFile('/proc/self/mountinfo', 'utf8'),
  ]);
  const mounts = mountInformation
    .trimEnd()
    .split('\n')
    .filter((line) => {
      const path = line.split(' ').at(4);
      return (
        path?.replace(/\\([0-7]{3})/g, (_, octal: string) =>
          String.fromCharCode(Number.parseInt(octal, 8)),
        ) === mountpoint
      );
    });
  const mount = mounts.length === 1 ? mounts[0] : undefined;
  const identity = mount?.split(' - ')[0];
  const filesystemIdentity = mount?.split(' - ')[1];
  // Proof: nested real4MiB tmpfs fault01 also refused at filesystem-domain because the nested path has no exact mount entry.
  // Proof: the actual omitted size/tmpfs control refused first at filesystem-domain with no admission; control-1 and restored-positive in controlled-journal-finite-sequence retain the observed failures/restoration.
  assert.ok(
    filesystem.type === 0x01021994 &&
      mountStatus.dev !== rootStatus.dev &&
      mount !== undefined &&
      identity !== undefined &&
      filesystemIdentity?.split(' ')[0] === 'tmpfs' &&
      identity.split(' ')[5]?.split(',').includes('rw'),
    'Journal fixture requires a distinct private tmpfs filesystem',
  );
  stage = 'filesystem-size';
  // Proof: actual 2097152-byte tmpfs refused first at filesystem-size with no admission; control-2 and restored-positive in controlled-journal-finite-sequence retain failure/restoration.
  assert.equal(
    filesystem.blocks * filesystem.bsize,
    4194304,
    'Journal fixture requires exactly 4194304 bytes',
  );

  stage = 'filesystem-identity';
  assert.equal(canonical, mountpoint, 'Journal fixture mountpoint is not canonical');
  assert.equal(mountStatus.isDirectory(), true, 'Journal fixture mountpoint is not a directory');
  assert.equal(process.getuid?.(), 1000, 'Journal fixture requires UID1000');
  assert.equal(process.getgid?.(), 1000, 'Journal fixture requires GID1000');
  assert.equal(mountStatus.uid, 1000, 'Journal fixture mountpoint owner differs');
  // Proof: faults03/04 refused absent user and malformed mount metadata; faults05/06 used real same-scope readlink values and refused the corresponding comparison.
  const parentUser = process.env['REGISTRY_FIXTURE_PARENT_USER_NAMESPACE'];
  const parentMount = process.env['REGISTRY_FIXTURE_PARENT_MOUNT_NAMESPACE'];
  if (parentUser === undefined || !/^user:\[\d+\]$/.test(parentUser))
    throw new Error('Journal fixture parent user namespace is missing or malformed');
  if (parentMount === undefined || !/^mnt:\[\d+\]$/.test(parentMount))
    throw new Error('Journal fixture parent mount namespace is missing or malformed');
  const [userNamespace, mountNamespace] = await Promise.all([
    readlink('/proc/self/ns/user'),
    readlink('/proc/self/ns/mnt'),
  ]);
  assert.notEqual(
    userNamespace,
    parentUser,
    'Journal fixture did not enter a private user namespace',
  );
  assert.notEqual(
    mountNamespace,
    parentMount,
    'Journal fixture did not enter a private mount namespace',
  );
  return {
    filesystemType: 'tmpfs',
    capacityBytes: filesystem.blocks * filesystem.bsize,
    allocationUnitBytes: filesystem.bsize,
    availableBytes: filesystem.bavail * filesystem.bsize,
    totalInodes: filesystem.files,
    freeInodes: filesystem.ffree,
    device: mountStatus.dev,
    rootDevice: rootStatus.dev,
    mountIdentity: mount,
    uid: process.getuid(),
    gid: process.getgid(),
    parentUser,
    parentMount,
    userNamespace,
    mountNamespace,
  };
}

/** Fixed smoke sequence only. Its mount and journals disappear with the namespace; diagnostics leave through stdout before teardown. */
async function main(): Promise<void> {
  if (process.platform !== 'linux') throw new Error('Journal fixture requires Linux');
  const mountpoint = process.argv.at(3);
  // Proof: wrong-sentinel fault02 refused at invocation before filesystem admission.
  if (
    process.argv.length !== 4 ||
    process.argv[2] !== '--registry-journal-smoke-v1' ||
    mountpoint === undefined
  )
    throw new Error(
      'Usage: registry-journal-cli.fixture.ts --registry-journal-smoke-v1 <owned-mountpoint>',
    );
  const admission = await admitFilesystem(mountpoint);
  stage = 'journal-directory';
  const directory = join(mountpoint, 'journal');
  await mkdir(directory, { mode: 0o700 });
  const owner = await lstat(directory);
  assert.ok(
    owner.isDirectory() && owner.uid === 1000 && (owner.mode & 0o777) === 0o700,
    'Journal fixture directory is not owned and private',
  );
  publishObservation('admission', {
    ...admission,
    directory,
    directoryMode: owner.mode & 0o777,
    directoryInode: owner.ino,
  });
  const GiB = 1024 ** 3;
  const enrollment = {
    registryId: 'proof-registry',
    storageId: 'volume-1',
    owners: ['publisher', 'deploy', 'backup'],
    registryPath: directory,
    rootPath: directory,
    maximumBytes: 50 * GiB,
    journalMaximumBytes: GiB,
  };
  const initialized = await invokeJournalCli(
    directory,
    JSON.stringify({ command: 'initialize', enrollment }),
    'initialize',
  );
  const initialState = requireRecord(initialized['state'], 'initial state');
  assert.deepEqual(initialState['enrollment'], enrollment);
  assert.equal(initialState['revision'], 0);
  stage = 'journal';
  const canonical = join(directory, 'journal.json');
  const [journal, identity] = await Promise.all([readFile(canonical), lstat(canonical)]);
  publishObservation('journal', {
    path: canonical,
    device: identity.dev,
    inode: identity.ino,
    uid: identity.uid,
    mode: identity.mode & 0o777,
    contents: journal.toString('utf8'),
    sha256: createHash('sha256').update(journal).digest('hex'),
  });
  assert.ok(
    identity.isFile() && identity.uid === 1000 && (identity.mode & 0o777) === 0o600,
    'Journal fixture canonical file identity is invalid',
  );
  assert.equal(identity.dev, owner.dev);
  assert.deepEqual(JSON.parse(journal.toString('utf8')), initialState);
  stage = 'orphan';
  const orphan = join(directory, `journal.${randomUUID()}.json`);
  await writeFile(orphan, 'crashed replacement', { mode: 0o600, flag: 'wx' });
  const orphanIdentity = await lstat(orphan);
  publishObservation('orphan', {
    path: orphan,
    contents: 'crashed replacement',
    device: orphanIdentity.dev,
    inode: orphanIdentity.ino,
    uid: orphanIdentity.uid,
    mode: orphanIdentity.mode & 0o777,
  });
  const readback = await invokeJournalCli(directory, '{"command":"read"}', 'read');
  assert.equal(requireRecord(readback['state'], 'read state')['revision'], 0);
  stage = 'files';
  const files = (await readdir(directory)).sort();
  publishObservation('files', { directory, files });
  assert.deepEqual(files, ['authority.lock', 'journal.json']);
  assert.deepEqual(await readFile(canonical), journal);
  publishObservation('complete', {
    status: 'passed',
    stages: [
      'admission',
      'initialize-request',
      'initialize',
      'journal',
      'orphan',
      'read-request',
      'read',
      'files',
    ],
    childCount: 2,
  });
}

if (import.meta.main) {
  try {
    await main();
  } catch (cause) {
    process.stderr.write(
      `${JSON.stringify({ schemaVersion: 1, fixture: 'registry-journal-cli-v1', stage, status: 'failed', error: String(cause) })}\n`,
    );
    process.exitCode = 1;
  }
}
