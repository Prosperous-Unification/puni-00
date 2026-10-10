import { type JournalObject, JournalRemoteError, type RetentionJournalRemote } from './remote';

interface StoredVersion {
  bytes: Uint8Array;
  versionId: string;
}

/**
 * Production-shaped in-memory versioned bucket for tests and the build smoke. Every put
 * appends a version with a fresh id; `get` reads the current one. Each fault method arms one
 * failure for the next matching call only, except {@link MemoryJournalRemote.dropVersionId},
 * which stays until switched off.
 */
export class MemoryJournalRemote implements RetentionJournalRemote {
  private readonly versions = new Map<string, StoredVersion[]>();
  private readonly getFailures = new Set<string>();
  private readonly putFailures = new Set<string>();
  private readonly crashesAfterPut = new Set<string>();
  private readonly swapsAfterPut = new Map<string, Uint8Array>();
  private readonly honourIfNoneMatch: boolean;
  private unversioned = false;
  private nextVersion = 1;

  /** `honourIfNoneMatch` emulates a provider that answers 412; Hetzner versioned buckets do not. */
  constructor(options: { honourIfNoneMatch?: boolean } = {}) {
    this.honourIfNoneMatch = options.honourIfNoneMatch === true;
  }

  get(key: string): Promise<JournalObject | null> {
    if (this.getFailures.delete(key))
      return Promise.reject(new JournalRemoteError('unreadable', key, 'injected GET failure'));
    const current = this.versions.get(key)?.at(-1);
    return Promise.resolve(
      current === undefined ? null : { bytes: current.bytes.slice(), versionId: current.versionId },
    );
  }

  put(key: string, bytes: Uint8Array, options: { ifNoneMatch?: boolean } = {}): Promise<string> {
    if (this.putFailures.delete(key))
      return Promise.reject(new JournalRemoteError('unreadable', key, 'injected PUT failure'));
    if (this.honourIfNoneMatch && options.ifNoneMatch === true && this.versions.has(key))
      return Promise.reject(new JournalRemoteError('precondition_failed', key, 'HTTP 412'));
    const versionId = this.store(key, bytes);
    if (this.unversioned)
      return Promise.reject(
        new JournalRemoteError('unversioned', key, 'the bucket assigned no version id'),
      );
    if (this.crashesAfterPut.delete(key))
      return Promise.reject(new JournalRemoteError('unreadable', key, 'injected crash after PUT'));
    const swap = this.swapsAfterPut.get(key);
    if (swap !== undefined) {
      this.swapsAfterPut.delete(key);
      this.store(key, swap);
    }
    return Promise.resolve(versionId);
  }

  list(prefix: string): Promise<string[]> {
    return Promise.resolve(this.keys().filter((key) => key.startsWith(prefix)));
  }

  /** The next `get(key)` throws `JournalRemoteError` `unreadable`. */
  failGetOnce(key: string): void {
    this.getFailures.add(key);
  }

  /** The next `put(key)` throws `unreadable` before storing anything. */
  failPutOnce(key: string): void {
    this.putFailures.add(key);
  }

  /** The next `put(key)` stores durably, then throws `unreadable`: a crash after the PUT. */
  throwAfterPut(key: string): void {
    this.crashesAfterPut.add(key);
  }

  /** While on, every put stores and then throws `unversioned`, as the S3 adapter does. */
  dropVersionId(on: boolean): void {
    this.unversioned = on;
  }

  /** After the next successful `put(key)`, another writer stores `bytes` as a newer version. */
  swapBytesAfterPut(key: string, bytes: Uint8Array): void {
    this.swapsAfterPut.set(key, bytes.slice());
  }

  /** Deletes every version of `key`. */
  remove(key: string): void {
    this.versions.delete(key);
  }

  /** Stores `bytes` as a new current version without any fault handling. */
  overwrite(key: string, bytes: Uint8Array): void {
    this.store(key, bytes);
  }

  current(key: string): Uint8Array | null {
    return this.versions.get(key)?.at(-1)?.bytes.slice() ?? null;
  }

  versionCount(key: string): number {
    return this.versions.get(key)?.length ?? 0;
  }

  keys(): string[] {
    return [...this.versions.keys()].sort();
  }

  private store(key: string, bytes: Uint8Array): string {
    const versionId = `memory-version-${String(this.nextVersion)}`;
    this.nextVersion += 1;
    const stored = this.versions.get(key) ?? [];
    stored.push({ bytes: bytes.slice(), versionId });
    this.versions.set(key, stored);
    return versionId;
  }
}
