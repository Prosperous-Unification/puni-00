import { rejects } from 'node:assert/strict';
import { type BigIntStats, constants } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import * as filesystem from 'node:fs/promises';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rename,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';

import { expect, spyOn, test } from 'bun:test';

import type * as JournalApi from './source-stageb-journal';
import {
  abandonSourceIntent,
  appendSourceIntent,
  closeSourceJournal,
  createSourceJournal,
  dispatchSourceIntent,
  inspectSourceJournal,
  recordSourceObservation,
  recordSourceUncertainty,
  reserveSourceJournalCreation,
  reserveSourceJournalRecord,
  sealSourceJournal,
  type SourceIntent,
} from './source-stageb-journal';

const claim = {
  format: 'source-stageb-journal',
  version: 1,
  nonce: 'a'.repeat(32),
  implementationSha: 'b'.repeat(40),
  workflowSha: 'c'.repeat(40),
  sourceSha: 'd'.repeat(40),
  inputManifestSha256: 'e'.repeat(64),
};
async function fixture() {
  const parentPath = await mkdtemp('/tmp/puni-stageb-journal-tests/j-');
  const directoryPath = `${parentPath}/source-stageb-${claim.nonce}`;
  await mkdir(directoryPath, { mode: 0o700 });
  const parent = await open(parentPath, constants.O_RDONLY | constants.O_DIRECTORY);
  const directory = await open(directoryPath, constants.O_RDONLY | constants.O_DIRECTORY);
  return { parentPath, directoryPath, parent, directory };
}
test('closed claim rejects sentinel field without publication and settles transferred descriptors', async () => {
  const owned = await fixture();
  try {
    await rejects(
      createSourceJournal({
        parent: owned.parent,
        directory: owned.directory,
        claim: { ...claim, argv: 'SENTINEL' },
        deadline: performance.now() + 10000,
      }),
    );
    expect(await readdir(owned.directoryPath)).toEqual([]);
    expect(owned.parent.fd).toBe(-1);
    expect(owned.directory.fd).toBe(-1);
  } finally {
    await owned.parent.close();
    await owned.directory.close();
    await rm(owned.parentPath, { recursive: true });
  }
});

async function journalFixture() {
  const owned = await fixture();
  const journal = await createSourceJournal({
    parent: owned.parent,
    directory: owned.directory,
    claim,
    deadline: performance.now() + 10000,
  });
  return { ...owned, journal };
}
test('durable lifecycle records private observations, seals exact membership and keeps claim on close', async () => {
  const owned = await journalFixture();
  try {
    const intent = await appendSourceIntent(owned.journal, {
      operation: 'create',
      resourceClass: 'network',
      purpose: 'transport',
    });
    const dispatch = await dispatchSourceIntent(owned.journal, intent);
    const reference = await recordSourceObservation(owned.journal, dispatch, {
      identity: { kind: 'network', id: '1'.repeat(64) },
      observationSha256: '2'.repeat(64),
    });
    expect(reference).toBeDefined();
    if (reference === undefined) throw new Error('expected original recorded reference');
    const snapshot = await inspectSourceJournal(owned.journal);
    expect(snapshot.resources[0]?.reference).toBe(reference);
    expect(snapshot.resources[0]?.status).toBe('recorded');
    const remove = await appendSourceIntent(owned.journal, {
      operation: 'remove',
      resource: reference,
    });
    await recordSourceObservation(
      owned.journal,
      await dispatchSourceIntent(owned.journal, remove),
      { observationSha256: '3'.repeat(64) },
    );
    expect((await inspectSourceJournal(owned.journal)).resources[0]?.status).toBe(
      'absence-recorded',
    );
    await rejects(appendSourceIntent(owned.journal, { operation: 'start', resource: reference }));
    const seal = await sealSourceJournal(owned.journal);
    expect(seal.evidence).toBe('private-control');
    expect(seal.count).toBe(8);
    expect(seal.entries.length).toBe(8);
    await rejects(
      appendSourceIntent(owned.journal, {
        operation: 'create',
        resourceClass: 'file',
        purpose: 'inputs',
      }),
    );
    const closing = closeSourceJournal(owned.journal);
    expect(closeSourceJournal(owned.journal)).toBe(closing);
    await closing;
    expect((await readdir(owned.directoryPath)).length).toBe(8);
  } finally {
    await closeSourceJournal(owned.journal);
    await rm(owned.parentPath, { recursive: true });
  }
});
test('original intent dispatch is one shot and uncertain create grants no reference', async () => {
  const owned = await journalFixture();
  try {
    const intent = await appendSourceIntent(owned.journal, {
      operation: 'create',
      resourceClass: 'file',
      purpose: 'inputs',
    });
    await rejects(dispatchSourceIntent(owned.journal, { ...intent }));
    const dispatch = await dispatchSourceIntent(owned.journal, intent);
    await rejects(dispatchSourceIntent(owned.journal, intent));
    await rejects(recordSourceUncertainty(owned.journal, { ...dispatch }, 'operation-failed'));
    await recordSourceUncertainty(owned.journal, dispatch, 'response-unavailable');
    const snapshot = await inspectSourceJournal(owned.journal);
    expect(snapshot.phase).toBe('cleanup-only');
    expect(snapshot.resources).toEqual([]);
    await rejects(
      appendSourceIntent(owned.journal, {
        operation: 'create',
        resourceClass: 'file',
        purpose: 'inputs',
      }),
    );
    expect((await sealSourceJournal(owned.journal)).evidence).toBe('private-control');
  } finally {
    await closeSourceJournal(owned.journal);
    await rm(owned.parentPath, { recursive: true });
  }
});
test('abandonment settles original intention without dispatch', async () => {
  const owned = await journalFixture();
  try {
    const intent = await appendSourceIntent(owned.journal, {
      operation: 'create',
      resourceClass: 'file',
      purpose: 'inputs',
    });
    await abandonSourceIntent(owned.journal, intent);
    await rejects(dispatchSourceIntent(owned.journal, intent));
    expect((await sealSourceJournal(owned.journal)).count).toBe(4);
  } finally {
    await closeSourceJournal(owned.journal);
    await rm(owned.parentPath, { recursive: true });
  }
});

