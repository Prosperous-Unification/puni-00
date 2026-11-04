import { createHash, randomUUID } from 'node:crypto';
import type { BigIntStats } from 'node:fs';
import { closeSync, constants, fstatSync, fsyncSync, openSync, readSync, writeSync } from 'node:fs';
import { lstat, open, readdir, realpath, rename, unlink } from 'node:fs/promises';
import { hostname, userInfo } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { openDirectoryFile } from './directory-file';
import { withOrdinaryControllerAdmission } from './edge-policy';
import { withExistingCanonicalLock } from './lock';
import { readClosed, readInteger, readString } from './managed-cohort';
import type { SolverReaderArtifact } from './solver-reader-preparation';
import {
  captureSolverReaderArtifact,
  type SolverReaderArtifactObservation,
  type SolverReaderLayout,
} from './solver-reader-preparation';

/** Removes only the unpublished sibling whose original inode is still named at its path. */
async function removeTransitionSibling(path: string, created: BigIntStats): Promise<void> {
  if (!sameTransitionIdentity(created, await lstat(path, { bigint: true })))
    throw new Error('reader transition retains uncertain unpublished sibling identity');
  await unlink(path);
}

/** Independently selected old and new artifacts; none is a readiness assertion. */
export interface SolverReaderTransition {
  readonly target: {
    readonly hostname: string;
    readonly account: { readonly name: string; readonly uid: number; readonly gid: number };
  };
  readonly oldBun: { readonly sha256: string; readonly byteLength: number };
  readonly oldReader: { readonly sha256: string; readonly byteLength: number };
  readonly reader: SolverReaderArtifact;
}

/** Validates the closed transition selection once, before any target effects. */
export function decodeSolverReaderTransition(value: unknown): SolverReaderTransition {
  const fields = readClosed(value, ['target', 'oldBun', 'oldReader', 'reader']);
  const target = readClosed(fields['target'], ['hostname', 'account']);
  const account = readClosed(target['account'], ['name', 'uid', 'gid']);
  const hostname = readString(target['hostname']);
  const name = readString(account['name']);
  if (!/^[a-zA-Z0-9._-]{1,253}$/.test(hostname) || !/^[a-z_][a-z0-9_-]*[$]?$/.test(name))
    throw new Error('invalid selected reader transition target/account');
  const pin = (input: unknown) => {
    const artifact = readClosed(input, ['sha256', 'byteLength']);
    const sha256 = readString(artifact['sha256']);
    const byteLength = readInteger(artifact['byteLength']);
    if (!/^[0-9a-f]{64}$/.test(sha256) || byteLength < 1 || byteLength > 536870912)
      throw new Error('invalid selected reader transition artifact pin');
    return { sha256, byteLength };
  };
  const reader = readClosed(fields['reader'], ['path', 'sha256', 'byteLength']);
  const path = readString(reader['path']);
  if (!isAbsolute(path) || resolve(path) !== path || path.includes('\0'))
    throw new Error('reader transition source must be absolute and canonical');
  return {
    target: {
      hostname,
      account: { name, uid: readInteger(account['uid']), gid: readInteger(account['gid']) },
    },
    oldBun: pin(fields['oldBun']),
    oldReader: pin(fields['oldReader']),
    reader: { path, ...pin({ sha256: reader['sha256'], byteLength: reader['byteLength'] }) },
  };
}

/** Owned observation faults cannot manufacture child exit or pipe EOF. */
export interface SolverReaderTransitionConstruction {
  readonly clock?: { now(): number; pause(milliseconds: number): Promise<void> };
  readonly afterRead?: (stream: 'stdout' | 'stderr') => void;
  readonly observe?: (boundary: string) => Promise<void>;
}

const TRANSITION_PROFILE = {
  operation: 180000,
  execution: 30000,
  observation: 15000,
  reserve: 45000,
  retained: 1048576,
  excerpt: 8192,
} as const;
const TRANSITION_CLOCK = {
  now: () => performance.now(),
  pause: (milliseconds: number) => Bun.sleep(milliseconds),
};

