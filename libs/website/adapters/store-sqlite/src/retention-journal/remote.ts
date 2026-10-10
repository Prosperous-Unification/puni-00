/** One stored version of a journal object. */
export interface JournalObject {
  bytes: Uint8Array;
  versionId: string;
}

/**
 * Port to the versioned bucket that holds one journal. Keys are relative to the journal
 * prefix (`head.json`, `events/000000000001.json`).
 */
export interface RetentionJournalRemote {
  /**
   * Reads the current version of `key`.
   *
   * @returns `null` only for a definite absence (HTTP 404).
   * @throws JournalRemoteError for every other failure.
   */
  get(key: string): Promise<JournalObject | null>;
  /**
   * Stores a new version of `key`. `ifNoneMatch` asks the provider to refuse an existing key;
   * versioned Hetzner buckets ignore it, so callers still read back.
   *
   * @returns the provider-assigned version id.
   * @throws JournalRemoteError `unversioned` when the provider assigned none,
   *   `precondition_failed` on 412, `unreadable` otherwise.
   */
  put(key: string, bytes: Uint8Array, options?: { ifNoneMatch?: boolean }): Promise<string>;
  /** Every relative key under the relative `prefix`, sorted. @throws JournalRemoteError */
  list(prefix: string): Promise<string[]>;
}

/** `unreadable`: transport or provider failure. `unversioned`: no version id. `precondition_failed`: 412. */
export type JournalRemoteFault = 'unreadable' | 'unversioned' | 'precondition_failed';

/** A remote operation that did not complete; the message always names the key. */
export class JournalRemoteError extends Error {
  override readonly name = 'JournalRemoteError';

  constructor(
    readonly reason: JournalRemoteFault,
    readonly key: string,
    detail: string,
    options?: ErrorOptions,
  ) {
    super(`retention journal object ${key} is ${reason}: ${detail}`, options);
  }
}