async function dispose(owned: Awaited<ReturnType<typeof journalFixture>>) {
  try {
    const closures = await Promise.allSettled([closeSourceJournal(owned.journal)]);
    for (const closure of closures)
      if (closure.status === 'rejected') expect(closure.reason).toBeInstanceOf(Error);
  } finally {
    await owned.parent.close();
    await owned.directory.close();
    await rm(owned.parentPath, { recursive: true });
  }
}
async function pendingCreation() {
  const owned = await journalFixture();
  const intent = await appendSourceIntent(owned.journal, {
    operation: 'create',
    resourceClass: 'network',
    purpose: 'transport',
  });
  return { ...owned, intent };
}
test('replaced named attempt refuses effect dispatch', async () => {
  const owned = await pendingCreation();
  try {
    await rename(owned.directoryPath, `${owned.directoryPath}-detached`);
    await mkdir(owned.directoryPath, { mode: 0o700 });
    await rejects(dispatchSourceIntent(owned.journal, owned.intent));
    expect((await readdir(`${owned.directoryPath}-detached`)).length).toBe(2);
  } finally {
    await dispose(owned);
  }
});
test('same-byte replacement inode refuses effect dispatch', async () => {
  const owned = await pendingCreation();
  try {
    const filename = `${owned.directoryPath}/00000000.claim.json`;
    const bytes = await readFile(filename);
    await rename(filename, `${owned.parentPath}/retained-original`);
    await writeFile(filename, bytes, { mode: 0o600, flag: 'wx' });
    await rejects(dispatchSourceIntent(owned.journal, owned.intent));
    expect((await readdir(owned.directoryPath)).length).toBe(2);
  } finally {
    await dispose(owned);
  }
});
for (const fault of ['missing', 'mode', 'foreign', 'hardlink'] as const)
  test(`retained entry ${fault} refuses fresh inspection`, async () => {
    const owned = await journalFixture();
    const filename = `${owned.directoryPath}/00000000.claim.json`;
    try {
      if (fault === 'missing') await unlink(filename);
      if (fault === 'mode') await chmod(filename, 0);
      if (fault === 'foreign') await writeFile(`${owned.directoryPath}/foreign`, 'sentinel');
      if (fault === 'hardlink') {
        const { link } = await import('node:fs/promises');
        await link(filename, `${owned.parentPath}/duplicate`);
      }
      await rejects(inspectSourceJournal(owned.journal));
      await rejects(sealSourceJournal(owned.journal));
    } finally {
      if (fault === 'mode') await chmod(filename, 0o600);
      await dispose(owned);
    }
  });
