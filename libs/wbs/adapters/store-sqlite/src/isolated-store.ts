import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readdirSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A fresh private target's in-process owner; path text cannot recreate its authority. */
export interface IsolatedStore {
  readonly path: string;
  /** Refuses active users without revocation; cleanup settles once and never removes unexpected entries. */
  close(): Promise<void>;
}

/** Retains one selected, already-bound close callback until its successful settlement. */
export interface IsolatedStoreUse {
  /** Calls the acquired callback once; a failure remains outstanding and cannot be released by another callback. */
  close(): Promise<void>;
}

interface FileIdentity {
  readonly device: bigint;
  readonly inode: bigint;
}

interface StoreState {
  readonly path: string;
  readonly directory: string;
  readonly file: number;
  readonly directoryFile: number;
  readonly fileIdentity: FileIdentity;
  readonly directoryIdentity: FileIdentity;
  readonly users: Set<IsolatedStoreUse>;
  live: boolean;
}

const owners = new WeakMap<object, StoreState>();

function identity(path: string, kind: 'file' | 'directory'): FileIdentity {
  const stats = lstatSync(path, { bigint: true });
  if (kind === 'file' ? !stats.isFile() : !stats.isDirectory())
    throw new Error(`isolated store ${kind} is not the owned ${kind}`);
  return { device: stats.dev, inode: stats.ino };
}

function assertAllocatedIdentity(
  path: string,
  kind: 'file' | 'directory',
  expected: FileIdentity,
  descriptor: number | undefined,
): void {
  const actual = identity(path, kind);
  const retained = descriptor === undefined ? undefined : fstatSync(descriptor, { bigint: true });
  if (
    actual.device !== expected.device ||
    actual.inode !== expected.inode ||
    (retained !== undefined &&
      (retained.dev !== expected.device || retained.ino !== expected.inode))
  )
    throw new Error(`isolated store ${kind} identity changed`);
}

function assertIdentity(state: StoreState): void {
  assertAllocatedIdentity(
    state.directory,
    'directory',
    state.directoryIdentity,
    state.directoryFile,
  );
  assertAllocatedIdentity(state.path, 'file', state.fileIdentity, state.file);
  if (realpathSync(state.directory) !== state.directory)
    throw new Error('isolated store directory path changed');
}

function stateOf(owner: unknown, target: string): StoreState {
  const state = typeof owner === 'object' && owner !== null ? owners.get(owner) : undefined;
  if (state === undefined) throw new Error('isolated store owner is not recognized');
  if (!state.live) throw new Error('isolated store owner is not live');
  if (target !== state.path) throw new Error('isolated store target does not match its owner');
  assertIdentity(state);
  return state;
}

/**
 * Creates the directory and empty database file itself, retaining both open FS identities.
 * No path, environment flag, ledger or serialized object can bless an existing store.
 * Users must register their selected bound close callback and settle before owner cleanup.
 * Ordinary trusted-code lifetime only: this does not discover unregistered raw users or
 * exclude a malicious same-UID process racing filesystem operations.
 */
export function createIsolatedStore(): IsolatedStore {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'wbs-isolated-store-'));
  const path = join(directory, 'store.db');
  let file: number | undefined;
  let directoryFile: number | undefined;
  let allocatedDirectoryIdentity: FileIdentity | undefined;
  let openedFileIdentity: FileIdentity | undefined;
  let state: StoreState;
  try {
    allocatedDirectoryIdentity = identity(directory, 'directory');
    directoryFile = openSync(
      directory,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    assertAllocatedIdentity(directory, 'directory', allocatedDirectoryIdentity, directoryFile);
    file = openSync(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW,
      0o600,
    );
    const retained = fstatSync(file, { bigint: true });
    openedFileIdentity = { device: retained.dev, inode: retained.ino };
    state = {
      path,
      directory,
      file,
      directoryFile,
      fileIdentity: openedFileIdentity,
      directoryIdentity: allocatedDirectoryIdentity,
      users: new Set(),
      live: true,
    };
    assertIdentity(state);
  } catch (cause) {
    const failures: unknown[] = [cause];
    try {
      if (file !== undefined && openedFileIdentity !== undefined) {
        try {
          assertAllocatedIdentity(path, 'file', openedFileIdentity, file);
          unlinkSync(path);
        } catch (failure) {
          failures.push(failure);
        }
      }
      if (allocatedDirectoryIdentity !== undefined) {
        try {
          assertAllocatedIdentity(
            directory,
            'directory',
            allocatedDirectoryIdentity,
            directoryFile,
          );
          rmdirSync(directory);
        } catch (failure) {
          failures.push(failure);
        }
      }
    } finally {
      for (const descriptor of [file, directoryFile]) {
        if (descriptor === undefined) continue;
        try {
          closeSync(descriptor);
        } catch (failure) {
          failures.push(failure);
        }
      }
    }
    throw failures.length === 1
      ? cause
      : new AggregateError(failures, 'isolated store creation and cleanup failed at ' + directory, {
          cause,
        });
  }
  let settlement: Promise<void> | undefined;
  const owner: IsolatedStore = Object.freeze({
    path,
    close(): Promise<void> {
      if (settlement !== undefined) return settlement;
      if (state.users.size !== 0)
        return Promise.reject(new Error('isolated store still has active users'));
      try {
        assertIdentity(state);
        const entries = readdirSync(directory);
        if (entries.length !== 1 || entries[0] !== 'store.db')
          throw new Error('isolated store contains unexpected entries');
      } catch (cause) {
        return Promise.reject(
          cause instanceof Error
            ? cause
            : new Error('isolated store cleanup admission failed', { cause }),
        );
      }
      state.live = false;
      const failures: unknown[] = [];
      for (const descriptor of [state.file, state.directoryFile]) {
        try {
          closeSync(descriptor);
        } catch (cause) {
          failures.push(cause);
        }
      }
      if (failures.length !== 0) {
        settlement = Promise.reject(
          new AggregateError(failures, 'isolated store descriptor cleanup failed'),
        );
        return settlement;
      }
      try {
        unlinkSync(path);
        rmdirSync(directory);
        settlement = Promise.resolve();
      } catch (cause) {
        settlement = Promise.reject(new Error('isolated store cleanup failed', { cause }));
      }
      return settlement;
    },
  });
  owners.set(owner, state);
  return owner;
}

/** Rejects a forged, closed, aliased, linked or replaced target before its caller opens storage. */
export function assertIsolatedStore(owner: unknown, target: string): void {
  stateOf(owner, target);
}

/**
 * Registers a real user's selected bound close callback before yielding.
 * The callback object is captured once; only its successful memoized settlement
 * releases the use. Failed close keeps owner cleanup blocked. Registration itself
 * opens no SQLite connection and is not global raw-open enforcement.
 */
export function acquireIsolatedStoreUse(
  owner: unknown,
  target: string,
  close: () => void | Promise<void>,
): IsolatedStoreUse {
  const state = stateOf(owner, target);
  if (typeof close !== 'function') throw new Error('isolated store close callback is missing');
  const selectedClose = close;
  let settlement: Promise<void> | undefined;
  const use: IsolatedStoreUse = Object.freeze({
    close(): Promise<void> {
      settlement ??= Promise.resolve()
        .then(selectedClose)
        .then(() => {
          // Boundary: users is a private in-process Set of retained lifetimes, never a Drizzle table.
          // eslint-disable-next-line drizzle/enforce-delete-with-where
          state.users.delete(use);
        });
      return settlement;
    },
  });
  state.users.add(use);
  return use;
}