async function runTransitionChild(
  argv: readonly string[],
  state: string,
  descriptor: number,
  deadline: number,
  construction: SolverReaderTransitionConstruction,
): Promise<void> {
  const clock = construction.clock ?? TRANSITION_CLOCK;
  if (deadline - clock.now() < TRANSITION_PROFILE.reserve)
    throw new Error('reader transition lacks child settlement reserve');
  const started = clock.now();
  const child = Bun.spawn([...argv], {
    env: { ...process.env, WBS_EDGE_STATE: state, WBS_EDGE_LOCK_FD: '3' },
    stdio: ['ignore', 'pipe', 'pipe', descriptor],
  });
  interface StreamObservation {
    eof: boolean;
    failed: boolean;
    length: number;
    chunks: Uint8Array[];
    retained: number;
  }
  const stdout: StreamObservation = {
    eof: false,
    failed: false,
    length: 0,
    chunks: [],
    retained: 0,
  };
  const stderr: StreamObservation = {
    eof: false,
    failed: false,
    length: 0,
    chunks: [],
    retained: 0,
  };
  const drain = async (
    stream: ReadableStream<Uint8Array>,
    name: 'stdout' | 'stderr',
    observation: typeof stdout,
  ) => {
    const reader = stream.getReader();
    try {
      for (;;) {
        const chunk = await reader.read();
        construction.afterRead?.(name);
        if (chunk.done) {
          observation.eof = true;
          return;
        }
        observation.length += chunk.value.byteLength;
        const retained = chunk.value.slice(
          0,
          Math.max(0, TRANSITION_PROFILE.retained - observation.retained),
        );
        if (retained.byteLength > 0) {
          observation.chunks.push(retained);
          observation.retained += retained.byteLength;
        }
      }
    } catch {
      // A failed original read is permanent uncertainty; the owning edge callback remains live.
      observation.failed = true;
    } finally {
      reader.releaseLock();
    }
  };
  const outputTask = drain(child.stdout, 'stdout', stdout);
  const errorTask = drain(child.stderr, 'stderr', stderr);
  const settlement: { exit?: { code: number; at: number }; failed: boolean } = { failed: false };
  const waitTask = child.exited.then(
    (code) => {
      settlement.exit = { code, at: clock.now() };
    },
    () => {
      settlement.failed = true;
    },
  );
  let expired = false;
  let announced = false;
  for (;;) {
    const now = clock.now();
    const exit = settlement.exit;
    const cutoff = started + TRANSITION_PROFILE.execution;
    const observationStart = exit === undefined ? cutoff : Math.min(exit.at, cutoff);
    if (
      (exit === undefined && now >= cutoff) ||
      (exit !== undefined && exit.at >= cutoff) ||
      now >= deadline ||
      now >= observationStart + TRANSITION_PROFILE.observation
    )
      expired = true;
    if (
      !announced &&
      (settlement.failed ||
        stdout.failed ||
        stderr.failed ||
        (now >= observationStart + TRANSITION_PROFILE.observation &&
          (exit === undefined || !stdout.eof || !stderr.eof)))
    ) {
      announced = true;
      console.error(
        '[reader-transition] HOLD: original child/read/EOF remains unknown; retain edge interval and partial state; no cleanup/retry/inverse',
      );
    }
    if (!settlement.failed && exit !== undefined && stdout.eof && stderr.eof) {
      await waitTask;
      await outputTask;
      await errorTask;
      if (
        expired ||
        stdout.length > TRANSITION_PROFILE.retained ||
        stderr.length > TRANSITION_PROFILE.retained ||
        exit.code !== 0 ||
        child.signalCode !== null
      )
        throw new Error(
          `reader transition child refused: exit=${String(exit.code)} signal=${String(child.signalCode)} expired=${String(expired)} stdoutBytes=${String(stdout.length)} stderrBytes=${String(stderr.length)}; stderr=${Buffer.concat(stderr.chunks).subarray(0, TRANSITION_PROFILE.excerpt).toString('utf8')}; stdout=${Buffer.concat(stdout.chunks).subarray(0, TRANSITION_PROFILE.excerpt).toString('utf8')}`,
        );
      return;
    }
    await clock.pause(10);
  }
}

function sameTransitionIdentity(first: BigIntStats, second: BigIntStats): boolean {
  return (
    first.dev === second.dev &&
    first.ino === second.ino &&
    first.mode === second.mode &&
    first.uid === second.uid &&
    first.gid === second.gid
  );
}

async function captureTransitionDirectory(
  path: string,
  uid: number,
  privateMode: boolean,
): Promise<BigIntStats> {
  const status = await lstat(path, { bigint: true });
  if (
    !isAbsolute(path) ||
    resolve(path) !== path ||
    (await realpath(path)) !== path ||
    !status.isDirectory() ||
    status.uid !== BigInt(uid) ||
    (privateMode && (status.mode & 0o7777n) !== 0o700n)
  )
    throw new Error(`reader transition requires canonical owned directory: ${path}`);
  await readdir(path);
  return status;
}