test('actual owner read removal yields EACCES on this non-root owned fixture', async () => {
  const owned = await journalFixture();
  const filename = `${owned.directoryPath}/00000000.claim.json`;
  try {
    await chmod(filename, 0);
    if (process.geteuid?.() === 0) {
      expect((await lstat(filename)).mode & 0o7777).toBe(0);
    } else {
      await rejects(readFile(filename), { code: 'EACCES' });
    }
    await rejects(inspectSourceJournal(owned.journal));
  } finally {
    await chmod(filename, 0o600);
    await dispose(owned);
  }
});
test('closed operation identity and outcome reject sentinel without publishing', async () => {
  const owned = await pendingCreation();
  try {
    for (const request of [
      { operation: 'exec', argv: 'SENTINEL' },
      { operation: 'create', resourceClass: 'socket', purpose: 'source' },
      { operation: 'create', resourceClass: 'file', purpose: 'unknown' },
    ])
      await rejects(appendSourceIntent(owned.journal, request));
    expect((await readdir(owned.directoryPath)).length).toBe(2);
    const dispatch = await dispatchSourceIntent(owned.journal, owned.intent);
    for (const identity of [
      { kind: 'network', id: 'BAD' },
      { kind: 'file', device: '00', inode: '1', uid: 0, gid: 0, mode: 0 },
      { kind: 'network', id: '1'.repeat(64), error: 'SENTINEL' },
    ])
      await rejects(
        recordSourceObservation(owned.journal, dispatch, {
          identity,
          observationSha256: '2'.repeat(64),
        }),
      );
    await rejects(recordSourceUncertainty(owned.journal, dispatch, { error: 'SENTINEL' }));
    expect((await readdir(owned.directoryPath)).length).toBe(3);
    await recordSourceUncertainty(owned.journal, dispatch, 'operation-failed');
  } finally {
    await dispose(owned);
  }
});
test('class join and duplicate stable identity cannot mint resource reference', async () => {
  const owned = await pendingCreation();
  try {
    const first = await dispatchSourceIntent(owned.journal, owned.intent);
    await rejects(
      recordSourceObservation(owned.journal, first, {
        identity: { kind: 'container', id: '1'.repeat(64), imageId: `sha256:${'2'.repeat(64)}` },
        observationSha256: '3'.repeat(64),
      }),
    );
    await recordSourceObservation(owned.journal, first, {
      identity: { kind: 'network', id: '1'.repeat(64) },
      observationSha256: '3'.repeat(64),
    });
    const second = await dispatchSourceIntent(
      owned.journal,
      await appendSourceIntent(owned.journal, {
        operation: 'create',
        resourceClass: 'network',
        purpose: 'transport',
      }),
    );
    await rejects(
      recordSourceObservation(owned.journal, second, {
        identity: { kind: 'network', id: '1'.repeat(64) },
        observationSha256: '3'.repeat(64),
      }),
    );
    expect((await inspectSourceJournal(owned.journal)).resources.length).toBe(1);
    await recordSourceUncertainty(owned.journal, second, 'operation-failed');
  } finally {
    await dispose(owned);
  }
});
test('overlap rejects inspection and concurrent dispatch before a second publication', async () => {
  const owned = await pendingCreation();
  try {
    const first = dispatchSourceIntent(owned.journal, owned.intent);
    await rejects(dispatchSourceIntent(owned.journal, owned.intent));
    await rejects(inspectSourceJournal(owned.journal));
    const dispatch = await first;
    await recordSourceUncertainty(owned.journal, dispatch, 'interrupted');
    expect((await readdir(owned.directoryPath)).length).toBe(4);
  } finally {
    await dispose(owned);
  }
});
test('cross journal parsed and spread token fields never mint authority', async () => {
  const owned = await pendingCreation();
  const other = await journalFixture();
  try {
    await rejects(dispatchSourceIntent(other.journal, owned.intent));
    await rejects(
      dispatchSourceIntent(owned.journal, JSON.parse(JSON.stringify(owned.intent)) as SourceIntent),
    );
    const dispatch = await dispatchSourceIntent(owned.journal, owned.intent);
    await rejects(
      recordSourceObservation(other.journal, dispatch, { observationSha256: '1'.repeat(64) }),
    );
    const reference = await recordSourceObservation(owned.journal, dispatch, {
      identity: { kind: 'network', id: '1'.repeat(64) },
      observationSha256: '2'.repeat(64),
    });
    await rejects(appendSourceIntent(other.journal, { operation: 'remove', resource: reference }));
    await rejects(
      appendSourceIntent(owned.journal, { operation: 'remove', resource: { ...reference } }),
    );
    await rejects(recordSourceUncertainty(owned.journal, dispatch, 'interrupted'));
  } finally {
    await dispose(owned);
    await dispose(other);
  }
});
test('outstanding intention ceiling refuses bounded next publication', async () => {
  const owned = await journalFixture();
  try {
    for (let count = 0; count < 32; count++)
      await appendSourceIntent(owned.journal, {
        operation: 'create',
        resourceClass: 'network',
        purpose: 'transport',
      });
    await rejects(
      appendSourceIntent(owned.journal, {
        operation: 'create',
        resourceClass: 'network',
        purpose: 'transport',
      }),
    );
    expect((await readdir(owned.directoryPath)).length).toBe(33);
  } finally {
    await dispose(owned);
  }
});
test('close synchronously invalidates originals and settles both descriptors', async () => {
  const owned = await pendingCreation();
  try {
    const closing = closeSourceJournal(owned.journal);
    await rejects(dispatchSourceIntent(owned.journal, owned.intent));
    await closing;
    expect(owned.parent.fd).toBe(-1);
    expect(owned.directory.fd).toBe(-1);
    expect(closeSourceJournal(owned.journal)).toBe(closing);
  } finally {
    await dispose(owned);
  }
});
test('exclusive claim collision cannot truncate original persisted bytes', async () => {
  const owned = await journalFixture();
  try {
    const filename = `${owned.directoryPath}/00000000.claim.json`;
    const bytes = await readFile(filename);
    const parent = await open(owned.parentPath, constants.O_RDONLY | constants.O_DIRECTORY);
    const directory = await open(owned.directoryPath, constants.O_RDONLY | constants.O_DIRECTORY);
    await rejects(
      createSourceJournal({ parent, directory, claim, deadline: performance.now() + 10000 }),
    );
    expect(await readFile(filename)).toEqual(bytes);
    expect(parent.fd).toBe(-1);
    expect(directory.fd).toBe(-1);
  } finally {
    await dispose(owned);
  }
});
test('two constructors racing mint at most one original journal', async () => {
  const owned = await fixture();
  const parent = await open(owned.parentPath, constants.O_RDONLY | constants.O_DIRECTORY);
  const directory = await open(owned.directoryPath, constants.O_RDONLY | constants.O_DIRECTORY);
  const originalRead = filesystem.readdir;
  let arrivals = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const readRoster = async (...parameters: unknown[]) => {
    const names = (await Reflect.apply(originalRead, filesystem, parameters)) as Awaited<
      ReturnType<typeof filesystem.readdir>
    >;
    if (names.length === 0) {
      arrivals++;
      if (arrivals === 2) release?.();
      await gate;
    }
    return names;
  };
  const roster = spyOn(filesystem, 'readdir').mockImplementation(
    readRoster as typeof filesystem.readdir,
  );
  const attempts = await Promise.allSettled([
    createSourceJournal({
      parent: owned.parent,
      directory: owned.directory,
      claim,
      deadline: performance.now() + 10000,
    }),
    createSourceJournal({ parent, directory, claim, deadline: performance.now() + 10000 }),
  ]);
  roster.mockRestore();
  try {
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled').length).toBe(1);
  } finally {
    for (const attempt of attempts)
      if (attempt.status === 'fulfilled') await closeSourceJournal(attempt.value);
    await rm(owned.parentPath, { recursive: true });
  }
});
for (const fault of ['missing', 'symlink', 'mode', 'nonempty'] as const)
  test(`constructor ${fault} directory boundary refuses and closes`, async () => {
    const owned = await fixture();
    try {
      if (fault === 'missing') await rename(owned.directoryPath, `${owned.directoryPath}-moved`);
      if (fault === 'symlink') {
        await rename(owned.directoryPath, `${owned.directoryPath}-moved`);
        await symlink(`${owned.directoryPath}-moved`, owned.directoryPath);
      }
      if (fault === 'mode') await chmod(owned.parentPath, 0o750);
      if (fault === 'nonempty') await writeFile(`${owned.directoryPath}/foreign`, 'sentinel');
      await rejects(
        createSourceJournal({
          parent: owned.parent,
          directory: owned.directory,
          claim,
          deadline: performance.now() + 10000,
        }),
      );
      expect(owned.parent.fd).toBe(-1);
      expect(owned.directory.fd).toBe(-1);
    } finally {
      await owned.parent.close();
      await owned.directory.close();
      await rm(owned.parentPath, { recursive: true });
    }
  });

test('filesystem read failure poisons journal retains primary and closes both transferred descriptors', async () => {
  const owned = await pendingCreation();
  const prototype = Object.getPrototypeOf(owned.directory) as FileHandle;
  const failure = Object.assign(new Error('owned-read-denied'), { code: 'EACCES' });
  const read = spyOn(prototype, 'read').mockRejectedValueOnce(failure);
  try {
    await rejects(
      dispatchSourceIntent(owned.journal, owned.intent),
      (cause: unknown) => cause === failure,
    );
    expect(owned.parent.fd).toBe(-1);
    expect(owned.directory.fd).toBe(-1);
    await rejects(inspectSourceJournal(owned.journal));
  } finally {
    read.mockRestore();
    await dispose(owned);
  }
});
test('exact byte readback refuses corrupt read dependency without minting dispatch', async () => {
  const owned = await pendingCreation();
  const prototype = Object.getPrototypeOf(owned.directory) as FileHandle;
  const original = Object.getOwnPropertyDescriptor(prototype, 'read')?.value as FileHandle['read'];
  const read = spyOn(prototype, 'read').mockImplementation(async function (
    this: FileHandle,
    ...parameters: unknown[]
  ) {
    const completed = (await Reflect.apply(original, this, parameters)) as {
      bytesRead: number;
      buffer: Buffer;
    };
    if (completed.bytesRead > 0) completed.buffer[0] ^= 1;
    return completed;
  });
  try {
    await rejects(dispatchSourceIntent(owned.journal, owned.intent));
  } finally {
    read.mockRestore();
    await dispose(owned);
  }
});
for (const kind of ['file', 'directory'] as const)
  test(`${kind} sync witness precedes returned dispatch and inert effect`, async () => {
    const owned = await pendingCreation();
    const prototype = Object.getPrototypeOf(owned.directory) as FileHandle;
    const original = Object.getOwnPropertyDescriptor(prototype, 'sync')
      ?.value as FileHandle['sync'];
    let release: (() => void) | undefined;
    const sequencing = { entered: false, returned: false };
    let effects = 0;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sync = spyOn(prototype, 'sync').mockImplementation(async function (this: FileHandle) {
      const stat = await this.stat();
      if ((kind === 'file' && stat.isFile()) || (kind === 'directory' && stat.isDirectory())) {
        sequencing.entered = true;
        await gate;
      }
      await original.call(this);
    });
    const pending = dispatchSourceIntent(owned.journal, owned.intent).then((dispatch) => {
      sequencing.returned = true;
      effects++;
      return dispatch;
    });
    try {
      for (let turn = 0; turn < 100; turn++) {
        await Bun.sleep(1);
        if (sequencing.entered || sequencing.returned) break;
      }
      expect(sequencing.entered).toBe(true);
      expect(sequencing.returned).toBe(false);
      expect(effects).toBe(0);
      release?.();
      const dispatch = await pending;
      expect(effects).toBe(1);
      await recordSourceUncertainty(owned.journal, dispatch, 'interrupted');
    } finally {
      release?.();
      sync.mockRestore();
      await pending.catch(() => undefined);
      await dispose(owned);
    }
  });
test('partial publication remains evidence and closes both owned descriptors on sync failure', async () => {
  const owned = await pendingCreation();
  const failure = new Error('owned-directory-sync-failed');
  const sync = spyOn(owned.directory, 'sync').mockRejectedValueOnce(failure);
  try {
    await rejects(
      dispatchSourceIntent(owned.journal, owned.intent),
      (cause: unknown) => cause === failure,
    );
    expect((await readdir(owned.directoryPath)).length).toBe(3);
    expect(owned.parent.fd).toBe(-1);
    expect(owned.directory.fd).toBe(-1);
    await rejects(sealSourceJournal(owned.journal));
  } finally {
    sync.mockRestore();
    await dispose(owned);
  }
});
test('record byte ceiling refuses a bounded serializer dependency fault before publication', async () => {
  const owned = await pendingCreation();
  const original = JSON.stringify;
  const serialize = spyOn(JSON, 'stringify').mockImplementation(
    (value: unknown) => `${original(value)}${' '.repeat(16384)}`,
  );
  try {
    await rejects(dispatchSourceIntent(owned.journal, owned.intent));
    expect((await readdir(owned.directoryPath)).length).toBe(2);
  } finally {
    serialize.mockRestore();
    await dispose(owned);
  }
});
test('expired original deadline never returns an effect dispatch', async () => {
  const owned = await fixture();
  const journal = await createSourceJournal({
    parent: owned.parent,
    directory: owned.directory,
    claim,
    deadline: performance.now() + 100,
  });
  try {
    const intent = await appendSourceIntent(journal, {
      operation: 'create',
      resourceClass: 'network',
      purpose: 'transport',
    });
    await Bun.sleep(110);
    await rejects(dispatchSourceIntent(journal, intent));
    expect((await readdir(owned.directoryPath)).length).toBe(2);
  } finally {
    const closures = await Promise.allSettled([closeSourceJournal(journal)]);
    for (const closure of closures)
      if (closure.status === 'rejected') expect(closure.reason).toBeInstanceOf(Error);
    await rm(owned.parentPath, { recursive: true });
  }
});