/** Writes every byte or refuses a stalled regular-file write. */
function writeTransitionBytes(descriptor: number, bytes: Uint8Array): void {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
    if (written === 0) throw new Error('reader transition evidence write stalled');
    offset += written;
  }
}

/** Retains inert original bytes and observations; this record cannot resume or authorize a controller. */
async function retainOriginalTransitionReader(
  artifact: SolverReaderArtifact,
  openingReader: SolverReaderArtifactObservation,
  openingBun: SolverReaderArtifactObservation,
  staging: string,
  openingStaging: BigIntStats,
  checkpoint: () => void,
): Promise<readonly SolverReaderArtifactObservation[]> {
  checkpoint();
  const directory = openSync(
    staging,
    constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
  );
  try {
    if (!sameTransitionIdentity(openingStaging, fstatSync(directory, { bigint: true })))
      throw new Error('reader transition original staging changed before evidence');
    const source = openSync(
      artifact.path,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    let retainedIdentity: BigIntStats;
    try {
      const opened = fstatSync(source, { bigint: true });
      if (
        !opened.isFile() ||
        String(opened.dev) !== openingReader.device ||
        String(opened.ino) !== openingReader.inode ||
        opened.size !== BigInt(artifact.byteLength)
      )
        throw new Error('reader transition original reader changed before evidence');
      const retained = openDirectoryFile(
        directory,
        'original-reader',
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      );
      try {
        retainedIdentity = fstatSync(retained, { bigint: true });
        const digest = createHash('sha256');
        const bytes = Buffer.alloc(65536);
        let length = 0;
        for (;;) {
          checkpoint();
          const count = readSync(source, bytes, 0, bytes.byteLength, length);
          if (count === 0) break;
          length += count;
          if (length > artifact.byteLength)
            throw new Error('reader transition original evidence exceeded selected bytes');
          digest.update(bytes.subarray(0, count));
          writeTransitionBytes(retained, bytes.subarray(0, count));
        }
        if (length !== artifact.byteLength || digest.digest('hex') !== artifact.sha256)
          throw new Error('reader transition original evidence bytes differ');
        const closing = fstatSync(source, { bigint: true });
        if (
          !sameTransitionIdentity(opened, closing) ||
          opened.size !== closing.size ||
          opened.mtimeNs !== closing.mtimeNs ||
          opened.ctimeNs !== closing.ctimeNs
        )
          throw new Error('reader transition original reader changed while retaining evidence');
        checkpoint();
        fsyncSync(retained);
      } finally {
        closeSync(retained);
      }
    } finally {
      closeSync(source);
    }
    const retained = await captureSolverReaderArtifact(join(staging, 'original-reader'));
    if (
      retained.device !== String(retainedIdentity.dev) ||
      retained.inode !== String(retainedIdentity.ino) ||
      retained.mode !== 0o600 ||
      retained.uid !== openingReader.uid ||
      retained.gid !== openingReader.gid ||
      retained.artifact.sha256 !== artifact.sha256 ||
      retained.artifact.byteLength !== artifact.byteLength
    )
      throw new Error('reader transition retained original evidence readback differs');
    const bytes = Buffer.from(
      `${JSON.stringify({ format: 'solver-reader-transition-observation', version: 1, oldReader: openingReader, oldBun: openingBun, retainedReader: { name: 'original-reader', sha256: artifact.sha256, byteLength: artifact.byteLength } })}\n`,
    );
    checkpoint();
    const record = openDirectoryFile(
      directory,
      'original-reader.json',
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
    );
    let recordIdentity: BigIntStats;
    try {
      recordIdentity = fstatSync(record, { bigint: true });
      writeTransitionBytes(record, bytes);
      fsyncSync(record);
    } finally {
      closeSync(record);
    }
    const readback = await captureSolverReaderArtifact(join(staging, 'original-reader.json'));
    if (
      readback.device !== String(recordIdentity.dev) ||
      readback.inode !== String(recordIdentity.ino) ||
      readback.mode !== 0o600 ||
      readback.uid !== openingReader.uid ||
      readback.gid !== openingReader.gid ||
      readback.artifact.byteLength !== bytes.byteLength ||
      readback.artifact.sha256 !== createHash('sha256').update(bytes).digest('hex')
    )
      throw new Error('reader transition original observation record readback differs');
    checkpoint();
    if (
      !sameTransitionIdentity(openingStaging, fstatSync(directory, { bigint: true })) ||
      !sameTransitionIdentity(openingStaging, await lstat(staging, { bigint: true }))
    )
      throw new Error('reader transition original staging changed while retaining evidence');
    fsyncSync(directory);
    return [retained, readback];
  } finally {
    closeSync(directory);
  }
}

/** Replaces only the reader after the actual old fixed authority admits the original OFD. Unknown child observation retains this invocation forever. */
export async function transitionSolverReader(
  input: unknown,
  layout: SolverReaderLayout,
  construction: SolverReaderTransitionConstruction = {},
): Promise<void> {
  const selection = decodeSolverReaderTransition(input);
  const clock = construction.clock ?? TRANSITION_CLOCK;
  const deadline = clock.now() + TRANSITION_PROFILE.operation;
  const checkpoint = () => {
    if (clock.now() >= deadline) throw new Error('reader transition operation deadline expired');
  };
  const account = userInfo();
  if (
    hostname() !== selection.target.hostname ||
    account.username !== selection.target.account.name ||
    account.uid !== selection.target.account.uid ||
    account.gid !== selection.target.account.gid
  )
    throw new Error('reader transition target/account differs');
  const uid = selection.target.account.uid;
  const parents = new Map<string, BigIntStats>();
  const openingStaging = await captureTransitionDirectory(layout.staging, uid, true);
  parents.set(layout.staging, openingStaging);
  for (const path of new Set([
    dirname(layout.state),
    layout.state,
    dirname(layout.bun),
    dirname(layout.reader),
    dirname(layout.staging),
  ])) {
    if (path === layout.staging) continue;
    parents.set(
      path,
      await captureTransitionDirectory(
        path,
        uid,
        path === layout.state || path === layout.staging || path === dirname(layout.staging),
      ),
    );
  }
  if (
    dirname(selection.reader.path) !== layout.staging ||
    selection.reader.path !== join(layout.staging, 'reader') ||
    dirname(layout.bun) !== dirname(layout.reader)
  )
    throw new Error('reader transition requires fixed staging leaves and installed parent');
  const oldBun = { path: layout.bun, ...selection.oldBun };
  const oldReader = { path: layout.reader, ...selection.oldReader };
  const capture = async (artifact: SolverReaderArtifact, installed: boolean) => {
    const observed = await captureSolverReaderArtifact(artifact.path);
    if (
      observed.artifact.sha256 !== artifact.sha256 ||
      observed.artifact.byteLength !== artifact.byteLength ||
      observed.uid !== String(uid) ||
      observed.gid !== String(selection.target.account.gid) ||
      (installed && observed.mode !== 0o755) ||
      (await realpath(artifact.path)) !== artifact.path
    )
      throw new Error(`reader transition selected artifact differs: ${artifact.path}`);
    return observed;
  };
  const openingBun = await capture(oldBun, true);
  const openingReader = await capture(oldReader, true);
  const openingCandidate = await capture(selection.reader, false);
  const assertObservation = async (
    artifact: SolverReaderArtifact,
    opening: SolverReaderArtifactObservation,
    installed: boolean,
  ) => {
    if (JSON.stringify(await capture(artifact, installed)) !== JSON.stringify(opening))
      throw new Error(`reader transition original artifact changed: ${artifact.path}`);
  };
  const assertParents = async () => {
    checkpoint();
    for (const [path, opening] of parents) {
      const current = await captureTransitionDirectory(
        path,
        uid,
        path === layout.state || path === layout.staging || path === dirname(layout.staging),
      );
      if (!sameTransitionIdentity(opening, current))
        throw new Error(`reader transition original parent changed: ${path}`);
    }
  };
  await withExistingCanonicalLock(join(layout.state, 'edge.lock'), async (descriptor) => {
    const openingLock = fstatSync(descriptor, { bigint: true });
    await withOrdinaryControllerAdmission(layout.state, 'required', async (recheck) => {
      const closeOpening = async () => {
        await assertParents();
        if (
          !sameTransitionIdentity(openingLock, fstatSync(descriptor, { bigint: true })) ||
          !sameTransitionIdentity(
            openingLock,
            await lstat(join(layout.state, 'edge.lock'), { bigint: true }),
          )
        )
          throw new Error('reader transition original edge lock changed');
        await recheck();
        await assertObservation(oldBun, openingBun, true);
      };
      await closeOpening();
      await assertObservation(oldReader, openingReader, true);
      await assertObservation(selection.reader, openingCandidate, false);
      await runTransitionChild(
        [layout.bun, layout.reader, '--check-edge-policy-inherited'],
        layout.state,
        descriptor,
        deadline,
        construction,
      );
      await construction.observe?.('old-authority');
      await closeOpening();
      await assertObservation(oldReader, openingReader, true);
      for (const mode of ['legacy', 'required']) {
        await runTransitionChild(
          [layout.bun, selection.reader.path, `--check-controller-admission-inherited=${mode}`],
          layout.state,
          descriptor,
          deadline,
          construction,
        );
        await construction.observe?.(`staged-${mode}`);
        await closeOpening();
        await assertObservation(oldReader, openingReader, true);
        await assertObservation(selection.reader, openingCandidate, false);
      }
      const evidence = await retainOriginalTransitionReader(
        oldReader,
        openingReader,
        openingBun,
        layout.staging,
        openingStaging,
        checkpoint,
      );
      const assertEvidence = async () => {
        for (const opening of evidence) {
          if (
            JSON.stringify(await captureSolverReaderArtifact(opening.artifact.path)) !==
            JSON.stringify(opening)
          )
            throw new Error('reader transition original evidence changed before completion');
        }
        await assertParents();
      };
      await assertEvidence();
      await closeOpening();
      await assertObservation(oldReader, openingReader, true);
      await assertObservation(selection.reader, openingCandidate, false);
      const sibling = join(dirname(layout.reader), `.reader-transition-${randomUUID()}`);
      let published = false;
      let created: BigIntStats | undefined;
      try {
        const source = await open(
          selection.reader.path,
          constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
        );
        try {
          const destination = await open(
            sibling,
            constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
            0o755,
          );
          created = await destination.stat({ bigint: true });
          try {
            const digest = createHash('sha256');
            const bytes = Buffer.alloc(65536);
            let length = 0;
            for (;;) {
              const { bytesRead } = await source.read(bytes, 0, bytes.length, length);
              if (bytesRead === 0) break;
              length += bytesRead;
              if (length > selection.reader.byteLength)
                throw new Error('reader transition candidate grew');
              digest.update(bytes.subarray(0, bytesRead));
              let written = 0;
              while (written < bytesRead) {
                const write = await destination.write(
                  bytes,
                  written,
                  bytesRead - written,
                  length - bytesRead + written,
                );
                if (write.bytesWritten === 0)
                  throw new Error('reader transition sibling write stalled');
                written += write.bytesWritten;
              }
            }
            if (
              length !== selection.reader.byteLength ||
              digest.digest('hex') !== selection.reader.sha256
            )
              throw new Error('reader transition sibling copy differs');
            await destination.chmod(0o755);
            await destination.sync();
          } finally {
            await destination.close();
          }
        } finally {
          await source.close();
        }
        const siblingArtifact = { ...selection.reader, path: sibling };
        const openingSibling = await capture(siblingArtifact, true);
        if (
          openingSibling.device !== String(created.dev) ||
          openingSibling.inode !== String(created.ino)
        )
          throw new Error('reader transition sibling differs from the exclusively created inode');
        await construction.observe?.('sibling-ready');
        await closeOpening();
        await assertObservation(oldReader, openingReader, true);
        await assertObservation(selection.reader, openingCandidate, false);
        await assertObservation(siblingArtifact, openingSibling, true);
        await assertEvidence();
        await rename(sibling, layout.reader);
        published = true;
        const parent = await open(
          dirname(layout.reader),
          constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
        );
        try {
          await parent.sync();
        } finally {
          await parent.close();
        }
        const installedArtifact = { ...selection.reader, path: layout.reader };
        const installed = await capture(installedArtifact, true);
        if (installed.device !== openingSibling.device || installed.inode !== openingSibling.inode)
          throw new Error('reader transition published inode differs');
        await construction.observe?.('published');
        for (const mode of ['legacy', 'required']) {
          await runTransitionChild(
            [layout.bun, layout.reader, `--check-controller-admission-inherited=${mode}`],
            layout.state,
            descriptor,
            deadline,
            construction,
          );
          await construction.observe?.(`installed-${mode}`);
          await closeOpening();
          await assertObservation(installedArtifact, installed, true);
          await assertEvidence();
        }
      } finally {
        if (created !== undefined && !published) await removeTransitionSibling(sibling, created);
      }
    });
  });
}