test('cleanup-only refuses a creation intention retained before another uncertain effect', async () => {
  const owned = await pendingCreation();
  try {
    const later = await appendSourceIntent(owned.journal, {
      operation: 'create',
      resourceClass: 'file',
      purpose: 'inputs',
    });
    await recordSourceUncertainty(
      owned.journal,
      await dispatchSourceIntent(owned.journal, owned.intent),
      'interrupted',
    );
    await rejects(dispatchSourceIntent(owned.journal, later));
    expect((await readdir(owned.directoryPath)).length).toBe(5);
    await abandonSourceIntent(owned.journal, later);
  } finally {
    await dispose(owned);
  }
});
test('both owned closes are attempted and close failure is retained without retry', async () => {
  const owned = await journalFixture();
  const primary = new Error('owned-close-failed');
  const close = spyOn(owned.parent, 'close').mockRejectedValueOnce(primary);
  try {
    const closing = closeSourceJournal(owned.journal);
    await rejects(closing, { cleanup: [primary] });
    expect(owned.directory.fd).toBe(-1);
    expect(owned.parent.fd).toBeGreaterThanOrEqual(0);
    expect(closeSourceJournal(owned.journal)).toBe(closing);
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    close.mockRestore();
    await owned.parent.close();
    await owned.directory.close();
    await rm(owned.parentPath, { recursive: true });
  }
});
test('fixed record planner admits exact last record and rejects next count', () => {
  expect(reserveSourceJournalRecord(4095, 1024, 1024)).toEqual({
    recordCount: 4096,
    chargedBytes: 2048,
  });
  expect(() => reserveSourceJournalRecord(4096, 2048, 1024)).toThrow();
});
test('fixed record planner admits exact record bytes and cumulative bytes without resetting charge', () => {
  expect(reserveSourceJournalRecord(3, 2048, 16384)).toEqual({
    recordCount: 4,
    chargedBytes: 18432,
  });
  expect(() => reserveSourceJournalRecord(3, 2048, 16385)).toThrow();
  expect(reserveSourceJournalRecord(4095, 4193280, 1024)).toEqual({
    recordCount: 4096,
    chargedBytes: 4194304,
  });
  expect(() => reserveSourceJournalRecord(4095, 4193281, 1024)).toThrow();
});
test('fixed planners reject malformed or already out of range state', () => {
  for (const invalid of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    expect(() => reserveSourceJournalRecord(invalid, 0, 1024)).toThrow();
    expect(() => reserveSourceJournalRecord(0, invalid, 1024)).toThrow();
    expect(() => reserveSourceJournalRecord(0, 0, invalid)).toThrow();
    expect(() => reserveSourceJournalCreation(invalid, 0)).toThrow();
    expect(() => reserveSourceJournalCreation(0, invalid)).toThrow();
  }
  expect(() => reserveSourceJournalRecord(4097, 0, 1024)).toThrow();
  expect(() => reserveSourceJournalRecord(0, 4194305, 1024)).toThrow();
  expect(() => reserveSourceJournalRecord(0, 0, 0)).toThrow();
  expect(() =>
    reserveSourceJournalCreation(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
  ).toThrow();
});
test('fixed creation planner counts lifetime recorded references and independent pending reservations', () => {
  expect(reserveSourceJournalCreation(255, 0)).toBe(256);
  expect(() => reserveSourceJournalCreation(256, 0)).toThrow();
  expect(reserveSourceJournalCreation(224, 31)).toBe(256);
  expect(() => reserveSourceJournalCreation(225, 31)).toThrow();
});

async function instrumentJournal(before: string, after: string) {
  const source = await readFile(new URL('./source-stageb-journal.ts', import.meta.url), 'utf8');
  expect(source.split(before).length).toBe(2);
  const copyPath = await mkdtemp('/tmp/puni-stageb-journal-tests/source-copy-');
  const filename = `${copyPath}/journal.ts`;
  await writeFile(filename, source.replace(before, after), { mode: 0o600, flag: 'wx' });
  const api = (await import(filename)) as typeof JournalApi;
  return { api, copyPath };
}
async function copyFixture(before: string, after: string) {
  const instrument = await instrumentJournal(before, after);
  const owned = await fixture();
  const journal = await instrument.api.createSourceJournal({
    parent: owned.parent,
    directory: owned.directory,
    claim,
    deadline: performance.now() + 10000,
  });
  return { ...owned, ...instrument, journal };
}
async function disposeCopy(owned: Awaited<ReturnType<typeof copyFixture>>) {
  try {
    const closures = await Promise.allSettled([owned.api.closeSourceJournal(owned.journal)]);
    for (const closure of closures)
      if (closure.status === 'rejected') expect(closure.reason).toBeInstanceOf(Error);
  } finally {
    await owned.parent.close();
    await owned.directory.close();
    await rm(owned.parentPath, { recursive: true });
    await rm(owned.copyPath, { recursive: true });
  }
}
test('instrumented record-count consumer refuses ninth real immutable entry at private cap eight', async () => {
  const owned = await copyFixture('const recordLimit = 4096;', 'const recordLimit = 8;');
  try {
    for (let count = 0; count < 3; count++) {
      const intent = await owned.api.appendSourceIntent(owned.journal, {
        operation: 'create',
        resourceClass: 'network',
        purpose: 'transport',
      });
      await owned.api.abandonSourceIntent(owned.journal, intent);
    }
    const last = await owned.api.appendSourceIntent(owned.journal, {
      operation: 'create',
      resourceClass: 'network',
      purpose: 'transport',
    });
    expect((await readdir(owned.directoryPath)).length).toBe(8);
    await rejects(owned.api.abandonSourceIntent(owned.journal, last));
    expect((await readdir(owned.directoryPath)).length).toBe(8);
  } finally {
    await disposeCopy(owned);
  }
});
test('instrumented cumulative consumer uses actual persisted bytes and refuses crossing private cap 4096', async () => {
  const owned = await copyFixture(
    'const journalBytesLimit = 4194304;',
    'const journalBytesLimit = 4096;',
  );
  const original = JSON.stringify;
  let nextBytes = 0;
  const serialize = spyOn(JSON, 'stringify').mockImplementation((value: unknown) => {
    const serialized = original(value);
    nextBytes = Buffer.byteLength(serialized, 'utf8') + 1;
    return serialized;
  });
  let failure: unknown;
  let acceptedTotal = 0;
  let acceptedCount = 0;
  try {
    let pending: SourceIntent | undefined;
    for (let count = 0; count < 32; count++) {
      const names = await readdir(owned.directoryPath);
      acceptedCount = names.length;
      acceptedTotal = 0;
      for (const name of names)
        acceptedTotal += (await readFile(`${owned.directoryPath}/${name}`)).length;
      try {
        if (pending === undefined)
          pending = await owned.api.appendSourceIntent(owned.journal, {
            operation: 'create',
            resourceClass: 'network',
            purpose: 'transport',
          });
        else {
          await owned.api.abandonSourceIntent(owned.journal, pending);
          pending = undefined;
        }
      } catch (cause) {
        failure = cause;
        break;
      }
    }
    expect(failure).toBeInstanceOf(Error);
    const names = await readdir(owned.directoryPath);
    let persistedTotal = 0;
    for (const name of names)
      persistedTotal += (await readFile(`${owned.directoryPath}/${name}`)).length;
    expect(names.length).toBe(acceptedCount);
    expect(persistedTotal).toBe(acceptedTotal);
    expect(persistedTotal).toBeLessThanOrEqual(4096);
    expect(persistedTotal + nextBytes).toBeGreaterThan(4096);
  } finally {
    serialize.mockRestore();
    await disposeCopy(owned);
  }
});
for (const pending of [false, true])
  test(`instrumented resource consumer counts ${pending ? 'pending creations' : 'absence-recorded lifetime references'} at private cap two`, async () => {
    const owned = await copyFixture('const resourceLimit = 256;', 'const resourceLimit = 2;');
    try {
      const firstIntent = await owned.api.appendSourceIntent(owned.journal, {
        operation: 'create',
        resourceClass: 'network',
        purpose: 'transport',
      });
      const first = await owned.api.recordSourceObservation(
        owned.journal,
        await owned.api.dispatchSourceIntent(owned.journal, firstIntent),
        { identity: { kind: 'network', id: '1'.repeat(64) }, observationSha256: '3'.repeat(64) },
      );
      if (first === undefined) throw new Error('original reference absent');
      const secondIntent = await owned.api.appendSourceIntent(owned.journal, {
        operation: 'create',
        resourceClass: 'network',
        purpose: 'transport',
      });
      if (!pending) {
        await owned.api.recordSourceObservation(
          owned.journal,
          await owned.api.dispatchSourceIntent(owned.journal, secondIntent),
          { identity: { kind: 'network', id: '2'.repeat(64) }, observationSha256: '3'.repeat(64) },
        );
        const remove = await owned.api.appendSourceIntent(owned.journal, {
          operation: 'remove',
          resource: first,
        });
        await owned.api.recordSourceObservation(
          owned.journal,
          await owned.api.dispatchSourceIntent(owned.journal, remove),
          { observationSha256: '3'.repeat(64) },
        );
      }
      const names = await readdir(owned.directoryPath);
      await rejects(
        owned.api.appendSourceIntent(owned.journal, {
          operation: 'create',
          resourceClass: 'network',
          purpose: 'transport',
        }),
      );
      expect(await readdir(owned.directoryPath)).toEqual(names);
      expect((await owned.api.inspectSourceJournal(owned.journal)).resources.length).toBe(
        pending ? 1 : 2,
      );
    } finally {
      await disposeCopy(owned);
    }
  });

function deferred() {
  let complete: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    complete = resolve;
  });
  return {
    promise,
    release: () => {
      if (complete === undefined) throw new Error('gate controller absent');
      complete();
    },
  };
}
async function observeDeadline(deadline: number) {
  await Bun.sleep(Math.max(0, deadline - performance.now()) + 20);
}
for (const closeFails of [false, true])
  test(`joined lifetime late acquisition ${closeFails ? 'retains cleanup failure' : 'remains pending until release'}`, async () => {
    const owned = await fixture();
    const deadline = performance.now() + 120;
    const journal = await createSourceJournal({
      parent: owned.parent,
      directory: owned.directory,
      claim,
      deadline,
    });
    const intent = await appendSourceIntent(journal, {
      operation: 'create',
      resourceClass: 'network',
      purpose: 'transport',
    });
    const entered = deferred();
    const gate = deferred();
    const original = filesystem.open;
    let leaf: FileHandle | undefined;
    let disposal: ReturnType<typeof spyOn<FileHandle, 'close'>> | undefined;
    const cleanup = new Error('late-owned-leaf-close-failed');
    const opening = spyOn(filesystem, 'open').mockImplementation(
      async (...parameters: Parameters<typeof filesystem.open>) => {
        const acquired = await original(...parameters);
        leaf = acquired;
        if (closeFails) disposal = spyOn(acquired, 'close').mockRejectedValue(cleanup);
        entered.release();
        await gate.promise;
        return acquired;
      },
    );
    let finished = false;
    const outcome = dispatchSourceIntent(journal, intent)
      .then(
        (dispatch) => ({ dispatch }),
        (failure: unknown) => ({ failure }),
      )
      .finally(() => {
        finished = true;
      });
    try {
      await entered.promise;
      await observeDeadline(deadline);
      const closing = closeSourceJournal(journal);
      let closed = false;
      const settled = closing
        .then(
          () => ({ ok: true }),
          (failure: unknown) => ({ failure }),
        )
        .finally(() => {
          closed = true;
        });
      await Bun.sleep(20);
      expect(finished).toBe(false);
      expect(closed).toBe(false);
      expect(leaf?.fd).toBeGreaterThanOrEqual(0);
      gate.release();
      const completion = await outcome;
      const closure = await settled;
      expect('failure' in completion).toBe(true);
      if (closeFails) {
        expect('failure' in closure).toBe(true);
        if (!('failure' in completion)) throw new Error('failure absent');
        expect(completion.failure).toMatchObject({
          primary: { message: 'source journal deadline exceeded' },
          cleanup: [cleanup],
        });
        expect(disposal).toHaveBeenCalledTimes(1);
        expect(closeSourceJournal(journal)).toBe(closing);
      } else {
        expect(leaf?.fd).toBe(-1);
        if (!('failure' in closure) || !('failure' in completion))
          throw new Error('settled failure absent');
        expect(closure.failure).toBe(completion.failure);
      }
      expect(owned.parent.fd).toBe(-1);
      expect(owned.directory.fd).toBe(-1);
    } finally {
      gate.release();
      opening.mockRestore();
      disposal?.mockRestore();
      await outcome;
      await leaf?.close();
      await owned.parent.close();
      await owned.directory.close();
      await rm(owned.parentPath, { recursive: true });
    }
  });
test('joined lifetime explicit close waits for failed outstanding owned sync', async () => {
  const owned = await pendingCreation();
  const entered = deferred();
  const gate = deferred();
  const late = new Error('late-sync-failed');
  const sync = spyOn(owned.directory, 'sync').mockImplementation(async () => {
    entered.release();
    await gate.promise;
    throw late;
  });
  let finished = false;
  const outcome = dispatchSourceIntent(owned.journal, owned.intent)
    .then(
      () => ({ ok: true }),
      (failure: unknown) => ({ failure }),
    )
    .finally(() => {
      finished = true;
    });
  try {
    await entered.promise;
    const closing = closeSourceJournal(owned.journal);
    let closed = false;
    const settlement = closing
      .then(
        () => ({ ok: true }),
        (failure: unknown) => ({ failure }),
      )
      .finally(() => {
        closed = true;
      });
    await rejects(dispatchSourceIntent(owned.journal, owned.intent));
    await Bun.sleep(20);
    expect(finished).toBe(false);
    expect(closed).toBe(false);
    const names = await readdir(owned.directoryPath);
    gate.release();
    const completion = await outcome;
    const closure = await settlement;
    expect(completion).toEqual({ failure: late });
    expect(closure).toEqual(completion);
    expect(await readdir(owned.directoryPath)).toEqual(names);
    expect(owned.parent.fd).toBe(-1);
    expect(owned.directory.fd).toBe(-1);
  } finally {
    gate.release();
    sync.mockRestore();
    await outcome;
    await owned.parent.close();
    await owned.directory.close();
    await rm(owned.parentPath, { recursive: true });
  }
});
test('joined lifetime constructor timeout joins late leaf and retains cleanup failure', async () => {
  const owned = await fixture();
  const deadline = performance.now() + 100;
  const original = filesystem.open;
  const entered = deferred();
  const gate = deferred();
  const cleanup = new Error('constructor-late-close-failed');
  let leaf: FileHandle | undefined;
  let disposal: ReturnType<typeof spyOn<FileHandle, 'close'>> | undefined;
  const opening = spyOn(filesystem, 'open').mockImplementation(
    async (...parameters: Parameters<typeof filesystem.open>) => {
      const acquired = await original(...parameters);
      leaf = acquired;
      disposal = spyOn(acquired, 'close').mockRejectedValue(cleanup);
      entered.release();
      await gate.promise;
      return acquired;
    },
  );
  let finished = false;
  const outcome = createSourceJournal({
    parent: owned.parent,
    directory: owned.directory,
    claim,
    deadline,
  })
    .then(
      () => ({ ok: true }),
      (failure: unknown) => ({ failure }),
    )
    .finally(() => {
      finished = true;
    });
  try {
    await entered.promise;
    await observeDeadline(deadline);
    expect(finished).toBe(false);
    gate.release();
    const completion = await outcome;
    expect(completion).toMatchObject({
      failure: { primary: { message: 'source journal deadline exceeded' }, cleanup: [cleanup] },
    });
    expect(disposal).toHaveBeenCalledTimes(1);
    expect(owned.parent.fd).toBe(-1);
    expect(owned.directory.fd).toBe(-1);
    expect(await readdir(owned.directoryPath)).toEqual([]);
  } finally {
    gate.release();
    opening.mockRestore();
    disposal?.mockRestore();
    await outcome;
    await leaf?.close();
    await owned.parent.close();
    await owned.directory.close();
    await rm(owned.parentPath, { recursive: true });
  }
});
test('joined lifetime never invokes next filesystem action after synchronous close admission', async () => {
  const owned = await pendingCreation();
  const original = owned.parent.stat.bind(owned.parent);
  let closure: Promise<unknown> | undefined;
  const stat = spyOn(owned.parent, 'stat').mockImplementation((async (...parameters: unknown[]) => {
    const identity = (await Reflect.apply(original, owned.parent, parameters)) as Awaited<
      ReturnType<FileHandle['stat']>
    >;
    closure = Promise.allSettled([closeSourceJournal(owned.journal)]);
    return identity;
  }) as FileHandle['stat']);
  const originalDirectory = owned.directory.stat.bind(owned.directory);
  const observed = spyOn(owned.directory, 'stat').mockImplementation(originalDirectory);
  try {
    await rejects(dispatchSourceIntent(owned.journal, owned.intent));
    expect(observed).toHaveBeenCalledTimes(0);
  } finally {
    stat.mockRestore();
    observed.mockRestore();
    await closure;
    await owned.parent.close();
    await owned.directory.close();
    await rm(owned.parentPath, { recursive: true });
  }
});

for (const field of ['uid', 'gid'] as const)
  test(`constructor controlled foreign ${field} stat refuses before claim`, async () => {
    const owned = await fixture();
    const original = owned.parent.stat.bind(owned.parent);
    const changed = spyOn(owned.parent, 'stat').mockImplementation((async (
      ...parameters: unknown[]
    ) => {
      const identity = (await Reflect.apply(original, owned.parent, parameters)) as BigIntStats;
      return Object.assign(
        Object.create(Object.getPrototypeOf(identity) as object) as BigIntStats,
        identity,
        { [field]: identity[field] + 1n },
      );
    }) as unknown as FileHandle['stat']);
    let journal: Awaited<ReturnType<typeof createSourceJournal>> | undefined;
    try {
      await rejects(
        createSourceJournal({
          parent: owned.parent,
          directory: owned.directory,
          claim,
          deadline: performance.now() + 10000,
        }).then((accepted) => {
          journal = accepted;
        }),
        /private directory refused/,
      );
      expect(await readdir(owned.directoryPath)).toEqual([]);
      expect(owned.parent.fd).toBe(-1);
      expect(owned.directory.fd).toBe(-1);
    } finally {
      changed.mockRestore();
      if (journal !== undefined) await closeSourceJournal(journal);
      await owned.parent.close();
      await owned.directory.close();
      await rm(owned.parentPath, { recursive: true });
    }
  });
for (const alias of ['same-handle-and-fd', 'separately-opened-same-inode'] as const)
  test(`constructor actual ${alias} refuses only transferred descriptors`, async () => {
    const owned = await fixture();
    const directory =
      alias === 'same-handle-and-fd'
        ? owned.parent
        : await open(owned.parentPath, constants.O_RDONLY | constants.O_DIRECTORY);
    const originalClose = owned.parent.close.bind(owned.parent);
    const transferredClose = spyOn(owned.parent, 'close').mockImplementation(originalClose);
    let journal: Awaited<ReturnType<typeof createSourceJournal>> | undefined;
    try {
      await rejects(
        createSourceJournal({
          parent: owned.parent,
          directory,
          claim,
          deadline: performance.now() + 10000,
        }).then((accepted) => {
          journal = accepted;
        }),
        alias === 'same-handle-and-fd' ? /descriptor alias/ : /directory alias/,
      );
      expect(transferredClose).toHaveBeenCalledTimes(1);
      expect(owned.parent.fd).toBe(-1);
      expect(directory.fd).toBe(-1);
      expect(owned.directory.fd).toBeGreaterThanOrEqual(0);
      expect(await readdir(owned.directoryPath)).toEqual([]);
    } finally {
      transferredClose.mockRestore();
      if (journal !== undefined) await closeSourceJournal(journal);
      await owned.parent.close();
      await directory.close();
      await owned.directory.close();
      await rm(owned.parentPath, { recursive: true });
    }
  });
for (const dependency of ['uid-function', 'gid-function', 'platform'] as const)
  test(`constructor isolated ${dependency} dependency fault has explicit refusal and no claim`, async () => {
    const source = await readFile(new URL('./source-stageb-journal.ts', import.meta.url), 'utf8');
    const before = source;
    const observedPlatform =
      dependency === 'platform' ? "'controlled-unsupported-platform'" : 'process.platform';
    const observedUid = dependency === 'uid-function' ? 'undefined' : 'process.geteuid';
    const observedGid = dependency === 'gid-function' ? 'undefined' : 'process.getegid';
    const dependencyBinding = `const testRuntime = { platform: ${observedPlatform}, geteuid: ${observedUid}, getegid: ${observedGid} };\n`;
    const after =
      dependencyBinding +
      before
        .replaceAll('process.platform', 'testRuntime.platform')
        .replaceAll('process.geteuid', 'testRuntime.geteuid')
        .replaceAll('process.getegid', 'testRuntime.getegid');
    const instrument = await instrumentJournal(before, after);
    const owned = await fixture();
    let journal: Awaited<ReturnType<typeof createSourceJournal>> | undefined;
    try {
      await rejects(
        instrument.api
          .createSourceJournal({
            parent: owned.parent,
            directory: owned.directory,
            claim,
            deadline: performance.now() + 10000,
          })
          .then((accepted) => {
            journal = accepted;
          }),
        /platform refused/,
      );
      expect(await readdir(owned.directoryPath)).toEqual([]);
      expect(owned.parent.fd).toBe(-1);
      expect(owned.directory.fd).toBe(-1);
    } finally {
      if (journal !== undefined) await instrument.api.closeSourceJournal(journal);
      await owned.parent.close();
      await owned.directory.close();
      await rm(owned.parentPath, { recursive: true });
      await rm(instrument.copyPath, { recursive: true });
    }
  });
test('constructor actual short persisted write retains partial final record and returns no token', async () => {
  const owned = await fixture();
  const prototype = Object.getPrototypeOf(owned.directory) as FileHandle;
  const original = Object.getOwnPropertyDescriptor(prototype, 'writeFile')
    ?.value as FileHandle['writeFile'];
  let expected = 0;
  const writing = spyOn(prototype, 'writeFile').mockImplementation(async function (
    this: FileHandle,
    contents: Parameters<FileHandle['writeFile']>[0],
    options: Parameters<FileHandle['writeFile']>[1],
  ) {
    if (!Buffer.isBuffer(contents)) throw new Error('owned publication buffer absent');
    expected = contents.length;
    await original.call(this, contents.subarray(0, contents.length - 1), options);
  });
  let journal: Awaited<ReturnType<typeof createSourceJournal>> | undefined;
  try {
    await rejects(
      createSourceJournal({
        parent: owned.parent,
        directory: owned.directory,
        claim,
        deadline: performance.now() + 10000,
      }).then((accepted) => {
        journal = accepted;
      }),
      /record metadata refused/,
    );
    expect((await readFile(`${owned.directoryPath}/00000000.claim.json`)).length).toBe(
      expected - 1,
    );
    expect(owned.parent.fd).toBe(-1);
    expect(owned.directory.fd).toBe(-1);
  } finally {
    writing.mockRestore();
    if (journal !== undefined) await closeSourceJournal(journal);
    await owned.parent.close();
    await owned.directory.close();
    await rm(owned.parentPath, { recursive: true });
  }
});

test('joined lifetime retains first timeout independently of late IO and both transferred-close failures', async () => {
  const owned = await fixture();
  const deadline = performance.now() + 120;
  const journal = await createSourceJournal({
    parent: owned.parent,
    directory: owned.directory,
    claim,
    deadline,
  });
  const intent = await appendSourceIntent(journal, {
    operation: 'create',
    resourceClass: 'network',
    purpose: 'transport',
  });
  const entered = deferred();
  const gate = deferred();
  const original = owned.parent.stat.bind(owned.parent);
  const late = new Error('late-owned-stat-failed');
  const parentFailure = new Error('parent-close-failed');
  const directoryFailure = new Error('directory-close-failed');
  const parentClose = spyOn(owned.parent, 'close').mockRejectedValue(parentFailure);
  const directoryClose = spyOn(owned.directory, 'close').mockRejectedValue(directoryFailure);
  const stat = spyOn(owned.parent, 'stat').mockImplementation(async () => {
    await original({ bigint: true });
    entered.release();
    await gate.promise;
    throw late;
  });
  let finished = false;
  const outcome = dispatchSourceIntent(journal, intent)
    .then(
      () => ({ ok: true }),
      (failure: unknown) => ({ failure }),
    )
    .finally(() => {
      finished = true;
    });
  try {
    await entered.promise;
    await observeDeadline(deadline);
    expect(finished).toBe(false);
    const closing = closeSourceJournal(journal);
    const closure = Promise.allSettled([closing]);
    gate.release();
    const completion = await outcome;
    await closure;
    expect(completion).toMatchObject({
      failure: {
        primary: { message: 'source journal deadline exceeded' },
        cleanup: [late, parentFailure, directoryFailure],
      },
    });
    expect(parentClose).toHaveBeenCalledTimes(1);
    expect(directoryClose).toHaveBeenCalledTimes(1);
    expect(closeSourceJournal(journal)).toBe(closing);
  } finally {
    gate.release();
    stat.mockRestore();
    parentClose.mockRestore();
    directoryClose.mockRestore();
    await outcome;
    await owned.parent.close();
    await owned.directory.close();
    await rm(owned.parentPath, { recursive: true });
  }
});

test('representative file helper and descriptor observations remain detached private evidence', async () => {
  const owned = await journalFixture();
  const identities = [
    {
      kind: 'file',
      device: '1',
      inode: '2',
      uid: process.geteuid?.(),
      gid: process.getegid?.(),
      mode: 0o600,
    },
    {
      kind: 'helper',
      pid: 123,
      start: '456',
      uid: process.geteuid?.(),
      gid: process.getegid?.(),
      executableSha256: 'a'.repeat(64),
    },
    { kind: 'descriptor', descriptor: 99, device: '1', inode: '2', mode: 0o600 },
  ];
  try {
    for (const identity of identities) {
      const intent = await appendSourceIntent(owned.journal, {
        operation: 'create',
        resourceClass: identity.kind,
        purpose: 'instrument',
      });
      const reference = await recordSourceObservation(
        owned.journal,
        await dispatchSourceIntent(owned.journal, intent),
        { identity, observationSha256: 'b'.repeat(64) },
      );
      expect(reference).toBeDefined();
    }
    const file = identities[0];
    file.device = '999';
    const snapshot = await inspectSourceJournal(owned.journal);
    expect(snapshot.evidence).toBe('private-control');
    expect(snapshot.resources.length).toBe(3);
    expect(snapshot.resources[0]?.identity['device']).toBe('1');
  } finally {
    await dispose(owned);
  }
});

test('joined lifetime leaf-close-only failure has no invented nested primary', async () => {
  const owned = await pendingCreation();
  const original = filesystem.open;
  const cleanup = new Error('leaf-close-only-failed');
  let leaf: FileHandle | undefined;
  let disposal: ReturnType<typeof spyOn<FileHandle, 'close'>> | undefined;
  const opening = spyOn(filesystem, 'open').mockImplementation(
    async (...parameters: Parameters<typeof filesystem.open>) => {
      const acquired = await original(...parameters);
      leaf = acquired;
      disposal = spyOn(acquired, 'close').mockRejectedValue(cleanup);
      return acquired;
    },
  );
  try {
    await rejects(dispatchSourceIntent(owned.journal, owned.intent), (failure: unknown) => {
      expect(failure).toMatchObject({ primary: undefined, cleanup: [cleanup] });
      return true;
    });
    expect(disposal).toHaveBeenCalledTimes(1);
    expect(owned.parent.fd).toBe(-1);
    expect(owned.directory.fd).toBe(-1);
  } finally {
    opening.mockRestore();
    disposal?.mockRestore();
    await leaf?.close();
    await dispose(owned);
  }
});

test('joined lifetime final fulfillment refuses dispatch after caller close in final readback continuation', async () => {
  const owned = await pendingCreation();
  const original = filesystem.readdir;
  let rosters = 0;
  let closure: Promise<unknown> | undefined;
  let effects = 0;
  const readRoster = async (...parameters: unknown[]) => {
    const names = (await Reflect.apply(original, filesystem, parameters)) as Awaited<
      ReturnType<typeof filesystem.readdir>
    >;
    rosters++;
    if (rosters === 4)
      queueMicrotask(() => {
        queueMicrotask(() => {
          closure = Promise.allSettled([closeSourceJournal(owned.journal)]);
        });
      });
    return names;
  };
  const reading = spyOn(filesystem, 'readdir').mockImplementation(
    readRoster as typeof filesystem.readdir,
  );
  try {
    await rejects(
      dispatchSourceIntent(owned.journal, owned.intent).then(() => {
        effects++;
      }),
    );
    expect(effects).toBe(0);
    expect(rosters).toBe(4);
    await closure;
    expect(owned.parent.fd).toBe(-1);
    expect(owned.directory.fd).toBe(-1);
  } finally {
    reading.mockRestore();
    await closure;
    await dispose(owned);
  }
});
